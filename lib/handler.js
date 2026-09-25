'use strict';

/**
 * Penangan permintaan HTTP: REST API + penyajian file statis.
 *
 * Modul ini sengaja tidak memanggil `listen()`, sehingga bisa dipakai oleh:
 *  - server.js   → server Node biasa (pengembangan lokal)
 *  - api/index.js → serverless function Vercel
 */

const fs = require('fs');
const path = require('path');
const store = require('./store.js');
const auth = require('./auth.js');
const core = require('./core.js');

const { HttpError, toInt, toStr, localParts, normalizeProduct, buildTransaction, applyStockDelta, buildReport, publicSettings } = core;

/**
 * Cari folder `public`.
 *
 * Di Vercel, berkas yang disertakan lewat `includeFiles` bisa mendarat di
 * beberapa lokasi berbeda tergantung builder, jadi kandidat dicoba satu per
 * satu dan yang benar-benar berisi index.html yang dipakai.
 */
function resolvePublicDir() {
  if (process.env.POS_PUBLIC_DIR) return process.env.POS_PUBLIC_DIR;

  const candidates = [
    path.join(__dirname, '..', 'public'), // struktur repo: lib/../public
    path.join(process.cwd(), 'public'),
    path.join(__dirname, 'public'),
    '/var/task/public',
  ];

  return candidates.find((p) => fs.existsSync(path.join(p, 'index.html'))) || candidates[0];
}

const PUBLIC_DIR = resolvePublicDir();

/* ------------------------------ Util respons ---------------------------- */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'Payload terlalu besar'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, 'Body bukan JSON yang valid'));
      }
    });

    req.on('error', reject);
  });
}

/* --------------------------------- API --------------------------------- */

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // buang 'api'
  const method = req.method;
  const query = url.searchParams;

  // ---------------- Diagnostik (tanpa login) ----------------
  //
  // Diletakkan sebelum ensureInitialized() supaya tetap bisa dibuka walau
  // penyimpanan bermasalah — justru saat itulah endpoint ini paling dibutuhkan.

  if (method === 'GET' && parts[0] === 'health') {
    return sendJson(res, 200, {
      ok: true,
      ...(await store.health()),
      time: new Date().toISOString(),
    });
  }

  // Seeding data contoh saat penyimpanan masih kosong (cold start di Vercel).
  await store.ensureInitialized();

  // ---------------- Autentikasi (sebagian tanpa login) ----------------

  if (parts[0] === 'auth') {
    if (method === 'GET' && parts[1] === 'users') {
      return sendJson(res, 200, { users: await auth.listLoginUsers() });
    }

    if (method === 'POST' && parts[1] === 'login') {
      const body = await readBody(req);
      const { token, user } = await auth.login(String(body.userId || ''), body.pin);
      return sendJson(res, 200, { token, user });
    }

    // Sisanya butuh sesi yang valid.
    const session = await auth.requireAuth(req);

    if (method === 'POST' && parts[1] === 'logout') {
      await auth.logout(session.token);
      return sendJson(res, 200, { ok: true });
    }

    if (method === 'GET' && parts[1] === 'me') {
      const { token, ...user } = session;
      void token;
      return sendJson(res, 200, { user });
    }

    if (method === 'POST' && parts[1] === 'pin') {
      const body = await readBody(req);
      await auth.changeOwnPin(session, body.currentPin, body.newPin);
      return sendJson(res, 200, { ok: true, relogin: true });
    }

    throw new HttpError(404, `Endpoint tidak dikenal: ${req.method} ${url.pathname}`);
  }

  // ---------------- Semua endpoint lain wajib login ----------------

  const session = await auth.requireAuth(req);
  const isAdmin = session.role === 'admin';
  const needAdmin = () => {
    if (!isAdmin) throw new HttpError(403, 'Hanya admin yang dapat mengakses fitur ini');
  };

  // ---------------- Kelola pengguna (khusus admin) ----------------

  if (parts[0] === 'users') {
    const id = parts[1];

    if (method === 'GET' && !id) {
      needAdmin();
      return sendJson(res, 200, { users: await auth.listUsers() });
    }
    if (method === 'POST' && !id) {
      needAdmin();
      const body = await readBody(req);
      return sendJson(res, 201, { user: await auth.createUser(session, body) });
    }
    if (method === 'PUT' && id) {
      needAdmin();
      const body = await readBody(req);
      return sendJson(res, 200, { user: await auth.updateUser(session, id, body) });
    }
    if (method === 'DELETE' && id) {
      needAdmin();
      return sendJson(res, 200, { user: await auth.deleteUser(session, id) });
    }
  }

  // GET /api/bootstrap
  if (method === 'GET' && parts[0] === 'bootstrap') {
    const settings = core.cleanSettings(await store.read('settings', {}));
    const products = await store.read('products', []);

    // Kasir hanya menerima data yang dibutuhkan untuk melayani penjualan.
    if (!isAdmin) {
      return sendJson(res, 200, {
        role: 'kasir',
        user: { id: session.id, name: session.name, role: session.role },
        settings: publicSettings(settings),
        products,
        todayReport: { totalSales: 0, totalProfit: 0, transactionCount: 0, totalItems: 0, totalDiscount: 0, avgPerTransaction: 0 },
        lowStock: 0,
        transactionCount: 0,
      });
    }

    const transactions = await store.read('transactions', []);
    const today = localParts().date;
    const todayReport = buildReport(
      transactions.filter((t) => t.date === today),
      settings,
      today,
      today,
    );

    return sendJson(res, 200, {
      role: 'admin',
      user: { id: session.id, name: session.name, role: session.role },
      settings,
      products,
      todayReport: todayReport.summary,
      lowStock: products.filter((p) => p.stock <= (p.minStock ?? settings.lowStockThreshold)).length,
      transactionCount: transactions.length,
    });
  }

  // ---------------- Produk ----------------

  if (parts[0] === 'products') {
    const id = parts[1];
    const products = await store.read('products', []);

    if (method === 'GET' && !id) {
      return sendJson(res, 200, { products });
    }

    if (method === 'POST' && !id) {
      needAdmin();
      const body = await readBody(req);
      const product = normalizeProduct(body);

      if (products.some((p) => p.sku === product.sku)) {
        throw new HttpError(409, `SKU "${product.sku}" sudah dipakai produk lain`);
      }
      products.push(product);
      await store.write('products', products);
      return sendJson(res, 201, { product });
    }

    if (method === 'PUT' && id) {
      needAdmin();
      const body = await readBody(req);
      const index = products.findIndex((p) => p.id === id);
      if (index === -1) throw new HttpError(404, 'Produk tidak ditemukan');

      const product = normalizeProduct(body, products[index]);
      if (products.some((p) => p.sku === product.sku && p.id !== id)) {
        throw new HttpError(409, `SKU "${product.sku}" sudah dipakai produk lain`);
      }
      products[index] = product;
      await store.write('products', products);
      return sendJson(res, 200, { product });
    }

    if (method === 'DELETE' && id) {
      needAdmin();
      const index = products.findIndex((p) => p.id === id);
      if (index === -1) throw new HttpError(404, 'Produk tidak ditemukan');
      const [removed] = products.splice(index, 1);
      await store.write('products', products);
      return sendJson(res, 200, { product: removed });
    }

    // POST /api/products/bulk-delete → hapus banyak produk sekaligus
    if (method === 'POST' && id === 'bulk-delete') {
      needAdmin();
      const body = await readBody(req);
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      if (!ids.length) throw new HttpError(400, 'Tidak ada produk yang dipilih');

      const selected = new Set(ids);
      const removed = products.filter((p) => selected.has(p.id)).length;
      if (!removed) throw new HttpError(404, 'Produk yang dipilih tidak ditemukan');

      const remaining = products.filter((p) => !selected.has(p.id));
      await store.write('products', remaining);
      return sendJson(res, 200, { removed, remaining: remaining.length });
    }

    // POST /api/products/delete-all → kosongkan katalog produk
    if (method === 'POST' && id === 'delete-all') {
      needAdmin();
      const removed = products.length;
      await store.write('products', []);
      return sendJson(res, 200, { removed, remaining: 0 });
    }

    // POST /api/products/import → timpa / tambah massal
    if (method === 'POST' && id === 'import') {
      needAdmin();
      const body = await readBody(req);
      const incoming = Array.isArray(body.products) ? body.products : [];
      const base = body.replace ? [] : products;
      let added = 0;
      let updated = 0;

      for (const raw of incoming) {
        const product = normalizeProduct(raw);
        const existing = base.find((p) => p.sku === product.sku);
        if (existing) {
          Object.assign(existing, product, { id: existing.id, createdAt: existing.createdAt });
          updated += 1;
        } else {
          base.push(product);
          added += 1;
        }
      }
      await store.write('products', base);
      return sendJson(res, 200, { added, updated, total: base.length });
    }
  }

  // ---------------- Transaksi ----------------

  if (parts[0] === 'transactions') {
    const id = parts[1];
    const transactions = await store.read('transactions', []);

    if (method === 'GET' && !id) {
      needAdmin();
      const from = query.get('from');
      const to = query.get('to');
      const q = (query.get('q') || '').toLowerCase();
      const limit = toInt(query.get('limit'), 0);

      let list = transactions.filter((t) => {
        if (from && t.date < from) return false;
        if (to && t.date > to) return false;
        if (q) {
          const hay = `${t.no} ${t.customer} ${t.cashier} ${t.method} ${t.items.map((i) => i.name).join(' ')}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      list = list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const total = list.length;
      if (limit > 0) list = list.slice(0, limit);

      const sum = list.filter((t) => t.status === 'paid').reduce((s, t) => s + t.total, 0);
      return sendJson(res, 200, { transactions: list, total, sum });
    }

    if (method === 'GET' && id) {
      needAdmin();
      const trx = transactions.find((t) => t.id === id || t.no === id);
      if (!trx) throw new HttpError(404, 'Transaksi tidak ditemukan');
      return sendJson(res, 200, { transaction: trx });
    }

    // Kasir dan admin sama-sama boleh membuat transaksi.
    if (method === 'POST' && !id) {
      const body = await readBody(req);
      const settings = core.cleanSettings(await store.read('settings', {}));
      const products = await store.read('products', []);

      // Nama kasir diambil dari akun yang login agar tidak bisa dipalsukan.
      if (!isAdmin) body.cashier = session.name;

      const trx = buildTransaction(body, products, transactions, settings);

      await store.write('products', applyStockDelta(products, trx.items, -1));
      transactions.push(trx);
      await store.write('transactions', transactions);

      return sendJson(res, 201, { transaction: trx });
    }

    // POST /api/transactions/:id/void
    if (method === 'POST' && parts[2] === 'void') {
      needAdmin();
      const body = await readBody(req);
      const index = transactions.findIndex((t) => t.id === id || t.no === id);
      if (index === -1) throw new HttpError(404, 'Transaksi tidak ditemukan');

      const trx = transactions[index];
      if (trx.status === 'void') throw new HttpError(400, 'Transaksi sudah dibatalkan');

      const products = await store.read('products', []);
      await store.write('products', applyStockDelta(products, trx.items, 1));

      trx.status = 'void';
      trx.voidAt = new Date().toISOString();
      trx.voidReason = toStr(body.reason, 200) || 'Dibatalkan';
      transactions[index] = trx;
      await store.write('transactions', transactions);

      return sendJson(res, 200, { transaction: trx });
    }

    if (method === 'DELETE' && id) {
      needAdmin();
      const index = transactions.findIndex((t) => t.id === id || t.no === id);
      if (index === -1) throw new HttpError(404, 'Transaksi tidak ditemukan');
      const [removed] = transactions.splice(index, 1);
      await store.write('transactions', transactions);
      return sendJson(res, 200, { transaction: removed });
    }
  }

  // ---------------- Laporan ----------------

  if (method === 'GET' && parts[0] === 'reports') {
    needAdmin();
    const to = query.get('to') || localParts().date;
    const from = query.get('from') || to;

    const settings = core.cleanSettings(await store.read('settings', {}));
    const all = await store.read('transactions', []);
    const list = all.filter((t) => t.date >= from && t.date <= to);
    const report = buildReport(list, settings, from, to);

    const products = await store.read('products', []);
    report.lowStock = products
      .filter((p) => p.active && p.stock <= (p.minStock ?? settings.lowStockThreshold))
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 50);
    report.voidCount = list.filter((t) => t.status === 'void').length;

    return sendJson(res, 200, { report });
  }

  // ---------------- Pengaturan ----------------

  if (parts[0] === 'settings') {
    needAdmin();

    if (method === 'GET') {
      return sendJson(res, 200, { settings: core.cleanSettings(await store.read('settings', {})) });
    }

    if (method === 'PUT' || method === 'POST') {
      const body = await readBody(req);
      const current = core.cleanSettings(await store.read('settings', {}));
      const merged = { ...current, ...body };

      merged.serviceCharge = Math.max(0, toInt(merged.serviceCharge, 0));
      merged.lowStockThreshold = Math.max(0, toInt(merged.lowStockThreshold, 5));

      const strList = (v, max) => (Array.isArray(v) ? v.map((c) => toStr(c, max)).filter(Boolean) : null);
      merged.cashiers = strList(merged.cashiers, 60)?.length ? strList(merged.cashiers, 60) : current.cashiers;
      merged.categories = strList(merged.categories, 40)?.length ? strList(merged.categories, 40) : current.categories;
      merged.sizes = strList(merged.sizes, 20)?.length ? strList(merged.sizes, 20) : current.sizes;
      merged.colors = strList(merged.colors, 30)?.length ? strList(merged.colors, 30) : current.colors;

      const clean = core.cleanSettings(merged);
      await store.write('settings', clean);
      return sendJson(res, 200, { settings: clean });
    }
  }

  // ---------------- Backup / Restore ----------------

  if (method === 'GET' && parts[0] === 'backup') {
    needAdmin();
    const payload = {
      app: 'pos-pakaian',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: core.cleanSettings(await store.read('settings', {})),
      products: await store.read('products', []),
      transactions: await store.read('transactions', []),
      // Catatan: data pengguna & PIN sengaja TIDAK diikutkan.
    };
    const body = JSON.stringify(payload, null, 2);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="backup-pos-${localParts().date}.json"`,
      'Content-Length': Buffer.byteLength(body),
    });
    return res.end(body);
  }

  if (method === 'POST' && parts[0] === 'restore') {
    needAdmin();
    const body = await readBody(req);
    if (!body || typeof body !== 'object') throw new HttpError(400, 'File backup tidak valid');
    if (!Array.isArray(body.products)) throw new HttpError(400, 'File backup tidak memiliki data produk');

    await store.write('products', body.products.map((p) => normalizeProduct(p, p)));
    await store.write('transactions', Array.isArray(body.transactions) ? body.transactions : []);
    if (body.settings) {
      await store.write('settings', core.cleanSettings({ ...(await store.read('settings', {})), ...body.settings }));
    }

    return sendJson(res, 200, {
      products: (await store.read('products', [])).length,
      transactions: (await store.read('transactions', [])).length,
    });
  }

  if (method === 'POST' && parts[0] === 'reset') {
    needAdmin();
    const body = await readBody(req);
    if (body.confirm !== 'HAPUS') throw new HttpError(400, 'Konfirmasi tidak sesuai');
    await store.write('products', []);
    await store.write('transactions', []);
    return sendJson(res, 200, { ok: true });
  }

  throw new HttpError(404, `Endpoint tidak dikenal: ${req.method} ${url.pathname}`);
}

/* ----------------------------- File statis ------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^([/\\])+/, ''));

  // Cegah path traversal keluar dari folder public
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 - Halaman tidak ditemukan');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      // `no-cache` = browser wajib revalidasi, jadi perubahan file JS/CSS
      // langsung terpakai dan tidak menyajikan versi lama dari cache.
      'Cache-Control': 'no-cache',
      'Last-Modified': stat.mtime.toUTCString(),
    });

    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ------------------------------- Dispatcher ----------------------------- */

/** Handler utama. Dipakai server lokal maupun Vercel. */
async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, url);
    } catch (err) {
      // HttpError dari core.js membawa .status; error tak terduga jadi 500.
      const known = Number.isInteger(err?.status);
      const status = known ? err.status : 500;
      if (!known) console.error('[API ERROR]', err);
      if (!res.headersSent) {
        // Pesan filesystem mentah (mis. ENOENT mkdir /var/task/data) diganti
        // panduan yang bisa ditindaklanjuti — lihat lib/store.js.
        sendJson(res, status, { error: store.friendlyError(err) });
      }
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Method Not Allowed');
    return;
  }

  serveStatic(req, res, url);
}

module.exports = { handler, handleApi, serveStatic, PUBLIC_DIR, MIME };
