import { describe, expect, it } from 'vitest';
import type { SavedWord } from '../../../shared/words';
import { pickChoices } from './choices';

const w = (n: number, meaning = `משמעות ${n}`): SavedWord => ({
  id: `word-0000000${n}`, bookId: 'b', bookTitle: 'B', sentenceId: 'c0.p0.s0', parserVersion: 1, wordOffset: 0, unit: `w${n}`, unitType: 'word',
  lemma: `w${n}`, pos: '', ipa: '', meaning, sentence: 's', stage: 'new', createdAt: n, updatedAt: n, deleted: false,
});

describe('pickChoices', () => {
  const all = [1, 2, 3, 4, 5, 6].map((n) => w(n));
  it('4 אפשרויות שונות, כולל הנכונה', () => {
    const c = pickChoices(all[0], all)!;
    expect(c).toHaveLength(4);
    expect(new Set(c.map((x) => x.id)).size).toBe(4);
    expect(c.some((x) => x.id === all[0].id)).toBe(true);
  });
  it('יציב: אותו כרטיס – אותו סדר', () => {
    expect(pickChoices(all[2], all)).toEqual(pickChoices(all[2], all));
  });
  it('פחות מ-4 מילים – null', () => {
    expect(pickChoices(all[0], all.slice(0, 3))).toBeNull();
  });
  it('משמעויות זהות לא נספרות פעמיים', () => {
    const dup = [w(1, 'שער'), w(2, 'שער'), w(3, 'שער!'), w(4, 'דלת')];
    expect(pickChoices(dup[0], dup)).toBeNull();
  });
});
