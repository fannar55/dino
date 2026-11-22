// Runs all fast unit/subsystem tests under remake/tests/ (excluding full-chapter integration suites kafli*.test.mjs).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..', '..');
const files = readdirSync(dir)
  .filter(name => name.endsWith('.test.mjs') && !/^kafli\d/.test(name))
  .sort()
  .map(name => path.join('remake', 'tests', name));

const result = spawnSync(process.execPath, ['--import', './remake/tests/setup.mjs', '--test', ...files], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
