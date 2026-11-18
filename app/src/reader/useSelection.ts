// בחירה ותרגום – משותף למצב קריאה ולמצב לימוד (M2).
// לחיצה על מילה, לחיצה ארוכה ואז נגיעה לסימון קטע, תרגום (אוטומטי או בכפתור),
// וסימון המילים בטקסט.

import type { RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { parseSentenceId, type BookMeta, type Chapter } from '../../../shared/book';
import { friendlyError, lookupWord, translateText } from '../api';
import type { DeviceSettings } from '../deviceSettings';
import { tokenize, unitTokenOffsets } from '../paging';
import { savedAt, type SavedIndex } from '../savedWords';
import type { RangeSel, RangeStartSel, Selection, WordSel } from '../WordSheet';

interface Options {
  book: BookMeta;
  chapter: Chapter | null;
  settings: DeviceSettings;
  /** האלמנט שמכיל את טקסט הפרק (משפטים עם data-sid, מילים עם .w) */
  rootRef: RefObject<HTMLElement | null>;
  /** המילים השמורות: לחיצה על מילה שמורה מציגה את המשמעות השמורה, בלי קריאה למנוע */
  savedIndex?: SavedIndex;
}

type WordInfo = { sid: string; sentence: string; word: string; offset: number };

export function useSelection({ book, chapter, settings, rootRef, savedIndex }: Options) {
  const [sel, setSel] = useState<Selection | null>(null);
  const reqId = useRef(0);

  const wordInfo = (w: HTMLElement): WordInfo => {
    const sid = w.closest<HTMLElement>('[data-sid]')!.dataset.sid!;
    const pos = parseSentenceId(sid)!;
    return { sid, sentence: chapter!.paragraphs[pos.p][pos.s], word: w.textContent ?? '', offset: Number(w.dataset.o) };
  };

  // ---------- תרגום ----------
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
      if (id === reqId.current) setSel({ ...base, state: 'error', error: friendlyError(e) } as WordSel);
    }
  };

  const runRange = async (base: RangeSel) => {
    const id = ++reqId.current;
    setSel({ ...base, state: 'loading' } as RangeSel);
    try {
      const res = await translateText({ text: base.text, context: base.context, lang: book.lang, engine: settings.engine || undefined });
      if (id === reqId.current) setSel({ ...base, state: 'done', result: res.result, engine: res.engine, cached: res.cached } as RangeSel);
    } catch (e) {
      if (id === reqId.current) setSel({ ...base, state: 'error', error: friendlyError(e) } as RangeSel);
    }
  };

  const openWord = (info: WordInfo) => {
    const saved = savedIndex ? savedAt(savedIndex, info.sentence, info.offset)?.word : undefined;
    if (saved) {
      reqId.current++;
      const result = {
        unit: saved.unit,
        unitType: saved.unitType,
        lemma: saved.lemma,
        pos: saved.pos,
        ipa: saved.ipa,
        contextMeaning: saved.meaning,
        otherMeanings: [],
      };
      setSel({ kind: 'word', ...info, state: 'done', result, engine: 'saved', cached: true } as WordSel);
      return;
    }
    const base = { kind: 'word', ...info, state: 'idle' } as WordSel;
    if (settings.autoTranslate) runWord(base);
    else {
      reqId.current++;
      setSel(base);
    }
  };

  const finishRange = (start: RangeStartSel, endEl: HTMLElement) => {
    const root = rootRef.current;
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

  // ---------- לחיצה ארוכה על מילה = תחילת סימון קטע (בלי גרירה, כדי לא להתנגש בדפדוף) ----------
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

  /** מאזינים לאלמנט הטקסט */
  const pressHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
  };

  /**
   * לטיפול ב-click על הטקסט. מחזיר true אם ה-click טופל כאן (הגיע אחרי לחיצה ארוכה,
   * או נפל על מילה); false – המסך מחליט מה לעשות (למשל דפדוף בנגיעה בשוליים).
   */
  const handleClick = (e: MouseEvent): boolean => {
    if (longPressed.current) {
      longPressed.current = false; // ה-click שמגיע אחרי לחיצה ארוכה
      return true;
    }
    const w = (e.target as HTMLElement).closest<HTMLElement>('.w');
    if (w && chapter) {
      if (sel?.kind === 'range-start') finishRange(sel, w);
      else openWord(wordInfo(w));
      return true;
    }
    return false;
  };

  // ---------- סימון בטקסט (ישירות ב-DOM, בלי לרנדר מחדש את כל הפרק) ----------
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.querySelectorAll('.w.hl').forEach((n) => n.classList.remove('hl', 'hlr'));
    if (!sel) return;
    let marks: { sid: string; o: number }[];
    if (sel.kind === 'range') marks = sel.marks;
    else if (sel.kind === 'range-start') marks = [{ sid: sel.sid, o: sel.offset }];
    else {
      const offsets =
        sel.state === 'done'
          ? unitTokenOffsets(tokenize(sel.sentence), sel.offset, sel.result.unit, sel.result.unitType === 'word' ? '' : sel.result.lemma)
          : [sel.offset];
      marks = offsets.map((o) => ({ sid: sel.sid, o }));
    }
    const cls = sel.kind === 'range' ? ['hl', 'hlr'] : ['hl'];
    for (const m of marks) el.querySelector(`[data-sid="${m.sid}"] .w[data-o="${m.o}"]`)?.classList.add(...cls);
  }, [sel]);

  return { sel, clear: () => setSel(null), translateNow, pressHandlers, handleClick };
}
