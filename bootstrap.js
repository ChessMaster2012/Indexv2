const fs = require('fs');
const path = require('path');
const child = require('child_process');

const root = __dirname;
const htmlPath = path.join(root, 'public', 'index.html');
const patchPath = path.join(root, 'public', 'indexling-custom.js');
const marker = '<!-- INDEXLING_CUSTOM_V1 -->';

try {
  let html = fs.readFileSync(htmlPath, 'utf8');
  if (!html.includes(marker)) {
    const patch = '\n' + marker + '\n<script src="/indexling-custom.js"></script>\n';
    html = html.replace('</body>', patch + '</body>');
    fs.writeFileSync(htmlPath, html, 'utf8');
  }
} catch (err) {
  console.error('Indexling bootstrap failed:', err);
  process.exit(1);
}

require(path.join(root, 'server.js'));
