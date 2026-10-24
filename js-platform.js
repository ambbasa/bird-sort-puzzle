// Platform adapter (LAUNCH.md L1/L4/L5/L6). One API for the game; two backends:
//  - App-in-Toss release bundle: window.SPToss (SDK bridge, dist/js/toss-bridge.js) is present.
//  - file:// dev build / plain browser: no SDK -> localStorage + dummy fallbacks, ready synchronously.
// SDK names follow the official docs (developers-apps-in-toss.toss.im, SDK 3.x domain API).
var SP = window.SP = window.SP || {};
(function () {
  var T = window.SPToss || null, KEYS = ['sortpuzzle.v1', 'sortpuzzle.ads.v1', 'sfx.muted', 'a11y.symbolsLarge'];
  var cache = {}, prefix = '', mode = 'localStorage', isReady = false, queue = [], backFns = [], dirty = {}, flushT = 0, sdkStorage = false;
  function ls(k, v) { try { if (arguments.length > 1) localStorage.setItem(k, v); else return localStorage.getItem(k); } catch (e) { return null; } }
  function sup(fn) { try { return !!fn && (typeof fn.isSupported !== 'function' || fn.isSupported()); } catch (e) { return false; } }
  function timeout(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]); }
  // Sync reads from an in-memory cache preloaded in ready(); writes go to cache + localStorage at once, SDK Storage debounced (no bridge spam).
  var store = {
    get: function (k) { return Object.prototype.hasOwnProperty.call(cache, k) ? cache[k] : null; },
    set: function (k, v) {
      v = String(v); cache[k] = v; ls(prefix + k, v);
      if (sdkStorage) { dirty[k] = 1; clearTimeout(flushT); flushT = setTimeout(flush, 300); }
    }
  };
  function flush() {
    var ks = Object.keys(dirty); dirty = {};
    ks.forEach(function (k) { T.Storage.setItem(prefix + k, cache[k]).catch(function () { /* localStorage copy remains as fallback */ }); });
  }
  function finish() {
    isReady = true; var q = queue; queue = [];
    q.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
  }
  function loadLocal() { KEYS.forEach(function (k) { var v = ls(prefix + k); if (v === null && prefix) v = ls(k); /* adopt pre-key local save once */ if (v !== null) cache[k] = v; }); }
  function init() {
    if (!T) { loadLocal(); return finish(); } // dev / file:// : synchronous
    var keyP = sup(T.User && T.User.getAnonymousKey) ? timeout(T.User.getAnonymousKey(), 2500) : Promise.reject(new Error('unsupported'));
    keyP.then(function (r) {
      if (!r || r.type !== 'HASH' || !r.hash) throw new Error('no key');
      prefix = 'u:' + r.hash + ':'; mode = 'toss-user-key';
      sdkStorage = !!(T.Storage && T.Storage.getItem);
      if (!sdkStorage) return loadLocal();
      return Promise.all(KEYS.map(function (k) { return timeout(T.Storage.getItem(prefix + k), 2500).catch(function () { return null; }); }))
        .then(function (vals) { KEYS.forEach(function (k, i) { var v = vals[i]; if (v === null || v === undefined) v = ls(prefix + k); if (v === null) v = ls(k); if (v !== null) cache[k] = v; }); mode = 'toss-storage+user-key'; });
    }).catch(function (e) { prefix = ''; mode = 'localStorage(fallback:' + (e && e.message) + ')'; loadLocal(); })
      .then(finish);
  }
  // L6: safe area -> CSS vars (--sa-top/--sa-bottom); fallback is env(safe-area-inset-*) in CSS
  function applyInsets(i) { if (!i) return; var s = document.documentElement.style; ['top', 'bottom', 'left', 'right'].forEach(function (k) { if (typeof i[k] === 'number') s.setProperty('--sa-' + k, i[k] + 'px'); }); }
  if (T && T.SafeArea) {
    try { applyInsets(T.SafeArea.get()); } catch (e) {}
    try { T.SafeArea.subscribe({ onEvent: applyInsets, onError: function () {} }); } catch (e) {}
  }
  if (T && T.Screen && sup(T.Screen.setOrientation)) T.Screen.setOrientation({ type: 'portrait' }).catch(function () {});
  // L4: system back -> game handler (SDK graniteEvent backEvent; dev: Escape key)
  function back() { for (var i = backFns.length - 1; i >= 0; i--) if (backFns[i]() !== false) return; }
  if (T && T.graniteEvent) { try { T.graniteEvent.addEventListener('backEvent', { onEvent: back, onError: function (e) { console.warn('[platform] backEvent', e); } }); } catch (e) {} }
  else window.addEventListener('keydown', function (e) { if (e.key === 'Escape') back(); });
  SP.store = store;
  SP.platform = {
    isToss: !!T, sdk: T,
    whenReady: function (fn) { if (isReady) fn(); else queue.push(fn); },
    storageMode: function () { return mode; },
    onBack: function (fn) { backFns.push(fn); },
    back: back, // QA hook: simulate a system back press
    close: function () {
      if (T && T.Screen) return T.Screen.close().catch(function (e) { console.warn('[platform] close', e); });
      console.log('[platform] close requested (dev build: no host to close)'); SP.platform._closed = true; return Promise.resolve();
    }
  };
  init();
})();
