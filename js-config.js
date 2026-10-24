// Central config: palette/assets/difficulty. Designer (docs-DESIGN.md, assets/) can replace values here only.
var SP = window.SP = window.SP || {};
SP.CONFIG = {
  capacity: 4,
  // Palette from docs-DESIGN.md / assets-palette.json (color + symbol SVG per ball). Order = color index.
  palette: [{"key":"red","hex":"#E53935","symbol":"circle","file":"assets-ball-red.svg","fileLargeSymbol":"assets-large-symbol-ball-red.svg"},{"key":"orange","hex":"#FB8C00","symbol":"star","file":"assets-ball-orange.svg","fileLargeSymbol":"assets-large-symbol-ball-orange.svg"},{"key":"yellow","hex":"#FDD835","symbol":"triangle","file":"assets-ball-yellow.svg","fileLargeSymbol":"assets-large-symbol-ball-yellow.svg"},{"key":"green","hex":"#8CF09E","symbol":"square","file":"assets-ball-green.svg","fileLargeSymbol":"assets-large-symbol-ball-green.svg"},{"key":"cyan","hex":"#00ACC1","symbol":"diamond","file":"assets-ball-cyan.svg","fileLargeSymbol":"assets-large-symbol-ball-cyan.svg"},{"key":"blue","hex":"#1E63E5","symbol":"plus","file":"assets-ball-blue.svg","fileLargeSymbol":"assets-large-symbol-ball-blue.svg"},{"key":"purple","hex":"#8E24AA","symbol":"heart","file":"assets-ball-purple.svg","fileLargeSymbol":"assets-large-symbol-ball-purple.svg"},{"key":"white","hex":"#ECEFF1","symbol":"ring","file":"assets-ball-white.svg","fileLargeSymbol":"assets-large-symbol-ball-white.svg"},{"key":"pink","hex":"#AE507E","symbol":"moon","file":"assets-ball-pink.svg","fileLargeSymbol":"assets-large-symbol-ball-pink.svg"},{"key":"brown","hex":"#6C2D18","symbol":"hexagon","file":"assets-ball-brown.svg","fileLargeSymbol":"assets-large-symbol-ball-brown.svg"},{"key":"lime","hex":"#A6DC61","symbol":"x","file":"assets-ball-lime.svg","fileLargeSymbol":"assets-large-symbol-ball-lime.svg"},{"key":"indigo","hex":"#1D1DBD","symbol":"drop","file":"assets-ball-indigo.svg","fileLargeSymbol":"assets-large-symbol-ball-indigo.svg"}],
  assets: { badge: 'assets-badge-complete.svg' },
  gimmickAssets: {"hidden":{"file":"assets-gimmicks-ball-hidden.svg","fileLargeSymbol":"assets-large-symbol-gimmicks-ball-hidden.svg","tone":"#5B6070"},"pair":{"Ka":{"pair":"a","symbol":"circle","keyBall":"assets-gimmicks-ball-key-a.svg","keyBallLargeSymbol":"assets-large-symbol-gimmicks-ball-key-a.svg","lock":"assets-gimmicks-lock-a.svg","lockOpen":"assets-gimmicks-lock-a-open.svg"},"Kb":{"pair":"b","symbol":"triangle","keyBall":"assets-gimmicks-ball-key-b.svg","keyBallLargeSymbol":"assets-large-symbol-gimmicks-ball-key-b.svg","lock":"assets-gimmicks-lock-b.svg","lockOpen":"assets-gimmicks-lock-b-open.svg"},"Kc":{"pair":"c","symbol":"square","keyBall":"assets-gimmicks-ball-key-c.svg","keyBallLargeSymbol":"assets-large-symbol-gimmicks-ball-key-c.svg","lock":"assets-gimmicks-lock-c.svg","lockOpen":"assets-gimmicks-lock-c-open.svg"}},"lockedTubeOverlay":"assets-gimmicks-tube-locked-overlay.svg","smallTube":{"capacity":3,"file":"assets-gimmicks-tube-small.svg","badge":"assets-gimmicks-badge-capacity-3.svg","countsForClear":false}},
  // DESIGN ch.14 birds + wooden perches (assets-birds, birds.json / perch/perch.json; files referenced, not modified)
  birds: { pattern: 'assets-birds-bird-{color}-{frame}.svg', frames: ['up', 'mid', 'down', 'mid'], foldFrame: 'fold', frameMs: 60, liftMs: 120, landMs: 260, flightMin: 350, flightMax: 450,
    // DESIGN 15.1-15.2 side-view flap frames (facing right; .bird-side--left mirrors, except hidden). enabled = all files present (tools/sync-art.js).
    side: { pattern: 'assets-birds-side-bird-{key}-side-{n}.svg', frames: [1, 2, 3, 4], frameMs: 62.5, enabled: true },
    hidden: 'assets-birds-bird-hidden.svg', key: 'assets-birds-bird-key-{pair}.svg',
    expr: function (c, e) { return 'assets-birds-bird-' + SP.CONFIG.palette[c].key + '-' + e + '.svg'; },
    perch: { perch: 'assets-birds-perch-perch.svg', perchSmall: 'assets-birds-perch-perch-small.svg', perchLocked: 'assets-birds-perch-perch-locked.svg', perchSmallLocked: 'assets-birds-perch-perch-small-locked.svg', perchComplete: 'assets-birds-perch-perch-complete.svg' } },
  // DESIGN 15.3 / assets-themes-themes.json: themeIndex = floor((stage-1)/100) % 3 -> class .theme-<key> on <body> (backgrounds in assets-theme.css)
  themes: [{ key: 'forest', name: '숲' }, { key: 'sunset', name: '노을 호수' }, { key: 'snow', name: '눈 내린 밤' }],
  freeUndos: 3,
  stars: { three: 1.2, two: 1.6, threeFrom21: 1.1, threeFrom101: 1.15 }, // GDD v0.2: 21+ 1.1x; STAGES.md: 101+ 1.15x (gimmick slack)
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
  lastStage: 200 // playable stages in js-stages.js (31+ from tools/gen-stages.js, STAGES.md v1.1)
};
if (typeof module !== 'undefined') module.exports = SP;
