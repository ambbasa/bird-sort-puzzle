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

  // ---- v8.1 meta (GDD v8 §4 P1/P2/P4). Pure: the caller persists. Never lowers stars / progress / coins already owned.
  function starTotal(save) { var t = 0; for (var k in save.stars) if (/^\d+$/.test(k)) t += Math.max(0, Math.min(3, +save.stars[k] || 0)); return t; }
  // P1 star chests: one per E81.chestEvery stars (earned = floor(stars / every)); new ones go to pending, opened at map entry
  function chestAccrue(save, E81) { var ch = save.chests, earned = Math.floor(starTotal(save) / E81.chestEvery), add = Math.max(0, earned - ch.opened - ch.pending); ch.pending += add; return add; }
  function chestReward(i, E81) { return E81.chestCycle[i % E81.chestCycle.length]; }
  // opens up to max pending chests (migration retro + each later map entry: E81.chestMaxAtOnce); returns the rewards in order
  function chestOpen(save, E81, EC, max) { var out = [], ch = save.chests, I = save.inventory; max = max == null ? E81.chestMaxAtOnce : max;
    while (ch.pending > 0 && out.length < max) { var r = chestReward(ch.opened, E81); ch.pending--; ch.opened++;
      if (r.coins) addCoins(save, r.coins, EC); if (r.hint) I.hint = Math.min(E81.hintMax, I.hint + r.hint); if (r.token) I.perchToken = Math.min(EC.tokenMax, I.perchToken + r.token); out.push(r); }
    return out; }
  function chestProgress(save, E81) { var t = starTotal(save), e = E81.chestEvery; return { have: t % e, need: e, left: e - (t % e), total: t }; }
  // P2 album: card id -> debut stage (first campaign stage showing it). Card owned once its debut stage has stars.
  var ALBUM_GIM = ['hidden', 'key', 'cage', 'egg', 'sleep', 'alarm'];
  function albumDebuts(STAGES, palette, last) { var d = {};
    for (var n = 1; n <= last; n++) { var g = STAGES[n]; if (!g) continue; var mark = function (id) { if (!(id in d)) d[id] = n; };
      g.tubes.forEach(function (t) { t.forEach(function (c) { if (typeof c === 'number' && palette[c]) mark('c' + c); }); });
      if ((g.hidden || []).length) mark('hidden'); if ((g.locks || []).length) mark('key'); if ((g.cages || []).length) mark('cage');
      if ((g.eggs || []).length) mark('egg'); if ((g.sleep || []).length) { mark('sleep'); mark('alarm'); } }
    return d; }
  function albumIds(palette) { return palette.map(function (_, i) { return 'c' + i; }).concat(ALBUM_GIM); }
  // grants every card whose debut stage is cleared; every E81.albumEvery cards -> E81.albumReward coins (paid once, tracked in album._paid)
  function albumSync(save, debuts, E81, EC) { var A = save.album, got = [], coins = 0;
    for (var id in debuts) if (!A[id] && (save.stars[debuts[id]] || 0) > 0) { A[id] = 1; got.push(id); }
    var have = Object.keys(A).filter(function (k) { return k[0] !== '_'; }).length, due = Math.floor(have / E81.albumEvery), paid = A._paid || 0;
    if (due > paid) { coins = (due - paid) * E81.albumReward; A._paid = due; addCoins(save, coins, EC); }
    return { got: got, coins: coins, have: have }; }
  // P4 streak: clears without hint / undo / perch in a row (daily excluded). Returns the new streak.
  function streakWin(save, clean) { var k = save.streak; k.n = clean ? k.n + 1 : 0; k.best = Math.max(k.best, k.n); return k.n; }
  function streakReset(save) { save.streak.n = 0; }
  // start-of-stage bonus for the current streak: >=2 undo +1, ==4 perch token +1, >=6 hint +1 (inventory caps kept)
  function streakBonus(n, E81) { return { undo: n >= E81.streakUndoAt ? 1 : 0, token: n === E81.streakTokenAt ? 1 : 0, hint: n >= E81.streakHintAt ? 1 : 0 }; }
  function flameLevel(n) { return n >= 6 ? 3 : n >= 4 ? 2 : n >= 2 ? 1 : 0; }
  SP.v81 = { starTotal: starTotal, chestAccrue: chestAccrue, chestReward: chestReward, chestOpen: chestOpen, chestProgress: chestProgress, albumDebuts: albumDebuts, albumIds: albumIds, albumSync: albumSync,
    streakWin: streakWin, streakReset: streakReset, streakBonus: streakBonus, flameLevel: flameLevel };
  SP.v8 = { migrateV8: migrateV8, dayKey: dayKey, freePerchLeft: freePerchLeft, useFreePerch: useFreePerch, spend: spend, addCoins: addCoins, comboCoins: comboCoins };
})();
if (typeof module !== 'undefined') { module.exports = SP.v8; module.exports.v81 = SP.v81; }
