// Runs the admin dev server with NEXT_PUBLIC_STOREFRONT_ORIGIN pinned to
// the local fixture, regardless of any .env files in the repo.
const { spawn } = require('child_process');
const path = require('path');

const child = spawn('npm', ['run', 'dev', '--', '-p', '3100'], {
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    NEXT_PUBLIC_STOREFRONT_ORIGIN: 'http://localhost:4173',
  },
  stdio: 'inherit',
  shell: true,
});
child.on('exit', (code) => process.exit(code ?? 0));
