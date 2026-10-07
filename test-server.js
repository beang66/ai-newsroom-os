// scratch/test-server.js
const { spawn } = require('child_process');
const http = require('http');

const server = spawn('node', ['server/index.js'], { stdio: 'inherit' });

setTimeout(() => {
  http.get('http://localhost:4000/api/health', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Health check status:', res.statusCode);
      console.log('Health check response:', data);
      server.kill();
      process.exit(0);
    });
  }).on('error', (err) => {
    console.error('Health check failed:', err.message);
    server.kill();
    process.exit(1);
  });
}, 2000);
