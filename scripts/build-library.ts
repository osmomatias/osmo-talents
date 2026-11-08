import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PROJECT_ROOT } from '../src/paths';

// biblioteca/ is a local companion app and is excluded from production uploads.
for (const [source, config] of [
  ['biblioteca/server.mts', 'tsconfig.library-node.json'],
  ['biblioteca/client/app.ts', 'tsconfig.library.json'],
]) {
  if (!fs.existsSync(path.join(PROJECT_ROOT, source))) continue;
  const compiler = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin', 'tsc');
  execFileSync(process.execPath, [compiler, '-p', config, ...(process.argv.includes('--noEmit') ? ['--noEmit'] : [])], { cwd: PROJECT_ROOT, stdio: 'inherit' });
}
