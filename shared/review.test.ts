import { describe, expect, it } from 'vitest';
import { mergeReviews, reviewsByWord, validateReview, type Review } from './review';

const T = Date.UTC(2026, 10, 1);
const r = (id: string, over: Partial<Review> = {}): Review => ({ id: `rev-${id}000000`, wordId: 'word-aaaaaaaa', rating: 3, reviewedAt: T, ...over });

describe('mergeReviews', () => {
  it('מאחד בלי כפילויות', () => {
    const m = mergeReviews([r('1'), r('2', { reviewedAt: T + 5 })], [r('2', { reviewedAt: T + 5 }), r('3', { reviewedAt: T + 1 })]);
    expect(m.map((x) => x.id)).toEqual(['rev-1000000', 'rev-3000000', 'rev-2000000']);
  });
  it('חזרות משני מכשירים נשמרות שתיהן', () => {
    expect(mergeReviews([r('a')], [r('b')])).toHaveLength(2);
  });
});

describe('validateReview', () => {
  it('תקינה', () => expect(validateReview(r('1'))).toBeNull());
  it.each([
    ['דירוג', { rating: 5 as never }],
    ['מזהה', { id: 'x' }],
    ['מילה', { wordId: 'x' }],
    ['זמן ישן', { reviewedAt: Date.UTC(2020, 0, 1) }],
    ['זמן עתידי', { reviewedAt: Date.now() + 3 * 86_400_000 }],
  ])('דוחה %s', (_n, over) => expect(validateReview(r('1', over))).not.toBeNull());
});

describe('reviewsByWord', () => {
  it('מקבץ וממיין לפי זמן', () => {
    const m = reviewsByWord([r('2', { reviewedAt: T + 9 }), r('1'), r('3', { wordId: 'word-bbbbbbbb' })]);
    expect(m.get('word-aaaaaaaa')!.map((x) => x.id)).toEqual(['rev-1000000', 'rev-2000000']);
    expect(m.get('word-bbbbbbbb')).toHaveLength(1);
  });
});
