// סימניות והערות של ספר: נשמרות קודם במכשיר (IndexedDB) ונשלחות לשרת ברקע.
// בפתיחת ספר מושכים מהשרת הכול ומתמזגים (הכתיבה האחרונה גוברת; מחיקה לא חוזרת לחיים).

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { locateSentence, makeExcerpt, mergeAnnotations, type Annotation, type AnnotationKind } from '../../../shared/annotations';
import { parserVersionOf, type BookMeta, type Chapter } from '../../../shared/book';
import { getAnnotations, putAnnotations } from '../api';
import { idbGet, idbSet } from '../idb';

interface Stored {
  items: Annotation[];
  /** מזהים ששונו במכשיר ועוד לא הגיעו לשרת */
  dirty: string[];
}

const keyFor = (bookId: string) => `ann:${bookId}`;

export interface SentenceMarks {
  bookmark?: Annotation;
  note?: Annotation;
}

export function useAnnotations(book: BookMeta) {
  const [items, setItems] = useState<Annotation[]>([]);
  const state = useRef<Stored>({ items: [], dirty: [] });
  const pushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pv = parserVersionOf(book);

  const persist = () => idbSet(keyFor(book.id), state.current);
  const publish = () => setItems(state.current.items);

  const push = useCallback(
    async (keepalive = false) => {
      clearTimeout(pushTimer.current);
      const ids = new Set(state.current.dirty);
      if (!ids.size) return;
      const batch = state.current.items.filter((a) => ids.has(a.id));
      try {
        await putAnnotations(batch, keepalive);
        // מה שהשתנה שוב בזמן השליחה נשאר "מלוכלך"
        state.current.dirty = state.current.dirty.filter(
          (id) => !ids.has(id) || batch.find((b) => b.id === id) !== state.current.items.find((x) => x.id === id),
        );
        void persist();
      } catch {
        /* אין רשת – ננסה שוב בשינוי הבא או בפתיחה הבאה */
      }
    },
    [book.id],
  );

  const pull = useCallback(async () => {
    try {
      const remote = await getAnnotations(book.id);
      state.current.items = mergeAnnotations(state.current.items, remote);
      publish();
      void persist();
    } catch {
      /* בלי רשת – ממשיכים עם מה שבמכשיר */
    }
  }, [book.id]);

  // פתיחת ספר: מה שבמכשיר מיד, ואז מיזוג עם השרת ושליחת מה שלא נשלח
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await idbGet<Stored>(keyFor(book.id));
      if (cancelled) return;
      state.current = local ?? { items: [], dirty: [] };
      publish();
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
  }, [book.id]);

  const commit = (next: Annotation) => {
    state.current.items = mergeAnnotations(state.current.items, [next]);
    if (!state.current.dirty.includes(next.id)) state.current.dirty.push(next.id);
    publish();
    void persist();
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => void push(), 800);
  };

  const live = useMemo(() => items.filter((a) => !a.deleted), [items]);

  const find = (kind: AnnotationKind, sid: string) =>
    live.find((a) => a.kind === kind && (a.parserVersion === pv ? a.sentenceId === sid : false));

  const create = (kind: AnnotationKind, sid: string, sentence: string, text: string): Annotation => {
    const now = Date.now();
    return {
      id: `ann-${crypto.randomUUID()}`,
      bookId: book.id,
      kind,
      sentenceId: sid,
      parserVersion: pv,
      text,
      excerpt: makeExcerpt(sentence),
      createdAt: now,
      updatedAt: now,
      deleted: false,
    };
  };

  /** existing: הרשומה שכבר מסומנת על המשפט (גם אם אותרה לפי טקסט) – כדי לא ליצור כפילות */
  const toggleBookmark = (sid: string, sentence: string, existing?: Annotation) => {
    const cur = existing ?? find('bookmark', sid);
    if (cur) commit({ ...cur, deleted: true, updatedAt: Date.now() });
    else commit(create('bookmark', sid, sentence, ''));
  };

  /** שמירת הערה (טקסט ריק = מחיקה) */
  const saveNote = (sid: string, sentence: string, text: string, existing?: Annotation) => {
    const cur = existing ?? find('note', sid);
    const t = text.trim();
    if (!t) {
      if (cur) commit({ ...cur, deleted: true, updatedAt: Date.now() });
      return;
    }
    if (cur) commit({ ...cur, text: t, updatedAt: Date.now() });
    else commit(create('note', sid, sentence, t));
  };

  const remove = (a: Annotation) => commit({ ...a, deleted: true, updatedAt: Date.now() });

  /**
   * סימונים לפרק הפתוח: מזהה משפט → סימנייה/הערה. רשומות מגרסת פענוח אחרת
   * מאותרות לפי תחילת המשפט.
   */
  const marksFor = useCallback(
    (chapterIdx: number | null, chapter: Chapter | null): Map<string, SentenceMarks> => {
      const map = new Map<string, SentenceMarks>();
      if (chapterIdx === null || !chapter) return map;
      for (const a of live) {
        const sid = locateSentence(a, pv, [{ idx: chapterIdx, chapter }]);
        if (!sid || !sid.startsWith(`c${chapterIdx}.`)) continue;
        const m = map.get(sid) ?? {};
        m[a.kind] = a;
        map.set(sid, m);
      }
      return map;
    },
    [live, pv],
  );

  return { items: live, toggleBookmark, saveNote, remove, marksFor, parserVersion: pv };
}

export type AnnotationsApi = ReturnType<typeof useAnnotations>;
