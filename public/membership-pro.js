/* Membership page + first-sign-up plan picker, driven by MembershipCore (the same table the server enforces). */
(function () {
  var MC = window.MembershipCore; if (!MC) return;
  function E(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function N(v) { return typeof v === 'number' ? v.toLocaleString() : E(v); }
  function cur() { try { return state.membership || { tier: 'free' }; } catch (e) { return { tier: 'free' }; } }
  function chatCount() { try { var a = JSON.parse(localStorage.getItem('index-tutor-chats') || '[]'); return Array.isArray(a) ? a.length : 0; } catch (e) { return 0; } }
  function use(label, n, max) {
    var pct = max ? Math.min(100, Math.round(n / max * 100)) : 0;
    return '<div class="mp-use"><div class="mp-use-l"><span>' + label + '</span><b>' + N(n) + ' / ' + N(max) + '</b></div><div class="mp-bar"><i style="width:' + Math.max(2, pct) + '%"></i></div></div>';
  }
  function cardsHtml(current, context) {
    var tier = (current && current.tier === '') ? '' : (current && current.tier || 'free');
    return '<div class="mp-grid">' + MC.ORDER.map(function (k) {
      var t = MC.TIERS[k], active = tier === k, paid = k !== 'free', pick = context === 'onboarding';
      var btn;
      if (pick) btn = '<span class="mp-pick">' + (k === 'free' ? 'Select Basic' : 'Select ' + t.name) + '</span>';
      else if (active) btn = paid ? '<button class="btn btn-ghost membership-action" data-action="manage-membership">Manage billing</button>' : '<button class="btn btn-ghost membership-action" disabled>Your current plan</button>';
      else if (paid) btn = '<button class="btn ' + (k === 'diamond' ? 'btn-primary' : 'btn-ghost') + ' membership-action" data-action="start-membership-checkout" data-tier="' + k + '">' + (tier === 'free' ? 'Choose ' : 'Switch to ') + t.name + '</button>';
      else btn = '<button class="btn btn-ghost membership-action" disabled>Included with every account</button>';
      var prev = MC.TIERS[MC.ORDER[MC.ORDER.indexOf(k) - 1]];
      var feats = ['<b>' + N(t.credits) + '</b> AI credits every 6 hours' + (prev && prev.credits ? ' <em class="mp-x">(' + (t.credits / prev.credits).toFixed(1).replace('.0', '') + 'x ' + prev.name + ')</em>' : ''), '<b>' + N(t.sets) + '</b> saved study sets · <b>' + N(t.notes) + '</b> notes', '<b>' + N(t.chats) + '</b> saved Tutor chats', 'x' + t.rollMult + ' daily credit roll'];
      var perks = (t.perks || []).map(function (x) { return '<li class="mp-perk"><i>★</i><span>' + x + '</span></li>'; }).join('');
      var per = t.priceCents ? Math.round(t.priceCents / 30) + '¢ a day' : '';
      var lead = paid ? '<div class="mp-lead">' + (prev && prev.priceCents ? 'Everything in ' + prev.name + ', plus:' : 'Everything in Basic, plus:') + '</div>' : '';
      var ribbon = k === 'diamond' ? '<div class="mp-ribbon">BEST VALUE</div>' : k === 'platinum' ? '<div class="mp-ribbon mp-ribbon-pop">MOST POPULAR</div>' : '';
      return '<article class="mp-card mp-' + k + (active ? ' mp-active' : '') + '" data-tier="' + k + '" ' + (pick ? 'tabindex="0" role="radio" aria-checked="false"' : '') + '>' + ribbon +
        '<div class="mp-top"><span class="mp-tag">' + t.tag + '</span>' + (active ? '<span class="mp-cur">✓ Current</span>' : '') + '</div>' +
        '<div class="mp-head"><div class="mp-ic">' + t.icon + '</div><div><h3>' + t.name + '</h3><p>' + t.copy + '</p></div></div>' +
        '<div class="mp-price">' + MC.price(t) + '<span>/month</span></div>' + (per ? '<div class="mp-per">only ' + per + ' · no auto-renew</div>' : '<div class="mp-per">free forever</div>') +
        (paid ? '<ul class="mp-feat mp-perks">' + perks + '</ul>' : '') + lead +
        '<ul class="mp-feat">' + feats.map(function (f) { return '<li><i>✓</i><span>' + f + '</span></li>'; }).join('') + (paid ? '' : '<li class="mp-dim"><i>✕</i><span>No free weekly Lucky Spins</span></li><li class="mp-dim"><i>✕</i><span>Grades need your password every time</span></li><li class="mp-dim"><i>✕</i><span>No leaderboard badge</span></li>') + '</ul>' + btn + '</article>';
    }).join('') + '</div>';
  }
  function tableHtml(tier) {
    var head = '<tr><th></th>' + MC.ORDER.map(function (k) { var t = MC.TIERS[k]; return '<th class="mp-c-' + k + (tier === k ? ' mp-here' : '') + '"><span>' + t.icon + '</span>' + t.name + '<small>' + MC.price(t) + '/mo</small></th>'; }).join('') + '</tr>';
    var body = MC.ROWS.map(function (g) {
      return '<tr class="mp-grp"><td colspan="5">' + g.group + '</td></tr>' + g.items.map(function (it) {
        return '<tr><td class="mp-lab"><b>' + it.label + '</b><small>' + it.hint + '</small></td>' + MC.ORDER.map(function (k) { return '<td class="' + (tier === k ? 'mp-here' : '') + '">' + N(it.v(MC.TIERS[k])) + '</td>'; }).join('') + '</tr>';
      }).join('');
    }).join('');
    return '<div class="mp-tablewrap"><table class="mp-table">' + head + body + '</table></div>';
  }
  window.membershipPlanCardsHtml = cardsHtml;

  window.renderMembershipPage = function () {
    var root = document.getElementById('membership-stage'); if (!root) return;
    var c = cur(), k = MC.TIERS[c.tier] ? c.tier : 'free', t = MC.TIERS[k], paid = k !== 'free', days = 0;
    try { days = paid ? membershipDaysLeftLocal() : 0; } catch (e) { }
    var ends = ''; try { if (paid && Number(c.currentPeriodEnd)) ends = days + ' day' + (days === 1 ? '' : 's') + ' left · ends ' + E(membershipEndDate(c.currentPeriodEnd)) + ' · auto-renewal is off'; } catch (e) { }
    var sets = 0, notes = 0; try { sets = (state.studySets || []).length; notes = (state.notes || []).length; } catch (e) { }
    var next = MC.ORDER[MC.ORDER.indexOf(k) + 1], nt = next && MC.TIERS[next];
    root.innerHTML = '<div class="mp-page">' +
      '<section class="mp-hero mp-h-' + k + '"><div><div class="mp-eyebrow">INDEX MEMBERSHIP</div><h2>' + (paid ? 'You\'re on ' + t.name + ' ' + t.icon : 'Study smarter. Unlock the good stuff.') + '</h2>' +
      '<p>' + (paid ? 'Thanks for supporting Index. Here is what your plan includes and how much of it you are using.' : 'Basic is great for getting started. Members get automatic grades, free Lucky Spins every week, up to 6x the AI power, a library 20x bigger, and a badge that shows up on every leaderboard. From about 17¢ a day, and it never renews on its own.') + '</p></div>' +
      '<div class="mp-now"><div class="mp-now-k">Current plan</div><div class="mp-now-n">' + t.icon + ' ' + t.name + '</div>' + (ends ? '<div class="mp-now-s">' + ends + '</div>' : '') +
      '<div class="mp-now-b"><button class="btn btn-ghost btn-sm" data-action="' + (paid ? 'manage-membership' : 'refresh-membership') + '">' + (paid ? 'Billing' : 'Refresh status') + '</button></div></div></section>' +
      '<section class="mp-usage"><h3>Your plan at a glance</h3><div class="mp-usegrid">' + use('Saved study sets', sets, t.sets) + use('Saved notes', notes, t.notes) + use('Saved Tutor chats', chatCount(), t.chats) +
      '<div class="mp-use"><div class="mp-use-l"><span>AI credits</span><b>' + N(t.credits) + ' every 6 hours</b></div><div class="mp-sub">Daily roll boost x' + t.rollMult + ' · bank up to ' + N(t.bonusCap) + ' bonus credits</div></div></div>' +
      (nt ? '<div class="mp-upsell"><div><b>Next up: ' + nt.icon + ' ' + nt.name + '</b> for ' + MC.price(nt) + '/month. You would get <b>' + N(nt.credits) + '</b> AI credits per window, <b>' + N(nt.sets) + '</b> study sets, <b>' + N(nt.chats) + '</b> Tutor chats, plus:</div><ul>' + (nt.perks || []).map(function (x) { return '<li>★ ' + x + '</li>'; }).join('') + '</ul>' + (k === 'free' ? '' : '') + '<button class="btn btn-primary btn-sm" data-action="start-membership-checkout" data-tier="' + next + '">Get ' + nt.name + '</button></div>' : '<div class="mp-upsell">You have the highest plan. Thank you!</div>') + '</section>' +
      '<h3 class="mp-h3">Choose a plan</h3>' + cardsHtml(c, 'page') +
      '<h3 class="mp-h3">Compare every benefit</h3>' + tableHtml(k) +
      '<section class="mp-faq"><h3>Good to know</h3>' +
      [['Does it renew automatically?', 'No. Paid plans run for the current monthly period and end on their own. Nothing renews unless you choose again.'], ['Where is payment handled?', 'On Stripe\'s secure hosted checkout. Index never sees or stores card numbers.'], ['Who can buy a paid plan?', 'Paid memberships must be purchased by an authorized adult or payment account holder.'], ['What happens if I go back to Basic?', 'You keep everything you saved. You just can\'t add more past the Basic limits until you upgrade again.'], ['Does it follow my account?', 'Yes. Your plan is tied to your Index account on every device.']]
        .map(function (f) { return '<details><summary>' + f[0] + '</summary><p>' + f[1] + '</p></details>'; }).join('') + '</section></div>';
  };

  /* First sign-up: pick a plan. */
  window.openNewUserMembershipPrompt = function (force) {
    try {
      if (!state.account || (!force && membershipOnboardingCompleted())) return;
      if (document.getElementById('membership-onboarding-modal')) return;
      var m = document.createElement('div'); m.id = 'membership-onboarding-modal'; m.className = 'overlay mp-over';
      m.innerHTML = '<div class="modal mp-onboard" role="dialog" aria-modal="true" aria-labelledby="mp-ob-t"><div class="mp-ob-head"><div class="mp-eyebrow">WELCOME TO INDEX</div><h2 id="mp-ob-t">Select your membership plan</h2><p>Pick the plan you want to start on. You can change it any time from the Membership tab.</p></div>' +
        '<div class="mp-ob-body">' + cardsHtml({ tier: '' }, 'onboarding') +
        '<div class="mp-terms" id="mp-terms" hidden><label><input type="checkbox" id="membership-consent-general"> <span>I understand paid plans are optional, monthly, and do not automatically renew.</span></label><label><input type="checkbox" id="membership-consent-adult"> <span>I understand a paid plan must be bought by an authorized adult or payment account holder. I agree to the <a href="/terms.html" target="_blank" rel="noopener">Terms</a> and <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</span></label></div>' +
        '<div id="membership-onboard-status"></div><div class="mp-ob-actions"><button class="btn btn-primary" id="mp-ob-go" disabled>Select a plan</button></div></div></div>';
      document.body.appendChild(m);
      var chosen = '';
      function sel(k) {
        chosen = k; m.querySelectorAll('.mp-card').forEach(function (c) { var on = c.getAttribute('data-tier') === k; c.classList.toggle('mp-sel', on); c.setAttribute('aria-checked', on ? 'true' : 'false'); });
        m.querySelector('#mp-terms').hidden = (k === 'free');
        var b = m.querySelector('#mp-ob-go'); b.disabled = false; b.textContent = k === 'free' ? 'Continue with Basic (free)' : 'Continue with ' + MC.TIERS[k].name + ' · ' + MC.price(MC.TIERS[k]) + '/mo';
      }
      m.addEventListener('click', function (e) {
        var c = e.target.closest && e.target.closest('.mp-card'); if (c && !e.target.closest('a')) { sel(c.getAttribute('data-tier')); return; }
        if (e.target.id === 'mp-ob-go') {
          if (!chosen) return;
          var st = m.querySelector('#membership-onboard-status');
          if (chosen !== 'free' && !(m.querySelector('#membership-consent-general').checked && m.querySelector('#membership-consent-adult').checked)) { st.innerHTML = '<div class="error-note">Please tick both statements to continue with a paid plan.</div>'; return; }
          markMembershipOnboardingCompleted(); closeMembershipOnboarding();
          if (chosen === 'free') { try { showRewardToast('Welcome to Index Basic! You can upgrade from the Membership tab anytime.'); } catch (x) { } }
          else { try { switchView('membership'); startMembershipCheckout(chosen); } catch (x) { } }
        }
      });
      m.addEventListener('keydown', function (e) { var c = e.target.closest && e.target.closest('.mp-card'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); sel(c.getAttribute('data-tier')); } });
    } catch (e) { }
  };
})();
