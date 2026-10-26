// Central config: palette/assets/difficulty. Designer (docs-DESIGN.md, assets/) can replace values here only.
var SP = window.SP = window.SP || {};
SP.CONFIG = {
  capacity: 4,
  // Palette from docs-DESIGN.md / assets-palette.json (color + symbol SVG per ball). Order = color index.
  palette: [{"key":"red","hex":"#E53935","symbol":"circle","file":"assets-birds-bird-red-idle.svg?v=0d8ccf3a","fileLargeSymbol":"assets-birds-badge-lg-red.svg?v=0f989262"},{"key":"orange","hex":"#FB8C00","symbol":"star","file":"assets-birds-bird-orange-idle.svg?v=e83af7b6","fileLargeSymbol":"assets-birds-badge-lg-orange.svg?v=adc1b1a4"},{"key":"yellow","hex":"#FDD835","symbol":"triangle","file":"assets-birds-bird-yellow-idle.svg?v=b7da37e4","fileLargeSymbol":"assets-birds-badge-lg-yellow.svg?v=cdc14e8f"},{"key":"green","hex":"#27A272","symbol":"square","file":"assets-birds-bird-green-idle.svg?v=046a8e76","fileLargeSymbol":"assets-birds-badge-lg-green.svg?v=f3810130"},{"key":"cyan","hex":"#1FC8DA","symbol":"diamond","file":"assets-birds-bird-cyan-idle.svg?v=42323966","fileLargeSymbol":"assets-birds-badge-lg-cyan.svg?v=95420207"},{"key":"blue","hex":"#1E63E5","symbol":"plus","file":"assets-birds-bird-blue-idle.svg?v=8fd77c04","fileLargeSymbol":"assets-birds-badge-lg-blue.svg?v=0f0b7a73"},{"key":"purple","hex":"#870488","symbol":"heart","file":"assets-birds-bird-purple-idle.svg?v=3ad19749","fileLargeSymbol":"assets-birds-badge-lg-purple.svg?v=15695418"},{"key":"white","hex":"#ECEFF1","symbol":"ring","file":"assets-birds-bird-white-idle.svg?v=25da1a93","fileLargeSymbol":"assets-birds-badge-lg-white.svg?v=a43c448a"},{"key":"pink","hex":"#AE507E","symbol":"moon","file":"assets-birds-bird-pink-idle.svg?v=d2e3d0d6","fileLargeSymbol":"assets-birds-badge-lg-pink.svg?v=2e021b33"},{"key":"brown","hex":"#451B00","symbol":"hexagon","file":"assets-birds-bird-brown-idle.svg?v=ddc327f4","fileLargeSymbol":"assets-birds-badge-lg-brown.svg?v=04568f1c"},{"key":"lime","hex":"#ABD494","symbol":"x","file":"assets-birds-bird-lime-idle.svg?v=327a9777","fileLargeSymbol":"assets-birds-badge-lg-lime.svg?v=ff7000fa"},{"key":"indigo","hex":"#0000DB","symbol":"drop","file":"assets-birds-bird-indigo-idle.svg?v=7b28079f","fileLargeSymbol":"assets-birds-badge-lg-indigo.svg?v=f1d4fab8"}],
  assets: { badge: 'assets-v5ui-rec-badge-complete.svg?v=e8cb50af' },
  gimmickAssets: {"hidden":{"file":"assets-gimmicks-ball-hidden.svg?v=c8f4f371","fileLargeSymbol":"assets-birds-badge-lg-hidden.svg?v=062ae845","tone":"#5B6070"},"pair":{"Ka":{"pair":"a","symbol":"circle","keyBall":"assets-gimmicks-ball-key-a.svg?v=9de38343","keyBallLargeSymbol":"assets-birds-badge-lg-key-a.svg?v=0392f131","lock":"assets-gimmicks-lock-a.svg?v=c319f343","lockOpen":"assets-gimmicks-lock-a-open.svg?v=a6a3309f"},"Kb":{"pair":"b","symbol":"triangle","keyBall":"assets-gimmicks-ball-key-b.svg?v=6542710e","keyBallLargeSymbol":"assets-birds-badge-lg-key-b.svg?v=6a794f4f","lock":"assets-gimmicks-lock-b.svg?v=9c174ea5","lockOpen":"assets-gimmicks-lock-b-open.svg?v=66a68a11"},"Kc":{"pair":"c","symbol":"square","keyBall":"assets-gimmicks-ball-key-c.svg?v=768cb7bd","keyBallLargeSymbol":"assets-birds-badge-lg-key-c.svg?v=49b009d3","lock":"assets-gimmicks-lock-c.svg?v=149c2b2a","lockOpen":"assets-gimmicks-lock-c-open.svg?v=40ce70a4"}},"lockedTubeOverlay":"assets-gimmicks-tube-locked-overlay.svg?v=a5fbed2d","smallTube":{"capacity":3,"file":"assets-gimmicks-tube-small.svg?v=d8fc240a","badge":"assets-gimmicks-badge-capacity-3.svg?v=aa8836be","countsForClear":false}},
  // DESIGN ch.14 birds + wooden perches (assets-birds, birds.json / perch/perch.json; files referenced, not modified)
  birds: { pattern: 'assets-birds-bird-{color}-{frame}.svg?v=580eb50d', frames: ['up', 'mid', 'down', 'mid'], foldFrame: 'fold', frameMs: 60, liftMs: 120, landMs: 260, flightMin: 350, flightMax: 450,
    // DESIGN 15.1-15.2 side-view flap frames (facing right; .bird-side--left mirrors, except hidden). enabled = all files present (tools/sync-art.js).
    side: { pattern: 'assets-birds-side-bird-{key}-side-{n}.svg?v=580eb50d', frames: [1, 2, 3, 4], frameMs: 62.5, enabled: true },
    hidden: 'assets-birds-bird-hidden.svg?v=dd67d9ad', key: 'assets-birds-bird-key-{pair}.svg?v=580eb50d',
    expr: function (c, e) { return 'assets-birds-bird-' + SP.CONFIG.palette[c].key + '-' + e + '.svg?v=580eb50d'; },
    perch: { perch: 'assets-birds-perch-perch.svg?v=e14107a5', perchSmall: 'assets-v5ui-rec-perch-small.svg?v=110de3e4', perchLocked: 'assets-v5ui-rec-perch-locked.svg?v=da6f889d', perchSmallLocked: 'assets-v5ui-rec-perch-small-locked.svg?v=3356beb6', perchComplete: 'assets-v5ui-rec-perch-complete.svg?v=cdf0ce1e' } },
  // DESIGN 15.3 / assets-themes-themes.json: themeIndex = floor((stage-1)/100) % 3 -> class .theme-<key> on <body> (backgrounds in assets-theme.css)
  themes: [{ key: 'forest', name: '숲' }, { key: 'sunset', name: '노을 호수' }, { key: 'snow', name: '눈 내린 밤' }],
  // DESIGN ch.16 saga map (assets-map-map-layout.json mirrored here so file:// works without fetch; nodes from the path formula
  // x = 195 + 105*sin(2π*y/450), y = 855 - 90*i, chunk-top origin, 390px wide).
  map: { w: 390, chunkH: 900, bandH: 450, per: 10, chunk: 'assets-map-map-chunk-{key}.svg?v=580eb50d', band: 'assets-map-map-band-{from}-{to}.svg?v=580eb50d', wide: { bleed: 195, chunk: 'assets-map-map-chunk-{key}-wide.svg?v=580eb50d', band: 'assets-map-map-band-{from}-{to}-wide.svg?v=580eb50d', soon: 'assets-map-map-band-coming-soon-{key}-wide.svg?v=580eb50d' } }, // v7 B7: designer wide art (195px bleed each side) fills the whole panel
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
  features: { v80: true, v81: false, v82: false },
  // v8 economy: every price / cap in one place (GDD v8 §7 숫자 요약)
  economy: { undo3: 30, undo3Gives: 3, perch: 50, hint: 20, perchMaxPerStage: 2, freeHintsPerStage: 1, freeHintUnlimitedTo: 10, freePerchPerDay: 3,
    comboCoins: { 2: 5, 3: 5, 4: 10 }, comboCap: 30, comboUndoAt: 3, comboTokenAt: 4, tokenMax: 3, coinMax: 99999, noUndo3Bonus: 5 },
  // v8.0 art (DESIGN ch.20, assets-v8- — designer files, read-only for dev)
  v8: { surprised: 'assets-v8-bird-{key}-surprised.svg?v=580eb50d', revealMs: 400, cageBadgeLg: 'assets-v8-badge-lg-badge-cage-{n}.svg?v=580eb50d', feather: 'assets-v8-badge-feather.svg?v=4076399d',
    coinBtn: 'assets-v8-icon-coin-btn.svg?v=0c045867', adBadge: 'assets-v8-badge-ad.svg?v=9965e9c7', token: 'assets-v8-token-perch.svg?v=2bbac79c', stuckArt: 'assets-v8-sheet-stuck.svg?v=37a59aa1', chipHidden: 'assets-v8-chip-hidden-icon.svg?v=d94d413e',
    sfx: { 'coin-spend': 'assets-v8-sfx-coin-spend.mp3', 'combo-reward': 'assets-v8-sfx-combo-reward.mp3', 'cage-tick': 'assets-v8-sfx-cage-tick.mp3', 'cage-open': 'assets-v8-sfx-cage-open.mp3', 'reveal-pop': 'assets-v8-sfx-reveal-pop.mp3', stuck: 'assets-v8-sfx-stuck.mp3' },
    debut: [22, 31, 61, 101, 121], stuckToastAfter: 3 },
  lastStage: 200 // playable stages in js-stages.js (31+ from tools/gen-stages.js, STAGES.md v1.1)
};
if (typeof module !== 'undefined') module.exports = SP;
