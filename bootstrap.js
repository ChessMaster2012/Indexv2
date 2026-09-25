const fs = require('fs');
const path = require('path');
const child = require('child_process');

const root = __dirname;
const htmlPath = path.join(root, 'public', 'index.html');
const marker = '<!-- INDEX_REWARDS_V2 -->';

try {
  let html = fs.readFileSync(htmlPath, 'utf8');
  const legacyTag = '<script src="/indexling-custom.js"></script>';
  const questTag = '<script src="/quests-avatar-pack.js"></script>';
  html = html.split('<!-- INDEXLING_CUSTOM_V1 -->').join('');
  html = html.split(legacyTag).join('');
  html = html.split(questTag).join('');
  if (!html.includes(marker)) {
    const patch = `\n${marker}\n${questTag}\n`;
    html = html.replace('</body>', patch + '</body>');
  } else if (!html.includes(questTag)) {
    html = html.replace(marker, marker + `\n${questTag}`);
  }
  fs.writeFileSync(htmlPath, html, 'utf8');
} catch (err) {
  console.error('Indexling bootstrap failed:', err);
  process.exit(1);
}

require(path.join(root, 'server.js'));
