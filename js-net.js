// v7.3 network-switch robustness (Wi-Fi -> mobile data bug, stage 146: half the birds showed the broken-image icon).
//  1) every <img> in the document: a failed load is hidden (visibility, no layout change) and retried with exponential
//     backoff + a cache-busting query; on `online` / visible all broken images reload at once.
//  2) CSS background images (theme background, saga-map segments): probed with Image(); re-applied once they load.
//  3) web flat build only (SP_BUILD='web', http(s)): registers sw.js (precache + versioned cache). Toss webview / file:// / dev: none.
var SP = window.SP = window.SP || {};
(function () {
  var BUST = '_r', MAXD = 15000, pend = [], lastNote = 0, fails = 0, recoverFns = [];
  function online() { return navigator.onLine !== false; }
  function base(u) { return String(u || '').replace(new RegExp('([?&])' + BUST + '=[^&#]*&?'), '$1').replace(/[?&]$/, ''); }
  function bust(u, k) { u = base(u); return u + (u.indexOf('?') < 0 ? '?' : '&') + BUST + '=' + k + '.' + (Date.now() % 1e6); }
  function note() { // '연결이 불안정해요' (v7.2 toast rule via SP.net.toast = game toast), at most every 20s
    var now = Date.now(); if (now - lastNote < 20000 || !SP.net.toast) return; lastNote = now; try { SP.net.toast('연결이 불안정해요'); } catch (e) {} }
  // ---- <img> recovery ----
  function retryImg(im, now) {
    var src = im.getAttribute('src'); if (!src || /^data:/.test(src)) return;
    var b = base(src), st = im._spNet; if (!st || st.b !== b) st = im._spNet = { b: b, n: 0, t: 0 };
    clearTimeout(st.t); im.classList.add('sp-img-wait');
    var d = now ? 0 : Math.min(400 * Math.pow(2, st.n), MAXD); st.n++; fails++; if (st.n === 3 || !online()) note();
    if (!now && !online()) return; // wait for `online`
    st.t = setTimeout(function () { if (im._spNet !== st || base(im.getAttribute('src')) !== b) return; im.src = bust(b, st.n); }, d);
  }
  document.addEventListener('error', function (e) { var t = e.target; if (t && t.tagName === 'IMG') retryImg(t); }, true);
  document.addEventListener('load', function (e) { var t = e.target; if (t && t.tagName === 'IMG' && t._spNet) { clearTimeout(t._spNet.t); t._spNet = null; t.classList.remove('sp-img-wait'); } }, true);
  function broken(im) { return im.getAttribute('src') && im.complete && !im.naturalWidth; }
  function sweep() { // reload every broken image now (also ones that failed while detached), then the CSS backgrounds
    [].forEach.call(document.images, function (im) { if (broken(im) || im._spNet) retryImg(im, true); });
    var q = pend; pend = []; q.forEach(function (p) { p.retry(true); });
    recoverFns.forEach(function (f) { try { f(); } catch (e) {} });
  }
  window.addEventListener('online', function () { sweep(); });
  window.addEventListener('offline', function () { note(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') sweep(); });
  setInterval(function () { if (document.visibilityState !== 'hidden' && online()) [].forEach.call(document.images, function (im) { if (broken(im) && !im._spNet) retryImg(im); }); }, 4000);
  // ---- loader with retry (artGet / CSS backgrounds). cb(okUrl) when an image decodes; never rejects. ----
  function probe(src, cb, opt) {
    opt = opt || {}; var n = 0, p = { retry: null }, max = opt.max || 1e9, t = 0;
    function go(u) { var im = new Image(); im.onload = function () { cb(u, n); }; im.onerror = function () { fails++; if (++n >= max) return opt.fail && opt.fail(); p.retry(false); }; im.src = u; }
    p.retry = function (now) { clearTimeout(t); var i = pend.indexOf(p); if (i >= 0) pend.splice(i, 1);
      if (!now && !online()) { pend.push(p); note(); return; }
      t = setTimeout(function () { go(bust(src, n)); }, now ? 0 : Math.min(400 * Math.pow(2, n - 1), MAXD)); if (!now) pend.push(p); };
    go(src); return p;
  }
  // CSS background: el keeps its normal (class or inline) background; if the url fails, it is re-applied inline once loaded.
  function bgUrls(el) { var m = (getComputedStyle(el).backgroundImage || '').match(/url\(["']?([^"')]+)["']?\)/g) || []; return m.map(function (s) { return s.replace(/^url\(["']?|["']?\)$/g, ''); }); }
  function watchBg(el, src) {
    if (el._spBg) el._spBg.forEach(function (p) { p.retry = function () {}; }); el._spBg = [];
    var list = src ? [src] : bgUrls(el);
    list.forEach(function (u) { el._spBg.push(probe(u, function (ok, tries) { if (!tries) return; // first try fine: CSS load also fine
      if (src) el.style.backgroundImage = 'url("' + ok + '")'; else el.style.backgroundImage = getComputedStyle(el).backgroundImage.split(u).join(ok); })); });
  }
  // ---- Service Worker (flat web build only) ----
  try {
    if (window.SP_BUILD === 'web' && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol) && window.isSecureContext) {
      window.addEventListener('load', function () {
        try { navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).then(function (reg) { SP.net.swReg = reg;
          document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') reg.update().catch(function () {}); });
        }).catch(function (e) { console.warn('[net] sw', e && e.message); }); } catch (e) {}
      });
    }
  } catch (e) {}
  SP.net = { online: online, base: base, bust: bust, probe: probe, watchBg: watchBg, sweep: sweep, note: note, toast: null,
    onRecover: function (f) { recoverFns.push(f); }, stats: function () { return { fails: fails, pending: pend.length }; } };
})();
