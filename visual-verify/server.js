// Zero-dependency fixture server for visual-editor verification.
//   node visual-verify/server.js        → http://localhost:4173
//   any path except /tracker → fixture.html (speaks the bridge protocol)
//   /tracker                 → dumb.html   (never speaks — drives the error state)
const http = require('http');
const fs = require('fs');
const path = require('path');

const fixture = fs.readFileSync(path.join(__dirname, 'fixture.html'), 'utf8');
const dumb = fs.readFileSync(path.join(__dirname, 'dumb.html'), 'utf8');

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const page = url.pathname === '/tracker' ? dumb : fixture;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
}).listen(4173, '127.0.0.1', () => console.log('fixture on http://localhost:4173'));
