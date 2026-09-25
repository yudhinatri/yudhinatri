'use strict';

/**
 * POS Pakaian - server.js
 *
 * Server HTTP untuk pengembangan lokal. Semua logika permintaan ada di
 * lib/handler.js supaya bisa dipakai ulang oleh serverless function Vercel
 * (api/index.js).
 *
 * Data disimpan di file JSON dalam folder `data/`. Bila variabel lingkungan
 * Redis diisi, penyimpanan otomatis beralih ke Redis (lihat lib/store.js).
 */

const http = require('http');
const store = require('./lib/store.js');
const core = require('./lib/core.js');
const { handler } = require('./lib/handler.js');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer(handler);

function start() {
  server.listen(PORT, HOST, () => {
    const nets = require('os').networkInterfaces();
    const lan = Object.values(nets)
      .flat()
      .filter((n) => n && n.family === 'IPv4' && !n.internal)
      .map((n) => n.address);

    console.log('');
    console.log('  ╭──────────────────────────────────────────────╮');
    console.log('  │   POS Pakaian - Kasir Toko Pakaian           │');
    console.log('  ╰──────────────────────────────────────────────╯');
    console.log(`   Lokal   : http://localhost:${PORT}`);
    lan.forEach((ip) => console.log(`   Jaringan: http://${ip}:${PORT}`));
    console.log(store.isRedis() ? '   Data    : Redis (Upstash)' : `   Data    : ${store.DATA_DIR}`);
    console.log(`   Login   : Admin PIN ${core.DEFAULT_PIN_ADMIN}  |  Kasir 1 PIN ${core.DEFAULT_PIN_KASIR}`);
    console.log('   Tekan Ctrl+C untuk berhenti.');
    console.log('');
  });
}

// Siapkan data contoh lebih dulu agar kegagalan penyimpanan terlihat jelas
// saat start, bukan saat permintaan pertama masuk.
store
  .ensureInitialized()
  .catch((err) => console.error('\n  Peringatan: gagal menyiapkan penyimpanan —', err.message, '\n'))
  .finally(start);
