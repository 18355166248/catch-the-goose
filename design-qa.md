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

## Findings and iteration history

- Pass 1: the former world-space collection area behaved like another 3D object and did not adapt cleanly to phone proportions. Replaced it with a responsive screen-space HUD.
- Pass 2: a multi-camera 3D slot representation could be occluded and did not reliably match the recording. Replaced it with transparent thumbnails rendered from the real models.
- Pass 3: verified the final phone viewport, fixed slot geometry, prop interactions, pause flow, model pick flow, and console state.
- Boundary regression: aligned the visible wooden container, physical fence, orthographic phone camera, spawn area, remove return area, and shuffle area to the same rectangular bounds; repeated randomized initialization produced no clipped or escaped items.
- P0/P1/P2 findings: none remaining.
- P3 observation: the reference prop cards use slightly richer bevel/texture treatment; the current controls preserve the same size, placement, contrast, labels, and interaction priority.

final result: passed
