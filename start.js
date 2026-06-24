const { spawn } = require('child_process');
const path = require('path');

const isProd = process.env.NODE_ENV === 'production';
const backendDir = path.join(__dirname, 'backend');

if (isProd) {
  // Production: backend serves both API and frontend
  console.log('Starting server (production mode)...');
  const server = spawn('node', ['server.js'], {
    cwd: backendDir,
    stdio: 'inherit',
    shell: true
  });
  server.on('exit', (code) => process.exit(code));
} else {
  // Development: backend API + frontend dev server
  const frontendDir = path.join(__dirname, 'frontend');

  console.log('Starting backend server (port 5000)...');
  const backend = spawn('node', ['server.js'], {
    cwd: backendDir,
    stdio: 'pipe',
    shell: true
  });

  backend.stdout.on('data', (d) => process.stdout.write(`[backend] ${d}`));
  backend.stderr.on('data', (d) => process.stderr.write(`[backend] ${d}`));

  setTimeout(() => {
    console.log('\nStarting frontend server (port 5500)...');
    const frontend = spawn('node', ['frontend-server.js'], {
      cwd: backendDir,
      stdio: 'pipe',
      shell: true
    });

    frontend.stdout.on('data', (d) => process.stdout.write(`[frontend] ${d}`));
    frontend.stderr.on('data', (d) => process.stderr.write(`[frontend] ${d}`));

    console.log('\n  Frontend: http://127.0.0.1:5500');
    console.log('  Backend:  http://localhost:5000');
    console.log('  Press Ctrl+C to stop both servers\n');
  }, 2000);

  process.on('SIGINT', () => {
    backend.kill();
    process.exit();
  });
}
