// פורמט הספר הפנימי, משותף לשרת ולאפליקציה.
// כל מקור (Gutenberg, EPUB, TXT...) מומר למבנה הזה בזמן הייבוא.
//
// מזהה משפט יציב: "c{פרק}.p{פסקה}.s{משפט}" – לפיו נשמר מיקום הקריאה.
// הפענוח דטרמיניסטי, כך שאותו קובץ תמיד נותן אותם מזהים.

export interface BookMeta {
  id: string; // למשל "gutenberg-1513"
  lang: string; // "en"
  title: string;
  author: string;
  source: string; // "gutenberg" | "upload" | "english-e-reader" | "learnenglishteam"
  /** רמת CEFR (מהקטלוג, או הערכה) */
  level?: string;
  /** דף הספר במקור, אם יש */
  sourceUrl?: string;
  /** קובץ שמע (MP3) של הספר באתר המקור, אם יש */
  audioUrl?: string;
  chapterCount: number;
  wordCount: number;
  chapterTitles: string[];
}

export interface Chapter {
  title: string;
  /** פסקאות; כל פסקה היא רשימת משפטים */
  paragraphs: string[][];
}

export interface ParsedBook {
  chapters: Chapter[];
  wordCount: number;
}

export function sentenceId(c: number, p: number, s: number): string {
  return `c${c}.p${p}.s${s}`;
}

export function parseSentenceId(id: string): { c: number; p: number; s: number } | null {
  const m = /^c(\d+)\.p(\d+)\.s(\d+)$/.exec(id);
  return m ? { c: +m[1], p: +m[2], s: +m[3] } : null;
}

// ---------- פיצול למשפטים ----------

const ABBREV = /\b(Mr|Mrs|Ms|Dr|St|Mt|Jr|Sr|Prof|Capt|Col|Gen|Lt|Sgt|Rev|Hon|No|vs|etc|e\.g|i\.e|cf)\.$/i;
const INITIAL = /(^|\s)[A-Z]\.$/; // ראשי תיבות כמו "J."

export function splitSentences(paragraph: string, lang = 'en'): string[] {
  const text = paragraph.trim();
  if (!text) return [];
  let parts: string[];
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter(lang, { granularity: 'sentence' });
    parts = Array.from(seg.segment(text), (s) => s.segment.trim()).filter(Boolean);
  } else {
    parts = text.match(/[^.!?]+(?:[.!?]+["'”’)]*|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  }
  // איחוד אחרי קיצורים ("Mr. Smith") וראשי תיבות
  const out: string[] = [];
  for (const p of parts) {
    const prev = out[out.length - 1];
    // ...וגם כשהמשפט "הבא" מתחיל באות קטנה: “Curiouser!” cried Alice
    const continues = /^[“"‘'(]?[a-z]/.test(p);
    if (prev && (ABBREV.test(prev) || INITIAL.test(prev) || continues)) out[out.length - 1] = `${prev} ${p}`;
    else out.push(p);
  }
  return out;
}

export function countWords(text: string): number {
  return text.match(/[A-Za-z0-9’']+/g)?.length ?? 0;
}

// ---------- פענוח טקסט של Project Gutenberg ----------

const START = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^\n]*\*\*\*/i;
const END = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG[^\n]*\*\*\*/i;

const HEADING =
  /^(?:(?:CHAPTER|Chapter|BOOK|Book|PART|Part|ACT|Act|STAVE|Stave|LETTER|Letter)\s+(?:[IVXLCDM]+|\d+|[A-Z][a-z]+)\b.{0,70}|[IVXLCDM]{1,7}\.?|PROLOGUE|EPILOGUE|Prologue|Epilogue|PREFACE|Preface|INTRODUCTION|Introduction)$/;

/** מחזיר רק את גוף הספר, בלי הכותרת והרישיון של Gutenberg */
export function stripGutenbergBoilerplate(raw: string): string {
  let text = raw.replace(/\r\n?/g, '\n');
  const s = START.exec(text);
  if (s) text = text.slice(s.index + s[0].length);
  const e = END.exec(text);
  if (e) text = text.slice(0, e.index);
  return text;
}

function cleanParagraph(block: string): string {
  return block
    .split('\n')
    .map((l) => l.trim())
    .join(' ')
    .replace(/_([^_]+)_/g, '$1') // _הטיה_ → הטיה
    .replace(/\s+/g, ' ')
    .trim();
}

function isHeading(p: string): boolean {
  return p.length <= 80 && HEADING.test(p);
}

const WORDS_PER_FALLBACK_CHAPTER = 3000;

export function parsePlainText(raw: string, lang = 'en'): ParsedBook {
  const body = stripGutenbergBoilerplate(raw);
  // בלוק של שורות קצרות (תוכן עניינים, שירה, מחזה) – כל שורה נשארת פסקה בפני עצמה
  const blocks = body
    .split(/\n\s*\n/)
    .flatMap((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      return lines.length >= 3 && lines.every((l) => l.length <= 60) ? lines.map(cleanParagraph) : [cleanParagraph(block)];
    })
    .filter((p) => p && !/^\[?Illustration[^\]]*\]?$/i.test(p));

  const chapters: { title: string; paras: string[] }[] = [];
  let current: { title: string; paras: string[] } = { title: '', paras: [] };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (isHeading(b)) {
      if (current.paras.length || current.title) chapters.push(current);
      // כותרת משנה קצרה מיד אחרי "CHAPTER I" נכנסת לכותרת
      let title = b;
      const next = blocks[i + 1];
      if (next && next.length <= 60 && !/[.!?]["”’]?$/.test(next) && !isHeading(next)) {
        title = `${b}: ${next}`;
        i++;
      }
      current = { title, paras: [] };
    } else {
      current.paras.push(b);
    }
  }
  if (current.paras.length) chapters.push(current);

  // "פרקים" שאין בהם כמעט טקסט (תוכן עניינים, עמוד שער) – מאחדים לפתיחה
  let usable = chapters.filter((c) => c.paras.length > 0);
  const headed = usable.filter((c) => c.title);
  if (headed.length < 2) {
    // לא זוהו פרקים: חותכים לחלקים של כ-3000 מילים
    const all = usable.flatMap((c) => c.paras);
    usable = [];
    let chunk: string[] = [];
    let words = 0;
    for (const p of all) {
      chunk.push(p);
      words += countWords(p);
      if (words >= WORDS_PER_FALLBACK_CHAPTER) {
        usable.push({ title: '', paras: chunk });
        chunk = [];
        words = 0;
      }
    }
    if (chunk.length) usable.push({ title: '', paras: chunk });
  }

  return chaptersFromRaw(
    usable.map((c, i) => ({
      // טקסט לפני הכותרת הראשונה = "פתיחה"; ספר בלי כותרות = "חלק N"
      title: c.title || (headed.length >= 2 ? 'פתיחה' : `חלק ${i + 1}`),
      paras: c.paras,
    })),
    lang,
  );
}

/** פרקים "גולמיים" (כותרת + פסקאות טקסט) → המבנה הסופי עם משפטים וספירת מילים */
export function chaptersFromRaw(raw: { title: string; paras: string[] }[], lang = 'en'): ParsedBook {
  let wordCount = 0;
  const chapters: Chapter[] = [];
  raw.forEach((c, i) => {
    const paragraphs = c.paras.map((p) => splitSentences(p, lang)).filter((s) => s.length);
    if (!paragraphs.length) return;
    for (const p of paragraphs) for (const s of p) wordCount += countWords(s);
    chapters.push({ title: c.title.trim() || `חלק ${i + 1}`, paragraphs });
  });
  return { chapters, wordCount };
}
