import { describe, expect, it } from 'vitest';
import type { SavedWord } from '../../shared/words';
import { buildIndex, matchSentence, savedAt, unitOffsets } from './savedWords';

const w = (unit: string, lemma = unit, over: Partial<SavedWord> = {}): SavedWord => ({
  id: `word-${unit.replace(/\W/g, '')}1234`,
  bookId: 'b',
  bookTitle: 'B',
  sentenceId: 'c0.p0.s0',
  parserVersion: 1,
  wordOffset: 0,
  unit,
  unitType: unit.includes(' ') ? 'phrasal_verb' : 'word',
  lemma,
  pos: '',
  ipa: '',
  meaning: 'x',
  sentence: '',
  stage: 'new',
  createdAt: 1,
  updatedAt: 1,
  deleted: false,
  ...over,
});

describe('matchSentence', () => {
  it('מילה בודדת – כולל נטיות', () => {
    const idx = buildIndex([w('walk')]);
    const m = matchSentence(idx, 'She walked home and walks daily, walking fast.');
    expect(m.map((x) => x.offsets.length)).toEqual([1, 1, 1]);
  });
  it('לא מתאים מילים אחרות', () => {
    const idx = buildIndex([w('walk')]);
    expect(matchSentence(idx, 'The wall stood tall.')).toHaveLength(0);
  });
  it('ביטוי – רק כשכל המילים ברצף', () => {
    const idx = buildIndex([w('broke out', 'break out')]);
    expect(matchSentence(idx, 'A fight broke out.')[0].offsets).toHaveLength(2);
    expect(matchSentence(idx, 'The glass broke and he went out.')).toHaveLength(0);
  });
  it('צורת מילון של ביטוי תופסת נטיה אחרת', () => {
    const idx = buildIndex([w('broke out', 'break out')]);
    expect(matchSentence(idx, 'Wars break out often.')).toHaveLength(1);
  });
  it('מעדיף את היחידה הארוכה', () => {
    const idx = buildIndex([w('broke'), w('broke out', 'break out')]);
    const m = matchSentence(idx, 'A fight broke out.');
    expect(m).toHaveLength(1);
    expect(m[0].word.unit).toBe('broke out');
  });
  it('מילים מחוקות לא מסומנות', () => {
    const idx = buildIndex([w('walk', 'walk', { deleted: true })]);
    expect(matchSentence(idx, 'walk')).toHaveLength(0);
  });
  it('שם בבעלות (Alice\'s) מתאים לשם', () => {
    const idx = buildIndex([w('Alice')]);
    expect(matchSentence(idx, "Alice's cat")).toHaveLength(1);
  });
  it('savedAt מוצא לפי מיקום', () => {
    const idx = buildIndex([w('walk')]);
    expect(savedAt(idx, 'She walked.', 4)?.word.unit).toBe('walk');
    expect(savedAt(idx, 'She walked.', 0)).toBeUndefined();
  });
});

describe('unitOffsets', () => {
  it('ביטוי במשפט שבו נשמר', () => {
    const word = w('broke out', 'break out', { sentence: 'A fight broke out.', wordOffset: 8 });
    expect(unitOffsets(word)).toEqual([8, 14]);
  });
  it('מופע חוזר – זה שנלחץ', () => {
    const word = w('walk', 'walk', { sentence: 'I walk and you walk.', wordOffset: 15 });
    expect(unitOffsets(word)).toEqual([15]);
  });
  it('לא נמצא – המילה שנלחצה', () => {
    const word = w('xyz', 'xyz', { sentence: 'Nothing here.', wordOffset: 3 });
    expect(unitOffsets(word)).toEqual([3]);
  });
});
