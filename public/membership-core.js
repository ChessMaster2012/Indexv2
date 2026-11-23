/* One source of truth for what each membership includes. Shared by the server (limits are enforced there)
   and the browser (the Membership page and the first-sign-up plan picker). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MembershipCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var ORDER = ['free', 'gold', 'platinum', 'diamond'];
  var TIERS = {
    free:     { name: 'Basic',    icon: '📚', priceCents: 0,   tag: 'START HERE',  copy: 'Everything you need for everyday studying.',          credits: 20,  starter: 20,  bonusCap: 100, rollMult: 1,   sets: 50,   notes: 50,  chats: 20,  flair: 'None', spins: 0, boost: 1.5, auto: false, badge: '', perks: [] },
    gold:     { name: 'Gold',     icon: '🥇', priceCents: 499, tag: 'MORE ROOM',   copy: 'Twice the AI power and a much bigger library.',        credits: 40,  starter: 40,  bonusCap: 150, rollMult: 1.5, sets: 250,  notes: 250, chats: 50,  flair: 'Gold badge', spins: 1, boost: 1.5, auto: true, badge: '🥇', perks: ['Grades load automatically every time you open the tab','1 free Lucky Spin every week','Gold badge on leaderboards and your profile'] },
    platinum: { name: 'Platinum', icon: '🔷', priceCents: 749, tag: 'POWER USER',  copy: 'For students who use Index in every class.',           credits: 70,  starter: 75,  bonusCap: 250, rollMult: 2,   sets: 500,  notes: 350, chats: 100, flair: 'Platinum badge + glow', spins: 2, boost: 1.75, auto: true, badge: '🔷', perks: ['2 free Lucky Spins every week','Stronger Lucky Spins: 75% better pack odds','Platinum badge with a glow'] },
    diamond:  { name: 'Diamond',  icon: '💎', priceCents: 999, tag: 'BEST VALUE',  copy: 'The highest limits and the biggest daily boosts.',      credits: 120, starter: 150, bonusCap: 400, rollMult: 3,   sets: 1000, notes: 500, chats: 200, flair: 'Diamond badge + animated glow', spins: 4, boost: 2, auto: true, badge: '💎', perks: ['4 free Lucky Spins every week','Strongest Lucky Spins: double the pack boost','Animated Diamond badge everywhere'] }
  };
  /* Rows of the comparison table: [label, hint, value(tier)] */
  var ROWS = [
    { group: 'AI power', items: [
      { k: 'credits',  label: 'AI credits per 6 hours', hint: 'Used by the Tutor, study-set builder and game questions', v: function (t) { return t.credits; } },
      { k: 'starter',  label: 'Starter credit balance', hint: 'Credits you start a fresh window with', v: function (t) { return t.starter; } },
      { k: 'roll',     label: 'Daily credit roll boost', hint: 'Multiplies the bonus credits from your daily roll', v: function (t) { return t.rollMult === 1 ? 'Standard' : 'x' + t.rollMult; } },
      { k: 'bonusCap', label: 'Bonus credit storage',   hint: 'How many bonus credits you can bank', v: function (t) { return t.bonusCap; } }
    ] },
    { group: 'Your library', items: [
      { k: 'sets',  label: 'Saved study sets', hint: 'Flashcard and quiz sets kept on your account', v: function (t) { return t.sets; } },
      { k: 'notes', label: 'Saved notes',      hint: 'Notes kept on your account', v: function (t) { return t.notes; } },
      { k: 'chats', label: 'Saved Tutor chats', hint: 'Past AI Tutor conversations you can reopen', v: function (t) { return t.chats; } }
    ] },
    { group: 'Perks', items: [
      { k: 'spins', label: 'Free Lucky Spins per week', hint: 'Each one boosts a single pack opening', v: function (t) { return t.spins || 'None'; } },
      { k: 'boost', label: 'Lucky Spin strength', hint: 'How much a Lucky Spin improves your pack odds', v: function (t) { return '+' + Math.round((t.boost - 1) * 100) + '%'; } },
      { k: 'auto',  label: 'Grades load automatically', hint: 'Fresh StudentVUE grades the moment you open the Grades tab', v: function (t) { return t.auto ? 'Yes' : 'Enter password each time'; } }
    ] },
    { group: 'Recognition', items: [
      { k: 'flair', label: 'Profile flair', hint: 'Shown next to your name', v: function (t) { return t.flair; } }
    ] }
  ];
  function price(t) { return t.priceCents ? '$' + (t.priceCents / 100).toFixed(2) : '$0'; }
  function get(tier) { return TIERS[tier] || TIERS.free; }
  return { ORDER: ORDER, TIERS: TIERS, ROWS: ROWS, price: price, get: get };
});
