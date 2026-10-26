// Sound effects (DESIGN.md §7). Pure Web Audio synthesis: no files, no network, size 0.
// AudioContext is created lazily on the first user gesture (browser audio policy). Mute persists in localStorage.
var SP = window.SP = window.SP || {};
(function () {
  var KEY = 'sfx.muted', muted = false, ctx = null, master = null, holds = {}; // holds: reasons audio is suspended (L3: 'bg', 'ad')
  function held() { for (var k in holds) if (holds[k]) return true; return false; }
  var AC = window.AudioContext || window.webkitAudioContext;
  function ac() {
    if (!AC) return null;
    if (!ctx) { try { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination); } catch (e) { ctx = null; return null; } }
    if (held()) return null; // suspended for background/ad: play nothing
    if (ctx.state === 'suspended') try { ctx.resume().catch(function () {}); } catch (e) {}
    return ctx;
  }
  function semi(f, n) { return f * Math.pow(2, n / 12); }
  // One enveloped oscillator: type, freq (Hz, or [from,to] glide), start offset (s), duration (s), peak gain
  function tone(type, freq, at, dur, gain) {
    var c = ac(); if (!c || muted) return;
    var t0 = c.currentTime + (at || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type;
    if (freq.length) { o.frequency.setValueAtTime(freq[0], t0); o.frequency.exponentialRampToValueAtTime(freq[1], t0 + dur); } else o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain || 0.3, t0 + Math.min(0.008, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(at, dur, gain, f0, f1) { // filtered noise sweep ("슉")
    var c = ac(); if (!c || muted) return;
    var t0 = c.currentTime + at, len = Math.ceil(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(); s.buffer = buf; bp.type = 'bandpass'; bp.Q.value = 2;
    bp.frequency.setValueAtTime(f0, t0); bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(bp); bp.connect(g); g.connect(master); s.start(t0); s.stop(t0 + dur + 0.02);
  }
  var C5 = 523.25, played = [];
  var sounds = {
    select: function () { tone('sine', 2400, 0, 0.04, 0.18); tone('triangle', 3600, 0, 0.03, 0.06); },          // glass "틱" 40ms
    drop: function (slot) { var f = semi(1050, (slot || 0) * 2 - 6); tone('sine', [f * 1.15, f], 0, 0.09, 0.3); tone('sine', f * 2.01, 0.01, 0.12, 0.05); }, // "톡", lower slot = lower pitch
    invalid: function () { tone('sine', [180, 130], 0, 0.18, 0.28); },                                         // soft "둥"
    complete: function (up) { var b = semi(C5 * 2, Math.min(up || 0, 5)); [0, 4, 7].forEach(function (s, i) { tone('sine', semi(b, s), i * 0.07, 0.35, 0.18); tone('triangle', semi(b, s + 12), i * 0.07, 0.2, 0.04); }); }, // 3-note chime
    combo: function (n) { var up = Math.min(Math.max(n - 1, 1), 5); sounds.complete(up); tone('square', 2637, 0.24, 0.06, 0.05); tone('square', 3520, 0.3, 0.1, 0.05); }, // chime + semitone up + coin "짤랑"
    click: function () { tone('square', [1800, 900], 0, 0.05, 0.12); tone('sine', 2600, 0.03, 0.12, 0.1); }, // DESIGN 13.3 key-consume metal '찰칵'
    undo: function () { noise(0, 0.16, 0.25, 3000, 500); },                                                       // rewind "슉"
    clear: function () { [0, 4, 7, 12, 7, 12, 16].forEach(function (s, i) { var t = [0, .12, .24, .36, .6, .72, .84][i]; tone('sine', semi(C5, s), t, i > 3 ? 0.6 : 0.3, 0.2); tone('triangle', semi(C5, s - 12), t, 0.25, 0.08); }); }, // marimba-ish fanfare ~1.5s
    hop: function (i) { var f = semi(C5 * 1.5, [0, 2, 4, 7, 9, 12, 14][(i || 0) % 7] + 12 * Math.floor((i || 0) / 7)); tone('sine', [f * 0.8, f * 1.25], 0, 0.11, 0.12); tone('triangle', f * 2, 0.02, 0.06, 0.03); }, // clear-sequence perch hop "뿅", pentatonic rising per perch
    // v8.0 synth fallbacks (used until / unless assets-v8-sfx-*.mp3 decode: file://, offline before precache, decode error)
    'coin-spend': function () { tone('square', 1760, 0, 0.05, 0.08); tone('sine', 2637, 0.05, 0.12, 0.12); },
    'combo-reward': function () { [0, 7, 12].forEach(function (s, i) { tone('sine', semi(C5 * 2, s), i * 0.06, 0.18, 0.16); }); },
    'cage-tick': function () { tone('triangle', 1400, 0, 0.06, 0.16); },
    'cage-open': function () { tone('sine', [700, 1400], 0, 0.16, 0.18); tone('triangle', 2100, 0.1, 0.15, 0.08); },
    'reveal-pop': function () { tone('sine', [600, 1500], 0, 0.1, 0.2); },
    stuck: function () { tone('sine', [330, 247], 0, 0.28, 0.2); },
    // v8.1 synth fallbacks (only played when features.v81 is on)
    'egg-crack': function () { noise(0, 0.06, 0.2, 2500, 900); }, hatch: function () { tone('sine', [500, 1200], 0, 0.14, 0.18); tone('triangle', 1800, 0.08, 0.12, 0.08); },
    'alarm-ring': function () { [0, 0.1, 0.2].forEach(function (t) { tone('square', 2200, t, 0.06, 0.05); }); }, wake: function () { tone('sine', [400, 900], 0, 0.2, 0.15); },
    'chest-open': function () { [0, 4, 7, 12].forEach(function (x, i) { tone('sine', semi(C5 * 2, x), i * 0.07, 0.2, 0.15); }); },
    'boss-clear': function () { [0, 7, 12, 16, 19].forEach(function (x, i) { tone('triangle', semi(C5, x), i * 0.1, 0.35, 0.16); }); },
    'streak-up': function () { tone('sine', [900, 1800], 0, 0.16, 0.15); },
    star: function (i) { tone('sine', semi(C5 * 2, [0, 4, 7][i] || 0), 0, 0.4, 0.2); tone('sine', semi(C5 * 4, [0, 4, 7][i] || 0), 0, 0.25, 0.05); } // "띵" per star
  };
  // v8.0 (DESIGN 20.3): sample files for the new events; decoded lazily on first gesture, synth fallback while missing
  var bufs = {}, loading = false;
  function files() { var V = SP.CONFIG && SP.CONFIG.v8; return (V && V.sfx) || {}; }
  function loadFiles() { if (loading || !window.fetch || location.protocol === 'file:') return; /* file:// has no fetch -> synth fallback */ var c = ac(); if (!c) return; loading = true; var F = files();
    Object.keys(F).forEach(function (k) { fetch(F[k]).then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(function (ab) { return new Promise(function (res, rej) { c.decodeAudioData(ab, res, rej); }); })
      .then(function (b) { bufs[k] = b; }).catch(function () { loading = false; /* retry on a later gesture */ }); }); }
  function file(name) { var b = bufs[name], c = b && ac(); if (!c) return false; try { var s = c.createBufferSource(), g = c.createGain(); g.gain.value = 0.8; s.buffer = b; s.connect(g); g.connect(master); s.start(); return true; } catch (e) { return false; } }
  SP.sfx = {
    play: function (name, arg) { played.push(name); if (played.length > 50) played.shift(); if (muted) return; if (file(name)) return; if (sounds[name]) try { sounds[name](arg); } catch (e) {} },
    isMuted: function () { return muted; },
    setMuted: function (m) { muted = !!m; SP.store.set(KEY, String(muted)); if (!muted) ac(); },
    // L3: suspend the AudioContext while an ad plays or the app is in the background; resume when every reason is cleared
    suspend: function (why) { holds[why || 'x'] = true; if (ctx && ctx.state === 'running') ctx.suspend().catch(function () {}); },
    resume: function (why) { holds[why || 'x'] = false; if (!held() && ctx && ctx.state === 'suspended') ctx.resume().catch(function () {}); },
    state: function () { return { ctx: ctx ? ctx.state : 'none', holds: Object.keys(holds).filter(function (k) { return holds[k]; }) }; },
    unlock: function () { if (!muted) { ac(); loadFiles(); } },
    _files: function () { return Object.keys(bufs); },
    _played: played // QA: last played sound names
  };
  SP.platform.whenReady(function () { muted = SP.store.get(KEY) === 'true'; });
  function vis() { if (document.visibilityState === 'hidden') SP.sfx.suspend('bg'); else SP.sfx.resume('bg'); }
  document.addEventListener('visibilitychange', vis);
  window.addEventListener('pagehide', function () { SP.sfx.suspend('bg'); }); window.addEventListener('pageshow', function () { SP.sfx.resume('bg'); });
  // Unlock audio on the first gesture so the very first tap can already sound
  ['pointerdown', 'keydown'].forEach(function (ev) { window.addEventListener(ev, function () { SP.sfx.unlock(); }, { capture: true, passive: true }); });
})();
