'use strict';

/**
 * Catch-all Serverless Function untuk Vercel: /api/*
 *
 * Menangani semua endpoint dinamis seperti:
 *  - /api/health
 *  - /api/auth/users
 *  - /api/auth/login
 *  - /api/products
 *  - /api/transactions
 *  - /api/reports
 *  - /api/settings
 */

const { handler } = require('../lib/handler.js');

module.exports = handler;
