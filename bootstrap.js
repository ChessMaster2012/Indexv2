const fs = require('fs');
const path = require('path');

const root = __dirname;
const htmlPath = path.join(root, 'public', 'index.html');
const marker = '<!-- INDEX_REWARDS_V2 -->';
const questTag = '<script src="/quests-avatar-pack.js"></script>';
const battlefieldTag = '<script src="/indexling-battlefield-fix.js?v=7"></script>';

try {
  let html = fs.readFileSync(htmlPath, 'utf8');

  html = html.split('<!-- INDEXLING_CUSTOM_V1 -->').join('');
  html = html.split('<script src="/indexling-custom.js"></script>').join('');
  html = html.split(questTag).join('');
  html = html.split(battlefieldTag).join('');

  if (!html.includes(marker)) {
    html = html.replace('</body>', '\n' + marker + '\n' + questTag + '\n' + battlefieldTag + '\n</body>');
  } else {
    html = html.replace(marker, marker + '\n' + questTag + '\n' + battlefieldTag);
  }

  fs.writeFileSync(htmlPath, html, 'utf8');
} catch (err) {
  console.error('Indexling bootstrap failed:', err);
  process.exit(1);
}

require(path.join(root, 'server.js'));
