// הכול מה שהתרגול צריך: המילים, היומן, ומצב ה-FSRS של כל מילה (מחושב מהיומן).

import { useEffect, useMemo, useState } from 'preact/hooks';
import { reviewsByWord, type ReviewRating } from '../../../shared/review';
import type { SavedWord } from '../../../shared/words';
import { useWords } from '../useWords';
import { buildQueue, cardFromReviews, getScheduler, stageFromCard, type Scheduler, type WordCard } from './schedule';
import { useReviews } from './useReviews';

export function usePractice(newPerDay: number) {
  const words = useWords();
  const reviews = useReviews();
  const [scheduler, setScheduler] = useState<Scheduler | null>(null);
  // שעון שמתקדם כל דקה, כדי שמילה שהגיע מועדה תיכנס לתור גם בלי פעולה
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    getScheduler().then((s) => alive && setScheduler(s));
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const cards = useMemo(() => {
    const map = new Map<string, WordCard>();
    if (!scheduler) return map;
    const byWord = reviewsByWord(reviews.items);
    for (const w of words.items) map.set(w.id, cardFromReviews(scheduler, byWord.get(w.id) ?? [], w.createdAt));
    return map;
  }, [scheduler, words.items, reviews.items]);

  const queue = useMemo(() => buildQueue(words.items, cards, now, newPerDay), [words.items, cards, now, newPerDay]);

  /** דירוג מילה: נכנס ליומן, ואם השלב השתנה – מעדכנים גם את המילה (מסונכרן לכל המכשירים) */
  const rate = (w: SavedWord, rating: ReviewRating): WordCard | null => {
    if (!scheduler) return null;
    const at = Date.now();
    const r = reviews.add(w.id, rating, at);
    const mine = [...(reviewsByWord(reviews.items).get(w.id) ?? []), r];
    const wc = cardFromReviews(scheduler, mine, w.createdAt);
    const stage = stageFromCard(wc, w.stage);
    if (stage !== w.stage) words.setStage(w, stage);
    setNow(at);
    return wc;
  };

  const ready = !!scheduler && words.loaded && reviews.loaded;
  return { words, scheduler, cards, queue, rate, ready, now, refresh: () => setNow(Date.now()) };
}
