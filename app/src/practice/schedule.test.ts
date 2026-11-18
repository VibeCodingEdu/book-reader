import { describe, expect, it } from 'vitest';
import type { Review, ReviewRating } from '../../../shared/review';
import type { SavedWord } from '../../../shared/words';
import { buildQueue, cardFromReviews, formatInterval, getScheduler, KNOWN_DAYS, previewIntervals, stageFromCard, startOfDay, type WordCard } from './schedule';

const MIN = 60_000;
const DAY = 86_400_000;
const T0 = new Date(2026, 10, 2, 9, 0).getTime();

const rev = (i: number, rating: ReviewRating, at: number, wordId = 'word-aaaaaaaa'): Review => ({ id: `rev-${String(i).padStart(8, '0')}`, wordId, rating, reviewedAt: at });
const word = (id: string, over: Partial<SavedWord> = {}): SavedWord => ({
  id, bookId: 'b', bookTitle: 'B', sentenceId: 'c0.p0.s0', parserVersion: 1, wordOffset: 0, unit: id, unitType: 'word', lemma: id,
  pos: '', ipa: '', meaning: 'm', sentence: 's', stage: 'new', createdAt: T0 - DAY, updatedAt: T0 - DAY, deleted: false, ...over,
});

/** מתרגל לפי רצף דירוגים, כל פעם בדיוק במועד */
async function play(ratings: ReviewRating[]): Promise<{ wc: WordCard; reviews: Review[] }> {
  const s = await getScheduler();
  const reviews: Review[] = [];
  let at = T0;
  let wc = cardFromReviews(s, reviews, T0);
  ratings.forEach((r, i) => {
    reviews.push(rev(i, r, at));
    wc = cardFromReviews(s, reviews, T0);
    at = wc.due;
  });
  return { wc, reviews };
}

describe('FSRS – מועדי החזרה', () => {
  it('מילה חדשה: שלבי למידה של דקה ו-10 דקות לפני ימים', async () => {
    const s = await getScheduler();
    const p = previewIntervals(s, cardFromReviews(s, [], T0), T0);
    expect(p[1]).toBe(1 * MIN);
    expect(p[3]).toBe(10 * MIN);
    expect(p[4]).toBeGreaterThan(DAY); // "קל" מדלג על שלבי הלמידה
  });
  it('טוב-טוב עובר לימים, והמרווח גדל', async () => {
    const a = await play([3, 3]);
    const b = await play([3, 3, 3]);
    expect(a.wc.intervalDays).toBeGreaterThanOrEqual(1);
    expect(b.wc.intervalDays).toBeGreaterThan(a.wc.intervalDays);
  });
  it('שכחה ("שוב") מחזירה ללמידה של 10 דקות', async () => {
    const { wc } = await play([3, 3, 3, 1]);
    // ה"שוב" ניתן בדיוק במועד הקודם, והמילה חוזרת אחרי 10 דקות
    expect(wc.due - (await play([3, 3, 3])).wc.due).toBe(10 * MIN);
    expect(stageFromCard(wc, 'new')).toBe('learning');
  });
  it('אותו יומן – אותו מועד (בכל מכשיר)', async () => {
    const s = await getScheduler();
    const { reviews } = await play([3, 2, 3, 1, 3]);
    const x = cardFromReviews(s, reviews, T0);
    const y = cardFromReviews(s, [...reviews].reverse().reverse(), T0);
    expect(x.due).toBe(y.due);
    expect(x.intervalDays).toBe(y.intervalDays);
  });
});

describe('stageFromCard', () => {
  it('בלי תרגול – לפי הסימון הידני', async () => {
    const s = await getScheduler();
    expect(stageFromCard(cardFromReviews(s, [], T0), 'known')).toBe('known');
  });
  it('מרווח קצר – בלמידה; ארוך – כמעט ידועה', async () => {
    expect(stageFromCard((await play([3])).wc, 'new')).toBe('learning');
    const long = await play([4, 4, 4, 4]);
    expect(long.wc.intervalDays).toBeGreaterThanOrEqual(KNOWN_DAYS);
    expect(stageFromCard(long.wc, 'new')).toBe('known');
  });
});

describe('buildQueue', () => {
  it('קודם מועד, אחר כך חדשות עד המכסה', async () => {
    const s = await getScheduler();
    const words = [word('word-due00001'), word('word-new00001'), word('word-new00002'), word('word-new00003')];
    const cards = new Map<string, WordCard>();
    // מילה שתורגלה אתמול והגיע מועדה
    cards.set('word-due00001', cardFromReviews(s, [rev(1, 3, T0 - DAY, 'word-due00001')], T0));
    const q = buildQueue(words, cards, T0 + 10 * MIN, 2);
    expect(q.due.map((w) => w.id)).toEqual(['word-due00001']);
    expect(q.fresh.map((w) => w.id)).toEqual(['word-new00001', 'word-new00002']);
    expect(q.newTotal).toBe(3);
  });
  it('מילים חדשות שהתחילו היום נספרות במכסה', async () => {
    const s = await getScheduler();
    const words = [word('word-a0000001'), word('word-b0000001'), word('word-c0000001')];
    const cards = new Map<string, WordCard>([['word-a0000001', cardFromReviews(s, [rev(1, 3, T0, 'word-a0000001')], T0)]]);
    const q = buildQueue(words, cards, T0 + MIN, 2);
    expect(q.newToday).toBe(1);
    expect(q.fresh).toHaveLength(1);
  });
  it('"כמעט ידועה" ידנית לא נכנסת כחדשה', () => {
    const q = buildQueue([word('word-k0000001', { stage: 'known' })], new Map(), T0, 10);
    expect(q.fresh).toHaveLength(0);
  });
  it('תחילת יום מקומית', () => {
    expect(new Date(startOfDay(T0)).getHours()).toBe(0);
  });
});

describe('formatInterval', () => {
  it.each([
    [MIN, '1 דק׳'],
    [10 * MIN, '10 דק׳'],
    [60 * MIN, 'שעה'],
    [5 * 60 * MIN, '5 שע׳'],
    [DAY, 'יום'],
    [3 * DAY, '3 ימים'],
    [60 * DAY, '2 חודשים'],
    [365 * DAY, 'שנה'],
  ])('%i → %s', (ms, s) => expect(formatInterval(ms)).toBe(s));
});
