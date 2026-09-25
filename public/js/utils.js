/* Utils: format angka, tanggal, dan helper DOM. */

export const rupiah = (n) =>
  'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

export const angka = (n) =>
  (Number(n) || 0).toLocaleString('id-ID');

/** Rp 115.000 -> "115000" untuk input number mentah. */
export const numberOnly = (n) => String(Math.round(Number(n) || 0));

export const tanggalPanjang = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
};

export const tanggalPendek = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const jamMenit = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

/** Tanggal hari ini dalam format YYYY-MM-DD (zona waktu lokal). */
export const todayISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const addDaysISO = (days, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return todayISO(d);
};

export const startOfMonthISO = (from = new Date()) =>
  `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`;

export const namaHari = (isoDate) => {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString('id-ID', { weekday: 'short' });
};

export const namaHariAngka = (isoDate) => {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
};

export const LABEL_METODE = {
  cash: 'Tunai',
  transfer: 'Transfer',
  qris: 'QRIS',
  debit: 'Kartu Debit',
  ewallet: 'E-Wallet',
};

export const IKON_METODE = {
  cash: '💵',
  transfer: '🏦',
  qris: '📱',
  debit: '💳',
  ewallet: '👛',
};

/* ------------------------------ DOM helper ------------------------------ */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escape teks agar aman dimasukkan ke innerHTML. */
export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Event delegation: dengarkan klik pada elemen yang cocok. */
export const on = (root, event, selector, handler) => {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
};

/** Debounce sederhana untuk input pencarian. */
export const debounce = (fn, wait = 200) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
};

/** Unduh data sebagai file. */
export const download = (filename, content, type = 'application/json') => {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
