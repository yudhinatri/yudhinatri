'use strict';

/**
 * Autentikasi POS: pengguna, PIN, dan sesi.
 *
 * - PIN tidak pernah disimpan sebagai teks biasa, melainkan di-hash dengan
 *   scrypt + salt acak per pengguna (lihat lib/core.js).
 * - Sesi di Redis memakai TTL; di mode file disimpan di memori proses.
 *   Artinya mematikan server = semua perangkat harus masuk ulang.
 */

const crypto = require('crypto');
const store = require('./store.js');
const core = require('./core.js');

const { HttpError, pinRecord, pinMatches, validatePin } = core;

const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 jam sejak aktivitas terakhir

/** Sesi untuk mode file (Redis memakai TTL-nya sendiri). */
const memorySessions = new Map(); // token -> { userId, lastSeen }

const newId = () => core.nextId('usr');
const sessionKey = (token) => `session:${token}`;

/* ------------------------------ Baca/tulis ------------------------------ */

const readUsers = () => store.read('users', []);
const writeUsers = (users) => store.write('users', users);

/** Bentuk aman untuk dikirim ke klien — tanpa hash/salt PIN. */
const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  role: u.role,
  active: u.active !== false,
  createdAt: u.createdAt || null,
});

/** Daftar pengguna untuk layar login (hanya nama & peran). */
async function listLoginUsers() {
  const users = await readUsers();
  return users.filter((u) => u.active !== false).map(publicUser);
}

async function listUsers() {
  const users = await readUsers();
  return users.map(publicUser);
}

/* --------------------------------- Sesi -------------------------------- */

/**
 * Versi sesi pengguna. Menaikkan angka ini membuat semua token lama tidak
 * berlaku lagi — dipakai saat PIN, peran, atau status akun berubah.
 * Dengan begitu tidak perlu mengindeks token per pengguna di Redis.
 */
const versionOf = (user) => Number(user?.sessionVersion) || 0;

async function createSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  const record = { userId: user.id, v: versionOf(user) };

  if (store.isRedis()) {
    await store.writeWithTtl(sessionKey(token), record, SESSION_TTL_SECONDS);
  } else {
    memorySessions.set(token, { ...record, lastSeen: Date.now() });
  }
  return token;
}

/** Ambil pengguna dari header token. Melempar HttpError bila tidak valid. */
async function requireAuth(req) {
  const token = req.headers['x-auth-token'];
  if (!token) throw new HttpError(401, 'Silakan masuk terlebih dahulu');

  let session = null;

  if (store.isRedis()) {
    session = await store.read(sessionKey(token), null);
    if (!session?.userId) throw new HttpError(401, 'Sesi berakhir, silakan masuk ulang');
    // Perpanjang masa berlaku selama dipakai.
    await store.writeWithTtl(sessionKey(token), session, SESSION_TTL_SECONDS);
  } else {
    session = memorySessions.get(token) || null;
    if (!session) throw new HttpError(401, 'Sesi berakhir, silakan masuk ulang');

    if (Date.now() - session.lastSeen > SESSION_TTL_SECONDS * 1000) {
      memorySessions.delete(token);
      throw new HttpError(401, 'Sesi berakhir, silakan masuk ulang');
    }
    session.lastSeen = Date.now();
  }

  const users = await readUsers();
  const user = users.find((u) => u.id === session.userId);
  if (!user || user.active === false) {
    await dropSession(token);
    throw new HttpError(401, 'Akun tidak aktif');
  }

  // Token dibuat sebelum PIN/peran diubah → paksa masuk ulang.
  if (versionOf(user) !== (Number(session.v) || 0)) {
    await dropSession(token);
    throw new HttpError(401, 'Sesi berakhir, silakan masuk ulang');
  }

  return { ...publicUser(user), token };
}

async function dropSession(token) {
  if (store.isRedis()) await store.remove(sessionKey(token));
  else memorySessions.delete(token);
}

async function logout(token) {
  await dropSession(token);
}

/** Dipakai setelah pengguna diubah/dihapus agar sesi lamanya tidak nyangkut. */
async function dropSessionsOf(userId) {
  // Menaikkan sessionVersion sudah cukup untuk membatalkan semua token lama
  // (dicek ulang di requireAuth), jadi tidak perlu mengindeks token di Redis.
  // Di mode file, sesi di memori sekalian dibersihkan agar rapi.
  if (store.isRedis()) return;
  [...memorySessions.entries()].forEach(([token, s]) => {
    if (s.userId === userId) memorySessions.delete(token);
  });
}

/** Naikkan versi sesi pengguna sehingga token lamanya tidak berlaku. */
async function bumpSessionVersion(users, userId) {
  const user = users.find((u) => u.id === userId);
  if (user) user.sessionVersion = versionOf(user) + 1;
  return user;
}

/* --------------------------------- Login -------------------------------- */

async function login(userId, pin) {
  validatePin(pin);

  const users = await readUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new HttpError(404, 'Pengguna tidak ditemukan');
  if (user.active === false) throw new HttpError(403, 'Akun ini sedang dinonaktifkan');
  if (!pinMatches(pin, user)) throw new HttpError(401, 'PIN salah');

  return { token: await createSession(user), user: publicUser(user) };
}

/* --------------------------- Kelola pengguna ---------------------------- */

function assertAdminRole(user) {
  if (user.role !== 'admin') throw new HttpError(403, 'Hanya admin yang dapat mengelola pengguna');
}

const countAdmins = (users) => users.filter((u) => u.role === 'admin' && u.active !== false).length;

async function createUser(actor, { name, role, pin }) {
  assertAdminRole(actor);

  const cleanName = core.toStr(name, 60);
  if (!cleanName) throw new HttpError(400, 'Nama pengguna wajib diisi');

  const cleanRole = role === 'admin' ? 'admin' : 'kasir';
  const users = await readUsers();
  if (users.some((u) => u.name.toLowerCase() === cleanName.toLowerCase())) {
    throw new HttpError(409, `Nama "${cleanName}" sudah dipakai`);
  }

  const user = {
    id: newId(),
    name: cleanName,
    role: cleanRole,
    ...pinRecord(validatePin(pin)),
    active: true,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeUsers(users);
  return publicUser(user);
}

async function updateUser(actor, id, patch) {
  assertAdminRole(actor);

  const users = await readUsers();
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) throw new HttpError(404, 'Pengguna tidak ditemukan');

  const user = users[index];
  const nextName = patch.name === undefined ? user.name : core.toStr(patch.name, 60);
  if (!nextName) throw new HttpError(400, 'Nama pengguna wajib diisi');

  if (users.some((u) => u.id !== id && u.name.toLowerCase() === nextName.toLowerCase())) {
    throw new HttpError(409, `Nama "${nextName}" sudah dipakai`);
  }

  const nextRole = patch.role === undefined ? user.role : patch.role === 'admin' ? 'admin' : 'kasir';
  const nextActive = patch.active === undefined ? user.active !== false : Boolean(patch.active);

  // Jangan sampai tidak ada admin aktif yang tersisa.
  const draft = { ...user, name: nextName, role: nextRole, active: nextActive };
  const projected = users.map((u) => (u.id === id ? draft : u));
  if (countAdmins(projected) === 0) {
    throw new HttpError(400, 'Harus ada minimal satu admin yang aktif');
  }

  if (patch.pin !== undefined && patch.pin !== '') {
    Object.assign(user, pinRecord(validatePin(patch.pin)));
  }

  user.name = nextName;
  user.role = nextRole;
  user.active = nextActive;
  users[index] = user;

  // Perubahan akun membatalkan sesi lama (termasuk di Redis).
  await bumpSessionVersion(users, id);
  await writeUsers(users);

  await dropSessionsOf(id);
  return publicUser(users[index]);
}

async function deleteUser(actor, id) {
  assertAdminRole(actor);

  const users = await readUsers();
  const user = users.find((u) => u.id === id);
  if (!user) throw new HttpError(404, 'Pengguna tidak ditemukan');
  if (user.id === actor.id) {
    throw new HttpError(400, 'Tidak dapat menghapus akun yang sedang dipakai');
  }
  if (countAdmins(users) <= 1 && user.role === 'admin') {
    throw new HttpError(400, 'Harus ada minimal satu admin yang aktif');
  }

  await writeUsers(users.filter((u) => u.id !== id));
  await dropSessionsOf(id);
  return publicUser(user);
}

/** Pengguna mengubah PIN-nya sendiri (wajib tahu PIN lama). */
async function changeOwnPin(user, currentPin, newPin) {
  const users = await readUsers();
  const target = users.find((u) => u.id === user.id);
  if (!target) throw new HttpError(404, 'Pengguna tidak ditemukan');
  if (!pinMatches(currentPin, target)) throw new HttpError(401, 'PIN lama salah');

  const next = validatePin(newPin);
  if (next === String(currentPin)) throw new HttpError(400, 'PIN baru harus berbeda dari PIN lama');

  Object.assign(target, pinRecord(next));

  // PIN berubah → semua sesi lama (termasuk di Redis) tidak berlaku lagi.
  await bumpSessionVersion(users, target.id);
  await writeUsers(users);

  await dropSessionsOf(target.id);
  return publicUser(users.find((u) => u.id === target.id));
}

module.exports = {
  publicUser,
  listLoginUsers,
  listUsers,
  requireAuth,
  login,
  logout,
  createUser,
  updateUser,
  deleteUser,
  changeOwnPin,
};
