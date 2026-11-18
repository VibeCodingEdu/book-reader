// יומן החזרות: נשמר קודם במכשיר (IndexedDB) ונשלח לשרת ברקע.
// משיכה מהשרת לפי מונה (after), כך שמורידים רק שורות חדשות.

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { mergeReviews, type Review, type ReviewRating } from '../../../shared/review';
import { getReviewsAfter, postReviews } from '../api';
import { idbGet, idbSet } from '../idb';

interface Stored {
  items: Review[];
  /** מזהים שעוד לא הגיעו לשרת */
  pending: string[];
  /** המונה האחרון שהתקבל מהשרת */
  after: number;
}

const KEY = 'reviews';

export function useReviews() {
  const [items, setItems] = useState<Review[]>([]);
  const [loaded, setLoaded] = useState(false);
  const state = useRef<Stored>({ items: [], pending: [], after: 0 });
  const pushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const persist = () => idbSet(KEY, state.current);
  const publish = () => setItems(state.current.items);

  const push = useCallback(async (keepalive = false) => {
    clearTimeout(pushTimer.current);
    const ids = new Set(state.current.pending);
    if (!ids.size) return;
    const batch = state.current.items.filter((r) => ids.has(r.id));
    try {
      for (let i = 0; i < batch.length; i += 500) await postReviews(batch.slice(i, i + 500), keepalive);
      state.current.pending = state.current.pending.filter((id) => !ids.has(id));
      void persist();
    } catch {
      /* אין רשת – ננסה שוב בדירוג הבא או בפתיחה הבאה */
    }
  }, []);

  const pull = useCallback(async () => {
    try {
      let more = true;
      while (more) {
        const res = await getReviewsAfter(state.current.after);
        state.current.items = mergeReviews(state.current.items, res.items);
        state.current.after = res.last;
        more = res.more;
      }
      publish();
      void persist();
    } catch {
      /* בלי רשת – ממשיכים עם מה שבמכשיר */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await idbGet<Stored>(KEY);
      if (cancelled) return;
      state.current = local ?? { items: [], pending: [], after: 0 };
      publish();
      setLoaded(true);
      await pull();
      if (!cancelled) await push();
    })();
    const onVis = () => {
      if (document.visibilityState === 'hidden') void push(true);
      else void pull();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void push(true);
    };
  }, []);

  /** דירוג חדש: נכנס ליומן מיד ונשלח לשרת בעוד רגע */
  const add = (wordId: string, rating: ReviewRating, at = Date.now()): Review => {
    const r: Review = { id: `rev-${crypto.randomUUID()}`, wordId, rating, reviewedAt: at };
    state.current.items = mergeReviews(state.current.items, [r]);
    state.current.pending.push(r.id);
    publish();
    void persist();
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => void push(), 1500);
    return r;
  };

  return { items, loaded, add };
}
