import { spawn } from 'child_process';

function startServer() {
  console.log(`[Launcher] Starting server at ${new Date().toISOString()}...`);
  
  const server = spawn('node', [
    '--max-old-space-size=4096',
    '/home/z/my-project/node_modules/.bin/next',
    'start',
    '-p', '3000'
  ], {
    cwd: '/home/z/my-project',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production' },
  });

  server.stdout.on('data', (data) => {
    process.stdout.write(data);
  });

  server.stderr.on('data', (data) => {
    process.stderr.write(data);
  });

  server.on('exit', (code, signal) => {
    console.log(`[Launcher] Server exited at ${new Date().toISOString()} with code=${code} signal=${signal}`);
    // Always restart
    console.log('[Launcher] Restarting in 3s...');
    setTimeout(startServer, 3000);
  });

  server.on('error', (err) => {
    console.error('[Launcher] Server spawn error:', err);
    setTimeout(startServer, 5000);
  });

  return server;
}

const server = startServer();

// Keep the launcher alive
process.on('SIGTERM', () => { server.kill('SIGTERM'); process.exit(0); });
process.on('SIGINT', () => { server.kill('SIGINT'); process.exit(0); });
