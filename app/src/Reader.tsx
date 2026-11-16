import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { memo } from 'preact/compat';
import { parseSentenceId, sentenceId, type BookMeta, type Chapter } from '../../shared/book';
import type { WordLookup } from '../../shared/translate';
import { ApiError, getChapter, lookupWord } from './api';
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
import { WordSheet, type Selection } from './WordSheet';

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

  // ---------- נגיעות: החלקה, שוליים, מילה ----------
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

  const onClick = (e: MouseEvent) => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    const target = e.target as HTMLElement;
    const w = target.closest<HTMLElement>('.w');
    if (w && chapter) {
      const sEl = w.closest<HTMLElement>('[data-sid]')!;
      const sid = sEl.dataset.sid!;
      const pos = parseSentenceId(sid)!;
      const sentence = chapter.paragraphs[pos.p][pos.s];
      const offset = Number(w.dataset.o);
      openLookup(sid, sentence, w.textContent ?? '', offset);
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

  // ---------- תרגום מילה ----------
  const reqId = useRef(0);
  const openLookup = async (sid: string, sentence: string, word: string, offset: number) => {
    const id = ++reqId.current;
    setSel({ sid, sentence, word, offset, state: 'loading' });
    try {
      const res = await lookupWord({ sentence, word, offset, lang: book.lang, engine: settings.engine || undefined });
      if (id !== reqId.current) return;
      setSel({ sid, sentence, word, offset, state: 'done', result: res.result, engine: res.engine, cached: res.cached });
    } catch (e) {
      if (id !== reqId.current) return;
      setSel({ sid, sentence, word, offset, state: 'error', error: e instanceof Error ? e.message : 'שגיאה' });
    }
  };

  // סימון המילה/הביטוי בטקסט (ישירות ב-DOM, בלי לרנדר מחדש את כל הפרק)
  useEffect(() => {
    const el = pagesRef.current;
    if (!el) return;
    el.querySelectorAll('.w.hl').forEach((n) => n.classList.remove('hl'));
    if (!sel) return;
    const offsets =
      sel.state === 'done' ? unitTokenOffsets(tokenize(sel.sentence), sel.offset, (sel.result as WordLookup).unit) : [sel.offset];
    const sEl = el.querySelector(`[data-sid="${sel.sid}"]`);
    for (const o of offsets) sEl?.querySelector(`.w[data-o="${o}"]`)?.classList.add('hl');
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
        <button class="icon-btn" onClick={onOpenSettings} aria-label="הגדרות תצוגה">
          Aa
        </button>
      </header>

      <div
        class="viewport"
        ref={viewportRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
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

      {sel && <WordSheet sel={sel} onClose={() => setSel(null)} />}
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
