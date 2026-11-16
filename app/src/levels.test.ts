import { describe, expect, it } from 'vitest';
import { levelMatches, levelRank } from './levels';

describe('levelRank', () => {
  it('ממיין לפי רמה, כולל רמות ביניים', () => {
    const levels = ['B2', 'A1/A2', 'C2', 'A2', 'B1+', 'B1', undefined, 'A1'];
    const sorted = [...levels].sort((a, b) => levelRank(a) - levelRank(b));
    expect(sorted).toEqual(['A1', 'A1/A2', 'A2', 'B1', 'B1+', 'B2', 'C2', undefined]);
  });
});

describe('levelMatches', () => {
  it('רמת ביניים נכללת בשתי הרמות', () => {
    expect(levelMatches('A2/B1', new Set(['B1']))).toBe(true);
    expect(levelMatches('A2/B1', new Set(['A2']))).toBe(true);
    expect(levelMatches('B1+', new Set(['B1']))).toBe(true);
    expect(levelMatches('C1', new Set(['B1']))).toBe(false);
    expect(levelMatches('C1', new Set())).toBe(true);
  });
});
