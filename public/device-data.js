/* Account-only data. User data (notes, study sets, progress, profile, tutor chats, lessons, quests, wallet mirrors)
   lives on the signed-in account on the server, never on the device. This script must load before every other script.
   Matching keys are kept in memory for the current page only, and any copy left in the browser by older versions is erased.
   Device settings that are not personal data (county gate, sound, layout choices, role) still use localStorage. */
(function () {
  'use strict';
  var DATA = /^(index-(notes|studysets|customtopics|progress|profile|daily-coins|tutor-chats|learn-v2|gen-avg|extras-at|quest-.*)|index\.membershipOnboarded\..*|index-account-customization.*|index\.accountCustomization.*)$/;
  var P = Storage.prototype, get = P.getItem, set = P.setItem, rem = P.removeItem, mem = Object.create(null);
  function isData(self, k) { return self === window.localStorage && DATA.test(String(k)); }
  P.getItem = function (k) { if (isData(this, k)) return k in mem ? mem[k] : null; return get.apply(this, arguments); };
  P.setItem = function (k, v) { if (isData(this, k)) { mem[k] = String(v); return; } return set.apply(this, arguments); };
  P.removeItem = function (k) { if (isData(this, k)) { delete mem[k]; return; } return rem.apply(this, arguments); };
  /* erase anything an older version stored on this device */
  try {
    var ls = window.localStorage, doomed = [];
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (DATA.test(k)) doomed.push(k); }
    doomed.forEach(function (k) { rem.call(ls, k); });
    window.__deviceDataPurged = doomed.length;
  } catch (e) { }
  /* extra safety: any other key that carries a custom-customization mirror prefix */
  window.DeviceData = { keys: function () { return Object.keys(mem); }, wipe: function () { mem = Object.create(null); } };
})();
