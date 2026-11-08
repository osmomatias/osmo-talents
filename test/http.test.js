const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osmo-http-'));
process.env.DB_PATH = path.join(dir, 'test.sqlite');
const { server } = require('../server');
const { db } = require('../src/db');
function request(url, body, cookie, ip = '203.0.113.5', forwarded = '') {
  return new Promise(resolve => {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    Object.assign(req, { url, method: body ? 'POST' : 'GET', headers: { 'x-osmo': '1', cookie: cookie || '', 'x-forwarded-for': forwarded }, socket: { remoteAddress: ip } });
    const headers = {};
    const res = { getHeader: k => headers[k], setHeader: (k,v) => headers[k] = v, writeHead(status,h) { this.status = status; Object.assign(headers,h); this.headersSent = true; }, end(data) { resolve({ status: this.status, headers, data: String(data || '') }); } };
    server.emit('request', req, res);
  });
}
test('malformed URLs and file cookies return errors without stopping requests', async () => {
  assert.equal((await request('/%ZZ')).status, 400);
  assert.equal((await request('/arquivo/1', null, 'osmo_sid=%ZZ')).status, 400);
  assert.equal((await request('/api/me')).status, 200);
});
test('registration and login preserve password compatibility and reject incorrect passwords', async () => {
  const credentials = { name: 'Teste', email: 'audit@example.test', password: 'senha-teste-123' };
  assert.equal((await request('/api/auth/register', credentials)).status, 200);
  const login = await request('/api/auth/login', credentials);
  assert.equal(login.status, 200);
  assert.match(login.headers['Set-Cookie'], /HttpOnly/);
  assert.equal((await request('/api/auth/login', { ...credentials, password: 'errada' })).status, 401);
});
test('untrusted peers cannot bypass login limits with forwarded headers', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await request('/api/auth/login', { email: 'absent@example.test', password: 'incorrect' }, '', '203.0.113.20', `192.0.2.${i}`)).status, 401);
  assert.equal((await request('/api/auth/login', { email: 'absent@example.test', password: 'incorrect' }, '', '203.0.113.20', '192.0.2.99')).status, 429);
});
test.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
