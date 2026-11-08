// Use shipped JavaScript in production; rebuild changed TypeScript modules in development.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const buildUnits = [
  { config: 'tsconfig.seo.json', sources: /^seo.*\.ts$/, directory: 'seo', outputs: ['seo.js', 'seo-content.js', 'seo-document.js'] },
  { config: 'tsconfig.router.json', sources: /^router\.ts$/, directory: 'router', outputs: ['router.js'], extraConfigs: ['tsconfig.seo.json'] },
];
function isBuildCurrent(root, units = buildUnits) {
  return units.every(unit => {
    try {
      const outputs = unit.outputs.map(name => fs.statSync(path.join(root, 'dist', unit.directory, name)).mtimeMs);
      const sources = fs.readdirSync(path.join(root, 'src')).filter(name => unit.sources.test(name)).map(name => fs.statSync(path.join(root, 'src', name)).mtimeMs);
      for (const config of [unit.config, ...(unit.extraConfigs || [])]) sources.push(fs.statSync(path.join(root, config)).mtimeMs);
      return Math.min(...outputs) >= Math.max(...sources);
    } catch { return false; }
  });
}
function ensureBuild(root = path.resolve(__dirname, '..'), units = buildUnits) {
  const stale = units.filter(unit => !isBuildCurrent(root, [unit]));
  if (!stale.length) return;
  let compiler;
  try { compiler = path.join(path.dirname(require.resolve('typescript/package.json', { paths: [root] })), 'bin', 'tsc'); }
  catch { throw new Error('Os módulos TypeScript precisam ser compilados. No ambiente de desenvolvimento, execute npm ci e npm run build antes de publicar ou iniciar.'); }
  for (const unit of stale) execFileSync(process.execPath, [compiler, '-p', path.join(root, unit.config)], { cwd: root, stdio: 'inherit' });
}
if (require.main === module) {
  try {
    if (process.argv.includes('--check')) process.exitCode = isBuildCurrent(path.resolve(__dirname, '..')) ? 0 : 1;
    else ensureBuild();
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildUnits, isBuildCurrent, ensureBuild };
