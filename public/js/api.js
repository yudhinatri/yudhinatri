/* Klien tipis untuk REST API di server.js */

let token = null;
let onUnauthorized = null;

/** Set token sesi yang dikirim pada setiap permintaan. */
export function setToken(value) {
  token = value || null;
}

export const getToken = () => token;

/** Callback dipanggil saat server menolak sesi (401). */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(method, url, body) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['X-Auth-Token'] = token;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (res.status === 401 && onUnauthorized) onUnauthorized(data.error);

  if (!res.ok) throw new Error(data.error || `Permintaan gagal (${res.status})`);
  return data;
}

export const api = {
  /* ------------------------------ Autentikasi ---------------------------- */
  loginUsers: () => request('GET', '/api/auth/users'),
  login: (userId, pin) => request('POST', '/api/auth/login', { userId, pin }),
  logout: () => request('POST', '/api/auth/logout'),
  me: () => request('GET', '/api/auth/me'),
  changeOwnPin: (currentPin, newPin) => request('POST', '/api/auth/pin', { currentPin, newPin }),

  /* ------------------------------- Pengguna ----------------------------- */
  listUsers: () => request('GET', '/api/users'),
  createUser: (u) => request('POST', '/api/users', u),
  updateUser: (id, u) => request('PUT', `/api/users/${id}`, u),
  deleteUser: (id) => request('DELETE', `/api/users/${id}`),

  /* -------------------------------- Umum -------------------------------- */
  bootstrap: () => request('GET', '/api/bootstrap'),

  // Produk
  listProducts: () => request('GET', '/api/products'),
  createProduct: (p) => request('POST', '/api/products', p),
  updateProduct: (id, p) => request('PUT', `/api/products/${id}`, p),
  deleteProduct: (id) => request('DELETE', `/api/products/${id}`),
  bulkDeleteProducts: (ids) => request('POST', '/api/products/bulk-delete', { ids }),
  deleteAllProducts: () => request('POST', '/api/products/delete-all'),
  importProducts: (products, replace) =>
    request('POST', '/api/products/import', { products, replace }),

  // Transaksi
  listTransactions: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null),
    );
    return request('GET', `/api/transactions?${q}`);
  },
  createTransaction: (payload) => request('POST', '/api/transactions', payload),
  voidTransaction: (id, reason) => request('POST', `/api/transactions/${id}/void`, { reason }),
  deleteTransaction: (id) => request('DELETE', `/api/transactions/${id}`),

  // Laporan
  report: (from, to) => request('GET', `/api/reports?from=${from}&to=${to}`),

  // Pengaturan
  getSettings: () => request('GET', '/api/settings'),
  saveSettings: (s) => request('PUT', '/api/settings', s),

  // Backup
  restore: (payload) => request('POST', '/api/restore', payload),
  reset: () => request('POST', '/api/reset', { confirm: 'HAPUS' }),
};
