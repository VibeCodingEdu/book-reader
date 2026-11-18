// הקראת פרק (Google TTS) עם סימון מילה-מילה.
//
// הכנה: מבקשים מהשרת את תכנית הפרק, מורידים את כל קטעי השמע (השרת מסנתז את מה שחסר ושומר ב-R2),
// ומחברים אותם לקובץ MP3 אחד. קובץ אחד לפרק = ההשמעה יכולה להמשיך באייפון גם כשהמסך כבוי.
// הפרק המוכן נשמר גם במכשיר (IndexedDB), ופתיחה חוזרת לא מורידה שוב.
// השמעה: אלמנט audio אחד. בכל פריים בודקים באיזו מילה אנחנו, ומסמנים אותה בטקסט (ישירות ב-DOM).

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { buildTimeline, wordIndexAt, type SegmentMeta, type Timeline } from '../../../shared/audioTimeline';
import { parserVersionOf, type BookMeta } from '../../../shared/book';
import { fetchTtsAudio, friendlyError, getTtsPlan, postTtsSegment, type TtsChapterRef } from '../api';
import { idbGet, idbSet } from '../idb';

export type TtsStatus = 'idle' | 'preparing' | 'ready' | 'error';
export const TTS_RATES = [0.5, 0.75, 0.9, 1, 1.15, 1.25, 1.5, 2];

/** כמה קטעים מורדים/מסונתזים במקביל */
const CONCURRENCY = 3;

interface Stored {
  metas: SegmentMeta[];
  blob: Blob;
}

/** wav קצר ושקט: משחררים איתו את נגן השמע בתוך לחיצה של המשתמש (iOS חוסם נגינה אחרי המתנה ארוכה) */
function silentWavUrl(): string {
  const samples = 800;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

interface Options {
  book: BookMeta;
  chapterIdx: number | null;
  voice: string;
  /** המשפט שבו הקורא נמצא (מתחילים ממנו בפעם הראשונה בפרק) */
  startSid: string | null;
  /** הטקסט צריך להראות את האלמנט (דפדוף / גלילה). newSentence = עברנו למשפט חדש */
  follow: (el: HTMLElement, newSentence: boolean) => void;
  /** ההקראה הגיעה לסוף הפרק; מחזיר true אם עברו לפרק הבא (וההקראה תמשיך בו) */
  onChapterEnd: () => boolean;
}

export function useChapterTts(o: Options) {
  const [status, setStatus] = useState<TtsStatus>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(1);
  const [time, setTime] = useState({ now: 0, total: 0 });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tlRef = useRef<Timeline | null>(null);
  const urlRef = useRef<string | null>(null);
  const loadedKey = useRef<string | null>(null);
  /** מספר ריצה: הכנה שהוחלפה באמצע לא תשפיע על המצב */
  const gen = useRef(0);
  const raf = useRef(0);
  const lastWord = useRef(-2);
  const marked = useRef<{ word: HTMLElement | null; sent: HTMLElement | null }>({ word: null, sent: null });
  const autoNext = useRef(false);
  /** אחרי מעבר אוטומטי לפרק הבא – מתחילים מתחילת הפרק ולא ממיקום הקריאה */
  const fromStart = useRef(false);
  const rateRef = useRef(1);
  const opts = useRef(o);
  opts.current = o;

  const ref = (): TtsChapterRef | null =>
    o.chapterIdx === null || !o.voice ? null : { bookId: o.book.id, chapter: o.chapterIdx, voice: o.voice };
  const keyFor = (r: TtsChapterRef) => `tts:${r.bookId}:v${parserVersionOf(o.book)}:${r.voice}:${r.chapter}`;

  // ---------- סימון בטקסט ----------
  const clearMarks = () => {
    marked.current.word?.classList.remove('tts-now');
    marked.current.sent?.classList.remove('tts-sent');
    marked.current = { word: null, sent: null };
    lastWord.current = -2;
  };

  const markWord = (wi: number) => {
    const tl = tlRef.current;
    if (!tl) return;
    const w = tl.words[wi];
    const el = w ? document.querySelector<HTMLElement>(`[data-sid="${w.sid}"] .w[data-o="${w.offset}"]`) : null;
    const prev = marked.current;
    prev.word?.classList.remove('tts-now');
    if (!el) {
      marked.current = { word: null, sent: prev.sent };
      return;
    }
    el.classList.add('tts-now');
    const sent = el.closest<HTMLElement>('[data-sid]');
    const newSentence = sent !== prev.sent;
    if (newSentence) {
      prev.sent?.classList.remove('tts-sent');
      sent?.classList.add('tts-sent');
    }
    marked.current = { word: el, sent };
    opts.current.follow(el, newSentence);
  };

  const tick = () => {
    const a = audioRef.current;
    const tl = tlRef.current;
    if (!a || !tl) return;
    const wi = wordIndexAt(tl, a.currentTime);
    if (wi !== lastWord.current) {
      lastWord.current = wi;
      markWord(wi);
    }
    const sec = Math.floor(a.currentTime);
    setTime((t) => (t.now === sec ? t : { ...t, now: sec }));
    raf.current = requestAnimationFrame(tick);
  };

  // ---------- נגן ----------
  const getAudio = (): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current;
    const a = new Audio();
    a.preload = 'auto';
    a.addEventListener('play', () => {
      setPlaying(true);
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(tick);
    });
    a.addEventListener('pause', () => {
      setPlaying(false);
      cancelAnimationFrame(raf.current);
    });
    a.addEventListener('ended', () => {
      setPlaying(false);
      cancelAnimationFrame(raf.current);
      if (loadedKey.current && opts.current.onChapterEnd()) autoNext.current = true;
    });
    audioRef.current = a;
    return a;
  };

  const unload = useCallback(() => {
    gen.current++;
    cancelAnimationFrame(raf.current);
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    loadedKey.current = null;
    tlRef.current = null;
    clearMarks();
    setPlaying(false);
    setStatus('idle');
    setProgress({ done: 0, total: 0 });
    setTime({ now: 0, total: 0 });
  }, []);

  /** מכין את הפרק (מהמכשיר או מהשרת) וטוען לנגן. true אם מוכן */
  const prepare = useCallback(async (): Promise<boolean> => {
    const r = ref();
    if (!r) return false;
    const key = keyFor(r);
    if (loadedKey.current === key && tlRef.current) return true;
    const my = ++gen.current;
    setStatus('preparing');
    setError(null);
    setProgress({ done: 0, total: 0 });
    try {
      let stored = await idbGet<Stored>(key);
      if (!stored) {
        const plan = await getTtsPlan(r);
        if (my !== gen.current) return false;
        const segs = plan.segments;
        if (!segs.length) throw new Error('אין טקסט להקראה בפרק הזה');
        setProgress({ done: 0, total: segs.length });
        const metas: SegmentMeta[] = new Array(segs.length);
        const bufs: ArrayBuffer[] = new Array(segs.length);
        let next = 0;
        let done = 0;
        let failure: unknown = null;
        const work = async () => {
          while (!failure && my === gen.current) {
            const i = next++;
            if (i >= segs.length) return;
            const s = segs[i];
            try {
              const { meta } = await postTtsSegment({ ...r, para: s.para, part: s.part });
              bufs[i] = await fetchTtsAudio({ ...r, para: s.para, part: s.part });
              metas[i] = meta;
              if (my === gen.current) setProgress({ done: ++done, total: segs.length });
            } catch (e) {
              failure = e;
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, segs.length) }, work));
        if (my !== gen.current) return false;
        if (failure) throw failure;
        stored = { metas, blob: new Blob(bufs, { type: 'audio/mpeg' }) };
        void idbSet(key, stored);
      }
      if (my !== gen.current) return false;
      const a = getAudio();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(stored.blob);
      urlRef.current = url;
      a.src = url;
      a.playbackRate = rateRef.current;
      a.preservesPitch = true;
      tlRef.current = buildTimeline(stored.metas);
      loadedKey.current = key;
      setTime({ now: 0, total: Math.round(tlRef.current.total) });
      setStatus('ready');
      return true;
    } catch (e) {
      if (my === gen.current) {
        setError(friendlyError(e, 'לא הצלחנו להכין את ההקראה'));
        setStatus('error');
      }
      return false;
    }
  }, [o.book.id, o.chapterIdx, o.voice]);

  /** הפעלה / השהיה. אם הפרק לא מוכן – מכינים ואז מתחילים (מהמשפט שבו הקורא נמצא) */
  const toggle = useCallback(async () => {
    const a = getAudio();
    if (!a.paused) {
      a.pause();
      return;
    }
    if (loadedKey.current && tlRef.current) {
      void a.play();
      return;
    }
    // משחררים את הנגן בתוך הלחיצה, לפני ההמתנה להכנה
    if (!a.src) {
      a.src = silentWavUrl();
      void a.play().catch(() => {});
    }
    const ok = await prepare();
    if (!ok) return;
    const tl = tlRef.current!;
    const sid = fromStart.current ? null : opts.current.startSid;
    fromStart.current = false;
    const sentence = sid ? tl.sentences.find((s) => s.sid === sid) : null;
    a.currentTime = sentence ? Math.max(0, sentence.start - 0.15) : 0;
    try {
      await a.play();
    } catch {
      setError('הדפדפן חסם את ההשמעה. לחצו שוב על ▶.');
    }
  }, [prepare]);

  const setRate = (r: number) => {
    rateRef.current = r;
    setRateState(r);
    if (audioRef.current) audioRef.current.playbackRate = r;
  };

  // פרק או קול חדשים: מנקים; ואם עברנו פרק בגלל סוף הקראה – ממשיכים אוטומטית
  useEffect(() => {
    unload();
    if (autoNext.current && o.chapterIdx !== null && o.voice) {
      autoNext.current = false;
      fromStart.current = true;
      void toggle();
    }
  }, [o.book.id, o.chapterIdx, o.voice]);

  useEffect(
    () => () => {
      unload();
      if (audioRef.current) audioRef.current = null;
    },
    [],
  );

  return { status, progress, error, playing, rate, setRate, time, toggle, ready: status === 'ready', hasVoice: !!o.voice };
}

export type ChapterTts = ReturnType<typeof useChapterTts>;
