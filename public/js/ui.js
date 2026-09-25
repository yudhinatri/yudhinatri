/* Komponen UI bersama: modal, konfirmasi, dan toast. */

import { $, on } from './utils.js';

const backdrop = $('#modalBackdrop');
const modalEl = $('#modal');
const titleEl = $('#modalTitle');
const bodyEl = $('#modalBody');
const footEl = $('#modalFoot');

let closeCallbacks = [];

/** Buka modal. Mengembalikan elemen modal agar bisa di-query. */
export function openModal({ title = '', body = null, footer = null, wide = false, onClose = null } = {}) {
  titleEl.textContent = title;
  bodyEl.innerHTML = '';
  footEl.innerHTML = '';
  footEl.hidden = !footer;

  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body instanceof Node) bodyEl.appendChild(body);

  if (typeof footer === 'string') footEl.innerHTML = footer;
  else if (footer instanceof Node) footEl.appendChild(footer);

  modalEl.classList.toggle('wide', wide);
  backdrop.hidden = false;
  closeCallbacks = onClose ? [onClose] : [];
  document.body.style.overflow = 'hidden';

  const firstInput = bodyEl.querySelector('input:not([type=hidden]), select, textarea');
  if (firstInput) setTimeout(() => firstInput.isConnected && firstInput.focus(), 60);

  return modalEl;
}

export function closeModal() {
  backdrop.hidden = true;
  bodyEl.innerHTML = '';
  footEl.innerHTML = '';
  document.body.style.overflow = '';
  const cbs = closeCallbacks;
  closeCallbacks = [];
  cbs.forEach((cb) => cb());
}

export const isModalOpen = () => !backdrop.hidden;

$('#modalClose').addEventListener('click', closeModal);
on(backdrop, 'click', '[data-close]', closeModal);
backdrop.addEventListener('mousedown', (e) => {
  if (e.target === backdrop) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isModalOpen()) closeModal();
});

/** Dialog konfirmasi. Mengembalikan Promise<boolean>. */
export function confirmDialog(title, message, { okLabel = 'Ya, lanjutkan', danger = true } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const body = document.createElement('div');
    body.innerHTML = `<p style="font-size:13.5px;color:var(--text-2);line-height:1.6">${message}</p>`;

    const foot = document.createElement('div');
    foot.innerHTML = `
      <button class="btn btn-ghost" data-no>Batal</button>
      <button class="btn ${danger ? 'btn-danger' : ''}" data-yes>${okLabel}</button>`;

    const modal = openModal({
      title,
      body,
      footer: foot,
      onClose: () => {
        if (!answered) {
          answered = true;
          resolve(false);
        }
      },
    });

    // Listener dipasang pada node `foot` yang selalu baru, bukan pada #modal
    // yang permanen — supaya tidak menumpuk di setiap dialog.
    on(foot, 'click', '[data-yes]', () => {
      answered = true;
      closeModal();
      resolve(true);
    });
    on(foot, 'click', '[data-no]', () => {
      answered = true;
      closeModal();
      resolve(false);
    });

    void modal;
  });
}

/** Dialog prompt sederhana. Mengembalikan Promise<string|null>. */
export function promptDialog(title, { label = '', value = '', placeholder = '', okLabel = 'Simpan' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="field">
        ${label ? `<label>${label}</label>` : ''}
        <input class="input" id="promptInput" value="${value}" placeholder="${placeholder}" />
      </div>`;

    const foot = document.createElement('div');
    foot.innerHTML = `
      <button class="btn btn-ghost" data-no>Batal</button>
      <button class="btn" data-yes>${okLabel}</button>`;

    const modal = openModal({
      title,
      body,
      footer: foot,
      onClose: () => {
        if (!answered) {
          answered = true;
          resolve(null);
        }
      },
    });

    const input = $('#promptInput', modal);
    const submit = () => {
      answered = true;
      const v = input.value;
      closeModal();
      resolve(v);
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    // Sama seperti confirmDialog: pasang pada `foot` yang selalu baru.
    on(foot, 'click', '[data-yes]', submit);
    on(foot, 'click', '[data-no]', () => {
      answered = true;
      closeModal();
      resolve(null);
    });
  });
}

/* --------------------------------- Toast -------------------------------- */

const wrap = $('#toastWrap');
const IKON = { ok: '✅', err: '⛔', warn: '⚠️', info: 'ℹ️' };

export function toast(message, type = 'info', duration = 3200) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${IKON[type] || ''}</span><span>${message}</span>`;
  wrap.appendChild(el);

  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  }, duration);
}
