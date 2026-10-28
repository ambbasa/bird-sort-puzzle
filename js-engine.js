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
//  - v8.0 M1 cage (GDD v8 §3): stage.cages = [{tube, from, to, n}] (slot indices bottom=0, contiguous, n 1..3). Caged birds can't
//    leave, nothing lands on a caged top, a run stops at the cage edge, a caged tube is never complete. Every tube newly completed
//    by a player move counts the open-counter of every cage down by 1; at 0 the cage disappears (birds become normal). A tube that
//    becomes complete by a cage opening does not count (no chain). Solved = no cage left. State: s.cage[i] = null | {f, t, n}.
//  - v8.1 M3 egg: stage.eggs = [{tube, at, n}] (slot holds the egg's real colour). An egg can't leave, a run stops at it, a bird
//    may land on an egg top only if it is the egg's colour, an egg tube is never complete. Every completion by a player move counts
//    eggs down like cages; at 0 the egg hatches into a normal bird (a completion made by hatching does not count: no chain).
//  - v8.1 M4 sleep: stage.sleep = [[tube, at], ...], stage.alarm = colour (alarmAt = [tube, at] is the badge bird for the UI).
//    A sleeping bird can't leave and stops a run; birds may land on it. As soon as any tube of the alarm colour is complete,
//    every sleeper wakes. State: s.egg = [{i,j,n}], s.slp = [[i,j]], s.alarm, s.al = [i,j] (badge position, not part of key()).
var SP = (typeof window !== 'undefined') ? (window.SP = window.SP || {}) : (global.SP = global.SP || {});
(function () {
  var FULL = 4;
  function isKey(b) { return typeof b === 'string'; }
  function init(stage) {
    var n = stage.tubes.length, caps = stage.caps || stage.tubes.map(function () { return FULL; });
    var lockOf = new Array(n).fill(null); (stage.locks || []).forEach(function (l) { lockOf[l.tube] = l.key; });
    var st = { t: stage.tubes.map(function (x) { return x.slice(); }), cap: caps.slice(), lock: lockOf };
    if (stage.cages && stage.cages.length) { st.cage = new Array(n).fill(null); stage.cages.forEach(function (c) { st.cage[c.tube] = { f: c.from, t: c.to, n: c.n }; }); }
    if (stage.eggs && stage.eggs.length) st.egg = stage.eggs.map(function (e) { return { i: e.tube, j: e.at, n: e.n }; });
    if (stage.sleep && stage.sleep.length) { st.slp = stage.sleep.map(function (z) { return [z[0], z[1]]; }); st.alarm = stage.alarm; st.al = stage.alarmAt ? stage.alarmAt.slice() : null; }
    if (st.egg && stage.brood) st.brood = 1; // v8.2 M3' brooding eggs (C.features.eggBrood)
    if (stage.thorn && stage.thorn.length) st.th = stage.thorn.slice().sort(function (a, b) { return a - b; }); // v8.2 M7 thorn nests (tube ids)
    if (stage.ice && stage.ice.length) st.ice = stage.ice.map(function (z) { return { i: z.tube, n: z.n || 2 }; }); // v8.2 M8 frozen perches
    if (stage.bomb) st.bomb = { i: stage.bomb.tube, j: stage.bomb.at, n: stage.bomb.n }; // v8.2 M6 bomb bird (colour = the bird at i,j)
    return st;
  }
  function clone(s) { var c = { t: s.t.map(function (x) { return x.slice(); }), cap: s.cap, lock: s.lock.slice() }; if (s.cage) c.cage = s.cage.map(function (k) { return k ? { f: k.f, t: k.t, n: k.n } : null; });
    if (s.egg) c.egg = s.egg.map(function (e) { return { i: e.i, j: e.j, n: e.n }; }); if (s.slp) { c.slp = s.slp.map(function (z) { return z.slice(); }); c.alarm = s.alarm; } if (s.al) c.al = s.al.slice();
    if (s.brood) c.brood = 1; if (s.th) c.th = s.th.slice(); if (s.ice) c.ice = s.ice.map(function (z) { return { i: z.i, n: z.n }; }); if (s.bomb) c.bomb = { i: s.bomb.i, j: s.bomb.j, n: s.bomb.n }; if (s.boom) c.boom = 1; return c; }
  function thornAt(s, i) { return !!s.th && s.th.indexOf(i) >= 0; }
  function iceAt(s, i) { if (s.ice) for (var q = 0; q < s.ice.length; q++) if (s.ice[q].i === i) return s.ice[q]; return null; }
  function bombAt(s, i, j) { return !!s.bomb && s.bomb.i === i && s.bomb.j === j; }
  function eggAt(s, i, j) { if (s.egg) for (var q = 0; q < s.egg.length; q++) if (s.egg[q].i === i && s.egg[q].j === j) return s.egg[q]; return null; }
  function slpAt(s, i, j) { if (s.slp) for (var q = 0; q < s.slp.length; q++) if (s.slp[q][0] === i && s.slp[q][1] === j) return true; return false; }
  function low(s, i) { var lo = s.cage && s.cage[i] ? s.cage[i].t + 1 : 0, q; // lowest movable slot of tube i (everything below is fixed)
    if (s.egg) for (q = 0; q < s.egg.length; q++) if (s.egg[q].i === i && s.egg[q].j + 1 > lo) lo = s.egg[q].j + 1;
    if (s.slp) for (q = 0; q < s.slp.length; q++) if (s.slp[q][0] === i && s.slp[q][1] + 1 > lo) lo = s.slp[q][1] + 1; return lo; }
  function fixedTop(s, i) { if (s.ice && iceAt(s, i) && s.t[i].length) return true; return (!!s.cage || !!s.egg || !!s.slp) && s.t[i].length > 0 && low(s, i) >= s.t[i].length; } // top bird is caged/egg/asleep
  function cagedTop(s, i) { var k = s.cage && s.cage[i]; return !!k && k.t >= s.t[i].length - 1; } // the tube's top bird is inside its cage
  function isDone(s, i) { if (s.cage && s.cage[i]) return false; if (s.egg) for (var q = 0; q < s.egg.length; q++) if (s.egg[q].i === i) return false; var t = s.t[i]; if (s.cap[i] < FULL || t.length !== FULL || isKey(t[0])) return false; for (var k = 1; k < FULL; k++) if (t[k] !== t[0]) return false; return true; }
  function isSolved(s) { if (s.boom) return false;
    for (var i = 0; i < s.t.length; i++) { if (s.lock[i] !== null || (s.cage && s.cage[i])) return false; if (s.t[i].length && !isDone(s, i)) return false; }
    return true;
  }
  function canMove(s, a, b) {
    if (a === b || s.lock[a] !== null || s.boom) return false;
    if (s.th && thornAt(s, b)) return false; // v8.2 M7: nothing lands on a thorn nest
    if (s.ice && iceAt(s, a)) return false; // v8.2 M8: a frozen perch can't be left
    var A = s.t[a], B = s.t[b]; if (!A.length || isDone(s, a) || fixedTop(s, a)) return false;
    if (B.length && cagedTop(s, b)) return false; // v8 M1: nothing lands on a caged top
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
    var run = 0, lo = low(s, a); for (var i = A.length - 1; i >= lo && A[i] === ball; i--) run++; // v8 M1: run stops at the cage
    return Math.max(1, Math.min(run, s.cap[b] - s.t[b].length));
  }
  function apply(s, a, b, cnt) { // returns new state (does not check legality); cnt: optional cap on the run size (game: '?' birds)
    var k = Math.min(cnt || 99, moveCount(s, a, b)), n = clone(s), ball = n.t[a].pop();
    if (isKey(ball) && n.lock[b] === ball) { n.lock[b] = null; if (n.brood || n.th || n.ice || n.bomb) post(s, n, a, b, 99, 1); return n; } // key + lock disappear together
    var LA = s.t[a].length, LB = s.t[b].length;
    n.t[b].push(ball); for (var i = 1; i < k; i++) n.t[b].push(n.t[a].pop());
    if (n.al && n.al[0] === a && n.al[1] >= LA - k) n.al = [b, LB + (LA - 1 - n.al[1])]; // alarm badge rides with its bird
    if ((n.cage || n.egg) && isDone(n, b)) { if (n.cage) tick(n, 1); if (n.egg && !n.brood) hatch(n, 1); } // v8 M1/M3: a completion by this move counts cages and eggs down
    if (n.slp) wake(n);
    if (n.brood || n.th || n.ice || n.bomb) post(s, n, a, b, LB, k);
    return n;
  }
  // v8.2 after-move rules (only states that carry v8.2 fields reach here; v8.1 states are untouched).
  // seat: [tube, firstNewSlot] = slots >= firstNewSlot of tube were just filled by this move (they are not 'brooding' yet).
  function post(s, n, a, b, LB, k, swapAt) {
    var done = (n.ice || n.bomb) ? isDone(n, b) && !isDone(s, b) : false;
    if (n.brood && n.egg) { var out = [];
      n.egg = n.egg.filter(function (e) { var up = n.t[e.i][e.j + 1], c = n.t[e.i][e.j], fresh = swapAt ? (swapAt[0] === e.i && (swapAt[1] === e.j + 1 || swapAt[1] + 1 === e.j + 1)) : (b === e.i && LB <= e.j + 1);
        if (up === c && !fresh) { e.n -= 1; if (e.n <= 0) { out.push(e); return false; } } return true; });
      if (!n.egg.length) { delete n.egg; delete n.brood; }
      out.forEach(function (e) { if (isDone(n, e.i)) (n.hatchDone = n.hatchDone || []).push(e.i); }); } // flocks completed by hatching: never a combo (GDD M3')
    if (n.th) { n.th = n.th.filter(function (i) { return n.t[i].length > 0; }); if (!n.th.length) delete n.th; }
    if (n.ice) { n.ice = n.ice.filter(function (z) { if (isDone(n, z.i)) return false; if (done) z.n -= 1; return z.n > 0; }); if (!n.ice.length) delete n.ice; }
    if (n.bomb) { var bb = n.bomb, LA = s.t[a].length;
      if (!swapAt) { if (bb.i === a && bb.j >= LA - k) { bb.i = b; bb.j = LB + (LA - 1 - bb.j); } } // the bomb bird rides with its run (like the alarm badge)
      else if (swapAt[0] === bb.i && (bb.j === swapAt[1] || bb.j === swapAt[1] + 1)) bb.j = bb.j === swapAt[1] ? swapAt[1] + 1 : swapAt[1];
      var col = n.t[bb.i][bb.j], ok = false; for (var y = 0; y < n.t.length; y++) if (n.t[y][0] === col && isDone(n, y)) ok = true;
      if (ok) { delete n.bomb; n.defused = 1; } else { bb.n -= 1; if (bb.n <= 0) { bb.n = 0; n.boom = 1; } } }
    if (n.brood && n.egg && !n.boom) valve(n);
  }
  // v8.2 M3' revision (planner 15:31, stage 158 softlock): if an egg is being brooded and the ONLY legal moves left move a brooding bird
  // (off and back never counts), every brooded egg hatches at once (same as a normal hatch; flocks completed by it -> hatchDone, never a combo).
  function valve(n) { var br = n.egg.filter(function (e) { var c = n.t[e.i][e.j]; return n.t[e.i][e.j + 1] === c; }); if (!br.length) return;
    var other = moves(n, false).some(function (m) { var a = m[0], k = moveCount(n, a, m[1]); return !br.some(function (e) { return e.i === a && n.t[a].length - k <= e.j + 1; }); }); // a move lifts the brooder iff its run reaches slot j+1
    if (other) return; n.egg = n.egg.filter(function (e) { return br.indexOf(e) < 0; }); if (!n.egg.length) { delete n.egg; delete n.brood; }
    br.forEach(function (e) { if (isDone(n, e.i)) (n.hatchDone = n.hatchDone || []).push(e.i); }); n.valve = 1; }
  // v8.2 M9 '까미' swap booster: swaps the two adjacent birds at slots j and j+1 of tube i (one move). Not used by the solver.
  function canSwap(s, i, j) { var t = s.t[i]; if (!t || j < 0 || j + 1 >= t.length || s.lock[i] !== null || s.boom) return false; if (t[j] === t[j + 1] || isKey(t[j]) || isKey(t[j + 1])) return false;
    if (isDone(s, i)) return false; if (j < low(s, i)) return false; // caged / egg / sleeping birds (and everything under them) are excluded
    if (s.bomb && s.bomb.i === i && (s.bomb.j === j || s.bomb.j === j + 1)) return false; if (s.ice && iceAt(s, i)) return false; return true; }
  function swap(s, i, j) { var n = clone(s), t = n.t[i], x = t[j]; t[j] = t[j + 1]; t[j + 1] = x;
    if ((n.cage || n.egg) && isDone(n, i)) { if (n.cage) tick(n, 1); if (n.egg && !n.brood) hatch(n, 1); }
    if (n.slp) wake(n); if (n.brood || n.th || n.ice || n.bomb) post(s, n, i, i, t.length, 0, [i, j]); return n; }
  function tick(n, c) { var open = []; for (var i = 0; i < n.cage.length; i++) { var k = n.cage[i]; if (!k) continue; k.n -= c; if (k.n <= 0) { n.cage[i] = null; open.push(i); } }
    if (!n.cage.some(Boolean)) delete n.cage; return open; }
  function hatch(n, c) { var out = []; n.egg = n.egg.filter(function (e) { e.n -= c; if (e.n <= 0) { out.push(e); return false; } return true; }); if (!n.egg.length) delete n.egg; return out; }
  function wake(n) { for (var i = 0; i < n.t.length; i++) if (n.t[i][0] === n.alarm && isDone(n, i)) { delete n.slp; delete n.alarm; return true; } return false; }
  function completions(s, n) { var c = 0; for (var i = 0; i < n.t.length; i++) if (isDone(n, i) && !isDone(s, i)) c++; return c; } // QA helper
  function moves(s, prune) {
    var out = [], n = s.t.length;
    for (var a = 0; a < n; a++) {
      var A = s.t[a]; if (!A.length || s.lock[a] !== null || isDone(s, a) || fixedTop(s, a)) continue;
      var mono = prune && !(s.th && thornAt(s, a)) && !(s.cage && s.cage[a]) && !(low(s, a) > 0) && !isKey(A[0]) && A.every(function (c) { return c === A[0]; });
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
      var str = s.t[i].join(','), cg = s.cage && s.cage[i]; if (cg) str += '~' + cg.f + '-' + cg.t + 'n' + cg.n; // v8: cage is part of the state key (G10)
      if (s.egg) for (var q = 0; q < s.egg.length; q++) if (s.egg[q].i === i) str += '^' + s.egg[q].j + 'n' + s.egg[q].n; // v8.1: eggs / sleepers too
      if (s.slp) for (q = 0; q < s.slp.length; q++) if (s.slp[q][0] === i) str += 'z' + s.slp[q][1];
      if (s.th && thornAt(s, i)) str += 'T'; if (s.ice) { var iz = iceAt(s, i); if (iz) str += 'I' + iz.n; } if (s.bomb && s.bomb.i === i) str += 'B' + s.bomb.j + 'n' + s.bomb.n;
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
  // v8.0.1: resumable DFS for the in-game dead-end check. job.step(n) explores up to n more states and returns 'solvable',
  // 'unsolvable' (whole reachable space exhausted = proof) or 'running'; the caller slices it over idle time (never blocks a frame).
  function dfsJob(stage, cap) { cap = cap || 3e6; var s0 = stage.t ? stage : init(stage), seen = new Set([key(s0)]), stack = [{ s: s0, ms: null, i: 0 }], res = isSolved(s0) ? 'solvable' : 'running';
    return { explored: function () { return seen.size; }, step: function (n) { if (res !== 'running') return res; var end = seen.size + n;
      while (stack.length) { var top = stack[stack.length - 1]; if (!top.ms) top.ms = moves(top.s, true).sort(function (x, y) { return score(top.s, y) - score(top.s, x); });
        if (top.i >= top.ms.length) { stack.pop(); continue; } var m = top.ms[top.i++], nx = apply(top.s, m[0], m[1]), k = key(nx); if (seen.has(k)) continue; seen.add(k);
        if (isSolved(nx)) return (res = 'solvable'); stack.push({ s: nx, ms: null, i: 0 }); if (seen.size >= cap) return (res = 'gaveup'); if (seen.size >= end) return 'running'; }
      return (res = 'unsolvable'); } }; }
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
    if ((s.cage && s.cage.some(Boolean)) || s.egg || s.slp) { var nn = apply(s, m[0], m[1]); if (isDone(nn, m[1])) return 20; }
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
  function ser(s) { var a = [s.t, s.cap, s.lock, s.cage || null]; if (s.egg || s.slp || s.al) a.push(s.egg || null, s.slp || null, s.alarm === undefined ? null : s.alarm, s.al || null); if (s.th || s.ice || s.bomb || s.boom) a.push(s.th || null, s.ice || null, s.bomb || null, s.boom || 0); return JSON.stringify(a); } // v8 G3: state serialization for undo round-trip tests
  SP.engine = { swap: swap, canSwap: canSwap, thornAt: thornAt, iceAt: iceAt, bombAt: bombAt, dfsJob: dfsJob, clone: clone, fixedTop: fixedTop, low: low, eggAt: eggAt, slpAt: slpAt, ser: ser, cagedTop: cagedTop, completions: completions, init: init, canMove: canMove, apply: apply, moveCount: moveCount, moves: moves, isSolved: isSolved, isDone: isDone, key: key, solve: solve, replay: replay, firstMoveOptions: firstMoveOptions, completeAtStart: completeAtStart, isKey: isKey, dfs: dfs, deadEndScore: deadEndScore };
})();
if (typeof module !== 'undefined') module.exports = SP.engine;
