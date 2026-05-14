process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});
process.on('SIGTERM', () => {
  console.log('SIGTERM received');
});
process.on('SIGINT', () => {
  console.log('SIGINT received');
  process.exit(0);
});

const { createServer } = require('http');
const next = require('next');

const port = parseInt(process.env.PORT || '3000', 10);
const hostname = process.env.HOSTNAME || '0.0.0.0';

console.log('Starting server on', hostname + ':' + port);

const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    try {
      handle(req, res);
    } catch (err) {
      console.error('Request handler error:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  server.keepAliveTimeout = 60000;
  server.headersTimeout = 65000;
  
  server.listen(port, hostname, () => {
    console.log('> Ready on http://' + hostname + ':' + port);
  });
  
  server.on('error', (err) => {
    console.error('Server error:', err);
  });
}).catch((err) => {
  console.error('Failed to prepare Next.js:', err);
  process.exit(1);
});
