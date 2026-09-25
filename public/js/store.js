/* State global aplikasi + keranjang belanja.
   Semua state disimpan di memori dan disinkronkan ke server lewat API. */

import { api, setToken, getToken } from './api.js';

const SESSION_KEY = 'pos.session';

export const state = {
  auth: { token: null, user: null }, // { id, name, role }
  settings: {
    storeName: 'Toko Pakaian',
    address: '',
    phone: '',
    serviceCharge: 0,
    receiptFooter: '',
    lowStockThreshold: 5,
    cashiers: [],
    activeCashier: '',
    categories: [],
    sizes: [],
    colors: [],
  },
  products: [],
  cart: [],          // { productId, name, sku, size, color, price, cost, qty, discount, stock }
  todayReport: { totalSales: 0, totalProfit: 0, transactionCount: 0, totalItems: 0 },
  lowStockCount: 0,
  transactionCount: 0,
  route: 'cashier',
  catalogFilter: { category: 'Semua', query: '' },
};

const listeners = new Set();

/** Berlangganan perubahan state. Mengembalikan fungsi unsubscribe. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Beri tahu semua pelanggan bahwa state berubah. */
export function emit() {
  listeners.forEach((fn) => fn(state));
}

/* ------------------------------ Autentikasi ----------------------------- */

export const isAdmin = () => state.auth.user?.role === 'admin';
export const isLoggedIn = () => Boolean(state.auth.token && state.auth.user);

/** Muat token tersimpan (agar tidak perlu PIN ulang saat halaman di-refresh). */
export function loadStoredToken() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (saved?.token) {
      state.auth.token = saved.token;
      setToken(saved.token);
    }
  } catch {
    /* abaikan data rusak */
  }
}

function persistSession(token, user) {
  state.auth = { token, user };
  setToken(token);
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token }));
  } catch {
    /* mode privat: sesi tetap jalan sampai halaman ditutup */
  }
}

/** Masuk dengan PIN. Mengembalikan data pengguna. */
export async function login(userId, pin) {
  const { token, user } = await api.login(userId, pin);
  persistSession(token, user);
  emit();
  return user;
}

export async function logout() {
  try {
    if (getToken()) await api.logout();
  } catch {
    /* server tidak terjangkau — tetap bersihkan sisi klien */
  }
  clearSession();
}

/** Bersihkan sesi lokal tanpa memanggil server (dipakai saat sesi ditolak). */
export function clearSession() {
  state.auth = { token: null, user: null };
  state.cart = [];
  setToken(null);
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* abaikan */
  }
  emit();
}

/** Validasi token tersimpan ke server. */
export async function restoreSession() {
  if (!state.auth.token) return null;
  try {
    const { user } = await api.me();
    state.auth.user = user;
    emit();
    return user;
  } catch {
    clearSession();
    return null;
  }
}

/* ------------------------------ Bootstrap ------------------------------ */

export async function bootstrap() {
  const data = await api.bootstrap();
  state.settings = { ...state.settings, ...data.settings };
  state.products = data.products || [];
  state.todayReport = data.todayReport || state.todayReport;
  state.lowStockCount = data.lowStock || 0;
  state.transactionCount = data.transactionCount || 0;
  if (data.user) state.auth.user = data.user;
  emit();
  return data;
}

export async function refreshProducts() {
  const { products } = await api.listProducts();
  state.products = products;
  emit();
}

export async function refreshSummary() {
  const data = await api.bootstrap();
  state.todayReport = data.todayReport;
  state.lowStockCount = data.lowStock;
  state.transactionCount = data.transactionCount;
  emit();
}

/** Simpan sebagian pengaturan. Hanya field di `patch` yang dikirim,
 *  sehingga perubahan dari tab/perangkat lain tidak ikut tertimpa. */
export async function saveSettings(patch) {
  const { settings } = await api.saveSettings(patch);
  state.settings = settings;
  emit();
  return settings;
}

/* -------------------------------- Keranjang ----------------------------- */

export const productById = (id) => state.products.find((p) => p.id === id);

/** Tambah produk ke keranjang (atau naikkan jumlah jika sudah ada). */
export function addToCart(product, qty = 1) {
  if (!product || product.stock <= 0) return false;

  const line = state.cart.find((l) => l.productId === product.id);
  const inCart = line ? line.qty : 0;
  if (inCart + qty > product.stock) return false;

  if (line) {
    line.qty += qty;
  } else {
    state.cart.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      size: product.size,
      color: product.color,
      category: product.category,
      price: product.price,
      cost: product.cost,
      stock: product.stock,
      qty,
      discount: 0,
    });
  }
  emit();
  return true;
}

export function setQty(productId, qty) {
  const line = state.cart.find((l) => l.productId === productId);
  if (!line) return;
  const product = productById(productId);
  const max = product ? product.stock : line.stock;

  const next = Math.round(Number(qty) || 0);
  if (next <= 0) {
    removeFromCart(productId);
    return;
  }
  line.qty = Math.min(next, max);
  emit();
}

export function setLineDiscount(productId, discount) {
  const line = state.cart.find((l) => l.productId === productId);
  if (!line) return;
  line.discount = Math.max(0, Math.round(Number(discount) || 0));
  emit();
}

export function removeFromCart(productId) {
  state.cart = state.cart.filter((l) => l.productId !== productId);
  emit();
}

export function clearCart() {
  state.cart = [];
  emit();
}

/** Ringkasan perhitungan keranjang: subtotal, total, dll. */
export function cartTotals(orderDiscount = 0) {
  const subtotal = state.cart.reduce((s, l) => s + l.price * l.qty - l.discount, 0);
  const lineDiscount = state.cart.reduce((s, l) => s + l.discount, 0);
  const disc = Math.max(0, Math.min(Math.round(Number(orderDiscount) || 0), subtotal));

  const serviceCharge = Math.max(0, Number(state.settings.serviceCharge) || 0);
  const total = Math.max(0, subtotal - disc + serviceCharge);

  const itemCount = state.cart.reduce((s, l) => s + l.qty, 0);
  const profit = state.cart.reduce((s, l) => s + (l.price - l.cost) * l.qty - l.discount, 0);

  return { subtotal, lineDiscount, discount: disc, serviceCharge, total, itemCount, profit };
}

/* ------------------------------- Util produk ---------------------------- */

export const stokRendah = (p) =>
  p.stock <= (p.minStock ?? state.settings.lowStockThreshold ?? 5);

/** Produk yang cocok dengan pencarian kasir + filter kategori. */
export function filteredProducts({ category = 'Semua', query = '' } = state.catalogFilter) {
  const q = query.trim().toLowerCase();
  return state.products
    .filter((p) => p.active !== false)
    .filter((p) => category === 'Semua' || p.category === category)
    .filter((p) => {
      if (!q) return true;
      return `${p.name} ${p.sku} ${p.category} ${p.size} ${p.color}`.toLowerCase().includes(q);
    })
    .sort((a, b) => a.name.localeCompare(b.name) || String(a.size).localeCompare(String(b.size)));
}
