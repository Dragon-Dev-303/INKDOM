import { describe, expect, it } from 'vitest';
import { runSoak } from '../scripts/soakCore';

describe('soak: CPU vs CPU matches (plan §8.3)', () => {
  it('30 matches finish with every invariant holding', () => {
    const report = runSoak(30, 1000);
    expect(report.failures, report.failures.join('\n')).toEqual([]);
    expect(report.matches).toBe(30);
    expect(report.level3Stuck).toBe(0);
  });
});
