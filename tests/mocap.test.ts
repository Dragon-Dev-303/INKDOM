import { describe, expect, it } from 'vitest';
import { MOCAP_ATTRIBUTION, MOCAP_CLIPS, type MocapTrack } from '@/game/anim/data/mocap.generated';

/**
 * Sanity checks for the generated CMU mocap clips (tools/mocap/build.ts).
 * Assertions per clip family:
 *  - straight punches (jab, cross, overhand, lunge_punch): striking elbow flex < 0.6 at contact
 *    and the hand forward of the shoulder (sin(upper-arm angle) > 0.3).
 *  - hook / uppercut: the elbow is bent by design, so only "hand in front" (sin(aX) > 0.3) and,
 *    for the uppercut, forearm pointing upward (aF + eF > π/2).
 *  - front_kick / knee / flying_kick / side_kick / roundhouse: striking thigh raised forward
 *    (hX > 0.6); knee flex < 0.9 for the extended kicks (not for `knee`, which is folded by design).
 *  - blocks / guard: only range checks.
 */
const TRACKS: MocapTrack[] = ['torso', 'neck', 'aF', 'eF', 'aB', 'eB', 'hF', 'kF', 'hB', 'kB', 'drop', 'rootDx', 'rootDy'];
const clips = Object.values(MOCAP_CLIPS);

const STRAIGHT = ['jab', 'cross', 'overhand', 'lunge_punch'];
const BENT_PUNCH = ['lead_hook', 'rear_uppercut'];
const EXTENDED_KICK = ['front_kick', 'roundhouse', 'side_kick', 'flying_kick'];

describe('mocap generated clips', () => {
  it('has attribution and at least the core clips', () => {
    expect(MOCAP_ATTRIBUTION).toContain('mocap.cs.cmu.edu');
    for (const id of ['jab', 'cross', 'front_kick', 'roundhouse', 'side_kick']) expect(MOCAP_CLIPS[id], id).toBeDefined();
  });

  for (const c of clips) {
    describe(c.id, () => {
      it('is structurally valid', () => {
        expect(c.fps).toBe(60);
        expect(c.length).toBeGreaterThan(5);
        expect(c.contact).toBeGreaterThanOrEqual(0);
        expect(c.contact).toBeLessThan(c.length);
        for (const t of TRACKS) {
          expect(c.tracks[t], t).toHaveLength(c.length);
          for (const v of c.tracks[t]) expect(Number.isFinite(v), `${t} finite`).toBe(true);
        }
        expect(c.source.frames[1]).toBeGreaterThan(c.source.frames[0]);
      });

      it('has sane joint ranges and no angle jumps', () => {
        for (const t of ['eF', 'eB', 'kF', 'kB'] as MocapTrack[]) {
          for (const v of c.tracks[t]) {
            expect(v, t).toBeGreaterThanOrEqual(-0.2);
            expect(v, t).toBeLessThanOrEqual(2.9);
          }
        }
        for (const t of ['torso', 'neck', 'aF', 'aB', 'hF', 'hB', 'eF', 'eB', 'kF', 'kB'] as MocapTrack[]) {
          const a = c.tracks[t];
          for (let i = 1; i < a.length; i++) expect(Math.abs(a[i] - a[i - 1]), `${t} step @${i}`).toBeLessThan(1.0);
        }
        for (const v of c.tracks.drop) expect(v).toBeGreaterThanOrEqual(0);
      });

      const at = (t: MocapTrack) => c.tracks[t][c.contact];
      const side = c.limb[1] as 'F' | 'B';

      if (STRAIGHT.includes(c.id)) {
        it('extends the striking arm at contact', () => {
          expect(at(`e${side}` as MocapTrack)).toBeLessThan(0.6);
          expect(Math.sin(at(`a${side}` as MocapTrack))).toBeGreaterThan(0.3);
        });
      }
      if (BENT_PUNCH.includes(c.id)) {
        it('has the striking hand in front at contact', () => {
          expect(Math.sin(at(`a${side}` as MocapTrack))).toBeGreaterThan(0.3);
          if (c.id === 'rear_uppercut') expect(at('aF') + at('eF')).toBeGreaterThan(Math.PI / 2);
        });
      }
      if (EXTENDED_KICK.includes(c.id) || c.id === 'knee') {
        it('raises the striking leg forward at contact', () => {
          expect(at(`h${side}` as MocapTrack)).toBeGreaterThan(0.6);
          if (EXTENDED_KICK.includes(c.id)) expect(at(`k${side}` as MocapTrack)).toBeLessThan(0.9);
        });
      }
      if (c.id === 'guard_idle') {
        it('loops (last frame close to the first)', () => {
          for (const t of TRACKS) expect(Math.abs(c.tracks[t][c.length - 1] - c.tracks[t][0]), t).toBeLessThan(0.15);
        });
      }
    });
  }
});
