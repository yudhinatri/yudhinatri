'use strict';

/**
 * Lapisan penyimpanan dengan dua backend, dipilih otomatis:
 *
 *  1. Redis (Upstash / Vercel KV) — dipakai di Vercel, karena filesystem
 *     serverless bersifat read-only dan tidak persisten.
 *  2. File JSON di folder `data/` — dipakai untuk pengembangan lokal.
 *
 * Semua fungsi bersifat async supaya kedua backend punya antarmuka yang sama.
 *
 * Kasus khusus: di platform serverless **tanpa** Redis, tidak ada tempat
 * menulis sama sekali. Dulu hal itu muncul sebagai `ENOENT ... mkdir
 * '/var/task/data'` yang membingungkan, jadi sekarang dideteksi lebih awal dan
 * diganti pesan yang menjelaskan penyebab + solusinya.
 */

const fs = require('fs');
const path = require('path');
const redis = require('./redis.js');
const core = require('./core.js');

/**
 * True di platform yang filesystem kodenya read-only (hanya /tmp yang bisa
 * ditulis, dan isinya hilang saat instance didaur ulang).
 */
const SERVERLESS = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY,
);

const DATA_DIR = process.env.POS_DATA_DIR || path.join(__dirname, '..', 'data');

/** Backend aktif. */
const mode = redis.configured() ? 'redis' : 'file';
const isRedis = () => mode === 'redis';

/** Pesan tunggal yang dipakai server maupun halaman login. */
const STORAGE_HINT = [
  'Penyimpanan belum siap: di Vercel filesystem bersifat read-only,',
  'sehingga data tidak bisa disimpan ke folder aplikasi.',
  'Hubungkan Upstash Redis, isi Environment Variables',
  'UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN, lalu Redeploy.',
  'Detail: buka /api/health.',
].join(' ');

/** True bila folder data benar-benar bisa dipakai (mode file). */
const fileBackendUsable = () => !SERVERLESS || Boolean(process.env.POS_DATA_DIR);

/** Detail tambahan: variabel mana yang kurang / apa yang salah. */
function configDetail() {
  const { missing, problem } = redis.envStatus();
  if (missing?.length) return ` Variabel yang belum terisi: ${missing.join(', ')}.`;
  if (problem === 'url-bukan-rest') {
    return ' Nilai URL harus diambil dari tab "REST API" Upstash (awalan https://).';
  }
  return '';
}

/** Lempar 503 dengan panduan bila mode file dipaksa di serverless. */
function requireWritable() {
  if (fileBackendUsable()) return;
  throw new core.HttpError(503, STORAGE_HINT + configDetail());
}

/**
 * Ubah error filesystem yang membingungkan (ENOENT/EROFS saat mkdir) menjadi
 * pesan yang bisa ditindaklanjuti. Error lain dikembalikan apa adanya.
 */
function friendlyError(err) {
  const code = err?.code;
  const syscall = err?.syscall;
  if (code === 'EROFS' || (code === 'ENOENT' && (syscall === 'mkdir' || syscall === 'open'))) {
    return STORAGE_HINT;
  }
  return err?.message || 'Terjadi kesalahan pada server';
}

/* ------------------------------ Kunci & path ---------------------------- */

const redisKey = (name) => `pos:${name}`;
const filePath = (name) => path.join(DATA_DIR, `${name}.json`);
const SEED_LOCK = 'pos:seed-lock';

/* ------------------------------- Backend file --------------------------- */

function ensureDir() {
  requireWritable();
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readFile(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeFile(name, value) {
  ensureDir();
  const target = filePath(name);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, target); // rename = tulis atomik
}

/* --------------------------------- API --------------------------------- */

/** Baca satu koleksi. Mengembalikan `fallback` bila belum ada / rusak. */
async function read(name, fallback = null) {
  if (isRedis()) {
    const raw = await redis.get(redisKey(name));
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  return readFile(name, fallback);
}

/** Tulis satu koleksi. */
async function write(name, value) {
  if (isRedis()) {
    await redis.set(redisKey(name), JSON.stringify(value));
    return;
  }
  writeFile(name, value);
}

/** Tulis dengan masa berlaku (dipakai untuk sesi login). */
async function writeWithTtl(name, value, seconds) {
  if (isRedis()) {
    await redis.setWithTtl(redisKey(name), JSON.stringify(value), seconds);
    return;
  }
  // Backend file memakai sesi di memori (lihat auth.js), jadi TTL tidak perlu.
  writeFile(name, value);
}

/** Hapus satu koleksi. */
async function remove(name) {
  if (isRedis()) {
    await redis.remove(redisKey(name));
    return;
  }
  try {
    fs.unlinkSync(filePath(name));
  } catch {
    /* sudah tidak ada */
  }
}

/* ------------------------------ Inisialisasi ---------------------------- */

let initPromise = null;

/**
 * Pastikan semua koleksi tersedia; isi dengan data contoh bila masih kosong.
 *
 * Di serverless, kode ini berjalan saat permintaan pertama (cold start), bukan
 * saat proses menyala. Hasilnya di-cache di memori instance, dan kunci NX di
 * Redis mencegah seeding ganda bila beberapa instance start bersamaan.
 */
function ensureInitialized() {
  if (!initPromise) initPromise = doInit().catch((err) => { initPromise = null; throw err; });
  return initPromise;
}

async function doInit() {
  if (!isRedis()) ensureDir();

  const [users, products, transactions, settings] = await Promise.all([
    read('users', null),
    read('products', null),
    read('transactions', null),
    read('settings', null),
  ]);

  const missing =
    !Array.isArray(users) ||
    !Array.isArray(products) ||
    !Array.isArray(transactions) ||
    !settings ||
    typeof settings !== 'object';

  if (!missing) {
    // Selalu rapikan pengaturan (buang field lama yang sudah tidak dipakai).
    const cleaned = core.cleanSettings(settings);
    if (JSON.stringify(cleaned) !== JSON.stringify(settings)) await write('settings', cleaned);
    return;
  }

  // Ada yang kosong → butuh seeding. Ambil kunci dulu agar tidak dobel.
  if (isRedis()) {
    const gotLock = await redis.acquireLock(SEED_LOCK, 60);
    if (!gotLock) {
      // Instance lain sedang mengisi; tunggu sebentar lalu pakai hasilnya.
      await new Promise((r) => setTimeout(r, 400));
      return;
    }
  }

  if (!Array.isArray(users)) await write('users', core.seedUsers());
  if (!Array.isArray(products)) await write('products', core.seedProducts());
  if (!Array.isArray(transactions)) await write('transactions', []);
  if (!settings || typeof settings !== 'object') await write('settings', core.DEFAULT_SETTINGS);
  else await write('settings', core.cleanSettings(settings));
}

/* ------------------------------ Pemeriksaan ----------------------------- */

/** Ringkasan kondisi penyimpanan, dipakai endpoint /api/health. */
async function health() {
  if (isRedis()) {
    const pong = await redis.ping();
    return { mode, redis: pong, url: redis.url.replace(/\/\/.*@/, '//') };
  }

  return {
    mode,
    serverless: SERVERLESS,
    dataDir: DATA_DIR,
    writable: fileBackendUsable() && canWrite(),
    redis: redis.envStatus(),
    hint: fileBackendUsable() ? null : STORAGE_HINT,
  };
}

function canWrite() {
  try {
    ensureDir();
    const probe = path.join(DATA_DIR, '.write-test');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  mode,
  isRedis,
  read,
  write,
  writeWithTtl,
  remove,
  ensureInitialized,
  health,
  friendlyError,
  STORAGE_HINT,
  DATA_DIR,
};
