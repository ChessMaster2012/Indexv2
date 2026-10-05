const fs = require('fs');
const path = require('path');

const root = __dirname;
const htmlPath = path.join(root, 'public', 'index.html');
const marker = '<!-- INDEX_REWARDS_V2 -->';
const questTag = '<script src="/quests-avatar-pack.js"></script>';
const battlefieldTag = '<script src="/indexling-battlefield-fix.js?v=22"></script>';
const hotfixTag = '<script src="/indexling-commander-hotfix-v20.js?v=24"></script>';
const runtimeTag = '<script src="/commander-runtime-v14.js?v=1"></script>';

try {
  let html = fs.readFileSync(htmlPath, 'utf8');

  html = html.split('<!-- INDEXLING_CUSTOM_V1 -->').join('');
  html = html.split('<script src="/indexling-custom.js"></script>').join('');
  html = html.split(questTag).join('');
  /* Remove every previously injected Commander fix version before adding the
     current one. Version bumps must not accumulate duplicate script handlers. */
  html = html.replace(/<script src="\/indexling-battlefield-fix\.js(?:\?v=[^"]*)?"><\/script>/g, '');
  html = html.replace(/<script src="\/indexling-commander-hotfix-v20\.js(?:\?v=[^"]*)?"><\/script>/g, '');
  html = html.replace(/<script src="\/commander-runtime-v13\.js(?:\?v=[^"]*)?"><\/script>/g, '');
  html = html.replace(/<script src="\/commander-runtime-v14\.js(?:\?v=[^"]*)?"><\/script>/g, '');
  html = html.split(battlefieldTag).join('');
  html = html.split(hotfixTag).join('');
  html = html.split(runtimeTag).join('');

  if (!html.includes(marker)) {
    html = html.replace('</body>', '\n' + marker + '\n' + questTag + '\n' + battlefieldTag + '\n' + hotfixTag + '\n' + runtimeTag + '\n</body>');
  } else {
    html = html.replace(marker, marker + '\n' + questTag + '\n' + battlefieldTag + '\n' + hotfixTag + '\n' + runtimeTag);
  }

  fs.writeFileSync(htmlPath, html, 'utf8');
} catch (err) {
  console.error('Indexling bootstrap failed:', err);
  process.exit(1);
}

require(path.join(root, 'server.js'));
