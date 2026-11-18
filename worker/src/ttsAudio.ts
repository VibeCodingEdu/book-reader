// הקראה של פרק: חלוקה לקטעים, ושמירה במטמון ב-R2.
// כל קטע (חלק מפסקה, עד מגבלת הגודל של Google) נשמר פעם אחת כ-MP3 + כרטיס זמנים (JSON),
// לפי הספר, גרסת הפענוח, הקול והמקום בפרק. האזנה חוזרת לא מסנתזת ולא עולה כסף.

import { marksFromTimepoints, mp3DurationSec, type SegmentMeta } from '../../shared/audioTimeline';
import { sentenceId, type Chapter } from '../../shared/book';
import { billedChars, buildSsml, byteLength, splitSegments } from '../../shared/tts';
import type { Synthesis } from './tts';

/** גוגל לא מקבלת יותר מ-5000 בתים; משפט בודד שחורג לא יוקרא */
export const GOOGLE_MAX_BYTES = 5000;

export interface SegmentRef {
  para: number;
  part: number;
  sentences: string[];
  sids: string[];
}

/** כל הקטעים של פרק, בסדר. דטרמיניסטי: אותו פרק – אותה חלוקה, כך שהמפתחות במטמון יציבים */
export function planSegments(chapterIdx: number, chapter: Chapter): SegmentRef[] {
  const out: SegmentRef[] = [];
  chapter.paragraphs.forEach((sentences, para) => {
    if (!sentences.length) return;
    let first = 0;
    splitSegments(sentences).forEach((group, part) => {
      out.push({
        para,
        part,
        sentences: group,
        sids: group.map((_, i) => sentenceId(chapterIdx, para, first + i)),
      });
      first += group.length;
    });
  });
  return out;
}

export const chapterPrefix = (bookId: string, parserVersion: number, voice: string, chapterIdx: number) =>
  `tts/${bookId}/v${parserVersion}/${voice}/c${chapterIdx}/`;
export const segmentBase = (prefix: string, para: number, part: number) => `${prefix}p${para}-${part}`;

/** החלק של R2 שבו משתמשים (נוח לבדיקות) */
export interface BucketLike {
  get(key: string): Promise<{ text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer>; body: ReadableStream } | null>;
  put(key: string, value: string | ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
}

/** אילו קטעים כבר במטמון: אוסף ה-base (p{para}-{part}) שיש להם כרטיס זמנים */
export async function cachedSegments(bucket: BucketLike, prefix: string): Promise<Set<string>> {
  const out = new Set<string>();
  let cursor: string | undefined;
  do {
    const res = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const o of res.objects) if (o.key.endsWith('.json')) out.add(o.key.slice(0, -'.json'.length));
    cursor = res.truncated ? res.cursor : undefined;
  } while (cursor);
  return out;
}

export class QuotaError extends Error {}
export class SegmentTooLong extends Error {}

export interface EnsureDeps {
  bucket: BucketLike;
  synth: (ssml: string) => Promise<Synthesis>;
  /** כמה תווים נוצלו החודש */
  used: () => Promise<number>;
  limit: number;
  /** רישום התווים שחויבו */
  onBilled: (chars: number) => Promise<void>;
}

/** הקטע מהמטמון, או מסנתז ושומר. מחזיר את כרטיס הזמנים */
export async function ensureSegment(deps: EnsureDeps, prefix: string, ref: SegmentRef): Promise<{ meta: SegmentMeta; cached: boolean }> {
  const base = segmentBase(prefix, ref.para, ref.part);
  const hit = await deps.bucket.get(`${base}.json`);
  if (hit) return { meta: JSON.parse(await hit.text()) as SegmentMeta, cached: true };

  const { ssml } = buildSsml(ref.sentences);
  if (byteLength(ssml) > GOOGLE_MAX_BYTES) throw new SegmentTooLong('משפט ארוך מדי להקראה');
  const chars = billedChars(ssml);
  const used = await deps.used();
  if (used + chars > deps.limit) {
    throw new QuotaError(`מכסת התווים החודשית להקראה נוצלה (${used.toLocaleString('en-US')} מתוך ${deps.limit.toLocaleString('en-US')})`);
  }
  const { audio, timepoints } = await deps.synth(ssml);
  const meta: SegmentMeta = {
    sids: ref.sids,
    marks: marksFromTimepoints(timepoints),
    // בלי כותרת מוכרת – מניחים 64kbps (מה ש-Google מחזירה)
    durationSec: mp3DurationSec(audio) ?? (audio.length * 8) / 64000,
    bytes: audio.length,
  };
  await deps.bucket.put(`${base}.mp3`, audio, { httpMetadata: { contentType: 'audio/mpeg' } });
  await deps.bucket.put(`${base}.json`, JSON.stringify(meta), { httpMetadata: { contentType: 'application/json' } });
  await deps.onBilled(chars);
  return { meta, cached: false };
}
