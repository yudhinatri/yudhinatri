/* Layar masuk: pilih pengguna lalu masukkan PIN 4 angka. */

import { api } from '../api.js';
import { state, login } from '../store.js';
import { $, esc, on } from '../utils.js';

const PIN_LENGTH = 4;

let selectedUser = null;
let pin = '';
let busy = false;
let keyHandler = null;
let userCache = [];

/* ------------------------------ Kebersihan ------------------------------ */

/**
 * Lepas listener keyboard layar login. Wajib dipanggil saat keluar dari layar
 * masuk, kalau tidak ketikan angka di halaman lain akan ikut tertangkap.
 */
export function destroyLogin() {
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  selectedUser = null;
  pin = '';
  busy = false;
}

/* ------------------------------- Template ------------------------------- */

function userPickerHTML(users) {
  return `
  <div class="login-card">
    <div class="login-brand">
      <span class="login-logo">👕</span>
      <h1>${esc(state.settings.storeName || 'POS Pakaian')}</h1>
      <p>Pilih akun Anda untuk mulai bekerja</p>
    </div>

    <div class="user-grid">
      ${users
        .map(
          (u) => `
        <button class="user-card" data-user="${u.id}">
          <span class="user-avatar">${u.role === 'admin' ? '🔑' : '👤'}</span>
          <span class="user-name">${esc(u.name)}</span>
          <span class="user-role ${u.role === 'admin' ? 'is-admin' : ''}">
            ${u.role === 'admin' ? 'Admin' : 'Kasir'}
          </span>
        </button>`,
        )
        .join('')}
    </div>

    <p class="login-foot">Masukkan PIN 4 angka setelah memilih akun.</p>
  </div>`;
}

function pinPadHTML(user) {
  return `
  <div class="login-card">
    <button class="login-back" id="btnBack">← Ganti akun</button>

    <div class="login-brand">
      <span class="login-logo">${user.role === 'admin' ? '🔑' : '👤'}</span>
      <h1>${esc(user.name)}</h1>
      <p>Masukkan PIN Anda</p>
    </div>

    <div class="pin-dots" id="pinDots">
      ${Array.from({ length: PIN_LENGTH }, () => '<span class="pin-dot"></span>').join('')}
    </div>

    <p class="pin-msg" id="pinMsg">&nbsp;</p>

    <div class="pin-pad" id="pinPad">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="pin-key" data-digit="${n}">${n}</button>`).join('')}
      <button class="pin-key pin-key-ghost" data-action="clear">C</button>
      <button class="pin-key" data-digit="0">0</button>
      <button class="pin-key pin-key-ghost" data-action="back">⌫</button>
    </div>
  </div>`;
}

/* -------------------------------- Render -------------------------------- */

function renderUsers(root, users) {
  userCache = users;
  root.innerHTML = userPickerHTML(users);
  on(root, 'click', '[data-user]', (e, btn) => {
    selectedUser = users.find((u) => u.id === btn.dataset.user);
    pin = '';
    renderPin(root);
  });
}

function renderPin(root) {
  root.innerHTML = pinPadHTML(selectedUser);
  updateDots(root);

  $('#btnBack', root).addEventListener('click', () => {
    selectedUser = null;
    pin = '';
    renderUsers(root, userCache);
  });

  on(root, 'click', '[data-digit]', (e, btn) => {
    if (busy || pin.length >= PIN_LENGTH) return;
    pin += btn.dataset.digit;
    updateDots(root);
    if (pin.length === PIN_LENGTH) setTimeout(() => submit(root), 180);
  });

  on(root, 'click', '[data-action]', (e, btn) => {
    if (busy) return;
    if (btn.dataset.action === 'clear') pin = '';
    else pin = pin.slice(0, -1);
    updateDots(root);
  });

  // Dukungan keyboard fisik untuk PC/laptop
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = (ev) => {
    if (busy) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (/^\d$/.test(ev.key)) {
      if (pin.length >= PIN_LENGTH) return;
      pin += ev.key;
      updateDots(root);
      if (pin.length === PIN_LENGTH) setTimeout(() => submit(root), 180);
    } else if (ev.key === 'Backspace') {
      pin = pin.slice(0, -1);
      updateDots(root);
    } else if (ev.key === 'Escape') {
      selectedUser = null;
      pin = '';
      renderUsers(root, userCache);
    }
  };
  document.addEventListener('keydown', keyHandler);
}

function updateDots(root) {
  root.querySelectorAll('.pin-dot').forEach((dot, i) => {
    dot.classList.toggle('is-filled', i < pin.length);
  });
}

function showError(root, message) {
  const msg = $('#pinMsg', root);
  if (msg) {
    msg.textContent = message;
    msg.classList.add('is-error');
  }

  const dots = $('#pinDots', root);
  if (dots) {
    dots.classList.remove('is-shake');
    void dots.offsetWidth; // paksa animasi diputar ulang
    dots.classList.add('is-shake');
  }

  pin = '';
  updateDots(root);
}

/* -------------------------------- Submit -------------------------------- */

async function submit(root) {
  if (busy) return;
  busy = true;

  const msg = $('#pinMsg', root);
  msg.textContent = 'Memeriksa...';
  msg.classList.remove('is-error');

  try {
    await login(selectedUser.id, pin);
    // app.js akan menangani pengalihan setelah state.auth terisi.
  } catch (err) {
    showError(root, err.message || 'PIN salah');
  } finally {
    busy = false;
  }
}

/* --------------------------------- Init --------------------------------- */

/**
 * Tampilkan layar masuk.
 *
 * Elemen layar diganti dengan salinan baru setiap kali dipanggil, mengikuti pola
 * yang sama seperti #view di app.js. Tanpa ini, listener `[data-user]` menumpuk
 * di setiap siklus masuk/keluar dan beberapa handler akan memakai daftar
 * pengguna yang sudah usang.
 */
export async function showLogin() {
  destroyLogin();

  const previous = document.getElementById('loginScreen');
  if (!previous) return;

  const root = previous.cloneNode(false); // atribut sama, tanpa anak
  previous.replaceWith(root);
  root.hidden = false;
  root.innerHTML = `<div class="login-card"><div class="login-brand"><p>Memuat...</p></div></div>`;

  let users = [];
  try {
    const data = await api.loginUsers();
    users = data.users || [];
  } catch (err) {
    root.innerHTML = `<div class="login-card">
      <div class="login-brand">
        <span class="login-logo">🔌</span>
        <h1>Server tidak terjangkau</h1>
        <p>${esc(err.message)}</p>
        <p class="server-hint">Cek status penyimpanan di <a href="/api/health" target="_blank" rel="noopener">/api/health</a>.</p>
      </div>
    </div>`;
    return;
  }

  if (!users.length) {
    root.innerHTML = `<div class="login-card">
      <div class="login-brand">
        <span class="login-logo">⚠️</span>
        <h1>Tidak ada akun aktif</h1>
        <p>Periksa berkas <code>data/users.json</code> pada server.</p>
      </div>
    </div>`;
    return;
  }

  renderUsers(root, users);
}
