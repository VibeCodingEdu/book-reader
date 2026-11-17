import { describe, expect, it } from 'vitest';
import { screenStep, topVisibleId, type RowBox } from './studyAnchor';

const rows: RowBox[] = [
  { id: 'c1.p0.s0', top: 0, bottom: 60 },
  { id: 'c1.p0.s1', top: 60, bottom: 120 },
  { id: 'c1.p1.s0', top: 130, bottom: 200 },
];

describe('topVisibleId', () => {
  it('בראש הפרק – המשפט הראשון', () => {
    expect(topVisibleId(rows, 0)).toBe('c1.p0.s0');
  });
  it('משפט שרק קצהו התחתון מציץ למעלה לא נחשב', () => {
    expect(topVisibleId(rows, 52)).toBe('c1.p0.s1');
  });
  it('משפט שחלק ממשי שלו גלוי נחשב', () => {
    expect(topVisibleId(rows, 30)).toBe('c1.p0.s0');
  });
  it('גלילה אל מעבר לסוף – המשפט האחרון', () => {
    expect(topVisibleId(rows, 500)).toBe('c1.p1.s0');
  });
  it('אין שורות', () => {
    expect(topVisibleId([], 0)).toBeNull();
  });
});

describe('screenStep', () => {
  it('מסך שלם פחות שתי שורות', () => {
    expect(screenStep(700, 30)).toBe(640);
  });
  it('לא פחות מחצי מסך בגופן ענק', () => {
    expect(screenStep(400, 150)).toBe(200);
  });
});
