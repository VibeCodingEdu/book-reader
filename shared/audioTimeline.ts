// ציר הזמן של הקראה: זמני מילים לכל קטע שמע, וחיבור הקטעים לציר אחד לפרק.
//
// כל קטע (MP3 אחד מ-Google) נשמר עם SegmentMeta: אילו משפטים בו, ובכל משפט מתי כל מילה מתחילה.
// הנגן מחבר את קובצי הקטעים לקובץ אחד, ולכן הזמן של מילה בפרק = סכום משכי הקטעים שלפניה + זמנה בקטע.

import { parseMarkName, type Timepoint } from './tts';

/** מילה (o = מיקום המילה במשפט) או סוף משפט (o = null) */
export interface SegmentMark {
  /** אינדקס המשפט בתוך הקטע */
  s: number;
  o: number | null;
  /** שניות מתחילת הקטע */
  t: number;
}

export interface SegmentMeta {
  /** מזהי המשפטים בקטע, לפי הסדר (c3.p12.s0 ...) */
  sids: string[];
  marks: SegmentMark[];
  /** משך קובץ ה-MP3 בשניות */
  durationSec: number;
  bytes: number;
}

/** הפיכת timepoints של Google לרשימת סימונים ממוינת; סימונים עם שם לא תקין נזרקים */
export function marksFromTimepoints(tps: Timepoint[]): SegmentMark[] {
  const out: SegmentMark[] = [];
  for (const tp of tps) {
    const ref = parseMarkName(tp.markName);
    if (!ref) continue;
    out.push({ s: ref.sentence, o: 'end' in ref ? null : ref.offset, t: tp.timeSeconds });
  }
  return out.sort((a, b) => a.t - b.t);
}

// ---------- משך MP3 ----------

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

/**
 * משך MP3 בקצב קבוע (CBR), מכותרת המסגרת הראשונה: גודל × 8 ÷ קצב. Google מחזירה 64kbps קבוע,
 * בלי ID3 ובלי כותרת Xing. null אם הכותרת לא מזוהה.
 */
export function mp3DurationSec(bytes: Uint8Array): number | null {
  let i = 0;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33 && bytes.length > 10) {
    i = 10 + ((bytes[6] & 0x7f) << 21) + ((bytes[7] & 0x7f) << 14) + ((bytes[8] & 0x7f) << 7) + (bytes[9] & 0x7f);
  }
  if (bytes.length < i + 4 || bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) return null;
  const version = (bytes[i + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2
  const layer = (bytes[i + 1] >> 1) & 3; // 1 = Layer III
  const idx = bytes[i + 2] >> 4;
  if (layer !== 1 || (version !== 3 && version !== 2) || idx === 0 || idx === 15) return null;
  const kbps = (version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[idx];
  return ((bytes.length - i) * 8) / (kbps * 1000);
}

// ---------- ציר זמן לפרק ----------

export interface TimelineWord {
  t: number;
  sid: string;
  offset: number;
}
export interface TimelineSentence {
  sid: string;
  start: number;
  end: number;
}
export interface Timeline {
  /** כל המילים בפרק, לפי זמן */
  words: TimelineWord[];
  sentences: TimelineSentence[];
  total: number;
}

/** חיבור קטעים (לפי הסדר) לציר אחד */
export function buildTimeline(segments: SegmentMeta[]): Timeline {
  const words: TimelineWord[] = [];
  const sentences: TimelineSentence[] = [];
  let base = 0;
  for (const seg of segments) {
    const firstWord = new Map<number, number>();
    const endAt = new Map<number, number>();
    for (const m of seg.marks) {
      if (m.o === null) endAt.set(m.s, base + m.t);
      else {
        words.push({ t: base + m.t, sid: seg.sids[m.s], offset: m.o });
        if (!firstWord.has(m.s)) firstWord.set(m.s, base + m.t);
      }
    }
    seg.sids.forEach((sid, s) => {
      const start = firstWord.get(s) ?? endAt.get(s) ?? base;
      const next = firstWord.get(s + 1);
      sentences.push({ sid, start, end: endAt.get(s) ?? next ?? base + seg.durationSec });
    });
    base += seg.durationSec;
  }
  words.sort((a, b) => a.t - b.t);
  return { words, sentences, total: base };
}

/** אינדקס המילה האחרונה שהתחילה עד הזמן הנתון (-1 אם עוד לא התחילה אף מילה) */
export function wordIndexAt(tl: Timeline, time: number): number {
  let lo = 0;
  let hi = tl.words.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tl.words[mid].t <= time) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** אינדקס המשפט שהזמן נמצא בו (המשפט האחרון שהתחיל), או -1 */
export function sentenceIndexAt(tl: Timeline, time: number): number {
  let ans = -1;
  for (let i = 0; i < tl.sentences.length; i++) {
    if (tl.sentences[i].start <= time) ans = i;
    else break;
  }
  return ans;
}
