import { describe, expect, it } from 'vitest';
import { inflections, mergeWords, validateWord, type SavedWord } from './words';

const base = (over: Partial<SavedWord> = {}): SavedWord => ({
  id: 'word-0000001',
  bookId: 'gutenberg-11',
  bookTitle: 'Alice',
  sentenceId: 'c1.p0.s0',
  parserVersion: 1,
  wordOffset: 4,
  unit: 'broke out',
  unitType: 'phrasal_verb',
  lemma: 'break out',
  pos: 'פועל',
  ipa: '/breɪk aʊt/',
  meaning: 'פרצה',
  sentence: 'A fight broke out.',
  stage: 'new',
  createdAt: 100,
  updatedAt: 100,
  deleted: false,
  ...over,
});

describe('mergeWords – שני מכשירים', () => {
  it('הכתיבה האחרונה גוברת', () => {
    const a = [base({ meaning: 'מהטלפון', updatedAt: 200 })];
    const b = [base({ meaning: 'מה-Boox', updatedAt: 300 })];
    expect(mergeWords(a, b)[0].meaning).toBe('מה-Boox');
    expect(mergeWords(b, a)[0].meaning).toBe('מה-Boox');
  });
  it('מחיקה לא חוזרת לחיים מגרסה ישנה', () => {
    const del = base({ deleted: true, updatedAt: 300 });
    expect(mergeWords([del], [base({ updatedAt: 200 })])[0].deleted).toBe(true);
  });
  it('בשוויון זמנים המחיקה גוברת', () => {
    expect(mergeWords([base()], [base({ deleted: true })])[0].deleted).toBe(true);
  });
  it('מילים שונות נשמרות יחד', () => {
    expect(mergeWords([base()], [base({ id: 'word-0000002' })])).toHaveLength(2);
  });
});

describe('validateWord', () => {
  it('רשומה תקינה', () => expect(validateWord(base())).toBeNull());
  it.each([
    ['מזהה', { id: 'x' }],
    ['משפט', { sentenceId: 'oops' }],
    ['סוג', { unitType: 'verb' as never }],
    ['שלב', { stage: 'mastered' as never }],
    ['משמעות ארוכה', { meaning: 'א'.repeat(501) }],
    ['מילה ריקה', { unit: '  ' }],
  ])('דוחה %s לא תקין', (_n, over) => expect(validateWord(base(over))).not.toBeNull());
});

describe('inflections', () => {
  it('נטיות רגילות', () => {
    const f = inflections('walk');
    for (const x of ['walk', 'walks', 'walked', 'walking']) expect(f.has(x)).toBe(true);
  });
  it('סיומת e', () => {
    const f = inflections('love');
    for (const x of ['loves', 'loved', 'loving']) expect(f.has(x)).toBe(true);
  });
  it('y → ies/ied', () => {
    const f = inflections('carry');
    for (const x of ['carries', 'carried', 'carrying']) expect(f.has(x)).toBe(true);
  });
  it('הכפלת עיצור', () => {
    const f = inflections('stop');
    for (const x of ['stopped', 'stopping']) expect(f.has(x)).toBe(true);
  });
  it('צורה נטויה מתאימה גם לבסיס שלה', () => {
    expect(inflections('walked').has('walk')).toBe(true);
    expect(inflections('carried').has('carry')).toBe(true);
    expect(inflections('loving').has('love')).toBe(true);
  });
  it('מילים קצרות ולא-אותיות לא מתנפחות', () => {
    expect(inflections('a').size).toBe(1);
    expect(inflections("don't").size).toBe(1);
  });
});
