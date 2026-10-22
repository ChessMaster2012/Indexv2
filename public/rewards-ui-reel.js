/* Rewards UI part 3: horizontal arrow-pointer reel for pack + skin-crate opening, and Auto Open.
 * Replaces only the *animation layer*. Economics are identical to the originals:
 * same cost / free-token spending, same rollPack(), same duplicate refund, same saves. */
(function () {
  'use strict';
  var FX = window.__rwFx;
  if (window.__rwUi3 || !FX || typeof window.openRewardPack !== 'function') return;
  window.__rwUi3 = true;
  var E = FX.E, art = FX.art;
  window.__rwAutoOn = false;
  var autoTimer = null;
  function later(fn, ms) { return setTimeout(fn, ms); }   /* animation steps: never cancelled, so a reveal can't be skipped */
  function clearTimers() { clearTimeout(autoTimer); autoTimer = null; }  /* only the pending 'open next pack' timer */

  /* ---------- auto toggle ---------- */
  function syncAuto() {
    [].forEach.call(document.querySelectorAll('[data-rw-auto]'), function (b) {
      b.classList.toggle('on', !!window.__rwAutoOn);
      var sp = b.querySelector('span'); if (sp) sp.textContent = 'Auto open: ' + (window.__rwAutoOn ? 'ON' : 'OFF');
      b.setAttribute('aria-pressed', window.__rwAutoOn ? 'true' : 'false');
    });
  }
  function setAuto(on, msg) {
    window.__rwAutoOn = !!on; syncAuto();
    var n = document.querySelector('#pack-modal .rw-auto-note'); if (n) n.textContent = msg || (on ? 'Next pack opens automatically.' : '');
    if (!on) { clearTimers(); }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-rw-auto]'); if (!b) return;
    e.preventDefault();
    var on = !window.__rwAutoOn;
    setAuto(on, on ? 'Next pack opens automatically.' : 'Auto open off.');
    /* turned off while the "next pack" countdown was pending -> cancelled by clearTimers; show Continue state */
  });

  /* ---------- horizontal reel ---------- */
  function ensureReel(card, anchorSel) {
    var r = card.querySelector('.rw-hreel');
    if (!r) {
      r = document.createElement('div'); r.className = 'rw-hreel';
      r.innerHTML = '<div class="rw-arrow" aria-hidden="true"><svg viewBox="0 0 40 46"><path d="M20 44 3 14A20 20 0 0 1 37 14Z" fill="#ffd24a" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><circle cx="20" cy="14" r="5" fill="#8a4a00"/></svg></div><div class="rw-aline"></div><div class="rw-hwin"><div class="rw-htrack"></div></div>';
      var anchor = card.querySelector(anchorSel); if (anchor) anchor.parentNode.insertBefore(r, anchor); else card.appendChild(r);
    }
    return r;
  }
  function spin(reel, selIndex, ms, done) {
    var win = reel.querySelector('.rw-hwin'), track = reel.querySelector('.rw-htrack');
    track.style.transition = 'none'; track.style.transform = 'translateX(0)'; void track.offsetWidth;
    var items = [].slice.call(track.children), el = items[selIndex];
    var wr = win.getBoundingClientRect(), er = el.getBoundingClientRect();
    var jitter = (Math.random() - .5) * er.width * .5;
    var off = Math.round((wr.left + wr.width / 2) - (er.left + er.width / 2) + jitter);
    items.forEach(function (i) { i.classList.remove('won', 'lose'); });
    var ticks = 0, tk = setInterval(function () { ticks++; try { playPackTick(); } catch (e) { } if (ticks > ms / 75) clearInterval(tk); }, 75);
    track.style.transition = 'transform ' + (ms / 1000) + 's cubic-bezier(.08,.72,.12,1)';
    track.style.transform = 'translateX(' + off + 'px)';
    later(function () {
      clearInterval(tk);
      items.forEach(function (i, k) { i.classList.add(k === selIndex ? 'won' : 'lose'); });
      done();
    }, ms + 80);
  }

  /* ---------- packs ---------- */
  function canAfford(kind) {
    var cfg = packConfig(kind);
    return (Number(state.progress.freePackTokens) || 0) > 0 || (state.progress.coins || 0) >= cfg.cost;
  }
  window.openRewardPack = function (kind) {
    kind = kind || 'study';
    var cfg = packConfig(kind);
    if (state.rewardPackOpening) return;
    var modal = document.getElementById('pack-modal'), opening = modal && modal.querySelector('.pack-opening'), result = document.getElementById('pack-result');
    if (!modal || !opening || !result) { showRewardToast('The pack opener could not load. Please refresh the page before spending coins.'); return; }
    var freeToken = Math.max(0, Number(state.progress.freePackTokens) || 0);
    if (freeToken <= 0 && (state.progress.coins || 0) < cfg.cost) {
      setAuto(false);
      alert('You need ' + cfg.cost + ' coins to open the ' + cfg.name + ', or a free pack token. Complete quests for free packs.');
      return;
    }
    ensureRewardUnlocks();
    clearTimers();
    state.rewardPackOpening = true;
    if (freeToken > 0) state.progress.freePackTokens = freeToken - 1; else state.progress.coins -= cfg.cost;
    var reward = rollPack(kind);
    var duplicate = state.progress.unlockedCosmetics.includes(reward.id);
    if (!duplicate) state.progress.unlockedCosmetics.push(reward.id);
    state.progress.openedPacks = (state.progress.openedPacks || 0) + 1;
    persistProgress(); updateCoinDisplays(); renderRewards();

    var card = FX.dressPackModal(kind);
    var hero = card.querySelector('.pack-box-hero'); if (hero) hero.classList.add('rw-calm');
    var reel = ensureReel(card, '.reel-window');
    var bar = card.querySelector('.rw-autobar');
    if (!bar) {
      bar = document.createElement('div'); bar.className = 'rw-autobar';
      bar.innerHTML = '<button type="button" class="rw-auto" data-rw-auto><i></i><span>Auto open: OFF</span></button><span class="rw-auto-note"></span>';
      card.appendChild(bar);
    }
    syncAuto();
    var items = buildReelItems(reward, kind);
    reel.querySelector('.rw-htrack').innerHTML = items.map(function (c) {
      return '<div class="rw-hitem r-' + String(c.rarity).toLowerCase() + '"><div class="rw-hart">' + art(c) + '</div><div class="rw-hname">' + E(c.name) + '</div><div class="rw-hrar">' + E(c.rarity) + '</div></div>';
    }).join('');
    result.innerHTML = '<div class="pack-opening-note" style="font-size:12px;color:#d6d1ff;padding-top:8px;">Opening ' + E(cfg.name) + '…</div>';
    modal.classList.remove('hidden'); opening.classList.add('is-opening');

    var fast = !!window.__rwAutoOn;
    spin(reel, 9, fast ? 3600 : 5200, function () {
      opening.classList.remove('is-opening');
      later(function () {
        try { playPackReveal(); celebrate(); } catch (e) { }
        var used = freeToken > 0;
        var bonus = !used && duplicate ? Math.min(60, Math.floor(cfg.cost * .4)) : 0;
        if (duplicate && bonus) { state.progress.coins += bonus; persistProgress(); updateCoinDisplays(); }
        result.innerHTML = '<div class="pack-result reveal"><div class="result-rarity">' + E(reward.rarity) + (duplicate ? ' · Duplicate' : '') + '</div>' +
          '<div class="result-name">' + art(reward) + ' <span>' + E(reward.name) + '</span></div>' +
          '<div class="result-note">' + (duplicate ? (used ? 'You already own this cosmetic. Your free pack token was used.' : 'You already own this cosmetic, so ' + bonus + ' coins were returned.') : 'New cosmetic unlocked and added to your inventory.') + '</div>' +
          '<div style="margin-top:12px"><button class="btn btn-primary" data-action="close-pack-modal">Continue</button></div></div>';
        state.rewardPackOpening = false;
        FX.reveal(card, String(reward.rarity || 'common').toLowerCase());
        syncAuto();
        renderRewards();
        if (window.__rwAutoOn) {
          var hold = reward.rarity === 'Legendary' ? 4200 : 1900, note = card.querySelector('.rw-auto-note');
          if (note) note.textContent = canAfford(kind) ? 'Next pack opening in a moment — press Auto open to stop.' : 'Last pack you can afford.';
          autoTimer = later(function () {
            if (!window.__rwAutoOn || modal.classList.contains('hidden') || state.rewardPackOpening) return;
            if (!canAfford(kind)) { setAuto(false, 'Auto open stopped: not enough coins or tokens.'); return; }
            card.classList.remove('rw-revealed');
            window.openRewardPack(kind);
          }, hold);
        }
      }, 450);
    });
  };
  var _close = window.closePackModal;
  window.closePackModal = function () { setAuto(false); clearTimers(); return _close.apply(this, arguments); };

  /* ---------- skin crates ---------- */
  var _sopen = window.openSkinCrate;
  window.openSkinCrate = function () {
    if (!state.account) { promptAccountForPersistentView('rewards'); return; }
    ensureRewardUnlocks();
    if (state.skinCrateOpening) return;
    if ((state.progress.skinCrates || 0) <= 0) { showRewardToast('You do not have a Skin Crate yet.'); return; }
    var modal = ensureSkinCrateModal(), card = modal.querySelector('.skin-crate-card'), result = modal.querySelector('#skin-crate-result');
    var winner = rollSkinPair(), wasOwned = skinPairOwned(winner.indexling.id, winner.skin.id);
    state.skinCrateOpening = true;
    state.progress.skinCrates = Math.max(0, (state.progress.skinCrates || 0) - 1);
    var record = skinRecord(winner.indexling.id, winner.skin.id);
    normalizeOwnedSkinInventory();
    if (!wasOwned) state.progress.unlockedSkins.push(record);
    persistProgress(); persistProgressLocalOnly();
    modal.classList.add('rw-cine'); card.classList.remove('rw-revealed');
    ['common', 'rare', 'epic', 'legendary'].forEach(function (x) { card.classList.remove('rw-rev-' + x); });
    var reel = ensureReel(card, '.skin-reel-window');
    reel.querySelector('.rw-htrack').innerHTML = buildSkinReelItems(winner).map(function (it) {
      return '<div class="rw-hitem r-' + (it.skin.rarity === 'Epic' ? 'epic' : it.skin.rarity === 'Rare' ? 'rare' : 'common') + '"><div class="rw-hart">' + indexlingArtHtml(it.indexling, true, it.skin) + '</div><div class="rw-hname">' + E(it.indexling.name) + '</div><div class="rw-hrar">' + it.skin.icon + ' ' + E(it.skin.name) + '</div></div>';
    }).join('');
    result.innerHTML = '<div class="reward-muted">Rolling for your Indexling + skin…</div>';
    modal.classList.remove('hidden');
    spin(reel, 9, 5200, function () {
      later(function () {
        state.skinCrateOpening = false;
        try { playPackReveal(); celebrate(); } catch (e) { }
        result.innerHTML = '<div class="rw-skin-hero"><div class="rw-skin-hero-art">' + indexlingArtHtml(winner.indexling, false, winner.skin) + '</div><span class="rw-skin-hero-ic">' + winner.skin.icon + '</span></div><div class="skin-crate-result-name">' + winner.skin.icon + ' ' + E(winner.skin.name) + '</div><div class="skin-crate-result-meta">Rolled for <strong>' + E(winner.indexling.name) + '</strong> · ' + E(winner.skin.rarity) + '</div><div class="skin-crate-result-meta">' + (wasOwned ? 'Already owned this Indexling + skin pair.' : 'Added to your skin collection.') + '</div><div class="skin-crate-actions"><button class="btn btn-primary" data-action="equip-indexling-skin" data-indexling="' + winner.indexling.id + '" data-skin="' + winner.skin.id + '">Equip Skin</button><button class="btn btn-ghost" data-action="close-skin-crate">Keep in Inventory</button></div>';
        var r = String(winner.skin.rarity || 'Common').toLowerCase();
        FX.reveal(card, r === 'epic' ? 'legendary' : r);
        renderRewards();
      }, 450);
    });
  };
})();
