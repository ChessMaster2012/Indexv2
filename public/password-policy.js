/* Password policy shared by the server (signup + reset) and the browser (live checklist). */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.PasswordPolicy = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  var COMMON = ['password', 'passw0rd', 'p@ssword', 'p@ssw0rd', 'qwerty', 'qwertyuiop', 'asdfgh', 'zxcvbn', 'letmein', 'welcome', 'iloveyou', 'admin', 'login', 'monkey', 'dragon', 'football', 'baseball', 'basketball', 'soccer', 'master', 'shadow', 'sunshine', 'princess', 'superman', 'batman', 'trustno1', 'abc123', 'student', 'teacher', 'school', 'chromebook', 'montgomery', 'maryland', 'index', 'changeme', 'minecraft', 'fortnite', 'roblox', 'pokemon', 'whatever', 'freedom', 'starwars', 'cheese', 'summer', 'winter', 'spring', 'autumn', 'purple'];
  var SEQ = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiopasdfghjklzxcvbnm', '9876543210', 'zyxwvutsrqponmlkjihgfedcba'];
  var MIN = 8, MAX = 128;
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function deleet(s) { return String(s || '').toLowerCase().replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a').replace(/[5$]/g, 's').replace(/7/g, 't').replace(/[^a-z]/g, ''); }
  function hasSequence(p) {
    var l = String(p).toLowerCase();
    for (var i = 0; i < l.length - 3; i++) { var chunk = l.slice(i, i + 4); for (var j = 0; j < SEQ.length; j++) if (SEQ[j].indexOf(chunk) >= 0) return true; }
    return false;
  }
  /* Each rule: id, label, test(pw, ctx) -> true when satisfied */
  var RULES = [
    { id: 'len', label: 'At least ' + MIN + ' characters', test: function (p) { return p.length >= MIN && p.length <= MAX; } },
    { id: 'lower', label: 'A lowercase letter (a–z)', test: function (p) { return /[a-z]/.test(p); } },
    { id: 'upper', label: 'An uppercase letter (A–Z)', test: function (p) { return /[A-Z]/.test(p); } },
    { id: 'digit', label: 'A number (0–9)', test: function (p) { return /[0-9]/.test(p); } },
    { id: 'symbol', label: 'A symbol like ! ? # $ % & *', test: function (p) { return /[^A-Za-z0-9\s]/.test(p); } },
    { id: 'nospace', label: 'No spaces at the start or end', test: function (p) { return p === p.trim(); } },
    { id: 'unique', label: 'At least 6 different characters', test: function (p) { var o = {}, n = 0; for (var i = 0; i < p.length; i++) if (!o[p[i]]) { o[p[i]] = 1; n++; } return n >= 6; } },
    { id: 'repeat', label: 'No character repeated 3 times in a row', test: function (p) { return !/(.)\1\1/.test(p); } },
    { id: 'seq', label: 'No easy runs like abcd, 1234 or qwerty', test: function (p) { return !hasSequence(p); } },
    { id: 'common', label: 'Not a common password or word', test: function (p) { var d = deleet(p), n = norm(p); for (var i = 0; i < COMMON.length; i++) if (d.indexOf(deleet(COMMON[i])) >= 0 || n.indexOf(COMMON[i]) >= 0) return false; return true; } },
    { id: 'personal', label: 'Does not contain your name, username or email', test: function (p, c) {
      c = c || {}; var d = deleet(p), n = norm(p), bits = [c.username, c.email && String(c.email).split('@')[0], c.firstName, c.lastName];
      for (var i = 0; i < bits.length; i++) { var b = norm(bits[i]); if (b.length >= 3 && (n.indexOf(b) >= 0 || d.indexOf(deleet(b)) >= 0)) return false; } return true; } }
  ];
  function evaluate(pw, ctx) { pw = String(pw == null ? '' : pw); return RULES.map(function (r) { return { id: r.id, label: r.label, ok: !!r.test(pw, ctx) }; }); }
  function check(pw, ctx) { var f = evaluate(pw, ctx).filter(function (r) { return !r.ok; }); return { ok: f.length === 0, failed: f, message: f.length ? 'Password is too weak: ' + f.slice(0, 3).map(function (x) { return x.label.charAt(0).toLowerCase() + x.label.slice(1); }).join('; ') + '.' : '' }; }
  function score(pw, ctx) { var r = evaluate(pw, ctx), ok = r.filter(function (x) { return x.ok; }).length; var bonus = Math.min(2, Math.floor(Math.max(0, String(pw).length - MIN) / 4)); return { passed: ok, total: r.length, level: ok < r.length ? (ok >= r.length - 3 ? 2 : 1) : (bonus >= 2 ? 5 : bonus === 1 ? 4 : 3) }; }
  return { MIN: MIN, MAX: MAX, RULES: RULES, evaluate: evaluate, check: check, score: score };
});
