// עימוד – רק למצב קריאה. עמודים בעזרת עמודות CSS, והמיקום מעוגן למשפט ולא למספר עמוד:
// אחרי כל שינוי פריסה (גופן, גודל, מכשיר) מחשבים מחדש באיזה עמוד מתחיל משפט העוגן.

import type { RefObject } from 'preact';
import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Chapter } from '../../../shared/book';
import type { DeviceSettings } from '../deviceSettings';
import { anchorForPage, clampPage, pageForAnchor, pageOf, type SentenceStart } from '../paging';
import type { Target } from './useBookChapter';

interface Options {
  chapter: Chapter | null;
  settings: DeviceSettings;
  targetRef: RefObject<Target | null>;
  /** נקרא בכל דפדוף עם משפט העוגן החדש (לשמירת מיקום) */
  onPageChange: (anchor: string | null) => void;
}

export function usePagination({ chapter, settings, targetRef, onPageChange }: Options) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  const startsRef = useRef<SentenceStart[]>([]);
  // העמוד הנוכחי גם ב-ref: לחיצות מהירות ברצף לא יקראו ערך ישן
  const pageRef = useRef(0);
  const pageCountRef = useRef(1);
  const anchorRef = useRef<string | null>(null);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  // מדידת גודל המסך
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // חישוב עמודים: אחרי כל שינוי בפרק, בגודל או בהגדרות
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

    const t = targetRef.current!;
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

  const goToPage = useCallback((p: number) => {
    const target = clampPage(p, pageCountRef.current);
    const anchor = anchorForPage(startsRef.current, target);
    anchorRef.current = anchor;
    targetRef.current = { anchor };
    pageRef.current = target;
    setPage(target);
    onPageChangeRef.current(anchor);
  }, []);

  /** עמוד הבא בתוך הפרק; false אם זה העמוד האחרון */
  const nextPage = useCallback((): boolean => {
    if (pageRef.current >= pageCountRef.current - 1) return false;
    goToPage(pageRef.current + 1);
    return true;
  }, [goToPage]);

  /** עמוד קודם בתוך הפרק; false אם זה העמוד הראשון */
  const prevPage = useCallback((): boolean => {
    if (pageRef.current <= 0) return false;
    goToPage(pageRef.current - 1);
    return true;
  }, [goToPage]);

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

  return { viewportRef, pagesRef, dims, page, pageCount, anchorRef, nextPage, prevPage, pagesStyle };
}
