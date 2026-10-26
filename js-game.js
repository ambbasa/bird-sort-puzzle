SP.platform.whenReady(function () { // L5: runs once the platform adapter has loaded the (user-keyed) save
  var C = SP.CONFIG, core = SP.core, E = SP.engine, GA = C.gimmickAssets, $ = function (id) { return document.getElementById(id); };
  var LAST = Math.min(C.lastStage || C.maxStage, Math.max.apply(null, Object.keys(SP.STAGES).map(Number))), KEY = 'sortpuzzle.v1', STAR = $('staricon').innerHTML;
  // DESIGN §5.6/§9: reduced motion = OS preference OR in-game setting ('a11y.reduceMotion'); haptics toggle ('settings.haptics', default on)
  var osReduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches), RM_KEY = 'a11y.reduceMotion', HAP_KEY = 'settings.haptics';
  var reduced = osReduced || SP.store.get(RM_KEY) === 'true', hapticsOn = SP.store.get(HAP_KEY) !== 'off';
  function applyReduced() { // mirror every @media (prefers-reduced-motion) rule unconditionally while the in-game setting is on
    document.documentElement.classList.toggle('reduce-motion', reduced);
    var old = document.getElementById('rm-mirror'); if (old) old.remove();
    if (!reduced || osReduced) return;
    var css = []; [].forEach.call(document.styleSheets, function (sh) { var rs; try { rs = sh.cssRules; } catch (e) { return; }
      [].forEach.call(rs || [], function (r) { if (r.media && /prefers-reduced-motion:\s*reduce/.test(r.media.mediaText)) [].forEach.call(r.cssRules, function (x) { css.push(x.cssText); }); }); });
    var st = document.createElement('style'); st.id = 'rm-mirror'; st.textContent = css.join('\n'); document.head.appendChild(st);
  }
  applyReduced();
  var save = null; try { save = JSON.parse(SP.store.get(KEY) || 'null'); } catch (e) { console.warn('save parse', e); }
  if (!save || typeof save !== 'object') save = { unlocked: 1, stars: {}, coins: 0, current: 1 };
  // ART-AUDIT A05: a save with current/unlocked > LAST (e.g. 201), NaN, negative or non-numeric froze the boot -> clamp to 1..LAST
  var clampN = function (v) { v = Math.floor(+v); return isFinite(v) && v >= 1 ? Math.min(v, LAST) : 1; };
  var overflow = +save.current > LAST || +save.unlocked > LAST;
  save.current = clampN(save.current); save.unlocked = clampN(save.unlocked);
  if (!save.stars || typeof save.stars !== 'object') save.stars = {}; if (!isFinite(+save.coins) || +save.coins < 0) save.coins = 0;
  var bootToMap = overflow && !!save.stars[LAST]; // all 200 cleared -> open the map instead of replaying 200
  save.attempt = save.attempt || {}; // per-stage consumables (GDD v0.2): { undoLeft, addedTube } persist across restarts/reloads
  var DEBUG = false;
  var A11Y_KEY = 'a11y.symbolsLarge'; // DESIGN.md §8: default off
  var symbolsLarge = SP.store.get(A11Y_KEY) === 'true';
  document.documentElement.classList.toggle('symbols-large', symbolsLarge);
  if (save.theme) document.documentElement.dataset.theme = save.theme;
  function persist() { SP.store.set(KEY, JSON.stringify(save)); }
  // Daily challenge (js-daily.js): S.n === DAILY, S.daily = date key of the puzzle. Progress in save.daily, consumables in save.attempt.daily.
  var DAILY = 'daily', DD = SP.daily || null; save.daily = save.daily || { last: '', streak: 0, best: 0, stars: {} };
  function today() { return DD ? DD.dateKey() : ''; }
  function dailyLabel(k) { var p = k.split('-'); return +p[1] + '월 ' + +p[2] + '일'; }
  function sn() { return S.g.source || S.n; } // star thresholds / bands follow the daily puzzle's source stage
  var HAPTIC = { invalid: 10, complete: 15, combo: [15, 40, 25], clear: [30, 60, 40] }; // DESIGN §5.6: vibration rides on the same events as sfx (works while muted)
  var rawSfx = SP.sfx || { play: function () {} }, S, fx = {}, sfx = { play: function (n, a) { if (HAPTIC[n]) vibrate(HAPTIC[n]); rawSfx.play(n, a); } };
  SP._haptics = []; // QA: log of vibrate() calls that actually fired
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
  function finishFlight(f, instant) { var k = flights.indexOf(f); if (k < 0) return; flights.splice(k, 1); f.clone.remove(); (f.feathers || []).forEach(function (q) { q.el.remove(); }); f.land(instant); if (!flights.length && landWaiters.length) { SP._lastLandAt = performance.now(); landWaiters.splice(0).forEach(function (cb) { cb(); }); } }
  var CLEAR_DELAY = 150; /* v7.1 PM-3: touchdown -> clear sheet (completion glow/sparkle plays meanwhile; was 250) */
  var landWaiters = []; /* v7.1 PM-3: clear fires on the last touchdown event (was a 30ms polling loop) */
  function cancelFlights() { flights.slice().forEach(function (f) { finishFlight(f, true); }); }
  function rebind(b) { // after a re-render: hide the new DOM bird each flyer is heading to; drop flights whose target vanished
    flights.slice().forEach(function (f) { var t = b.querySelectorAll('.tube')[f.to], w = t && t.querySelectorAll('.ballwrap')[f.slot];
      if (!w || S.tubes[f.to][f.slot] !== f.color) return finishFlight(f, true); f.ball = w; f.tube = t; w.style.visibility = 'hidden'; });
  }
  // v3 "weighty" flight (feedback 3), one requestAnimationFrame loop, transform-only, no CSS transitions:
  //  crouch 100ms (squash on the branch) -> ballistic flight: x at constant speed, y(t) = y0 + v0*t + g*t^2/2 with the apex
  //  35-45% of |dx| above the higher end (min clears the perch tops) -> landing 150ms (low squash + small bounce).
  //  Body angle follows the velocity vector. Side frames flap fast while rising, glide (wings spread, frame 2) while falling,
  //  front fold just before touchdown. Two feathers drift off at takeoff. Speed setting 'fast' scales every phase by 0.6.
  var FLY_KEY = 'settings.flightSpeed', flySpeed = SP.store.get(FLY_KEY) === 'fast' ? 'fast' : 'normal', rafOn = false;
  // v7 (GDD A2): air time 0.8-1.0 s parabola (normal) / 0.4 s ('빠른 비행'); landing squash+bounce ~0.15 s. Run moves launch
  // one bird every 0.12 s (C.flight.stagger), capped so a 4-bird run adds at most 0.36 s.
  function flyTimes(adx) { var fast = SP.store.get(FLY_KEY) === 'fast', F = C.flight; return fast ? { crouch: F.fastCrouch, air: F.fastAir, land: F.fastLand } : { crouch: F.crouch, air: Math.max(F.airMin, Math.min(F.airMax, F.airMin + F.airPerPx * adx)), land: F.land }; }
  SP._flyTimes = flyTimes;
  function tick(now) {
    flights.slice().forEach(function (f) { var e = now - f.t0, P = f.P, x, y, a = 0, sx = 1, sy = 1;
      if (e < 0) { x = f.x0; y = f.y0; } // staggered run member waiting on the branch
      else if (e < P.crouch) { var q = Math.sin(Math.PI * e / P.crouch); sx = 1 + 0.12 * q; sy = 1 - 0.18 * q; x = f.x0; y = f.y0 + f.B * 0.09 * q; }
      else if (e < P.crouch + P.air) { var t = (e - P.crouch) / P.air, vy = f.v0 + f.g * t; x = f.x0 + f.dx * t; y = f.y0 + f.v0 * t + 0.5 * f.g * t * t;
        a = (f.dx < 0 ? -1 : 1) * Math.max(-55, Math.min(55, Math.atan2(vy, Math.abs(f.dx) || 1e-6) * 180 / Math.PI * 0.8));
        if (!f.flown) { f.flown = true; if (f.side) { f.im.className = f.sideCls; f.im.dataset.kind = f.sk; if (f.bs) { f.bs.firstChild.classList.add('side'); if (/--left/.test(f.sideCls)) f.bs.classList.add('mirror'); } } spawnFeathers(f, x, y); }
        var fi = Math.floor(e / 50) % 4, src = !f.side ? f.flap(fi) : vy < 0 ? f.sideSrc(fi) : f.sideSrc(1); // rising: 50ms flaps; falling: glide (wings spread). DESIGN 18.2 A20: no tilted front frame mid-air
        if (f.im.getAttribute('src') !== src) f.im.src = src; }
      else if (e < P.crouch + P.air + P.land) { var u = (e - P.crouch - P.air) / P.land; x = f.x0 + f.dx; var ls = f.side ? f.sideSrc(1) : f.front; if (f.im.getAttribute('src') !== ls) f.im.src = ls; // A20: touchdown squash keeps the (upright) flight frame; idle front appears when the real bird is revealed
        if (u < 0.45) { var w = Math.sin(Math.PI * u / 0.45); sx = 1 + 0.16 * w; sy = 1 - 0.22 * w; y = f.y2 + f.B * 0.1 * w; } else { var v = Math.sin(Math.PI * (u - 0.45) / 0.55); y = f.y2 - f.B * 0.12 * v; sx = 1 - 0.04 * v; sy = 1 + 0.05 * v; } }
      else return finishFlight(f, false);
      f.clone.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) rotate(' + a + 'deg) scale(' + sx + ',' + sy + ')';
      (f.feathers || []).forEach(function (q) { var k = (now - q.t0) / 600; if (k > 1) { q.el.style.opacity = 0; return; }
        q.el.style.transform = 'translate3d(' + (q.x + q.vx * k) + 'px,' + (q.y + q.vy * k + 30 * k * k) + 'px,0) rotate(' + (q.r + 220 * k) + 'deg)'; q.el.style.opacity = (1 - k) * 0.85; });
    });
    if (flights.length) requestAnimationFrame(tick); else rafOn = false;
  }
  function spawnFeathers(f, x, y) { if (f.color == null || !C.palette[f.color]) return; f.feathers = [];
    for (var i = 0; i < 2; i++) { var el = document.createElement('i'); el.className = 'feather'; el.style.background = C.palette[f.color].hex; document.body.appendChild(el);
      f.feathers.push({ el: el, t0: performance.now(), x: x + f.B * (0.3 + 0.3 * i), y: y + f.B * 0.5, vx: (f.dx < 0 ? 1 : -1) * (14 + 10 * i), vy: -6 + 10 * i, r: i * 60 }); } }
  function bigKey(c, masked) { if (masked) return 'hidden'; if (E.isKey(c)) return 'key-' + String(c).slice(1).toLowerCase(); return C.palette[c] ? C.palette[c].key : null; }
  function bigSym(k, side) { var bw = document.createElement('span'); bw.className = 'bigsym-wrap';
    var bs = document.createElement('img'); bs.className = 'bigsym' + (side ? ' side' : ''); bs.alt = ''; bs.draggable = false; bs.dataset.k = k;
    bs.src = k === 'hidden' ? GA.hidden.fileLargeSymbol : /^key-/.test(k) ? GA.pair['K' + k.slice(4)].keyBallLargeSymbol : C.palette.filter(function (p) { return p.key === k; })[0].fileLargeSymbol; bw.appendChild(bs); return bw; }
  function fly(from, to, ball, tube, fresh, sounds, color, slot, delay) {
    var r = ball.getBoundingClientRect(), B = r.width, x0 = from.left, y0 = from.top, x2 = r.left, y2 = r.top, dx = x2 - x0, adx = Math.abs(dx);
    var perchTop = Math.min.apply(null, [].map.call(document.querySelectorAll('#board .tube'), function (t) { return t.getBoundingClientRect().top; }));
    var h = Math.max(0.4 * adx, B * 0.9), ya = Math.min(Math.min(y0, y2) - h, perchTop - B * 0.5); // apex: 40% of |dx| (min ~0.9 bird), always above the perch tops
    var ra = Math.sqrt(y0 - ya), rb = Math.sqrt(y2 - ya), ta = ra / (ra + rb), g = 2 * (y0 - ya) / (ta * ta), v0 = -g * ta;
    var side = !!(BF.side && BF.side.enabled) && color != null, sk = side ? sideKey(color) : null, front = C.palette[color] ? birdFrame(color, BF.foldFrame) : ball.firstChild.src;
    var c = document.createElement('div'); c.className = 'ball flyer'; c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
    var im = document.createElement('img'); im.alt = ''; im.draggable = false; im.className = 'ball bird'; im.src = ball.firstChild.getAttribute('src'); c.appendChild(im);
    var obs = ball.querySelector('.bigsym'), fbs = obs ? bigSym(obs.dataset.k, false) : null; if (fbs) c.appendChild(fbs); /* v7b: badge rides along, follows front/side frames */
    c.style.transform = 'translate3d(' + x0 + 'px,' + y0 + 'px,0)'; document.body.appendChild(c); ball.style.visibility = 'hidden'; SP._flights++;
    var f = { bs: fbs, clone: c, im: im, to: to, slot: slot, color: color, ball: ball, tube: tube, side: side, sk: sk, front: front, B: B, x0: x0, y0: y0, y2: y2, dx: dx, g: g, v0: v0,
      P: flyTimes(adx), t0: performance.now() + (delay || 0), sideCls: 'bird-side bird-side-img' + (dx < 0 && sk !== 'hidden' ? ' bird-side--left' : ''),
      sideSrc: function (i) { return sideFrame(sk, i); }, flap: function (i) { return C.palette[color] ? birdFrame(color, BF.frames[i]) : front; },
      land: function (instant) { f.ball.style.visibility = ''; if (!instant) landFx(f.ball, reduced); if (fresh) { f.tube.classList.add('fresh'); if (!instant) sparkle(f.tube); } sounds.forEach(function (a) { sfx.play(a[0], a[1]); }); } };
    SP._lastFlight = { ms: f.P.crouch + f.P.air + f.P.land, air: f.P.air, delay: delay || 0, apexRatio: adx ? +((Math.min(y0, y2) - ya) / adx).toFixed(2) : null, dx: Math.round(adx) };
    flights.push(f); if (!rafOn) { rafOn = true; requestAnimationFrame(tick); }
  }
  function whenLanded(cb) { if (!flights.length) { SP._lastLandAt = performance.now(); return cb(); } landWaiters.push(cb); } // clear waits for the last bird to touch down
  // Gimmick state (js-engine.js rules): S.caps (small tubes), S.lock (per tube key id or null), S.mask (per tube: true = '?' ball)
  function est() { return { t: S.tubes, cap: S.caps, lock: S.lock }; }
  function done(i) { return E.isDone(est(), i); }
  function snap() { return { tubes: S.tubes.map(function (t) { return t.slice(); }), caps: S.caps.slice(), lock: S.lock.slice(), mask: S.mask.map(function (m) { return m.slice(); }) }; }
  function stageOf() { return { tubes: S.tubes, caps: S.caps, locks: S.lock.map(function (k, i) { return k ? { tube: i, key: k } : null; }).filter(Boolean) }; }
  function revealTops() { var r = []; S.mask.forEach(function (m, i) { if (m.length && m[m.length - 1]) { m[m.length - 1] = false; r.push(i); } }); return r; }
  function load(n) {
    cancelFlights();
    var sb = false;
    var dk = n === DAILY ? today() : null, g = dk ? DD.build(SP.STAGES, dk, C.palette.length) : SP.STAGES[n];
    if (dk && (!save.attempt.daily || save.attempt.daily.key !== dk)) save.attempt.daily = { key: dk, undoLeft: C.freeUndos, addedTube: false }; // fresh consumables each day
    var a = dk ? save.attempt.daily : sb ? (S && S.n === n && S.a.sandbox ? S.a : { undoLeft: C.freeUndos, addedTube: false, sandbox: true }) : (save.attempt[n] || (save.attempt[n] = { undoLeft: C.freeUndos, addedTube: false }));
    var tubes = g.tubes.map(function (t) { return t.slice(); });
    var caps = g.caps ? g.caps.slice() : tubes.map(function () { return 4; }), lock = tubes.map(function () { return null; });
    (g.locks || []).forEach(function (l) { lock[l.tube] = l.key; });
    var mask = tubes.map(function (t) { return t.map(function () { return false; }); }); (g.hidden || []).forEach(function (h) { mask[h[0]][h[1]] = true; });
    if (a.addedTube) { tubes.push([]); caps.push(4); lock.push(null); mask.push([]); } // purchased tube survives restart
    S = { n: n, daily: dk, g: g, a: a, tubes: tubes, caps: caps, lock: lock, mask: mask, hist: [], sel: -1, path: 0, moves: 0, lastDone: -99, combo: 0, chain: 0, banked: 0, won: false, locked: false, hint: null };
    S.init0 = JSON.stringify([g.tubes, g.caps || null, (g.locks || []).length, (g.hidden || []).length]); /* v7.1 PM-6: the stage's pristine layout */
    applyTheme(dk ? 1 + 100 * (g.seed % C.themes.length) : n, sb || !!dk); // daily: theme rotates by date, no unlock toast
    if (!sb) { if (!dk) save.current = n; persist(); } fx = {}; render(); try { artStage(g, n); } catch (e) { console.error('artStage', e); } // art warm-up must never break a stage
  }
  // v5 art budget (birds 4-7KB each): load only what the current stage uses. The board waits (max 350ms) for the idle
  // frames it shows to decode -> no pop-in; then, when idle, expressions + flap frames of these colors and the next
  // stage's idle frames are warmed. Side frames load lazily on first selection of a color (before its flight starts).
  var artDone = {}, sideWarm = {};
  // v7.3: a failed load is retried (backoff + cache-busting query) and, if it still fails, dropped from artDone so the next call retries (was: cached forever)
  function artGet(src) { if (artDone[src]) return artDone[src];
    return (artDone[src] = new Promise(function (res) { var n = 0; (function go(u) { var im = new Image();
      im.onload = function () { (im.decode ? im.decode() : Promise.resolve()).catch(function () {}).then(function () { res(true); }); };
      im.onerror = function () { if (++n >= 3) { delete artDone[src]; return res(false); } setTimeout(function () { go(SP.net.bust(src, n)); }, 300 * Math.pow(3, n - 1)); };
      im.src = u; })(src); })); }
  function stageColors(g) { var u = []; g.tubes.forEach(function (t) { t.forEach(function (c) { if (u.indexOf(c) < 0 && (E.isKey(c) ? GA.pair[c] : C.palette[c])) u.push(c); }); }); return u; }
  function idleSrc(c) { return ballSrc(c).src; }
  SP._artLoaded = function () { return Object.keys(artDone); }; // QA hook
  function artStage(g, n) {
    var cs = stageColors(g), b = $('board'), first = cs.map(idleSrc).concat((g.hidden || []).length ? [BF.hidden] : []);
    if (!reduced) { b.style.opacity = 0; var shown = false, show = function () { if (!shown) { shown = true; b.style.opacity = ''; } };
      Promise.all(first.map(artGet)).then(show); setTimeout(show, 1500); } /* v7.3: wait for the stage's birds (retries included), never longer than 1.5s */
    else first.forEach(artGet);
    var idle = window.requestIdleCallback || function (f) { setTimeout(f, 200); };
    idle(function () { artGet('assets-v5ui-clear-art.svg?v=e390f014'); artGet('assets-v7ui-clear-art-compact.svg?v=d56627ae'); }); /* v7.1 PM-3: decode the clear sheet art before the last move */
    idle(function () { cs.forEach(function (c) { if (E.isKey(c) || !C.palette[c]) return; artGet(BF.expr(c, 'happy')); artGet(BF.expr(c, 'sad')); [BF.foldFrame].concat(BF.side && BF.side.enabled ? [] : BF.frames).forEach(function (fr) { artGet(birdFrame(c, fr)); }); });
      var nx = SP.STAGES[n + 1]; if (nx && nx.tubes) stageColors(nx).forEach(function (c) { if (!E.isKey(c) && C.palette[c]) artGet(BF.expr(c, 'idle')); }); });
  }
  function warmSide(c) { if (!(BF.side && BF.side.enabled) || c == null) return; var k = sideKey(c); if (sideWarm[k]) return; sideWarm[k] = 1; BF.side.frames.forEach(function (_, i) { artGet(sideFrame(k, i)); }); }
  // Feedback v2 themes: theme = floor((stage-1)/100) mod themes.length (cycles forever for 201+). Background = designer file
  // (C.art.themeBg[key], detected by tools/sync-art.js) else the config gradient. First arrival in a new 100-block -> toast once.
  // DESIGN 15.3: backgrounds set from css-style.css with paths relative to that file (not theme.css var(--theme-bg)); WebP on low-end devices
  (function () { var nv = navigator, c = nv.connection; if ((nv.deviceMemory && nv.deviceMemory <= 2) || (nv.hardwareConcurrency && nv.hardwareConcurrency <= 2) || (c && c.saveData) || /[?&]lowend=1/.test(location.search)) document.body.classList.add('theme-low-end'); })();
  function applyTheme(n, sb) {
    var blk = Math.floor((n - 1) / 100), th = C.themes[blk % C.themes.length];
    C.themes.forEach(function (t) { document.body.classList.remove('theme-' + t.key); }); document.body.classList.add('theme-' + th.key); document.body.style.backgroundImage = ''; SP.net.watchBg(document.body); /* v7.3: retry a failed theme background */
    save.themesSeen = save.themesSeen || [0];
    if (blk > 0 && save.themesSeen.indexOf(blk) < 0 && !sb) { save.themesSeen.push(blk); persist(); themeUnlock(th); }
  }
  SP._themeFor = function (n) { return C.themes[Math.floor((n - 1) / 100) % C.themes.length].key; }; // QA hook
  // DESIGN 17.5 (A08): system emoji -> v5 icons (background SVGs, aria-hidden; text stays for screen readers)
  function IC(n) { return '<i class="v5i v5i-' + n + '" aria-hidden="true"></i>'; }
  function CAL(key) { var d = key ? +String(key).split('-')[2] : new Date().getDate(); return '<span class="v5-cal" aria-hidden="true"><b>' + d + '</b></span>'; }
  // DESIGN 18.2 A16: theme unlock popup (card art per theme) instead of a toast; '계속하기' closes it
  function themeUnlock(th) { var o = $('themeov'); if (!o) return toast('새 테마 해금! ' + th.name);
    o.querySelector('.tcard').dataset.theme = th.key; $('themesub').textContent = th.name + '에서 새 친구들이 기다려요'; o.classList.add('show');
    $('themeOk').onclick = function () { o.classList.remove('show'); }; }
  // v7 B9: stages 1-3 short tutorial bubble (CSS placeholder until the designer's finger/bubble art lands: .tutor / .tutor-finger)
  var TUTOR = { 1: '새를 탭하고, 옮길 둥지를 탭하세요', 2: '같은 새 4마리를 모으면 완성!', 3: '막히면 되돌리기나 횃대 추가를 써 보세요' };
  function tutor() { var el = $('tutor'), m = !S.daily && TUTOR[S.n], on = !!m && !S.won && !(S.n === 1 && S.moves > 1); if (!el) return; el.hidden = !on;
    var fg = $('tutfinger'), rg = $('tutring'); if (fg) fg.hidden = rg.hidden = true; if (!on) return; el.querySelector('.tutor-text').textContent = m; placeTutor(el);
    if (S.n === 1 && fg) { var h = nextMove(); if (!h) return; var tb = document.querySelectorAll('#board .tube')[S.sel < 0 ? h[0] : h[1]]; if (!tb) return; var r = tb.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + 6; /* tip on the perch cap (at the perch centre the hand covered the birds' symbol discs, v7a symbol check) */ var bs = [].slice.call(tb.querySelectorAll('img.bird')); if (S.sel < 0 && bs.length) { var q = bs.map(function (i) { return i.getBoundingClientRect(); }).sort(function (u, v) { return u.top - v.top; })[0]; y = q.top + 2; } /* first tap: tip on the top bird's head */
      rg.style.left = x + 'px'; rg.style.top = y + 'px'; fg.style.left = (x + 4) + 'px'; fg.style.top = (y - 4) + 'px'; /* v7b: designer-approved spot, finger only nudged 4px up-right */ fg.hidden = rg.hidden = false; document.querySelectorAll('.hintmark').forEach(function (m) { m.hidden = true; }); } } // finger only on stage 1 (tap bird -> tap nest)
  // v7.1 PM-2: bubble lives outside the board (free band below the lowest bird / above the top bird); only the tail points at the target perch
  function placeTutor(el) { var bub = el.querySelector('.tutor-text'), birds = [].slice.call(document.querySelectorAll('#board img.bird')); if (!birds.length) return;
    var rs = birds.map(function (b) { return b.getBoundingClientRect(); }), bTop = Math.min.apply(null, rs.map(function (r) { return r.top - (r.height * 1.35); })), /* room for the lifted (selected) bird (lift ~1.3 bird) */ bBot = Math.max.apply(null, rs.map(function (r) { return r.bottom; }));
    var hud = document.querySelector('header'), ft = document.querySelector('footer.bottom'), hB = hud ? hud.getBoundingClientRect().bottom : 0, fT = ft ? ft.getBoundingClientRect().top : innerHeight;
    var h = bub.offsetHeight || 44, tail = 14, below = fT - bBot, above = bTop - hB, up;
    if (below >= h + tail + 4) up = true; else if (above >= h + tail + 4) up = false; else up = below >= above;
    var top = up ? bBot + tail + Math.max(0, (below - h - tail) / 2 - 2) : bTop - tail - h - Math.max(0, (above - h - tail) / 2 - 2);
    if (up) top = Math.min(top, fT - h - 2); else top = Math.max(top, hB + 2);
    el.style.top = Math.round(top) + 'px'; el.style.bottom = 'auto'; bub.classList.toggle('v7-bubble--up', up);
    var hm = nextMove(), tb = hm ? document.querySelectorAll('#board .tube')[S.sel < 0 ? hm[0] : hm[1]] : null, tx = tb ? tb.getBoundingClientRect().left + tb.getBoundingClientRect().width / 2 : innerWidth / 2;
    var br = bub.getBoundingClientRect(); bub.style.setProperty('--tail-x', Math.max(18, Math.min(br.width - 18, tx - br.left)) + 'px'); SP._tutorPlace = { up: up, top: Math.round(top), h: h }; }
  function landFx(el, quiet) { // quiet (reduced motion): squash only, no feathers/dust // v7 A2/19.2: 0.15s squash (.v7-land) + feathers/dust (.v7-fx) from assets-v7ui-v7.css
    var bird = el.querySelector('.bird, svg, img') || el; bird.classList.remove('v7-land'); void bird.offsetWidth; bird.classList.add('v7-land'); setTimeout(function () { bird.classList.remove('v7-land'); }, 160);
    if (quiet) return;
    var r = el.getBoundingClientRect(), fx = document.createElement('div'); fx.className = 'v7-fx'; fx.style.position = 'fixed'; fx.style.left = (r.left + r.width / 2) + 'px'; fx.style.top = (r.top + r.height * 0.89) + 'px';
    fx.innerHTML = '<i class="v7-feather" style="--dx:-18px;--rot:-40deg"></i><i class="v7-feather" style="--dx:16px;--rot:50deg;--d:.05s"></i><i class="v7-feather v7-feather--sm" style="--dx:-6px;--rot:120deg;--d:.1s"></i><i class="v7-dust" style="--dx:-14px"></i><i class="v7-dust" style="--dx:14px;--flip:-1"></i>';
    document.body.appendChild(fx); setTimeout(function () { fx.remove(); }, 650); }
  var starPop = {};
  SP.net.toast = function (m) { if (!document.querySelector('.ov.show')) toast(m); }; SP.net.onRecover(function () { SP.net.watchBg(document.body); }); // v7.3 '연결이 불안정해요' (v7.2 toast rule)
  function hideToast() { var t = $('toast'); if (!t) return; clearTimeout(t._h); clearTimeout(t._c); t.classList.remove('show'); t.innerHTML = ''; } // v7.2 PM-1: instant close (board tap / any modal)
  function toast(msg) { var t = $('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.innerHTML = msg; t.className = 'v7-toast v72-pill' + (/횃대/.test(msg) ? ' v7-toast--perch' : ''); t.style.top = 'auto'; t.style.bottom = '';
    // v7.2 PM-1: small pill placed in a free band — below the lowest bird and above the bottom buttons, else above the top bird, else under the HUD
    var ft = document.querySelector('footer.bottom'), fr = ft && ft.offsetParent !== null ? ft.getBoundingClientRect() : null, bs = document.querySelectorAll('#board .ball'), lo = 0, hi = innerHeight, h = 40;
    for (var i = 0; i < bs.length; i++) { var r = bs[i].getBoundingClientRect(); if (r.bottom > lo) lo = r.bottom; if (r.top < hi) hi = r.top; }
    var floor = fr ? fr.top : innerHeight, hd = document.querySelector('header'), ceil = hd ? hd.getBoundingClientRect().bottom : 0;
    if (!bs.length || floor - lo >= h + 8) t.style.bottom = Math.round(innerHeight - floor + 4) + 'px';
    else if (hi - ceil >= h + 8) { t.style.bottom = 'auto'; t.style.top = Math.round(Math.max(ceil + 4, hi - h - 4)) + 'px'; }
    else { t.style.bottom = 'auto'; t.style.top = Math.round(ceil + 4) + 'px'; } // still pointer-events:none -> birds below stay tappable
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); clearTimeout(t._h); clearTimeout(t._c);
    t._h = setTimeout(function () { t.classList.remove('show'); t._c = setTimeout(function () { t.innerHTML = ''; }, 300); }, 1500); } /* v7.2: 1.5s, emptied after hiding */
  function starsFor(moves, min, n, daily) { /* v7.1 PM-4: 3 = min or fewer, 2 = <= ceil(min*1.3), 1 = clear; stages 1-5 always 3 (not for daily); undo still counts as a move */
    if (!daily && n <= C.stars.alwaysThreeTo) return 3; return moves <= min ? 3 : moves <= Math.ceil(min * C.stars.two) ? 2 : 1; }
  function starTip() { var e = $('startip'); if (e) e.textContent = '최소 ' + S.g.min + '수로 깨면 별 3개'; } /* v7.1 PM-4 */
  function starsHtml(k) { var h = ''; for (var i = 0; i < 3; i++) h += '<span class="' + (i < k ? '' : 'off') + '" style="animation-delay:' + (i * 150) + 'ms">' + STAR + '</span>'; return h; }
  function rows(n) { // DESIGN §4 grid rule
    if (n <= 4) return [n]; if (n <= 10) return [Math.ceil(n / 2), Math.floor(n / 2)];
    var a = Math.ceil(n / 3), b = Math.ceil((n - a) / 2); return [a, b, n - a - b];
  }
  function render() {
    $('stage').innerHTML = S.daily ? CAL(S.daily) + ' 오늘의 도전 · ' + dailyLabel(S.daily) : (S.g.rest ? '휴식 · ' : '') + '스테이지 ' + S.n;
    $('hudstars').innerHTML = starsHtml(S.moves === 0 ? 3 : starsFor(S.moves, S.g.min, sn()));
    $('stagesBtn').classList.toggle('dot', !!DD && !DD.doneToday(save.daily, today())); // unplayed daily -> red dot on the '스테이지' button (opens map + daily; QA F4)
    $('moves').textContent = '이동 ' + S.moves + ' / 최소 ' + S.g.min; $('moves').title = '되돌리기도 이동 1회로 세요'; // v7 B5
    var tutorialHint = S.g.tutorial && !S.won ? nextMove() : null, h = S.hint || tutorialHint;
    var stuck = !S.won && isStuck(); if (S.won) cancelFlights(); var fl = fx.fly && fx.fly.from ? fx.fly : null, flyBalls = []; // v7.1: reduced motion never shortens/skips flights (only '빠른 비행' changes timing)
    var b = $('board'), ae = document.activeElement, fi = ae && ae.parentNode && ae.classList.contains('tube') && b.contains(ae) ? [].indexOf.call(b.querySelectorAll('.tube'), ae) : -1; b.innerHTML = ''; // a11y: keep keyboard focus across re-renders
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
          var lo = document.createElement('img'); lo.className = 'lock'; lo.src = lk ? pr.lock : pr.lock; lo.alt = '자물쇠 ' + symKo(pr.symbol); d.appendChild(lo);
        }
        var st = document.createElement('div'); st.className = 'stack';
        t.forEach(function (c, j) {
          var w = document.createElement('span'); w.className = 'ballwrap ball';
          var im = document.createElement('img'); im.className = 'ball'; im.draggable = false; w.appendChild(im);
          var real = ballSrc(c), revealing = fx.reveal && fx.reveal.indexOf(i) >= 0 && j === t.length - 1;
          if (S.mask[i][j] || revealing) { im.src = BF.hidden; im.alt = '숨은 새'; }
          else { im.src = real.src; im.alt = real.alt; }
          im.className += ' bird'; if (!E.isKey(c) && !S.mask[i][j] && !revealing) { if (isd && C.palette[c]) im.src = BF.expr(c, 'happy'); else if (stuck && C.palette[c]) im.src = BF.expr(c, 'sad'); }
          if (symbolsLarge) { var bk = bigKey(c, S.mask[i][j] || revealing); if (bk) w.appendChild(bigSym(bk, false)); } /* v7b DESIGN 19.9: badge-lg overlay (12 colours, hidden, key-a/b/c), positions from badge-lg/overlay.css */
          if (revealing) { if (reduced) { im.src = real.src; im.alt = real.alt; } else { im.className += ' hidden-reveal'; setTimeout(function () { im.src = real.src; im.alt = real.alt; }, 210); } } // DESIGN 13.1: swap at 210ms
          if (E.isKey(c)) { im.className += ' key-ready'; if (!S.mask[i][j] && !symbolsLarge) w.appendChild(pairSym(GA.pair[c].symbol, 'keysym')); }
          var top = j === t.length - 1;
          if (top && i === S.sel) w.className += ' lifted';
          if (fx.drop === i && j >= t.length - (fl ? fl.n || 1 : 1)) { if (fl) flyBalls[j - (t.length - (fl.n || 1))] = w; else if (top) w.className += ' dropping'; }
          st.appendChild(w);
        });
        d.appendChild(st);
        if (h && ((S.sel < 0 && h[0] === i) || (S.sel === h[0] && h[1] === i))) { var m = document.createElement('div'); m.className = 'hintmark v5'; m.setAttribute('aria-label', '힌트'); d.appendChild(m); }
        if (fx.fresh === i && !reduced && !fl) sparkle(d);
        d.addEventListener('pointerdown', function (e) { e.preventDefault(); tap(i); });
        // QA F6: screen reader label + keyboard (Tab focus, Enter/Space = select / move)
        d.tabIndex = 0; d.setAttribute('role', 'button');
        d.setAttribute('aria-label', '횃대 ' + (i + 1) + ', 새 ' + t.length + '마리' + (t.length ? ' (' + t.map(function (c, j) { return S.mask[i][j] ? '숨은 새' : ballSrc(c).alt.split(', ')[0]; }).join(', ') + ')' : '') + (isd ? ', 완성' : '') + (lk ? ', 잠김' : '') + (i === S.sel ? ', 선택됨' : ''));
        d.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); tap(i); } });
        r.appendChild(d);
      })(idx);
    });
    if (fi >= 0) { var ft = b.querySelectorAll('.tube')[fi]; if (ft) try { ft.focus({ preventScroll: true }); } catch (e) { ft.focus(); } }
    placeLockSyms(b); rebind(b);
    if (fx.unlock) { consume(fx.keyFrom, fx.unlock.tube, fx.keySrc, fx.unlock.solved); fl = null; fx.fly = null; }
    if (fl && flyBalls.length && fl.from) { var nn = flyBalls.length, base = S.tubes[fl.to].length - nn;
      flyBalls.forEach(function (fb, q) { var ln = base + q, last = q === nn - 1; fly(fl.froms[q] || fl.from, fl.to, fb, fb.parentNode.parentNode, last && fx.fresh === fl.to, last ? fl.sounds : [], S.mask[fl.to][ln] ? null : S.tubes[fl.to][ln], ln, Math.min(q, 3) * C.flight.stagger); }); }
    else if (fx.fly && fx.fly.sounds) fx.fly.sounds.forEach(function (a) { sfx.play(a[0], a[1]); });
    btns(); tutor(); $('hint').disabled = S.locked; $('restart').disabled = S.locked;
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
    var noAd = SP.ads.mode() === 'none'; // QA F2: web build -> no ad labels
    $('undocnt').textContent = S.a.undoLeft > 0 ? S.a.undoLeft : noAd ? '' : '▶광고'; var ac = $('add').querySelector('.cnt'); ac.hidden = false; ac.textContent = S.a.addedTube ? '0' : '1'; // v7 A3: remaining-uses badge (1 per stage)
    $('add').setAttribute('aria-label', '횃대 추가, 남은 횟수 ' + (S.a.addedTube ? 0 : 1) + (noAd ? '' : ', 광고 보고 받기')); $('undo').setAttribute('aria-label', '되돌리기, ' + (S.a.undoLeft > 0 ? '남은 횟수 ' + S.a.undoLeft : '광고 보고 받기'));
    $('undo').disabled = !S.hist.length || S.locked || (S.a.undoLeft <= 0 && !rw); $('add').disabled = S.a.addedTube || S.locked || !rw;
    $('add').title = rw ? '' : '광고를 불러오는 중이에요';
  }
  // a11y: Korean bird names (DESIGN 14.14.1 캐릭터 표) + colour; symbols in Korean (no English 'red circle')
  var BIRD_KO = { red: ['루비', '빨간'], orange: ['망고', '주황'], yellow: ['레모', '노란'], green: ['새싹', '초록'], cyan: ['파도', '하늘색'], blue: ['탑', '파란'], purple: ['보라', '보라색'], white: ['구름', '하얀'], pink: ['복숭', '분홍'], brown: ['도토리', '갈색'], lime: ['라임', '연두'], indigo: ['별밤', '남색'] };
  var SYM_KO = { circle: '동그라미', triangle: '세모', square: '네모', star: '별', diamond: '마름모', heart: '하트', plus: '더하기', x: '엑스', hexagon: '육각형', moon: '달', drop: '물방울', ring: '고리', pentagon: '오각형', bolt: '번개', crescent: '초승달', clover: '클로버', flower: '꽃', note: '음표' };
  function birdName(k) { var b = BIRD_KO[k]; return b ? b[0] + '(' + b[1] + ' 새)' : '새'; }
  function symKo(s) { return SYM_KO[s] || '표식'; }
  SP._birdName = birdName; SP._symKo = symKo;
  // QA M1: size balls so the tube grid fits the board's real height/width (safe areas, HUD, buttons, banner excluded) for any tube count
  function fitBalls(b) {
    var rs = rows(S.tubes.length), n = rs.length, c = Math.max.apply(null, rs), cs = getComputedStyle(b);
    var h = b.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), w = b.clientWidth - 16;
    // per row: tube 4.9b (+ lift/badge room 0.5b) ; between rows: gap 0.6b+6 ; per tube width 1.3b + border 6 + gap 12
    var g = n > 2 ? 0.35 : 0.6, gp = n > 2 ? 3 : 6, fromH = (h - (n - 1) * gp - 12) / (n * 6.0 + (n - 1) * g), fromW = (w - (c - 1) * 8) / (c * 80 / 56); // perch: 80u wide, (60*4+80)u tall per 56u bird
    var cap = n <= 2 ? 62 : 44; // v7 B8: perch size maximised to the screen width for 1-2 rows (width still limits) // DESIGN 18.2 A12: few perches -> bigger birds (60-64px)
    var size = Math.floor(Math.max(18, Math.min(cap, fromH, fromW)));
    document.documentElement.style.setProperty('--ball-size', size + 'px');
    b.style.gap = Math.round(size * g + gp) + 'px'; // QA N2: tighter row gap for 3-row layouts
    document.documentElement.classList.toggle('sym-boost', size * 0.34 < 8); // QA N1 + DESIGN 13.8: key symbol badge (34% of ball) would render < 8px -> code fallback
  }
  window.addEventListener('resize', function () { if (S) render(); });
  function ballSrc(c) {
    if (E.isKey(c)) { var pr = GA.pair[c]; return { src: BF.key.replace('{pair}', pr.pair), alt: '열쇠 ' + symKo(pr.symbol) }; }
    var P = C.palette[c]; return { src: BF.expr(c, 'idle'), alt: birdName(P.key) + ', ' + symKo(P.symbol) + ' 표식' };
  }
  // DESIGN 13.3 key consume (~1020ms, input locked): 0 lift 140ms -> 140 fly to the lock 360ms -> 500 .key-consume/.lock.consume/.unlocking
  // (520ms; '찰칵' at ~790) -> 1020 remove key+lock+overlay, release input. Reduced motion: no flight, consume-fade 150ms together.
  function consume(fromRect, tubeIdx, keySrc, solved) {
    var d = document.querySelectorAll('#board .tube')[tubeIdx], lo = d && d.querySelector('.lock'), ov = d && d.querySelector('.lock-overlay');
    SP._consumeT0 = performance.now(); // QA hook (timeline checks)
    var S0 = S, T = { consume: 500, click: 790, end: 1020 }, w = null; // v7.1: key flight keeps its timing under reduced motion
    if (lo && fromRect) {
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
      if (solved) return cheer();
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
    if (S.cheer) return S.cheer.skip(); // tap during the clear celebration -> straight to the card
    if (S.locked || SP.ads.isBusy()) return;
    var pickable = function (k) { return S.tubes[k].length && !done(k) && !S.lock[k]; };
    if (S.sel < 0) { if (pickable(i)) { S.sel = i; warmSide(S.tubes[i][S.tubes[i].length - 1]); sfx.play('select'); } else { fx.shake = i; sfx.play('invalid'); } }
    else if (S.sel === i) S.sel = -1;
    else if (E.canMove(est(), S.sel, i)) {
      var from = S.sel, src = document.querySelectorAll('#board .tube')[from], sb = src && src.querySelector('.ballwrap:last-child'), kk = E.moveCount(est(), from, i), L0 = S.tubes[from].length;
      for (var q0 = 1; q0 < kk; q0++) if (S.mask[from][L0 - 1 - q0]) { kk = q0; break; } // v7: a hidden '?' bird stops the run
      var wraps = src ? [].slice.call(src.querySelectorAll('.ballwrap')) : [], froms = [];
      for (var q = 0; q < kk; q++) { var sl = L0 - 1 - q, air = flights.filter(function (f) { return f.to === from && f.slot === sl; })[0], ar = air ? air.clone.getBoundingClientRect() : null; if (air) finishFlight(air, true); // retarget mid-air
        froms.push(ar || (wraps[sl] ? wraps[sl].getBoundingClientRect() : null)); }
      var airRect = froms[0];
      var h = snap(); h.chain = S.chain; h.banked = S.banked; h.combo = S.combo; h.lastDone = S.lastDone; h.path = S.path; S.hist.push(h); pend = []; // R2 + gimmick state snapshot
      var sol = S.g.solution; S.path = S.path >= 0 && sol && sol[S.path] && sol[S.path][0] === from && sol[S.path][1] === i ? S.path + 1 : -1;
      var ball = S.tubes[from][S.tubes[from].length - 1], unlock = E.isKey(ball) && S.lock[i] === ball;
      var ns = E.apply(est(), from, i, kk); S.tubes = ns.t; S.lock = ns.lock; for (var q2 = 0; q2 < kk; q2++) { S.mask[from].pop(); if (!unlock) S.mask[i].push(false); }
      S.moves++; S.sel = -1; S.hint = null;
      var rv = revealTops(); if (rv.length) { fx.reveal = rv; snd('select'); } // hidden ball revealed the moment it becomes the top ball
      var solved = E.isSolved(est()), isd = !unlock && done(i);
      if (unlock) { fx.unlock = { tube: i, key: ball, solved: solved }; fx.keyFrom = sb ? (airRect || sb.getBoundingClientRect()) : null; fx.keySrc = ballSrc(ball).src; S.locked = true; S.consuming = true; } // undo: key move + unlock = 1 move (one hist entry)
      else { fx.drop = i; if (!isd) snd('drop', S.tubes[i].length - 1); if (S.caps[i] < 4 && S.tubes[i].length >= S.caps[i]) fx.full = i; }
      if (!isd && S.chain > 0) { S.banked += S.chain; S.chain = 0; } // chain broken by a normal move -> banked (paid on clear)
      if (isd) onTubeDone(i, solved);
      fx.fly = { from: !unlock && sb ? (airRect || sb.getBoundingClientRect()) : null, froms: unlock ? [] : froms, n: unlock ? 1 : kk, to: i, sounds: pend }; pend = null; SP._lastRun = kk;
      if (unlock) { fx.fly.sounds.forEach(function (a) { sfx.play(a[0], a[1]); }); fx.fly = null; render(); return; }
      if (solved) { S.locked = true; S.sel = -1; render(); return whenLanded(function () { setTimeout(cheer, CLEAR_DELAY); }); } // H1: lock all input during clear sequence (perch hop wave -> card)
    } else if (pickable(i)) { S.sel = i; warmSide(S.tubes[i][S.tubes[i].length - 1]); sfx.play('select'); }
    else { fx.shake = i; sfx.play('invalid'); }
    render();
  }
  function vibrate(ms) { if (!hapticsOn) return; SP._haptics.push(ms); if (navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }
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
    var c = $('combo'); c.className = S.combo >= 4 ? 'c4' : S.combo === 3 ? 'c3' : ''; c.textContent = '콤보 ×' + S.combo + '!';
    void c.offsetWidth; c.className += ' combo'; clearTimeout(c._e); c._e = setTimeout(function () { c.textContent = ''; c.className = ''; }, 1400); // v7.2 PM-2: emptied after the animation
    if (S.combo >= 3) { var f = document.createElement('div'); f.className = 'flash'; document.body.appendChild(f); setTimeout(function () { f.remove(); }, 300); }
    if (S.combo >= 4 && !reduced) { $('app').classList.add('screenshake'); setTimeout(function () { $('app').classList.remove('screenshake'); }, 200); }
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
  // DESIGN §6 클리어 시퀀스: after the last touchdown every perch (with its birds) hops once, left->right / top->bottom, then the clear card.
  // Stagger 60ms per perch (shortened so the wave never exceeds 420ms on big boards), hop 380ms, soft rising "뿅" per perch (sfx mute applies,
  // no vibration). Reduced motion (OS or 설정 › 움직임 줄이기): no hops, card right away. A tap anywhere on the board skips to the card.
  var HOP = { ms: 380, stagger: 60, wave: 420 };
  function cheer() {
    if (S.cheer || S.won) return;
    var S0 = S, ts = [].slice.call(document.querySelectorAll('#board .tube')), n = ts.length;
    if (!E.isSolved(est())) return win();
    var show = win(true); if (!show) return; // progress/coins are saved right away (app closed mid-wave keeps the clear); only the card waits
    ts = [].slice.call(document.querySelectorAll('#board .tube')); n = ts.length; // win() re-rendered the board
    if (reduced || !n || !ts[0].animate) { SP._cheer = { n: 0, reduced: reduced }; return show(); }
    var step = n > 1 ? Math.min(HOP.stagger, HOP.wave / (n - 1)) : 0, bs = parseFloat(getComputedStyle(ts[0]).getPropertyValue('--ball-size')) || 40, h = Math.round(Math.max(10, bs * 0.5)), anims = [], timers = [], over = false;
    var kf = [{ transform: 'translateY(0) scale(1,1)' }, { transform: 'translateY(0) scale(1.06,.9)', offset: .15 }, { transform: 'translateY(-' + h + 'px) scale(.96,1.05)', offset: .45, easing: 'cubic-bezier(.5,0,.75,0)' },
      { transform: 'translateY(0) scale(1.05,.94)', offset: .78 }, { transform: 'translateY(0) scale(1,1)' }];
    function end(skipped) { if (over) return; over = true; timers.forEach(clearTimeout); if (skipped) anims.forEach(function (a) { try { a.cancel(); } catch (e) {} }); /* natural end: the last hop's final ~80ms settles under the sliding card */ SP._cheer.end = performance.now(); SP._cheer.skipped = !!skipped; if (S === S0) { S.cheer = null; show(); } }
    SP._cheer = { n: n, step: step, ms: HOP.ms, h: h, start: performance.now(), delays: [], hops: 0 };
    S.cheer = { skip: function () { end(true); } };
    ts.forEach(function (t, i) { var d = Math.round(i * step); SP._cheer.delays.push(d); t.style.transformOrigin = '50% 100%';
      var a = t.animate(kf, { duration: HOP.ms, delay: d, easing: 'ease-out' }); anims.push(a);
      timers.push(setTimeout(function () { if (!over && S === S0) { SP._cheer.hops++; sfx.play('hop', i); } }, d + Math.round(HOP.ms * 0.15))); });
    var land = Math.round((n - 1) * step + HOP.ms * 0.78); // card slides up as the last perch touches down (DESIGN: jump -> confetti + card)
    timers.push(setTimeout(function () { end(false); }, land));
  }
  function win(defer) { // defer: save + fill the card now, return show() for the celebration to call later
    if (S.cheer) S.cheer = null;
    if (!E.isSolved(est())) { S.locked = false; render(); return; } // H1: re-check before saving
    S.won = true; var st = starsFor(S.moves, S.g.min, sn(), !!S.daily), prev = save.stars[S.n] || 0;
    $('cleartitle').textContent = S.daily ? '오늘의 도전 완료!' : '스테이지 클리어!'; $('cleartitle').classList.toggle('sr-only', !S.daily); /* v7 B6: art ribbon already says 스테이지 클리어 -> title for screen readers only (daily keeps its title) */ $('next').textContent = S.daily ? '캠페인으로' : '다음';
    if (S.daily) return winDaily(st, defer);
    var got = prev === 0 ? C.coinsFirstClear : Math.max(0, st - prev) * C.coinsPerStarImprove; // GDD v0.2
    // N1: combo coins paid only on clear; lifetime cap per stage persisted in save.comboPaid
    save.comboPaid = save.comboPaid || {}; var paid = save.comboPaid[S.n] || 0;
    var combo = Math.max(0, Math.min(S.banked, C.maxComboCoinsPerStage - paid)); save.comboPaid[S.n] = paid + combo;
    if (st > prev) starPop[S.n] = prev; /* v7 C14: newly earned map stars pop once */ save.stars[S.n] = Math.max(prev, st); save.coins += got + combo;
    if (S.n <= save.unlocked) save.unlocked = Math.max(save.unlocked, Math.min(S.n + 1, LAST)); // L3: debug-jumped stages don't unlock
    if (S.n < LAST) save.current = S.n + 1; // L2
    save.attempt[S.n] = { undoLeft: C.freeUndos, addedTube: false }; // GDD v0.2: clear resets this stage's consumables (restart does not)
    persist(); render();
    $('bigstars').innerHTML = starsHtml(st); $('result').textContent = '이동 ' + S.moves + ' / 최소 ' + S.g.min; starTip();
    $('coinsGot').innerHTML = IC('coin') + ' 코인 +' + (got + combo) + ' (보유 ' + save.coins + ')' + (combo ? ' · 콤보 +' + combo : ''); // v7 B6
    $('next').style.display = S.n < LAST ? '' : 'none';
    SP.ads.noteClear(S.n); // L7: interstitial (if due) shows only when the player taps 다음
    var end = S.n === LAST, show = function () { reveal(st); if (end) $('endov').classList.add('show'); }; // QA F3: all stages cleared -> '새 스테이지 곧 추가' ending
    if (defer) return show; show();
  }
  function reveal(st) { confetti(); sfx.play('clear'); for (var k = 0; k < st; k++) setTimeout(sfx.play.bind(sfx, 'star', k), 1000 + k * 150); SP._clearShownAt = performance.now(); $('overlay').classList.add('show'); } // DESIGN §7: fanfare, then a ding per star
  function winDaily(st, defer) { // first clear of the day pays the 7-day track reward (coins only); replays only keep the best stars
    var r = DD.complete(save.daily, S.daily, st); save.coins += r.reward;
    save.attempt.daily = { key: S.daily, undoLeft: C.freeUndos, addedTube: false }; persist(); render();
    $('bigstars').innerHTML = starsHtml(st); $('result').textContent = '이동 ' + S.moves + ' / 최소 ' + S.g.min; starTip();
    $('coinsGot').innerHTML = r.first ? IC('fire') + ' ' + r.streak + '일 연속 · ' + r.day + '일차 보상 ' + IC('coin') + ' +' + r.reward + ' · 보유 ' + save.coins : '오늘 보상은 이미 받았어요 · ' + IC('fire') + ' ' + r.streak + '일 연속';
    $('next').style.display = ''; SP._dailyResult = r;
    var show = function () { reveal(st); }; if (defer) return show; show();
  }
  function campaign() { return Math.min(save.current || 1, save.unlocked); }
  // DESIGN §5.5 daily card (top of the stage menu): date, streak flame, 7-day track (today highlighted), countdown once done
  var cdT = 0;
  function dailyCard() {
    var el = $('dailycard'); if (!el) return; if (!DD) { el.style.display = 'none'; return; }
    var k = today(), d = save.daily, done = DD.doneToday(d, k), cur = DD.streakNow(d, k), at = done ? (cur - 1) % 7 : cur % 7, h = '';
    DD.REWARDS.forEach(function (c, i) { h += '<div class="dday' + (i < at || (done && i === at) ? ' got' : '') + (i === at ? ' today' : '') + '"><b>' + (i + 1) + '일</b><span>' + (i < at || (done && i === at) ? '✓' : (i === 6 ? IC('gift') : IC('coin')) + c) + '</span></div>'; });
    el.innerHTML = '<div class="drow"><div class="dtitle">' + CAL(k) + ' 오늘의 도전 <small>' + dailyLabel(k) + '</small></div><div class="dstreak" title="최고 ' + (d.best || 0) + '일">' + IC('fire') + ' ' + cur + '일 연속</div></div>'
      + '<div class="dtrack">' + h + '</div><button class="btn ' + (done ? '' : 'primary ') + 'wide" id="dailyBtn">' + (done ? '다시 하기 (보상 없음) · <span id="dailyCd"></span> 후 새 도전' : '도전하기 ▶') + '</button>';
    $('dailyBtn').onclick = function () { $('menu').classList.remove('show'); clearInterval(cdT); load(DAILY); };
    clearInterval(cdT); if (done) { var tick = function () { var s = Math.ceil(DD.msToMidnight() / 1000), c = $('dailyCd'); if (!c || !$('menu').classList.contains('show')) return clearInterval(cdT); if (today() !== k) return dailyCard();
      c.textContent = Math.floor(s / 3600) + ':' + ('0' + Math.floor(s / 60) % 60).slice(-2) + ':' + ('0' + s % 60).slice(-2); }; tick(); cdT = setInterval(tick, 1000); }
  }
  function undo() {
    if (!S.hist.length || S.locked || SP.ads.isBusy()) return;
    var go = function () {
      if (S.locked || !S.hist.length) return;
      cancelFlights(); var h = S.hist.pop(); S.tubes = h.tubes; S.caps = h.caps; S.lock = h.lock; S.mask = h.mask; S.path = h.path; // undo restores '?' state and key/lock
      while (S.tubes.length < S.g.tubes.length + (S.a.addedTube ? 1 : 0)) { S.tubes.push([]); S.caps.push(4); S.lock.push(null); S.mask.push([]); } // M1: added tube is not undoable
      S.moves++; S.sel = -1; S.combo = 0; S.lastDone = -99; S.chain = h.chain; S.banked = h.banked; S.hint = null; sfx.play('undo'); render(); // R2: revoke chain/banked coins accrued by the undone move // undo counts as a move for stars
    };
    if (!SP.store.get('tip.undoMove')) { SP.store.set('tip.undoMove', '1'); toast('되돌리기도 이동 1회로 세요'); } /* v7 B5: one-time tip */
    if (S.a.undoLeft > 0) { S.a.undoLeft--; persist(); go(); } else SP.ads.showRewarded('undo', function (ok) { if (ok) go(); });
  }
  function addTube() { if (S.a.addedTube || S.locked || SP.ads.isBusy()) return; SP.ads.showRewarded('add_tube', function (ok) { if (ok && !S.a.addedTube && !S.locked) { S.a.addedTube = true; persist(); S.tubes.push([]); S.caps.push(4); S.lock.push(null); S.mask.push([]); S.sel = -1; render(); toast('횃대가 하나 늘었어요'); } }); }
  // DESIGN ch.16 saga map: bottom-to-top winding path, 10-stage chunk tiles per theme + a transition band above every 100.
  // Virtualized: only segments/nodes within ±1 screen of the viewport are in the DOM (positions are O(1) from the formula),
  // tile backgrounds are set when IntersectionObserver sees the segment (rootMargin 1 screen). Works for any LAST (200+).
  var M = C.map, BLK = M.chunkH * M.per + M.bandH, mapLive = {}, mapIO = null, mapK = 1, mapTotal = 0;
  function nodeXY(i) { var y = M.chunkH - 45 - 90 * i; return { x: 195 + 105 * Math.sin(2 * Math.PI * y / 450), y: y }; }
  function mapPos(n) { var b = Math.floor((n - 1) / 100), j = (n - 1) % 100, c = Math.floor(j / 10), q = nodeXY(j % 10); return { x: q.x, y: mapTotal - (b * BLK + c * M.chunkH + (M.chunkH - q.y)) }; }
  SP._mapPos = function (n) { return mapPos(n); };
  function soonSeg(e, th) { e.classList.add('saga-seg--soon'); if (th && M.wide) e.classList.add('v7-soon-' + th); e.setAttribute('aria-label', '새 스테이지 곧 추가'); return e; } // DESIGN 17.4 (A05): band above the last stage = '곧 추가돼요!' (no '201~' label)
  function segBg(e) { e.style.backgroundImage = 'url("' + e.dataset.src + '")'; SP.net.watchBg(e, e.dataset.src); } // v7.3: lazy tile + retry on failure
  function mapSeg(key, top, h, src, label) {
    var e = document.createElement('div'); e.className = 'saga-seg' + (M.wide ? ' saga-seg--wide v7-wide' : ''); /* v7 C14 */ e.style.top = top + 'px'; e.style.height = h + 'px'; e.dataset.src = src;
    if (label) { var l = document.createElement('div'); l.className = 'saga-band-label'; l.style.top = '50%'; l.textContent = label; e.appendChild(l); }
    if (mapIO) mapIO.observe(e); else segBg(e); return e;
  }
  function mapRender() {
    var W = M.wide || null;
    var mw = $('mapwrap'), vb = Math.max(0, Math.floor((mapTotal - ($('sagamap').scrollTop + $('sagamap').clientHeight / 2) / mapK) / BLK)), vk = C.themes[vb % C.themes.length].key; // v7 C14 panel fill = visible theme
    if (mw && !mw.classList.contains('v7-map-' + vk)) { C.themes.forEach(function (t) { mw.classList.remove('v7-map-' + t.key); }); mw.classList.add('v7-map-' + vk); }
    var m = $('sagamap'), tr = $('sagatrack'), vh = m.clientHeight / mapK, st = m.scrollTop / mapK, lo = mapTotal - (st + 2 * vh), hi = mapTotal - (st - vh), want = {}, blocks = Math.ceil(LAST / 100);
    for (var b = Math.max(0, Math.floor(lo / BLK)); b <= Math.min(blocks - 1, Math.floor(hi / BLK)); b++) {
      var th = C.themes[b % C.themes.length].key, nx = C.themes[(b + 1) % C.themes.length];
      for (var c = 0; c <= M.per; c++) { var y0 = b * BLK + c * M.chunkH, h = c < M.per ? M.chunkH : M.bandH; if (y0 + h < lo || y0 > hi) continue;
        var k = 'g' + b + '_' + c; want[k] = 1;
        if (!mapLive[k]) tr.insertBefore(mapLive[k] = c < M.per ? mapSeg(k, mapTotal - y0 - h, h, (W ? W.chunk : M.chunk).replace('{key}', th)) : (b === blocks - 1 ? soonSeg(mapSeg(k, mapTotal - y0 - h, h, W ? W.soon.replace('{key}', th) : 'assets-map-map-band-coming-soon.svg?v=03a37a9c'), th) : mapSeg(k, mapTotal - y0 - h, h, (W ? W.band : M.band).replace('{from}', th).replace('{to}', nx.key), (b * 100 + 101) + '~ ' + nx.name)), tr.firstChild);
        if (c === M.per) continue;
        for (var i = 0; i < M.per; i++) { var n = b * 100 + c * 10 + i + 1; if (n > LAST) break; want['n' + n] = 1; if (mapLive['n' + n]) continue; tr.appendChild(mapLive['n' + n] = mapNode(n)); } } }
    for (var key in mapLive) if (!want[key]) { if (mapIO && key[0] === 'g') mapIO.unobserve(mapLive[key]); mapLive[key].remove(); delete mapLive[key]; }
    var mid = mapTotal - (st + vh / 2), fb = Math.max(0, Math.floor(mid / BLK)); $('maptheme').textContent = C.themes[fb % C.themes.length].name; // HUD: theme at screen centre
  }
  function mapNode(n) {
    var p = mapPos(n), cur = Math.min(save.unlocked, LAST), stt = n > save.unlocked ? 'locked' : n === cur && !save.stars[n] ? 'current' : n < cur || save.stars[n] ? 'cleared' : 'current';
    var e = document.createElement('button'); e.className = 'map-node map-node--' + stt + (n === S.n ? ' map-node--playing' : ''); e.style.left = p.x + 'px'; e.style.top = p.y + 'px'; e.dataset.n = n;
    e.textContent = n; e.setAttribute('aria-label', '스테이지 ' + n + ' ' + ({ locked: '잠김', current: '현재', cleared: '클리어' })[stt]); e.disabled = stt === 'locked';
    if (stt === 'cleared') { // v7 B7: every cleared node shows earned stars (filled) + empty ones
       var w = document.createElement('div'); w.className = 'map-stars'; for (var i = 0; i < 3; i++) { var t = document.createElement('i'); t.className = 'map-star v7-star' + (i < (save.stars[n] || 0) ? ' on' : '') + (!reduced && n in starPop && i >= starPop[n] && i < (save.stars[n] || 0) ? ' pop' : ''); /* v7 B7: v7ui star-clear on/off art via .v7-star */ w.appendChild(t); } e.appendChild(w); }
    if (n in starPop) setTimeout(function () { delete starPop[n]; }, 0);
    e.onclick = function () { $('menu').classList.remove('show'); load(n); }; return e;
  }
  var mapRaf = 0;
  function menu() {
    $('menu').classList.add('show'); // show first: a map/daily problem must never leave the gear doing nothing
    try { $('coins').innerHTML = IC('coin') + ' ' + save.coins; dailyCard(); } catch (e) { console.error('menu: daily card', e); }
    try { mapOpen(); } catch (e) { console.error('menu: saga map', e); }
  }
  function mapOpen() {
    var m = $('sagamap'), tr = $('sagatrack'); if (!m || !tr) return;
    for (var key in mapLive) mapLive[key].remove(); mapLive = {}; if (mapIO) mapIO.disconnect();
    mapIO = window.IntersectionObserver ? new IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) { segBg(x.target); mapIO.unobserve(x.target); } }); }, { root: m, rootMargin: '100% 0px' }) : null;
    mapTotal = Math.ceil(LAST / 100) * BLK; mapK = Math.min(1, (m.clientWidth || M.w) / M.w);
    tr.style.height = mapTotal + 'px'; tr.style.transform = 'scale(' + mapK + ')'; $('sagasize').style.height = mapTotal * mapK + 'px';
    var focus = Math.min(Math.max(1, save.unlocked), LAST); m.scrollTop = (mapPos(focus).y + 120) * mapK - m.clientHeight / 2; // current node a bit below centre
    if (!m._bound) { m._bound = true; m.addEventListener('scroll', function () { if (!mapRaf) mapRaf = requestAnimationFrame(function () { mapRaf = 0; mapRender(); }); }, { passive: true }); }
    mapRender();
  }
  $('undo').onclick = undo; function doRestart() { $('restartov').classList.remove('show'); if (S.a.addedTube) { S.a.addedTube = false; persist(); } load(S.n); }
  $('board').addEventListener('pointerdown', hideToast, true); // v7.2 PM-1: tapping the board closes the toast (the tap itself still reaches the bird)
  if (window.MutationObserver) { var tOb = new MutationObserver(function () { if (document.querySelector('.ov.show')) hideToast(); }); [].forEach.call(document.querySelectorAll('.ov'), function (o) { tOb.observe(o, { attributes: true, attributeFilter: ['class'] }); }); } // any modal/sheet -> toast closes at once
  $('restart').onclick = function () { if (S.locked || SP.ads.isBusy()) return; if (dirty()) { $('restartMsg').textContent = (S.moves > 0 || (S.hist && S.hist.length)) ? '지금까지의 이동이 사라져요.' : (S.a.addedTube ? '추가한 횃대도 사라져요.' : '지금까지의 이동이 사라져요.'); $('restartov').classList.add('show'); } else doRestart(); }; // v7 A4 + v7.1 PM-6: confirm whenever the board differs from the stage start (moves, added perch, ...)
  function dirty() { if (S.moves > 0 || S.hist.length || S.a.addedTube) return true; var lk = S.lock.filter(Boolean).length, hd = 0; S.mask.forEach(function (m) { m.forEach(function (x) { if (x) hd++; }); });
    return JSON.stringify([S.tubes, S.g.caps ? S.caps : null, lk, hd]) !== S.init0; }
  $('restartYes').onclick = doRestart; $('restartNo').onclick = function () { $('restartov').classList.remove('show'); }; $('add').onclick = addTube; // QA F10: restart also removes the added perch (undo count kept); // M2: consumables persist via save.attempt
  $('hint').onclick = function () { if (S.locked) return; S.hint = nextMove(); S.sel = -1; render(); };
  // gear + HUD '스테이지' button: pointer events (touch/pen act on pointerup, the synthetic click after it is swallowed) + click (mouse/keyboard)
  function onTap(el, fn) { if (!el) return; var skip = 0;
    el.addEventListener('pointerup', function (e) { if (e.pointerType === 'mouse') return; skip = Date.now(); fn(e); });
    el.addEventListener('touchend', function (e) { if (e.cancelable) e.preventDefault(); }); // no synthetic ghost click on whatever the toggle just revealed/hid (map 닫기 bug)
    el.addEventListener('click', function (e) { if (Date.now() - skip < 600) return; fn(e); }); }
  // QA F4: gear = settings panel only; '스테이지' = map + daily
  function settingsOpen() { syncSym(); $('setov').classList.add('show'); }
  onTap($('settings'), settingsOpen); onTap($('stagesBtn'), menu); onTap($('closeMenu'), function () { $('menu').classList.remove('show'); clearInterval(cdT); });
  $('closeSet').onclick = function () { $('setov').classList.remove('show'); };
  // QA F3: ending popup after the last stage
  function endClose() { $('endov').classList.remove('show'); $('overlay').classList.remove('show'); SP.ads.cancelDue(); }
  $('endDaily').onclick = function () { endClose(); load(DAILY); };
  $('endMap').onclick = function () { endClose(); menu(); };
  function syncSym() { $('bigsym').checked = symbolsLarge; $('sound').checked = !(SP.sfx && SP.sfx.isMuted()); $('haptics').checked = hapticsOn; $('rmotion').checked = reduced; $('rmotion').disabled = osReduced; $('rmnote').hidden = !osReduced; }
  $('haptics').onchange = function () { hapticsOn = this.checked; SP.store.set(HAP_KEY, hapticsOn ? 'on' : 'off'); if (hapticsOn) vibrate(15); };
  $('rmotion').onchange = function () { if (osReduced) return; reduced = this.checked; SP.store.set(RM_KEY, String(reduced)); applyReduced(); if (S) render(); };
  $('sound').onchange = function () { if (SP.sfx) { SP.sfx.setMuted(!this.checked); if (this.checked) sfx.play('select'); } }; // DESIGN §5.6 settings: sound on/off (persisted)
  $('bigsym').onchange = function () { symbolsLarge = this.checked; SP.store.set(A11Y_KEY, String(symbolsLarge)); document.documentElement.classList.toggle('symbols-large', symbolsLarge); render(); };
  $('fastfly').checked = SP.store.get(FLY_KEY) === 'fast'; $('fastfly').onchange = function () { flySpeed = this.checked ? 'fast' : 'normal'; SP.store.set(FLY_KEY, flySpeed); };
  syncSym();
  $('theme').onclick = function () { var d = document.documentElement; save.theme = d.dataset.theme === 'light' ? '' : 'light'; d.dataset.theme = save.theme; persist(); };
  $('next').onclick = function () { if (SP.ads.isBusy()) return; if (S.daily) { $('overlay').classList.remove('show'); return load(campaign()); } var n = S.n + 1; SP.ads.beforeNext(function () { $('overlay').classList.remove('show'); load(n); }); };
  $('again').onclick = function () { SP.ads.cancelDue(); $('overlay').classList.remove('show'); load(S.n); };
  // L4: Android back -> close popup -> stage select -> exit confirm modal
  var shown = function (id) { return $(id).classList.contains('show'); };
  function exitModal(on) { $('exitov').classList.toggle('show', on); }
  SP.platform.onBack(function () {
    if (SP.ads.isBusy()) return true;                         // the ad owns the back key while it plays
    if (shown('exitov')) { exitModal(false); return true; }   // popup close
    if (shown('restartov')) { $('restartov').classList.remove('show'); return true; }
    if (shown('endov')) { $('endMap').onclick(); return true; }
    if (shown('themeov')) { $('themeov').classList.remove('show'); return true; }
    if (shown('setov')) { $('setov').classList.remove('show'); return true; }
    if (shown('overlay')) { SP.ads.cancelDue(); $('overlay').classList.remove('show'); if (S.won) { if (S.daily) load(campaign()); else if (S.n < LAST) load(S.n + 1); menu(); } return true; } // clear card -> stage select
    if (shown('menu')) { exitModal(true); return true; }      // on stage select -> exit confirm
    menu(); return true;                                        // in game -> stage select
  });
  $('exitYes').onclick = function () { exitModal(false); persist(); SP.platform.close(); };
  $('exitNo').onclick = function () { exitModal(false); };
  $('exitBtn').onclick = function () { exitModal(true); }; $('exitBtn').hidden = !SP.platform.isToss; // v7 B11: '게임 종료' only inside the Toss app
  SP.ads.onChange(function () { if (S) btns(); });
  var start = Math.min(save.current || 1, save.unlocked);
  SP.ads.showBanner(); load(start); if (bootToMap) try { menu(); } catch (e) {}
  var sp = $('splash'); if (sp) { sp.classList.add('out'); setTimeout(function () { sp.remove(); }, 300); } // L6: first screen ready
  SP._bootMs = Math.round(performance.now()); SP._inputLocked = function () { return S.locked && !S.won; };
});
