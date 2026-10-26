// v8.0 save migration + economy helpers (GDD v8 G4/G6/R1/R2/R3). Pure functions (no DOM, no storage) so tools/verify-v8.js can test them.
var SP = (typeof window !== 'undefined') ? (window.SP = window.SP || {}) : (global.SP = global.SP || {});
(function () {
  function num(v, d) { v = Math.floor(+v); return isFinite(v) && v >= 0 ? v : d; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
  // migrateV8(save) -> new object. Keeps every v7.3 field as-is (unlocked/current/stars/coins/daily/attempt/themesSeen/comboPaid...),
  // only adds v8 defaults. Idempotent: migrateV8(migrateV8(x)) deep-equals migrateV8(x). Never lowers stars/coins/progress.
  function migrateV8(save) {
    var s = obj(save) ? JSON.parse(JSON.stringify(save)) : { unlocked: 1, stars: {}, coins: 0, current: 1 };
    if (!obj(s.stars)) s.stars = {};
    var inv = obj(s.inventory) || {}; s.inventory = { perchToken: num(inv.perchToken, 0), hint: num(inv.hint, 0), magpie: num(inv.magpie, 0) };
    var fp = obj(s.freePerch) || {}; s.freePerch = { date: typeof fp.date === 'string' ? fp.date : '', left: num(fp.left, 0) };
    var sk = obj(s.streak) || {}; s.streak = { n: num(sk.n, 0), best: num(sk.best, 0) };
    var ch = obj(s.chests) || {}; s.chests = { opened: num(ch.opened, 0), pending: num(ch.pending, 0) };
    s.album = obj(s.album) || {}; s.weekly = obj(s.weekly) || { week: '', feathers: 0, claimed: [] };
    var b = obj(s.badges) || {}; s.badges = { feather: obj(b.feather) || {} };
    s.tips = obj(s.tips) || {}; s.v8paid = obj(s.v8paid) || {};
    s.v = Math.max(8, num(s.v, 0));
    return s;
  }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  // R2 free perch: 3 per device day, only when no rewarded ad is available and coins are short
  function freePerchLeft(save, E, key) { var fp = save.freePerch; if (!fp || fp.date !== key) return E.freePerchPerDay; return fp.left; }
  function useFreePerch(save, E, key) { var l = freePerchLeft(save, E, key); if (l <= 0) return false; save.freePerch = { date: key, left: l - 1 }; return true; }
  // R1 atomic spend: deduct + grant applied together by the caller before one persist(); false = not enough coins (nothing changes)
  function spend(save, n) { if (!(save.coins >= n)) return false; save.coins -= n; return true; }
  function addCoins(save, n, E) { save.coins = Math.min(E.coinMax, (save.coins || 0) + n); }
  // R3 combo reward table: combo 2 -> +5, 3 -> +5 (+ free undo), >=4 -> +10 (+ perch token)
  function comboCoins(c, E) { return c < 2 ? 0 : E.comboCoins[Math.min(c, 4)] || 0; }
  SP.v8 = { migrateV8: migrateV8, dayKey: dayKey, freePerchLeft: freePerchLeft, useFreePerch: useFreePerch, spend: spend, addCoins: addCoins, comboCoins: comboCoins };
})();
if (typeof module !== 'undefined') module.exports = SP.v8;
