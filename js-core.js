var SP = (typeof window !== 'undefined') ? (window.SP = window.SP || {}) : (global.SP = global.SP || {});
(function () {
  var CAP = 4;
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function canMove(t, a, b) { if (a === b || !t[a].length || t[b].length >= CAP) return false; return !t[b].length || t[b][t[b].length - 1] === t[a][t[a].length - 1]; }
  // v7 (GDD A1): one move = the whole same-colour top run, as many as fit
  function moveRun(t, a, b) { var c = t[a][t[a].length - 1], k = 0; while (t[a].length && t[a][t[a].length - 1] === c && t[b].length < CAP) { t[b].push(t[a].pop()); k++; } return k; }
  function isDone(tb) { return tb.length === CAP && tb.every(function (c) { return c === tb[0]; }); }
  function isSolved(t) { return t.every(function (tb) { return !tb.length || isDone(tb); }); }
  function key(t) { return t.map(function (x) { return x.join(','); }).sort().join('|'); }
  // BFS: exact min moves (v7: one same-colour run per move). Prunes provably useless moves.
  // full=true explores the whole reachable graph (up to limit) and returns deadEnds:
  // number of reachable states from which the solved state is unreachable.
  function solve(start, limit, full, single) { // single=true: legacy v6 one-bird moves (only tools/build-stages.js, to keep 1-30 layouts reproducible)
    limit = limit || 3e6;
    var s0 = start.map(function (x) { return x.slice(); });
    var ids = new Map(), states = [s0], parent = [-1], pm = [null], edges = [], solvedIds = [], found = -1;
    ids.set(key(s0), 0); if (isSolved(s0)) { found = 0; solvedIds.push(0); }
    var n = s0.length, aborted = false;
    for (var head = 0; head < states.length; head++) {
      if (found >= 0 && !full) break;
      var t = states[head], out = [];
      if (isSolved(t)) { edges.push(out); continue; }
      for (var a = 0; a < n; a++) {
        var A = t[a]; if (!A.length || isDone(A)) continue;
        var mono = A.every(function (c) { return c === A[0]; });
        for (var b = 0; b < n; b++) {
          if (!canMove(t, a, b) || (mono && !t[b].length)) continue;
          var nt = t.map(function (x) { return x.slice(); }); if (single) nt[b].push(nt[a].pop()); else moveRun(nt, a, b);
          var k = key(nt), id = ids.get(k);
          if (id === undefined) {
            if (states.length >= limit) { aborted = true; continue; }
            id = states.length; ids.set(k, id); states.push(nt); parent.push(head); pm.push([a, b]);
            if (isSolved(nt)) { solvedIds.push(id); if (found < 0) found = id; }
          }
          out.push(id);
        }
      }
      edges.push(out);
    }
    var res = { solvable: found >= 0, min: -1, path: [], explored: states.length, aborted: aborted };
    if (found >= 0) { var p = []; for (var i = found; parent[i] >= 0; i = parent[i]) p.unshift(pm[i]); res.min = p.length; res.path = p; }
    if (full && !aborted) {
      var rev = states.map(function () { return []; });
      edges.forEach(function (o, i) { o.forEach(function (j) { rev[j].push(i); }); });
      var good = new Uint8Array(states.length), st = solvedIds.slice(); st.forEach(function (i) { good[i] = 1; });
      while (st.length) { var x = st.pop(); rev[x].forEach(function (y) { if (!good[y]) { good[y] = 1; st.push(y); } }); }
      var d = 0; for (var z = 0; z < states.length; z++) if (!good[z]) d++; res.deadEnds = d;
    }
    return res;
  }
  // Reverse shuffle from solved state: undo a legal forward move each step.
  function reverseShuffle(colors, empty, depth, r) {
    var t = []; for (var c = 0; c < colors; c++) t.push([c, c, c, c]); for (var e = 0; e < empty; e++) t.push([]);
    var last = null;
    for (var i = 0, tries = 0; i < depth && tries < depth * 50; tries++) {
      var a = Math.floor(r() * t.length), b = Math.floor(r() * t.length);
      if (a === b || !t[a].length || t[b].length >= CAP) continue;
      if (last && last[0] === b && last[1] === a) continue;
      var ball = t[a][t[a].length - 1], under = t[a][t[a].length - 2];
      // reverse of forward move b->a: ball must have legally landed on a (a had only it, or same color below)
      if (t[a].length > 1 && under !== ball) continue;
      t[b].push(t[a].pop()); last = [a, b]; i++;
    }
    return t;
  }
  // Deterministic: seeds n*10007+attempt; pick the candidate whose solver min moves is closest to target.
  function generate(n, cfg) {
    var p = cfg.stage(n), best = null;
    for (var attempt = 0; attempt < 40; attempt++) {
      var seed = n * 10007 + attempt;
      var t = reverseShuffle(p.colors, p.empty, p.scrambleDepth, rng(seed));
      var s = solve(t);
      if (!s.solvable || s.min < 2) continue;
      var d = Math.abs(s.min - p.targetMin);
      if (!best || d < best.d) best = { d: d, stage: n, seed: seed, attempt: attempt, tubes: t, min: s.min, path: s.path, explored: s.explored, params: p };
      if (d === 0) break;
    }
    if (!best) throw new Error('stage ' + n + ' generation failed');
    return best;
  }
  SP.core = { rng: rng, canMove: canMove, moveRun: moveRun, isDone: isDone, isSolved: isSolved, solve: solve, reverseShuffle: reverseShuffle, generate: generate };
})();
if (typeof module !== 'undefined') module.exports = SP;
