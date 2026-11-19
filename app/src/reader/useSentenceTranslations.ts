// תרגומי משפטים של הפרק הפתוח – משותף למצב קריאה (כפתור "תרגום כל המשפט" בבועה)
// ולמצב לימוד (🌐 ותרגום מקביל). תרגום מקביל מביא את כל הפרק בבקשה אחת לשרת;
// משפט בודד – רק אותו (ואם הפרק כבר תורגם, השרת מחזיר מהמטמון).

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { BookMeta } from '../../../shared/book';
import type { ChapterInfoResponse } from '../../../shared/translate';
import { friendlyError, getChapterInfo, translateChapter, translateSentence } from '../api';
import type { DeviceSettings } from '../deviceSettings';

export type SentenceTr = { state: 'loading' } | { state: 'done'; text: string } | { state: 'error'; error: string };

export function useSentenceTranslations(book: BookMeta, chapterIdx: number | null, settings: DeviceSettings) {
  const [byId, setById] = useState<Record<string, SentenceTr>>({});
  // checking = בודקים כמה הפרק עולה; confirm = פרק גדול שמחכה לאישור המשתמש
  const [chapterState, setChapterState] = useState<'idle' | 'checking' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
  const [info, setInfo] = useState<ChapterInfoResponse | null>(null);
  const [chapterError, setChapterError] = useState<string | null>(null);
  // מזהה "דור": תשובה שמגיעה אחרי מעבר פרק לא נכנסת לפרק החדש
  const gen = useRef(0);
  const engine = settings.engine || undefined;

  // פרק חדש (או ספר חדש / מנוע אחר) – מתחילים נקי
  useEffect(() => {
    gen.current++;
    setById({});
    setChapterState('idle');
    setChapterError(null);
    setInfo(null);
  }, [book.id, chapterIdx, engine]);

  const loadChapter = useCallback(async () => {
    if (chapterIdx === null) return;
    const g = gen.current;
    setChapterState('loading');
    setChapterError(null);
    try {
      const res = await translateChapter({ bookId: book.id, chapterIdx, engine });
      if (g !== gen.current) return;
      setById((prev) => {
        const next = { ...prev };
        for (const [sid, text] of Object.entries(res.translations)) next[sid] = { state: 'done', text };
        return next;
      });
      setChapterState('done');
    } catch (e) {
      if (g !== gen.current) return;
      setChapterState('error');
      setChapterError(friendlyError(e, 'התרגום נכשל'));
    }
  }, [book.id, chapterIdx, engine]);

  /**
   * תרגום מקביל אוטומטי: קודם בודקים בשרת כמה הפרק עולה. פרק שמור או קטן מתורגם מיד;
   * פרק גדול מחכה לאישור (confirmChapter), כדי לא לשרוף את המכסה בלי ידיעת המשתמש.
   */
  const requestChapter = useCallback(async () => {
    if (chapterIdx === null) return;
    const g = gen.current;
    setChapterState('checking');
    try {
      const i = await getChapterInfo(book.id, chapterIdx);
      if (g !== gen.current) return;
      setInfo(i);
      if (i.needsConfirm) {
        setChapterState('confirm');
        return;
      }
    } catch {
      /* אין מידע – ממשיכים כרגיל (השרת עדיין אוכף מכסות) */
    }
    if (g !== gen.current) return;
    await loadChapter();
  }, [book.id, chapterIdx, loadChapter]);

  const translateOne = useCallback(
    async (sid: string) => {
      if (chapterIdx === null) return;
      const g = gen.current;
      setById((prev) => (prev[sid]?.state === 'done' || prev[sid]?.state === 'loading' ? prev : { ...prev, [sid]: { state: 'loading' } }));
      try {
        const res = await translateSentence({ bookId: book.id, chapterIdx, sid, engine });
        if (g !== gen.current) return;
        setById((prev) => ({ ...prev, [sid]: { state: 'done', text: res.translation } }));
      } catch (e) {
        if (g !== gen.current) return;
        setById((prev) => ({ ...prev, [sid]: { state: 'error', error: friendlyError(e, 'התרגום נכשל') } }));
      }
    },
    [book.id, chapterIdx, engine],
  );

  /** תרגום של משפט: מה שיש, או "בטעינה" אם כל הפרק מתורגם כרגע */
  const get = (sid: string): SentenceTr | undefined => byId[sid] ?? (chapterState === 'loading' ? { state: 'loading' } : undefined);

  return { get, translateOne, loadChapter, requestChapter, chapterInfo: info, chapterState, chapterError };
}
