// לוגיקת עמודים – פונקציות טהורות (בלי DOM), כדי שאפשר לבדוק אותן.
//
// העיקרון: המיקום נשמר כ"משפט עוגן" ולא כמספר עמוד. אחרי כל שינוי פריסה
// (גופן, גודל, מכשיר, סיבוב מסך) מחשבים מחדש באיזה עמוד המשפט מתחיל וקופצים אליו.
// כך אין "עמוד ריק" ואין קפיצה למקום אחר בטקסט.

export interface SentenceStart {
  id: string;
  /** העמוד שבו המשפט מתחיל */
  page: number;
}

export function pageOf(x: number, stride: number): number {
  if (stride <= 0) return 0;
  return Math.max(0, Math.floor((x + 1) / stride));
}

export function clampPage(page: number, count: number): number {
  return Math.min(Math.max(0, page), Math.max(0, count - 1));
}

/** העוגן של עמוד: המשפט הראשון שמתחיל בו; אם אין כזה (משפט ארוך מאוד) – המשפט שנמשך אליו */
export function anchorForPage(starts: SentenceStart[], page: number): string | null {
  if (!starts.length) return null;
  let carried: string | null = null;
  for (const s of starts) {
    if (s.page === page) return s.id;
    if (s.page < page) carried = s.id;
    else break;
  }
  return carried ?? starts[0].id;
}

/** העמוד שבו מתחיל משפט העוגן (או 0 אם הוא לא נמצא בפרק) */
export function pageForAnchor(starts: SentenceStart[], anchor: string | null): number {
  if (!anchor) return 0;
  return starts.find((s) => s.id === anchor)?.page ?? 0;
}

// ---------- פירוק משפט למילים ----------

export interface Token {
  text: string;
  word: boolean;
  /** מיקום באותיות בתוך המשפט */
  offset: number;
}

const WORD = /[A-Za-z0-9À-ɏ]+(?:['’][A-Za-z]+)*(?:-[A-Za-zÀ-ɏ]+)*/g;

export function tokenize(sentence: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of sentence.matchAll(WORD)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: sentence.slice(last, i), word: false, offset: last });
    out.push({ text: m[0], word: true, offset: i });
    last = i + m[0].length;
  }
  if (last < sentence.length) out.push({ text: sentence.slice(last), word: false, offset: last });
  return out;
}

/** אילו מילים במשפט שייכות ליחידה שזוהתה ("broke out") – בחלון קטן סביב המילה שנלחצה */
export function unitTokenOffsets(tokens: Token[], tappedOffset: number, unit: string, lemma = ''): number[] {
  // אם המודל כתב ביחידה רק חלק מהביטוי ("broke"), נעזרים גם בצורת המילון ("break out")
  const parts = [...unit.toLowerCase().split(/\s+/), ...lemma.toLowerCase().split(/\s+/).slice(1)].filter(Boolean);
  const words = tokens.filter((t) => t.word);
  const idx = words.findIndex((t) => t.offset === tappedOffset);
  if (idx < 0 || parts.length <= 1) return [tappedOffset];
  const out = new Set<number>([tappedOffset]);
  for (let i = Math.max(0, idx - 5); i <= Math.min(words.length - 1, idx + 5); i++) {
    if (parts.includes(words[i].text.toLowerCase())) out.add(words[i].offset);
  }
  return [...out];
}
