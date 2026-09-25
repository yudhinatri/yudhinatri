'use strict';

/**
 * Klien Upstash Redis lewat REST API.
 *
 * Sengaja memakai `fetch` bawaan Node 18+ supaya proyek tetap tanpa dependensi
 * npm — cukup satu HTTP request per perintah.
 *
 * Variabel lingkungan yang dibaca, berpasangan (URL + TOKEN):
 *   - UPSTASH_REDIS_REST_URL   + UPSTASH_REDIS_REST_TOKEN  (integrasi Upstash)
 *   - KV_REST_API_URL          + KV_REST_API_TOKEN         (kompatibilitas Vercel KV)
 *   - POS_REDIS_REST_URL       + POS_REDIS_REST_TOKEN      (nama sendiri)
 */

const PAIRS = [
  ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
  ['POS_REDIS_REST_URL', 'POS_REDIS_REST_TOKEN'],
];

/** Cari pasangan variabel yang keduanya terisi. */
function detect() {
  for (const [urlVar, tokenVar] of PAIRS) {
    const url = process.env[urlVar] || '';
    const token = process.env[tokenVar] || '';
    if (url && token) return { url, token, urlVar, tokenVar };
  }
  return { url: '', token: '', urlVar: null, tokenVar: null };
}

const env = detect();
const URL = env.url;
const TOKEN = env.token;

/**
 * True bila kredensial Redis tersedia **dan** URL-nya berupa endpoint REST.
 * Kesalahan umum: menempel URL `redis://...` (koneksi TCP) ke variabel REST —
 * itu tidak bisa dipakai lewat `fetch`, jadi dianggap belum dikonfigurasi.
 */
const isRestUrl = () => /^https?:\/\//i.test(URL);
const configured = () => Boolean(URL && TOKEN && isRestUrl());

/** Jalankan satu perintah Redis, mis. command(['GET', 'kunci']). */
async function command(args) {
  if (!configured()) throw new Error('Redis belum dikonfigurasi');

  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Redis membalas bukan JSON (HTTP ${res.status}): ${text.slice(0, 140)}`);
  }

  if (!res.ok || data.error) throw new Error(data.error || `Redis gagal (HTTP ${res.status})`);
  return data.result;
}

const get = (key) => command(['GET', key]);
const set = (key, value) => command(['SET', key, value]);
const setWithTtl = (key, value, seconds) => command(['SET', key, value, 'EX', String(seconds)]);
const remove = (key) => command(['DEL', key]);
const ping = () => command(['PING']);

/**
 * SET ... NX EX — hanya berhasil bila kunci belum ada.
 * Dipakai sebagai kunci tunggal saat seeding agar tidak dobel
 * ketika beberapa permintaan tiba bersamaan di cold start.
 */
async function acquireLock(key, seconds) {
  const result = await command(['SET', key, '1', 'NX', 'EX', String(seconds)]);
  return result === 'OK';
}

/**
 * Ringkasan konfigurasi untuk endpoint /api/health.
 * Sengaja hanya menyebut **nama** variabel, bukan nilainya.
 */
function envStatus() {
  const defined = Object.keys(process.env)
    .filter((k) => /REDIS|KV_REST/i.test(k))
    .sort();

  const status = {
    detected: env.urlVar ? `${env.urlVar} + ${env.tokenVar}` : null,
    names: defined, // variabel yang ada di environment
    empty: defined.filter((k) => !process.env[k]), // ada tapi nilainya kosong
  };

  if (URL && TOKEN && !isRestUrl()) {
    status.problem = 'url-bukan-rest';
  } else if (!env.urlVar && defined.length) {
    status.problem = 'pasangan-tidak-lengkap';
    // Sebutkan tepatnya variabel pasangan mana yang belum terisi, supaya tidak
    // perlu menebak apakah URL atau TOKEN yang tertinggal.
    const missing = [];
    for (const [urlVar, tokenVar] of PAIRS) {
      const hasUrl = Boolean(process.env[urlVar]);
      const hasToken = Boolean(process.env[tokenVar]);
      if (hasUrl && !hasToken) missing.push(tokenVar);
      else if (hasToken && !hasUrl) missing.push(urlVar);
    }
    if (missing.length) status.missing = missing;
  }

  return status;
}

module.exports = {
  configured,
  command,
  get,
  set,
  setWithTtl,
  remove,
  ping,
  acquireLock,
  envStatus,
  url: URL,
};
