import { describe, expect, it } from 'vitest';
import { hasForeignScript, lookupHasForeignScript, stripForeignScript, stripLookup, type WordLookup } from './translate';

const lookup = (over: Partial<WordLookup> = {}): WordLookup => ({
  unit: "I've", unitType: 'word', lemma: 'have', pos: 'פועל עזר', ipa: '/hæv/',
  contextMeaning: 'אני (קיצור של I have)', otherMeanings: [{ pos: 'פועל', meaning: 'להחזיק' }], ...over,
});

describe('hasForeignScript', () => {
  it('עברית, אנגלית, ניקוד ופיסוק – תקינים', () => {
    for (const s of ['אני (קיצור של I have)', 'הסתיים', 'פרצה (קטטה)', "don't", 'לחזר (אחרי)', 'שָׁלוֹם', '/hæv/']) expect(hasForeignScript(s)).toBe(false);
  });
  it('תו ערבי באמצע מילה עברית', () => expect(hasForeignScript('כיוﺻר')).toBe(true));
  it('קירילית, סינית, יפנית, קוריאנית, הינדי ותאילנדית', () => {
    for (const s of ['привет', '你好', 'こんにちは', '안녕', 'नमस्ते', 'สวัสดี']) expect(hasForeignScript(s)).toBe(true);
  });
});

describe('stripForeignScript', () => {
  it('מוריד את התו הזר ומשאיר את השאר', () => expect(stripForeignScript('אני (כיוﺻר קיצור)')).toBe('אני (כיור קיצור)'));
  it('בלי תווים זרים – ללא שינוי', () => expect(stripForeignScript('אני')).toBe('אני'));
});

describe('lookup', () => {
  it('תוצאה תקינה', () => expect(lookupHasForeignScript(lookup())).toBe(false));
  it('תו זר בהקשר או במשמעויות אחרות', () => {
    expect(lookupHasForeignScript(lookup({ contextMeaning: 'אני (כיוﺻר)' }))).toBe(true);
    expect(lookupHasForeignScript(lookup({ otherMeanings: [{ pos: 'פועל', meaning: 'להחזיק 我' }] }))).toBe(true);
  });
  it('stripLookup מנקה את כל השדות', () => {
    const r = stripLookup(lookup({ contextMeaning: 'אני (כיוﺻר)', otherMeanings: [{ pos: 'פועל', meaning: 'להחזיק 我' }] }));
    expect(lookupHasForeignScript(r)).toBe(false);
    expect(r.otherMeanings[0].meaning).toBe('להחזיק');
  });
});
