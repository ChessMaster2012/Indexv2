const fs = require('fs');
const path = require('path');
const child = require('child_process');

const root = __dirname;
const htmlPath = path.join(root, 'public', 'index.html');
const marker = '<!-- INDEX_REWARDS_V2 -->';

try {
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(/\\n?\\s*<!-- INDEXLING_CUSTOM_V1 -->\\n?/g, '\\n');
  html = html.replace(/\\n?\\s*<script src=["']\\/indexling-custom\\.js["']><\\/script>\\n?/g, '\\n');
  html = html.replace(/\\n?\\s*<script src=["']\\/quests-avatar-pack\\.js["']><\\/script>\\n?/g, '\\n');
  if (!html.includes(marker)) {
    const patch = `\n${marker}\n<script src="/quests-avatar-pack.js"></script>\n`;
    html = html.replace('</body>', patch + '</body>');
  } else if (!html.includes('quests-avatar-pack.js')) {
    html = html.replace(marker, marker + '\n<script src="/quests-avatar-pack.js"></script>');
  }
  fs.writeFileSync(htmlPath, html, 'utf8');
} catch (err) {
  console.error('Indexling bootstrap failed:', err);
  process.exit(1);
}

require(path.join(root, 'server.js'));
