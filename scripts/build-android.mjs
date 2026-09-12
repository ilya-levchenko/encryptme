import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidRoot = path.join(repositoryRoot, 'android');
const wrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

const child = spawn(wrapper, ['assembleDebug'], {
  cwd: androidRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

child.on('error', error => {
  console.error(`Unable to start the Android build: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', code => {
  process.exitCode = code ?? 1;
});
