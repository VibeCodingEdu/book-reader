import { describe, expect, it } from 'vitest';
import { checkAnswer, editDistance, normAnswer, suggestedRating } from './answer';

describe('normAnswer', () => {
  it('אותיות קטנות, פיסוק ורווחים', () => expect(normAnswer("  Ran   AFTER!! ")).toBe('ran after'));
  it('גרש מסולסל וגרש רגיל זהים', () => expect(normAnswer('don’t')).toBe("don't"));
  it('מקף כרווח', () => expect(normAnswer('No-one')).toBe('no one'));
});

describe('editDistance', () => {
  it.each([
    ['cat', 'cat', 0],
    ['cat', 'cut', 1],
    ['cat', 'cats', 1],
    ['kitten', 'sitting', 3],
    ['', 'abc', 3],
  ])('%s / %s = %i', (a, b, d) => expect(editDistance(a, b)).toBe(d));
});

describe('checkAnswer', () => {
  it('נכון – בלי קשר לאותיות גדולות ופיסוק', () => {
    expect(checkAnswer('Squeezed.', ['squeezed'])).toBe('correct');
    expect(checkAnswer(' ran  after ', ['ran after'])).toBe('correct');
  });
  it('שגיאת כתיב אחת במילה בינונית – קרוב', () => {
    expect(checkAnswer('squezed', ['squeezed'])).toBe('close');
  });
  it('מילה קצרה – בלי סובלנות', () => {
    expect(checkAnswer('cut', ['cat'])).toBe('wrong');
  });
  it('מילה ארוכה – עד שתי שגיאות', () => {
    expect(checkAnswer('embarasing', ['embarrassing'])).toBe('close');
  });
  it('שגוי לגמרי וריק', () => {
    expect(checkAnswer('table', ['squeezed'])).toBe('wrong');
    expect(checkAnswer('   ', ['squeezed'])).toBe('wrong');
  });
  it('צורת מילון במקום צורה נטויה – קרוב', () => {
    expect(checkAnswer('squeeze', ['squeezed'], ['squeeze'])).toBe('close');
  });
  it('ביטוי: סדר ומילים חשובים', () => {
    expect(checkAnswer('ran after', ['ran after'])).toBe('correct');
    expect(checkAnswer('after ran', ['ran after'])).toBe('wrong');
  });
});

describe('suggestedRating', () => {
  it('נכון = טוב, קרוב = קשה, שגוי = שוב', () => {
    expect([suggestedRating('correct'), suggestedRating('close'), suggestedRating('wrong')]).toEqual([3, 2, 1]);
  });
});
