SP.platform.whenReady(function () { // L5: runs once the platform adapter has loaded the (user-keyed) save
  var C = SP.CONFIG, core = SP.core, E = SP.engine, GA = C.gimmickAssets, $ = function (id) { return document.getElementById(id); };
  var LAST = Math.min(C.lastStage || C.maxStage, Math.max.apply(null, Object.keys(SP.STAGES).map(Number))), KEY = 'sortpuzzle.v1', STAR = $('staricon').innerHTML;
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var save = JSON.parse(SP.store.get(KEY) || 'null') || { unlocked: 1, stars: {}, coins: 0, current: 1 };
  save.attempt = save.attempt || {}; // per-stage consumables (GDD v0.2): { undoLeft, addedTube } persist across restarts/reloads
  var DEBUG = false;
  var A11Y_KEY = 'a11y.symbolsLarge'; // DESIGN.md §8: default off
  var symbolsLarge = SP.store.get(A11Y_KEY) === 'true';
  document.documentElement.classList.toggle('symbols-large', symbolsLarge);
  if (save.theme) document.documentElement.dataset.theme = save.theme;
  function persist() { SP.store.set(KEY, JSON.stringify(save)); }
  var S, fx = {}, sfx = SP.sfx || { play: function () {} };
  // DESIGN §6 move: ball flies along a parabola (220–340ms), then drop-bounce. Landing sounds/glow wait for touchdown.
  var pend = null, flights = []; SP._flights = 0;
  function snd(name, arg) { if (pend) pend.push([name, arg]); else sfx.play(name, arg); }
  // Feedback v2 flight: small hop (18%) -> parabolic arc over the perch tops -> decelerating arrival with a slight overshoot bounce.
  // Total clamp(350, 330 + 0.15*|dx|, 450) ms. Side-view flap frames (mirrored to the travel direction) when C.birds.side.enabled,
  // else front frames; the real (front-view) bird reappears on touchdown. Several flights may be in the air at once: every render
  // re-binds each flight to its destination slot (retarget), and a bird picked up mid-air launches from where its flyer is now.
  var BF = C.birds;
  function birdFrame(c, fr) { return BF.pattern.replace('{color}', C.palette[c].key).replace('{frame}', fr); }
  function sideKey(c) { return C.palette[c] ? C.palette[c].key : E.isKey(c) ? 'key-' + C.gimmickAssets.pair[c].pair : 'hidden'; }
  function sideFrame(k, i) { return BF.side.pattern.replace('{key}', k).replace('{n}', BF.side.frames[i]); }
  function finishFlight(f, instant) { var k = flights.indexOf(f); if (k < 0) return; flights.splice(k, 1); clearInterval(f.timer); if (f.anim) f.anim.cancel(); f.clone.remove(); f.land(instant); }
  function cancelFlights() { flights.slice().forEach(function (f) { finishFlight(f, true); }); }
  function rebind(b) { // after a re-render: hide the new DOM bird each flyer is heading to; drop flights whose target vanished
    flights.slice().forEach(function (f) { var t = b.querySelectorAll('.tube')[f.to], w = t && t.querySelectorAll('.ballwrap')[f.slot];
      if (!w || S.tubes[f.to][f.slot] !== f.color) return finishFlight(f, true); f.ball = w; f.tube = t; w.style.visibility = 'hidden'; });
  }
  function fly(from, to, ball, tube, fresh, sounds, color, slot) {
    var r = ball.getBoundingClientRect(), B = r.width, sx = from.left, sy = from.top, ex = r.left, ey = r.top, dx = ex - sx, adx = Math.abs(dx);
    var perchTop = Math.min.apply(null, [].map.call(document.querySelectorAll('#board .tube'), function (t) { return t.getBoundingClientRect().top; }));
    var hy = sy - Math.max(14, B * 0.45), ypk = Math.min(perchTop, hy, ey) - 0.5 * B - Math.max(10, Math.min(40, 0.1 * adx));
    var cx = (sx + ex) / 2, cy = 2 * ypk - (hy + ey) / 2, tot = Math.round(Math.max(BF.flightMin, Math.min(BF.flightMax, 330 + 0.15 * adx)));
    var side = !!(BF.side && BF.side.enabled) && color != null, H = 0.18, ARR = 0.86, kf = [], N = 14;
    var T = function (x, y, a) { return 'translate(' + x + 'px,' + y + 'px) rotate(' + a + 'deg)'; };
    kf.push({ offset: 0, transform: T(sx, sy, 0), easing: 'cubic-bezier(.2,.8,.3,1)' });
    for (var k = 0; k <= N; k++) { var t = k / N, e = 1 - Math.pow(1 - t, 2.2), tt = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; tt = 0.55 * tt + 0.45 * e; var u = 1 - tt; // decelerate toward the target
      var x = u * u * sx + 2 * u * tt * cx + tt * tt * ex, y = u * u * hy + 2 * u * tt * cy + tt * tt * ey;
      var vx = 2 * u * (cx - sx) + 2 * tt * (ex - cx), vy = 2 * u * (cy - hy) + 2 * tt * (ey - cy), a = k === N ? 0 : (vx < 0 ? -1 : 1) * Math.max(-20, Math.min(20, Math.atan2(vy, Math.abs(vx) || 1e-6) * 180 / Math.PI * 0.35));
      kf.push({ offset: H + t * (ARR - H), transform: T(x, y, a) }); }
    kf.push({ offset: 0.93, transform: T(ex, ey + B * 0.08, 0) + ' scale(1.08,.9)', easing: 'ease-out' }); // touchdown squash
    kf.push({ offset: 1, transform: T(ex, ey, 0) + ' scale(1,1)' });
    // flyer = wrapper (path + tilt) > img (.bird-side, mirrored with .bird-side--left when flying left; hidden '?' never mirrored)
    var c = document.createElement('div'); c.className = 'ball flyer'; c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
    var im = document.createElement('img'); im.alt = ''; im.draggable = false; c.appendChild(im);
    var sk = side ? sideKey(color) : null, front = C.palette[color] ? birdFrame(color, BF.foldFrame) : ball.firstChild.src;
    if (side) { im.className = 'bird-side bird-side-img' + (dx < 0 && sk !== 'hidden' ? ' bird-side--left' : ''); im.dataset.kind = sk; im.src = sideFrame(sk, 0); }
    else { im.className = 'ball bird'; im.src = front; }
    document.body.appendChild(c); ball.style.visibility = 'hidden'; SP._flights++;
    var f = { clone: c, to: to, slot: slot, color: color, ball: ball, tube: tube, side: side, land: function (instant) {
      f.ball.style.visibility = ''; if (!instant) { f.ball.className += ' dropping'; }
      if (fresh) { f.tube.classList.add('fresh'); if (!instant) sparkle(f.tube); }
      sounds.forEach(function (a) { sfx.play(a[0], a[1]); });
    } };
    var t0 = performance.now(), fi = 0, fms = side ? BF.side.frameMs : BF.frameMs;
    f.timer = setInterval(function () { // side flap 1-2-3-4 at 62.5ms (16fps, 250ms/beat); front view (fold) for the touchdown
      var p = (performance.now() - t0) / tot; if (p > ARR * 0.95) { im.className = 'ball bird'; im.removeAttribute('data-kind'); im.src = front; clearInterval(f.timer); return; }
      fi = (fi + 1) % 4; im.src = side ? sideFrame(sk, fi) : (C.palette[color] ? birdFrame(color, BF.frames[fi]) : front); if (fi === 2) SP._flaps = (SP._flaps || 0) + 1; }, fms);
    flights.push(f);
    if (c.animate) { f.anim = c.animate(kf, { duration: tot, easing: 'linear', fill: 'forwards' }); f.anim.onfinish = function () { f.anim = null; finishFlight(f, false); }; }
    else finishFlight(f, false);
  }
  // Gimmick state (js-engine.js rules): S.caps (small tubes), S.lock (per tube key id or null), S.mask (per tube: true = '?' ball)
  function est() { return { t: S.tubes, cap: S.caps, lock: S.lock }; }
  function done(i) { return E.isDone(est(), i); }
  function snap() { return { tubes: S.tubes.map(function (t) { return t.slice(); }), caps: S.caps.slice(), lock: S.lock.slice(), mask: S.mask.map(function (m) { return m.slice(); }) }; }
  function stageOf() { return { tubes: S.tubes, caps: S.caps, locks: S.lock.map(function (k, i) { return k ? { tube: i, key: k } : null; }).filter(Boolean) }; }
  function revealTops() { var r = []; S.mask.forEach(function (m, i) { if (m.length && m[m.length - 1]) { m[m.length - 1] = false; r.push(i); } }); return r; }
  function load(n) {
    cancelFlights();
    var sb = false;
    var g = SP.STAGES[n], a = sb ? (S && S.n === n && S.a.sandbox ? S.a : { undoLeft: C.freeUndos, addedTube: false, sandbox: true }) : (save.attempt[n] || (save.attempt[n] = { undoLeft: C.freeUndos, addedTube: false }));
    var tubes = g.tubes.map(function (t) { return t.slice(); });
    var caps = g.caps ? g.caps.slice() : tubes.map(function () { return 4; }), lock = tubes.map(function () { return null; });
    (g.locks || []).forEach(function (l) { lock[l.tube] = l.key; });
    var mask = tubes.map(function (t) { return t.map(function () { return false; }); }); (g.hidden || []).forEach(function (h) { mask[h[0]][h[1]] = true; });
    if (a.addedTube) { tubes.push([]); caps.push(4); lock.push(null); mask.push([]); } // purchased tube survives restart
    S = { n: n, g: g, a: a, tubes: tubes, caps: caps, lock: lock, mask: mask, hist: [], sel: -1, path: 0, moves: 0, lastDone: -99, combo: 0, chain: 0, banked: 0, won: false, locked: false, hint: null };
    applyTheme(n, sb);
    if (!sb) { save.current = n; persist(); } fx = {}; render();
  }
  // Feedback v2 themes: theme = floor((stage-1)/100) mod themes.length (cycles forever for 201+). Background = designer file
  // (C.art.themeBg[key], detected by tools/sync-art.js) else the config gradient. First arrival in a new 100-block -> toast once.
  function applyTheme(n, sb) {
    var blk = Math.floor((n - 1) / 100), th = C.themes[blk % C.themes.length];
    C.themes.forEach(function (t) { document.body.classList.remove('theme-' + t.key); }); document.body.classList.add('theme-' + th.key);
    save.themesSeen = save.themesSeen || [0];
    if (blk > 0 && save.themesSeen.indexOf(blk) < 0 && !sb) { save.themesSeen.push(blk); persist(); toast('새 테마 해금! ' + th.name + ' 🎉'); }
  }
  SP._themeFor = function (n) { return C.themes[Math.floor((n - 1) / 100) % C.themes.length].key; }; // QA hook
  function toast(msg) { var t = $('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function starsFor(moves, min, n) { var three = n >= 101 ? C.stars.threeFrom101 : n >= 21 ? C.stars.threeFrom21 : C.stars.three; return moves <= min * three ? 3 : moves <= min * C.stars.two ? 2 : 1; }
  function starsHtml(k) { var h = ''; for (var i = 0; i < 3; i++) h += '<span class="' + (i < k ? '' : 'off') + '" style="animation-delay:' + (i * 150) + 'ms">' + STAR + '</span>'; return h; }
  function rows(n) { // DESIGN §4 grid rule
    if (n <= 4) return [n]; if (n <= 10) return [Math.ceil(n / 2), Math.floor(n / 2)];
    var a = Math.ceil(n / 3), b = Math.ceil((n - a) / 2); return [a, b, n - a - b];
  }
  function render() {
    $('stage').textContent = (S.g.rest ? '휴식 · ' : '') + '레벨 ' + S.n;
    $('hudstars').innerHTML = starsHtml(S.moves === 0 ? 3 : starsFor(S.moves, S.g.min, S.n));
    $('moves').textContent = '이동 ' + S.moves + ' · 최소 ' + S.g.min + ' (되돌리기도 1수)';
    var tutorialHint = S.g.tutorial && !S.won ? nextMove() : null, h = S.hint || tutorialHint;
    var stuck = !S.won && isStuck(); if (reduced || S.won) cancelFlights(); var fl = !reduced && fx.fly && fx.fly.from ? fx.fly : null, flyBall = null;
    var b = $('board'); b.innerHTML = '';
    fitBalls(b);
    var idx = 0;
    rows(S.tubes.length).forEach(function (cnt) {
      var r = document.createElement('div'); r.className = 'row'; b.appendChild(r);
      for (var k = 0; k < cnt; k++, idx++) (function (i) {
        var t = S.tubes[i], d = document.createElement('div'), isd = done(i), small = S.caps[i] < 4, lk = S.lock[i];
        d.className = 'tube perch' + (isd ? ' complete' : '') + (fx.fresh === i && !fl ? ' fresh' : '') + (fx.shake === i ? ' shake' : '') + (small ? ' small' : '') + (small && fx.full === i ? ' full' : '') + (lk ? ' locked' : '') + (fx.unlock && fx.unlock.tube === i ? ' locked' : '');
        if (isd) { var bd = document.createElement('img'); bd.className = 'badge'; bd.src = C.assets.badge; bd.alt = ''; d.appendChild(bd); }
        if (small) { var cb = document.createElement('img'); cb.className = 'capbadge'; cb.src = GA.smallTube.badge; cb.alt = '용량 3'; d.appendChild(cb); } // DESIGN 13.4: no complete glow/check on small tubes
        var lockKey = lk || (fx.unlock && fx.unlock.tube === i ? fx.unlock.key : null);
        if (lockKey) { var pr = GA.pair[lockKey], ov = document.createElement('img'); ov.className = 'lock-overlay'; ov.src = small ? BF.perch.perchSmallLocked : BF.perch.perchLocked; ov.alt = ''; d.appendChild(ov);
          var lo = document.createElement('img'); lo.className = 'lock'; lo.src = lk ? pr.lock : pr.lock; lo.alt = '자물쇠 ' + pr.symbol; d.appendChild(lo);
        }
        var st = document.createElement('div'); st.className = 'stack';
        t.forEach(function (c, j) {
          var w = document.createElement('span'); w.className = 'ballwrap ball';
          var im = document.createElement('img'); im.className = 'ball'; im.draggable = false; w.appendChild(im);
          var real = ballSrc(c), revealing = fx.reveal && fx.reveal.indexOf(i) >= 0 && j === t.length - 1;
          if (S.mask[i][j] || revealing) { im.src = BF.hidden; im.alt = '숨은 공'; }
          else { im.src = real.src; im.alt = real.alt; }
          im.className += ' bird'; if (!E.isKey(c) && !S.mask[i][j] && !revealing) { if (isd && C.palette[c]) im.src = BF.expr(c, 'happy'); else if (stuck && C.palette[c]) im.src = BF.expr(c, 'sad'); }
          if (symbolsLarge && !S.mask[i][j] && C.palette[c]) { var bs = document.createElement('img'); bs.className = 'ball bigsym'; bs.alt = ''; bs.src = C.palette[c].fileLargeSymbol; w.appendChild(bs); } // a11y: big symbol chip on the belly (bird art has no large-symbol set)
          if (revealing) { if (reduced) { im.src = real.src; im.alt = real.alt; } else { im.className += ' hidden-reveal'; setTimeout(function () { im.src = real.src; im.alt = real.alt; }, 210); } } // DESIGN 13.1: swap at 210ms
          if (E.isKey(c)) { im.className += ' key-ready'; if (!S.mask[i][j]) w.appendChild(pairSym(GA.pair[c].symbol, 'keysym')); }
          var top = j === t.length - 1;
          if (top && i === S.sel) w.className += ' lifted';
          if (top && fx.drop === i) { if (fl) flyBall = w; else w.className += ' dropping'; }
          st.appendChild(w);
        });
        d.appendChild(st);
        if (h && ((S.sel < 0 && h[0] === i) || (S.sel === h[0] && h[1] === i))) { var m = document.createElement('div'); m.className = 'hintmark'; m.textContent = '👆'; d.appendChild(m); }
        if (fx.fresh === i && !reduced && !fl) sparkle(d);
        d.addEventListener('pointerdown', function (e) { e.preventDefault(); tap(i); });
        r.appendChild(d);
      })(idx);
    });
    placeLockSyms(b); rebind(b);
    if (fx.unlock) { consume(fx.keyFrom, fx.unlock.tube, fx.keySrc, fx.unlock.solved); fl = null; fx.fly = null; }
    if (fl && flyBall) { var ln = S.tubes[fl.to].length - 1; fly(fl.from, fl.to, flyBall, flyBall.parentNode.parentNode, fx.fresh === fl.to, fl.sounds, S.mask[fl.to][ln] ? null : S.tubes[fl.to][ln], ln); }
    else if (fx.fly && fx.fly.sounds) fx.fly.sounds.forEach(function (a) { sfx.play(a[0], a[1]); });
    btns(); $('hint').disabled = S.locked; $('restart').disabled = S.locked;
    fx = {};
  }
  // QA N1: min 8px pair symbol. The art's own key/lock symbol shrinks with the tubes; when it would render < 8px (.sym-boost)
  // a code-drawn copy of the same shape (art files untouched) is overlaid at the symbol's spot, never smaller than --sym-min.
  var SYM = { circle: '<circle cx="6" cy="6" r="4.6"/>', triangle: '<polygon points="6,1 11.2,10.6 0.8,10.6"/>', square: '<rect x="1.6" y="1.6" width="8.8" height="8.8"/>' };
  function pairSym(sym, cls) { var e = document.createElement('span'); e.className = 'pairsym ' + cls; e.setAttribute('aria-hidden', 'true');
    e.innerHTML = '<svg viewBox="-1 -1 14 14" width="100%" height="100%"><circle cx="6" cy="6" r="6.6" fill="#14172A" stroke="#0B0D18" stroke-width="1"/><g fill="#fff" transform="translate(6 6) scale(.62) translate(-6 -6)">' + (SYM[sym] || SYM.circle) + '</g></svg>'; return e; } // same look as DESIGN 13.8 badge
  function placeLockSyms(b) { // (unused since DESIGN 13.8: lock badge is >= 50% of lock width) // lock symbol sits at (50%, 69%) of the lock image (lock-*.svg viewBox 64x84, symbol at 32,58)
    b.querySelectorAll('.tube .locksym').forEach(function (e) { var lo = e.parentNode.querySelector('.lock'); if (lo) e.style.top = (lo.offsetTop + lo.offsetHeight * 58 / 84) + 'px'; });
  }
  function isStuck() { // DESIGN 14.8 sad face: no legal move left (any move that changes nothing useful is still a move)
    var n = S.tubes.length; for (var a = 0; a < n; a++) { if (!S.tubes[a].length || done(a) || S.lock[a]) continue; for (var b = 0; b < n; b++) if (a !== b && E.canMove(est(), a, b)) return false; } return true; }
  function btns() { // L2: rewarded-ad buttons are disabled while no rewarded ad is loaded
    var rw = SP.ads.rewardedReady();
    $('undocnt').textContent = S.a.undoLeft > 0 ? S.a.undoLeft : '▶AD';
    $('undo').disabled = !S.hist.length || S.locked || (S.a.undoLeft <= 0 && !rw); $('add').disabled = S.a.addedTube || S.locked || !rw;
    $('add').title = rw ? '' : '광고를 불러오는 중이에요';
  }
  // QA M1: size balls so the tube grid fits the board's real height/width (safe areas, HUD, buttons, banner excluded) for any tube count
  function fitBalls(b) {
    var rs = rows(S.tubes.length), n = rs.length, c = Math.max.apply(null, rs), cs = getComputedStyle(b);
    var h = b.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), w = b.clientWidth - 16;
    // per row: tube 4.9b (+ lift/badge room 0.5b) ; between rows: gap 0.6b+6 ; per tube width 1.3b + border 6 + gap 12
    var g = n > 2 ? 0.35 : 0.6, gp = n > 2 ? 3 : 6, fromH = (h - (n - 1) * gp - 12) / (n * 6.0 + (n - 1) * g), fromW = (w - (c - 1) * 8) / (c * 80 / 56); // perch: 80u wide, (60*4+80)u tall per 56u bird
    var size = Math.floor(Math.max(18, Math.min(44, fromH, fromW, n === 1 ? 44 : 44)));
    document.documentElement.style.setProperty('--ball-size', size + 'px');
    b.style.gap = Math.round(size * g + gp) + 'px'; // QA N2: tighter row gap for 3-row layouts
    document.documentElement.classList.toggle('sym-boost', size * 0.34 < 8); // QA N1 + DESIGN 13.8: key symbol badge (34% of ball) would render < 8px -> code fallback
  }
  window.addEventListener('resize', function () { if (S) render(); });
  function ballSrc(c) {
    if (E.isKey(c)) { var pr = GA.pair[c]; return { src: BF.key.replace('{pair}', pr.pair), alt: '열쇠 ' + pr.symbol }; }
    var P = C.palette[c]; return { src: BF.expr(c, 'idle'), alt: P.key + ' ' + P.symbol };
  }
  // DESIGN 13.3 key consume (~1020ms, input locked): 0 lift 140ms -> 140 fly to the lock 360ms -> 500 .key-consume/.lock.consume/.unlocking
  // (520ms; '찰칵' at ~790) -> 1020 remove key+lock+overlay, release input. Reduced motion: no flight, consume-fade 150ms together.
  function consume(fromRect, tubeIdx, keySrc, solved) {
    var d = document.querySelectorAll('#board .tube')[tubeIdx], lo = d && d.querySelector('.lock'), ov = d && d.querySelector('.lock-overlay');
    SP._consumeT0 = performance.now(); // QA hook (timeline checks)
    var S0 = S, T = reduced ? { consume: 0, click: 0, end: 150 } : { consume: 500, click: 790, end: 1020 }, w = null;
    if (!reduced && lo && fromRect) {
      var r = lo.getBoundingClientRect(); w = document.createElement('div'); w.className = 'keyfly'; w.style.width = fromRect.width + 'px'; w.style.height = fromRect.height + 'px';
      var im = document.createElement('img'); im.className = 'ball'; im.src = keySrc; im.alt = ''; w.appendChild(im); document.body.appendChild(w);
      var sx = fromRect.left, sy = fromRect.top, ly = sy - fromRect.height * 0.6, ex = r.left + r.width / 2 - fromRect.width / 2, ey = r.top + r.height / 2 - fromRect.height / 2, ap = Math.min(ly, ey) - 40;
      if (w.animate) w.animate([{ transform: 'translate(' + sx + 'px,' + sy + 'px)' }, { offset: 0.28, transform: 'translate(' + sx + 'px,' + ly + 'px)' },
        { offset: 0.64, transform: 'translate(' + (sx + ex) / 2 + 'px,' + ap + 'px)' }, { transform: 'translate(' + ex + 'px,' + ey + 'px)' }], { duration: 500, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'forwards' });
      else w.style.transform = 'translate(' + ex + 'px,' + ey + 'px)';
    }
    setTimeout(function () { if (w) w.firstChild.classList.add('key-consume'); if (lo) lo.classList.add('consume'); if (d) d.classList.add('unlocking'); }, T.consume);
    setTimeout(function () { sfx.play('click'); }, T.click);
    setTimeout(function () {
      if (w) w.remove(); if (lo) lo.remove(); if (d) d.querySelectorAll('.locksym').forEach(function (x) { x.remove(); }); if (ov) ov.remove(); if (d) d.classList.remove('locked', 'unlocking');
      if (S !== S0) return; // stage changed meanwhile
      if (solved) return win();
      S.locked = false; S.consuming = false; render();
    }, T.end);
  }
  function sparkle(d) { for (var i = 0; i < 5; i++) { var s = document.createElement('i'); s.className = 'spark'; s.style.left = (Math.random() * 100) + '%'; s.style.top = (Math.random() * 90) + '%'; s.style.animationDelay = (i * 30) + 'ms'; d.appendChild(s); } }
  function nextMove() { // stored optimal solution while the player follows it; otherwise BFS (small budget) then DFS fallback
    if (S.path >= 0 && S.g.solution && S.path < S.g.solution.length) return S.g.solution[S.path];
    var st = stageOf(), s = E.solve(st, { limit: 1e5 }); if (s.solvable) return s.path[0] || null;
    var d = E.dfs(st, 1e5); return d.solvable && d.path.length ? d.path[0] : null;
  }
  function tap(i) {
    if (S.locked || SP.ads.isBusy()) return;
    var pickable = function (k) { return S.tubes[k].length && !done(k) && !S.lock[k]; };
    if (S.sel < 0) { if (pickable(i)) { S.sel = i; sfx.play('select'); } else { fx.shake = i; sfx.play('invalid'); } }
    else if (S.sel === i) S.sel = -1;
    else if (E.canMove(est(), S.sel, i)) {
      var from = S.sel, src = document.querySelectorAll('#board .tube')[from], sb = src && src.querySelector('.ballwrap:last-child');
      var air = flights.filter(function (f) { return f.to === from && f.slot === S.tubes[from].length - 1; })[0], airRect = air ? air.clone.getBoundingClientRect() : null; if (air) finishFlight(air, true); // retarget mid-air
      var h = snap(); h.chain = S.chain; h.banked = S.banked; h.combo = S.combo; h.lastDone = S.lastDone; h.path = S.path; S.hist.push(h); pend = []; // R2 + gimmick state snapshot
      var sol = S.g.solution; S.path = S.path >= 0 && sol && sol[S.path] && sol[S.path][0] === from && sol[S.path][1] === i ? S.path + 1 : -1;
      var ball = S.tubes[from][S.tubes[from].length - 1], unlock = E.isKey(ball) && S.lock[i] === ball;
      var ns = E.apply(est(), from, i); S.tubes = ns.t; S.lock = ns.lock; S.mask[from].pop(); if (!unlock) S.mask[i].push(false);
      S.moves++; S.sel = -1; S.hint = null;
      var rv = revealTops(); if (rv.length) { fx.reveal = rv; snd('select'); } // hidden ball revealed the moment it becomes the top ball
      var solved = E.isSolved(est()), isd = !unlock && done(i);
      if (unlock) { fx.unlock = { tube: i, key: ball, solved: solved }; fx.keyFrom = sb ? (airRect || sb.getBoundingClientRect()) : null; fx.keySrc = ballSrc(ball).src; S.locked = true; S.consuming = true; } // undo: key move + unlock = 1 move (one hist entry)
      else { fx.drop = i; if (!isd) snd('drop', S.tubes[i].length - 1); if (S.caps[i] < 4 && S.tubes[i].length >= S.caps[i]) fx.full = i; }
      if (!isd && S.chain > 0) { S.banked += S.chain; S.chain = 0; } // chain broken by a normal move -> banked (paid on clear)
      if (isd) onTubeDone(i, solved);
      fx.fly = { from: !unlock && sb ? (airRect || sb.getBoundingClientRect()) : null, to: i, sounds: pend }; pend = null;
      if (unlock) { fx.fly.sounds.forEach(function (a) { sfx.play(a[0], a[1]); }); fx.fly = null; render(); return; }
      if (solved) { S.locked = true; S.sel = -1; render(); return setTimeout(win, reduced ? 50 : 700); } // H1: lock all input during clear sequence
    } else if (pickable(i)) { S.sel = i; sfx.play('select'); }
    else { fx.shake = i; vibrate(10); sfx.play('invalid'); }
    render();
  }
  function vibrate(ms) { if (navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }
  // Remaining solution completes a tube on every move until solved => automatic end-of-stage cascade.
  function isCascade() {
    if (S.lock.some(Boolean)) return false;
    var left = S.tubes.filter(function (t, i) { return t.length && !done(i); });
    var colors = {}; left.forEach(function (t) { t.forEach(function (c) { colors[c] = 1; }); });
    var need = Object.keys(colors).length; if (!need || need > 3) return false;
    var r = E.solve(stageOf(), { limit: 5e4 }); return r.solvable && r.min <= need;
  }
  function onTubeDone(i, solving) {
    fx.fresh = i;
    // GDD v0.2: a chain that runs into the stage-solving move is the automatic end-of-stage cascade -> void, no text, no coins
    if (solving) { S.chain = 0; return; } // clear fanfare plays in win()
    S.combo = (S.moves - S.lastDone <= C.comboWindow) ? S.combo + 1 : 1; S.lastDone = S.moves;
    if (S.combo < 2) return snd('complete');
    S.chain += C.coinsPerCombo * (S.combo - 1); // N2: accumulates (x2=5, x3=+10 -> 15)
    if (isCascade()) return snd('complete'); // N3: board is now an automatic end cascade -> no COMBO text (it will pay nothing)
    snd('combo', S.combo); // DESIGN §6: pitch +1 semitone per combo step (max +5)
    var c = $('combo'); c.className = S.combo >= 4 ? 'c4' : S.combo === 3 ? 'c3' : ''; c.textContent = 'COMBO ×' + S.combo + '!';
    void c.offsetWidth; c.className += ' combo';
    if (S.combo >= 3) { var f = document.createElement('div'); f.className = 'flash'; document.body.appendChild(f); setTimeout(function () { f.remove(); }, 300); }
    if (S.combo >= 4 && !reduced) { $('app').classList.add('screenshake'); setTimeout(function () { $('app').classList.remove('screenshake'); }, 200); vibrate(20); }
  }
  function confetti() {
    if (reduced) return;
    for (var i = 0; i < 50; i++) {
      var q = document.createElement('i'); q.className = 'confetti'; q.style.left = (Math.random() * 100) + '%'; q.style.top = '-12px'; q.style.zIndex = 20;
      q.style.background = C.palette[i % 8].hex; q.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px'); q.style.setProperty('--dy', (window.innerHeight + 40) + 'px');
      q.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg'); q.style.animationDelay = (Math.random() * 300) + 'ms'; q.style.position = 'fixed';
      document.body.appendChild(q); setTimeout(function (el) { el.remove(); }.bind(null, q), 2000);
    }
  }
  function win() {
    if (!E.isSolved(est())) { S.locked = false; render(); return; } // H1: re-check before saving
    S.won = true; var st = starsFor(S.moves, S.g.min, S.n), prev = save.stars[S.n] || 0;
    var got = prev === 0 ? C.coinsFirstClear : Math.max(0, st - prev) * C.coinsPerStarImprove; // GDD v0.2
    // N1: combo coins paid only on clear; lifetime cap per stage persisted in save.comboPaid
    save.comboPaid = save.comboPaid || {}; var paid = save.comboPaid[S.n] || 0;
    var combo = Math.max(0, Math.min(S.banked, C.maxComboCoinsPerStage - paid)); save.comboPaid[S.n] = paid + combo;
    save.stars[S.n] = Math.max(prev, st); save.coins += got + combo;
    if (S.n <= save.unlocked) save.unlocked = Math.max(save.unlocked, Math.min(S.n + 1, LAST)); // L3: debug-jumped stages don't unlock
    if (S.n < LAST) save.current = S.n + 1; // L2
    save.attempt[S.n] = { undoLeft: C.freeUndos, addedTube: false }; // GDD v0.2: clear resets this stage's consumables (restart does not)
    persist(); render();
    $('bigstars').innerHTML = starsHtml(st); $('result').textContent = '이동 ' + S.moves + ' / 최소 ' + S.g.min;
    $('coinsGot').textContent = '🪙 +' + (got + combo) + (combo ? ' (콤보 +' + combo + ')' : '') + ' · 보유 ' + save.coins;
    $('next').style.display = S.n < LAST ? '' : 'none'; confetti();
    sfx.play('clear'); for (var k = 0; k < st; k++) setTimeout(sfx.play.bind(sfx, 'star', k), 1000 + k * 150); $('overlay').classList.add('show'); // DESIGN §7: fanfare, then a ding per star
    SP.ads.noteClear(S.n); // L7: interstitial (if due) shows only when the player taps 다음
  }
  function undo() {
    if (!S.hist.length || S.locked || SP.ads.isBusy()) return;
    var go = function () {
      if (S.locked || !S.hist.length) return;
      cancelFlights(); var h = S.hist.pop(); S.tubes = h.tubes; S.caps = h.caps; S.lock = h.lock; S.mask = h.mask; S.path = h.path; // undo restores '?' state and key/lock
      while (S.tubes.length < S.g.tubes.length + (S.a.addedTube ? 1 : 0)) { S.tubes.push([]); S.caps.push(4); S.lock.push(null); S.mask.push([]); } // M1: added tube is not undoable
      S.moves++; S.sel = -1; S.combo = 0; S.lastDone = -99; S.chain = h.chain; S.banked = h.banked; S.hint = null; sfx.play('undo'); render(); // R2: revoke chain/banked coins accrued by the undone move // undo counts as a move for stars
    };
    if (S.a.undoLeft > 0) { S.a.undoLeft--; persist(); go(); } else SP.ads.showRewarded('undo', function (ok) { if (ok) go(); });
  }
  function addTube() { if (S.a.addedTube || S.locked || SP.ads.isBusy()) return; SP.ads.showRewarded('add_tube', function (ok) { if (ok && !S.a.addedTube && !S.locked) { S.a.addedTube = true; persist(); S.tubes.push([]); S.caps.push(4); S.lock.push(null); S.mask.push([]); S.sel = -1; render(); } }); }
  function menu() {
    var g = $('levelgrid'); g.innerHTML = '';
    for (var n = 1; n <= LAST; n++) (function (n) {
      var b = document.createElement('button'); b.className = 'btn' + (n === S.n ? ' primary' : ''); b.disabled = n > save.unlocked;
      b.innerHTML = (n > save.unlocked ? '🔒' : n) + '<small>' + (SP.STAGES[n].rest ? '☕' : '★'.repeat(save.stars[n] || 0)) + '</small>';
      b.onclick = function () { $('menu').classList.remove('show'); load(n); }; g.appendChild(b);
    })(n);
    $('coins').textContent = '🪙 ' + save.coins; $('menu').classList.add('show');
  }
  $('undo').onclick = undo; $('restart').onclick = function () { if (!S.locked && !SP.ads.isBusy()) load(S.n); }; $('add').onclick = addTube; // M2: consumables persist via save.attempt
  $('hint').onclick = function () { if (S.locked) return; S.hint = nextMove(); S.sel = -1; render(); };
  $('settings').onclick = menu; $('closeMenu').onclick = function () { $('menu').classList.remove('show'); };
  function syncSym() { $('bigsym').checked = symbolsLarge; $('sound').checked = !(SP.sfx && SP.sfx.isMuted()); }
  $('sound').onchange = function () { if (SP.sfx) { SP.sfx.setMuted(!this.checked); if (this.checked) sfx.play('select'); } }; // DESIGN §5.6 settings: sound on/off (persisted)
  $('bigsym').onchange = function () { symbolsLarge = this.checked; SP.store.set(A11Y_KEY, String(symbolsLarge)); document.documentElement.classList.toggle('symbols-large', symbolsLarge); render(); };
  syncSym();
  $('theme').onclick = function () { var d = document.documentElement; save.theme = d.dataset.theme === 'light' ? '' : 'light'; d.dataset.theme = save.theme; persist(); };
  $('next').onclick = function () { if (SP.ads.isBusy()) return; var n = S.n + 1; SP.ads.beforeNext(function () { $('overlay').classList.remove('show'); load(n); }); };
  $('again').onclick = function () { SP.ads.cancelDue(); $('overlay').classList.remove('show'); load(S.n); };
  // L4: Android back -> close popup -> stage select -> exit confirm modal
  var shown = function (id) { return $(id).classList.contains('show'); };
  function exitModal(on) { $('exitov').classList.toggle('show', on); }
  SP.platform.onBack(function () {
    if (SP.ads.isBusy()) return true;                         // the ad owns the back key while it plays
    if (shown('exitov')) { exitModal(false); return true; }   // popup close
    if (shown('overlay')) { SP.ads.cancelDue(); $('overlay').classList.remove('show'); if (S.won) { if (S.n < LAST) load(S.n + 1); menu(); } return true; } // clear card -> stage select
    if (shown('menu')) { exitModal(true); return true; }      // on stage select -> exit confirm
    menu(); return true;                                        // in game -> stage select
  });
  $('exitYes').onclick = function () { exitModal(false); persist(); SP.platform.close(); };
  $('exitNo').onclick = function () { exitModal(false); };
  $('exitBtn').onclick = function () { exitModal(true); };
  SP.ads.onChange(function () { if (S) btns(); });
  var start = Math.min(save.current || 1, save.unlocked);
  SP.ads.showBanner(); load(start);
  var sp = $('splash'); if (sp) { sp.classList.add('out'); setTimeout(function () { sp.remove(); }, 300); } // L6: first screen ready
  SP._bootMs = Math.round(performance.now()); SP._inputLocked = function () { return S.locked && !S.won; };
});
