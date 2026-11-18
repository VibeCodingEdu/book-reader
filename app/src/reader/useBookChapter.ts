// טעינת פרקים ומיקום קריאה – משותף למצב קריאה ולמצב לימוד (M2).
// מיקום ההתחלה (החדש מבין המכשיר והשרת), שמירת מיקום, טעינה מוקדמת של הפרק הבא,
// ומעבר בין פרקים.

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { parseSentenceId, sentenceId, type BookMeta, type Chapter } from '../../../shared/book';
import { ApiError, getChapter } from '../api';
import { createPositionSaver, resolveStartPosition } from '../position';

/** לאן לקפוץ אחרי שפרק נטען: משפט עוגן, או סוף הפרק (בדפדוף אחורה) */
export type Target = { anchor: string | null } | { end: true };

export function useBookChapter(book: BookMeta, onLoadStart: () => void, startSid?: string) {
  const [chapterIdx, setChapterIdx] = useState<number | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** המשפט הנוכחי (לחישוב התקדמות) */
  const [posSid, setPosSid] = useState<string | null>(null);

  // גם ב-ref: לחיצות מהירות ברצף לא יקראו ערך ישן
  const chapterIdxRef = useRef<number | null>(null);
  const loadingRef = useRef(false);
  const targetRef = useRef<Target>({ anchor: null });
  const onLoadStartRef = useRef(onLoadStart);
  onLoadStartRef.current = onLoadStart;

  const saver = useMemo(() => createPositionSaver(book.id), [book.id]);
  useEffect(() => () => saver.dispose(), [saver]);
  /** שמירת מיקום (מקומית מיד, לשרת בהשהיה) ועדכון ההתקדמות המוצגת */
  const savePosition = useCallback(
    (sid: string) => {
      saver.save(sid);
      setPosSid(sid);
    },
    [saver],
  );

  const loadChapter = useCallback(
    async (idx: number, target: Target) => {
      setError(null);
      onLoadStartRef.current();
      targetRef.current = target;
      loadingRef.current = true;
      try {
        const ch = await getChapter(book.id, idx);
        chapterIdxRef.current = idx;
        setChapterIdx(idx);
        setChapter(ch);
        // טעינה מוקדמת של הפרק הבא
        if (idx + 1 < book.chapterCount) getChapter(book.id, idx + 1).catch(() => {});
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'שגיאה בטעינת הפרק');
      } finally {
        loadingRef.current = false;
      }
    },
    [book],
  );

  // מיקום התחלה: משפט שהתבקש (למשל מרשימת המילים), או המיקום השמור
  useEffect(() => {
    let cancelled = false;
    const wanted = startSid ? parseSentenceId(startSid) : null;
    if (wanted && wanted.c < book.chapterCount) {
      savePosition(startSid!);
      loadChapter(wanted.c, { anchor: startSid! });
      return;
    }
    resolveStartPosition(book.id).then((pos) => {
      if (cancelled) return;
      const parsed = pos ? parseSentenceId(pos.sentenceId) : null;
      const idx = parsed && parsed.c < book.chapterCount ? parsed.c : 0;
      if (parsed) setPosSid(pos!.sentenceId);
      loadChapter(idx, { anchor: parsed ? pos!.sentenceId : null });
    });
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  /** קפיצה לתחילת פרק (תוכן עניינים, או "הבא" בסוף פרק) */
  const jumpToChapter = useCallback(
    (idx: number) => {
      const first = sentenceId(idx, 0, 0);
      savePosition(first);
      loadChapter(idx, { anchor: first });
    },
    [savePosition, loadChapter],
  );

  /** קפיצה למשפט (מתוכן העניינים: סימנייה או הערה) */
  const jumpToSentence = useCallback(
    (sid: string) => {
      const pos = parseSentenceId(sid);
      if (!pos || pos.c >= book.chapterCount) return;
      savePosition(sid);
      loadChapter(pos.c, { anchor: sid });
    },
    [savePosition, loadChapter, book.chapterCount],
  );

  /** לפרק הבא; false אם אין (או שפרק עדיין נטען) */
  const nextChapter = useCallback((): boolean => {
    const ci = chapterIdxRef.current;
    if (ci === null || loadingRef.current || ci + 1 >= book.chapterCount) return false;
    jumpToChapter(ci + 1);
    return true;
  }, [book.chapterCount, jumpToChapter]);

  /** לסוף הפרק הקודם; false אם אין */
  const prevChapterAtEnd = useCallback((): boolean => {
    const ci = chapterIdxRef.current;
    if (ci === null || loadingRef.current || ci <= 0) return false;
    loadChapter(ci - 1, { end: true });
    return true;
  }, [loadChapter]);

  /** אפשר לדפדף? (פרק טעון ולא באמצע טעינה) */
  const canNavigate = () => chapterIdxRef.current !== null && !loadingRef.current;

  return {
    chapterIdx,
    chapter,
    error,
    loadChapter,
    jumpToChapter,
    nextChapter,
    prevChapterAtEnd,
    canNavigate,
    targetRef,
    savePosition,
    jumpToSentence,
    posSid,
  };
}
