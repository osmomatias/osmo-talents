import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { PROJECT_ROOT } from '../src/paths';

// Compile changed sources first; Node watches the resulting backend modules.
const compiler = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin', 'tsc');
const children: ChildProcess[] = [];
let stopping = false;
function stop(code = 0): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
function run(args: string[]): void {
  const child = spawn(process.execPath, args, { cwd: PROJECT_ROOT, env: process.env, stdio: 'inherit' });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 1); });
}
const configs = ['tsconfig.node.json', 'tsconfig.app.json', 'tsconfig.client.json', 'tsconfig.worker.json'];
if (fs.existsSync(path.join(PROJECT_ROOT, 'biblioteca/server.mts'))) configs.push('tsconfig.library-node.json');
if (fs.existsSync(path.join(PROJECT_ROOT, 'biblioteca/client/app.ts'))) configs.push('tsconfig.library.json');
for (const config of configs) {
  run([compiler, '-p', config, '--watch', '--preserveWatchOutput']);
}
// predev already verified the first build; compiler watchers own subsequent updates.
run(['--watch', '--watch-preserve-output', '--disable-warning=ExperimentalWarning', '--env-file-if-exists=.env', 'dist/server.js']);
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
