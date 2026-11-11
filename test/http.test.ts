import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeRequest } from "./http-fixture";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osmo-http-'));
process.env.DB_PATH = path.join(dir, 'test.sqlite');
const { server } = require('../server') as typeof import("../server");
const { db } = require('../src/db') as typeof import("../src/db");
const sendRequest = makeRequest(server);
function request(url: string, body?: Record<string, unknown> | null, cookie = '', ip = '203.0.113.5', forwarded = '') {
  return sendRequest(url, { method: body ? 'POST' : 'GET', body: body || undefined, cookie, ip, forwarded });
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
  assert.match(login.headers['set-cookie'], /HttpOnly/);
  assert.equal((await request('/api/auth/login', { ...credentials, password: 'errada' })).status, 401);
});
test('registration with role ambos enables both freela and cliente roles', async () => {
  const credentials = { name: 'Ambos Teste', email: 'ambos@example.test', password: 'senha-teste-123', role: 'ambos' };
  const reg = await request('/api/auth/register', credentials);
  assert.equal(reg.status, 200);
  const cookie = String(reg.headers['set-cookie']).split(';')[0];
  const meRes = await request('/api/me', null, cookie);
  assert.equal(meRes.status, 200);
  const me = JSON.parse(meRes.body);
  assert.equal(me.user.role, 'freela');
  assert.deepEqual(me.user.roles, ['freela', 'cliente']);
});
test('untrusted peers cannot bypass login limits with forwarded headers', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await request('/api/auth/login', { email: 'absent@example.test', password: 'incorrect' }, '', '203.0.113.20', `192.0.2.${i}`)).status, 401);
  assert.equal((await request('/api/auth/login', { email: 'absent@example.test', password: 'incorrect' }, '', '203.0.113.20', '192.0.2.99')).status, 429);
});
test.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
