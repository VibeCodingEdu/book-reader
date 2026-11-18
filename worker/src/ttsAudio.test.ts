import { describe, expect, it } from 'vitest';
import type { Chapter } from '../../shared/book';
import { cachedSegments, chapterPrefix, ensureSegment, planSegments, QuotaError, SegmentTooLong, segmentBase, type BucketLike, type EnsureDeps } from './ttsAudio';

class FakeBucket implements BucketLike {
  store = new Map<string, Uint8Array>();
  async get(key: string) {
    const v = this.store.get(key);
    if (!v) return null;
    return { text: async () => new TextDecoder().decode(v), arrayBuffer: async () => v.buffer as ArrayBuffer, body: new ReadableStream() };
  }
  async put(key: string, value: string | ArrayBuffer | Uint8Array) {
    this.store.set(key, typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value as ArrayBuffer));
  }
  async list({ prefix }: { prefix: string }) {
    return { objects: [...this.store.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false };
  }
}

const chapter: Chapter = {
  title: 'One',
  paragraphs: [['Hello there.', 'How are you?'], [], ['A long one.']],
};

describe('planSegments', () => {
  it('מדלג על פסקאות ריקות ומספר משפטים לפי מקומם בפסקה', () => {
    const p = planSegments(2, chapter);
    expect(p.map((s) => [s.para, s.part, s.sids])).toEqual([
      [0, 0, ['c2.p0.s0', 'c2.p0.s1']],
      [2, 0, ['c2.p2.s0']],
    ]);
  });
  it('פסקה ארוכה מתפצלת לקטעים, והמספור נמשך', () => {
    const long: Chapter = { title: 'x', paragraphs: [Array.from({ length: 150 }, (_, i) => `This is sentence number ${i} in a long paragraph.`)] };
    const p = planSegments(0, long);
    expect(p.length).toBeGreaterThan(1);
    expect(p.flatMap((s) => s.sids)).toEqual(Array.from({ length: 150 }, (_, i) => `c0.p0.s${i}`));
    expect(p.map((s) => s.part)).toEqual(p.map((_, i) => i));
  });
});

describe('ensureSegment', () => {
  const mp3 = Uint8Array.from([0xff, 0xf3, 0x84, 0xc4, ...new Array(7996).fill(0)]); // שנייה
  const make = (over: Partial<EnsureDeps> = {}) => {
    const bucket = new FakeBucket();
    const calls = { synth: 0, billed: [] as number[] };
    const deps: EnsureDeps = {
      bucket,
      synth: async () => {
        calls.synth++;
        return { audio: mp3, timepoints: [{ markName: 's0o0', timeSeconds: 0.1 }, { markName: 's0e', timeSeconds: 0.9 }] };
      },
      used: async () => 0,
      limit: 1000,
      onBilled: async (n) => void calls.billed.push(n),
      ...over,
    };
    return { bucket, calls, deps };
  };
  const prefix = chapterPrefix('b1', 1, 'en-US-Wavenet-D', 0);
  const ref = planSegments(0, chapter)[0];

  it('מסנתז פעם אחת, שומר mp3 וכרטיס, ומחייב תווים', async () => {
    const { bucket, calls, deps } = make();
    const r = await ensureSegment(deps, prefix, ref);
    expect(r.cached).toBe(false);
    expect(r.meta.durationSec).toBeCloseTo(1, 2);
    expect(r.meta.sids).toEqual(['c0.p0.s0', 'c0.p0.s1']);
    expect(bucket.store.has(`${segmentBase(prefix, 0, 0)}.mp3`)).toBe(true);
    expect(calls.synth).toBe(1);
    expect(calls.billed).toHaveLength(1);
    expect(calls.billed[0]).toBeGreaterThan(20);
  });
  it('בפעם השנייה – מהמטמון, בלי סינתזה ובלי חיוב', async () => {
    const { calls, deps } = make();
    await ensureSegment(deps, prefix, ref);
    const again = await ensureSegment(deps, prefix, ref);
    expect(again.cached).toBe(true);
    expect(calls.synth).toBe(1);
    expect(calls.billed).toHaveLength(1);
  });
  it('חריגה מהמכסה נדחית לפני קריאה ל-Google', async () => {
    const { calls, deps } = make({ used: async () => 990 });
    await expect(ensureSegment(deps, prefix, ref)).rejects.toBeInstanceOf(QuotaError);
    expect(calls.synth).toBe(0);
  });
  it('משפט ארוך מדי – שגיאה ברורה', async () => {
    const { deps } = make();
    const huge = { ...ref, sentences: ['word '.repeat(2000)] };
    await expect(ensureSegment(deps, prefix, huge)).rejects.toBeInstanceOf(SegmentTooLong);
  });
  it('cachedSegments מזהה לפי כרטיסי הזמנים', async () => {
    const { bucket, deps } = make();
    await ensureSegment(deps, prefix, ref);
    expect([...(await cachedSegments(bucket, prefix))]).toEqual([segmentBase(prefix, 0, 0)]);
  });
});
