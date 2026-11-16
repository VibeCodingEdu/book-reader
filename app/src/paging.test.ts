import { describe, expect, it } from 'vitest';
import { anchorForPage, clampPage, pageForAnchor, pageOf, tokenize, unitTokenOffsets, type SentenceStart } from './paging';

describe('pageOf / clampPage', () => {
  it('ממפה מיקום אופקי לעמוד', () => {
    expect(pageOf(0, 400)).toBe(0);
    expect(pageOf(399, 400)).toBe(1); // סבילות של פיקסל אחד
    expect(pageOf(820, 400)).toBe(2);
  });
  it('לא חורג מטווח העמודים', () => {
    expect(clampPage(-3, 10)).toBe(0);
    expect(clampPage(12, 10)).toBe(9);
    expect(clampPage(5, 0)).toBe(0);
  });
});

// פריסה בגופן קטן: 3 משפטים בעמוד
const small: SentenceStart[] = Array.from({ length: 30 }, (_, i) => ({ id: `c1.p${i}.s0`, page: Math.floor(i / 3) }));
// אותו פרק בגופן גדול: משפט וחצי בעמוד
const large: SentenceStart[] = Array.from({ length: 30 }, (_, i) => ({ id: `c1.p${i}.s0`, page: Math.floor(i / 1.5) }));

describe('שמירת מיקום בשינוי גופן או מכשיר', () => {
  it('העוגן של עמוד הוא המשפט הראשון שמתחיל בו', () => {
    expect(anchorForPage(small, 4)).toBe('c1.p12.s0');
  });

  it('אחרי הגדלת גופן חוזרים לאותו משפט, לא לאותו מספר עמוד', () => {
    const anchor = anchorForPage(small, 4)!; // עמוד 4 בגופן קטן
    const page = pageForAnchor(large, anchor);
    expect(page).toBe(8);
    expect(anchorForPage(large, page)).toBe(anchor); // אותו משפט בראש העמוד
  });

  it('אף פעם לא מוביל לעמוד ריק: עמוד העוגן תמיד בטווח', () => {
    for (let p = 0; p < 10; p++) {
      const anchor = anchorForPage(small, p);
      const target = pageForAnchor(large, anchor);
      const pageCount = large[large.length - 1].page + 1;
      expect(target).toBeGreaterThanOrEqual(0);
      expect(target).toBeLessThan(pageCount);
      expect(large.some((s) => s.page === target)).toBe(true);
    }
  });

  it('משפט ארוך שממלא עמוד שלם: העוגן הוא המשפט שנמשך', () => {
    const starts: SentenceStart[] = [
      { id: 'a', page: 0 },
      { id: 'b', page: 0 }, // משפט ארוך שממשיך לעמודים 1-2
      { id: 'c', page: 3 },
    ];
    expect(anchorForPage(starts, 2)).toBe('b');
  });

  it('עוגן לא מוכר → תחילת הפרק', () => {
    expect(pageForAnchor(small, 'c9.p9.s9')).toBe(0);
  });
});

describe('tokenize', () => {
  it('מפרק למילים ושומר מיקומים', () => {
    const t = tokenize('“Don’t stop,” said well-known Mr. Smith.');
    const words = t.filter((x) => x.word).map((x) => x.text);
    expect(words).toEqual(['Don’t', 'stop', 'said', 'well-known', 'Mr', 'Smith']);
    expect(t.map((x) => x.text).join('')).toBe('“Don’t stop,” said well-known Mr. Smith.');
    const stop = t.find((x) => x.text === 'stop')!;
    expect('“Don’t stop,” said well-known Mr. Smith.'.slice(stop.offset, stop.offset + 4)).toBe('stop');
  });
});

describe('unitTokenOffsets', () => {
  it('מסמן את כל חלקי הביטוי הפועלי', () => {
    const s = 'One day a fight broke out in the street.';
    const t = tokenize(s);
    const offs = unitTokenOffsets(t, s.indexOf('broke'), 'broke out');
    expect(offs.sort((a, b) => a - b)).toEqual([s.indexOf('broke'), s.indexOf('out')]);
  });
});
