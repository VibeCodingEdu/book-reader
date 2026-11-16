import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { memo } from 'preact/compat';
import { parseSentenceId, sentenceId, type BookMeta, type Chapter } from '../../shared/book';
import { ApiError, getChapter, lookupWord, translateText } from './api';
import type { DeviceSettings } from './deviceSettings';
import {
  anchorForPage,
  clampPage,
  pageForAnchor,
  pageOf,
  tokenize,
  unitTokenOffsets,
  type SentenceStart,
} from './paging';
import { createPositionSaver, resolveStartPosition } from './position';
import { AudioPanel } from './AudioPanel';
import { WordSheet, type RangeSel, type RangeStartSel, type Selection, type WordSel } from './WordSheet';

interface Props {
  book: BookMeta;
  settings: DeviceSettings;
  onBack: () => void;
  onOpenSettings: () => void;
}

type Target = { anchor: string | null } | { end: true };

export function Reader({ book, settings, onBack, onOpenSettings }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [chapterIdx, setChapterIdx] = useState<number | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const [audioOpen, setAudioOpen] = useState(false);
  const [audioMounted, setAudioMounted] = useState(false);

  const startsRef = useRef<SentenceStart[]>([]);
  // העמוד הנוכחי גם ב-ref: לחיצות מהירות ברצף לא יקראו ערך ישן
  const pageRef = useRef(0);
  const pageCountRef = useRef(1);
  const chapterIdxRef = useRef<number | null>(null);
  const loadingRef = useRef(false);
  const anchorRef = useRef<string | null>(null);
  const targetRef = useRef<Target>({ anchor: null });
  const saver = useMemo(() => createPositionSaver(book.id), [book.id]);
  useEffect(() => () => saver.dispose(), [saver]);

  // ---------- טעינה ----------
  const loadChapter = useCallback(
    async (idx: number, target: Target) => {
      setError(null);
      setSel(null);
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

  useEffect(() => {
    let cancelled = false;
    resolveStartPosition(book.id).then((pos) => {
      if (cancelled) return;
      const parsed = pos ? parseSentenceId(pos.sentenceId) : null;
      const idx = parsed && parsed.c < book.chapterCount ? parsed.c : 0;
      loadChapter(idx, { anchor: parsed ? pos!.sentenceId : null });
    });
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  // ---------- מדידת גודל המסך ----------
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---------- חישוב עמודים: אחרי כל שינוי בפרק, בגודל או בהגדרות ----------
  const relayout = useCallback(() => {
    const el = pagesRef.current;
    if (!el || !dims || !chapter) return;
    const base = el.getBoundingClientRect().left + settings.margin;
    const stride = dims.w;
    const spans = el.querySelectorAll<HTMLElement>('[data-sid]');
    const starts: SentenceStart[] = [];
    let lastPage = 0;
    spans.forEach((s) => {
      const rects = s.getClientRects();
      if (!rects.length) return;
      starts.push({ id: s.dataset.sid!, page: pageOf(rects[0].left - base, stride) });
      lastPage = Math.max(lastPage, pageOf(rects[rects.length - 1].left - base, stride));
    });
    startsRef.current = starts;
    const count = lastPage + 1;
    pageCountRef.current = count;
    setPageCount(count);

    const t = targetRef.current;
    let p: number;
    if ('end' in t) {
      p = count - 1;
      targetRef.current = { anchor: anchorForPage(starts, p) };
    } else {
      p = pageForAnchor(starts, t.anchor);
    }
    p = clampPage(p, count);
    anchorRef.current = anchorForPage(starts, p);
    pageRef.current = p;
    setPage(p);
  }, [chapter, dims, settings.margin]);

  useLayoutEffect(() => {
    relayout();
    // גופנים שנטענים מאוחר משנים את הפריסה
    document.fonts?.ready.then(() => relayout());
  }, [relayout, settings.fontSize, settings.fontFamily, settings.lineHeight]);

  // ---------- דפדוף ----------
  const goToPage = useCallback(
    (p: number) => {
      const target = clampPage(p, pageCountRef.current);
      const anchor = anchorForPage(startsRef.current, target);
      anchorRef.current = anchor;
      targetRef.current = { anchor };
      pageRef.current = target;
      setPage(target);
      setSel(null);
      if (anchor) saver.save(anchor);
    },
    [saver],
  );

  const next = useCallback(() => {
    const ci = chapterIdxRef.current;
    if (ci === null || loadingRef.current) return; // עד שהפרק הבא נטען – מתעלמים מלחיצות
    if (pageRef.current < pageCountRef.current - 1) goToPage(pageRef.current + 1);
    else if (ci + 1 < book.chapterCount) {
      const first = sentenceId(ci + 1, 0, 0);
      saver.save(first);
      loadChapter(ci + 1, { anchor: first });
    }
  }, [goToPage, book.chapterCount, loadChapter, saver]);

  const prev = useCallback(() => {
    const ci = chapterIdxRef.current;
    if (ci === null || loadingRef.current) return;
    if (pageRef.current > 0) goToPage(pageRef.current - 1);
    else if (ci > 0) {
      loadChapter(ci - 1, { end: true });
    }
  }, [goToPage, loadChapter]);

  const jumpToChapter = (idx: number) => {
    const first = sentenceId(idx, 0, 0);
    saver.save(first);
    loadChapter(idx, { anchor: first });
  };

  // מקלדת (מחשב)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        next();
      } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        prev();
      } else if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  // ---------- נגיעות: החלקה, שוליים, מילה, לחיצה ארוכה ----------
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const swiped = useRef(false);

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    swiped.current = false;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - s.t < 800) {
      swiped.current = true;
      if (dx < 0) next();
      else prev();
    }
  };

  // לחיצה ארוכה על מילה = תחילת סימון קטע (בלי גרירה, כדי לא להתנגש בדפדוף)
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const onPointerDown = (e: PointerEvent) => {
    const w = (e.target as HTMLElement).closest<HTMLElement>('.w');
    longPressed.current = false;
    if (!w) return;
    cancelPress();
    press.current = {
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        press.current = null;
        longPressed.current = true;
        const sid = w.closest<HTMLElement>('[data-sid]')!.dataset.sid!;
        reqId.current++;
        setSel({ kind: 'range-start', sid, offset: Number(w.dataset.o), word: w.textContent ?? '' });
        navigator.vibrate?.(15);
      }, 450),
    };
  };
  const onPointerMove = (e: PointerEvent) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelPress();
  };

  const wordInfo = (w: HTMLElement) => {
    const sid = w.closest<HTMLElement>('[data-sid]')!.dataset.sid!;
    const pos = parseSentenceId(sid)!;
    return { sid, sentence: chapter!.paragraphs[pos.p][pos.s], word: w.textContent ?? '', offset: Number(w.dataset.o) };
  };

  const onClick = (e: MouseEvent) => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    if (longPressed.current) {
      longPressed.current = false; // ה-click שמגיע אחרי לחיצה ארוכה
      return;
    }
    const w = (e.target as HTMLElement).closest<HTMLElement>('.w');
    if (w && chapter) {
      if (sel?.kind === 'range-start') finishRange(sel, w);
      else openWord(wordInfo(w));
      return;
    }
    // לא על מילה: נגיעה בשוליים מדפדפת
    if (sel) {
      setSel(null);
      return;
    }
    const rect = viewportRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (x < 0.3) prev();
    else if (x > 0.7) next();
  };

  // ---------- תרגום ----------
  const reqId = useRef(0);

  const runWord = async (base: WordSel) => {
    const id = ++reqId.current;
    setSel({ ...base, state: 'loading' } as WordSel);
    try {
      const res = await lookupWord({
        sentence: base.sentence,
        word: base.word,
        offset: base.offset,
        lang: book.lang,
        engine: settings.engine || undefined,
      });
      if (id === reqId.current) setSel({ ...base, state: 'done', result: res.result, engine: res.engine, cached: res.cached } as WordSel);
    } catch (e) {
      if (id === reqId.current) setSel({ ...base, state: 'error', error: e instanceof Error ? e.message : 'שגיאה' } as WordSel);
    }
  };

  const runRange = async (base: RangeSel) => {
    const id = ++reqId.current;
    setSel({ ...base, state: 'loading' } as RangeSel);
    try {
      const res = await translateText({ text: base.text, context: base.context, lang: book.lang, engine: settings.engine || undefined });
      if (id === reqId.current) setSel({ ...base, state: 'done', result: res.result, engine: res.engine, cached: res.cached } as RangeSel);
    } catch (e) {
      if (id === reqId.current) setSel({ ...base, state: 'error', error: e instanceof Error ? e.message : 'שגיאה' } as RangeSel);
    }
  };

  const openWord = (info: { sid: string; sentence: string; word: string; offset: number }) => {
    const base = { kind: 'word', ...info, state: 'idle' } as WordSel;
    if (settings.autoTranslate) runWord(base);
    else {
      reqId.current++;
      setSel(base);
    }
  };

  const finishRange = (start: RangeStartSel, endEl: HTMLElement) => {
    const root = pagesRef.current;
    const startEl = root?.querySelector<HTMLElement>(`[data-sid="${start.sid}"] .w[data-o="${start.offset}"]`);
    if (!root || !startEl || !chapter) return;
    const all = Array.from(root.querySelectorAll<HTMLElement>('.w'));
    let i = all.indexOf(startEl);
    let j = all.indexOf(endEl);
    if (i > j) [i, j] = [j, i];
    const words = all.slice(i, Math.min(j, i + 299) + 1); // עד 300 מילים
    const range = document.createRange();
    range.setStartBefore(words[0]);
    range.setEndAfter(words[words.length - 1]);
    const text = range.toString().replace(/\s+/g, ' ').trim();
    const marks = words.map((w) => ({ sid: w.closest<HTMLElement>('[data-sid]')!.dataset.sid!, o: Number(w.dataset.o) }));
    const sids = [...new Set(marks.map((m) => m.sid))];
    const context = sids
      .map((sid) => {
        const p = parseSentenceId(sid)!;
        return chapter.paragraphs[p.p][p.s];
      })
      .join(' ');
    const base = { kind: 'range', text, context, marks, state: 'idle' } as RangeSel;
    if (words.length === 1) {
      openWord(wordInfo(words[0])); // לחיצה על אותה מילה – כמו מילה רגילה
      return;
    }
    if (settings.autoTranslate) runRange(base);
    else {
      reqId.current++;
      setSel(base);
    }
  };

  const translateNow = () => {
    if (sel?.kind === 'word') runWord(sel);
    else if (sel?.kind === 'range') runRange(sel);
  };

  // סימון בטקסט (ישירות ב-DOM, בלי לרנדר מחדש את כל הפרק)
  useEffect(() => {
    const el = pagesRef.current;
    if (!el) return;
    el.querySelectorAll('.w.hl').forEach((n) => n.classList.remove('hl', 'hlr'));
    if (!sel) return;
    let marks: { sid: string; o: number }[];
    if (sel.kind === 'range') marks = sel.marks;
    else if (sel.kind === 'range-start') marks = [{ sid: sel.sid, o: sel.offset }];
    else {
      const offsets = sel.state === 'done' ? unitTokenOffsets(tokenize(sel.sentence), sel.offset, sel.result.unit, sel.result.unitType === 'word' ? '' : sel.result.lemma) : [sel.offset];
      marks = offsets.map((o) => ({ sid: sel.sid, o }));
    }
    const cls = sel.kind === 'range' ? ['hl', 'hlr'] : ['hl'];
    for (const m of marks) el.querySelector(`[data-sid="${m.sid}"] .w[data-o="${m.o}"]`)?.classList.add(...cls);
  }, [sel]);

  // ---------- תצוגה ----------
  const w = dims?.w ?? 0;
  const pagesStyle = dims
    ? {
        width: `${w}px`,
        height: `${dims.h}px`,
        padding: `0 ${settings.margin}px`,
        columnWidth: `${w - 2 * settings.margin}px`,
        columnGap: `${2 * settings.margin}px`,
        transform: `translateX(${-page * w}px)`,
        fontSize: `${settings.fontSize}px`,
        lineHeight: String(settings.lineHeight),
      }
    : undefined;

  const chapterTitle = chapterIdx !== null ? book.chapterTitles[chapterIdx] : '';

  return (
    <div class="reader">
      <header class="reader-bar">
        <button class="icon-btn" onClick={onBack} aria-label="חזרה לספרייה">
          →
        </button>
        <select
          class="chapter-select"
          dir="ltr"
          aria-label="מעבר לפרק"
          value={chapterIdx ?? 0}
          onChange={(e) => jumpToChapter(Number(e.currentTarget.value))}
        >
          {book.chapterTitles.map((t, i) => (
            <option key={i} value={i}>
              {t}
            </option>
          ))}
        </select>
        {book.audioUrl && (
          <button
            class="icon-btn"
            aria-label="הקראה (MP3)"
            aria-pressed={audioOpen}
            onClick={() => {
              setAudioMounted(true);
              setAudioOpen(!audioOpen);
            }}
          >
            🎧
          </button>
        )}
        <button class="icon-btn" onClick={onOpenSettings} aria-label="הגדרות תצוגה">
          Aa
        </button>
      </header>
      {audioMounted && <AudioPanel book={book} open={audioOpen} />}

      <div
        class="viewport"
        ref={viewportRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => e.preventDefault()}
        onClick={onClick}
      >
        {error && (
          <div class="reader-msg">
            <p>{error}</p>
            <button onClick={() => chapterIdx !== null && loadChapter(chapterIdx, { anchor: anchorRef.current })}>
              לנסות שוב
            </button>
          </div>
        )}
        {!chapter && !error && <div class="reader-msg">טוען…</div>}
        {chapter && dims && (
          <div
            ref={pagesRef}
            class={`pages en ${settings.fontFamily}`}
            dir="ltr"
            lang={book.lang}
            style={pagesStyle}
          >
            <h2 class="chapter-title">{chapter.title}</h2>
            <ChapterText chapter={chapter} chapterIdx={chapterIdx!} />
          </div>
        )}
      </div>

      <footer class="reader-foot" dir="ltr">
        <button class="nav-btn" onClick={prev} aria-label="עמוד קודם">
          ‹
        </button>
        <div class="progress" dir="rtl">
          <span class="progress-chapter" dir="auto">
            {chapterTitle}
          </span>
          <span>
            עמוד {page + 1} מתוך {pageCount} · פרק {(chapterIdx ?? 0) + 1}/{book.chapterCount}
          </span>
        </div>
        <button class="nav-btn" onClick={next} aria-label="עמוד הבא">
          ›
        </button>
      </footer>

      {sel && <WordSheet sel={sel} onClose={() => setSel(null)} onTranslate={translateNow} />}
    </div>
  );
}

/** טקסט הפרק: כל משפט עם מזהה, כל מילה לחיצה. ממוזכר – לא מתרנדר מחדש בכל דפדוף. */
const ChapterText = memo(function ChapterText({ chapter, chapterIdx }: { chapter: Chapter; chapterIdx: number }) {
  return (
    <>
      {chapter.paragraphs.map((para, pi) => (
        <p key={pi}>
          {para.map((s, si) => (
            <span key={si} data-sid={sentenceId(chapterIdx, pi, si)}>
              {tokenize(s).map((t) =>
                t.word ? (
                  <span key={t.offset} class="w" data-o={t.offset}>
                    {t.text}
                  </span>
                ) : (
                  t.text
                ),
              )}{' '}
            </span>
          ))}
        </p>
      ))}
    </>
  );
});
