// Rules engine + solver with gimmicks (docs-STAGES.md, format: docs-STAGE_FORMAT.md). Plain script / CommonJS, no deps.
// Stage: { tubes:[[bottom..top]], caps?:[n], locks?:[{tube,key}], hidden?:[[tube,index]] }
//  - colors are ints >= 0; key balls are strings "Ka","Kb","Kc" (shape pair a=circle, b=triangle, c=square; max 3 pairs)
//  - caps default 4; a tube with cap < 4 is a SMALL storage tube: never "complete", excluded from the win check
//  - locked tube: nothing can be put in or taken out while locked. Moving the matching key ball (top of its tube) onto the
//    top of its lock tube makes the key and the lock disappear together (single use; the lock tube's capacity is irrelevant).
//    Otherwise a key ball moves like a ball with its own unique color: only onto an EMPTY unlocked tube with space
//    (never onto a color ball), and a color ball can never be placed onto a key. Key balls never count toward tube completion,
//    so a tube containing a key is never complete and a stage is not solved while any key/lock remains.
//  - hidden ('?') balls: shown as '?' until they become the top of their tube. The solver knows the real colors
//    (STAGES.md); fairness is enforced at generation: every '?' must be revealed within the first N moves of the stored solution.
var SP = (typeof window !== 'undefined') ? (window.SP = window.SP || {}) : (global.SP = global.SP || {});
(function () {
  var FULL = 4;
  function isKey(b) { return typeof b === 'string'; }
  function init(stage) {
    var n = stage.tubes.length, caps = stage.caps || stage.tubes.map(function () { return FULL; });
    var lockOf = new Array(n).fill(null); (stage.locks || []).forEach(function (l) { lockOf[l.tube] = l.key; });
    return { t: stage.tubes.map(function (x) { return x.slice(); }), cap: caps.slice(), lock: lockOf };
  }
  function clone(s) { return { t: s.t.map(function (x) { return x.slice(); }), cap: s.cap, lock: s.lock.slice() }; }
  function isDone(s, i) { var t = s.t[i]; if (s.cap[i] < FULL || t.length !== FULL || isKey(t[0])) return false; for (var k = 1; k < FULL; k++) if (t[k] !== t[0]) return false; return true; }
  function isSolved(s) {
    for (var i = 0; i < s.t.length; i++) { if (s.lock[i] !== null) return false; if (s.t[i].length && !isDone(s, i)) return false; }
    return true;
  }
  function canMove(s, a, b) {
    if (a === b || s.lock[a] !== null) return false;
    var A = s.t[a], B = s.t[b]; if (!A.length || isDone(s, a)) return false;
    var ball = A[A.length - 1];
    if (s.lock[b] !== null) return isKey(ball) && s.lock[b] === ball; // matching key onto its lock tube
    if (B.length >= s.cap[b]) return false;
    if (isKey(ball)) return !B.length;
    return !B.length || B[B.length - 1] === ball;
  }
  // v7 (GDD A1): same-colour run move. One tap moves every same bird stacked on top of the source, as many as fit in the
  // destination (genre standard); it still counts as ONE move. Keys always move alone.
  function moveCount(s, a, b) {
    var A = s.t[a], ball = A[A.length - 1]; if (isKey(ball)) return 1;
    var run = 0; for (var i = A.length - 1; i >= 0 && A[i] === ball; i--) run++;
    return Math.max(1, Math.min(run, s.cap[b] - s.t[b].length));
  }
  function apply(s, a, b, cnt) { // returns new state (does not check legality); cnt: optional cap on the run size (game: '?' birds)
    var k = Math.min(cnt || 99, moveCount(s, a, b)), n = clone(s), ball = n.t[a].pop();
    if (isKey(ball) && n.lock[b] === ball) { n.lock[b] = null; return n; } // key + lock disappear together
    n.t[b].push(ball); for (var i = 1; i < k; i++) n.t[b].push(n.t[a].pop());
    return n;
  }
  function moves(s, prune) {
    var out = [], n = s.t.length;
    for (var a = 0; a < n; a++) {
      var A = s.t[a]; if (!A.length || s.lock[a] !== null || isDone(s, a)) continue;
      var mono = prune && !isKey(A[0]) && A.every(function (c) { return c === A[0]; });
      for (var b = 0; b < n; b++) {
        if (!canMove(s, a, b)) continue;
        if (mono && !s.t[b].length && s.cap[b] === s.cap[a] && !isKey(A[A.length - 1])) continue; // provably useless
        out.push([a, b]);
      }
    }
    return out;
  }
  // canonical key: unlocked tubes with same capacity are interchangeable; locked tubes keep identity
  function key(s) {
    var groups = {}, fixed = [];
    for (var i = 0; i < s.t.length; i++) {
      var str = s.t[i].join(',');
      if (s.lock[i] !== null) fixed.push(i + ':' + s.lock[i] + ':' + str);
      else (groups[s.cap[i]] = groups[s.cap[i]] || []).push(str);
    }
    return Object.keys(groups).sort().map(function (c) { return c + '[' + groups[c].sort().join('|') + ']'; }).join('') + '#' + fixed.join('|');
  }
  // BFS: exact min moves. opts: { limit=2e6, full=false (explore everything; computes deadEnds), prune=true }
  function solve(stage, opts) {
    opts = opts || {}; var limit = opts.limit || 2e6, full = !!opts.full, prune = opts.prune !== false;
    var s0 = stage.t ? stage : init(stage);
    var ids = new Map(), states = [s0], parent = [-1], pm = [null], edges = full ? [] : null, solvedIds = [], found = -1, aborted = false;
    ids.set(key(s0), 0); if (isSolved(s0)) { found = 0; solvedIds.push(0); }
    for (var head = 0; head < states.length; head++) {
      if (found >= 0 && !full) break;
      var st = states[head], out = [];
      if (!isSolved(st)) {
        var ms = moves(st, prune);
        for (var m = 0; m < ms.length; m++) {
          var nt = apply(st, ms[m][0], ms[m][1]), k = key(nt), id = ids.get(k);
          if (id === undefined) {
            if (states.length >= limit) { aborted = true; continue; }
            id = states.length; ids.set(k, id); states.push(nt); parent.push(head); pm.push(ms[m]);
            if (isSolved(nt)) { solvedIds.push(id); if (found < 0) { found = id; if (!full) break; } }
          }
          out.push(id);
        }
      }
      if (full) edges.push(out);
    }
    var res = { solvable: found >= 0, min: -1, path: [], explored: states.length, aborted: aborted && found < 0 };
    if (found >= 0) { var p = []; for (var i = found; parent[i] >= 0; i = parent[i]) p.unshift(pm[i]); res.min = p.length; res.path = p; }
    if (full && !aborted) {
      var rev = states.map(function () { return []; });
      edges.forEach(function (o, i) { o.forEach(function (j) { rev[j].push(i); }); });
      var good = new Uint8Array(states.length), stack = solvedIds.slice(); stack.forEach(function (i) { good[i] = 1; });
      while (stack.length) { var x = stack.pop(); rev[x].forEach(function (y) { if (!good[y]) { good[y] = 1; stack.push(y); } }); }
      var d = 0; for (var z = 0; z < states.length; z++) if (!good[z]) d++;
      res.deadEnds = d; res.deadEndRatio = +(d / states.length).toFixed(4);
    } else if (full) { res.deadEnds = null; res.deadEndRatio = null; }
    return res;
  }
  // DFS (not optimal): finds *a* solution quickly; used by in-game hints on big boards and by the dead-end score.
  function dfs(stage, limit) {
    limit = limit || 2e5; var s0 = stage.t ? stage : init(stage), seen = new Set([key(s0)]), stack = [{ s: s0, ms: null, i: 0 }], path = [];
    if (isSolved(s0)) return { solvable: true, path: [], explored: 1 };
    while (stack.length) {
      var top = stack[stack.length - 1];
      if (!top.ms) top.ms = moves(top.s, true).sort(function (x, y) { return score(top.s, y) - score(top.s, x); });
      if (top.i >= top.ms.length) { stack.pop(); path.pop(); continue; }
      var m = top.ms[top.i++], n = apply(top.s, m[0], m[1]), k = key(n);
      if (seen.has(k)) continue; if (seen.size >= limit) return { solvable: false, aborted: true, explored: seen.size };
      seen.add(k); path.push(m); if (isSolved(n)) return { solvable: true, path: path, explored: seen.size };
      stack.push({ s: n, ms: null, i: 0 });
    }
    return { solvable: false, aborted: false, explored: seen.size };
  }
  function score(s, m) { var A = s.t[m[0]], B = s.t[m[1]], ball = A[A.length - 1];
    if (s.lock[m[1]] !== null) return 9; var v = B.length ? 4 + B.length : 0; var run = 0; for (var i = A.length - 1; i >= 0 && A[i] === ball; i--) run++; if (run === A.length && !B.length) v -= 5; return v; }
  // Dead-end score (STAGES.md v1.1 primary difficulty metric, scales to 12 colors): N seeded random "casual player" playouts of
  // length = min from the start; a playout is a trap if its end state can no longer reach solved (DFS proof, budget per check).
  // score = traps / decided playouts. Deterministic for a given stage + seed.
  function deadEndScore(stage, min, opts) {
    opts = opts || {}; var N = opts.playouts || 48, budget = opts.budget || 4e4, seed = opts.seed || 12345, r = mulberry(seed), traps = 0, decided = 0;
    for (var p = 0; p < N; p++) {
      var s = init(stage), last = null;
      for (var k = 0; k < min; k++) {
        var ms = moves(s, false).filter(function (m) { return !last || !(m[0] === last[1] && m[1] === last[0]); });
        if (!ms.length) break; var m = ms[Math.floor(r() * ms.length)]; s = apply(s, m[0], m[1]); last = m; if (isSolved(s)) break;
      }
      var d = dfs(s, budget); if (d.solvable) decided++; else if (!d.aborted) { decided++; traps++; }
    }
    return { score: decided ? +(traps / decided).toFixed(4) : null, traps: traps, decided: decided, playouts: N };
  }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // Replays a move list with the real rules. Tracks hidden-ball reveal (move number at which each '?' becomes a top ball).
  function replay(stage, path) {
    var s = init(stage), ids = s.t.map(function (t, i) { return t.map(function (_, j) { return i + ':' + j; }); });
    var hid = {}; (stage.hidden || []).forEach(function (h) { hid[h[0] + ':' + h[1]] = -1; });
    function reveal(mv) { ids.forEach(function (t) { var top = t[t.length - 1]; if (top !== undefined && hid[top] === -1) hid[top] = mv; }); }
    Object.keys(hid).forEach(function (h) { var p = h.split(':').map(Number); if (p[1] === stage.tubes[p[0]].length - 1) hid[h] = 'TOP_AT_START'; });
    for (var i = 0; i < path.length; i++) {
      var a = path[i][0], b = path[i][1];
      if (!canMove(s, a, b)) return { ok: false, failedAt: i, reason: 'illegal move ' + a + '->' + b };
      var ball = s.t[a][s.t[a].length - 1], cnt = moveCount(s, a, b);
      var unlock = isKey(ball) && s.lock[b] === ball; s = apply(s, a, b); for (var q = 0; q < cnt; q++) { var id = ids[a].pop(); if (q > 0 && hid[id] === -1) hid[id] = 'MOVED_HIDDEN'; if (!unlock) ids[b].push(id); } // v7: a '?' bird never rides along in a run (the game stops the run at it)
      reveal(i + 1);
    }
    return { ok: true, solved: isSolved(s), reveals: hid, state: s };
  }
  function firstMoveOptions(stage) { return moves(init(stage), false).length; }
  function completeAtStart(stage) { var s = init(stage); for (var i = 0; i < s.t.length; i++) if (isDone(s, i)) return true; return false; }
  SP.engine = { init: init, canMove: canMove, apply: apply, moveCount: moveCount, moves: moves, isSolved: isSolved, isDone: isDone, key: key, solve: solve, replay: replay, firstMoveOptions: firstMoveOptions, completeAtStart: completeAtStart, isKey: isKey, dfs: dfs, deadEndScore: deadEndScore };
})();
if (typeof module !== 'undefined') module.exports = SP.engine;
