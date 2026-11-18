// Daily challenge (GDD §3, DESIGN §5.5): one shared puzzle per calendar day (device local date), streak, 7-day reward track.
// Puzzle = a verified pool board picked by the date seed, with tubes reordered and colors remapped by the same seed.
// 2026-11-09: Thursday theme 'small' (작은 둥지, gate 101) from js-daily-themes.js.
// 2026-11-10: Friday theme 'cage' (새장, gate 121) from js-daily-themes.js.
// 2026-11-11: Saturday theme 'egg' (알, gate 141, brooding eggs) from js-daily-themes.js.
// 2026-11-12: Sunday theme 'mixed' (혼합, gate 141: two of cage / egg / small nest per board) from js-daily-themes.js.
// 2026-11-08: default (non-theme) days pick from a progress band (GDD D1).
// 2026-11-09 FUN-FIX-1109: bands = cleared 0–20 / 21–60 / 61–120 / 121+ (legacy 3-slot pools map intro+beginner → old 0–60).
// Solvability and min moves are unchanged; the stored solution is remapped to the new tube order (tools/daily.test.js replays it).
// Rewards are in-game coins only (no ads, no payments).
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
  // GDD D1 + FUN-FIX-1109 (11/09): intro 0–20 / beginner 21–60 / mid 61–120 / late 121+.
  // DAILY_POOLS = [intro0–20, beginner21–60, mid61–120, late121+]. Legacy 3-slot maps intro+beginner → slot 0.
  function bandOf(n) { n = +n || 0; return n >= 121 ? 3 : n >= 61 ? 2 : n >= 21 ? 1 : 0; }
  function poolFor(band) {
    var pools = SP.DAILY_POOLS;
    if (pools && pools.length >= 4) {
      if (pools[band] && pools[band].length) return pools[band];
      for (var i = band; i >= 0; i--) if (pools[i] && pools[i].length) return pools[i];
      return SP.DAILY_POOL;
    }
    if (pools && pools.length === 3) {
      var legacy = band <= 1 ? 0 : band === 2 ? 1 : 2;
      if (pools[legacy] && pools[legacy].length) return pools[legacy];
    }
    if (pools && pools[band] && pools[band].length) return pools[band];
    return SP.DAILY_POOL;
  }
  function pick(key, band) {
    band = band || 0;
    var p = poolFor(band), P = p && p.length; if (!P) return -1;
    var A = 37 % P || 1, B = hash('sortpuzzle-daily-pool' + (band ? ':b' + band : '')) % P;
    return (((A * dayNum(key) + B) % P) + P) % P;
  }
  // build(stages, key, nColors, opts) -> stage object + { daily: key, source }
  // v8.2 (GDD D1, hidden flag): weekday theme pools (js-daily-themes.js). Only when the caller passes opts (game.js does so
  // only with C.features.v82) and the player has cleared the theme's first stage (opts.cleared(gate)); otherwise the default
  // daily (progress band). Theme index uses the week number w (same weekday = consecutive w): (A*w + B) mod P, P prime -> no repeat within P weeks.
  function theme(key, opts) { if (!opts || !SP.DAILY_THEMES) return null; var p = key.split('-').map(Number), dow = new Date(p[0], p[1] - 1, p[2], 12).getDay(), t = SP.DAILY_THEMES[dow];
    if (!t || !t.pool.length || !(opts.cleared && opts.cleared(t.gate))) return null; var P = t.pool.length, w = Math.floor((dayNum(key) + 3) / 7), A = 11 % P || 1, B = hash('sortpuzzle-theme:' + t.theme) % P;
    return { theme: t.theme, label: t.label, pool: t.pool, idx: (((A * w + B) % P) + P) % P }; }
  function build(stages, key, nColors, opts) {
    var r = rng(hash('sortpuzzle-daily:' + key)), band = bandOf(opts && opts.clearedMax), pi = pick(key, band), g, src, th = theme(key, opts);
    if (th) { g = th.pool[th.idx]; src = th.theme + ':' + th.idx; }
    else if (pi >= 0) { g = poolFor(band)[pi]; src = (band ? 'pool' + band + ':' : 'pool:') + pi; }
    else { var p = pool(stages); if (!p.length) return null; src = p[Math.floor(r() * p.length)]; g = stages[src]; }
    var order = shuffle(g.tubes.map(function (_, i) { return i; }), r), inv = []; order.forEach(function (old, i) { inv[old] = i; }); // new tube i = old tube order[i]
    var cmap = shuffle(Array.from({ length: nColors || 12 }, function (_, i) { return i; }), r);
    var tubes = order.map(function (old) { return g.tubes[old].map(function (c) { return typeof c === 'number' ? cmap[c] : c; }); });
    var o = { daily: key, source: src, seed: hash(key), colors: g.colors, empty: g.empty, rest: false, tutorial: false, min: g.min, deadEnds: g.deadEnds || 0,
      tubes: tubes, gimmicks: [], solution: g.solution.map(function (m) { return [inv[m[0]], inv[m[1]]]; }) };
    if (!th) o.band = band;
    if (th) { o.theme = th.theme; o.themeLabel = th.label; o.gimmicks = (g.gimmicks || []).slice();
      if (g.locks) o.locks = g.locks.map(function (l) { return { tube: inv[l.tube], key: l.key }; });
      if (g.hidden) o.hidden = g.hidden.map(function (h) { return [inv[h[0]], h[1]]; });
      if (g.caps) o.caps = order.map(function (old) { return g.caps[old]; }); // 2026-11-09: Thu small-nest theme (cap 3 follows its tube)
      if (g.cages) o.cages = g.cages.map(function (c) { return { tube: inv[c.tube], from: c.from, to: c.to, n: c.n }; }); // 2026-11-10: Fri cage theme (cage follows its tube)
      if (g.eggs) { o.eggs = g.eggs.map(function (e) { return { tube: inv[e.tube], at: e.at, n: e.n }; }); if (g.brood) o.brood = true; } } // 2026-11-11: Sat egg theme (egg follows its tube)
    return o;
  }
  // Streak state lives in the main save (save.daily) so it uses the same (SDK) storage path: { last, streak, best, stars{key:n} }
  function streakNow(d, today) { if (!d || !d.last) return 0; return d.last === today || d.last === shift(today, -1) ? d.streak || 0 : 0; }
  function doneToday(d, today) { return !!d && d.last === today; }
  // complete(d, today, stars) -> { first, streak, reward, day } (mutates d). Replays of the same day pay nothing.
  // 2026-11-16: optional moves/min -> today's best record d.rec[key] = { m: fewest moves, min } (kept 2 weeks like stars).
  // Result gains rec = { prev, best, min, isNew, perfect } when moves is given. Rewards/streak rules unchanged.
  function record(d, today, moves, min) { if (!(moves > 0)) return null; d.rec = d.rec && typeof d.rec === 'object' ? d.rec : {};
    var o = d.rec[today], prev = o && +o.m > 0 ? +o.m : 0, isNew = !prev || moves < prev; if (isNew) d.rec[today] = { m: moves, min: +min || 0 };
    var ks = Object.keys(d.rec).sort(); while (ks.length > 14) delete d.rec[ks.shift()];
    var best = d.rec[today].m, mn = +min || d.rec[today].min || 0; return { prev: prev, best: best, min: mn, isNew: isNew, perfect: mn > 0 && best <= mn }; }
  function recOf(d, today) { var o = d && d.rec && d.rec[today]; return o && +o.m > 0 ? { best: +o.m, min: +o.min || 0, perfect: +o.min > 0 && +o.m <= +o.min } : null; }
  function complete(d, today, stars, moves, min) {
    d.stars = d.stars || {}; var first = d.last !== today;
    d.stars[today] = Math.max(d.stars[today] || 0, stars);
    var ks = Object.keys(d.stars).sort(); while (ks.length > 14) delete d.stars[ks.shift()]; // keep 2 weeks
    var rec = record(d, today, moves, min);
    if (!first) return { first: false, streak: d.streak, reward: 0, day: ((d.streak - 1) % 7) + 1, rec: rec };
    d.streak = d.last === shift(today, -1) ? (d.streak || 0) + 1 : 1; d.last = today; d.best = Math.max(d.best || 0, d.streak);
    var day = ((d.streak - 1) % 7) + 1; return { first: true, streak: d.streak, reward: REWARDS[day - 1], day: day, rec: rec };
  }
  function msToMidnight(now) { now = now || new Date(); var m = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); return m - now; }
  SP.daily = { REWARDS: REWARDS, dateKey: dateKey, shift: shift, pool: pool, build: build, theme: theme, pick: pick, bandOf: bandOf, poolFor: poolFor, streakNow: streakNow, doneToday: doneToday, complete: complete, recOf: recOf, msToMidnight: msToMidnight };
  if (typeof module !== 'undefined') module.exports = SP.daily;
})();
