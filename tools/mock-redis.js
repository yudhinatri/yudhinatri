'use strict';

/**
 * Mock Upstash Redis REST API untuk pengujian lokal.
 * Bukan bagian aplikasi — hanya alat bantu uji mode Redis.
 *
 *   node tools/mock-redis.js 6380
 */

const http = require('http');

const PORT = Number(process.argv[2]) || 6380;
const TOKEN = process.env.MOCK_TOKEN || 'uji-token';
const store = new Map(); // key -> { value, expireAt|null }

function alive(key) {
  const e = store.get(key);
  if (!e) return null;
  if (e.expireAt && Date.now() > e.expireAt) {
    store.delete(key);
    return null;
  }
  return e;
}

const server = http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let args;
    try {
      args = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'bad json' }));
    }

    const [cmd, key, ...rest] = args.map((a) => String(a));
    const upper = String(cmd).toUpperCase();
    let result = null;

    switch (upper) {
      case 'PING':
        result = 'PONG';
        break;

      case 'GET': {
        const e = alive(key);
        result = e ? e.value : null;
        break;
      }

      case 'SET': {
        const opts = rest.map((r) => r.toUpperCase());
        const nx = opts.includes('NX');
        const exIdx = opts.indexOf('EX');
        const ttl = exIdx >= 0 ? Number(rest[exIdx + 1]) : null;

        if (nx && alive(key)) {
          result = null; // NX gagal: kunci sudah ada
          break;
        }
        store.set(key, {
          value: rest[0],
          expireAt: ttl ? Date.now() + ttl * 1000 : null,
        });
        result = 'OK';
        break;
      }

      case 'DEL':
        result = store.delete(key) ? 1 : 0;
        break;

      case 'KEYS':
        result = [...store.keys()];
        break;

      case 'FLUSHALL':
        store.clear();
        result = 'OK';
        break;

      default:
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: `perintah tidak didukung: ${upper}` }));
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ result }));
  });
});

server.listen(PORT, () => {
  console.log(`Mock Redis (Upstash REST) di http://localhost:${PORT} — token: ${TOKEN}`);
});
