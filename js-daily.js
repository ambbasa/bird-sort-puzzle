// Daily challenge (GDD §3, DESIGN §5.5): one shared puzzle per calendar day (device local date), streak, 7-day reward track.
// Puzzle = a verified campaign stage (no gimmicks, not rest/tutorial) picked by the date seed, with tubes reordered and
// colors remapped by the same seed. Solvability and min moves are unchanged; the stored solution is remapped to the new
// tube order (tools/daily.test.js replays it). Rewards are in-game coins only (no ads, no payments).
var SP = (typeof window !== "undefined") ? (window.SP = window.SP || {}) : (global.SP = global.SP || {});
(function () {
  var REWARDS = [10, 10, 15, 15, 20, 25, 50]; // day 1..7 of the streak cycle (coins), then the cycle repeats
  var POOL_FROM = 13, POOL_TO = 60, MIN_LO = 12, MIN_HI = 19;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var dateKey = SP.day.key; // v8.1.2: single local-date key (js-config.js)
  function shift(key, days) { var p = key.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2] + days, 12); return dateKey(d); }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return function () { seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(a, r) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function pool(stages) {
    return Object.keys(stages).map(Number).filter(function (n) { var g = stages[n];
      return n >= POOL_FROM && n <= POOL_TO && !g.rest && !g.tutorial && !(g.locks && g.locks.length) && !(g.hidden && g.hidden.length)
        && !(g.caps && g.caps.some(function (c) { return c !== 4; })) && g.solution && g.min >= MIN_LO && g.min <= MIN_HI; }).sort(function (a, b) { return a - b; });
  }
  // build(stages, key, nColors) -> stage object (same shape as SP.STAGES[n]) + { daily: key, source: n }
  // QA F9: generated pool (js-daily-pool.js, prime size P, solver-verified). Day number d -> pool index (A*d + B) mod P:
  // an affine map mod a prime is a bijection on any P consecutive days, so no puzzle repeats within P (>= 30) days.
  // Falls back to the campaign pool if daily-pool.js is not loaded.
  function dayNum(key) { var p = key.split('-').map(Number); return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 864e5); }
  function pick(key) { var P = SP.DAILY_POOL && SP.DAILY_POOL.length; if (!P) return -1; var A = 37 % P || 1, B = hash('sortpuzzle-daily-pool') % P;
    return (((A * dayNum(key) + B) % P) + P) % P; }
  // build(stages, key, nColors) -> stage object (same shape as SP.STAGES[n]) + { daily: key, source }
  // v8.2 (GDD D1, hidden flag): weekday theme pools (js-daily-themes.js). Only when the caller passes opts (game.js does so
  // only with C.features.v82) and the player has cleared the theme's first stage (opts.cleared(gate)); otherwise the default
  // daily. Theme index uses the week number w (same weekday = consecutive w): (A*w + B) mod P, P prime -> no repeat within P weeks.
  function theme(key, opts) { if (!opts || !SP.DAILY_THEMES) return null; var p = key.split('-').map(Number), dow = new Date(p[0], p[1] - 1, p[2], 12).getDay(), t = SP.DAILY_THEMES[dow];
    if (!t || !t.pool.length || !(opts.cleared && opts.cleared(t.gate))) return null; var P = t.pool.length, w = Math.floor((dayNum(key) + 3) / 7), A = 11 % P || 1, B = hash('sortpuzzle-theme:' + t.theme) % P;
    return { theme: t.theme, label: t.label, pool: t.pool, idx: (((A * w + B) % P) + P) % P }; }
  function build(stages, key, nColors, opts) {
    var r = rng(hash('sortpuzzle-daily:' + key)), pi = pick(key), g, src, th = theme(key, opts);
    if (th) { g = th.pool[th.idx]; src = th.theme + ':' + th.idx; }
    else if (pi >= 0) { g = SP.DAILY_POOL[pi]; src = 'pool:' + pi; }
    else { var p = pool(stages); if (!p.length) return null; src = p[Math.floor(r() * p.length)]; g = stages[src]; }
    var order = shuffle(g.tubes.map(function (_, i) { return i; }), r), inv = []; order.forEach(function (old, i) { inv[old] = i; }); // new tube i = old tube order[i]
    var cmap = shuffle(Array.from({ length: nColors || 12 }, function (_, i) { return i; }), r);
    var tubes = order.map(function (old) { return g.tubes[old].map(function (c) { return typeof c === 'number' ? cmap[c] : c; }); });
    var o = { daily: key, source: src, seed: hash(key), colors: g.colors, empty: g.empty, rest: false, tutorial: false, min: g.min, deadEnds: g.deadEnds || 0,
      tubes: tubes, gimmicks: [], solution: g.solution.map(function (m) { return [inv[m[0]], inv[m[1]]]; }) };
    if (th) { o.theme = th.theme; o.themeLabel = th.label; o.gimmicks = (g.gimmicks || []).slice();
      if (g.locks) o.locks = g.locks.map(function (l) { return { tube: inv[l.tube], key: l.key }; });
      if (g.hidden) o.hidden = g.hidden.map(function (h) { return [inv[h[0]], h[1]]; }); }
    return o;
  }
  // Streak state lives in the main save (save.daily) so it uses the same (SDK) storage path: { last, streak, best, stars{key:n} }
  function streakNow(d, today) { if (!d || !d.last) return 0; return d.last === today || d.last === shift(today, -1) ? d.streak || 0 : 0; }
  function doneToday(d, today) { return !!d && d.last === today; }
  // complete(d, today, stars) -> { first, streak, reward, day } (mutates d). Replays of the same day pay nothing.
  function complete(d, today, stars) {
    d.stars = d.stars || {}; var first = d.last !== today;
    d.stars[today] = Math.max(d.stars[today] || 0, stars);
    var ks = Object.keys(d.stars).sort(); while (ks.length > 14) delete d.stars[ks.shift()]; // keep 2 weeks
    if (!first) return { first: false, streak: d.streak, reward: 0, day: ((d.streak - 1) % 7) + 1 };
    d.streak = d.last === shift(today, -1) ? (d.streak || 0) + 1 : 1; d.last = today; d.best = Math.max(d.best || 0, d.streak);
    var day = ((d.streak - 1) % 7) + 1; return { first: true, streak: d.streak, reward: REWARDS[day - 1], day: day };
  }
  function msToMidnight(now) { now = now || new Date(); var m = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); return m - now; }
  SP.daily = { REWARDS: REWARDS, dateKey: dateKey, shift: shift, pool: pool, build: build, theme: theme, pick: pick, streakNow: streakNow, doneToday: doneToday, complete: complete, msToMidnight: msToMidnight };
  if (typeof module !== 'undefined') module.exports = SP.daily;
})();
