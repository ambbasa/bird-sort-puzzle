// Central config: palette/assets/difficulty. Designer (docs-DESIGN.md, assets/) can replace values here only.
var SP = window.SP = window.SP || {};
SP.CONFIG = {
  capacity: 4,
  // Palette from docs-DESIGN.md / assets-palette.json (color + symbol SVG per ball). Order = color index.
  palette: [{"key":"red","hex":"#E53935","symbol":"circle","file":"assets-birds-bird-red-idle.svg?v=0d8ccf3a","fileLargeSymbol":"assets-birds-badge-lg-red.svg?v=0f989262"},{"key":"orange","hex":"#FB8C00","symbol":"star","file":"assets-birds-bird-orange-idle.svg?v=e83af7b6","fileLargeSymbol":"assets-birds-badge-lg-orange.svg?v=adc1b1a4"},{"key":"yellow","hex":"#FDD835","symbol":"triangle","file":"assets-birds-bird-yellow-idle.svg?v=b7da37e4","fileLargeSymbol":"assets-birds-badge-lg-yellow.svg?v=cdc14e8f"},{"key":"green","hex":"#27A272","symbol":"square","file":"assets-birds-bird-green-idle.svg?v=046a8e76","fileLargeSymbol":"assets-birds-badge-lg-green.svg?v=f3810130"},{"key":"cyan","hex":"#1FC8DA","symbol":"diamond","file":"assets-birds-bird-cyan-idle.svg?v=42323966","fileLargeSymbol":"assets-birds-badge-lg-cyan.svg?v=95420207"},{"key":"blue","hex":"#1E63E5","symbol":"plus","file":"assets-birds-bird-blue-idle.svg?v=8fd77c04","fileLargeSymbol":"assets-birds-badge-lg-blue.svg?v=0f0b7a73"},{"key":"purple","hex":"#870488","symbol":"heart","file":"assets-birds-bird-purple-idle.svg?v=3ad19749","fileLargeSymbol":"assets-birds-badge-lg-purple.svg?v=15695418"},{"key":"white","hex":"#ECEFF1","symbol":"ring","file":"assets-birds-bird-white-idle.svg?v=25da1a93","fileLargeSymbol":"assets-birds-badge-lg-white.svg?v=a43c448a"},{"key":"pink","hex":"#AE507E","symbol":"moon","file":"assets-birds-bird-pink-idle.svg?v=d2e3d0d6","fileLargeSymbol":"assets-birds-badge-lg-pink.svg?v=2e021b33"},{"key":"brown","hex":"#451B00","symbol":"hexagon","file":"assets-birds-bird-brown-idle.svg?v=ddc327f4","fileLargeSymbol":"assets-birds-badge-lg-brown.svg?v=04568f1c"},{"key":"lime","hex":"#ABD494","symbol":"x","file":"assets-birds-bird-lime-idle.svg?v=327a9777","fileLargeSymbol":"assets-birds-badge-lg-lime.svg?v=ff7000fa"},{"key":"indigo","hex":"#0000DB","symbol":"drop","file":"assets-birds-bird-indigo-idle.svg?v=7b28079f","fileLargeSymbol":"assets-birds-badge-lg-indigo.svg?v=f1d4fab8"}],
  assets: { badge: 'assets-v5ui-rec-badge-complete.svg?v=e8cb50af' },
  gimmickAssets: {"hidden":{"file":"assets-gimmicks-ball-hidden.svg?v=c8f4f371","fileLargeSymbol":"assets-birds-badge-lg-hidden.svg?v=062ae845","tone":"#5B6070"},"pair":{"Ka":{"pair":"a","symbol":"circle","keyBall":"assets-gimmicks-ball-key-a.svg?v=9de38343","keyBallLargeSymbol":"assets-birds-badge-lg-key-a.svg?v=0392f131","lock":"assets-gimmicks-lock-a.svg?v=c319f343","lockOpen":"assets-gimmicks-lock-a-open.svg?v=a6a3309f"},"Kb":{"pair":"b","symbol":"triangle","keyBall":"assets-gimmicks-ball-key-b.svg?v=6542710e","keyBallLargeSymbol":"assets-birds-badge-lg-key-b.svg?v=6a794f4f","lock":"assets-gimmicks-lock-b.svg?v=9c174ea5","lockOpen":"assets-gimmicks-lock-b-open.svg?v=66a68a11"},"Kc":{"pair":"c","symbol":"square","keyBall":"assets-gimmicks-ball-key-c.svg?v=768cb7bd","keyBallLargeSymbol":"assets-birds-badge-lg-key-c.svg?v=49b009d3","lock":"assets-gimmicks-lock-c.svg?v=149c2b2a","lockOpen":"assets-gimmicks-lock-c-open.svg?v=40ce70a4"}},"lockedTubeOverlay":"assets-gimmicks-tube-locked-overlay.svg?v=a5fbed2d","smallTube":{"capacity":3,"file":"assets-gimmicks-tube-small.svg?v=d8fc240a","badge":"assets-gimmicks-badge-capacity-3.svg?v=aa8836be","countsForClear":false}},
  // DESIGN ch.14 birds + wooden perches (assets-birds, birds.json / perch/perch.json; files referenced, not modified)
  birds: { pattern: 'assets-birds-bird-{color}-{frame}.svg?v=12d7433e', frames: ['up', 'mid', 'down', 'mid'], foldFrame: 'fold', frameMs: 60, liftMs: 120, landMs: 260, flightMin: 350, flightMax: 450,
    // DESIGN 15.1-15.2 side-view flap frames (facing right; .bird-side--left mirrors, except hidden). enabled = all files present (tools/sync-art.js).
    side: { pattern: 'assets-birds-side-bird-{key}-side-{n}.svg?v=12d7433e', frames: [1, 2, 3, 4], frameMs: 62.5, enabled: true },
    hidden: 'assets-birds-bird-hidden.svg?v=dd67d9ad', key: 'assets-birds-bird-key-{pair}.svg?v=12d7433e',
    expr: function (c, e) { return 'assets-birds-bird-' + SP.CONFIG.palette[c].key + '-' + e + '.svg?v=12d7433e'; },
    perch: { perch: 'assets-birds-perch-perch.svg?v=e14107a5', perchSmall: 'assets-v5ui-rec-perch-small.svg?v=110de3e4', perchLocked: 'assets-v5ui-rec-perch-locked.svg?v=da6f889d', perchSmallLocked: 'assets-v5ui-rec-perch-small-locked.svg?v=3356beb6', perchComplete: 'assets-v5ui-rec-perch-complete.svg?v=cdf0ce1e' } },
  // DESIGN 15.3 / assets-themes-themes.json: themeIndex = floor((stage-1)/100) % 3 -> class .theme-<key> on <body> (backgrounds in assets-theme.css)
  themes: [{ key: 'forest', name: '숲' }, { key: 'sunset', name: '노을 호수' }, { key: 'snow', name: '눈 내린 밤' }],
  // DESIGN ch.16 saga map (assets-map-map-layout.json mirrored here so file:// works without fetch; nodes from the path formula
  // x = 195 + 105*sin(2π*y/450), y = 855 - 90*i, chunk-top origin, 390px wide).
  map: { w: 390, chunkH: 900, bandH: 450, per: 10, chunk: 'assets-map-map-chunk-{key}.svg?v=12d7433e', band: 'assets-map-map-band-{from}-{to}.svg?v=12d7433e', wide: { bleed: 195, chunk: 'assets-map-map-chunk-{key}-wide.svg?v=12d7433e', band: 'assets-map-map-band-{from}-{to}-wide.svg?v=12d7433e', soon: 'assets-map-map-band-coming-soon-{key}-wide.svg?v=12d7433e' } }, // v7 B7: designer wide art (195px bleed each side) fills the whole panel
  freeUndos: 3,
  flight: { crouch: 100, airMin: 800, airMax: 1000, airPerPx: 0.8, land: 150, fastCrouch: 60, fastAir: 400, fastLand: 100, stagger: 120 }, // v7 GDD A2 (ms)
  stars: { two: 1.3, alwaysThreeTo: 5 }, // v7.1 PM-4: 3 stars = moves <= min, 2 = moves <= ceil(min*1.3), 1 = clear; stages 1-5 always 3 (daily excluded)
  // GDD v0.2 combo: tube completions on consecutive player moves; the stage-solving move never counts (no end-of-stage auto chain)
  comboWindow: 1, coinsPerCombo: 5, maxComboCoinsPerStage: 15,
  // GDD v0.2 coins: first clear +10; replays pay only for star improvement
  coinsFirstClear: 10, coinsPerStarImprove: 5,
  ads: { interstitialEvery: 3, noInterstitialBefore: 10, minIntervalSec: 90 },
  // App-in-Toss (LAUNCH.md L1/L2). PLACEHOLDER values: the owner issues real ad group IDs in the App-in-Toss console.
  // While an ID starts with PLACEHOLDER the release build treats that ad as unavailable (rewarded buttons disabled, no banner).
  toss: { appName: 'sort-puzzle', adGroupIds: { interstitial: 'PLACEHOLDER_INTERSTITIAL_AD_GROUP_ID', rewarded: 'PLACEHOLDER_REWARDED_AD_GROUP_ID', banner: 'PLACEHOLDER_BANNER_AD_GROUP_ID' } },
  // GDD difficulty bands (stages 1-30). Stages are precomputed into js-stages.js by tools/build-stages.js.
  // Within each band stages are sorted ascending by (solver min moves, dead-end states). Rest stages (sawtooth) get the easiest layout.
  bands: [
    { from: 1,  to: 2,  colors: 2, empty: 2, depth: 40,  pool: 30, minFloor: 2 },
    { from: 3,  to: 5,  colors: 3, empty: 2, depth: 80,  pool: 40, minFloor: 4 },
    { from: 6,  to: 12, colors: 4, empty: 2, depth: 200, pool: 200, minFloor: 8 },
    { from: 13, to: 18, colors: 5, empty: 2, depth: 300, pool: 400, minFloor: 10 },
    { from: 19, to: 24, colors: 6, empty: 2, depth: 400, pool: 80, minFloor: 10 },
    { from: 25, to: 30, colors: 7, empty: 2, depth: 500, pool: 80, minFloor: 12 }
  ],
  restStages: [9, 19, 29],
  maxStage: 30, // MVP hand-tuned range (legacy builder/verify)
  // v8 (docs-GDD.md 'v8 기획', docs-v8-dev-tasks.md): stage flags. Off = that stage's gimmick stages fall back to the previous stages set.
  features: { v80: true, v81: true, v82: false, eggBrood: false, keyBury: false },
  // v8 economy: every price / cap in one place (GDD v8 §7 숫자 요약)
  economy: { undo3: 30, undo3Gives: 3, perch: 50, hint: 20, perchMaxPerStage: 2, freeHintsPerStage: 1, freeHintUnlimitedTo: 10, freePerchPerDay: 3,
    comboCoins: { 2: 5, 3: 5, 4: 10 }, comboCap: 30, comboUndoAt: 3, comboTokenAt: 4, tokenMax: 3, coinMax: 99999, noUndo3Bonus: 5 },
  // v8.0 art (DESIGN ch.20, assets-v8- — designer files, read-only for dev)
  v8: { surprised: 'assets-v8-bird-{key}-surprised.svg?v=12d7433e', revealMs: 400, cageBadgeLg: 'assets-v8-badge-lg-badge-cage-{n}.svg?v=12d7433e', feather: 'assets-v8-badge-feather.svg?v=4076399d',
    coinBtn: 'assets-v8-icon-coin-btn.svg?v=0c045867', adBadge: 'assets-v8-badge-ad.svg?v=9965e9c7', token: 'assets-v8-token-perch.svg?v=2bbac79c', stuckArt: 'assets-v8-sheet-stuck.svg?v=37a59aa1', chipHidden: 'assets-v8-chip-hidden-icon.svg?v=d94d413e',
    sfx: { 'coin-spend': 'assets-v8-sfx-coin-spend.mp3', 'combo-reward': 'assets-v8-sfx-combo-reward.mp3', 'cage-tick': 'assets-v8-sfx-cage-tick.mp3', 'cage-open': 'assets-v8-sfx-cage-open.mp3', 'reveal-pop': 'assets-v8-sfx-reveal-pop.mp3', stuck: 'assets-v8-sfx-stuck.mp3' },
    debut: [22, 31, 61, 101, 121], stuckToastAfter: 3 },
  // v8.1 (GDD v8 §4 + planner decisions 2026-10-26). Only used when features.v81 is on.
  economy81: { chestEvery: 20, chestCycle: [{ coins: 30 }, { hint: 2 }, { coins: 50 }, { token: 1 }, { coins: 100 }], chestMaxAtOnce: 5, chestMaxUpgrade: 5,
    albumEvery: 6, albumReward: 50, bossBonus: 50, bossStages: [100, 200], streakUndoAt: 2, streakTokenAt: 4, streakHintAt: 6, hintMax: 9 },
  v81: { egg: 'assets-v8-egg-{color}.svg?v=12d7433e', sleepy: 'assets-v8-bird-{key}-sleepy.svg?v=12d7433e', sleepySide: 'assets-v8-side-bird-{key}-sleepy-side-{n}.svg?v=12d7433e', alarmLg: 'assets-v8-badge-lg-badge-alarm.svg?v=46004089',
    eggBadgeLg: 'assets-v8-badge-lg-badge-egg-{n}.svg?v=12d7433e', chestClosed: 'assets-v8-chest-closed.svg?v=fb531d60', chestOpen: 'assets-v8-chest-open.svg?v=12bd8948', bossNode: 'assets-v8-map-node-boss.svg?v=721267cb',
    flame: 'assets-v8-streak-flame-{n}.svg?v=12d7433e', hatchMs: 450, wakeMs: 400, magpieName: '까미',
    sfx: { 'egg-crack': 'assets-v8-sfx-egg-crack.mp3', hatch: 'assets-v8-sfx-hatch.mp3', 'alarm-ring': 'assets-v8-sfx-alarm-ring.mp3', wake: 'assets-v8-sfx-wake.mp3',
      'chest-open': 'assets-v8-sfx-chest-open.mp3', 'boss-clear': 'assets-v8-sfx-boss-clear.mp3', 'streak-up': 'assets-v8-sfx-streak-up.mp3' },
    debut: [81, 100, 141, 161, 200] },
  // v8.2 (GDD v8 §5, DESIGN 20.11-20.16). HIDDEN: only used when features.v82 is on.
  v82: { magpie: 'assets-v8-booster-magpie.svg?v=0158d6f8', magpieBird: 'assets-v8-bird-magpie.svg?v=bbce23d3', crown: 'assets-v8-badge-crown.svg?v=94da006f', featherEvent: 'assets-v8-icon-feather-event.svg?v=33d8476e', bomb: 'assets-v8-badge-bomb.svg?v=b9e0fdda',
    thorn: 'assets-v8-perch-thorn.svg?v=e032734e', ice: 'assets-v8-perch-ice-overlay.svg?v=35bf9764', thaw: 'assets-v8-fx-thaw.svg?v=cc319e0e', defuse: 'assets-v8-fx-bomb-defuse.svg?v=45d3fad6', sheetArt: 'assets-v8-sheet-booster.svg?v=04db0948', failMs: 650,
    sfx: { 'bomb-tick': 'assets-v8-sfx-bomb-tick.mp3', defuse: 'assets-v8-sfx-defuse.mp3', 'fail-soft': 'assets-v8-sfx-fail-soft.mp3', 'ice-crack': 'assets-v8-sfx-ice-crack.mp3', swap: 'assets-v8-sfx-swap.mp3' } },
  economy82: { magpie: 60, moves5: 40, movesGive: 5, featherTiers: [10, 25, 50], featherCoins: [30, 60, 120], challengeK: 1.3, crownCoins: 10 },
  lastStage: 200 // playable stages in js-stages.js (31+ from tools/gen-stages.js, STAGES.md v1.1)
};
//@qa-start (v8.1 review switch: web/dev only — the toss build strips it, so toss follows features.v81 alone)
SP.CONFIG.v81Toggle = true;
//@qa-end
//@qa-start (v8.1.3: web/flat only — the toss build strips this whole switch; tools/build-release.js fails if any of it survives)
// v8.1.3: v8.1 ships ON (features.v81 = true). index.html?v81=0 turns it off for this page session only (planner / QA comparison):
// nothing is written, and a stored legacy 'settings.ff.v81' value is ignored — the shipped default always wins.
(function () { var F = SP.CONFIG && SP.CONFIG.features; if (!F || SP.CONFIG.v81Toggle !== true) return; try {
  var q = typeof location !== 'undefined' && /[?&]v81=([01])/.exec(location.search); if (q) F.v81 = q[1] === '1';
} catch (e) {} })();
//@qa-end
//@qa-start (v8.2: HIDDEN — web/flat only, stripped from toss; build-release.js fails if v82Toggle / v82= survive)
// index.html?v82=1 turns on v8.2 (thorn/bomb/ice, 까미, 깃털 이벤트, 도전 모드, 기믹 가이드) + M3' egg brooding for this page session only.
// &brood=0 keeps the v8.1 egg rule. Nothing is written to storage.
SP.CONFIG.v82Toggle = true;
(function () { var F = SP.CONFIG && SP.CONFIG.features; if (!F || SP.CONFIG.v82Toggle !== true) return; try {
  var q = typeof location !== 'undefined' && /[?&]v82=([01])/.exec(location.search); if (q && q[1] === '1' && F.v81) { F.v82 = true; F.eggBrood = !/[?&]brood=0/.test(location.search); F.keyBury = F.eggBrood && !/[?&]keys=0/.test(location.search); } } catch (e) {} })();
//@qa-end
(function () { var C = SP.CONFIG; if (C.features.v81 && C.features.v82 && C.v8 && C.v82) for (var k in C.v82.sfx) C.v8.sfx[k] = C.v82.sfx[k]; })(); // v8.2 sfx (hidden flag)
(function () { var C = SP.CONFIG; if (C.features.v81 && C.v8 && C.v81) for (var k in C.v81.sfx) C.v8.sfx[k] = C.v81.sfx[k]; })(); // v8.1 sfx overrides
//@qa-start (v8.0.1: web/flat only — tools/build-release.js strips this block from the toss build)
// Hidden QA practice mode for planner / QA: index.html?qa=bsp8&stage=N opens stage N directly. The save is read-only in this mode:
// every localStorage write is dropped for the whole page life (stars, coins, progress, free counts, red dot, v8paid … untouched).
(function () { if (typeof location === 'undefined' || typeof window === 'undefined' || window.SP_BUILD === 'toss') return;
  var m = /[?&]qa=bsp8(?:&|$)/.test(location.search) && /[?&]stage=(\d+)/.exec(location.search); if (!m) return;
  SP.QA = { stage: +m[1] }; var noop = function () {}; try { Storage.prototype.setItem = noop; Storage.prototype.removeItem = noop; Storage.prototype.clear = noop; } catch (e) {} })();
//@qa-end
// v8.1.2: the ONE day key for everything date-based (daily challenge, streak, free perch/hint reset, red dot, map seen):
// device-local calendar date 'YYYY-MM-DD' (rolls over at local midnight). Never toISOString / UTC.
SP.day = (function () {
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  // legacy -> key: 'YYYY-M-D' (unpadded) or a full ISO/UTC timestamp ('2026-10-25T15:30:00.000Z' -> that instant's local date) or ms number
  function norm(v) {
    if (typeof v === 'number' && isFinite(v) && v > 0) return key(new Date(v));
    if (typeof v !== 'string' || !v) return v;
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v); if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) { var d = new Date(v); if (!isNaN(d)) return key(d); }
    return v; }
  return { key: key, norm: norm };
})();
if (typeof module !== 'undefined') module.exports = SP;
