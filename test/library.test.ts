import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import type { Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { PROJECT_ROOT } from '../src/paths';
import { makeRequest, json } from './http-fixture';

interface LibraryResponse {
  root: string; filmes: unknown[]; series: unknown[]; clipes: unknown[]; continuar: unknown[];
  progress: Record<string, { t: number; d: number; at: number }>;
}

test('the typed companion library serves assets and isolated progress without opening a listener', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'osmo-library-'));
  const previousRoot = process.env.BIBLIOTECA;
  const previousToken = process.env.TMDB_TOKEN;
  process.env.BIBLIOTECA = root;
  // An empty catalogue performs no TMDB calls; this also avoids reading project credentials.
  process.env.TMDB_TOKEN = 'unused-library-fixture';
  try {
    const companion = await import(pathToFileURL(path.join(PROJECT_ROOT, 'biblioteca/dist/server.mjs')).href) as { server: Server };
    assert.equal(companion.server.listening, false);
    const request = makeRequest(companion.server, { ip: '127.0.0.1' });
    const catalogue = json<LibraryResponse>(await request('/api/library'));
    assert.equal(catalogue.root, root);
    for (const items of [catalogue.filmes, catalogue.series, catalogue.clipes, catalogue.continuar]) assert.deepEqual(items, []);
    const script = await request('/app.js');
    assert.equal(script.status, 200);
    assert.match(script.headers['content-type'], /javascript/);
    assert.match(script.body, /\/api\/library/);
    const remote = await request('/remote-tv.js');
    assert.equal(remote.status, 200);
    assert.match(remote.body, /OsmoRemote/);

    const unsafe = Buffer.from('../outside.mp4').toString('base64url');
    assert.equal((await request('/api/progress', { method: 'POST', body: { id: unsafe, t: 20, d: 100 } })).status, 400);
    assert.equal((await request('/media/' + unsafe)).status, 404);
    const id = Buffer.from('Filmes/Exemplo.mp4').toString('base64url');
    assert.equal((await request('/api/progress', { method: 'POST', body: { id, t: 20, d: 100 } })).status, 200);
    assert.equal(json<LibraryResponse>(await request('/api/library')).progress[id].t, 20);
    assert.equal((await request('/api/progress', { method: 'POST', body: { id, t: 100, d: 100, done: true } })).status, 200);
    assert.equal(json<LibraryResponse>(await request('/api/library')).progress[id], undefined);
    await delay(1100);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, '.osmo-tv/progresso.json'), 'utf8')), {});
  } finally {
    if (previousRoot === undefined) delete process.env.BIBLIOTECA; else process.env.BIBLIOTECA = previousRoot;
    if (previousToken === undefined) delete process.env.TMDB_TOKEN; else process.env.TMDB_TOKEN = previousToken;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
