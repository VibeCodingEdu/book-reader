// חישוב מועדי החזרה (FSRS) מתוך יומן החזרות, ובניית תור התרגול.
// הכול נגזר מהיומן: אותו יומן נותן אותם מועדים בכל מכשיר (בלי אקראיות – fuzz כבוי).

import { DefaultScheduler, type Grade } from 'ts-fsrs';
import type { Review, ReviewRating } from '../../../shared/review';
import type { SavedWord, WordStage } from '../../../shared/words';

const DAY = 86_400_000;

/** הגדרות האלגוריתם. שלבי למידה קצרים לפני המעבר לימים, כמו ב-Anki */
export const SCHEDULER_CONFIG = {
  desiredRetention: 0.9,
  enableFuzz: false,
  enableShortTerm: true,
  learningSteps: ['1m', '10m'],
  relearningSteps: ['10m'],
  allowModelOverride: false,
} as const;

/** מרווח (בימים) שממנו מילה נחשבת "כמעט ידועה" */
export const KNOWN_DAYS = 21;

/** החלק מ-ts-fsrs שבו משתמשים (הטיפוסים של הספרייה מסובכים מאוד; כאן מספיק המבנה הזה) */
interface FsrsCard {
  dueAt: Date;
  scheduledDays: number;
}
export interface Scheduler {
  newCard(o: { now: Date }): FsrsCard;
  review(o: { card: FsrsCard; grade: Grade; now: Date }): { card: FsrsCard };
  preview(o: { card: FsrsCard; now: Date }): Iterable<{ grade: number; card: FsrsCard }>;
}

let schedulerP: Promise<Scheduler> | null = null;
export const getScheduler = () =>
  (schedulerP ??= DefaultScheduler(SCHEDULER_CONFIG) as unknown as Promise<Scheduler>);

/** מצב מילה לתרגול */
export interface WordCard {
  /** כרטיס FSRS (פנימי) */
  card: FsrsCard;
  /** כמה פעמים תורגלה */
  reps: number;
  /** מועד החזרה הבא (ms); מילה שלא תורגלה – 0 */
  due: number;
  /** המרווח הנוכחי בימים */
  intervalDays: number;
  /** מתי תורגלה לראשונה (ms), או null */
  firstReviewAt: number | null;
}

/** מצב FSRS של מילה: משחזרים את כל הדירוגים שלה לפי הסדר */
export function cardFromReviews(s: Scheduler, reviews: Review[], createdAt: number): WordCard {
  let card = s.newCard({ now: new Date(reviews[0]?.reviewedAt ?? createdAt) });
  for (const r of reviews) card = s.review({ card, grade: r.rating as Grade, now: new Date(r.reviewedAt) }).card;
  return {
    card,
    reps: reviews.length,
    due: reviews.length ? new Date(card.dueAt).getTime() : 0,
    intervalDays: reviews.length ? card.scheduledDays : 0,
    firstReviewAt: reviews[0]?.reviewedAt ?? null,
  };
}

/** תצוגה מקדימה: לכל דירוג – בעוד כמה זמן (ms) המילה תחזור */
export function previewIntervals(s: Scheduler, wc: WordCard, now: number): Record<ReviewRating, number> {
  const out = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<ReviewRating, number>;
  for (const p of s.preview({ card: wc.card, now: new Date(now) })) {
    out[p.grade as ReviewRating] = new Date(p.card.dueAt).getTime() - now;
  }
  return out;
}

/** השלב של המילה לפי התרגול. מילה שלא תורגלה – נשאר מה שנקבע ידנית */
export function stageFromCard(wc: WordCard, manual: WordStage): WordStage {
  if (!wc.reps) return manual;
  return wc.intervalDays >= KNOWN_DAYS ? 'known' : 'learning';
}

/** תחילת היום המקומי של זמן נתון */
export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface QueueInfo {
  /** מילים שהגיע מועדן, הכי מאוחרות קודם (שלא יתיישנו) */
  due: SavedWord[];
  /** מילים חדשות להיום, לפי סדר השמירה */
  fresh: SavedWord[];
  /** כמה מילים חדשות כבר התחילו היום */
  newToday: number;
  /** כמה מילים חדשות נשארו בכלל (גם מעבר למכסה) */
  newTotal: number;
}

/**
 * תור התרגול: קודם המילים שהגיע מועדן, ואחריהן מילים חדשות עד המכסה היומית.
 * מילה שסומנה ידנית "כמעט ידועה" ולא תורגלה – לא נכנסת כחדשה.
 */
export function buildQueue(words: SavedWord[], cards: Map<string, WordCard>, now: number, newPerDay: number): QueueInfo {
  const today = startOfDay(now);
  const due: SavedWord[] = [];
  const freshAll: SavedWord[] = [];
  let newToday = 0;
  for (const w of words) {
    const c = cards.get(w.id);
    if (c && c.reps) {
      if (c.firstReviewAt !== null && c.firstReviewAt >= today) newToday++;
      if (c.due <= now) due.push(w);
    } else if (w.stage !== 'known') freshAll.push(w);
  }
  due.sort((a, b) => cards.get(a.id)!.due - cards.get(b.id)!.due);
  freshAll.sort((a, b) => a.createdAt - b.createdAt);
  const fresh = freshAll.slice(0, Math.max(0, newPerDay - newToday));
  return { due, fresh, newToday, newTotal: freshAll.length };
}

/** "בעוד..." קצר לכפתורי הדירוג */
export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} דק׳`;
  const hours = Math.round(min / 60);
  if (hours < 24) return hours === 1 ? 'שעה' : `${hours} שע׳`;
  const days = Math.round(ms / DAY);
  if (days < 30) return days === 1 ? 'יום' : `${days} ימים`;
  const months = Math.round(days / 30);
  if (months < 12) return months === 1 ? 'חודש' : `${months} חודשים`;
  const years = Math.round((days / 365) * 10) / 10;
  return years === 1 ? 'שנה' : `${years} שנים`;
}
