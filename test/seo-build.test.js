const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { isBuildCurrent, ensureBuild } = require('../scripts/ensure-build.cjs');

test('production commands accept current compiled modules without installing a compiler or rewriting artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'osmo-build-'));
  try {
    fs.mkdirSync(path.join(root, 'src'));
    fs.mkdirSync(path.join(root, 'dist', 'seo'), { recursive: true });
    fs.mkdirSync(path.join(root, 'dist', 'router'), { recursive: true });
    const sources = ['src/seo.ts', 'src/seo-types.ts', 'src/seo-content.ts', 'src/seo-document.ts', 'tsconfig.seo.json', 'src/router.ts', 'tsconfig.router.json'];
    const outputs = ['seo.js', 'seo-content.js', 'seo-document.js'].map(name => 'dist/seo/' + name).concat('dist/router/router.js');
    for (const file of [...sources, ...outputs]) {
      fs.writeFileSync(path.join(root, file), 'fixture');
      fs.utimesSync(path.join(root, file), 100, sources.includes(file) ? 100 : 200);
    }
    assert.equal(isBuildCurrent(root), true);
    assert.doesNotThrow(() => ensureBuild(root));
    for (const file of outputs) assert.equal(fs.statSync(path.join(root, file)).mtimeMs, 200000);
    fs.utimesSync(path.join(root, 'src/seo-types.ts'), 300, 300);
    assert.equal(isBuildCurrent(root), false);
    assert.throws(() => ensureBuild(root), /npm ci e npm run build/);
    fs.utimesSync(path.join(root, 'src/seo-types.ts'), 100, 100);
    fs.utimesSync(path.join(root, 'src/router.ts'), 300, 300);
    assert.equal(isBuildCurrent(root), false);
    fs.rmSync(path.join(root, 'dist', 'seo', 'seo.js'));
    assert.equal(isBuildCurrent(root), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
