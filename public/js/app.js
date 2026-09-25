/* Entry point: gerbang login, router sederhana, dan render header/sidebar. */

import {
  state, subscribe, bootstrap, saveSettings,
  isAdmin, isLoggedIn, loadStoredToken, restoreSession, logout, clearSession,
} from './store.js';
import { setUnauthorizedHandler } from './api.js';
import { $, $$, rupiah, esc, on } from './utils.js';
import { toast, isModalOpen, confirmDialog } from './ui.js';

import { showLogin, destroyLogin } from './views/login.js';
import { cashierView } from './views/cashier.js';
import { productsView } from './views/products.js';
import { transactionsView } from './views/transactions.js';
import { reportsView } from './views/reports.js';
import { settingsView } from './views/settings.js';
import { printerService } from './bluetoothPrinter.js';
import { openPrinterModal } from './views/printerModal.js';

/** Halaman yang hanya boleh dibuka admin. */
const ADMIN_ONLY = new Set(['products', 'transactions', 'reports', 'settings']);

const ROUTES = {
  cashier: { title: 'Kasir', sub: 'Pilih produk lalu proses pembayaran', render: cashierView },
  products: { title: 'Produk', sub: 'Kelola daftar pakaian, harga, dan stok', render: productsView },
  transactions: { title: 'Transaksi', sub: 'Riwayat penjualan, cetak ulang, dan pembatalan', render: transactionsView },
  reports: { title: 'Laporan', sub: 'Analisis penjualan, laba, dan stok', render: reportsView },
  settings: { title: 'Pengaturan', sub: 'Identitas toko, pengguna, dan backup data', render: settingsView },
};

const KASIR_SUB = 'Pilih produk, lalu selesaikan pembayaran';

let viewEl = $('#view');
let cleanup = null;

/**
 * Ganti elemen #view dengan salinan kosong.
 *
 * Ini penting: setiap view memasang event listener (lewat `on(root, ...)`) pada
 * elemen #view. Karena #view dipakai ulang terus-menerus, listener dari halaman
 * sebelumnya akan menumpuk dan ikut terpicu di halaman lain — misalnya tombol
 * hapus di halaman Kasir ikut memicu handler hapus produk, sehingga aksi terasa
 * "tidak berfungsi". Dengan mengganti elemennya, seluruh listener lama otomatis
 * terbuang bersama node yang dilepas.
 */
function resetView() {
  const next = viewEl.cloneNode(false); // tag + atribut sama, tanpa anak
  viewEl.replaceWith(next);
  viewEl = next;
  return next;
}

/** Rute yang boleh dibuka pengguna saat ini. */
function allowedRoute(route) {
  if (!ROUTES[route]) return 'cashier';
  if (!isAdmin() && ADMIN_ONLY.has(route)) return 'cashier';
  return route;
}

/* ------------------------------- Navigasi ------------------------------- */

export function navigate(route, { silent = false } = {}) {
  route = allowedRoute(route);
  state.route = route;

  if (typeof cleanup === 'function') {
    try {
      cleanup();
    } catch {
      /* abaikan */
    }
    cleanup = null;
  }

  $('#pageTitle').textContent = ROUTES[route].title;
  $('#pageSub').textContent = route === 'cashier' && !isAdmin() ? KASIR_SUB : ROUTES[route].sub;
  document.title = `${ROUTES[route].title} • ${state.settings.storeName || 'POS Pakaian'}`;

  $$('#nav .nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.route === route));

  resetView(); // buang semua listener halaman sebelumnya
  viewEl.scrollTop = 0;
  cleanup = ROUTES[route].render(viewEl) || null;

  if (!silent) history.replaceState(null, '', `#${route}`);
  closeSidebar();
}

/* --------------------------- Elemen global ------------------------------ */

function renderBrand() {
  const name = state.settings.storeName || 'POS Pakaian';
  $('#brandName').textContent = name;
  $('#brandSub').textContent = state.settings.address?.split(',')[0] || 'Kasir Toko';

  const today = $('#sideToday');
  if (today) today.querySelector('.mini-stat-value').textContent = rupiah(state.todayReport.totalSales);
}

/** Tampilkan identitas pengguna yang sedang masuk. */
function renderUser() {
  const user = state.auth.user;
  if (!user) return;

  $('#userName').textContent = user.name;
  $('#userRole').textContent = user.role === 'admin' ? 'Admin' : 'Kasir';
  $('#userAvatar').textContent = user.role === 'admin' ? '🔑' : '👤';
}

function renderCashierSelect() {
  const wrap = $('#cashierPickWrap');
  // Kasir tidak boleh memilih nama kasir — namanya diambil dari akun yang login.
  wrap.hidden = !isAdmin();
  if (!isAdmin()) return;

  const sel = $('#cashierSelect');
  const list = state.settings.cashiers?.length ? state.settings.cashiers : ['Kasir 1'];
  const active = state.settings.activeCashier || list[0];

  sel.innerHTML = list.map((c) => `<option ${c === active ? 'selected' : ''}>${esc(c)}</option>`).join('');
}

/** Sesuaikan kerangka halaman dengan peran pengguna. */
function applyRoleLayout() {
  const kasir = !isAdmin();
  document.body.classList.toggle('role-kasir', kasir);

  // Kasir tidak punya menu samping, jadi statistik penjualan & tombol keluar
  // sidebar tidak perlu ditampilkan.
  const foot = $('.sidebar-foot');
  if (foot) foot.hidden = kasir;
}

function openSidebar() {
  $('#sidebar').classList.add('is-open');
}
function closeSidebar() {
  $('#sidebar').classList.remove('is-open');
}

/* ------------------------------ Layar masuk ----------------------------- */

// Catatan: #loginScreen diganti elemennya oleh showLogin() tiap kali tampil,
// jadi jangan simpan referensinya di sini — selalu ambil ulang lewat getElementById.
const appEl = $('#app');

function showApp() {
  destroyLogin(); // lepas listener keyboard layar masuk
  const el = document.getElementById('loginScreen');
  if (el) {
    el.hidden = true;
    el.innerHTML = '';
  }
  appEl.hidden = false;
}

function showLoginScreen() {
  appEl.hidden = true;
  document.body.classList.remove('role-kasir'); // kembali ke tampilan netral
  if (typeof cleanup === 'function') {
    try {
      cleanup();
    } catch {
      /* abaikan */
    }
    cleanup = null;
  }
  viewEl.innerHTML = '';
  showLogin();
}

async function doLogout() {
  const ok = await confirmDialog(
    'Keluar dari aplikasi?',
    'Anda perlu memasukkan PIN lagi untuk masuk kembali.',
    { okLabel: 'Keluar', danger: false },
  );
  if (!ok) return;

  await logout();
  toast('Anda telah keluar', 'info');
  showLoginScreen();
}

function renderPrinterTop() {
  const isConn = printerService.isConnected();
  const name = printerService.getDeviceName();
  const btn = $('#btnPrinterTop');
  const dot = $('#printerStatusDot');
  const label = $('#printerBtnName');
  if (!btn || !dot || !label) return;

  btn.classList.toggle('is-connected', isConn);
  dot.classList.toggle('is-online', isConn);
  label.textContent = isConn ? (name.length > 12 ? name.slice(0, 10) + '…' : name) : 'Printer';
  btn.title = isConn
    ? `Printer Terhubung: ${name} (${printerService.settings.paperWidth}mm) - Klik untuk kelola`
    : 'Printer Bluetooth (Belum Terhubung) - Klik untuk menghubungkan';
}

/* --------------------------------- Init --------------------------------- */

/** Dipasang sekali: menangani semua elemen tetap di kerangka halaman. */
function bindShell() {
  $('#btnMenu').addEventListener('click', openSidebar);

  const btnPrinter = $('#btnPrinterTop');
  if (btnPrinter) {
    btnPrinter.addEventListener('click', () => openPrinterModal());
  }
  printerService.subscribe(renderPrinterTop);
  renderPrinterTop();

  document.addEventListener('click', (e) => {
    const sidebar = $('#sidebar');
    if (
      sidebar.classList.contains('is-open') &&
      !sidebar.contains(e.target) &&
      e.target.id !== 'btnMenu'
    ) {
      closeSidebar();
    }
  });

  on($('#nav'), 'click', '[data-route]', (e, btn) => navigate(btn.dataset.route));

  $('#cashierSelect').addEventListener('change', async (e) => {
    try {
      await saveSettings({ activeCashier: e.target.value });
      toast(`Kasir aktif: ${e.target.value}`, 'info');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  $('#btnLogout').addEventListener('click', doLogout);
  $('#btnLogoutTop').addEventListener('click', doLogout);

  // Jam realtime di bilah atas
  const tick = () => {
    $('#clock').textContent = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  tick();
  setInterval(tick, 15000);

  // Shortcut keyboard antar halaman (dibatasi sesuai peran)
  document.addEventListener('keydown', (e) => {
    if (isModalOpen() || !isLoggedIn()) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    const map = { F1: 'cashier', F2: 'products', F3: 'transactions', F4: 'reports', F5: 'settings' };
    if (map[e.key]) {
      e.preventDefault();
      navigate(allowedRoute(map[e.key]));
    }
  });

  window.addEventListener('hashchange', () => {
    const route = location.hash.replace('#', '');
    if (route && route !== state.route) navigate(route, { silent: true });
  });
}

/** Siapkan aplikasi untuk pengguna yang sudah terautentikasi. */
async function enterApp() {
  showApp();
  applyRoleLayout();
  renderUser();

  try {
    await bootstrap();
  } catch (err) {
    viewEl.innerHTML = `
      <div class="empty" style="padding:80px 20px">
        <span class="empty-icon">🔌</span>
        <strong>Tidak dapat memuat data</strong>
        <span>${esc(err.message)}</span>
      </div>`;
    toast('Gagal memuat data dari server', 'err');
    return;
  }

  renderBrand();
  renderCashierSelect();
  renderUser();

  const initial = allowedRoute(location.hash.replace('#', '') || 'cashier');
  navigate(initial, { silent: true });
}

let entered = false;

async function init() {
  bindShell();

  // Bila server menolak token (kedaluwarsa/dihapus), kembalikan ke layar masuk.
  setUnauthorizedHandler((message) => {
    if (!isLoggedIn()) return;
    clearSession();
    toast(message || 'Sesi berakhir, silakan masuk ulang', 'warn');
    showLoginScreen();
  });

  // Setelah login berhasil, store memicu emit() → masuk ke aplikasi.
  subscribe(async () => {
    renderBrand();
    renderCashierSelect();
    renderUser();
    applyRoleLayout();

    if (isLoggedIn() && !entered) {
      entered = true;
      await enterApp();
    }
    if (!isLoggedIn()) entered = false;
  });

  // Coba pakai sesi tersimpan agar tidak perlu PIN saat halaman di-refresh.
  loadStoredToken();
  const user = await restoreSession();

  if (user) {
    // restoreSession() sudah memicu emit() → enterApp() mungkin sudah berjalan.
    if (!entered) {
      entered = true;
      await enterApp();
    }
  } else {
    showLoginScreen();
  }
}

init();
