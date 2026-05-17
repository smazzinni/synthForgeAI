#!/usr/bin/env node

/**
 * SynthForge AI - Production Server Manager
 * 
 * Starts the Next.js server with automatic restart on crash.
 * Uses the efficient Rust-based server (next start) for minimal memory footprint.
 * Connection: close headers are configured in next.config.ts for stability.
 */

const { spawn } = require('child_process');
const http = require('http');

const PORT = parseInt(process.env.PORT || '3000', 10);
const MAX_RESTARTS = 50;
const RESTART_COOLDOWN = 2000;
const HEALTH_CHECK_INTERVAL = 30000;

let restartCount = 0;
let lastRestartTime = 0;
let serverProcess = null;
let isShuttingDown = false;

function startServer() {
  if (isShuttingDown) return;

  console.log('[Manager] Starting Next.js server on port ' + PORT + ' (attempt ' + (restartCount + 1) + '/' + MAX_RESTARTS + ')...');

  serverProcess = spawn('node', ['./node_modules/.bin/next', 'start', '-p', PORT.toString()], {
    cwd: __dirname,
    env: {
      ...process.env,
      NODE_OPTIONS: '--max-old-space-size=8192',
    },
    stdio: 'inherit',
  });

  serverProcess.on('error', (err) => {
    console.error('[Manager] Failed to start server:', err.message);
  });

  serverProcess.on('exit', (code, signal) => {
    if (isShuttingDown) return;
    serverProcess = null;

    console.log('[Manager] Server exited with code=' + code + ' signal=' + signal);

    const now = Date.now();
    if (now - lastRestartTime < 30000) {
      restartCount++;
    } else {
      // Reset counter if server ran for more than 30 seconds
      restartCount = 1;
    }
    lastRestartTime = now;

    if (restartCount >= MAX_RESTARTS) {
      console.error('[Manager] Max restarts reached. Exiting.');
      process.exit(1);
    }

    console.log('[Manager] Restarting in ' + RESTART_COOLDOWN + 'ms...');
    setTimeout(() => {
      startServer();
    }, RESTART_COOLDOWN);
  });
}

function healthCheck() {
  const req = http.request({
    hostname: 'localhost',
    port: PORT,
    path: '/api/health',
    method: 'GET',
    timeout: 5000,
    headers: { 'Connection': 'close' },
  }, (res) => {
    res.resume();
    if (res.statusCode !== 200) {
      console.warn('[Manager] Health check returned ' + res.statusCode);
    }
  });

  req.on('error', (err) => {
    console.warn('[Manager] Health check failed: ' + err.message);
  });

  req.on('timeout', () => {
    req.destroy();
  });

  req.end();
}

function gracefulShutdown(signal) {
  console.log('[Manager] Received ' + signal + '. Shutting down...');
  isShuttingDown = true;

  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    setTimeout(() => {
      if (serverProcess) serverProcess.kill('SIGKILL');
      process.exit(0);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[Manager] Unhandled Rejection:', String(reason).slice(0, 200));
});

process.on('uncaughtException', (error) => {
  console.error('[Manager] Uncaught Exception:', error?.message || String(error).slice(0, 200));
  if (error?.code === 'EADDRINUSE') {
    process.exit(1);
  }
});

// Start
startServer();
setInterval(healthCheck, HEALTH_CHECK_INTERVAL);

console.log('[Manager] SynthForge AI server manager running on port ' + PORT);
