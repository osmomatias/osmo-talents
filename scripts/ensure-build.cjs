// Small CommonJS bootstrap: the build policy itself is maintained in ensure-build.ts.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const compiled = path.join(root, 'dist', 'scripts', 'ensure-build.js');
if (!fs.existsSync(compiled)) {
  if (process.argv.includes('--check')) process.exit(1);
  try { require.resolve('typescript/package.json', { paths: [root] }); }
  catch { throw new Error('Execute npm ci e npm run build antes de iniciar o projeto.'); }
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
}
const build = require(compiled);
module.exports = build;
if (require.main === module) {
  try {
    if (process.argv.includes('--check')) process.exitCode = build.isBuildCurrent(root) ? 0 : 1;
    else build.ensureBuild(root);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
