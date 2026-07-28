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
- Browser console errors across the high-DPI, combo, win and deadlock passes: none beyond the three pre-existing `Failed to load prefab asset for node 'New Node'` scene warnings, which are unchanged from before these edits.
- Scoring-rule pass: the home rules now state that chained clears multiply the score and that leftover time counts, so the combo pill and the time bonus are both explained before the first round. Measured at level 1 and level 2 (390x845, dpr 2): the two rule lines each fit on one line, and the level-2 rock warning sits clear of both the rules above and the start button below.
- Distractor-teaching pass: picking a rock now raises `石头凑不成三个，会一直占着格子` at the moment of the mistake, once per round, and resets on level reset. The home warning alone was off-screen by the time the mistake happened.
- Combo-audio pass: the match sound now scales from 0.79 to 1.0 with the combo count, played after `addMatchScore` so the volume reflects the combo the player just earned (`playOneShot` has no pitch control).

## Findings and iteration history

- Pass 1: the former world-space collection area behaved like another 3D object and did not adapt cleanly to phone proportions. Replaced it with a responsive screen-space HUD.
- Pass 2: a multi-camera 3D slot representation could be occluded and did not reliably match the recording. Replaced it with transparent thumbnails rendered from the real models.
- Pass 3: verified the final phone viewport, fixed slot geometry, prop interactions, pause flow, model pick flow, and console state.
- Boundary regression: aligned the visible wooden container, physical fence, orthographic phone camera, spawn area, remove return area, and shuffle area to the same rectangular bounds; repeated randomized initialization produced no clipped or escaped items.
- P0/P1/P2 findings: none remaining.
- P3 observation: the reference prop cards use slightly richer bevel/texture treatment; the current controls preserve the same size, placement, contrast, labels, and interaction priority.

final result: passed
