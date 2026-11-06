// Ad layer (LAUNCH.md L2/L3/L7 + RESEARCH-ECONOMY E1–E4). Backends:
//  - App-in-Toss: loadFullScreenAd/showFullScreenAd (interstitial + rewarded, same API, type decided by adGroupId)
//    and TossAds.initialize/attachBanner for the banner. IDs: SP.CONFIG.toss.adGroupIds (placeholders until the owner issues them).
//  - Dev / file://: dummy overlays (no network). Rewarded "watch complete" = countdown finished.
// Rules: ads are preloaded; reward is granted ONLY on the watch-complete event (SDK: userEarnedReward);
// failure / early close = no reward; a not-loaded rewarded ad disables its buttons (onChange -> game re-render).
// E1: interstitial only after the clear card is seen and the player taps 다음 (beforeNext); restart / boot / map entry never show it.
// E2: one-shot skip (skipOnce) after stuck sheet, fail sheet, rewarded watch; gimmick debut still skips via noteClear; 90s gap kept.
// E4: local-only exposure/complete/grant log (no network); duplicate earned / late events / concurrent shows never double-pay.
(function () {
  var KEY = 'sortpuzzle.ads.v1', LOG_KEY = 'sortpuzzle.ads.log.v1', LOG_MAX = 40;
  var C = SP.CONFIG, T = SP.platform.sdk, IDS = (C.toss && C.toss.adGroupIds) || {};
  var st = { clears: 0, lastInterstitial: 0, impressions: 0, due: false, skipOnce: false }, busy = false, listeners = [];
  var ready = { interstitial: false, rewarded: false }, tries = { interstitial: 0, rewarded: 0 }, RETRY = [2000, 8000, 30000];
  var DUMMY_FAIL = false;
  function persist() { SP.store.set(KEY, JSON.stringify(st)); }
  function changed() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }
  function placeholder(id) { return !id || /^PLACEHOLDER/.test(id); }
  function sdkFull() { try { return !!T && T.loadFullScreenAd.isSupported() && T.showFullScreenAd.isSupported(); } catch (e) { return false; } }
  // QA F2: the public web build (tools/build-pages-flat.js sets window.SP_BUILD='web') shows no dummy ad UI at all:
  // 'none' = no ad network; rewarded items are granted directly, interstitials skipped, banner area hidden.
  var mode = T ? (sdkFull() ? 'toss' : 'toss-unsupported') : (window.SP_BUILD === 'web' ? 'none' : 'dummy');
  function audio(on) { if (SP.sfx) SP.sfx[on ? 'resume' : 'suspend']('ad'); } // L3
  // E4: local ring log only (SP.store). Fields: t ms, e event, k kind, r reason. No user keys / ad IDs / PII.
  function log(e, kind, reason) {
    var a = []; try { a = JSON.parse(SP.store.get(LOG_KEY) || '[]'); } catch (x) {}
    if (!Array.isArray(a)) a = [];
    a.push({ t: Date.now(), e: e, k: kind, r: String(reason || '').slice(0, 32) });
    if (a.length > LOG_MAX) a = a.slice(-LOG_MAX);
    SP.store.set(LOG_KEY, JSON.stringify(a));
  }
  function load(kind) {
    if (ready[kind]) return;
    if (mode === 'dummy') { ready[kind] = !DUMMY_FAIL; return changed(); }
    if (mode === 'none') { ready[kind] = kind === 'rewarded'; return changed(); }
    var id = IDS[kind]; if (mode !== 'toss' || placeholder(id)) return; // no real ID yet -> stays unavailable (buttons disabled)
    if (SP.net && !SP.net.online()) return window.addEventListener('online', function on() { window.removeEventListener('online', on); load(kind); }); // v7.3: reload when back online
    var off; try { off = T.loadFullScreenAd({
      options: { adGroupId: id },
      onEvent: function (e) { if (e.type === 'loaded') { ready[kind] = true; tries[kind] = 0; changed(); try { off && off(); } catch (x) {} } },
      onError: function (err) { console.warn('[ads] load ' + kind + ' failed', err); try { off && off(); } catch (x) {} ready[kind] = false; changed(); retry(kind); }
    }); } catch (e) { console.warn('[ads] load threw', e); ready[kind] = false; changed(); retry(kind); }
  }
  function retry(kind) { var d = RETRY[tries[kind]++]; if (d) setTimeout(function () { load(kind); }, d); } // bounded retries (checklist: control retry count/interval)
  // Full-screen show. cb(rewardGranted:boolean) for rewarded, cb() for interstitial.
  function show(kind, label, cb) {
    if (busy || !ready[kind]) return cb && cb(false);
    // v7.3: real-ad builds (toss/dummy) offline -> no ad, NO reward, notice only. Web 'none' grants directly (planner decision, no network involved).
    if (mode !== 'none' && SP.net && !SP.net.online()) { if (SP.net.toast) SP.net.toast('연결이 불안정해요'); return cb && cb(false); }
    busy = true; ready[kind] = false; audio(false); changed();
    var earned = false, ended = false, paid = false; // E4: one show = one end = one grant
    function end() {
      if (ended) return; ended = true; busy = false; audio(true);
      var grant = kind === 'rewarded' ? earned : true;
      log('done', kind, label);
      if (kind === 'rewarded' && grant && !paid) { paid = true; log('pay', kind, label); st.skipOnce = true; persist(); } // E2: rewarded watch -> skip next interstitial once
      console.log('[ads] ' + kind + ' ' + label + ' -> ' + (kind === 'rewarded' ? (grant ? 'rewarded' : 'no reward') : 'closed'));
      load(kind); changed(); cb && cb(kind === 'rewarded' ? grant : true);
    }
    log('imp', kind, label);
    if (mode === 'none') { earned = true; return end(); }
    if (mode === 'dummy') return dummy(kind, label, function (ok) { earned = ok; end(); });
    var off; try { off = T.showFullScreenAd({
      options: { adGroupId: IDS[kind] },
      onEvent: function (e) {
        if (e.type === 'impression') { st.impressions++; persist(); }
        else if (e.type === 'userEarnedReward') { if (!ended) earned = true; } // E4: the ONLY place a reward is marked; late events after end are ignored
        else if (e.type === 'dismissed' || e.type === 'failedToShow') { try { off && off(); } catch (x) {} end(); }
      },
      onError: function (err) { console.warn('[ads] show ' + kind, err); try { off && off(); } catch (x) {} end(); }
    }); } catch (e) { console.warn('[ads] show threw', e); end(); }
  }
  // Dummy mirrors the Toss SDK event order: impression -> (userEarnedReward?) -> dismissed.
  // Reward is marked ONLY by the earned event (countdown hitting 0), never by dismiss alone (E4).
  var dummyCtl = null;
  function dummy(kind, label, done) {
    var seconds = kind === 'rewarded' ? SP.ads.rewardedSeconds : SP.ads.interstitialSeconds;
    var o = document.createElement('div'); o.className = 'adov'; o.setAttribute('role', 'dialog');
    o.innerHTML = '<div class="adbox"><div class="adtag">AD · ' + kind + '</div><div class="adbody">더미 광고<br><small>' + label + '</small></div>' +
      '<div class="adcount"></div><button class="btn adclose"></button></div>';
    document.body.appendChild(o); st.impressions++; persist();
    var left = seconds, cnt = o.querySelector('.adcount'), btn = o.querySelector('.adclose'), closed = false, gotEarn = false;
    function tick() {
      cnt.textContent = left > 0 ? left + '초' : (kind === 'rewarded' ? '보상 지급 가능' : '');
      btn.textContent = left > 0 ? (kind === 'rewarded' ? '건너뛰기 (보상 없음)' : '닫기 대기') : (kind === 'rewarded' ? '보상 받기' : '닫기');
      btn.disabled = kind !== 'rewarded' && left > 0;
    }
    function earn() { // userEarnedReward equivalent — the ONLY way a dummy rewarded ad marks a grant
      if (gotEarn || closed || kind !== 'rewarded') return; gotEarn = true; o.dataset.earned = '1'; }
    function dismiss() { if (closed) return; closed = true; clearInterval(iv); dummyCtl = null; o.remove(); done(gotEarn); }
    var iv = setInterval(function () { left--; tick(); if (left <= 0) { clearInterval(iv); earn(); } }, 1000);
    btn.onclick = function () { dismiss(); };
    dummyCtl = { earn: earn, dismiss: dismiss, kind: kind, earned: function () { return gotEarn; }, closed: function () { return closed; } };
    tick();
  }
  function banner() {
    var b = document.getElementById('banner'); if (!b) return;
    var hide = function () { b.classList.add('off'); b.textContent = ''; }; // QA F2: no empty / placeholder ad area
    if (mode === 'dummy') { b.classList.remove('off'); b.textContent = '광고 배너 320×50 (개발용 자리)'; return; }
    if (mode === 'none') return hide();
    var id = IDS.banner, TA = T && T.TossAds;
    try { if (!TA || placeholder(id) || !TA.initialize.isSupported() || !TA.attachBanner.isSupported()) return hide(); } catch (e) { return hide(); }
    // E3: banner attaches once at boot — never refresh / re-attach on a timer (SSP: no periodic banner refresh)
    if (b.dataset.adAttached === '1') return;
    b.classList.remove('off'); b.classList.add('v5-adslot'); b.textContent = ''; // DESIGN 17.3 (A04): framed slot only when a real banner ID exists
    try { TA.initialize({ callbacks: {
      onInitialized: function () { TA.attachBanner(id, b, { theme: 'dark', variant: 'expanded', callbacks: { onAdFailedToRender: function (p) { console.warn('[ads] banner', p && p.error); hide(); }, onNoFill: hide } }); b.dataset.adAttached = '1'; },
      onInitializationFailed: function (e) { console.warn('[ads] banner init', e); hide(); }
    } }); } catch (e) { hide(); } // v7.3: never throw offline
  }
  function gapOk() { return Date.now() - (st.lastInterstitial || 0) >= (C.ads.minIntervalSec * 1000); }
  function dueNow() { return !!st.due && !st.skipOnce && gapOk() && !!ready.interstitial && mode !== 'none'; }
  SP.ads = {
    rewardedSeconds: 5, interstitialSeconds: 3, mode: function () { return mode; },
    isBusy: function () { return busy; },
    rewardedReady: function () { return ready.rewarded; },
    interstitialReady: function () { return ready.interstitial; },
    onChange: function (f) { listeners.push(f); },
    preload: function () { load('interstitial'); load('rewarded'); },
    showRewarded: function (reason, cb) { show('rewarded', reason, function (ok) { cb(!!ok); }); },
    // E4 test hook (dev/dummy): inject SDK-shaped events into the active dummy show. No-op when idle.
    // 'userEarnedReward' marks grant; 'dismissed' ends the show; late earn after dismiss is ignored.
    _emit: function (type) {
      if (!dummyCtl) return false;
      if (type === 'userEarnedReward') { dummyCtl.earn(); return true; }
      if (type === 'dismissed' || type === 'failedToShow') { dummyCtl.dismiss(); return true; }
      return false;
    },
    showBanner: banner,
    // L7 + E1: count clears when a stage is cleared; show only when the player then moves on to the next stage from the clear card
    noteClear: function (stage) {
      var a = C.ads; st.clears++;
      st.due = stage > a.noInterstitialBefore && st.clears % a.interstitialEvery === 0; persist(); changed();
    },
    beforeNext: function (cb) {
      var a = C.ads, due = st.due; st.due = false; persist();
      // E2: consume one-shot skip when an interstitial would otherwise play
      if (due && st.skipOnce) { st.skipOnce = false; persist(); changed(); return cb(); }
      if (mode === 'none' || !due || !gapOk() || !ready.interstitial) { changed(); return cb(); }
      st.lastInterstitial = Date.now(); persist(); changed();
      show('interstitial', 'next stage', function () { cb(); }); // E1: after the ad, go straight to the next stage
    },
    cancelDue: function () { if (st.due) { st.due = false; persist(); changed(); } },
    skipNext: function () { st.skipOnce = true; persist(); changed(); }, // E2: stuck / fail sheet
    willShowNext: function () { return dueNow(); }, // E1: clear-card '다음' affordance
    log: function () { try { return JSON.parse(SP.store.get(LOG_KEY) || '[]'); } catch (e) { return []; } },
    _state: function () { return st; }
  };
  SP.platform.whenReady(function () {
    var s = JSON.parse(SP.store.get(KEY) || 'null'); if (s) for (var k in s) st[k] = s[k];
    if (typeof st.skipOnce !== 'boolean') st.skipOnce = false;
    SP.ads.preload();
  });
})();
