const { createServer } = require('http');
const { URL } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

console.log(`[Server] Starting on port ${port}...`);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ─── Connection tracking ───────────────────────────────────────
let activeConnections = 0;
let totalRequests = 0;

// ─── Global error handlers ─────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Rejection:', String(reason).slice(0, 300));
});

process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught Exception:', error?.message || String(error).slice(0, 300));
  if (error?.code === 'EADDRINUSE' || error?.code === 'ENOMEM') {
    process.exit(1);
  }
});

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    totalRequests++;
    activeConnections++;
    const reqId = totalRequests;
    const startTime = Date.now();
    
    // Force Connection: close to prevent keep-alive resource leaks
    res.setHeader('Connection', 'close');
    
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      
      await handle(req, res, {
        pathname: parsedUrl.pathname,
        query: Object.fromEntries(parsedUrl.searchParams),
      });
    } catch (err) {
      console.error(`[Server] Error on request ${reqId} (${req.url}):`, err?.message || String(err).slice(0, 300));
      if (!res.headersSent && !res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    } finally {
      activeConnections--;
      const duration = Date.now() - startTime;
      if (duration > 5000) {
        console.log(`[Server] Slow request ${reqId}: ${req.url} took ${duration}ms`);
      }
    }
  });

  // Server timeouts
  server.timeout = 120000;
  server.keepAliveTimeout = 1000; // Close keep-alive connections quickly
  server.headersTimeout = 65000;
  server.requestTimeout = 120000;
  server.maxConnections = 100;

  server.on('error', (err) => {
    console.error('[Server] HTTP error:', err?.message);
  });

  server.on('clientError', (err, socket) => {
    if (socket.writable) {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    }
  });

  server.listen(port, hostname, () => {
    console.log(`[Server] Ready on http://${hostname}:${port}`);
  });

  // Periodic health log
  setInterval(() => {
    const mem = process.memoryUsage();
    console.log(`[Server] Stats: ${activeConnections} active, ${totalRequests} total, RSS=${Math.round(mem.rss/1024/1024)}MB, Heap=${Math.round(mem.heapUsed/1024/1024)}/${Math.round(mem.heapTotal/1024/1024)}MB`);
  }, 60000).unref();
}).catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});
