'use strict';

/**
 * Logika bisnis murni + util bersama.
 * Tidak menyentuh penyimpanan maupun jaringan, sehingga mudah diuji
 * dan dipakai ulang oleh server lokal maupun serverless function.
 */

const crypto = require('crypto');

/* ------------------------------ Konstanta ------------------------------- */

const DEFAULT_SETTINGS = {
  storeName: 'Toko Pakaian',
  address: 'Jl. Contoh No. 1, Jakarta',
  phone: '0812-0000-0000',
  serviceCharge: 0,
  receiptFooter: 'Terima kasih telah berbelanja :)',
  lowStockThreshold: 5,
  cashiers: ['Kasir 1', 'Kasir 2'],
  activeCashier: 'Kasir 1',
  categories: ['Atasan', 'Bawahan', 'Dress', 'Outerwear', 'Aksesoris', 'Lainnya'],
  sizes: ['S', 'M', 'L', 'XL', 'XXL', 'All Size'],
  colors: ['Hitam', 'Putih', 'Navy', 'Abu', 'Merah', 'Biru', 'Hijau', 'Cream'],
};

const DEFAULT_PIN_ADMIN = '1234';
const DEFAULT_PIN_KASIR = '1111';
const PIN_LENGTH = 4;

/* --------------------------------- Util -------------------------------- */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const nextId = (prefix) => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
const pad = (n, len = 2) => String(n).padStart(len, '0');

const toInt = (v, def = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : def;
};

const toStr = (v, max = 200) => String(v ?? '').trim().slice(0, max);

/**
 * Tanggal & jam lokal server (bukan UTC) agar filter laporan sesuai hari toko.
 * Zona waktu bisa dipaksa lewat env TZ, mis. TZ=Asia/Jakarta.
 */
function localParts(d = new Date()) {
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  };
}

/* --------------------------------- PIN --------------------------------- */

/** Hash PIN dengan scrypt + salt. PIN asli tidak pernah disimpan. */
function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString('hex');
}

/** Buat record PIN baru (salt acak + hash) untuk disimpan di data pengguna. */
function pinRecord(pin) {
  const pinSalt = crypto.randomBytes(16).toString('hex');
  return { pinSalt, pinHash: hashPin(pin, pinSalt) };
}

/** Cocokkan PIN dengan record tersimpan, memakai perbandingan waktu tetap. */
function pinMatches(pin, user) {
  if (!user?.pinHash || !user?.pinSalt) return false;
  const attempt = Buffer.from(hashPin(pin, user.pinSalt), 'hex');
  const stored = Buffer.from(user.pinHash, 'hex');
  if (attempt.length !== stored.length) return false;
  return crypto.timingSafeEqual(attempt, stored);
}

/** Validasi format PIN. Melempar HttpError bila tidak sesuai. */
function validatePin(pin) {
  const s = String(pin ?? '').trim();
  if (!/^\d+$/.test(s)) throw new HttpError(400, 'PIN hanya boleh berisi angka');
  if (s.length !== PIN_LENGTH) throw new HttpError(400, `PIN harus ${PIN_LENGTH} angka`);
  return s;
}

/* ------------------------------ Seed contoh ----------------------------- */

function seedProducts() {
  const raw = [
    ['Kemeja Flanel Lengan Panjang', 'Atasan', 'L', 'Merah', 189000, 115000, 14],
    ['Kemeja Flanel Lengan Panjang', 'Atasan', 'M', 'Navy', 189000, 115000, 9],
    ['Kaos Oversize Cotton Combed 30s', 'Atasan', 'XL', 'Hitam', 95000, 52000, 26],
    ['Kaos Oversize Cotton Combed 30s', 'Atasan', 'L', 'Putih', 95000, 52000, 31],
    ['Polo Shirt Lacoste Basic', 'Atasan', 'M', 'Abu', 145000, 88000, 12],
    ['Celana Chino Slim Fit', 'Bawahan', '32', 'Cream', 215000, 135000, 8],
    ['Celana Jeans Straight Cut', 'Bawahan', '31', 'Biru', 265000, 168000, 6],
    ['Kulot Palazzo Katun', 'Bawahan', 'All Size', 'Hitam', 135000, 78000, 17],
    ['Dress Midi Linen', 'Dress', 'M', 'Hijau', 279000, 172000, 5],
    ['Gamis Rayon Premium', 'Dress', 'L', 'Abu', 235000, 148000, 7],
    ['Hoodie Fleece Unisex', 'Outerwear', 'XL', 'Hitam', 249000, 158000, 11],
    ['Jaket Bomber Taslan', 'Outerwear', 'L', 'Navy', 295000, 190000, 4],
    ['Cardigan Rajut Knit', 'Outerwear', 'All Size', 'Cream', 175000, 102000, 13],
    ['Topi Baseball Twill', 'Aksesoris', 'All Size', 'Hitam', 65000, 32000, 24],
    ['Ikat Pinggang Kulit Sintetis', 'Aksesoris', 'All Size', 'Hitam', 89000, 45000, 19],
    ['Kaos Kaki Sport 3in1', 'Aksesoris', 'All Size', 'Putih', 45000, 21000, 40],
  ];

  const counters = {};
  const now = new Date().toISOString();

  return raw.map(([name, category, size, color, price, cost, stock]) => {
    counters[category] = (counters[category] || 0) + 1;
    const code = category.slice(0, 3).toUpperCase();
    return {
      id: nextId('prd'),
      sku: `${code}-${pad(counters[category], 3)}`,
      name,
      category,
      size,
      color,
      price,
      cost,
      stock,
      minStock: 3,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
  });
}

/** Akun bawaan saat penyimpanan masih kosong. */
function seedUsers() {
  const now = new Date().toISOString();
  return [
    { id: nextId('usr'), name: 'Admin', role: 'admin', pin: DEFAULT_PIN_ADMIN, active: true, createdAt: now },
    { id: nextId('usr'), name: 'Kasir 1', role: 'kasir', pin: DEFAULT_PIN_KASIR, active: true, createdAt: now },
  ].map(({ pin, ...rest }) => ({ ...rest, ...pinRecord(pin) }));
}

/** Buang field pengaturan yang tidak dikenal (mis. sisa field pajak). */
function cleanSettings(raw) {
  const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  Object.keys(merged)
    .filter((k) => !(k in DEFAULT_SETTINGS))
    .forEach((k) => delete merged[k]);
  return merged;
}

/* ------------------------------ Produk --------------------------------- */

function normalizeProduct(input, existing = null) {
  const name = toStr(input.name, 120);
  if (!name) throw new HttpError(400, 'Nama produk wajib diisi');

  const price = toInt(input.price, NaN);
  if (!Number.isFinite(price) || price < 0) throw new HttpError(400, 'Harga jual tidak valid');

  const cost = toInt(input.cost, 0);
  const stock = toInt(input.stock, 0);

  return {
    id: existing?.id || nextId('prd'),
    sku:
      toStr(input.sku, 40).toUpperCase() ||
      existing?.sku ||
      `SKU-${Date.now().toString(36).toUpperCase()}`,
    name,
    category: toStr(input.category, 40) || 'Lainnya',
    size: toStr(input.size, 20) || 'All Size',
    color: toStr(input.color, 30) || '-',
    price,
    cost: cost < 0 ? 0 : cost,
    stock: stock < 0 ? 0 : stock,
    minStock: Math.max(0, toInt(input.minStock, 3)),
    active: input.active === undefined ? true : Boolean(input.active),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/* ------------------------------ Transaksi ------------------------------ */

function nextInvoiceNo(transactions) {
  const { date } = localParts();
  const prefix = `INV-${date.replace(/-/g, '')}`;
  const count = transactions.filter((t) => String(t.no).startsWith(prefix)).length + 1;
  return `${prefix}-${pad(count, 4)}`;
}

function buildTransaction(payload, products, transactions, settings) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw new HttpError(400, 'Keranjang masih kosong');

  const byId = new Map(products.map((p) => [p.id, p]));
  const normalizedItems = [];
  let subtotal = 0;

  for (const raw of items) {
    const product = byId.get(raw.productId);
    if (!product) throw new HttpError(400, `Produk tidak ditemukan (${raw.productId})`);

    const qty = toInt(raw.qty, 0);
    if (qty <= 0) throw new HttpError(400, `Jumlah tidak valid untuk ${product.name}`);
    if (product.stock < qty) {
      throw new HttpError(
        400,
        `Stok ${product.name} (${product.size}) tidak cukup. Tersisa ${product.stock}.`,
      );
    }

    const price = Number.isFinite(Number(raw.price)) ? Math.round(Number(raw.price)) : product.price;
    const lineDiscount = Math.max(0, toInt(raw.discount, 0));
    const net = Math.max(0, price * qty - lineDiscount);
    subtotal += net;

    normalizedItems.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      size: product.size,
      color: product.color,
      price,
      cost: product.cost,
      qty,
      discount: lineDiscount,
      subtotal: net,
    });
  }

  const orderDiscount = Math.max(0, toInt(payload.discount, 0));
  const afterDiscount = Math.max(0, subtotal - orderDiscount);
  const serviceCharge = Math.max(0, toInt(settings.serviceCharge, 0));
  const total = Math.max(0, afterDiscount + serviceCharge);

  const method = ['cash', 'transfer', 'qris', 'debit', 'ewallet'].includes(payload.method)
    ? payload.method
    : 'cash';

  const paid = method === 'cash' ? toInt(payload.paid, total) : total;
  if (paid < total) throw new HttpError(400, 'Jumlah bayar kurang dari total');

  const profit = normalizedItems.reduce(
    (sum, it) => sum + (it.price - it.cost) * it.qty - it.discount,
    0,
  );

  const stamp = new Date();
  const { date, time } = localParts(stamp);

  return {
    id: nextId('trx'),
    no: nextInvoiceNo(transactions),
    createdAt: stamp.toISOString(),
    date,
    time,
    cashier: toStr(payload.cashier, 60) || settings.activeCashier || 'Kasir',
    customer: toStr(payload.customer, 80),
    note: toStr(payload.note, 200),
    items: normalizedItems,
    itemCount: normalizedItems.reduce((s, it) => s + it.qty, 0),
    subtotal,
    discount: orderDiscount,
    serviceCharge,
    total,
    method,
    paid,
    change: Math.max(0, paid - total),
    profit,
    status: 'paid',
    voidAt: null,
    voidReason: '',
  };
}

/** Tambah/kurangi stok sesuai item transaksi (mutasi array di tempat). */
function applyStockDelta(products, items, sign) {
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const item of items) {
    const product = byId.get(item.productId);
    if (product) {
      product.stock = Math.max(0, product.stock + sign * item.qty);
      product.updatedAt = new Date().toISOString();
    }
  }
  return products;
}

/* ------------------------------- Laporan -------------------------------- */

function buildReport(transactions, settings, from, to) {
  const paid = transactions.filter((t) => t.status === 'paid');

  const totalSales = paid.reduce((s, t) => s + t.total, 0);
  const totalProfit = paid.reduce((s, t) => s + t.profit, 0);
  const totalItems = paid.reduce((s, t) => s + t.itemCount, 0);
  const totalDiscount = paid.reduce(
    (s, t) => s + t.discount + t.items.reduce((a, i) => a + i.discount, 0),
    0,
  );

  const byDateMap = new Map();
  const byProductMap = new Map();
  const byMethodMap = new Map();
  const byCategoryMap = new Map();

  for (const t of paid) {
    const day = byDateMap.get(t.date) || { date: t.date, sales: 0, profit: 0, trx: 0, items: 0 };
    day.sales += t.total;
    day.profit += t.profit;
    day.trx += 1;
    day.items += t.itemCount;
    byDateMap.set(t.date, day);

    byMethodMap.set(t.method, (byMethodMap.get(t.method) || 0) + t.total);

    for (const it of t.items) {
      const key = it.productId || it.sku;
      const row = byProductMap.get(key) || {
        productId: key,
        sku: it.sku,
        name: it.name,
        size: it.size,
        color: it.color,
        category: it.category,
        qty: 0,
        sales: 0,
        profit: 0,
      };
      row.qty += it.qty;
      row.sales += it.subtotal;
      row.profit += (it.price - it.cost) * it.qty - it.discount;
      byProductMap.set(key, row);

      const cat = byCategoryMap.get(it.category) || { category: it.category, qty: 0, sales: 0 };
      cat.qty += it.qty;
      cat.sales += it.subtotal;
      byCategoryMap.set(it.category, cat);
    }
  }

  return {
    range: { from, to },
    summary: {
      totalSales,
      totalProfit,
      totalItems,
      totalDiscount,
      transactionCount: paid.length,
      avgPerTransaction: paid.length ? Math.round(totalSales / paid.length) : 0,
    },
    days: [...byDateMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    topProducts: [...byProductMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 20),
    byMethod: [...byMethodMap.entries()]
      .map(([method, total]) => ({ method, total }))
      .sort((a, b) => b.total - a.total),
    byCategory: [...byCategoryMap.values()].sort((a, b) => b.sales - a.sales),
  };
}

/** Bagian pengaturan yang aman dilihat kasir (tanpa daftar kasir dsb.). */
function publicSettings(settings) {
  return {
    storeName: settings.storeName,
    address: settings.address,
    phone: settings.phone,
    receiptFooter: settings.receiptFooter,
    serviceCharge: settings.serviceCharge,
    categories: settings.categories,
    sizes: settings.sizes,
    colors: settings.colors,
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  DEFAULT_PIN_ADMIN,
  DEFAULT_PIN_KASIR,
  PIN_LENGTH,
  HttpError,
  nextId,
  pad,
  toInt,
  toStr,
  localParts,
  hashPin,
  pinRecord,
  pinMatches,
  validatePin,
  seedProducts,
  seedUsers,
  cleanSettings,
  normalizeProduct,
  nextInvoiceNo,
  buildTransaction,
  applyStockDelta,
  buildReport,
  publicSettings,
};
