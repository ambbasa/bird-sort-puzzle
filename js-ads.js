// Ad layer (LAUNCH.md L2/L3/L7). Backends:
//  - App-in-Toss: loadFullScreenAd/showFullScreenAd (interstitial + rewarded, same API, type decided by adGroupId)
//    and TossAds.initialize/attachBanner for the banner. IDs: SP.CONFIG.toss.adGroupIds (placeholders until the owner issues them).
//  - Dev / file://: dummy overlays (no network). Rewarded "watch complete" = countdown finished.
// Rules: ads are preloaded; reward is granted ONLY on the watch-complete event (SDK: userEarnedReward);
// failure / early close = no reward; a not-loaded rewarded ad disables its buttons (onChange -> game re-render).
(function () {
  var KEY = 'sortpuzzle.ads.v1', C = SP.CONFIG, T = SP.platform.sdk, IDS = (C.toss && C.toss.adGroupIds) || {};
  var st = { clears: 0, lastInterstitial: 0, impressions: 0, due: false }, busy = false, listeners = [];
  var ready = { interstitial: false, rewarded: false }, tries = { interstitial: 0, rewarded: 0 }, RETRY = [2000, 8000, 30000];
  var DUMMY_FAIL = false;
  function persist() { SP.store.set(KEY, JSON.stringify(st)); }
  function changed() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }
  function placeholder(id) { return !id || /^PLACEHOLDER/.test(id); }
  function sdkFull() { try { return !!T && T.loadFullScreenAd.isSupported() && T.showFullScreenAd.isSupported(); } catch (e) { return false; } }
  var mode = T ? (sdkFull() ? 'toss' : 'toss-unsupported') : 'dummy';
  function audio(on) { if (SP.sfx) SP.sfx[on ? 'resume' : 'suspend']('ad'); } // L3
  function load(kind) {
    if (ready[kind]) return;
    if (mode === 'dummy') { ready[kind] = !DUMMY_FAIL; return changed(); }
    var id = IDS[kind]; if (mode !== 'toss' || placeholder(id)) return; // no real ID yet -> stays unavailable (buttons disabled)
    var off = T.loadFullScreenAd({
      options: { adGroupId: id },
      onEvent: function (e) { if (e.type === 'loaded') { ready[kind] = true; tries[kind] = 0; changed(); try { off && off(); } catch (x) {} } },
      onError: function (err) { console.warn('[ads] load ' + kind + ' failed', err); try { off && off(); } catch (x) {} ready[kind] = false; changed(); retry(kind); }
    });
  }
  function retry(kind) { var d = RETRY[tries[kind]++]; if (d) setTimeout(function () { load(kind); }, d); } // bounded retries (checklist: control retry count/interval)
  // Full-screen show. cb(rewardGranted:boolean) for rewarded, cb() for interstitial.
  function show(kind, label, cb) {
    if (busy || !ready[kind]) return cb && cb(false);
    busy = true; ready[kind] = false; audio(false); changed();
    var earned = false, ended = false;
    function end() {
      if (ended) return; ended = true; busy = false; audio(true);
      console.log('[ads] ' + kind + ' ' + label + ' -> ' + (kind === 'rewarded' ? (earned ? 'rewarded' : 'no reward') : 'closed'));
      load(kind); changed(); cb && cb(kind === 'rewarded' ? earned : true);
    }
    if (mode === 'dummy') return dummy(kind, label, function (ok) { earned = ok; end(); });
    var off = T.showFullScreenAd({
      options: { adGroupId: IDS[kind] },
      onEvent: function (e) {
        if (e.type === 'impression') { st.impressions++; persist(); }
        else if (e.type === 'userEarnedReward') earned = true; // the ONLY place a reward is granted
        else if (e.type === 'dismissed' || e.type === 'failedToShow') { try { off && off(); } catch (x) {} end(); }
      },
      onError: function (err) { console.warn('[ads] show ' + kind, err); try { off && off(); } catch (x) {} end(); }
    });
  }
  function dummy(kind, label, done) { // visible placeholder; closing a rewarded ad before the countdown ends = no reward
    var seconds = kind === 'rewarded' ? SP.ads.rewardedSeconds : SP.ads.interstitialSeconds;
    var o = document.createElement('div'); o.className = 'adov'; o.setAttribute('role', 'dialog');
    o.innerHTML = '<div class="adbox"><div class="adtag">AD · ' + kind + '</div><div class="adbody">더미 광고<br><small>' + label + '</small></div>' +
      '<div class="adcount"></div><button class="btn adclose"></button></div>';
    document.body.appendChild(o); st.impressions++; persist();
    var left = seconds, cnt = o.querySelector('.adcount'), btn = o.querySelector('.adclose');
    function tick() {
      cnt.textContent = left > 0 ? left + '초' : (kind === 'rewarded' ? '보상 지급 가능' : '');
      btn.textContent = left > 0 ? (kind === 'rewarded' ? '건너뛰기 (보상 없음)' : '닫기 대기') : (kind === 'rewarded' ? '보상 받기' : '닫기');
      btn.disabled = kind !== 'rewarded' && left > 0;
    }
    var iv = setInterval(function () { left--; tick(); if (left <= 0) clearInterval(iv); }, 1000);
    btn.onclick = function () { clearInterval(iv); o.remove(); done(left <= 0); };
    tick();
  }
  function banner() {
    var b = document.getElementById('banner'); if (!b) return;
    if (mode === 'dummy') { b.textContent = '광고 배너 320×50 (placeholder)'; return; }
    var id = IDS.banner, TA = T && T.TossAds;
    try { if (!TA || placeholder(id) || !TA.initialize.isSupported() || !TA.attachBanner.isSupported()) return; } catch (e) { return; }
    TA.initialize({ callbacks: {
      onInitialized: function () { TA.attachBanner(id, b, { theme: 'dark', variant: 'expanded', callbacks: { onAdFailedToRender: function (p) { console.warn('[ads] banner', p && p.error); }, onNoFill: function () {} } }); },
      onInitializationFailed: function (e) { console.warn('[ads] banner init', e); }
    } });
  }
  SP.ads = {
    rewardedSeconds: 5, interstitialSeconds: 3, mode: function () { return mode; },
    isBusy: function () { return busy; },
    rewardedReady: function () { return ready.rewarded; },
    interstitialReady: function () { return ready.interstitial; },
    onChange: function (f) { listeners.push(f); },
    preload: function () { load('interstitial'); load('rewarded'); },
    showRewarded: function (reason, cb) { show('rewarded', reason, function (ok) { cb(!!ok); }); },
    showBanner: banner,
    // L7: count clears when a stage is cleared; show only when the player then moves on to the next stage
    noteClear: function (stage) {
      var a = C.ads; st.clears++;
      st.due = stage > a.noInterstitialBefore && st.clears % a.interstitialEvery === 0; persist();
    },
    beforeNext: function (cb) {
      var a = C.ads, due = st.due; st.due = false; persist();
      if (!due || Date.now() - st.lastInterstitial < a.minIntervalSec * 1000 || !ready.interstitial) return cb();
      st.lastInterstitial = Date.now(); persist(); show('interstitial', 'next stage', function () { cb(); });
    },
    cancelDue: function () { if (st.due) { st.due = false; persist(); } },
    _state: function () { return st; }
  };
  SP.platform.whenReady(function () {
    var s = JSON.parse(SP.store.get(KEY) || 'null'); if (s) for (var k in s) st[k] = s[k];
    SP.ads.preload();
  });
})();
