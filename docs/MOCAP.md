# Motion capture pipeline (`tools/mocap`)

This pipeline runs offline. It turns real human motion from the **CMU Graphics Lab Motion Capture Database** into keyframe tracks for the game's 2D forward-kinematics rig (`src/game/render/rig.ts`). Its output is `src/game/anim/data/mocap.generated.ts`. The game never runs the pipeline. A move whose clip is missing uses its authored fallback.

**Attribution** (keep it in the credits):

> Motion data: CMU Graphics Lab Motion Capture Database, mocap.cs.cmu.edu (created with funding from NSF EIA-0196217).

The data is free for any use. Attribution is requested by etiquette, not required by the licence. The generated file exports the line as `MOCAP_ATTRIBUTION`.

## Regenerate

```
npx tsx tools/mocap/build.ts            # or: npm run mocap
npx tsx tools/mocap/build.ts --preview  # also writes SVG flipbooks to tools/mocap/.cache/preview/<clip>.svg
npx vitest run tests/mocap.test.ts
```

The first run downloads about 60 MB of ASF/AMC files into `tools/mocap/.cache/`. That folder is git-ignored, and later runs use the cache. The output is deterministic: the same inputs give a byte-identical file.

Dev helpers:

- `npx tsx tools/mocap/build.ts --candidates [--only=<clipId>]` lists the top-scoring events for each clip, with their features.
- `npx tsx tools/mocap/explore.ts <subject> <trial> [punch|kick|knee|rise]` lists all strike events in a trial.
- `npx tsx tools/mocap/ascii.ts <clipId> [frames...]` draws generated poses as ASCII art in the terminal.

## Files

| File | Role |
|---|---|
| `download.ts` | Fetches `http://mocap.cs.cmu.edu/subjects/<S>/<S>.asf` and `<S>_<TT>.amc`. It also caches the subject page to read each trial's frame rate (75_16 is 60 fps, the rest are 120 fps). |
| `asf.ts`, `amc.ts` | Parsers for units, root order/axis, bone direction/length/axis/dof, and hierarchy. |
| `fk.ts` | Standard CMU forward kinematics: `C` = axis Euler rotation (XYZ), `L = C·R(dofs)·C⁻¹`, `M = M_parent·L`, `child = parent + length·M·direction`. |
| `load.ts` | Parses and solves one trial (memoized). |
| `retarget.ts` | Projects the 3D joints onto the sagittal plane and converts them to rig angles. |
| `segment.ts` | Strike signals, smoothing, resampling to 60 fps, 3-tap filter. |
| `events.ts` | Strike-event detection and the features used for classification. |
| `build.ts` | Clip specs, candidate scoring, clip assembly, code emission. |
| `preview.ts`, `ascii.ts`, `explore.ts` | Sanity-check tools. |

## Conventions (rig)

The character faces +x and y is up. Bone lengths in units: thigh 0.42, shin 0.42, torso 0.55, neck 0.08, upperArm 0.30, forearm 0.28. All angles are in radians.

- `torso`: angle of the mid-hip → mid-shoulder vector from straight up. + = leaning forward.
- `neck`: the head direction (lowerneck → head), relative to `torso`.
- `aF`/`aB`: absolute upper-arm angle from straight down. + = forward. The forearm's absolute angle is `aF + eF`.
- `eF`/`eB`: elbow flex, taken from the **true 3D elbow angle** (0 = straight). The rig clamps it to 0..2.62.
- `hF`/`hB`: absolute thigh angle from straight down. + = forward. The shin's absolute angle is `hF − kF`.
- `kF`/`kB`: knee flex, taken from the 3D knee angle (the knee bends backward).
- **F = the character's RIGHT arm/leg, B = LEFT.** In the orthodox convention, B is the lead side (jab, lead hook) and F is the rear side (cross, uppercut, kicks).
- `drop`: hip lowering below the standing hip height of 0.84, measured as hip height above the lowest ankle. It is ≥ 0.
- `rootDx`: mid-hip horizontal travel along the strike direction since frame 0, in game units.
- `rootDy`: height of the lowest ankle above the floor, relative to frame 0. It is about 0 while a foot is planted and shows true airborne height in the flying kick. Add it to the grounded pose only for airborne clips.
- `contact`: the 0-based frame of peak extension (the hit frame). All tracks have `length` frames at 60 fps.
- `mirrored: true` means the source struck with the other side, so the F/B tracks were swapped.

### Retarget details

- **Forward axis:** the horizontal direction from the mid-hip to the striking end-effector (wrist, ankle or knee) at the impact frame. If that vector is very short, or points behind the body, the body facing at onset is used instead. Up is world up.
- **Scale:** the rest-pose leg length (femur + tibia) maps to 0.84.
- **Upper arm and thigh angles:** these come from the projection. When a segment points at the camera (foreshortened to under ~60 %), its angle blends toward the angle implied by the whole-limb chord, so the 2D angle does not spin.
- **Smoothing:** a 3-tap [1 2 1]/4 filter at the source rate, then linear resampling to 60 fps. Absolute angles are unwrapped, so there are no 2π jumps.

## How clips are chosen

1. For each source trial and side, `events.ts` computes an extension signal:
   - punch: shoulder → wrist distance divided by arm length
   - kick: ankle distance from the "hanging" ankle position under the hip, divided by leg length
   - knee: knee height above the hip
   - rise: wrist height above the shoulder (used for uppercuts and blocks)
2. An **event** is a peak of extension velocity. Onset is where the velocity rises; impact is maximum extension; end is when the retraction finishes.
3. Each event gets features: elbow flex, elbow/wrist height, rise, forward and lateral travel, yaw sweep around the shoulders, hip travel, and rest time before and after (isolation).
4. Each clip spec in `build.ts` has a `score` function that rejects or ranks events (for example, straight = flex < 35°, extension > 0.92, large extension change). For `lead`/`rear` roles, the lead side is the foot further forward along the strike direction at onset. The best event wins. The natural side gets a +0.3 bonus over a mirrored one.
5. The window runs from onset minus a pad to end plus a pad, capped at `maxDur`. It is retargeted, mirrored if needed, and the contact frame is mapped to 60 fps.
6. `guard_idle` is different: it takes the calmest 1.5 s of the boxing trials with both hands at guard height. The last 15 frames are blended back to frame 0 so it loops. Root travel is zeroed.

### Adding a clip

1. Add the trial to `TRIALS` in `download.ts` if it is not cached yet.
2. Run `npx tsx tools/mocap/explore.ts <S> <T> punch` (or `kick`, `knee`, `rise`) to see the events and their features.
3. Add a `ClipSpec` to `SPECS` in `build.ts` with `id`, `label`, the rig `limb` it should strike with, the signal `kind`, the `sources`, a `role`, a `score` function, and `pad`/`maxDur`.
4. Check the choice with `--candidates --only=<id>`. To force a specific event, set `pin: { subject, trial, impact }`.
5. Rebuild with `--preview`, inspect the SVG or ASCII output, and add a test family in `tests/mocap.test.ts` if needed.

## Produced clips

Frame ranges are 1-based AMC frame numbers. Durations are at 60 fps.

| id | source | frames | mirrored | length | contact | notes |
|---|---|---|---|---|---|---|
| guard_idle | 14_02 boxing | 3185–3364 (120 fps) | yes | 90 (1.50 s) | 0 | Loop. Subject 14 boxes southpaw, so mirrored to orthodox. |
| jab | 14_01 boxing | 3759–3823 | yes | 33 (550 ms) | 12 (200 ms) | Lead straight, elbow 0.42 at contact. |
| cross | 13_17 boxing | 216–295 | no | 40 (667 ms) | 12 (200 ms) | Rear straight, very clean. |
| lead_hook | 13_17 boxing | 3895–3947 | no | 27 (450 ms) | 15 (250 ms) | Lead hook with a mid/low target. Weakest clip (see limitations). |
| rear_uppercut | 14_02 boxing | 4059–4139 | no | 41 (683 ms) | 16 (267 ms) | Wrist rises 1.5 arm lengths. |
| overhand | 13_17 boxing | 591–698 | no | 54 (900 ms) | 17 (283 ms) | A committed rear straight. The dataset has no true looping overhand. |
| lunge_punch | 135_09 Oiduki | 277–361 | no | 43 (717 ms) | 15 (250 ms) | Stepping punch, rootDx ≈ 0.55. Starts from a held karate stance. |
| front_kick | 135_04 Front Kick | 555–625 | yes | 36 (600 ms) | 15 (250 ms) | Mae-geri. Steps through: rootDx ≈ 0.67. |
| roundhouse | 135_07 Mawashigeri | 83–163 | no | 41 (683 ms) | 18 (300 ms) | |
| side_kick | 135_11 Yokogeri | 565–666 | no | 51 (850 ms) | 23 (383 ms) | Torso leans back about 0.68 at contact. |
| knee | 86_06 | 6217–6325 | no | 55 (917 ms) | 27 (450 ms) | |
| flying_kick | 75_16 jump kick | 210–294 (60 fps) | no | 85 (1.42 s) | 34 (567 ms) | rootDy peaks about 1.0, rootDx ≈ 1.3. |
| block_high | 144_26 Right_Blocks | 1815–1926 | no | 56 (933 ms) | 47 (783 ms) | Slow rising block. Contact is late in the clip. |
| block_low | 135_05 Gedanbarai | 1041–1149 | no | 55 (917 ms) | 43 (717 ms) | Karate low sweep with a step back (rootDx ≈ −0.26). |

The build prints this table (with contact poses) on every run. The numbers above match the current generated file.

## Known limitations

- **Side view only.** Rotational techniques (hook, roundhouse, side kick, uppercut) lose their lateral component. The projection keeps the forward/up shape, and elbow/knee bend comes from 3D, so limbs bend correctly but may look "flatter" than in 3D. The lead hook in particular reads as a short bent-arm punch.
- **Overhand** is a strong rear straight with weight transfer, not a looping overhand. No looping overhand was found in the listed trials.
- **Karate sources** (lunge punch, front kick, low block) start and end in karate stances rather than a boxing guard. Their first frame is near neutral but not identical to the game's idle pose, so blend over a few frames.
- **Root motion** is in the tracks, but most strike clips should ignore it (or scale it). Only use `rootDx` for `lunge_punch`, `front_kick` and `flying_kick`, and `rootDy` for `flying_kick`.
- Subjects differ in body proportions. Everything is normalized to leg length, so arm reach varies slightly between clips.
- Selection is automatic and score-based. If a regenerated choice looks wrong after you edit the scores, pin the event (`pin`) in its spec.
