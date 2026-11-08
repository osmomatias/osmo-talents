import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PROJECT_ROOT } from '../src/paths';

export interface BuildUnit {
  config: string;
  files: readonly string[];
  directories?: readonly string[];
  inputRoot: string;
  outputRoot: string;
  extraConfigs?: readonly string[];
  optionalSource?: string;
}

// Browser URLs remain stable; only their source location changes to client/.
export const buildUnits: readonly BuildUnit[] = [
  { config: 'tsconfig.node.json', files: ['server.ts', 'ecosystem.config.ts'], directories: ['src', 'scripts', 'test', 'shared'], inputRoot: '.', outputRoot: 'dist' },
  { config: 'tsconfig.app.json', files: ['client/app.ts', 'client/app-types.d.ts', 'client/globals.d.ts', 'shared/i18n.d.ts'], inputRoot: 'client', outputRoot: 'public' },
  { config: 'tsconfig.client.json', files: ['client/i18n-core.ts', 'client/i18n.ts', 'client/offline.ts', 'client/theme.ts', 'client/globals.d.ts', 'shared/i18n.d.ts'], directories: ['client/tv'], inputRoot: 'client', outputRoot: 'public' },
  { config: 'tsconfig.worker.json', files: ['client/sw.ts'], inputRoot: 'client', outputRoot: 'public' },
  { config: 'tsconfig.library.json', files: ['client/globals.d.ts', 'shared/i18n.d.ts'], directories: ['biblioteca/client'], inputRoot: 'biblioteca/client', outputRoot: 'biblioteca/public', optionalSource: 'biblioteca/client/app.ts' },
  { config: 'tsconfig.library-node.json', files: ['biblioteca/server.mts'], inputRoot: 'biblioteca', outputRoot: 'biblioteca/dist', optionalSource: 'biblioteca/server.mts' },
];

function sourceFiles(root: string, directory: string): string[] {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(root, relative) : /\.(?:[cm]?ts)$/.test(entry.name) ? [relative] : [];
  });
}

export function isBuildCurrent(root = PROJECT_ROOT, units = buildUnits): boolean {
  return units.every(unit => {
    try {
      // The companion media library is deliberately omitted from the VPS package.
      if (unit.optionalSource && !fs.existsSync(path.join(root, unit.optionalSource))) return true;
      const sources = [...new Set([...unit.files, ...(unit.directories || []).flatMap(directory => sourceFiles(root, directory))])];
      const outputs = sources.filter(file => !/\.d\.[cm]?ts$/.test(file)).map(file =>
        path.join(root, unit.outputRoot, path.relative(unit.inputRoot, file).replace(/\.mts$/, '.mjs').replace(/\.cts$/, '.cjs').replace(/\.ts$/, '.js')));
      if (!outputs.length) return false;
      const newestInput = Math.max(...[unit.config, ...(unit.extraConfigs || []), ...sources].map(file => fs.statSync(path.join(root, file)).mtimeMs));
      return outputs.every(file => fs.statSync(file).mtimeMs >= newestInput);
    } catch { return false; }
  });
}

export function ensureBuild(root = PROJECT_ROOT, units = buildUnits): void {
  const stale = units.filter(unit => !isBuildCurrent(root, [unit]));
  if (!stale.length) return;
  let compiler: string;
  try { compiler = path.join(path.dirname(require.resolve('typescript/package.json', { paths: [root] })), 'bin', 'tsc'); }
  catch { throw new Error('Os módulos TypeScript precisam ser compilados. No ambiente de desenvolvimento, execute npm ci e npm run build antes de publicar ou iniciar.'); }
  for (const unit of stale) execFileSync(process.execPath, [compiler, '-p', path.join(root, unit.config)], { cwd: root, stdio: 'inherit' });
}

if (require.main === module) {
  try {
    if (process.argv.includes('--check')) process.exitCode = isBuildCurrent() ? 0 : 1;
    else ensureBuild();
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
