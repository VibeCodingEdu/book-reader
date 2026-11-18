// המילים השמורות: נשמרות קודם במכשיר (IndexedDB) ונשלחות לשרת ברקע, כמו הסימניות וההערות.
// בפתיחה מושכים מהשרת הכול ומתמזגים (הכתיבה האחרונה גוברת; מחיקה לא חוזרת לחיים).
// הרשימה אחת לכל הספרים.

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { parserVersionOf, type BookMeta } from '../../shared/book';
import type { WordLookup } from '../../shared/translate';
import { mergeWords, type SavedWord, type WordStage } from '../../shared/words';
import { getWords, putWords } from './api';
import { idbGet, idbSet } from './idb';
import { buildIndex, type SavedIndex } from './savedWords';

interface Stored {
  items: SavedWord[];
  /** מזהים ששונו במכשיר ועוד לא הגיעו לשרת */
  dirty: string[];
}

const KEY = 'words';

/** מה שנדרש כדי לשמור את המילה שנלחצה */
export interface SaveInput {
  book: BookMeta;
  sid: string;
  offset: number;
  sentence: string;
  result: WordLookup;
}

export function useWords() {
  const [items, setItems] = useState<SavedWord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const state = useRef<Stored>({ items: [], dirty: [] });
  const pushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const persist = () => idbSet(KEY, state.current);
  const publish = () => setItems(state.current.items);

  const push = useCallback(async (keepalive = false) => {
    clearTimeout(pushTimer.current);
    const ids = new Set(state.current.dirty);
    if (!ids.size) return;
    const batch = state.current.items.filter((w) => ids.has(w.id));
    try {
      for (let i = 0; i < batch.length; i += 500) await putWords(batch.slice(i, i + 500), keepalive);
      // מה שהשתנה שוב בזמן השליחה נשאר "מלוכלך"
      state.current.dirty = state.current.dirty.filter(
        (id) => !ids.has(id) || batch.find((b) => b.id === id) !== state.current.items.find((x) => x.id === id),
      );
      void persist();
    } catch {
      /* אין רשת – ננסה שוב בשינוי הבא או בפתיחה הבאה */
    }
  }, []);

  const pull = useCallback(async () => {
    try {
      const remote = await getWords();
      state.current.items = mergeWords(state.current.items, remote);
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
      state.current = local ?? { items: [], dirty: [] };
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

  const commit = (next: SavedWord) => {
    state.current.items = mergeWords(state.current.items, [next]);
    if (!state.current.dirty.includes(next.id)) state.current.dirty.push(next.id);
    publish();
    void persist();
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => void push(), 800);
  };

  const live = useMemo(() => items.filter((w) => !w.deleted), [items]);
  const index: SavedIndex = useMemo(() => buildIndex(live), [live]);

  /** שמירת המילה שנלחצה. אם כבר שמורה באותו מקום – מחזיר אותה (בלי כפילות) */
  const save = (inp: SaveInput): SavedWord => {
    const dup = live.find((w) => w.bookId === inp.book.id && w.sentenceId === inp.sid && w.wordOffset === inp.offset);
    if (dup) return dup;
    const now = Date.now();
    const w: SavedWord = {
      id: `word-${crypto.randomUUID()}`,
      bookId: inp.book.id,
      bookTitle: inp.book.title,
      sentenceId: inp.sid,
      parserVersion: parserVersionOf(inp.book),
      wordOffset: inp.offset,
      unit: inp.result.unit,
      unitType: inp.result.unitType,
      lemma: inp.result.lemma,
      pos: inp.result.pos,
      ipa: inp.result.ipa,
      meaning: inp.result.contextMeaning,
      sentence: inp.sentence,
      stage: 'new',
      createdAt: now,
      updatedAt: now,
      deleted: false,
    };
    commit(w);
    return w;
  };

  const remove = (w: SavedWord) => commit({ ...w, deleted: true, updatedAt: Date.now() });
  const update = (w: SavedWord, patch: Partial<Pick<SavedWord, 'meaning' | 'stage'>>) =>
    commit({ ...w, ...patch, updatedAt: Date.now() });
  const setStage = (w: SavedWord, stage: WordStage) => update(w, { stage });

  return { items: live, index, loaded, save, remove, update, setStage };
}

export type WordsApi = ReturnType<typeof useWords>;
