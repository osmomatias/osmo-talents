import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { isBuildCurrent, ensureBuild, type BuildUnit } from '../scripts/ensure-build';
import { PROJECT_ROOT } from '../src/paths';

const units: BuildUnit[] = [
  { config: 'tsconfig.node.json', files: ['server.ts'], directories: ['src', 'shared'], inputRoot: '.', outputRoot: 'dist' },
  { config: 'tsconfig.client.json', files: ['client/app.ts', 'client/globals.d.ts'], inputRoot: 'client', outputRoot: 'public' },
  { config: 'tsconfig.worker.json', files: ['client/sw.ts'], inputRoot: 'client', outputRoot: 'public' },
];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'osmo-build-'));
  const sources = ['server.ts', 'src/db.ts', 'shared/i18n.d.ts', 'client/app.ts', 'client/globals.d.ts', 'client/sw.ts', ...units.map(unit => unit.config)];
  const outputs = ['dist/server.js', 'dist/src/db.js', 'public/app.js', 'public/sw.js'];
  for (const file of [...sources, ...outputs]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), 'fixture');
    fs.utimesSync(path.join(root, file), 100, outputs.includes(file) ? 200 : 100);
  }
  return { root, sources, outputs };
}

test('current production artifacts are accepted without a compiler or rewrites', () => {
  const { root, outputs } = fixture();
  try {
    assert.equal(isBuildCurrent(root, units), true);
    assert.doesNotThrow(() => ensureBuild(root, units));
    for (const file of outputs) assert.equal(fs.statSync(path.join(root, file)).mtimeMs, 200000);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('build freshness detects backend, shared declarations, browser, worker and missing artifacts', () => {
  const { root } = fixture();
  try {
    for (const file of ['src/db.ts', 'shared/i18n.d.ts', 'client/app.ts', 'client/globals.d.ts', 'client/sw.ts', 'tsconfig.node.json']) {
      fs.utimesSync(path.join(root, file), 300, 300);
      assert.equal(isBuildCurrent(root, units), false, file);
      assert.throws(() => ensureBuild(root, units), /npm ci e npm run build/);
      fs.utimesSync(path.join(root, file), 100, 100);
      assert.equal(isBuildCurrent(root, units), true, file);
    }
    fs.rmSync(path.join(root, 'public/sw.js'));
    assert.equal(isBuildCurrent(root, units), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a published package starts through the legacy entry point without node_modules', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'osmo-release-'));
  try {
    const directories = ['dist', 'src', 'client', 'shared', 'scripts', 'test'];
    const files = ['server.js', 'server.ts', 'ecosystem.config.ts', 'package.json', 'tsconfig.node.json', 'tsconfig.app.json', 'tsconfig.client.json', 'tsconfig.worker.json'];
    for (const file of [...directories, ...files]) fs.cpSync(path.join(PROJECT_ROOT, file), path.join(root, file), { recursive: true, preserveTimestamps: true });
    fs.mkdirSync(path.join(root, 'public'), { recursive: true });
    for (const file of ['taxonomia.json', 'i18n-core.js', 'i18n.js', 'offline.js', 'theme.js', 'app.js', 'sw.js', 'tv/tv.js', 'tv/remote-tv.js', 'tv/controle.js']) {
      fs.cpSync(path.join(PROJECT_ROOT, 'public', file), path.join(root, 'public', file), { recursive: true, preserveTimestamps: true });
    }
    assert.equal(fs.existsSync(path.join(root, 'node_modules')), false);
    const env = { ...process.env, DB_PATH: path.join(root, 'fixture.sqlite'), ASAAS_API_KEY: '', MAIL_HOST: '', WEB_PUSH_PRIVATE_KEY: '', PUSH_PRIVATE_KEY: '', GOOGLE_CLIENT_ID: '', ADOBE_CLIENT_ID: '', GITHUB_CLIENT_ID: '', MICROSOFT_CLIENT_ID: '' };
    const check = spawnSync(process.execPath, ['scripts/ensure-build.cjs', '--check'], { cwd: root, env, encoding: 'utf8' });
    assert.equal(check.status, 0, check.stderr);
    const startup = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '-e', 'const app = require("./server.js"); if (typeof app.start !== "function" || typeof app.server.emit !== "function") process.exit(2); require("./dist/src/db.js").db.close(); console.log("READY");'], { cwd: root, env, encoding: 'utf8' });
    assert.equal(startup.status, 0, startup.stderr);
    assert.match(startup.stdout, /READY/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
