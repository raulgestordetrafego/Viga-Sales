const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const BASE = '/Users/raulysdyxyamferreirasantos/Downloads/viga-sales';

http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  // AB Capital CRM
  if (urlPath === '/abcapital' || urlPath.startsWith('/abcapital/')) {
    const sub = urlPath.replace(/^\/abcapital\/?/, '') || 'index.html';
    const filePath = path.join(BASE, 'public', 'abcapital', sub.includes('.') ? sub : 'index.html');
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
      return;
    } catch (e) {}
  }
  // Landing page
  const file = urlPath === '/' ? '/landing.html' : urlPath;
  const filePath = path.join(BASE, file);
  try {
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(content);
  } catch (e) {
    res.writeHead(404); res.end('Not found');
  }
}).listen(PORT, () => console.log('Server running on port ' + PORT));
