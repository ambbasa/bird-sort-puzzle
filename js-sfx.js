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
    star: function (i) { tone('sine', semi(C5 * 2, [0, 4, 7][i] || 0), 0, 0.4, 0.2); tone('sine', semi(C5 * 4, [0, 4, 7][i] || 0), 0, 0.25, 0.05); } // "띵" per star
  };
  SP.sfx = {
    play: function (name, arg) { played.push(name); if (played.length > 50) played.shift(); if (!muted && sounds[name]) try { sounds[name](arg); } catch (e) {} },
    isMuted: function () { return muted; },
    setMuted: function (m) { muted = !!m; SP.store.set(KEY, String(muted)); if (!muted) ac(); },
    // L3: suspend the AudioContext while an ad plays or the app is in the background; resume when every reason is cleared
    suspend: function (why) { holds[why || 'x'] = true; if (ctx && ctx.state === 'running') ctx.suspend().catch(function () {}); },
    resume: function (why) { holds[why || 'x'] = false; if (!held() && ctx && ctx.state === 'suspended') ctx.resume().catch(function () {}); },
    state: function () { return { ctx: ctx ? ctx.state : 'none', holds: Object.keys(holds).filter(function (k) { return holds[k]; }) }; },
    unlock: function () { if (!muted) ac(); },
    _played: played // QA: last played sound names
  };
  SP.platform.whenReady(function () { muted = SP.store.get(KEY) === 'true'; });
  function vis() { if (document.visibilityState === 'hidden') SP.sfx.suspend('bg'); else SP.sfx.resume('bg'); }
  document.addEventListener('visibilitychange', vis);
  window.addEventListener('pagehide', function () { SP.sfx.suspend('bg'); }); window.addEventListener('pageshow', function () { SP.sfx.resume('bg'); });
  // Unlock audio on the first gesture so the very first tap can already sound
  ['pointerdown', 'keydown'].forEach(function (ev) { window.addEventListener(ev, function () { SP.sfx.unlock(); }, { capture: true, passive: true }); });
})();
