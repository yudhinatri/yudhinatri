'use strict';

/**
 * Titik masuk serverless function Vercel.
 *
 * Semua permintaan — API maupun file statis — diarahkan ke sini lewat
 * `vercel.json`, lalu diteruskan ke handler bersama di lib/handler.js.
 *
 * Data disimpan di Upstash Redis karena filesystem Vercel read-only.
 * Lihat README bagian "Deploy ke Vercel".
 */

const { handler } = require('../lib/handler.js');

module.exports = handler;
