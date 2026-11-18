import { describe, expect, it } from 'vitest';
import { billedChars, buildSsml, byteLength, checkTimepoints, escapeXml, parseMarkName, sentenceSsml, splitSegments } from './tts';

describe('sentenceSsml', () => {
  it('סימון לפני כל מילה לפי ה-offset וסימון סוף משפט', () => {
    const { body, marks } = sentenceSsml('Hi there.', 0);
    expect(marks).toEqual(['s0o0', 's0o3', 's0e']);
    expect(body).toBe('<mark name="s0o0"/>Hi <mark name="s0o3"/>there.<mark name="s0e"/>');
  });
  it('תווים מיוחדים ב-XML מוגנים', () => {
    expect(sentenceSsml('Tom & "Jerry" <3', 1).body).toContain('&amp;');
    expect(sentenceSsml('Tom & "Jerry"', 1).body).toContain('&quot;');
    expect(escapeXml("it's")).toBe('it&apos;s');
  });
  it('מילה עם גרש ומקף היא סימון אחד', () => {
    expect(sentenceSsml("Don't go to Cotton-tail", 0).marks).toEqual(['s0o0', 's0o6', 's0o9', 's0o12', 's0e']);
  });
});

describe('buildSsml', () => {
  const { ssml, marks } = buildSsml(['One two.', 'Three.']);
  it('עטוף ב-speak, משפטים ברצף, ומספור משפטים', () => {
    expect(ssml.startsWith('<speak>')).toBe(true);
    expect(ssml.endsWith('</speak>')).toBe(true);
    expect(marks).toEqual(['s0o0', 's0o4', 's0e', 's1o0', 's1e']);
  });
  it('חיוב: בלי תגי mark', () => {
    expect(billedChars(ssml)).toBe('<speak>One two. Three.</speak>'.length);
  });
});

describe('splitSegments', () => {
  const sentences = Array.from({ length: 200 }, (_, i) => `This is sentence number ${i} of a long paragraph.`);
  it('כל קטע בתוך המגבלה, וכל המשפטים נשמרים בסדר', () => {
    const segs = splitSegments(sentences, 1500);
    expect(segs.length).toBeGreaterThan(5);
    for (const seg of segs) expect(byteLength(buildSsml(seg).ssml)).toBeLessThanOrEqual(1500);
    expect(segs.flat()).toEqual(sentences);
  });
  it('פסקה קצרה – קטע אחד', () => {
    expect(splitSegments(['Short one.', 'Another.'])).toHaveLength(1);
  });
});

describe('parseMarkName', () => {
  it('מילה, סוף משפט ושם לא תקין', () => {
    expect(parseMarkName('s3o14')).toEqual({ sentence: 3, offset: 14 });
    expect(parseMarkName('s3e')).toEqual({ sentence: 3, end: true });
    expect(parseMarkName('x')).toBeNull();
  });
});

describe('checkTimepoints', () => {
  it('מזהה סימונים חסרים', () => {
    const r = checkTimepoints(['s0o0', 's0o3', 's0e'], [{ markName: 's0o0', timeSeconds: 0 }, { markName: 's0e', timeSeconds: 1 }]);
    expect(r).toEqual({ sent: 3, returned: 2, missing: ['s0o3'] });
  });
});
