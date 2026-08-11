# Design QA

## Source of visual truth

- Reference screenshot: `C:\Users\Administrator\.codex\attachments\85100bee-3171-42d4-ae6f-d7024e43e035\image-1.png`
- Reference recording: `C:\Users\Administrator\Desktop\5b7dd94bc3d5e82eecc72251352b4241.mp4`
- Implementation URL: `http://localhost:7456/`
- Tested game viewport: 390 x 845 CSS px (iPhone 14 Pro preset; the raw browser capture includes a 50 px Cocos preview toolbar)
- Tested state: active gameplay after one manual model pick

## Required fidelity surfaces

- Typography: compact numeric timer, legible Chinese prop labels, and consistent high-contrast hierarchy.
- Layout: fixed seven-slot 2D collection tray and fixed three-button prop dock; gameplay remains a separate 3D layer.
- Responsive behavior: the 720 px artboard scales down uniformly inside the 390 px phone viewport without horizontal clipping.
- Color: warm wood/red playfield, jade models, off-white tray, and yellow prop controls preserve the reference hierarchy.
- Image quality: slot icons are transparent renders generated from the project's actual GLB models, not generic symbols.
- Content: pause, timer, progress, seven collection slots, and three consumable props all remain visible on mobile.

## Interaction checks

- Empty tray is shown on startup; no test-only automatic pick remains.
- Randomized 66-item initialization was reloaded three consecutive times at the 390 x 845 phone viewport; every visible model remained inside the wooden container with screen-edge clearance.
- The container now has a floor plus four tall static collision walls, a short-cycle escape fallback, and real Mesh world-bounds correction for GLB roots whose visual center differs from the physics node.
- Manual model pick animates a rendered model thumbnail into the next fixed slot.
- Pause and resume update the overlay and block gameplay as expected.
- The remove prop restores collected models to the 3D pile, removes their tray thumbnails, and decrements its badge.
- Browser console errors after the final interaction pass: none.
- Background/resume timing uses a capped frame delta, so a suspended mobile tab cannot consume several minutes in one resumed frame.
- Pile stability regression: after natural settling, all remaining model colliders switch from dynamic to kinematic and remain position-stable. Picking no longer restores dynamic physics for the pile; only the 1–2 items directly above the removed support receive a controlled 0.36 s micro-settle (max 6.5 cm, max 1.4° tilt). Two consecutive manual picks showed no movement in the untouched regions, and the post-settle frames remained position-identical.
- Final local-settle interaction pass: tested center and upper-pile picks in the iPhone 14 Pro preview; distant items stayed fixed, no collision-chain shake occurred, and browser console errors remained at zero.
- Collection tray centering regression: measured the non-transparent bounds of all 11 rendered model icons, corrected each asset's canvas offset at render time, and uniformly fitted visible content into a 62×52 safe area. Filled all seven slots in the iPhone 14 Pro preview with mixed round, tall, wide, and irregular items; every visible model was centered horizontally and vertically with no slot-edge overflow.
- Collection icon completeness regression: fixed the Blender parent-scale centering order and fitted the orthographic camera from the final camera-space bounds with 18% padding, then regenerated all 11 icons from their source GLBs. Alpha-bound checks confirmed no icon touches any 192×192 image edge; a seven-slot phone-preview pass showed complete rings, plaques, bangles, figures, and irregular models with zero console errors.
- Landscape gameplay regression: verified the 1280 x 720 web viewport with the HUD fitted to a centered 720 x 1280 safe artboard. The full wooden container remains visible, while the tray and all three props stay grouped below it instead of covering the pile or drifting to the screen edges.
- Atomic prop regression: triggered the magnet prop and immediately clicked a pile item during its scheduled picks. The manual click was ignored until the transaction completed; exactly three matching items cleared, progress advanced to 13%, the tray returned to empty, and the prop count decremented once.
- Daily-attempt gate regression: exhausted the local daily count, reloaded, and confirmed that no pile spawned before the refill action. The MVP ad action granted one attempt and started exactly one round, with no browser warnings or errors.
- Difficulty-curve regression: rebuilt level 1 with a 240-second limit and verified the timer starts at 4:00. The five configured levels now increase total time with item count while decreasing seconds per item monotonically.
- Seeded-initial-condition regression: reloaded level 1 twice with seed 104729 and confirmed the same configured item stream and spawn parameters. Final Bullet settling is intentionally not treated as pixel-deterministic because frame timing can amplify contact-order differences.
- Tray-danger regression: filled the tray with five non-matching items and confirmed a thin orange-red edge appears without covering icons; the edge strengthened at six items, and browser warnings/errors remained at zero.
- Result-dialog spacing regression: forced a seven-slot loss with the dual rescue/retry actions visible and verified an 18-art-pixel gap between the history-best line and button faces, plus 24 pixels below the button shadows. Text, borders, and shadows no longer touch or clip.
- Home-screen pass: with local storage cleared, the round no longer starts on load. The title panel shows the daily theme, the level banner (`第 1 关 · 24 件 · 4:15`), the two-line rule text, the daily attempts left and the per-level best, and the header timer already reads the level limit instead of `0:00`. Tapping 开始挑战 consumes the attempt and spawns the pile.
- Score/combo pass: three same-type picks scored 100 at combo ×1; a second group inside the combo window scored 200 at combo ×2 (total 300, progress 25%). The header score pill pops on each gain and the `+N / 连击 ×N` float renders above the tray; a second float now replaces the previous one instead of stacking.
- First-play hint pass: on a fresh profile, three matching items were ringed automatically ~2 s after the pile settled. In play, six idle seconds re-ring a completable group, and any pick or prop use clears the rings and resets the idle timer.
- Pause-menu pass: the pause key now opens 继续游戏 / 重开本关 / 音效 开关 over a full-screen mask, the header icon flips to ▶, and the sound toggle rewrites its own label and persists to local storage.
- Result-dialog content pass: a timed-out round showed 差一点… with the `时间到了` reason line, the star row, `完成度 25%`, a counted-up `得分 300`, the previous record (`历史最佳 — 0% · 0 分`, taken before the new record is written), the 新纪录! badge and the rescue/retry pair, all inside the taller 548×490 panel.
- Browser console errors across the home → play → match → pause → result passes: none.
- High-DPI HUD-anchor regression: `camera.worldToScreen` returns framebuffer (physical) pixels while the HUD canvas runs in logical pixels, so `screenToContent` was scaling every 3D-anchored overlay by the device pixel ratio. At a 390x845 viewport with `devicePixelRatio = 2`, hint rings, pick bursts, the goose speech bubble and the tray fly-in start point all landed off the pile; the pixel-diff ground-truth pass now shows ring centres sitting on fruit (saturation 166-200 versus roughly 40 for the wicker background) at both dpr 1 and dpr 2. Touch picking was already self-consistent in physical pixels and is unchanged.
- Pointer-accuracy regression: clicking the highest visible item ten times picked exactly that item every time at dpr 1 (0.0 px deviation) and the pixel-diff pass confirms the changed screen region covers the click point at both dpr 1 and dpr 2.
- Combo-visibility pass: the combo pill under the score chip fades in at combo x2, rewrites its multiplier, drains a 118 px window bar over the 4.5 s combo window and hides itself when the window lapses or the round ends. A driven run reached combo x7.
- Near-match pass: collecting a second item of the same kind flashes a gold outline on exactly those two slots, re-resolved at flash time so rapid picks cannot ring the wrong slots.
- Win-closure pass: a full clear now fires the gold confetti burst before the dialog, converts the remaining time into score at 2 points per second, and the result panel reads `胜 利 !` / `得分 3478` / `含时间奖励 +478` / `获得 3 件道具奖励` / `下一关`. The always-100% `完成度` line is dropped on wins and kept on losses.
- Deadlock pass: when neither the tray remainder nor the pile can complete any triple, a player holding the remove prop gets a nudge plus the toast `没有能凑齐的组合了，用「移出」腾格` and the round continues; with no prop the round ends immediately as `剩下的物件配不出三个了` instead of running the clock out, and rescue now returns three items (adding 60 s cannot resolve a deadlock).
- Scene-cleanup pass: `main.scene` still carried three empty nodes whose prefab assets no longer exist anywhere in the project, which logged `Failed to load prefab asset for node 'New Node'` on every boot. They held no name, components or children, and the camera, light and `GameManager` are all built in code by `Bootstrap`, so they were detached from the scene root. Browser console across the home, play, combo, win and deadlock passes is now completely clean at both dpr 1 and dpr 2.
- Scoring-rule pass: the home rules now state that chained clears multiply the score and that leftover time counts, so the combo pill and the time bonus are both explained before the first round. Measured at level 1 and level 2 (390x845, dpr 2): the two rule lines each fit on one line, and the level-2 rock warning sits clear of both the rules above and the start button below.
- Distractor-teaching pass: picking a rock now raises `石头凑不成三个，会一直占着格子` at the moment of the mistake, once per round, and resets on level reset. The home warning alone was off-screen by the time the mistake happened.
- Combo-audio pass: the match sound now scales from 0.79 to 1.0 with the combo count, played after `addMatchScore` so the volume reflects the combo the player just earned (`playOneShot` has no pitch control).
- Button-depth pass: every HUD button (pause, skin, the three props, and all dialog buttons) now shares one `makeDockButton` / `makeButton` structure — a hit node that owns Widget placement, a non-moving drop shadow, and a `paintFace` face layer built from the fill colour alone (flat base, thin darker bottom edge, top gloss, dark outline). Pressing sinks the face 4-6 px into its own shadow and scales it to 0.97, so the feedback reads as "pressed in" instead of "pinched". The face has to be a child of the Widget node: Widget rewrites the outer node's position every frame and would erase the sink offset. Verified at 390x845 / dpr 2 across home, play, prop press, skin panel and pause menu, with zero console errors.
- Prop-legibility pass: the prop icons moved off bright green/blue/magenta (too close in value to the `#FFCA30` face to be identifiable) to deep green/red/indigo, and the count badge moved from grey-on-grey — which read as "disabled" for what is really a positive "you have N" — to a warm red disc with a cream rim. The bottom dark edge was cut from 28% to 15% of the button height and from 22% to 14% darkening, because the prop labels sit on that band and were being swallowed by it.
- Skin-card pass: four-character skin names (翡翠青玉) at 25 px ran into the two colour swatches on the left of each card; the name and status labels dropped to 23 px and shifted 4 px right, clearing the swatches on all three cards.
- H5 refill-copy pass: with no rewarded video on H5, the three "看广告 +1" surfaces were promises the build cannot keep. The daily-attempt gate now reads 今日次数用完 / 想接着玩就再续一次吧 / 再续一次 and the prop gate reads 补 1 个接着用吧 / 补 1 个; both keep their dialog slot so an ad callback can be dropped in later. Verified at 390x845 / dpr 2 that neither dialog contains 广告 or 视频, with zero console errors.
- Antique-theme pass: the second daily theme (古玩铺, jade skin) reuses the ten idle jade-era models. Two are deliberately excluded — `pingankou` is an unsaturated grey (sat 0.02) that reads as the `rock` distractor (sat 0.01) in a crowded pile, and `jingling` is a Poké Ball whose CREDITS entry bars it from shipping. Because 7 of the 13 candidates sit at hue 132-151, the family is ordered by value and silhouette instead of hue: level 1 gets gold/purple/pale-green/deep-green, and later levels add same-hue items that differ in shape. Measured across all three levels at 390x845 / dpr 2 (page reloaded per level, since `startInitialRound` does not clear the previous pile): 24/37/56 items, zero outside the 1.85 bowl radius, zero off-screen, zero console errors.
- Asset-weight pass: `resources/` is packed wholesale, so anything sitting in it ships whether referenced or not. Two dead weights were removed — `fonts/fa-solid-900.ttf` (426 KB Font Awesome, orphaned when the HUD icons were redrawn as vectors; its uuid appears in no scene, prefab or script) and `jingling` (a Poké Ball whose CREDITS entry already flagged it as un-shippable). Textures were then downscaled from 1024² on the six Tripo models that carry them; the rest are flat-colour materials with no textures at all. Colliders are code-generated Box/Cylinder fitted to the bounding box rather than mesh colliders, so texture work cannot disturb physics. `resources` fell 7.2 MB → 5.8 MB and the build 10 MB → 8.7 MB; per-texture GPU allocation drops roughly 16× (a single 1024² was costing 5.59 MB of VRAM, and eighteen of them were resident).
- BGM pass: the game had 8 sfx and no music. Synthesized rather than sourced, matching how the sfx were made and avoiding per-track licence bookkeeping: a 40 s pentatonic loop at 96 BPM with a music-box timbre (non-integer partials at 2.76× and 5.4×, which is what makes struck metal sound struck rather than organ-like). Pentatonic because it has no semitones or tritones, so it stays tolerable under long looping; 96 BPM because the round already applies time pressure and the music should not add more. Script is `scripts/gen_bgm.py`, so the track is reproducible and tweakable. Wired to a dedicated `AudioSource` (loop, volume 0.5) started from the 开始挑战 handler — the only guaranteed user gesture, without which browser autoplay policy blocks it. Verified: clip loads, loop set, ~40 s, silent by default, starts on toggle-on, stops on toggle-off, zero console errors. The pause-menu label moved from 音效 to 声音 since one switch now governs both.
- BGM loop-seam correction: the WAV is 1.7 MB, which would have eaten the whole slimming effort, so it ships as AAC via `afconvert` (201 KB). But AAC inserts priming samples — the encoded clip measures 40.12 s against a 40.00 s source, and that 120 ms of silence lands exactly on the loop seam. The original synthesis deliberately wrapped the final note's decay around to the start for seamlessness, which that silence would have cut in half — worse than not wrapping. Removed the wrap-around (in both note mixing and the reverb taps) and let the closing 4-beat note decay out inside the loop instead. Measured at the seam: last 100 ms RMS 0.0031 versus 0.0313 for the track overall, so the encoder's silence now falls inside what is already a rest.
- Unused-model extraction: four models referenced by no theme family (`mile`, `banzhi`, `yushi`, `pingankou`) were still being packed, since `resources/` ships everything it contains. Moved to `assets/models-pool/` with a README covering why they are out of the packed tree and how to bring one back; their uuids were also dropped from `ModelManifest`, which only makes sense for models that are actually loadable. Verified by grepping each uuid against the build output — zero hits for all four — and the build fell 8.7 MB → 8.2 MB (`resources` 5.8 MB → 5.3 MB). Physics and interaction regressions still pass.
- Texture-resolution calibration: a first pass put everything at 256², which measured 20.9 dB PSNR against the baseline screenshot — but that number was worthless, because Bullet settling is not pixel-deterministic and most of the difference was items landing differently, not texture loss. The diff image made the split visible: item regions differed in whole silhouettes while the static container was nearly black. Re-measured deterministically on the textures themselves, resampled to each asset's real on-screen size (containers ~320 px, items ~90 px): 256² left `basket_redwood` at 30.2 dB and the wicker weave visibly smeared into flat colour on screen. Containers moved to 512² and items stayed at 256², putting every asset at ≥35.3 dB (worst case `basket_redwood`; most sit above 43 dB) with the weave and rim highlight restored. Physics and interaction regressions re-run on the final build: three levels contained, triples score and clear, props decrement, boot screen still correct, zero console errors.
- Default-mute pass: a web page that starts playing audio on open is among the most disliked mobile-browser behaviours, and iOS/Chrome autoplay policy requires a user gesture anyway, so an unset sound flag now reads as off instead of on. Verified on a cleared profile: the fresh player starts muted with no stored key written, playing all 8 sfx while muted raises nothing, toggling on returns true and writes `'1'`, and the enabled state survives a reload. The pause-menu toggle is the only entry point, so players who want audio have to find it there.
- Engine-trim pass: the build shipped every engine module, including spine (437 KB), 2D physics, tilemap, animation and skeletal-animation that this game never imports. Verified from the sources first — the 51 `cc` symbols in use, plus every GLB checked for `animations`/`skins`/`meshopt` (none has any) — then reduced `includeModules` to 12. Combined with a release build and `nativeCodeBundleMode=wasm` (dropping the 919 KB asm.js fallback; the iPhone 8 / Snapdragon-6 floor machines all support WebAssembly), `_virtual_cc` fell 6.9 MB → 1.8 MB, the whole output 18 MB → 10 MB, and total js 730 KB → 522 KB gzipped. Re-ran the full interaction regression against the built artifact: GameManager boots, all 8 sfx load, HUD Graphics nodes render, a triple scores and clears the tray, and the shuffle prop decrements — zero console errors.
- Boot-screen pass: H5 has no minigame-style predownload, so the engine bundle used to transfer against a blank white page. The web-mobile build template now carries an inline loading screen (styled in `<head>`, so it paints with the first HTML packet rather than waiting on style.css) that reports real milestones through `window.__gooseBoot`: engine bundle arriving, `window.cc` present (48%), scene skeleton built from `Bootstrap` (72%), home screen interactive from `GameManager.start()` (done). Between milestones the bar interpolates so it eases rather than jumping. Verified under 1.5 Mbps / 150 ms throttling: the overlay is present at the first 250 ms sample, the bar advances through 3% → 48% → 100%, the hint text walks 正在加载引擎 → 正在初始化场景 → 开始游戏, and the node is removed after the fade. An injected probe confirmed both game-side milestones fire. The 12 s "网络较慢" fallback also triggered correctly, because the local `http.server` sends no gzip and therefore ships the full 1.8 MB — a real host with compression transfers roughly a third of that.
- Verification-environment correction: the first runs of the trim regression were served on port 7456, which is Cocos Creator's own preview server, not the built artifact — the `python3 -m http.server 7456` behind it had silently failed on a bound port. Source-level changes (copy, theme) were still valid there since preview reads project sources, but the trim result was not. Everything above was re-run on port 7460 against `build/verify` and passed there.
- Mobile-browser pass: the template stylesheet now sets `overscroll-behavior: none` (Android Chrome pull-to-refresh fires when dragging items down off the pile), `touch-action: manipulation` (iOS ignores `user-scalable=no` since iOS 10, so double-tap zoom and the 300 ms tap delay had to go), and `position: fixed` + `overflow: hidden` on `html` so the collapsing address bar stops reflowing the canvas. Page background moved to the loading screen's `#271b17` so no grey edge flashes during canvas resize.
- Jade-backdrop pass: `bg_jade` is itself a wall of jade curios, so antique items read as continuous with the background and the painted decorations looked pickable. The jade skin is now the one skin with a non-white backdrop tint (140,145,142, ~55% value), which pushes the art back while lit 3D items stay bright. Cross-checked both families against both skins: fruit-on-jade improved as well, and no combination lost foreground separation. Known limitation, not introduced here — a player who manually switches the antique theme to the redwood skin will see gold `yuanbao`/`tongqian` blend into the yellow wicker floor; the theme's own skin (jade) has a pale bowl that keeps them legible.
- Button-and-icon material pass: every face was three flat same-hue blocks stacked, so the colour stepped across two hard horizontal lines and read as a sticker; the icons each used their own proportions, with stroke widths ranging from 0.06 to 0.19 of the glyph size, so a row of them had no common weight. `Graphics` has no gradient API, so `fillVGradient` slices a shape into per-row bands and shrinks each band to the round-rect outline it sits in — a real vertical gradient that cannot spill past the corners. `paintFace` is now gradient → bottom inner shadow → top glaze → outline, with the lit end pushed toward warm white and the shadowed end toward red-brown rather than plain white/black mixing; that bias is where most of the candy-plastic read comes from. A new `paintPanel` gives the same treatment, much weaker, to every panel (`makePanel`/`makePanelChild`), covering the timer, level and score plates, the progress groove and its fill, the tray and its seven slots, and the redwood console. Icons were redrawn on one 24×24 grid (`U = size/24`) with the mass inside an 18×18 box and only two stroke weights; the magnet became a solid horseshoe with protruding pole shoes, since the stroked version reads as a capital U at 40 px. Four self-inflicted defects were caught and fixed by screenshot during the pass: the top rim light drawn as a full loop (a cheap white box outline — now top-edge only), the bottom shadow band sized at a fixed `w-10` (two little ears poking out of the bottom corners — now inset by the round-rect geometry at that height), that band's top colour being lighter than the face bottom (it read as a drawer pull — now an alpha fade), and a uniform panel rim light (a dirty white strip on the pale tray slots and dialog panels — now scaled by the fill's luma, and skipped entirely above 150 px tall). Verified in-engine against `build/verify` at 390×845 dpr 2 across home, play, sound-on, pause and skin-panel screens; the only console errors are two `favicon.ico` 404s from the local server.
- Sound-key pass: default-mute left the toggle buried in the pause menu, which is a place a player only visits to quit or restart — so the reasonable reading of the shipped build was that the game has no audio at all. A third dock key now sits under 暂停 / 换肤 at the same 66² size and palette, drawn as a new `sound-on` / `sound-off` glyph. Both states are one `fill`: the speaker outline plus either two chevron waves or a cross, each expanded into a filled polygon rather than stroked, because `Graphics` keeps its path across a `fill()` and a following `stroke()` would have re-outlined the speaker body. `GameManager.toggleSound` is now the single entry point for both the dock key and the menu switch, so the icon cannot drift from the stored flag; `AudioMan` is constructed after the HUD, so the key paints muted and is corrected from the save on the next line. Verified against `build/verify`: the key renders in both states, tapping it writes `'1'`/`'0'` and starts/stops the 40 s BGM source (`playing` true → state 3), toggling from the pause menu flips the dock icon too, and the only console errors in the run are two `favicon.ico` 404s from the local `http.server`.

## Findings and iteration history

- Pass 1: the former world-space collection area behaved like another 3D object and did not adapt cleanly to phone proportions. Replaced it with a responsive screen-space HUD.
- Pass 2: a multi-camera 3D slot representation could be occluded and did not reliably match the recording. Replaced it with transparent thumbnails rendered from the real models.
- Pass 3: verified the final phone viewport, fixed slot geometry, prop interactions, pause flow, model pick flow, and console state.
- Boundary regression: aligned the visible wooden container, physical fence, orthographic phone camera, spawn area, remove return area, and shuffle area to the same rectangular bounds; repeated randomized initialization produced no clipped or escaped items.
- Button-surface pass 2: the six on-screen keys (top-left pause/skin/sound column, bottom prop row) still read as stickers, and four separate causes were isolated from pixel crops. (1) The top gloss was cut into equal-width horizontal strips whose middle rows still carried ~40% alpha across the full face width, leaving two dead-straight vertical seams down each button; it is now a rounded capsule built from 11 nested layers at alpha 17, so every edge is feathered. (2) The drop shadow was one hard-edged solid `roundRect`, which reads as a duplicate of the same sticker; `paintShadow` now stacks one opaque plate plus three 1.8 px spreads at alpha 42. (3) Added a top rim line and a weaker bottom bounce line, both traced along part of the rounded-rect outline via `edgePath` (polyline, not `Graphics.arc` — the `counterclockwise` flag is defined for canvas' downward y and inverts in UI space). (4) The prop count badge went through `paintPanel`, whose row-strip gradient chewed the 38 px disc's edge into a gear-tooth frill and pushed the top highlight bar out past the circle as two small ears; badges now use `paintBadge` (concentric circles, radius shrinking linearly and colour ramping at t^2.4 so only a small top area brightens and the disc stays vivid red). The three top-left keys also moved off the milk-tea fill (214,152,96), which sat only ~40 levels of luma from their own cream icons, onto a deep amber (176,108,62), and now share one dark backing plate so they read as one control group instead of three scattered stickers. `paintPanel` additionally falls back to a flat fill below alpha 190, because the half-pixel strip overlap composites twice on a translucent base and prints a visible line at every strip boundary. Verified at 390x845 / dpr 2 across home, play, prop press, skin panel and pause menu, with zero console errors.
- Initial-pile pass: the spawn seed disc (polar, radius 0.72) was far smaller than the rectangular basket floor (2.70 x 2.84) and never reached its corners, so every item landed in the same central patch and — with each item hard-frozen 0.9 s after spawn — stacked into a column instead of spreading. Measured tops reached y = 4.65 on level 1 (24 items) and y = 5.53 on level 3 (56 items) against a rim near y = 1.0; an orthographic top-down camera hides column height entirely, so this was only visible by reading y coordinates. Item size was also derived from a fixed base scale times `cbrt(66 / N)`, the wrong exponent for filling an area, which put level 1 items at a bounding width of 1.16 versus a 2.70 interior — two or three per layer. Seeding is now shape-aware and layered (stratified jittered cells over the boundary shape, upper layers offset half a cell and inset for slope), and item scale is solved from target layers, item count, and floor area, so both container shapes and all item counts stay consistent. Measured after the change at 390x845 / dpr 2, one page load per level: item bounding widths 0.72 / 0.74 / 0.66 across the three levels (was 1.13 / 0.77 / 0.90), pile tops median 1.02 / 1.17 / 1.17 and max 1.70 / 2.55 / 2.48, basket-interior pixel coverage 46% / 58% / 55%, largest single bare patch down from 1877 to 344 sample cells on level 1, and zero items moving in the 2.5 s after settling. The jade bowl skin (circular boundary, reached by shifting the clock one day) fills the same way with nothing outside the bowl. Shuffle reuses the same seeding and reproduces the opening shape; picking still removes exactly one item; zero console errors on every run.
- Known gap (design, not a defect): coverage saturates near 55% no matter how large items get, because these models' silhouettes cover only about half their bounding boxes. Level 1 therefore cannot be both full and sanely proportioned at 24 items — `PILE_ITEM_MAX` caps it at a thin single layer (46% coverage) so its items match levels 2 and 3 rather than blowing up to a third of the basket width. Filling level 1 properly needs more items, not bigger ones.
- P0/P1/P2 findings: none remaining.
- P3 observation: the reference prop cards use slightly richer bevel/texture treatment; the current controls preserve the same size, placement, contrast, labels, and interaction priority.

final result: passed

---

# 2026-08-11 游戏内退出挑战验收

## Evidence

- Source visual truth: 现有暂停菜单视觉体系（`game/assets/scripts/core/HudUI.ts`）。
- Built implementation: `game/build/web-mobile/assets/main/index.js`，已确认包含“退出本局”、`onExit` 与 `exitRoundToHome`。
- Intended viewport/state: 347 × 603 CSS，进入挑战后打开暂停菜单。
- Browser-rendered implementation screenshot: 未能取得；本地预览刷新被浏览器 URL 安全策略阻止。
- Full-view/focused comparison: blocked，缺少刷新后暂停菜单的浏览器截图。

## Findings

- 代码和构建产物已具备“继续游戏 / 重开本关 / 声音 / 退出本局”四项菜单。
- 退出路径会停止当前局、清理物件节点、Jolt 刚体、收集槽和 HUD 暂停状态，然后返回挑战地图；不会触发结算，也不会再次扣除次数。
- [P1] 尚未完成浏览器实机点击链路，不能确认最终菜单排版和触控区域。

## Required fidelity surfaces

- Fonts and typography: blocked，未取得刷新后截图。
- Spacing and layout rhythm: blocked，需确认 560 高暂停面板在实际视口完整显示。
- Colors and visual tokens: 代码沿用暂停菜单既有奶油、金色、棕色 token；浏览器视觉待确认。
- Image quality and asset fidelity: 本次没有新增或替换图片资产。
- Copy and content: 构建产物已包含“退出本局”。

## Primary interactions tested

- 静态构建验证：通过，构建产物包含退出回调及完整清理逻辑。
- 浏览器交互验证：blocked，本地 URL 刷新被浏览器安全策略阻止。

## Implementation checklist

- 在预览页手动刷新。
- 开始挑战 → 点击左上暂停 → 点击“退出本局”。
- 确认返回地图页、暂停层消失、再次开局无遗留物件。

final result: blocked

---

# 2026-08-10 挑战页长图安全区修复

## Evidence

- Source visual truth: `/Users/xmly/.codex/generated_images/019fe98a-8dc0-73c2-8341-827410a38f5c/exec-1e17d6d8-8432-449a-b7a6-d9b7cc671288.png`
- Browser-rendered implementation: `/Users/xmly/Swell/code/catch-the-goose/shot-home-default-fixed.png`
- Full-view side-by-side comparison: `/Users/xmly/Swell/code/catch-the-goose/qa-home-responsive-comparison.png`
- Source pixels: 853 × 1844. Implementation pixels: 346 × 602 from a 347 × 602 CSS viewport at device scale factor 2.6; both views were normalized to 602 px high for the combined comparison.
- State: 古玩铺 / 送温暖 selected，默认浏览器短屏。

## Findings

- 修复前整屏挑战页沿用了 720 × 1280 的游玩 HUD 缩放规则，但页面美术实际高约 1556，短屏会同时裁掉“抓住大鹅”标题与底部战绩。
- 修复后整屏页面层按 720 × 1556 独立等比收纳；对照图确认标题、地图、关卡摘要、难度、主按钮和底部次数全部在 347 × 602 可视区内。
- 无剩余 P0/P1/P2 响应式裁切问题。

## Required fidelity surfaces

- Fonts and typography: 标题和底部文案完整显示，无截字、换行或重叠。
- Spacing and layout rhythm: 长图整体缩放，纵向结构和设计稿比例保持一致；短屏两侧留出背景安全区。
- Colors and visual tokens: 缩放修复未改变木质、奶油和金色 token。
- Image quality and asset fidelity: 没有重新裁切或替换背景资产；截图清晰度受 346 px 浏览器画布物理宽度限制。
- Copy and content: “抓住大鹅”“出发挑战”“今日剩余”等关键文案均保留且可见。

## Primary interactions tested

- 347 × 602 默认短屏重新加载，完整页从标题到今日次数均可见。
- 390 × 844 竖屏已有回归基线 `/Users/xmly/Swell/code/catch-the-goose/shot-route-exact-final.png`，新规则在该高度保持 1:1 页面比例。
- 浏览器日志检查无 warning / error。

## Comparison history

- Pass 1 [P1]: 720 × 1556 挑战页被 720 × 1280 HUD 安全画布裁切。Fix: 将 `HudScreens` 从 `HudGame` 的缩放规则中拆开，按完整页面高度动态计算缩放。
- Pass 2: 默认 347 × 602 短屏对照确认头尾均完整，无剩余 P0/P1/P2 问题。

## Follow-up polish

- 无阻塞项；新增更长地图章节时继续在页面层内扩展，不改变游玩 HUD 的 1280 安全画布。

final result: passed

---

# 2026-08-10 挑战路线页设计稿级重构验收

## Evidence

- Source visual truth: `/Users/xmly/.codex/generated_images/019fe98a-8dc0-73c2-8341-827410a38f5c/exec-1e17d6d8-8432-449a-b7a6-d9b7cc671288.png`
- Browser-rendered implementation: `/Users/xmly/Swell/code/catch-the-goose/shot-route-exact-final.png`
- Full-view comparison: `/Users/xmly/Swell/code/catch-the-goose/qa-route-exact-comparison.png`
- Focused controls comparison: `/Users/xmly/Swell/code/catch-the-goose/qa-route-exact-controls.png`
- Source pixels: 853 × 1844，按原始纵横比归一化为 390 × 844。
- Implementation pixels / CSS viewport / canvas: 390 × 844；devicePixelRatio = 1。
- State: 水果篮地图、标准难度、37 件、3:30，与设计稿同状态。

## Findings

- 最终对比无剩余 P0/P1/P2。标题、地图插画、路线、两处地图牌匾、鹅角色、信息牌、三档难度轨道、固定提示、主按钮与每日次数均使用设计稿切图或同风格专项资产，不再使用程序化矩形近似。
- [P3] 浏览器中的插画锐度略低于直接缩放的源 PNG；这是 Cocos 纹理导入与 DPR 1 浏览器采样造成的轻微差异，不影响构图、文案或交互辨识。
- [P3] 动态关卡摘要使用工程中文字体，字面宽度比源稿手绘字体稍窄；其字号、颜色、单行结构和对齐已经匹配。

## Required fidelity surfaces

- Fonts and typography: 标题、地图牌匾、难度名、固定提示、CTA 和每日次数保留原稿字形；只有必须动态变化的摘要使用实时 Label，无换行、截断或重叠。
- Spacing and layout rhythm: 853 × 1844 原稿按 720 美术宽度等比拆分，标题、地图、木质控制区保持原始垂直比例；核心控件均完整落在 390 × 844 视口内。
- Colors and visual tokens: 木纹、羊皮纸、金色浮雕、绿/橙/红难度色和选中光晕直接来自原稿或同风格状态资产，未用通用色块替代。
- Image quality and asset fidelity: 使用真实位图切图；水果篮与古玩铺各有独立选中地图状态，轻松/标准/大师各有独立轨道状态。无占位图、emoji、手绘 SVG 或代码绘制图标。
- Copy and content: “抓住大鹅”“水果篮”“古玩铺”“轻松/标准/大师”“出发后本局场景固定”“出发挑战”“今日剩余 3/3”与源稿一致；标准摘要为“标准挑战 · 37 件 · 3:30”。

## Primary interactions tested

- 水果篮 ↔ 古玩铺切换：地图插画、发光选中环与鹅位置同步切换。
- 轻松 → 标准 → 大师切换：整套轨道选中态与摘要数据同步变化。
- 返回水果篮 / 标准后重新截图，与源稿同状态完成最终对比。
- 出发挑战热区保留；右上声音热区保留。
- 最终浏览器 console warning / error: 0。

## Comparison history

- Pass 1 [P1]: 原实现用程序化面板、圆点和系统文字模拟设计稿，材质、层级与装饰细节差异明显。Fix: 将页面拆为标题、地图章节、底部木板、信息牌、三档难度轨道与按钮等真实位图层。
- Pass 2 [P1]: 预告地图的程序化背景层覆盖首章地图，造成地图断层。Fix: 未交付专属章节美术前不渲染占位章节；扩展继续采用同规格章节 segment。
- Pass 3 [P2]: 空白摘要牌与底图叠出双框。Fix: 预合成 `bottom-dynamic.png`，在同一木纹底板上清除静态摘要，再叠加实时文字。
- Pass 4 [P1]: `Sprite` 接收首张纹理时回到 RAW 尺寸，853px 原图被按原生像素渲染，整体意外放大约 18%。Fix: `UIKit.image` 先设置 CUSTOM，再赋帧并恢复目标 UITransform 尺寸。
- Pass 5 [P2]: 动态摘要文字贴近牌匾上沿且多显示“6 种”。Fix: 恢复垂直居中，并按源稿压缩为“标准挑战 · 37 件 · 3:30”。
- Pass 6: 全屏与控件局部对比均无剩余 P0/P1/P2。

## Follow-up polish

- [P3] 正式发布时可为这批大图配置更高质量纹理压缩策略，进一步减少 DPR 1 下的轻微柔化。
- [P3] 新地图上线时为每一章制作同尺寸地图 segment，并在现有数据结构中向上追加，避免重新引入程序化占位画面。

final result: passed

---

# 2026-08-10 难度票文字与星级间距修复

## Evidence

- Source visual truth: `/var/folders/7w/hsspqlq52mj2vrwmmpdjptsh0000gn/T/codex-clipboard-7a25a2b5-9da1-4a88-924a-23bd18cd8a26.png`
- Browser-rendered implementation: `/Users/xmly/Swell/code/catch-the-goose/shot-difficulty-spacing-fixed.png`
- Focused side-by-side comparison: `/Users/xmly/Swell/code/catch-the-goose/qa-difficulty-spacing-comparison.png`
- Source pixels: 902 × 530. Implementation capture: 300 × 649 from a 390 × 844 CSS viewport; the focused control region was cropped and proportionally normalized to the source height for comparison.
- State: 古玩铺 / 送温暖 selected，正常与地狱保持锁定。

## Findings

- 原截图的三张难度票把名称与星级压在同一视觉行，选中态的“送温暖”与四颗星发生明显重叠，属于 P1 可读性问题。
- 修复后名称与星级拆为上下两行，星级尺寸与间距同步收紧；三张票在选中、锁定状态下均没有文字碰撞、裁切或越界。
- 按钮区整体增加了纵向空间，并把主按钮与底部战绩行略微拉开；信息层级仍保持“关卡摘要 → 难度 → 固定提示 → 出发 → 战绩”。

## Required fidelity surfaces

- Fonts and typography: 中文名称维持原层级，星级降至辅助信息光学重量；无换行、截断或字形重叠。
- Spacing and layout rhythm: 卡片高度和上下内边距更均衡，主按钮与底部说明不再显得贴近。
- Colors and visual tokens: 选中金色、锁定奶油色、胡桃木底色均保持原设计 token，不引入新的视觉语义。
- Image quality and asset fidelity: 本次只调整实时 UI 排版，地图与鹅角色资产未改动；局部对比中的模糊来自浏览器截图归一化放大，不是运行时素材降质。
- Copy and content: 地图名、难度名、固定规则、今日次数和最佳成绩文案均保持不变。

## Primary interactions tested

- 390 × 844 竖屏重新加载挑战路线页，选中态和两个锁定态均完整可见。
- 点击锁定难度不会错误改变当前选中态。
- 最终页面控制台无 warning / error。

## Comparison history

- Pass 1 [P1]: 难度名称与星级重叠。Fix: 卡片增高，名称上移，星级独立下移并缩小字级与间距。
- Pass 2: 聚焦对比确认三张难度票均无重叠；无剩余 P0/P1/P2 问题。

## Follow-up polish

- 无阻塞项；后续若增加更多难度，可继续沿用“名称行 + 评价行”的双层结构。

final result: passed

---

# 2026-08-10 挑战路线页与首次引导重设计验收

## Evidence

- Source visual truth: `/Users/xmly/.codex/generated_images/019fe98a-8dc0-73c2-8341-827410a38f5c/exec-1e17d6d8-8432-449a-b7a6-d9b7cc671288.png`
- Browser-rendered implementation: `/Users/xmly/Swell/code/catch-the-goose/shot-route-redesign.png`
- Combined comparison: `/Users/xmly/Swell/code/catch-the-goose/qa-route-comparison.png`
- Source pixels: 853 × 1844. Normalized to 390 × 844 for comparison (aspect delta below 0.1%).
- Implementation pixels / CSS viewport: 390 × 844, device scale factor 1.
- State: source shows 水果篮 / 标准; implementation capture shows 古玩铺 / 送温暖 from the existing local profile. The comparison therefore judges reusable page structure, art direction, hierarchy, and controls rather than treating selected content as a mismatch.

## Full-view comparison

- The selected design's core composition is preserved: compact warm title area, illustrated map as the dominant surface, bottom-anchored difficulty selector, fixed-scene note, and one large gold departure CTA.
- The implementation intentionally changes the two-destination static composition into a vertically draggable configured route. Future nodes appear above the current destination, directly satisfying the requested upward expansion without shrinking the current interaction.
- The generated map asset retains the reference's picnic, river, wooded antique-shop, parchment, and wooden-table art direction. Route nodes and labels remain live UI rather than being baked into the bitmap.

## Focused comparison

- Map region: the selected destination uses the project's real transparent goose asset as the travel piece; preview nodes use restrained disabled styling and stay legible against both grass and shop imagery.
- Control region: the difficulty tabs, lock note, primary action, and daily/best line remain visible at 390 × 844. The first-time profile correctly exposes only 送温暖 while locked levels remain visibly disabled.
- Header: title hierarchy and sound state are clear. The production header is deliberately less ornamental than the generated wordmark so future localization remains live text.

## Required fidelity surfaces

- Fonts and typography: Cocos' bundled Chinese fallback is plainer than the generated display lettering but is sharp, non-clipped, and preserves title/body/control hierarchy. Residual ornamental mismatch is P3.
- Spacing and layout rhythm: header, map, and challenge controls form three stable vertical zones; no persistent control overflows the phone viewport. Extra-height phones are covered by 1700-art-pixel page backplates.
- Colors and visual tokens: warm walnut, parchment cream, honey gold, muted disabled cream, map green, and river blue align with the source palette and reuse shared `UIKit` tokens.
- Image quality and asset fidelity: the 1024 × 1536 generated map background is sharp at the 390 px viewport; the selected marker uses the existing goose raster asset, with no placeholder image or generic emoji.
- Copy and content: “向上探索更多地图挑战”, map names/taglines, difficulty data, fixed-after-departure rule, daily attempts, best result, and “出发挑战” all render as live Chinese UI text.

## Primary interactions tested

- Fresh profile: independent onboarding page → 开始探索 → route page.
- Vertical map drag in both directions, including future preview nodes and return to playable nodes.
- 水果篮 ↔ 古玩铺 selection; selected marker, challenge summary, theme, and scene skin update together.
- Page rebuild after selection keeps the dim layer below the active page.
- 出发挑战 clears the route page, restores the gameplay HUD, loads the selected antique scene, and starts the round.
- Final build console: no new warning/error after the last rebuild and interaction pass. The earlier timestamped mask error belonged to a superseded build and did not recur.

## Comparison history

- Pass 1 [P1]: Cocos `Mask` swallowed later sibling rendering, leaving the map and challenge panel blank. Fix: replaced stencil clipping with stable top/bottom opaque cover layers. Post-fix evidence shows the full map and challenge panel.
- Pass 2 [P1]: re-selecting a map moved the shared dim node above the rebuilt page. Fix: `UIRouter` now pins the dim node to sibling index 0. Post-fix evidence shows full-bright selection changes in both directions.
- Pass 2 [P2]: the selected route node lacked the goose travel character that anchors the reference. Fix: reuse `resources/icons/goose` inside the selected marker. Post-fix evidence shows the real goose raster centered in the highlighted map node.
- Pass 3: no actionable P0/P1/P2 finding remains.

## Follow-up polish

- [P3] The generated reference has richer beveled lettering and more decorative difficulty tokens. The implementation favors live, scalable Cocos controls; a later material pass could add subtle surface gloss without changing layout or interaction.
- [P3] When additional playable maps ship, give each chapter its own background segment so long-route scrolling gains more environmental variety.

final result: passed

---

# 2026-08-10 初始化页宽屏上限与顶部起绘验收

## Evidence

- Source visual truth: `/Users/xmly/.codex/generated_images/019fe98a-8dc0-73c2-8341-827410a38f5c/exec-1e17d6d8-8432-449a-b7a6-d9b7cc671288.png`
- Wide browser implementation: `/Users/xmly/Swell/code/catch-the-goose/shot-home-wide-fixed.png`
- Narrow browser implementation: `/Users/xmly/Swell/code/catch-the-goose/shot-home-narrow-top-fixed.png`
- Focused side-by-side comparison: `/Users/xmly/Swell/code/catch-the-goose/qa-home-wide-centered-comparison.png`
- Source pixels: 853 × 1844. Wide implementation: 1280 × 720 CSS viewport at device scale factor 2; its centered 720 × 720 page region was compared with a width-normalized 720 × 720 source crop. Narrow regression: 347 × 602 CSS viewport at device scale factor 2.6.
- State: 古玩铺 / 送温暖 selected。

## Findings

- 修复前 [P1]：FIXED_WIDTH 逻辑宽度被误当成浏览器像素，1280 × 720 下初始化页被放大到 1280 宽，页面后续内容横向泄漏。
- 修复后：页面真实显示宽度上限为 720px，1280 宽窗口左右各保留约 280px 背景空间；头图第一行像素贴齐窗口顶部，超出 720px 高度的内容只从底部裁切。
- 窄屏仍按窗口宽度缩放并保持顶部起绘，无横向溢出。无剩余 P0/P1/P2 响应式问题。

## Required fidelity surfaces

- Fonts and typography: 顶部“抓住大鹅”和商铺牌匾保持原图字形与光学比例，无二次排字。
- Spacing and layout rhythm: 720px 内容列稳定居中，左右留白对称；纵向裁切只发生在底部。
- Colors and visual tokens: 两侧继续显示游戏世界的深色木质背景，中央页面色板未改变。
- Image quality and asset fidelity: 头图、地图均使用原切图，不做横向拉伸；宽屏对照确认像素比例一致。
- Copy and content: 可视区域内标题、地图名和场景内容保持完整；下方信息仅因明确的短屏底部裁切规则暂不可见。

## Primary interactions tested

- 1280 × 720 超宽窗口重新加载：首页宽度 720px、居中、顶部起绘、底部截断。
- 347 × 602 窄窗口重新加载：首页铺满可用宽度、顶部起绘、底部截断。
- 两个视口均完成浏览器截图；最终宽屏控制台无 warning / error。

## Comparison history

- Pass 1 [P1]: 页面补偿缩放使用 390px 逻辑宽度，导致宽屏横向铺满。Fix: 用真实 frame 宽度反算页面层比例，并限制最终内容宽度为 720px。
- Pass 2 [P2]: 内容列已居中，但头图上方仍露出约 72px 纯色出血。Fix: 为页面声明独立 `artTop`，按真实头图顶边对齐窗口顶部。
- Pass 3: 宽屏与窄屏复核均符合“顶部起绘、底部裁切、超宽居中留空”，无剩余 P0/P1/P2 问题。

## Follow-up polish

- 新增整屏页面时显式声明自己的 `artTop`，即可复用同一套宽度上限与顶部裁切规则。

final result: passed

---

# 2026-08-10 关键操作置底与顶部按钮交互验收

## Evidence

- Source visual truth: `/Users/xmly/.codex/generated_images/019fe98a-8dc0-73c2-8341-827410a38f5c/exec-1e17d6d8-8432-449a-b7a6-d9b7cc671288.png`
- Browser-rendered implementation: `/Users/xmly/Swell/code/catch-the-goose/shot-home-bottom-dock-fixed.png`
- Settings state: `/Users/xmly/Swell/code/catch-the-goose/shot-home-settings-fixed.png`
- Sound feedback state: `/Users/xmly/Swell/code/catch-the-goose/shot-home-sound-toggle-fixed.png`
- CTA completion state: `/Users/xmly/Swell/code/catch-the-goose/shot-home-bottom-cta-started.png`
- Combined comparison: `/Users/xmly/Swell/code/catch-the-goose/qa-home-bottom-dock-comparison.png`
- Source pixels: 853 × 1844. Implementation: 347 × 603 CSS viewport at device scale factor 2; source normalized to 347px wide and top-cropped to the same 603px viewport for comparison.
- State: 古玩铺 / 送温暖，短屏触发安全操作栏。

## Findings

- 修复前 [P1]：短屏遵循顶部起绘后，原稿底部 CTA 会被自然裁掉，玩家无法开始挑战。
- 修复后：地图继续从顶部裁切；仅当原 CTA 不在可视区时，使用同一张真实 CTA 切图生成独立底部安全栏。正常长屏仍使用原稿按钮，不重复显示。
- 修复前 [P1]：头图中的齿轮只有装饰，声音热区无状态反馈。修复后齿轮可打开设置层，设置内声音开关与右上快捷声音键均可切换并反馈当前状态。
- 无剩余 P0/P1/P2 问题。

## Required fidelity surfaces

- Fonts and typography: 置底 CTA 继续使用原切图字形；设置层中文无截断、重叠或异常换行。
- Spacing and layout rhythm: 安全栏固定在可视底边并保留约 20px 触控安全区；地图裁切不影响顶部标题与右上入口。
- Colors and visual tokens: 安全栏使用胡桃木底色，设置层复用奶油、金色与棕色 token。
- Image quality and asset fidelity: CTA 使用 `cta-button.png`，没有用临时图形重画；头图齿轮与声音图标保留原设计资产。
- Copy and content: “出发挑战”“设置”“声音 开/关”“关闭”状态清晰完整。

## Primary interactions tested

- 点击右上齿轮：设置层正常打开，背景正确压暗。
- 点击设置内声音：状态从“声音 关”切到“声音 开”；关闭后点击右上声音快捷键，出现“声音已关闭”反馈。
- 点击置底“出发挑战”：挑战页关闭并进入古玩铺第 2 关游玩页。
- 最终浏览器日志无 warning / error。

## Comparison history

- Pass 1 [P1]: 短屏底部 CTA 被裁掉。Fix: 增加仅在原按钮不可见时启用的 `screenBottomDock`，由页面路由按可视底边定位。
- Pass 1 [P1]: 设置图标无动作、声音图标无反馈。Fix: 补充页面内设置层、声音状态切换与短时提示。
- Pass 2: 347 × 603 短屏完成设置、声音、开局全链路测试，无剩余 P0/P1/P2 问题。

## Follow-up polish

- [P3] 后续设置项增多时，可把当前轻量设置层升级为独立 `SettingsScreen`，保持页面路由结构一致。

final result: passed

---

## Latest QA status — 2026-08-11 游戏内退出挑战

完整证据、必查视觉面与交互清单见上文“2026-08-11 游戏内退出挑战验收”。代码及 Web 构建已包含“退出本局”和完整清理回首页逻辑，但浏览器安全策略阻止了本地预览刷新，因此缺少刷新后暂停菜单截图与点击证据。

Blocker: 请在已打开的本地预览中手动刷新一次；之后需要验证“开始挑战 → 暂停 → 退出本局 → 返回地图页”。

final result: blocked
