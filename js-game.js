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
  var F80 = !!(C.features && C.features.v80) && !!SP.v8, EC = C.economy, V8 = SP.v8, V8A = C.v8;
  var QAP = false; // v8.1.1: true only in the QA practice mode (the toss build strips the block below, so it stays false there)
  //@qa-start
  QAP = !!SP.QA;
  //@qa-end
  var F81 = F80 && !!C.features.v81, E81 = C.economy81, V81 = C.v81, M81 = SP.v81;
  var F82 = F81 && !!C.features.v82, FB = F81 && !!C.features.eggBrood, V82 = C.v82, E82 = C.economy82; // v8.2 (HIDDEN): off = exactly the v8.1.4 game // v8.1 (GDD v8 §4): off = exactly the v8.0 game
  if (F80 && save.v !== 8) { var raw0 = SP.store.get(KEY); if (raw0 && !SP.store.get(KEY + '.bak')) SP.store.set(KEY + '.bak', raw0); save = V8.migrateV8(save); } // v8 G4: original kept in sortpuzzle.v1.bak
  if (V8 && V8.normDays) V8.normDays(save); // v8.1.2: legacy day keys -> local date (in memory; saved with the next normal persist)
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
  var rawSfx = SP.sfx || { play: function () {} }, S, fx = {}, sfx = { play: function (n, a) { if (HAPTIC[n]) vibrate(HAPTIC[n], n); rawSfx.play(n, a); } };
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
  // v8.2 a11y (planner 14:37): eggs are not birds — listed separately as '알(색, N번 남음)'; sleeping/bomb birds carry their state (v82 only; flag OFF keeps v8.1.4 labels)
  function ariaBirds82(i, t) { var st = est(), eggs = [], birds = [];
    t.forEach(function (c, j) { var eg = E.eggAt(st, i, j), nm = S.mask[i][j] ? '숨은 새' : ballSrc(c).alt.split(', ')[0];
      if (eg) { eggs.push('알(' + (S.mask[i][j] ? '?' : birdName(C.palette[c].key)) + ', ' + eg.n + '번 남음)'); return; }
      if (E.slpAt && E.slpAt(st, i, j)) nm += '(잠듦)'; if (S.bomb && S.bomb.i === i && S.bomb.j === j) nm += '(폭탄 ' + S.bomb.n + ')'; birds.push(nm); });
    return ', 새 ' + birds.length + '마리' + (birds.length ? ' (' + birds.join(', ') + ')' : '') + (eggs.length ? ', ' + eggs.join(', ') : ''); }
  function est() { var o = { t: S.tubes, cap: S.caps, lock: S.lock }; if (S.cage) o.cage = S.cage; if (S.egg) o.egg = S.egg; if (S.slp) { o.slp = S.slp; o.alarm = S.alarm; } if (S.al) o.al = S.al; if (S.brood) o.brood = 1; if (S.th) o.th = S.th; if (S.ice) o.ice = S.ice; if (S.bomb) o.bomb = S.bomb; if (S.boom) o.boom = 1; return o; } // v8.2 fields only exist when the stage has them
  function setX(ns) { S.egg = ns.egg || null; S.slp = ns.slp || null; S.alarm = ns.slp ? ns.alarm : null; S.al = ns.al || null; S.brood = ns.brood ? 1 : 0; S.th = ns.th && ns.th.length ? ns.th : null; S.ice = ns.ice && ns.ice.length ? ns.ice : null; S.bomb = ns.bomb || null; S.boom = ns.boom ? 1 : 0; } // v8.1 M3/M4 extras (eggs, sleepers, alarm badge)
  function xsnap() { var c = E.clone(est()); return { egg: c.egg || null, slp: c.slp || null, alarm: c.slp ? c.alarm : null, al: c.al || null, brood: c.brood || 0, th: c.th || null, ice: c.ice || null, bomb: c.bomb || null, boom: c.boom || 0 }; } // v8 M1: cage[i] = {f,t,n} | null
  function done(i) { return E.isDone(est(), i); }
  function snap() { return { tubes: S.tubes.map(function (t) { return t.slice(); }), caps: S.caps.slice(), lock: S.lock.slice(), mask: S.mask.map(function (m) { return m.slice(); }), cage: S.cage ? S.cage.map(function (k) { return k ? { f: k.f, t: k.t, n: k.n } : null; }) : null, x: xsnap() }; } // v8 G3: cage counters in the undo snapshot
  function stageOf() { return { tubes: S.tubes, caps: S.caps, locks: S.lock.map(function (k, i) { return k ? { tube: i, key: k } : null; }).filter(Boolean), cages: S.cage ? S.cage.map(function (k, i) { return k ? { tube: i, from: k.f, to: k.t, n: k.n } : null; }).filter(Boolean) : null, eggs: S.egg ? S.egg.map(function (e) { return { tube: e.i, at: e.j, n: e.n }; }) : null, sleep: S.slp, alarm: S.alarm, alarmAt: S.al, brood: S.brood || undefined, thorn: S.th || undefined, ice: S.ice ? S.ice.map(function (z) { return { tube: z.i, n: z.n }; }) : undefined, bomb: S.bomb ? { tube: S.bomb.i, at: S.bomb.j, n: S.bomb.n } : undefined }; }
  function revealTops() { var r = []; S.mask.forEach(function (m, i) { if (m.length && m[m.length - 1]) { m[m.length - 1] = false; r.push(i); } }); return r; }
  function perches(a) { return a.perches != null ? a.perches : a.addedTube ? 1 : 0; } // v8: number of added perches this attempt (v7 saves: addedTube boolean)
  function load(n) {
    if (F81 && S && !S.won && !S.daily && S.moves > 0 && n !== S.n && !(S.a && S.a.sandbox)) { M81.streakReset(save); } // P4: leaving a stage half-played breaks the streak
    cancelFlights();
    var sb = false;
    var dk = n === DAILY ? today() : null, g = dk ? DD.build(SP.STAGES, dk, C.palette.length, F82 ? THO() : undefined) : SP.STAGES[n];
    if (dk && (!save.attempt.daily || save.attempt.daily.key !== dk)) save.attempt.daily = { key: dk, undoLeft: C.freeUndos, addedTube: false }; // fresh consumables each day
    var a = dk ? save.attempt.daily : sb ? (S && S.n === n && S.a.sandbox ? S.a : { undoLeft: C.freeUndos, addedTube: false, sandbox: true }) : (save.attempt[n] || (save.attempt[n] = { undoLeft: C.freeUndos, addedTube: false }));
    var tubes = g.tubes.map(function (t) { return t.slice(); });
    var caps = g.caps ? g.caps.slice() : tubes.map(function () { return 4; }), lock = tubes.map(function () { return null; });
    (g.locks || []).forEach(function (l) { lock[l.tube] = l.key; });
    var mask = tubes.map(function (t) { return t.map(function () { return false; }); }); (g.hidden || []).forEach(function (h) { mask[h[0]][h[1]] = true; });
    var cage = null; if (g.cages && g.cages.length) { cage = tubes.map(function () { return null; }); g.cages.forEach(function (c) { cage[c.tube] = { f: c.from, t: c.to, n: c.n }; }); } // v8 M1
    var np = perches(a); for (var ap = 0; ap < np; ap++) { tubes.push([]); caps.push(4); lock.push(null); mask.push([]); if (cage) cage.push(null); } // purchased tube(s) survive restart (v8: up to C.economy.perchMaxPerStage)
    S = { n: n, daily: dk, g: g, a: a, tubes: tubes, caps: caps, lock: lock, mask: mask, cage: cage, egg: null, slp: null, alarm: null, al: null, hist: [], sel: -1, path: 0, moves: 0, lastDone: -99, combo: 0, chain: 0, banked: 0, won: false, locked: false, hint: null, undos: 0, unsolvRun: 0 };
    if (F81) setX(E.init(g)); if (F82) load82(n, g, dk); S.init0 = JSON.stringify([g.tubes, g.caps || null, (g.locks || []).length, (g.hidden || []).length]); /* v7.1 PM-6: the stage's pristine layout */
    applyTheme(dk ? 1 + 100 * (g.seed % C.themes.length) : n, sb || !!dk); // daily: theme rotates by date, no unlock toast
    if (!sb) { if (!dk) save.current = n; persist(); } fx = {}; render(); if (F80) stageTips(); if (F81 && !sb && !dk) metaStart(n, g); try { artStage(g, n); } catch (e) { console.error('artStage', e); } // art warm-up must never break a stage
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
    $('stagesBtn').classList.toggle('dot', redDot()); // unplayed daily -> red dot on the '스테이지' button (opens map + daily; QA F4)
    $('moves').textContent = '이동 ' + S.moves + ' / 최소 ' + S.g.min; $('moves').title = '되돌리기도 1수로 세요'; // v7 B5
    var tutorialHint = S.g.tutorial && !S.won ? nextMove() : null, h = S.hint || tutorialHint;
    var stuck = !S.won && isStuck(); if (S.won) cancelFlights(); var fl = fx.fly && fx.fly.from ? fx.fly : null, flyBalls = []; // v7.1: reduced motion never shortens/skips flights (only '빠른 비행' changes timing)
    var b = $('board'), ae = document.activeElement, fi = ae && ae.parentNode && ae.classList.contains('tube') && b.contains(ae) ? [].indexOf.call(b.querySelectorAll('.tube'), ae) : -1; b.innerHTML = ''; // a11y: keep keyboard focus across re-renders
    var lay = fitBalls(b);
    var idx = 0;
    lay.forEach(function (cnt) {
      var r = document.createElement('div'); r.className = 'row'; b.appendChild(r);
      for (var k = 0; k < cnt; k++, idx++) (function (i) {
        var t = S.tubes[i], d = document.createElement('div'), isd = done(i), small = S.caps[i] < 4, lk = S.lock[i];
        d.className = 'tube perch' + (isd ? ' complete' : '') + (fx.fresh === i && !fl ? ' fresh' : '') + (fx.shake === i ? ' shake' : '') + (small ? ' small' : '') + (small && fx.full === i ? ' full' : '') + (lk ? ' locked' : '') + (fx.unlock && fx.unlock.tube === i ? ' locked' : '') + (F82 && S.th && S.th.indexOf(i) >= 0 ? ' thorn' : '');
        if (isd) { var bd = document.createElement('img'); bd.className = 'badge'; bd.src = C.assets.badge; bd.alt = ''; d.appendChild(bd); }
        if (small) { var cb = document.createElement('img'); cb.className = 'capbadge'; cb.src = GA.smallTube.badge; cb.alt = '용량 3'; d.appendChild(cb); } // DESIGN 13.4: no complete glow/check on small tubes
        var lockKey = lk || (fx.unlock && fx.unlock.tube === i ? fx.unlock.key : null);
        if (lockKey) { var pr = GA.pair[lockKey], ov = document.createElement('img'); ov.className = 'lock-overlay'; ov.src = small ? BF.perch.perchSmallLocked : BF.perch.perchLocked; ov.alt = ''; d.appendChild(ov);
          var lo = document.createElement('img'); lo.className = 'lock'; lo.src = lk ? pr.lock : pr.lock; lo.alt = '자물쇠 ' + symKo(pr.symbol); d.appendChild(lo);
        }
        if (F82) iceFx(d, i);
        var st = document.createElement('div'); st.className = 'stack';
        t.forEach(function (c, j) {
          var w = document.createElement('span'); w.className = 'ballwrap ball';
          var im = document.createElement('img'); im.className = 'ball'; im.draggable = false; w.appendChild(im);
          var real = ballSrc(c), revealing = fx.reveal && fx.reveal.indexOf(i) >= 0 && j === t.length - 1;
          if (S.mask[i][j] || revealing) { im.src = BF.hidden; im.alt = '숨은 새'; }
          else { im.src = real.src; im.alt = real.alt; }
          im.className += ' bird'; if (!E.isKey(c) && !S.mask[i][j] && !revealing) { if (isd && C.palette[c]) im.src = BF.expr(c, 'happy'); else if (stuck && C.palette[c]) im.src = BF.expr(c, 'sad'); }
          if (symbolsLarge) { var bk = bigKey(c, S.mask[i][j] || revealing); if (bk) w.appendChild(bigSym(bk, false)); } /* v7b DESIGN 19.9: badge-lg overlay (12 colours, hidden, key-a/b/c), positions from badge-lg/overlay.css */
          if (revealing) { var sur = F80 ? surprisedSrc(c) : null; // v8 M2a: '깜짝' face 0.4s on reveal, then idle (reduced motion: face swap only)
            if (reduced) { im.src = sur || real.src; im.alt = real.alt; if (sur) setTimeout(function () { im.src = real.src; }, V8A.revealMs); }
            else { im.className += ' hidden-reveal'; setTimeout(function () { im.src = sur || real.src; im.alt = real.alt; if (sur) { im.classList.add('v8-surprised'); setTimeout(function () { im.src = real.src; im.classList.remove('v8-surprised'); }, V8A.revealMs); } }, 210); } } // DESIGN 13.1: swap at 210ms
          if (F81 && !E.isKey(c) && C.palette[c]) xBird(w, im, i, j, c); if (F82) bombFx(w, i, j);
          var cg = S.cage && S.cage[i], co = fx.cageOpen && fx.cageOpen.filter(function (o) { return o.i === i; })[0]; // v8 M1 cage overlay per caged slot (DESIGN 20.1)
          if (cg && j >= cg.f && j <= cg.t) { var cv = document.createElement('div'); cv.className = 'v8-cage'; w.appendChild(cv); w.classList.add('caged');
            if (j === cg.t) { var lid = document.createElement('div'); lid.className = 'v8-cage-lid'; w.appendChild(lid); w.classList.add('caged-top'); } /* v8.1.2: cage-front.svg top rail as the lid of the caged run, kept above a free bird on top */
            if (j === cg.t) { var cb2 = document.createElement('div'); cb2.className = 'v8-cage-badge n' + Math.min(3, cg.n) + (fx.cageTick && fx.cageTick.indexOf(i) >= 0 ? ' tick' : ''); if (symbolsLarge) cb2.style.backgroundImage = 'url("' + V8A.cageBadgeLg.replace('{n}', Math.min(3, cg.n)) + '")'; w.appendChild(cb2); } }
          else if (co && j >= co.f && j <= co.t) { var ov2 = document.createElement('div'); ov2.className = 'v8-cage open'; w.appendChild(ov2); setTimeout(function () { ov2.remove(); }, reduced ? 500 : 650); }
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
        d.setAttribute('aria-label', '횃대 ' + (i + 1) + (F82 ? ariaBirds82(i, t) : ', 새 ' + t.length + '마리' + (t.length ? ' (' + t.map(function (c, j) { return S.mask[i][j] ? '숨은 새' : ballSrc(c).alt.split(', ')[0]; }).join(', ') + ')' : '')) + (isd ? ', 완성' : '') + (lk ? ', 잠김' : '') + (S.cage && S.cage[i] ? ', 새장 ' + S.cage[i].n : '') + (F82 && S.th && S.th.indexOf(i) >= 0 ? ', 가시 둥지(출발만)' : '') + (F82 && S.ice && E.iceAt(est(), i) ? ', 얼음 ' + E.iceAt(est(), i).n : '') + (i === S.sel ? ', 선택됨' : ''));
        d.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); tap(i); } });
        r.appendChild(d);
      })(idx);
    });
    if (fi >= 0) { var ft = b.querySelectorAll('.tube')[fi]; if (ft) try { ft.focus({ preventScroll: true }); } catch (e) { ft.focus(); } }
    placeLockSyms(b); rebind(b); if (F81) chainFx(b);
    if (fx.unlock) { consume(fx.keyFrom, fx.unlock.tube, fx.keySrc, fx.unlock.solved); fl = null; fx.fly = null; }
    if (fl && flyBalls.length && fl.from) { var nn = flyBalls.length, base = S.tubes[fl.to].length - nn;
      flyBalls.forEach(function (fb, q) { var ln = base + q, last = q === nn - 1; fly(fl.froms[q] || fl.from, fl.to, fb, fb.parentNode.parentNode, last && fx.fresh === fl.to, last ? fl.sounds : [], S.mask[fl.to][ln] ? null : S.tubes[fl.to][ln], ln, Math.min(q, 3) * C.flight.stagger); }); }
    else if (fx.fly && fx.fly.sounds) fx.fly.sounds.forEach(function (a) { sfx.play(a[0], a[1]); });
    btns(); tutor(); $('hint').disabled = S.locked; $('restart').disabled = S.locked; if (F80) chips();
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
    if (F80) { var pl = EC.perchMaxPerStage - perches(S.a); $('undocnt').textContent = S.a.undoLeft > 0 ? S.a.undoLeft : '+'; ac.textContent = pl; $('undo').disabled = S.locked; $('undo').classList.toggle('v8-idle', !S.hist.length && S.a.undoLeft > 0); $('add').disabled = S.locked || pl <= 0; $('add').title = '';
      $('add').setAttribute('aria-label', '횃대 추가, 남은 횟수 ' + pl); $('undo').setAttribute('aria-label', '되돌리기, ' + (S.a.undoLeft > 0 ? '남은 횟수 ' + S.a.undoLeft : '코인이나 광고로 받기'));
      var hf = hintFree(), hc = $('hintcnt'); if (!hc) { hc = document.createElement('span'); hc.className = 'cnt'; hc.id = 'hintcnt'; $('hint').appendChild(hc); } hc.textContent = hf ? (!S.daily && S.n <= EC.freeHintUnlimitedTo ? '∞' : '1') : (F81 && save.inventory.hint > 0 ? save.inventory.hint : '+'); $('hint').setAttribute('aria-label', '힌트' + (hf ? ', 무료' : F81 && save.inventory.hint > 0 ? ', 보유 ' + save.inventory.hint + '개' : ', 코인이나 광고로 받기')); }
    if (F82) btns82();
  }
  // a11y: Korean bird names (DESIGN 14.14.1 캐릭터 표) + colour; symbols in Korean (no English 'red circle')
  var BIRD_KO = { red: ['루비', '빨간'], orange: ['망고', '주황'], yellow: ['레모', '노란'], green: ['새싹', '초록'], cyan: ['파도', '하늘색'], blue: ['탑', '파란'], purple: ['보라', '보라색'], white: ['구름', '하얀'], pink: ['복숭', '분홍'], brown: ['도토리', '갈색'], lime: ['라임', '연두'], indigo: ['별밤', '남색'] };
  var SYM_KO = { circle: '동그라미', triangle: '세모', square: '네모', star: '별', diamond: '마름모', heart: '하트', plus: '더하기', x: '엑스', hexagon: '육각형', moon: '달', drop: '물방울', ring: '고리', pentagon: '오각형', bolt: '번개', crescent: '초승달', clover: '클로버', flower: '꽃', note: '음표' };
  function birdName(k) { var b = BIRD_KO[k]; return b ? b[0] + '(' + b[1] + ' 새)' : '새'; }
  function symKo(s) { return SYM_KO[s] || '표식'; }
  SP._birdName = birdName; SP._symKo = symKo;
  // QA M1: size balls so the tube grid fits the board's real height/width (safe areas, HUD, buttons, banner excluded) for any tube count
  function fitBalls(b) { // 2026-10-28 (QA N2): 11-14 perches try 3 rows AND 2 wider rows, keep whichever gives bigger birds
    var cs = getComputedStyle(b), h = b.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), w = b.clientWidth - 16, N = S.tubes.length;
    function fit(rs) { var n = rs.length, c = Math.max.apply(null, rs);
      // per row: tube 4.9b (+ lift/badge room 0.5b) ; between rows: gap 0.6b+6 ; per tube width 1.3b + border 6 + gap 12
      var g = n > 2 ? 0.35 : 0.6, gp = n > 2 ? 3 : 6, fromH = (h - (n - 1) * gp - 12) / (n * 6.0 + (n - 1) * g), fromW = (w - (c - 1) * 8) / (c * 80 / 56); // perch: 80u wide, (60*4+80)u tall per 56u bird
      var cap = n <= 2 ? 62 : 44; // v7 B8: perch size maximised to the screen width for 1-2 rows (width still limits) // DESIGN 18.2 A12: few perches -> bigger birds (60-64px)
      return { rs: rs, g: g, gp: gp, size: Math.floor(Math.max(18, Math.min(cap, fromH, fromW))) }; }
    var best = fit(rows(N));
    if (N > 10 && N <= 14) { var two = fit([Math.ceil(N / 2), Math.floor(N / 2)]); if (two.size > best.size) best = two; }
    var size = best.size; SP._layout = { rows: best.rs.slice(), size: size };
    document.documentElement.style.setProperty('--ball-size', size + 'px');
    b.style.gap = Math.round(size * best.g + best.gp) + 'px'; // QA N2: tighter row gap for 3-row layouts
    document.documentElement.classList.toggle('sym-boost', size * 0.34 < 8); // QA N1 + DESIGN 13.8: key symbol badge (34% of ball) would render < 8px -> code fallback
    return best.rs;
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
      S.locked = false; S.consuming = false; render(); flushTaps();
    }, T.end);
  }
  function sparkle(d) { for (var i = 0; i < 5; i++) { var s = document.createElement('i'); s.className = 'spark'; s.style.left = (Math.random() * 100) + '%'; s.style.top = (Math.random() * 90) + '%'; s.style.animationDelay = (i * 30) + 'ms'; d.appendChild(s); } }
  function nextMove() { // stored optimal solution while the player follows it; otherwise BFS (small budget) then DFS fallback
    if (S.path >= 0 && S.g.solution && S.path < S.g.solution.length) return S.g.solution[S.path];
    var st = stageOf(), s = E.solve(st, { limit: 1e5 }); if (s.solvable) return s.path[0] || null;
    var d = E.dfs(st, 1e5); return d.solvable && d.path.length ? d.path[0] : null;
  }
  function flushTaps() { var b = S.tbuf || []; S.tbuf = []; if (document.querySelector('.ov.show') || S.won) return; SP._tbufRan = (SP._tbufRan || 0) + b.length; b.forEach(function (k) { tap(k); }); }
  function clearTaps() { if (S) S.tbuf = []; }
  function tap(i) {
    if (S.cheer) return S.cheer.skip(); // tap during the clear celebration -> straight to the card
    if (F82 && S.swapMode && !S.locked && !SP.ads.isBusy()) return swapTap(i);
    if (F82 && S.boom && !S.locked && !S.won) return boomFail();
    if (S.locked || SP.ads.isBusy()) { if (S.locked && !S.won && !S.solvedLock && !document.querySelector('.ov.show')) { S.tbuf = S.tbuf || []; if (S.tbuf.length < 2) S.tbuf.push(i); SP._tbuf = S.tbuf.slice(); } return; } // v8.1.1: up to 2 taps buffered during a locked animation
    var pickable = function (k) { return S.tubes[k].length && !done(k) && !S.lock[k] && !(F81 ? E.fixedTop(est(), k) : E.cagedTop(est(), k)); }; // v8 M1: caged top birds can't be picked
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
      var bc0 = F82 && S.bomb ? S.tubes[S.bomb.i][S.bomb.j] : null, cg0 = S.cage, ns = E.apply(est(), from, i, kk); S.tubes = ns.t; S.lock = ns.lock; S.cage = ns.cage || null; if (cg0) cageFx(cg0, S.cage); if (F81) { var x0 = { egg: S.egg, slp: S.slp, al: S.al, ice: S.ice, bomb: S.bomb, bc: bc0 }; setX(ns); xFx(x0); if (F82) x82Fx(x0, ns); } for (var q2 = 0; q2 < kk; q2++) { S.mask[from].pop(); if (!unlock) S.mask[i].push(false); }
      S.moves++; S.sel = -1; S.hint = null;
      var rv = revealTops(); if (rv.length) { fx.reveal = rv; snd(F80 ? 'reveal-pop' : 'select'); } /* v8.1.1: M2a reveal-pop was never played */ // hidden ball revealed the moment it becomes the top ball
      var solved = E.isSolved(est()), isd = !unlock && done(i);
      if (unlock) { fx.unlock = { tube: i, key: ball, solved: solved }; fx.keyFrom = sb ? (airRect || sb.getBoundingClientRect()) : null; fx.keySrc = ballSrc(ball).src; S.locked = true; S.consuming = true; if (solved) S.solvedLock = true; } // undo: key move + unlock = 1 move (one hist entry)
      else { fx.drop = i; if (!isd) snd('drop', S.tubes[i].length - 1); if (S.caps[i] < 4 && S.tubes[i].length >= S.caps[i]) fx.full = i; }
      if (!isd && S.chain > 0) { S.banked += S.chain; S.chain = 0; } // chain broken by a normal move -> banked (paid on clear)
      if (isd) { if (F82 && ns.hatchDone && ns.hatchDone.indexOf(i) >= 0) hatchDone(i, solved); else onTubeDone(i, solved); }
      if (F82 && S.boom) { render(); return boomFail(); }
      fx.fly = { from: !unlock && sb ? (airRect || sb.getBoundingClientRect()) : null, froms: unlock ? [] : froms, n: unlock ? 1 : kk, to: i, sounds: pend }; pend = null; SP._lastRun = kk;
      if (unlock) { fx.fly.sounds.forEach(function (a) { sfx.play(a[0], a[1]); }); fx.fly = null; render(); return; }
      if (solved) { S.locked = true; S.solvedLock = true; S.tbuf = []; S.sel = -1; render(); return whenLanded(function () { setTimeout(cheer, CLEAR_DELAY); }); } // H1: lock all input during clear sequence (perch hop wave -> card)
      if (F80) { render(); afterMove(); return; } // v8 G5: dead-end check after every move
    } else if (pickable(i)) { S.sel = i; warmSide(S.tubes[i][S.tubes[i].length - 1]); sfx.play('select'); }
    else { fx.shake = i; sfx.play('invalid'); }
    render();
  }
  // ---- v8.0 (GDD v8 §3): cage fx, '?' chips, dead-end sheet, booster sheet, tips --------------------------------------------
  function surprisedSrc(c) { var k = E.isKey(c) ? 'key-' + GA.pair[c].pair : C.palette[c] ? C.palette[c].key : null; return k ? V8A.surprised.replace('{key}', k) : null; }
  function cageFx(a, b) { var tk = [], op = []; a.forEach(function (k, i) { if (!k) return; var nk = b && b[i]; if (!nk) op.push({ i: i, f: k.f, t: k.t }); else if (nk.n < k.n) tk.push(i); });
    if (tk.length) { fx.cageTick = tk; snd('cage-tick'); } if (op.length) { fx.cageOpen = op; snd('cage-open'); } }
  // ---- v8.1 (GDD v8 §4, DESIGN 20.5-20.10): eggs, sleepers + alarm, chained lock ------------------------------------------
  function xFx(a) { var tk = [], hz = [], wk = [];
    (a.egg || []).forEach(function (e) { var ne = (S.egg || []).filter(function (x) { return x.i === e.i && x.j === e.j; })[0]; if (!ne) hz.push([e.i, e.j]); else if (ne.n < e.n) tk.push(e.i + ':' + e.j); });
    if (a.slp && !S.slp) wk = a.slp.map(function (z) { return z.slice(); });
    if (tk.length) { fx.eggTick = tk; snd('egg-crack'); } if (hz.length) { fx.hatch = hz; snd('hatch'); }
    if (wk.length) { fx.wake = wk; fx.ring = a.al ? a.al.slice() : null; snd('alarm-ring'); setTimeout(function () { sfx.play('wake'); }, 300); } }
  function ov(w, cls, ms) { var d = document.createElement('div'); d.className = 'v8-overlay ' + cls; w.appendChild(d); if (ms) setTimeout(function () { d.remove(); }, ms); return d; }
  // v8.2d (DESIGN 20.18, v82 only): colour egg v2 = background class on the same <img> box (transparent src); off = v8.1 egg img
  var GIF0 = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  function eggArt(im, key) { if (F82) { im.src = GIF0; im.classList.add('v8-egg-v2', key); } else im.src = V81.egg.replace('{color}', key); }
  function xBird(w, im, i, j, c) { var P = C.palette[c], st = est(), eg = E.eggAt(st, i, j), at = function (L) { return (L || []).some(function (z) { return z[0] === i && z[1] === j; }); };
    if (eg) { eggArt(im, P.key); im.alt = '알 (' + birdName(P.key) + ', ' + eg.n + '번 남음)'; w.classList.add('v8-egg');
      if (eg.n === 1) ov(w, 'v8-egg-crack-1' + (F82 ? ' v2' : '')); var bd = ov(w, 'v8-badge-egg' + (F82 ? ' v2' : '') + ' n' + Math.min(3, eg.n) + (fx.eggTick && fx.eggTick.indexOf(i + ':' + j) >= 0 ? ' tick' : ''));
      if (symbolsLarge) bd.style.backgroundImage = 'url("' + V81.eggBadgeLg.replace('{n}', Math.min(3, eg.n)) + '")';
      if (FB && st.brood) { var e0 = (S.g.eggs || []).filter(function (e) { return e.tube === i && e.at === j; })[0], warm = S.tubes[i][j + 1] === c && !(S.mask[i] && S.mask[i][j + 1]);
        if (warm || (e0 && eg.n < e0.n)) { var hb0 = document.createElement('div'); hb0.className = 'v8-brood ' + (warm ? 'warm' : 'paused'); w.appendChild(hb0); } } } // v8.2 DESIGN 20.17 brood heart
    else if (at(fx.hatch)) { var idle = im.src; if (reduced) return; eggArt(im, P.key); var c2 = ov(w, 'v8-egg-crack-2' + (F82 ? ' v2' : '')), hb = ov(w, 'v8-hatch');
      setTimeout(function () { im.src = idle; im.classList.remove('v8-egg-v2', P.key); c2.remove(); hb.remove(); }, V81.hatchMs); }
    if (E.slpAt(st, i, j)) { im.src = V81.sleepy.replace('{key}', P.key); im.classList.add('v8-sleep'); im.alt += ' (잠든 새)'; ov(w, 'v8-zz'); }
    else if (at(fx.wake)) { var awake = im.src; if (!reduced) { im.src = V81.sleepy.replace('{key}', P.key); ov(w, 'v8-wake', V81.wakeMs); setTimeout(function () { im.src = awake; }, V81.wakeMs); } }
    var ring = fx.ring && fx.ring[0] === i && fx.ring[1] === j;
    if ((S.slp && S.al && S.al[0] === i && S.al[1] === j) || ring) { var al = ov(w, 'v8-alarm' + (ring && !reduced ? ' ring' : ''), ring ? 700 : 0); if (symbolsLarge) al.style.backgroundImage = 'url("' + V81.alarmLg + '")'; im.alt += ' (알람 새)'; } }
  function chainFx(b) { var ch = S.g.chain, L = S.g.locks; if (!ch || !L || !L[ch[0]] || !L[ch[1]]) return; var ta = L[ch[0]].tube, tb = L[ch[1]].tube;
    if (!S.lock[ta] || !S.lock[tb]) return; var tubes = b.querySelectorAll('.tube'), la = tubes[ta] && tubes[ta].querySelector('.lock'), lb = tubes[tb] && tubes[tb].querySelector('.lock'); if (!la || !lb) return;
    requestAnimationFrame(function () { var B = b.getBoundingClientRect(), A = la.getBoundingClientRect(), Z = lb.getBoundingClientRect(), ax = A.left + A.width / 2 - B.left, ay = A.top + A.height / 2 - B.top, zx = Z.left + Z.width / 2 - B.left, zy = Z.top + Z.height / 2 - B.top;
      var dx = zx - ax, dy = zy - ay, len = Math.sqrt(dx * dx + dy * dy), v = Math.abs(dy) > Math.abs(dx), d = document.createElement('div'); d.className = 'v8-chain' + (v ? ' v' : ''); d.setAttribute('aria-hidden', 'true');
      if (v) { d.style.height = len + 'px'; d.style.left = ax + 'px'; d.style.top = ay + 'px'; d.style.transform = 'translateX(-50%) rotate(' + (Math.atan2(dy, dx) * 180 / Math.PI - 90) + 'deg)'; }
      else { d.style.width = len + 'px'; d.style.left = ax + 'px'; d.style.top = ay + 'px'; d.style.transform = 'translateY(-50%) rotate(' + (Math.atan2(dy, dx) * 180 / Math.PI) + 'deg)'; }
      b.appendChild(d); }); }
  // ---------------- v8.2 (HIDDEN, GDD v8 §5 M6-M9 · P5 · P6 · M3' · H1). Only reached when F82 (web QA switch; toss: features.v82). ----------------
  function iceFx(d, i) { var z = S.ice && E.iceAt(est(), i);
    if (z) { var o = document.createElement('div'); o.className = 'v8-ice' + (fx.iceTick && fx.iceTick.indexOf(i) >= 0 ? ' v82-tick' : ''); o.setAttribute('aria-hidden', 'true'); var b = document.createElement('b'); b.className = 'v82-ice-n'; b.textContent = z.n; o.appendChild(b); d.appendChild(o); }
    else if (fx.thaw && fx.thaw.indexOf(i) >= 0) { var t = document.createElement('div'); t.className = 'v8-overlay v8-thaw'; d.appendChild(t); setTimeout(function () { t.remove(); }, reduced ? 300 : 600); } }
  function bombFx(w, i, j) { var at = function (p) { return p && p[0] === i && p[1] === j; };
    if (S.bomb && S.bomb.i === i && S.bomb.j === j) { var n = S.bomb.n, o = document.createElement('div'); o.className = 'v8-overlay v8-bomb' + (n <= 3 ? ' low' : '') + (S.boom ? ' v82-gone' : ''); o.innerHTML = '<b>' + n + '</b>'; w.appendChild(o); w.classList.add('v82-bombbird');
      var im = w.querySelector('img.bird'); if (im) im.alt += ' (폭탄 새, ' + n + '번 남음)'; if (S.boom && fx.flyaway) ov(w, 'v8-flyaway', reduced ? 0 : 600); }
    if (at(fx.defuse)) ov(w, 'v8-defuse', reduced ? 300 : 500);
    if (fx.swap && fx.swap[0] === i && (fx.swap[1] === j || fx.swap[1] + 1 === j) && !reduced) { w.classList.add('v82-swapped'); // DESIGN 20.17: birds arrive with the designer arcs
      var up = j === fx.swap[1] + 1, bi = w.querySelector('img'); // DESIGN 20.17b: DOM already swapped; each bird flies from its old slot to transform:none, --swap-d = measured slot spacing
      if (bi) bi.style.visibility = 'hidden';
      requestAnimationFrame(function () { var o = up ? w.previousElementSibling : w.nextElementSibling, d = o ? Math.abs(o.getBoundingClientRect().top - w.getBoundingClientRect().top) : w.offsetHeight;
        if (bi) { bi.style.setProperty('--swap-d', d + 'px'); bi.style.visibility = ''; bi.classList.add(up ? 'v8-swap-up' : 'v8-swap-down'); }
        if (up) { var sw = document.createElement('div'); sw.className = 'v8-magpie-swap'; w.appendChild(sw); var h = w.getBoundingClientRect().height, sh = sw.getBoundingClientRect().height; sw.style.top = (h / 2 + d / 2 - sh / 2) + 'px'; setTimeout(function () { sw.remove(); }, 520); } }); } }
  function x82Fx(a, ns) { var th = [], tk = [];
    (a.ice || []).forEach(function (z) { var nz = (S.ice || []).filter(function (y) { return y.i === z.i; })[0]; if (!nz) th.push(z.i); else if (nz.n < z.n) tk.push(z.i); });
    if (th.length) fx.thaw = th; if (tk.length) fx.iceTick = tk; if (th.length || tk.length) snd('ice-crack');
    if (a.bomb && ns.defused) { var c = a.bc; for (var y = 0; y < S.tubes.length; y++) if (S.tubes[y][0] === c && done(y)) { fx.defuse = [y, S.tubes[y].length - 1]; break; } snd('defuse'); SP._defused = (SP._defused || 0) + 1; }
    else if (S.boom) fx.flyaway = 1; else if (S.bomb && S.bomb.n <= 3) snd('bomb-tick'); }
  function hatchDone(i, solving) { fx.fresh = i; if (!solving) { flyAway(i); snd('complete'); } else S.chain = 0; SP._hatchDone = (SP._hatchDone || 0) + 1; } // M3': a flock completed by hatching never counts toward the combo
  function boomFail() { S.sel = -1; S.swapMode = false; if (S._boomT) return; sfx.play('fail-soft'); S._boomT = setTimeout(function () { S._boomT = 0; if (!S.boom || S.won) return; var o = [];
      o.push({ k: 'undo', label: '되돌리기', go: function () { closeSheet(); undo(); } });
      if (adShow()) o.push(adOpt('ad', 'moves5', '광고 보고 이동 +' + E82.movesGive, bombMore));
      o.push(coinOpt('coin', E82.moves5, '이동 +' + E82.movesGive, bombMore));
      o.push({ k: 'restart', label: '다시하기', go: function () { closeSheet(); doRestart(); } });
      sheet('폭탄 새가 날아가 버렸어요', V82.sheetArt, o); SP._boomShown = (SP._boomShown || 0) + 1; }, reduced ? 200 : V82.failMs); }
  function bombMore() { if (!S.boom || !S.bomb) return; S.bomb.n = E82.movesGive; S.boom = 0; render(); toast('폭탄 새 이동 +' + E82.movesGive); }
  function magBtn() { var f = document.querySelector('footer.bottom'), b = $('v82magpie'); if (b || !f) return b;
    f.classList.add('v82'); b = document.createElement('button'); b.className = 'btn v82-magpie'; b.id = 'v82magpie'; b.innerHTML = '<img src="' + V82.magpie + '" alt="" aria-hidden="true"><span>까미</span><span class="cnt" id="v82magcnt"></span>'; f.appendChild(b);
    onTap(b, magTap); return b; }
  function magTap() { if (!S || S.locked || S.won || SP.ads.isBusy()) return; if (S.boom) return boomFail();
    if (S.swapMode) { S.swapMode = false; render(); return; }
    if ((save.inventory.magpie || 0) > 0) { S.swapMode = true; S.sel = -1; render(); tip('magpie82', '까미: 횃대를 누르면 맨 위 두 새를 바꿔요'); toast('바꿀 횃대를 눌러요'); return; }
    sheet('까미를 데려올까요?', V82.magpie, [coinOpt('coin', E82.magpie, '까미 1회', function () { save.inventory.magpie = (save.inventory.magpie || 0) + 1; S.swapMode = true; S.sel = -1; render(); toast('바꿀 횃대를 눌러요'); })]); }
  function swapAt(i) { var st = est(), t = S.tubes[i]; for (var j = t.length - 2; j >= 0; j--) if (E.canSwap(st, i, j) && !S.mask[i][j] && !S.mask[i][j + 1]) return j; return -1; }
  function swapTap(i) { var j = swapAt(i); if (j < 0) { fx.shake = i; sfx.play('invalid'); toast('까미가 바꿀 수 있는 새가 없어요'); render(); return; }
    var h = snap(); h.chain = S.chain; h.banked = S.banked; h.combo = S.combo; h.lastDone = S.lastDone; h.path = S.path; S.hist.push(h);
    var bc = S.bomb ? S.tubes[S.bomb.i][S.bomb.j] : null, cg0 = S.cage, ns = E.swap(est(), i, j); S.tubes = ns.t; S.lock = ns.lock; S.cage = ns.cage || null; if (cg0) cageFx(cg0, S.cage);
    var x0 = { egg: S.egg, slp: S.slp, al: S.al, ice: S.ice, bomb: S.bomb, bc: bc }; setX(ns); xFx(x0); x82Fx(x0, ns);
    save.inventory.magpie = Math.max(0, (save.inventory.magpie || 0) - 1); if (!QAP && !save.album.magpie) { save.album.magpie = 1; M81.albumSync(save, debuts(), E81, EC); } persist(); S.moves++; S.swapMode = false; S.hint = null; S.path = -1; S.sel = -1; fx.swap = [i, j]; sfx.play('swap'); SP._swaps = (SP._swaps || 0) + 1;
    var solved = E.isSolved(est()), isd = done(i);
    if (!isd && S.chain > 0) { S.banked += S.chain; S.chain = 0; }
    if (isd) { if (ns.hatchDone && ns.hatchDone.indexOf(i) >= 0) hatchDone(i, solved); else onTubeDone(i, solved); }
    if (S.boom) { render(); return boomFail(); }
    if (solved) { S.locked = true; S.solvedLock = true; S.tbuf = []; render(); return whenLanded(function () { setTimeout(cheer, CLEAR_DELAY); }); }
    render(); afterMove(); }
  function btns82() { var b = magBtn(); if (!b || !S) return; var n = save.inventory.magpie || 0; $('v82magcnt').textContent = n > 0 ? n : '+'; b.disabled = S.locked || S.won;
    b.classList.toggle('on', !!S.swapMode); b.setAttribute('aria-pressed', S.swapMode ? 'true' : 'false'); b.setAttribute('aria-label', '까미 바꾸기, ' + (n > 0 ? '보유 ' + n : '코인 ' + E82.magpie + '으로 받기'));
    $('board').classList.toggle('v82-swapping', !!S.swapMode);
    if (S.chal) { $('moves').textContent += ' · 도전 ' + S.chal + '수'; if (S.moves > S.chal && !S.chalOver && !S.won) { S.chalOver = 1; toast('도전 이동을 넘었어요 · 그대로 계속해도 돼요'); } } }
  function load82(n, g, dk) { S.swapMode = false; S.chal = chal82 && !dk && save.stars[n] > 0 ? Math.ceil(g.min * E82.challengeK - 1e-9) : 0; S.chalOver = 0; magBtn(); }
  function THO() { return { cleared: function (k) { return (save.stars[k] || 0) > 0; } }; } // v8.2 D1 weekday theme gate (cleared stage)
  function meta82Start(n, g) { if (g.daily && g.theme === 'lock') tip('daily82lock', '수요일은 자물쇠 도전! 열쇠 위의 새부터 치워 보세요'); if (g.daily && g.theme === 'hidden') tip('daily82hidden', '화요일은 숨은 새 도전! 맨 위로 나오면 색이 보여요'); if (g.thorn && g.thorn.length) tip('thorn82', '가시 둥지에는 새를 올릴 수 없어요. 비우면 보통 횃대가 돼요');
    if (g.bomb) tip('bomb82', '폭탄 새 무리를 ' + g.bomb.n + '번 움직이기 안에 완성해요');
    if (g.ice && g.ice.length) tip('ice82', '얼음 둥지는 무리를 ' + g.ice[0].n + '번 완성하면 녹아요'); }
  // P5 weekly feather event (Mon 00:00 - Sun 23:59 device date) + P6 challenge crown
  function week82(d) { d = d || new Date(); var m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7), p = function (x) { return (x < 10 ? '0' : '') + x; }; return m.getFullYear() + '-' + p(m.getMonth() + 1) + '-' + p(m.getDate()); }
  function feather82() { var w = week82(), e = save.feather82; if (!e || e.wk !== w) e = save.feather82 = { wk: w, n: 0, got: [] }; return e; }
  function meta82Win(st) { var h = '', coins = 0, e = feather82(), add = st === 3 ? 2 : 1, T = E82.featherTiers; e.n += add; h += ' · 깃털 +' + add;
    T.forEach(function (t, q) { if (e.n >= t && e.got.indexOf(t) < 0) { e.got.push(t); coins += E82.featherCoins[q]; h += ' · 깃털 ' + t + '개 보상 +' + E82.featherCoins[q]; } });
    if (S.chal && S.moves <= S.chal) { save.crown82 = save.crown82 || {}; if (!save.crown82[S.n]) { save.crown82[S.n] = 1; coins += E82.crownCoins; h += ' · 도전 성공 왕관 +' + E82.crownCoins; } else h += ' · 도전 성공'; }
    if (coins) V8.addCoins(save, coins, EC); SP._meta82 = { feather: e, crown: save.crown82 || {}, coins: coins }; return { coins: coins, html: h }; }
  var chal82 = false;
  function menu82(co) { guidePreload82(); if (!$('v82guideBtn')) { co.insertAdjacentHTML('beforeend', ' <button class="btn v8-bag v82-guide-btn' + (guideNew() ? ' dot' : '') + '" id="v82guideBtn">기믹 안내</button>'); $('v82guideBtn').onclick = function () { guideOpen(false); }; }
    var e = feather82(), T = E82.featherTiers, nx = T.filter(function (t) { return e.n < t; })[0], row = $('v82feather'), anchor = $('v8chestrow') || co;
    if (!row) { row = document.createElement('div'); row.id = 'v82feather'; row.className = 'v8-chestrow v82-feather'; anchor.insertAdjacentElement('afterend', row); }
    var have = Math.min(e.n, T[T.length - 1]), need = nx || T[T.length - 1];
    row.innerHTML = '<img src="' + V82.featherEvent + '" alt="" width="36" height="36"><div class="v8-chestinfo"><b>깃털 이벤트 ' + e.n + '개' + (nx ? ' · ' + nx + '개에 코인 ' + E82.featherCoins[T.indexOf(nx)] : ' · 이번 주 완료') + '</b><div class="v8-star-bar" aria-hidden="true"><i style="width:' + (75 * Math.min(1, have / need)).toFixed(1) + '%"></i></div><small>일요일 23:59까지 · 클리어당 깃털 1(★3은 2)</small></div>'
      + '<button class="btn v8-bag v82-chal' + (chal82 ? ' on' : '') + '" id="v82chal" aria-pressed="' + chal82 + '">도전 모드 ' + (chal82 ? '켜짐' : '꺼짐') + '</button>';
    row.setAttribute('aria-label', '깃털 이벤트 ' + e.n + '개');
    $('v82chal').onclick = function () { chal82 = !chal82; menu82(co); toast(chal82 ? '도전 모드: 클리어한 판을 최소 수 × 1.3 안에 깨면 왕관' : '도전 모드를 껐어요'); }; }
  function set82() { if ($('v82guideSet')) return; var c = $('closeSet'); if (!c) return; var b = document.createElement('button'); b.className = 'btn wide'; b.id = 'v82guideSet'; b.textContent = '기믹 안내'; c.parentNode.insertBefore(b, c);
    b.onclick = function () { $('setov').classList.remove('show'); guideOpen(true); }; }
  // H1 gimmick guide (planner decision 2026-10-27)
  function g82n(g, k, d) { var L = g && g[k]; return L && L.length ? L[0].n || d : d; }
  // DESIGN 20.17 guide loops (120x120 SVG shown at 72px); static card art under reduced motion and for cards without a loop (key, boss, small)
  var LOOP82 = { hidden: 'surprised', chain: 'lock-chain', cage: 'cage', egg: 'egg', sleep: 'sleep', thorn: 'thorn', bomb: 'bomb', ice: 'ice', magpie: 'magpie', key: 'key', boss: 'boss', small: 'small' };
  var GUIDE = [
    { id: 'hidden', nm: '숨은 새', art: 'assets-v8-bird-hidden-surprised.svg?v=dcf5c5be', has: function (g) { return (g.hidden || []).length; }, rule: function () { return '? 새는 바로 위가 비면 정체가 드러나요.'; }, how: '?가 있는 횃대의 위쪽 새부터 옮겨 정체를 확인해요.' },
    { id: 'key', nm: '열쇠·자물쇠', art: 'assets-v8-bird-key-a-surprised.svg?v=28a72eb2', has: function (g) { return (g.locks || []).length; }, rule: function () { return '열쇠 새를 같은 모양 자물쇠 횃대로 옮기면 열려요.'; }, how: '열쇠 새 위를 먼저 비워 두고, 열린 횃대를 빈 자리로 써요.' },
    { id: 'chain', nm: '연쇄 자물쇠', art: 'assets-v8-chain-link.svg?v=1d4407fd', has: function (g) { return !!g.chain; }, rule: function () { return '자물쇠 안에 또 열쇠가 있어요. 앞 자물쇠를 열어야 다음 열쇠가 나와요.'; }, how: '사슬로 이어진 순서대로 하나씩 열어요.' },
    { id: 'boss', nm: '보스판', art: 'assets-v8-map-node-boss.svg?v=721267cb', has: function (g) { return !!g.boss; }, rule: function () { return '여러 기믹이 한 판에 함께 나와요. 처음 깨면 보너스 코인을 받아요.'; }, how: '어떤 기믹이 먼저 풀려야 하는지부터 살펴요.' },
    { id: 'small', nm: '작은 둥지', art: GA.smallTube.badge, has: function (g) { return g.caps && g.caps.some(function (c) { return c < 4; }); }, rule: function () { return '작은 둥지에는 새가 3마리까지만 앉아요.'; }, how: '새를 잠깐 비켜 두는 자리로 써요.' },
    { id: 'cage', nm: '새장', art: 'assets-v8-cage-front.svg?v=4b4aae46', has: function (g) { return (g.cages || []).length; }, rule: function (g) { return '새장은 무리를 ' + g82n(g, 'cages', 1) + '번 완성하면 열려요.'; }, how: '새장 밖의 무리부터 완성해요. 새장 속 새는 열릴 때까지 꺼낼 수 없어요.' },
    { id: 'egg', nm: '알(품기)', art: 'assets-v8-egg-base.svg?v=188c1e8a', has: function (g) { return (g.eggs || []).length; }, rule: function (g) { return FB ? '알은 같은 색 새가 위에 앉아 ' + g82n(g, 'eggs', 2) + '번 움직이면 깨어나요.' : '알은 무리를 ' + g82n(g, 'eggs', 2) + '번 완성하면 깨어나요.'; },
      how: FB ? '같은 색 새를 알 위에 앉혀 두고 다른 새를 움직여요. 앉히는 이동은 세지 않고, 비키면 멈췄다가 다시 앉으면 이어서 세요. 되돌리기는 숫자도 되돌려요.' : '다른 무리를 먼저 완성해요.' },
    { id: 'sleep', nm: '잠자는 새·알람', art: 'assets-v8-bird-indigo-sleepy.svg?v=07b0f725', has: function (g) { return (g.sleep || []).length; }, rule: function () { return '잠든 새는 움직일 수 없어요. 시계 든 알람 새의 무리를 완성하면 다들 깨어나요.'; }, how: '알람 새 색부터 모아요.' },
    { id: 'thorn', nm: '가시 둥지', art: V82.thorn, has: function (g) { return (g.thorn || []).length; }, rule: function () { return '가시 둥지에서는 새가 떠나기만 해요. 새를 올릴 수 없고, 비면 보통 횃대가 돼요.'; }, how: '가시 둥지의 새를 먼저 다른 횃대로 옮겨 비워요.' },
    { id: 'bomb', nm: '폭탄 새', art: V82.bomb, has: function (g) { return !!g.bomb; }, rule: function () { return '숫자가 0이 되기 전에 폭탄 새의 무리를 완성하면 해제돼요. 움직일 때마다 1씩 줄어요.'; }, how: '폭탄 새 색부터 모아요. 0이 되면 되돌리기 · 이동 +' + E82.movesGive + ' · 다시하기 중에서 골라요.' },
    { id: 'ice', nm: '얼음 둥지', art: V82.ice, has: function (g) { return (g.ice || []).length; }, rule: function (g) { return '얼음 둥지의 새는 꺼낼 수 없어요. 그 횃대가 완성되거나 다른 무리를 ' + g82n(g, 'ice', 2) + '번 완성하면 녹아요.'; }, how: '다른 무리를 먼저 완성하거나, 같은 색 새를 얼음 둥지 위에 올려 완성해요.' },
    { id: 'magpie', nm: '까미', art: V82.magpieBird, has: function () { return true; }, rule: function () { return '까미는 한 횃대에서 맞붙은 두 새를 맞바꿔요. 1번 움직인 걸로 세요.'; }, how: '아래 까미 버튼을 누르고 횃대를 누르면 위쪽 두 새를 바꿔요. 새장·알·잠든 새·폭탄 새·얼음 둥지는 바꿀 수 없어요. 코인 ' + E82.magpie + '.' }];
  var guideFirst = null;
  function guideFirsts() { if (guideFirst) return guideFirst; guideFirst = {}; GUIDE.forEach(function (c) { for (var k = 1; k <= LAST; k++) { var g = SP.STAGES[k]; if (g && c.has(g)) { guideFirst[c.id] = k; break; } } }); return guideFirst; }
  function guideNew() { var F = guideFirsts(), seen = (save.guide82 || {}); return GUIDE.some(function (c) { return F[c.id] && F[c.id] <= save.unlocked && !seen[c.id]; }); }
  function guideArt82() { return GUIDE.map(function (c) { return LOOP82[c.id] && !reduced ? 'assets-v8-guide-loop-' + LOOP82[c.id] + '.svg?v=0e3c500b' : c.art; }); }
  var guidePre82 = null; function guidePreload82() { if (guidePre82) return; guidePre82 = guideArt82().map(function (u) { var im = new Image(); im.decoding = 'async'; im.src = u; return im; }); } // planner 14:37: no late white flash on first open
  function guideOpen(inStage) { guidePreload82(); var o = $('v82guide'); if (!o) { o = document.createElement('div'); o.id = 'v82guide'; o.className = 'ov v8ov'; document.body.appendChild(o); }
    var F = guideFirsts(), seen = save.guide82 || {}, g = inStage && S && !S.daily ? S.g : null, list = GUIDE.slice();
    if (g) list.sort(function (a, b) { return (b.has(g) ? 1 : 0) - (a.has(g) ? 1 : 0); }); // current stage's gimmicks first
    var cards = list.map(function (c) { var f = F[c.id], open = f && f <= save.unlocked, here = g && c.has(g), fg = here ? g : f ? SP.STAGES[f] : null, nw = open && !seen[c.id];
      return '<div class="v82-guide-card' + (open ? '' : ' locked') + (here ? ' here' : '') + '" data-id="' + c.id + '" role="listitem" aria-label="' + c.nm + (open ? '' : ', 잠김, ' + f + '판에서 만나요') + (nw ? ', 새로 열림' : '') + '">'
        + '<div class="v82-guide-art">' + (LOOP82[c.id] && !reduced ? '<img class="v8-guide-loop v82-loop-' + c.id + '" src="assets-v8-guide-loop-' + LOOP82[c.id] + '.svg" alt="">' : '<img class="v82-loop-' + c.id + '" src="' + c.art + '" alt="">') + '</div><div class="v82-guide-txt"><b>' + c.nm + (nw ? ' <i class="v82-new" aria-hidden="true">새로 열림</i>' : '') + (here ? ' <i class="v82-here">이번 판</i>' : '') + '</b>'
        + (open ? '<p>' + c.rule(fg || {}) + '</p><p class="how">풀이: ' + c.how + '</p><small>처음 나오는 판: ' + (c.id === 'magpie' ? '언제든 (부스터)' : f + '판') + '</small>' : '<p>' + (f ? f + '판에서 만나요' : '곧 만나요') + '</p>') + '</div></div>'; }).join('');
    o.innerHTML = '<div class="card v8-sheet v82-guide" role="dialog" aria-label="기믹 안내"><div class="title">기믹 안내</div><div class="v82-guide-list" role="list">' + cards + '</div><button class="btn wide" id="v82guideClose">닫기</button></div>';
    $('v82guideClose').onclick = function () { o.classList.remove('show'); }; o.classList.add('show');
    o.querySelectorAll('.v82-guide-card.locked').forEach(function (el) { el.setAttribute('tabindex', '0'); el.onclick = function () { var f = F[el.dataset.id]; toast(f ? f + '판에서 만나요' : '곧 만나요'); }; }); // planner 14:37: locked card tap -> toast (first stage under the current flag set)
    var ch = false; save.guide82 = save.guide82 || {}; GUIDE.forEach(function (c) { if (F[c.id] && F[c.id] <= save.unlocked && !save.guide82[c.id]) { save.guide82[c.id] = 1; ch = true; } }); if (ch) persist();
    var gb = $('v82guideBtn'); if (gb) gb.classList.remove('dot'); SP._guide = list.map(function (c) { return { id: c.id, open: !!(F[c.id] && F[c.id] <= save.unlocked), first: F[c.id] || null, here: !!(g && c.has(g)) }; }); }
  SP._x82 = function () { return { th: S.th, ice: S.ice, bomb: S.bomb, boom: S.boom, brood: S.brood, egg: S.egg, swapMode: !!S.swapMode, chal: S.chal, magpie: save.inventory.magpie, feather: save.feather82 || null, crown: save.crown82 || null, guide: save.guide82 || null, combo: S.combo, moves: S.moves }; }; // QA hook
  SP._x82week = week82;
  SP._x81 = function () { return { egg: S.egg, slp: S.slp, alarm: S.alarm, al: S.al, chain: S.g.chain || null, boss: !!S.g.boss }; }; // QA hook
  var CHIP_KEY = 'settings.v8chips';
  function chips() { var el = $('v8chips'); if (!el) { el = document.createElement('div'); el.id = 'v8chips'; el.className = 'v8-chips'; el.setAttribute('aria-live', 'polite'); document.querySelector('header.hud').insertAdjacentElement('afterend', el); }
    var hid = 0, per = {}; S.mask.forEach(function (m, i) { m.forEach(function (x, j) { if (x) { hid++; var c = S.tubes[i][j]; per[c] = (per[c] || 0) + 1; } }); });
    var on = hid > 0 && SP.store.get(CHIP_KEY) !== 'off' && !S.won; el.hidden = !on; if (!on) { el.innerHTML = ''; return; }
    var h = '<span class="v8-chip" aria-label="숨은 새 ' + hid + '마리"><img src="' + V8A.chipHidden + '" alt="" width="16" height="16">' + hid + '</span>';
    Object.keys(per).forEach(function (c) { var P = C.palette[c]; if (P) h += '<span class="v8-chip" aria-label="' + birdName(P.key) + ' ' + per[c] + '마리 안 보임"><i style="background:' + P.hex + '"></i>' + per[c] + '</span>'; });
    el.innerHTML = h; }
  function tip(id, msg) { if (!F80 || save.tips[id]) return; save.tips[id] = 1; persist(); var t = $('v8tip'); if (!t) { t = document.createElement('div'); t.id = 'v8tip'; t.className = 'v8-tip'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(function () { t.hidden = true; }, 2600); SP._lastTip = id; }
  SP._tip = function () { return SP._lastTip; };
  function stageTips() { if (S.daily) return; if (S.cage) tip('cage', '새장은 무리를 ' + Math.max.apply(null, S.cage.filter(Boolean).map(function (k) { return k.n; })) + '번 완성하면 열려요'); if (S.n === 22 && (S.g.hidden || []).length) tip('hidden22', '?새는 위가 비면 정체가 드러나요'); }
  var STUCK_CAP82 = 4e5; // v8.2 reachability cap (states) for the G5 'no win reachable' check; measured cost in docs-v8.2-progress.md
  function afterMove() { // G5: no legal move + unsolved -> sheet at once; movable-but-unsolvable for 3 moves -> soft toast + hint glow (idle dfs, silent on budget)
    if (S.won || E.isSolved(est())) return;
    if (isStuck()) { whenLanded(function () { setTimeout(function () { if (!S.won && isStuck()) stuckSheet(); }, 120); }); return; }
    // v8.0.1: the old single dfs(2e4) gave up silently on big boards (aborted -> no toast). Now a resumable DFS runs in idle
    // slices (<= ~6 ms each, cancelled by the next move) until it proves 'solvable' or 'unsolvable'; proof of no solution -> toast at once.
    var n0 = S.moves, job = E.dfsJob(stageOf(), F82 ? STUCK_CAP82 : 3e6), idle = window.requestIdleCallback || function (f) { setTimeout(function () { f({ timeRemaining: function () { return 6; } }); }, 30); };
    SP._deadCheck = { moves: n0, state: 'running' };
    (function slice(dl) { if (S.moves !== n0 || S.won) return; var t0 = performance.now(), r = 'running', lim = Math.min(8, Math.max(2, dl && dl.timeRemaining ? dl.timeRemaining() : 6));
      while (r === 'running' && performance.now() - t0 < lim) r = job.step(1500);
      SP._deadCheck = { moves: n0, state: r, explored: job.explored() };
      if (r === 'running') return idle(slice, { timeout: 500 });
      if (r === 'gaveup') return; S.unsolvRun = r === 'solvable' ? 0 : S.unsolvRun + 1;
      $('hint').classList.toggle('v8-glow', r === 'unsolvable'); if (r === 'unsolvable' && S.unsolvRun === 1) toast('막힌 것 같아요');
      if (F82 && r === 'unsolvable') { SP._stuck82 = (SP._stuck82 || 0) + 1; whenLanded(function () { setTimeout(function () { if (S.moves === n0 && !S.won) stuckSheet(true); }, 120); }); } })(); } // v8.2 (planner 15:31): no win reachable (loops included) -> G5 sheet too; cap hit -> old behaviour
  function bagSheet() { var I = save.inventory; sheet('가방', null, [ // v8.0: map shows owned boosters only (buying outside a stage = v8.1 P2)
      { k: 'token', icon: V8A.token, label: '횃대 토큰 ' + I.perchToken + ' / ' + EC.tokenMax, disabled: true, go: function () {} },
      { k: 'hint', label: '힌트 ' + I.hint + ' · 판당 ' + EC.freeHintsPerStage + '회 무료(1~' + EC.freeHintUnlimitedTo + '판 무제한)', disabled: true, go: function () {} },
      { k: 'coins', icon: V8A.coinBtn, label: '코인 ' + Math.min(save.coins, EC.coinMax).toLocaleString('ko-KR'), disabled: true, go: function () {} }]); }
  function adAvail() { return SP.ads.mode() !== 'none' && SP.ads.rewardedReady(); } // R2: web build (mode none), PLACEHOLDER IDs, load errors -> coin / free paths
  function closeSheet() { var o = $('v8sheet'); if (o) o.classList.remove('show'); }
  function sheet(title, art, opts) { clearTaps(); var o = $('v8sheet'); if (!o) { o = document.createElement('div'); o.id = 'v8sheet'; o.className = 'ov v8ov'; document.body.appendChild(o); }
    o.innerHTML = '<div class="card v8-sheet" role="dialog" aria-label="' + title + '">' + (art ? '<img class="v8-sheet-art" src="' + art + '" alt="">' : '') + '<div class="title">' + title + '</div><div class="v8-sheet-btns"></div><button class="btn wide" id="v8close">닫기</button></div>';
    var bx = o.querySelector('.v8-sheet-btns'); opts.forEach(function (p) { var b = document.createElement('button'); b.className = 'v8-sheet-btn' + (p.ad ? ' ad' : ''); b.innerHTML = (p.icon ? '<img src="' + p.icon + '" alt="">' : '') + '<span>' + p.label + '</span>'; b.disabled = !!p.disabled; b.dataset.k = p.k;
      b.onclick = function () { if (b.disabled) return; b.disabled = true; p.go(); }; bx.appendChild(b); });
    $('v8close').onclick = closeSheet; o.classList.add('show'); tip('coin0', '코인으로도 받을 수 있어요'); }
  SP._sheet = function () { var o = $('v8sheet'); return o && o.classList.contains('show') ? [].map.call(o.querySelectorAll('.v8-sheet-btn'), function (b) { return { k: b.dataset.k, label: b.textContent, disabled: b.disabled }; }) : null; };
  function coinOpt(k, price, label, grant) { var short = price - save.coins; return { k: k, icon: V8A.coinBtn, label: short > 0 ? label + ' · 코인 ' + short + '개 부족' : label + ' · 코인 ' + price, disabled: short > 0,
    go: function () { if (!V8.spend(save, price)) return; grant(); persist(); sfx.play('coin-spend'); closeSheet(); } }; } // R1: deduct + grant, then a single persist (atomic)
  function adShow() { return F81 ? SP.ads.mode() !== 'none' : adAvail(); } // v8.1: toss/dummy always show the ad button (disabled until an ad is loaded); web never
  function adOpt(k, reason, label, grant) { if (F81 && !adAvail()) return { k: k, ad: true, icon: V8A.adBadge, label: label + ' · 광고 준비 중', disabled: true, go: function () {} };
    return adOpt0(k, reason, label, grant); }
  function adOpt0(k, reason, label, grant) { return { k: k, ad: true, icon: V8A.adBadge, label: label, go: function () { closeSheet(); SP.ads.showRewarded(reason, function (ok) { if (ok === true) grant(); }); } }; } // G9: only ok === true pays
  function undoSheet() { var o = []; // v8.0.1: also opens with no move yet (0 left shows '+'); then the bought undos are stored, none used
    if (adShow()) o.push(adOpt('ad', 'undo', '광고 보고 되돌리기 1회', function () { if (S.hist.length) doUndo(); else { S.a.undoLeft++; persist(); render(); toast('되돌리기 +1'); } }));
    o.push(coinOpt('coin', EC.undo3, '되돌리기 +' + EC.undo3Gives, function () { S.a.undoLeft += EC.undo3Gives; if (S.hist.length) { S.a.undoLeft--; doUndo(true); if (F81) toast('되돌리기 +' + EC.undo3Gives + ' (1회 사용)'); } else { render(); toast('되돌리기 +' + EC.undo3Gives); } })); sheet('되돌리기를 더 받을까요?', null, o); }
  function perchSheet() { var o = [], key = V8.dayKey(), fl = V8.freePerchLeft(save, EC, key), ad = adShow() && !S.a.adPerch;
    if (save.inventory.perchToken > 0) o.push({ k: 'token', icon: V8A.token, label: '횃대 토큰 쓰기 (보유 ' + save.inventory.perchToken + ')', go: function () { save.inventory.perchToken--; closeSheet(); addPerch(); } });
    if (ad) o.push(adOpt('ad', 'add_tube', '광고 보고 횃대 추가', function () { S.a.adPerch = true; addPerch(); }));
    o.push(coinOpt('coin', EC.perch, '횃대 추가', function () { addPerch(true); }));
    if (!adAvail() && save.coins < EC.perch && fl > 0) o.push({ k: 'free', label: '무료 횃대 (오늘 ' + fl + '번 남음)', go: function () { if (V8.useFreePerch(save, EC, key)) { closeSheet(); addPerch(); } } });
    sheet('횃대를 추가할까요?', null, o); }
  function hintSheet() { var o = []; if (save.inventory.hint > 0) o.push({ k: 'inv', label: '보유 힌트 쓰기 (' + save.inventory.hint + ')', go: function () { save.inventory.hint--; persist(); closeSheet(); showHint(); } });
    if (adShow()) o.push(adOpt('ad', 'hint', '광고 보고 힌트 1회', function () { showHint(); }));
    o.push(coinOpt('coin', EC.hint, '힌트 1회', function () { showHint(true); })); sheet('힌트를 더 받을까요?', null, o); }
  function stuckSheet(unwin) { if (S.won || $('v8stuck') && $('v8stuck').classList.contains('show')) return; sfx.play('stuck'); var o = $('v8stuck');
    if (!o) { o = document.createElement('div'); o.id = 'v8stuck'; o.className = 'ov v8ov'; document.body.appendChild(o); }
    var canP = perches(S.a) < EC.perchMaxPerStage;
    o.innerHTML = '<div class="card v8-sheet" role="dialog" aria-label="막힘"><img class="v8-sheet-art" src="' + V8A.stuckArt + '" alt=""><div class="title">' + (unwin ? '이대로는 풀 수 없어요' : '더 이상 옮길 수 없어요') + '</div><div class="v8-sheet-btns">'
      + '<button class="v8-sheet-btn" data-k="undo">되돌리기</button>' + (canP ? '<button class="v8-sheet-btn" data-k="perch">횃대 추가</button>' : '') + '<button class="v8-sheet-btn" data-k="restart">다시하기</button></div></div>';
    o.querySelectorAll('.v8-sheet-btn').forEach(function (b) { b.onclick = function () { o.classList.remove('show'); var k = b.dataset.k; if (k === 'undo') undo(); else if (k === 'perch') addTube(); else doRestart(); }; });
    o.classList.add('show'); SP._stuckShown = (SP._stuckShown || 0) + 1; }
  function addPerch(paid) { if (S.locked || perches(S.a) >= EC.perchMaxPerStage) return; S.a.perches = perches(S.a) + 1; S.a.addedTube = true; persist();
    S.tubes.push([]); S.caps.push(4); S.lock.push(null); S.mask.push([]); if (S.cage) S.cage.push(null); S.sel = -1; render(); toast('횃대가 하나 늘었어요'); }
  function hintFree() { return (!S.daily && S.n <= EC.freeHintUnlimitedTo) || (S.a.hintsUsed || 0) < EC.freeHintsPerStage; }
  function showHint(paid) { S.a.hintsUsed = (S.a.hintsUsed || 0) + 1; persist(); S.hint = nextMove(); S.sel = -1; $('hint').classList.remove('v8-glow'); render(); if (!S.daily && S.n > EC.freeHintUnlimitedTo) tip('hint11', '힌트는 판마다 1번 무료예요'); }
  // ---------------- v8.1 meta (GDD v8 §4 P1 별 상자 · P2 도감 · P3 보스 · P4 연승). Only reached when F81. ----------------
  var ALBUM_GIM = { hidden: ['숨은 새', 'assets-v8-bird-hidden-surprised.svg?v=dcf5c5be'], key: ['열쇠 새', 'assets-v8-bird-key-a-surprised.svg?v=28a72eb2'], cage: ['새장 새', 'assets-v8-cage-front.svg?v=4b4aae46'],
    egg: ['알', 'assets-v8-egg-base.svg?v=188c1e8a'], sleep: ['잠꾸러기', 'assets-v8-bird-indigo-sleepy.svg?v=07b0f725'], alarm: ['알람 새', 'assets-v8-badge-alarm.svg?v=3b80b6a4'] }, debuts81 = null;
  function debuts() { if (debuts81) return debuts81; debuts81 = M81.albumDebuts(SP.STAGES, C.palette, LAST);
    if (F82) for (var q = 1; q <= LAST; q++) if (SP.STAGES[q] && SP.STAGES[q].bomb) { debuts81.bomb = q; break; } return debuts81; } // v8.2: bomb card (debut stage cleared)
  // v8.2 album cards (only with C.features.v82): bomb (debut stage), magpie (first 까미 use). Art = placeholder until the designer
  // delivers; hook classes v82-album-art + v82-album-bomb / v82-album-magpie on the <img> (card art 96x96, same frame as others).
  if (F82) { ALBUM_GIM.bomb = ['폭탄 새', V82.bomb]; ALBUM_GIM.magpie = ['까미', V82.magpieBird]; }
  function albumIds82() { var a = M81.albumIds(C.palette); return F82 ? a.concat(['bomb', 'magpie']) : a; }
  function flameHud() { var el = $('v8flame'), n = save.streak.n, L = M81.flameLevel(n);
    if (!el) { el = document.createElement('div'); el.id = 'v8flame'; el.className = 'v8-flame'; el.setAttribute('role', 'status'); document.querySelector('header.hud').appendChild(el); }
    el.hidden = !L || !!S.daily; el.innerHTML = L ? '<img src="' + V81.flame.replace('{n}', L) + '" alt="" width="20" height="20">' + n + '연승' : ''; el.setAttribute('aria-label', n + '연승 중'); }
  function metaStart(n, g) { var k = save.streak, msg = [];
    if (!QAP && k.n >= E81.streakUndoAt && S.a.streakAt !== k.n) { var b = M81.streakBonus(k.n, E81), I = save.inventory; S.a.streakAt = k.n;
      if (b.undo) { S.a.undoLeft += b.undo; msg.push('되돌리기 +' + b.undo); }
      if (b.token && I.perchToken < EC.tokenMax) { I.perchToken++; msg.push('횃대 토큰 +1'); }
      if (b.hint && I.hint < E81.hintMax) { I.hint++; msg.push('힌트 +1'); }
      persist(); render(); if (msg.length) setTimeout(function () { toast(k.n + '연승 보너스 · ' + msg.join(' · ')); }, 400); }
    flameHud(); document.body.classList.toggle('v8-boss', !!g.boss);
    var bb = $('v8bossbanner'); if (g.boss) { if (!bb) { bb = document.createElement('div'); bb.id = 'v8bossbanner'; bb.className = 'v8-boss-banner v8-boss-intro'; bb.setAttribute('role', 'status'); document.body.appendChild(bb); }
      bb.textContent = '보스 스테이지 ' + n; bb.hidden = true; clearTimeout(bb._h); var tries = 0; // v8.1.1: show 1.5 s once the board is really on screen (map / splash / sheets closed), never blocks input
      (function go() { var cover = document.querySelector('#menu.show, #splash, .ov.show'); if (cover && tries++ < 60) { bb._h = setTimeout(go, 100); return; } if (S.n !== n) return; bb.classList.remove('v8-boss-intro'); void bb.offsetWidth; bb.classList.add('v8-boss-intro'); bb.hidden = false; SP._bossShownAt = performance.now(); bb._h = setTimeout(function () { bb.hidden = true; }, 1500); })(); } else if (bb) { clearTimeout(bb._h); bb.hidden = true; }
    if ((g.eggs || []).length && S.brood) tip('egg82', '알 위에 같은 색 새를 앉혀 두면 ' + Math.max.apply(null, g.eggs.map(function (e) { return e.n; })) + '번 움직인 뒤 깨어나요');
    else if ((g.eggs || []).length) tip('egg', '알은 무리를 ' + Math.max.apply(null, g.eggs.map(function (e) { return e.n; })) + '번 완성하면 깨어나요');
    if ((g.sleep || []).length) tip('sleep', '시계 든 새의 무리를 완성하면 다들 깨어나요');
    if (g.chain) tip('chain', '자물쇠 안에 또 열쇠가 있어요'); if (F82) meta82Start(n, g); }
  function metaWin(st, prev) { var a = S.a, clean = !S.undos && !a.hintsUsed && !perches(a) && !a.addedTube, h = '', coins = 0;
    var n0 = save.streak.n, n = M81.streakWin(save, clean); if (n >= 2 && n > n0) { sfx.play('streak-up'); h += ' · ' + IC('fire') + ' ' + n + '연승'; }
    save.v8paid = save.v8paid || {}; if (S.g.boss && !save.v8paid['boss' + S.n]) { save.v8paid['boss' + S.n] = 1; V8.addCoins(save, E81.bossBonus, EC); coins += E81.bossBonus; h += ' · 보스 +' + E81.bossBonus; setTimeout(function () { sfx.play('boss-clear'); }, 900); }
    var al = M81.albumSync(save, debuts(), E81, EC); if (al.got.length) h += ' · 도감 카드 +' + al.got.length; if (al.coins) { coins += al.coins; h += ' · 도감 보상 +' + al.coins; }
    var ch = M81.chestAccrue(save, E81); if (ch) h += ' · 별 상자 +' + ch + ' (지도에서 열어요)';
    flameHud(); SP._meta = { clean: clean, streak: n, album: al, chests: ch, coins: coins }; return { coins: coins, html: h }; }
  function metaMenu() { var co = $('coins'); co.insertAdjacentHTML('beforeend', ' <button class="btn v8-bag" id="v8albumBtn">도감</button>'); $('v8albumBtn').onclick = albumOpen;
    if (save.m81sheet && !QAP) { var u = save.m81sheet; delete save.m81sheet; persist(); upgradeSheet(u); SP._upgradeShown = (SP._upgradeShown || 0) + 1; }
    var got = []; if (!QAP) { M81.albumSync(save, debuts(), E81, EC); M81.chestAccrue(save, E81); got = M81.chestOpen(save, E81, EC); persist(); } // v8.1.1: QA practice opens / grants nothing
    var pr = M81.chestProgress(save, E81), row = $('v8chestrow'); if (!row) { row = document.createElement('div'); row.id = 'v8chestrow'; row.className = 'v8-chestrow'; co.insertAdjacentElement('afterend', row); }
    row.innerHTML = '<img src="' + V81.chestClosed + '" alt="" width="36" height="36"><div class="v8-chestinfo"><b>별 상자까지 ' + pr.left + '개</b><div class="v8-star-bar" aria-hidden="true"><i style="width:' + (75 * pr.have / pr.need).toFixed(1) + '%"></i></div><small>' + pr.have + ' / ' + pr.need + '</small></div>';
    row.setAttribute('aria-label', '별 상자까지 별 ' + pr.left + '개 남음');
    if (got.length) { sfx.play('chest-open'); var t = { coins: 0, hint: 0, token: 0 }; got.forEach(function (r) { for (var x in r) t[x] += r[x]; });
      var parts = []; if (t.coins) parts.push('코인 +' + t.coins); if (t.hint) parts.push('힌트 +' + t.hint); if (t.token) parts.push('횃대 토큰 +' + t.token);
      $('coins').firstChild && (co.innerHTML = co.innerHTML.replace(/^[\s\S]*?(?= <button)/, IC('coin') + ' ' + Math.min(save.coins, EC.coinMax).toLocaleString('ko-KR'))); $('v8bag').onclick = bagSheet; $('v8albumBtn').onclick = albumOpen;
      sheet('별 상자 ' + got.length + '개를 열었어요', V81.chestOpen, [{ k: 'got', label: parts.join(' · '), disabled: true, go: function () {} }]);
      if (save.chests.pending) toast('남은 상자 ' + save.chests.pending + '개는 다음에 열려요'); SP._chestGot = got; } if (F82) menu82(co); }
  // v8.1.3: the single upgrade sheet (chests + album together, shown once; data kept in save.m81sheet until shown)
  function upgradeSheet(u) { var t = { coins: 0, hint: 0, token: 0 }; (u.chests || []).forEach(function (r) { for (var x in r) t[x] += r[x]; });
    var rows = [], parts = []; if (t.coins) parts.push('코인 +' + t.coins); if (t.hint) parts.push('힌트 +' + t.hint); if (t.token) parts.push('횃대 토큰 +' + t.token);
    if (u.chests.length) rows.push({ k: 'chest', label: '별 상자 ' + u.chests.length + '개: ' + parts.join(' · '), disabled: true, go: function () {} });
    if (u.cards || u.albumCoins) rows.push({ k: 'album', label: '도감 카드 ' + u.cards + '장 해금' + (u.albumCoins ? ' · 도감 보상 코인 +' + u.albumCoins : ''), disabled: true, go: function () {} });
    var pr = M81.chestProgress(save, E81); rows.push({ k: 'next', label: '지금까지 모은 별은 정산됐어요 · 다음 상자까지 별 ' + pr.left + '개', disabled: true, go: function () {} });
    sfx.play('chest-open'); sheet('새 기능 업데이트 선물', V81.chestOpen, rows); SP._upgrade = u; }
  function albumOpen() { var o = $('v8album'); if (!o) { o = document.createElement('div'); o.id = 'v8album'; o.className = 'ov v8ov'; document.body.appendChild(o); }
    var ids = albumIds82(), A = save.album, have = ids.filter(function (i) { return A[i]; }).length, D = debuts();
    var card = function (id) { var own = !!A[id], P = id[0] === 'c' ? C.palette[+id.slice(1)] : null, nm = P ? BIRD_KO[P.key][0] : ALBUM_GIM[id][0], im = P ? BF.expr(+id.slice(1), 'idle') : ALBUM_GIM[id][1];
      var full = own && (id === 'bomb' || id === 'magpie'); // DESIGN 20.17: complete card art (frame + name) as the background
      if (full) return '<button class="v8-album-card ' + id + '" data-id="' + id + '" aria-label="' + nm + '"></button>';
      return '<button class="v8-album-card' + (own ? '' : ' locked' + (F82 ? ' v2' : '')) + '" data-id="' + id + '" aria-label="' + (own ? nm : id === 'magpie' ? '잠긴 카드, 까미를 한 번 쓰면 획득' : '잠긴 카드, ' + (D[id] || '?') + '스테이지 클리어 시 획득') + '">' + (own ? '<img src="' + im + '" alt=""' + (id === 'bomb' || id === 'magpie' ? ' class="v82-album-art v82-album-' + id + '"' : '') + '>' : '') + '<b>' + (own ? nm : id === 'magpie' ? '까미 써 보기' : (D[id] || '?') + '판') + '</b></button>'; };
    var cards; if (F82) { var bySt = function (x, y) { return (D[x] || 1e9) - (D[y] || 1e9) || ids.indexOf(x) - ids.indexOf(y); }, hd = function (t) { return '<div class="v8-album-sub v82-album-group" role="heading" aria-level="3">' + t + '</div>'; }; // planner 10/28: groups, first-met stage ascending
      cards = hd('새 친구') + ids.filter(function (i) { return /^c\d+$/.test(i); }).sort(bySt).map(card).join('') + hd('기믹 친구') + ids.filter(function (i) { return !/^c\d+$/.test(i); }).sort(bySt).map(card).join(''); }
    else cards = ids.map(card).join('');
    o.innerHTML = '<div class="card v8-sheet v8-album" role="dialog" aria-label="새 도감"><div class="title">새 도감 ' + have + '/' + ids.length + '</div><div class="v8-album-sub">6장마다 코인 ' + E81.albumReward + '</div><div class="v8-album-grid' + (F82 ? ' v82' : '') + '">' + cards + '</div><div class="v8-album-face" id="v8face" hidden></div><button class="btn wide" id="v8albumClose">닫기</button></div>';
    o.querySelectorAll('.v8-album-card').forEach(function (b) { b.onclick = function () { var id = b.dataset.id, f = $('v8face'); if (!A[id] || id[0] !== 'c') { f.hidden = true; if (F82 && !A[id]) toast(id === 'magpie' ? '곧 만나요' : D[id] ? D[id] + '판에서 만나요' : '곧 만나요'); return; } var c = +id.slice(1), P = C.palette[c];
      f.innerHTML = ['idle', 'happy', 'sad'].map(function (x) { return '<img src="' + BF.expr(c, x) + '" alt="">'; }).join('') + '<img src="assets-v8-bird-' + P.key + '-sleepy.svg" alt="">'; f.hidden = false; }; });
    $('v8albumClose').onclick = function () { o.classList.remove('show'); }; o.classList.add('show'); }
  SP._meta81 = function () { return { streak: save.streak, chests: save.chests, album: save.album, inv: save.inventory, debuts: debuts() }; };
  SP._v8 = function () { return { save: save, S: S, adAvail: adAvail() }; }; // QA hook
  function vibrate(ms, ev) { if (!hapticsOn) return; SP._haptics.push(ms); if (SP.platform && SP.platform.haptic && SP.platform.haptic(ev || 'toggle')) return; /* Toss host haptic (iOS too) */ if (navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }
  // Remaining solution completes a tube on every move until solved => automatic end-of-stage cascade.
  function isCascade() {
    if (S.lock.some(Boolean) || S.egg || S.slp || S.bomb || S.ice) return false;
    var left = S.tubes.filter(function (t, i) { return t.length && !done(i); });
    var colors = {}; left.forEach(function (t) { t.forEach(function (c) { colors[c] = 1; }); });
    var need = Object.keys(colors).length; if (!need || need > 3) return false;
    var r = E.solve(stageOf(), { limit: 5e4 }); return r.solvable && r.min <= need;
  }
  function onTubeDone(i, solving) {
    fx.fresh = i; if (F80 && !solving) flyAway(i);
    // GDD v0.2: a chain that runs into the stage-solving move is the automatic end-of-stage cascade -> void, no text, no coins
    if (solving) { S.chain = 0; return; } // clear fanfare plays in win()
    S.combo = (S.moves - S.lastDone <= C.comboWindow) ? S.combo + 1 : 1; S.lastDone = S.moves;
    if (S.combo < 2) return snd('complete');
    S.chain += F80 ? V8.comboCoins(S.combo, EC) : C.coinsPerCombo * (S.combo - 1); // N2: accumulates (x2=5, x3=+10 -> 15); v8 R3: x2 +5, x3 +5, x4+ +10
    if (isCascade()) return snd('complete');
    if (F80) comboReward(); // N3: board is now an automatic end cascade -> no COMBO text (it will pay nothing)
    snd('combo', S.combo); // DESIGN §6: pitch +1 semitone per combo step (max +5)
    var c = $('combo'); c.className = S.combo >= 4 ? 'c4' : S.combo === 3 ? 'c3' : ''; c.textContent = '콤보 ×' + S.combo + '!';
    void c.offsetWidth; c.className += ' combo'; clearTimeout(c._e); c._e = setTimeout(function () { c.textContent = ''; c.className = ''; }, 1400); // v7.2 PM-2: emptied after the animation
    if (S.combo >= 3) { var f = document.createElement('div'); f.className = 'flash'; document.body.appendChild(f); setTimeout(function () { f.remove(); }, 300); }
    if (S.combo >= 4 && !reduced) { $('app').classList.add('screenshake'); setTimeout(function () { $('app').classList.remove('screenshake'); }, 200); }
  }
  function comboReward() { // v8 R3: x3 -> +1 undo this stage, x4+ -> perch token (max 3). Once per stage (save.v8paid), undo/restart can't farm it
    var pk = S.daily ? 'd' + S.daily : S.n, pf = save.v8paid[pk] || (save.v8paid[pk] = {}), msg = '';
    if (S.combo >= EC.comboUndoAt && !pf.u) { pf.u = 1; S.a.undoLeft++; msg = '되돌리기 +1'; tip('combo3', '콤보 보상! 되돌리기가 1번 늘었어요'); }
    if (S.combo >= EC.comboTokenAt && !pf.t && save.inventory.perchToken < EC.tokenMax) { pf.t = 1; save.inventory.perchToken++; msg += (msg ? ' · ' : '') + '횃대 토큰 +1'; }
    persist(); if (!msg) return; snd('combo-reward'); var p = document.createElement('div'); p.className = 'v8-pop v8-pop-fixed'; p.innerHTML = '<span>' + msg + '</span>'; document.body.appendChild(p); setTimeout(function () { p.remove(); }, 1400); SP._comboReward = msg; }
  function flyAway(i) { if (reduced) return; whenLanded(function () { var t = document.querySelectorAll('#board .tube')[i]; if (!t || !t.animate) return; // F1: the flock flies off 0.6s (data keeps the completed perch)
    [].forEach.call(t.querySelectorAll('img.bird'), function (b, k) { var r = b.getBoundingClientRect(), c = b.cloneNode(); c.className = 'ball bird v8-flock'; c.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;z-index:30;pointer-events:none';
      document.body.appendChild(c); c.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(' + ((k % 2 ? 1 : -1) * 30) + 'px,-' + (80 + 20 * k) + 'px) scale(.8)', opacity: 0 }], { duration: 600, delay: k * 40, easing: 'ease-in', fill: 'forwards' }); setTimeout(function () { c.remove(); }, 800); }); }); }
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
    if (!E.isSolved(est())) { S.locked = false; S.solvedLock = false; render(); return; } // H1: re-check before saving
    S.won = true; var st = starsFor(S.moves, S.g.min, sn(), !!S.daily), prev = save.stars[S.n] || 0;
    $('cleartitle').textContent = S.daily ? '오늘의 도전 완료!' : '스테이지 클리어!'; $('cleartitle').classList.toggle('sr-only', !S.daily); /* v7 B6: art ribbon already says 스테이지 클리어 -> title for screen readers only (daily keeps its title) */ $('next').textContent = S.daily ? '캠페인으로' : '다음';
    if (S.daily) return winDaily(st, defer);
    var qsnap = QAP ? JSON.stringify(save) : null; // v8.1.1: QA practice -> nothing about the clear is kept, not even in memory
    var got = prev === 0 ? C.coinsFirstClear : Math.max(0, st - prev) * C.coinsPerStarImprove; // GDD v0.2
    // N1: combo coins paid only on clear; lifetime cap per stage persisted in save.comboPaid
    save.comboPaid = save.comboPaid || {}; var paid = save.comboPaid[S.n] || 0;
    var combo = Math.max(0, Math.min(S.banked, (F80 ? EC.comboCap : C.maxComboCoinsPerStage) - paid)); save.comboPaid[S.n] = paid + combo;
    var fe = 0; if (F80 && st === 3 && S.undos === 0 && !save.badges.feather[S.n]) { save.badges.feather[S.n] = 1; fe = EC.noUndo3Bonus; got += fe; } // v8 R6: no-undo 3 stars -> feather badge +5 (first time only)
    if (st > prev) starPop[S.n] = prev; /* v7 C14: newly earned map stars pop once */ save.stars[S.n] = Math.max(prev, st); if (F80) V8.addCoins(save, got + combo, EC); else save.coins += got + combo;
    if (S.n <= save.unlocked) save.unlocked = Math.max(save.unlocked, Math.min(S.n + 1, LAST)); // L3: debug-jumped stages don't unlock
    if (S.n < LAST) save.current = S.n + 1; // L2
    save.attempt[S.n] = { undoLeft: C.freeUndos, addedTube: false, perches: 0 }; // GDD v0.2: clear resets this stage's consumables (restart does not)
    var mx = F81 ? metaWin(st, prev) : null; if (mx) got += mx.coins; if (F82 && mx) { var m2 = meta82Win(st); mx.coins += m2.coins; got += m2.coins; mx.html += m2.html; }
    persist(); render();
    $('bigstars').innerHTML = starsHtml(st); $('result').textContent = '이동 ' + S.moves + ' / 최소 ' + S.g.min; starTip();
    $('coinsGot').innerHTML = IC('coin') + ' 코인 +' + (got + combo) + ' (보유 ' + save.coins + ')' + (combo ? ' · 콤보 +' + combo : '') + (fe ? ' · 깃털 배지 +' + fe : '') + (mx ? mx.html : ''); // v7 B6
    if (qsnap) { $('coinsGot').innerHTML += ' <b class="qa-nosave">(QA 연습: 저장 안 됨)</b>'; var q0 = JSON.parse(qsnap); Object.keys(save).forEach(function (k) { delete save[k]; }); Object.assign(save, q0); render(); }
    $('next').style.display = S.n < LAST ? '' : 'none';
    if (!(F80 && V8A.debut.indexOf(S.n) >= 0)) SP.ads.noteClear(S.n); // v8 F1: no interstitial right after a gimmick debut stage // L7: interstitial (if due) shows only when the player taps 다음
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
    el.innerHTML = '<div class="drow"><div class="dtitle">' + CAL(k) + ' 오늘의 도전 <small>' + dailyLabel(k) + (F82 && DD.theme && DD.theme(k, THO()) ? ' · <span class="dtheme">' + DD.theme(k, THO()).label + '</span>' : '') + '</small></div><div class="dstreak" title="최고 ' + (d.best || 0) + '일">' + IC('fire') + ' ' + cur + '일 연속</div></div>'
      + '<div class="dtrack">' + h + '</div><button class="btn ' + (done ? '' : 'primary ') + 'wide" id="dailyBtn">' + (done ? '다시 하기 (보상 없음) · <span id="dailyCd"></span> 후 새 도전' : '도전하기 ▶') + '</button>';
    $('dailyBtn').onclick = function () { $('menu').classList.remove('show'); clearInterval(cdT); load(DAILY); };
    clearInterval(cdT); if (done) { var tick = function () { var s = Math.ceil(DD.msToMidnight() / 1000), c = $('dailyCd'); if (!c || !$('menu').classList.contains('show')) return clearInterval(cdT); if (today() !== k) return dailyCard();
      c.textContent = Math.floor(s / 3600) + ':' + ('0' + Math.floor(s / 60) % 60).slice(-2) + ':' + ('0' + s % 60).slice(-2); }; tick(); cdT = setInterval(tick, 1000); }
  }
  function doUndo() { clearTaps(); // v8: the undo itself (consumable already handled by the caller)
    if (S.locked || !S.hist.length) return; var st = $('v8stuck'); if (st) st.classList.remove('show');
    cancelFlights(); var h = S.hist.pop(); S.tubes = h.tubes; S.caps = h.caps; S.lock = h.lock; S.mask = h.mask; S.path = h.path;
    S.cage = h.cage; if (h.x) setX(h.x); while (S.tubes.length < S.g.tubes.length + perches(S.a)) { S.tubes.push([]); S.caps.push(4); S.lock.push(null); S.mask.push([]); if (S.cage) S.cage.push(null); }
    S.moves++; S.undos++; S.sel = -1; S.combo = 0; S.lastDone = -99; S.chain = h.chain; S.banked = h.banked; S.hint = null; S.unsolvRun = 0; sfx.play('undo'); persist(); render(); }
  function undo() {
    if (F80 && S && !S.locked && !SP.ads.isBusy() && !S.hist.length) { if (S.a.undoLeft <= 0) return undoSheet(); toast('되돌릴 이동이 아직 없어요'); sfx.play('invalid'); return; } // v8.0.1: no silent dead button
    if (!S.hist.length || S.locked || SP.ads.isBusy()) return;
    if (F80) { if (!SP.store.get('tip.undoMove')) { SP.store.set('tip.undoMove', '1'); toast('되돌리기도 1수로 세요'); } if (S.a.undoLeft > 0) { S.a.undoLeft--; return doUndo(); } return undoSheet(); }
    var go = function () {
      if (S.locked || !S.hist.length) return;
      cancelFlights(); var h = S.hist.pop(); S.tubes = h.tubes; S.caps = h.caps; S.lock = h.lock; S.mask = h.mask; S.path = h.path; // undo restores '?' state and key/lock
      S.cage = h.cage; if (h.x) setX(h.x); while (S.tubes.length < S.g.tubes.length + perches(S.a)) { S.tubes.push([]); S.caps.push(4); S.lock.push(null); S.mask.push([]); if (S.cage) S.cage.push(null); } // M1: added tube is not undoable
      S.moves++; S.sel = -1; S.combo = 0; S.lastDone = -99; S.chain = h.chain; S.banked = h.banked; S.hint = null; sfx.play('undo'); render(); // R2: revoke chain/banked coins accrued by the undone move // undo counts as a move for stars
    };
    if (!SP.store.get('tip.undoMove')) { SP.store.set('tip.undoMove', '1'); toast('되돌리기도 1수로 세요'); } /* v7 B5: one-time tip */
    if (S.a.undoLeft > 0) { S.a.undoLeft--; persist(); go(); } else SP.ads.showRewarded('undo', function (ok) { if (ok) go(); });
  }
  function addTube() { if (F80) { if (S.locked || SP.ads.isBusy() || perches(S.a) >= EC.perchMaxPerStage) return; return perchSheet(); } if (S.a.addedTube || S.locked || SP.ads.isBusy()) return; SP.ads.showRewarded('add_tube', function (ok) { if (ok && !S.a.addedTube && !S.locked) { S.a.addedTube = true; persist(); S.tubes.push([]); S.caps.push(4); S.lock.push(null); S.mask.push([]); S.sel = -1; render(); toast('횃대가 하나 늘었어요'); } }); }
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
    if (F81 && SP.STAGES[n] && SP.STAGES[n].boss) { e.classList.add('v8-boss-node'); var bi = document.createElement('img'); bi.className = 'v8-boss-ico'; bi.src = V81.bossNode; bi.alt = ''; e.appendChild(bi); e.setAttribute('aria-label', e.getAttribute('aria-label') + ', 보스 스테이지'); }
    if (F80 && save.badges.feather[n]) { var fb = document.createElement('img'); fb.className = 'v8-feather'; fb.src = V8A.feather; fb.alt = '노 되돌리기 배지'; e.appendChild(fb); }
    if (F82 && save.crown82 && save.crown82[n]) { var cr = document.createElement('img'); cr.className = 'v82-crown'; cr.src = V82.crown; cr.alt = '도전 성공 왕관'; e.appendChild(cr); }
    if (n in starPop) setTimeout(function () { delete starPop[n]; }, 0);
    e.onclick = function () { $('menu').classList.remove('show'); load(n); }; return e;
  }
  var mapRaf = 0;
  // v8.0.1 red dot on '스테이지': only while something new waits there = today's 오늘의 도전 is not cleared yet AND the map has not
  // been opened today. Opening the map stores save.seen.daily = today -> the dot goes away until tomorrow's new puzzle.
  function redDot() { return !!DD && !DD.doneToday(save.daily, today()) && !(save.seen && save.seen.daily === today()); }
  function menu() {
    try { dayCheck(); } catch (e) {}
    if (redDot()) { save.seen = save.seen || {}; save.seen.daily = today(); persist(); $('stagesBtn').classList.remove('dot'); }
    $('menu').classList.add('show'); // show first: a map/daily problem must never leave the gear doing nothing
    try { $('coins').innerHTML = IC('coin') + ' ' + (F80 ? Math.min(save.coins, EC.coinMax).toLocaleString('ko-KR') : save.coins) + (F80 ? ' <button class="btn v8-bag v8-bag-ico" id="v8bag" aria-label="가방" title="가방"><span class="v8-bag-svg" aria-hidden="true"></span></button>' : ''); if (F80) $('v8bag').onclick = bagSheet; if (F81) metaMenu(); dailyCard(); } catch (e) { console.error('menu: daily card', e); }
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
  $('undo').onclick = undo; function doRestart() { if (F81 && !S.daily && !S.won) M81.streakReset(save); $('restartov').classList.remove('show'); var st = $('v8stuck'); if (st) st.classList.remove('show'); if (S.a.addedTube || S.a.perches) { S.a.addedTube = false; S.a.perches = 0; persist(); } load(S.n); }
  $('board').addEventListener('pointerdown', hideToast, true); // v7.2 PM-1: tapping the board closes the toast (the tap itself still reaches the bird)
  if (window.MutationObserver) { var tOb = new MutationObserver(function () { if (document.querySelector('.ov.show')) hideToast(); }); [].forEach.call(document.querySelectorAll('.ov'), function (o) { tOb.observe(o, { attributes: true, attributeFilter: ['class'] }); }); } // any modal/sheet -> toast closes at once
  $('restart').onclick = function () { if (S.locked || SP.ads.isBusy()) return; if (dirty()) { $('restartMsg').textContent = (S.moves > 0 || (S.hist && S.hist.length)) ? '지금까지의 이동이 사라져요.' : (S.a.addedTube ? '추가한 횃대도 사라져요.' : '지금까지의 이동이 사라져요.'); $('restartov').classList.add('show'); } else doRestart(); }; // v7 A4 + v7.1 PM-6: confirm whenever the board differs from the stage start (moves, added perch, ...)
  function dirty() { if (S.moves > 0 || S.hist.length || S.a.addedTube) return true; var lk = S.lock.filter(Boolean).length, hd = 0; S.mask.forEach(function (m) { m.forEach(function (x) { if (x) hd++; }); });
    return JSON.stringify([S.tubes, S.g.caps ? S.caps : null, lk, hd]) !== S.init0; }
  $('restartYes').onclick = doRestart; $('restartNo').onclick = function () { $('restartov').classList.remove('show'); }; $('add').onclick = addTube; // QA F10: restart also removes the added perch (undo count kept); // M2: consumables persist via save.attempt
  $('hint').onclick = function () { if (S.locked) return; if (F80) { if (S.hint) return; return hintFree() ? showHint() : hintSheet(); } S.hint = nextMove(); S.sel = -1; render(); };
  // gear + HUD '스테이지' button: pointer events (touch/pen act on pointerup, the synthetic click after it is swallowed) + click (mouse/keyboard)
  function onTap(el, fn) { if (!el) return; var skip = 0;
    el.addEventListener('pointerup', function (e) { if (e.pointerType === 'mouse') return; skip = Date.now(); fn(e); });
    el.addEventListener('touchend', function (e) { if (e.cancelable) e.preventDefault(); }); // no synthetic ghost click on whatever the toggle just revealed/hid (map 닫기 bug)
    el.addEventListener('click', function (e) { if (Date.now() - skip < 600) return; fn(e); }); }
  // QA F4: gear = settings panel only; '스테이지' = map + daily
  function settingsOpen() { syncSym(); if (F82) set82(); $('setov').classList.add('show'); }
  onTap($('settings'), settingsOpen); onTap($('stagesBtn'), menu); onTap($('closeMenu'), function () { $('menu').classList.remove('show'); clearInterval(cdT); });
  $('closeSet').onclick = function () { $('setov').classList.remove('show'); };
  // QA F3: ending popup after the last stage
  function endClose() { $('endov').classList.remove('show'); $('overlay').classList.remove('show'); SP.ads.cancelDue(); }
  $('endDaily').onclick = function () { endClose(); load(DAILY); };
  $('endMap').onclick = function () { endClose(); menu(); };
  function syncSym() { $('bigsym').checked = symbolsLarge; $('sound').checked = !(SP.sfx && SP.sfx.isMuted()); $('haptics').checked = hapticsOn; $('rmotion').checked = reduced; $('rmotion').disabled = osReduced; $('rmnote').hidden = !osReduced; }
  $('haptics').onchange = function () { hapticsOn = this.checked; SP.store.set(HAP_KEY, hapticsOn ? 'on' : 'off'); if (hapticsOn) vibrate(15, 'toggle'); };
  $('rmotion').onchange = function () { if (osReduced) return; reduced = this.checked; SP.store.set(RM_KEY, String(reduced)); applyReduced(); if (S) render(); };
  $('sound').onchange = function () { if (SP.sfx) { SP.sfx.setMuted(!this.checked); if (this.checked) sfx.play('select'); } }; // DESIGN §5.6 settings: sound on/off (persisted)
  $('bigsym').onchange = function () { symbolsLarge = this.checked; SP.store.set(A11Y_KEY, String(symbolsLarge)); document.documentElement.classList.toggle('symbols-large', symbolsLarge); render(); };
  $('fastfly').checked = SP.store.get(FLY_KEY) === 'fast'; $('fastfly').onchange = function () { flySpeed = this.checked ? 'fast' : 'normal'; SP.store.set(FLY_KEY, flySpeed); };
  if ($('v8chipsOpt')) { $('v8chipsRow').hidden = !F80; $('v8chipsOpt').checked = SP.store.get(CHIP_KEY) !== 'off'; $('v8chipsOpt').onchange = function () { SP.store.set(CHIP_KEY, this.checked ? 'on' : 'off'); if (S) render(); }; } // v8 M2b
  syncSym();
  $('theme').onclick = function () { var d = document.documentElement; save.theme = d.dataset.theme === 'light' ? '' : 'light'; d.dataset.theme = save.theme; persist(); };
  $('next').onclick = function () { if (SP.ads.isBusy()) return; if (S.daily) { $('overlay').classList.remove('show'); return load(campaign()); } var n = S.n + 1; SP.ads.beforeNext(function () { $('overlay').classList.remove('show'); load(n); }); };
  $('again').onclick = function () { SP.ads.cancelDue(); $('overlay').classList.remove('show'); load(S.n); };
  // L4: Android back -> close popup -> stage select -> exit confirm modal
  var shown = function (id) { return $(id).classList.contains('show'); };
  function exitModal(on) { $('exitov').classList.toggle('show', on); }
  SP.platform.onBack(function () {
    if (SP.ads.isBusy()) return true;                         // the ad owns the back key while it plays
    if (shown('exitov')) { exitModal(false); return true; }
    if ($('v8sheet') && shown('v8sheet')) { closeSheet(); return true; } if ($('v8stuck') && shown('v8stuck')) { $('v8stuck').classList.remove('show'); return true; }   // popup close
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
  //@qa-start (v8.0.1 QA practice mode, see js-config.js; stripped from the toss build)
  if (SP.QA) { var qs = Math.max(1, Math.min(LAST, SP.QA.stage | 0)); if (SP.STAGES[qs]) { start = qs; bootToMap = false; }
    var qb = document.createElement('div'); qb.id = 'qabadge'; qb.textContent = 'QA 연습'; qb.setAttribute('aria-label', 'QA 연습 모드, 저장 안 함');
    qb.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:9999;font:700 10px/1 sans-serif;padding:3px 5px;border-radius:6px;background:#1A1A2Ecc;color:#fff;pointer-events:none'; document.body.appendChild(qb); }
  //@qa-end
  if (F81 && !QAP && !save.m81) { var up81 = M81.upgrade81(save, debuts(), E81, EC); if (up81) save.m81sheet = up81; persist(); } // v8.1.3: one-time upgrade settlement (sheet on first map open)
  SP.ads.showBanner(); load(start); if (bootToMap) try { menu(); } catch (e) {}
  // v8.1.4 local-midnight rollover while the screen stays on: card + red dot re-render; free perch count is recomputed from the day key whenever the sheet opens
  var dayNow = dayNow || today();
  function dayCheck() { var k = today(); if (dayNow === undefined) dayNow = k; if (!k || k === dayNow) return; dayNow = k; SP._dayRoll = (SP._dayRoll || 0) + 1;
    try { if ($('menu').classList.contains('show')) dailyCard(); } catch (e) {}
    try { $('stagesBtn').classList.toggle('dot', redDot()); } catch (e) {} }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) dayCheck(); }); window.addEventListener('focus', dayCheck); setInterval(dayCheck, 60000); SP._dayCheck = dayCheck;
  var sp = $('splash'); if (sp) { sp.classList.add('out'); setTimeout(function () { sp.remove(); }, 300); } // L6: first screen ready
  SP._bootMs = Math.round(performance.now()); SP._inputLocked = function () { return S.locked && !S.won; };
});
