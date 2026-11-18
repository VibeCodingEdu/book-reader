import { describe, expect, it } from 'vitest';
import { locateSentence, makeExcerpt, mergeAnnotations, validateAnnotation, type Annotation } from './annotations';
import type { Chapter } from './book';
import { bookPercent, chapterFraction } from './progress';

const base = (over: Partial<Annotation>): Annotation => ({
  id: 'ann-0000001',
  bookId: 'gutenberg-11',
  kind: 'note',
  sentenceId: 'c1.p0.s0',
  parserVersion: 1,
  text: 'הערה',
  excerpt: 'Alice was beginning',
  createdAt: 100,
  updatedAt: 100,
  deleted: false,
  ...over,
});

describe('mergeAnnotations – שני מכשירים', () => {
  it('הכתיבה האחרונה גוברת', () => {
    const phone = [base({ text: 'מהטלפון', updatedAt: 200 })];
    const boox = [base({ text: 'מה-Boox', updatedAt: 300 })];
    expect(mergeAnnotations(phone, boox)[0].text).toBe('מה-Boox');
    expect(mergeAnnotations(boox, phone)[0].text).toBe('מה-Boox');
  });

  it('מחיקה לא חוזרת לחיים מהמכשיר שלא שמע עליה', () => {
    const deletedOnPhone = [base({ deleted: true, updatedAt: 500 })];
    const oldOnBoox = [base({ updatedAt: 100 })];
    const merged = mergeAnnotations(oldOnBoox, deletedOnPhone);
    expect(merged).toHaveLength(1);
    expect(merged[0].deleted).toBe(true);
  });

  it('בשוויון זמנים – המחיקה גוברת', () => {
    expect(mergeAnnotations([base({ updatedAt: 7 })], [base({ updatedAt: 7, deleted: true })])[0].deleted).toBe(true);
  });

  it('רשומות שונות משני המכשירים – שתיהן נשמרות', () => {
    const merged = mergeAnnotations([base({ id: 'ann-phone01', createdAt: 1 })], [base({ id: 'ann-boox001', createdAt: 2 })]);
    expect(merged.map((a) => a.id)).toEqual(['ann-phone01', 'ann-boox001']);
  });
});

describe('validateAnnotation', () => {
  it('רשומה תקינה', () => expect(validateAnnotation(base({}))).toBeNull());
  it('דוחה סוג, מזהה ומשפט לא תקינים', () => {
    expect(validateAnnotation(base({ kind: 'x' as never }))).not.toBeNull();
    expect(validateAnnotation(base({ id: '../x' }))).not.toBeNull();
    expect(validateAnnotation(base({ sentenceId: 'nope' }))).not.toBeNull();
    expect(validateAnnotation(base({ text: 'x'.repeat(5001) }))).not.toBeNull();
  });
});

const ch: Chapter = {
  title: 'One',
  paragraphs: [
    ['Alice was beginning to get very tired.', 'She sat down.'],
    ['Then a rabbit ran by, and it was late.'],
  ],
};

describe('locateSentence', () => {
  it('אותה גרסת פענוח – לפי המזהה', () => {
    expect(locateSentence({ sentenceId: 'c1.p1.s0', parserVersion: 2, excerpt: 'whatever' }, 2, [])).toBe('c1.p1.s0');
  });
  it('גרסה אחרת – מוצא לפי הטקסט, גם אם המזהה זז', () => {
    const a = { sentenceId: 'c1.p0.s5', parserVersion: 1, excerpt: makeExcerpt('Then a rabbit ran by, and it was late.') };
    expect(locateSentence(a, 2, [{ idx: 1, chapter: ch }])).toBe('c1.p1.s0');
  });
  it('גרסה אחרת והטקסט לא נמצא – null', () => {
    expect(locateSentence({ sentenceId: 'c1.p0.s0', parserVersion: 1, excerpt: 'Nothing like this' }, 2, [{ idx: 1, chapter: ch }])).toBeNull();
  });
});

describe('התקדמות', () => {
  it('חלק מהפרק לפי מילים', () => {
    // 7 + 3 + 9 = 19 מילים; לפני c1.p1.s0 יש 10
    expect(chapterFraction(ch, 'c1.p1.s0')).toBeCloseTo(10 / 19);
    expect(chapterFraction(ch, 'c1.p0.s0')).toBe(0);
  });
  it('אחוז מהספר לפי מילים בכל פרק', () => {
    expect(bookPercent([100, 300, 600], 1, 0.5)).toBe(25); // (100 + 150) / 1000
    expect(bookPercent([100, 300, 600], 2, 1)).toBe(100);
    expect(bookPercent(undefined, 0, 0.5)).toBeNull();
  });
});
