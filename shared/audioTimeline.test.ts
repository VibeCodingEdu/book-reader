import { describe, expect, it } from 'vitest';
import { buildTimeline, marksFromTimepoints, mp3DurationSec, sentenceIndexAt, wordIndexAt, type SegmentMeta } from './audioTimeline';

describe('marksFromTimepoints', () => {
  it('מפענח מילים וסוף משפט, וממיין לפי זמן', () => {
    const m = marksFromTimepoints([
      { markName: 's0e', timeSeconds: 2 },
      { markName: 's0o4', timeSeconds: 1 },
      { markName: 's0o0', timeSeconds: 0.1 },
      { markName: 'junk', timeSeconds: 9 },
    ]);
    expect(m).toEqual([{ s: 0, o: 0, t: 0.1 }, { s: 0, o: 4, t: 1 }, { s: 0, o: null, t: 2 }]);
  });
});

describe('mp3DurationSec', () => {
  // כותרת MPEG-2 Layer III, 64kbps, 24kHz (כמו שגוגל מחזירה): ff f3 84 c4
  const mk = (n: number, head = [0xff, 0xf3, 0x84, 0xc4]) => Uint8Array.from([...head, ...new Array(n - 4).fill(0)]);
  it('64kbps קבוע: 8000 בתים = שנייה', () => expect(mp3DurationSec(mk(27456))).toBeCloseTo(3.432, 3));
  it('MPEG-1, 128kbps', () => expect(mp3DurationSec(mk(16000, [0xff, 0xfb, 0x90, 0x00]))).toBeCloseTo(1, 3));
  it('דולג על ID3 בתחילת הקובץ', () => {
    const id3 = [0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 4, 1, 2, 3, 4]; // גודל תג = 4 בתים אחרי 10 בתים
    const bytes = Uint8Array.from([...id3, 0xff, 0xf3, 0x84, 0xc4, ...new Array(7996).fill(0)]);
    expect(mp3DurationSec(bytes)).toBeCloseTo(1, 2);
  });
  it('לא MP3 – null', () => {
    expect(mp3DurationSec(Uint8Array.from([1, 2, 3, 4, 5]))).toBeNull();
    expect(mp3DurationSec(new Uint8Array(0))).toBeNull();
  });
});

describe('buildTimeline', () => {
  const segA: SegmentMeta = {
    sids: ['c0.p0.s0', 'c0.p0.s1'],
    marks: [
      { s: 0, o: 0, t: 0.1 }, { s: 0, o: 4, t: 0.5 }, { s: 0, o: null, t: 1.0 },
      { s: 1, o: 0, t: 1.2 }, { s: 1, o: null, t: 2.0 },
    ],
    durationSec: 2.1,
    bytes: 0,
  };
  const segB: SegmentMeta = { sids: ['c0.p1.s0'], marks: [{ s: 0, o: 0, t: 0.2 }, { s: 0, o: null, t: 0.9 }], durationSec: 1, bytes: 0 };
  const tl = buildTimeline([segA, segB]);

  it('זמני המילים של הקטע השני מוזזים במשך הראשון', () => {
    expect(tl.words.map((w) => [w.sid, w.offset, +w.t.toFixed(2)])).toEqual([
      ['c0.p0.s0', 0, 0.1], ['c0.p0.s0', 4, 0.5], ['c0.p0.s1', 0, 1.2], ['c0.p1.s0', 0, 2.3],
    ]);
    expect(tl.total).toBeCloseTo(3.1, 5);
  });
  it('משפטים: התחלה = המילה הראשונה, סוף = סימון הסוף', () => {
    expect(tl.sentences.map((s) => [s.sid, +s.start.toFixed(2), +s.end.toFixed(2)])).toEqual([
      ['c0.p0.s0', 0.1, 1.0], ['c0.p0.s1', 1.2, 2.0], ['c0.p1.s0', 2.3, 3.0],
    ]);
  });
  it('wordIndexAt: לפני הכול, באמצע, ובסוף', () => {
    expect(wordIndexAt(tl, 0)).toBe(-1);
    expect(wordIndexAt(tl, 0.1)).toBe(0);
    expect(wordIndexAt(tl, 0.7)).toBe(1);
    expect(wordIndexAt(tl, 2.5)).toBe(3);
    expect(wordIndexAt(tl, 99)).toBe(3);
  });
  it('sentenceIndexAt', () => {
    expect(sentenceIndexAt(tl, 0)).toBe(-1);
    expect(sentenceIndexAt(tl, 1.1)).toBe(0);
    expect(sentenceIndexAt(tl, 1.3)).toBe(1);
    expect(sentenceIndexAt(tl, 3)).toBe(2);
  });
  it('קטע בלי מילים לא שובר את הציר', () => {
    const t = buildTimeline([{ sids: ['c0.p0.s0'], marks: [], durationSec: 1, bytes: 0 }]);
    expect(t.sentences[0]).toMatchObject({ start: 0, end: 1 });
    expect(wordIndexAt(t, 0.5)).toBe(-1);
  });
});
