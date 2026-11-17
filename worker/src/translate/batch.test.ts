import { describe, expect, it } from 'vitest';
import { chunk, looksBroken, translateAll, type BatchItem } from './batch';

const items: BatchItem[] = Array.from({ length: 95 }, (_, i) => ({ i, text: `Sentence ${i}.` }));

describe('chunk', () => {
  it('מחלק לקבוצות בגודל קבוע', () => {
    expect(chunk(items, 40).map((c) => c.length)).toEqual([40, 40, 15]);
  });
});

describe('translateAll', () => {
  it('מתרגם הכול ומתאים לפי מספר, גם כשהתשובה בסדר אחר', async () => {
    const calls: number[] = [];
    const { map, usd, missing } = await translateAll(items, async (part) => {
      calls.push(part.length);
      return { result: [...part].reverse().map((x) => ({ i: x.i, translation: `תרגום ${x.i}` })), usd: 0.001 };
    });
    expect(calls.sort()).toEqual([15, 40, 40]);
    expect(map.size).toBe(95);
    expect(map.get(57)).toBe('תרגום 57');
    expect(usd).toBeCloseTo(0.003);
    expect(missing).toEqual([]);
  });

  it('משלים משפטים שהמנוע דילג עליהם, בבקשה נוספת רק עבורם', async () => {
    let round = 0;
    const asked: number[][] = [];
    const { map, missing } = await translateAll(items.slice(0, 10), async (part) => {
      round++;
      asked.push(part.map((x) => x.i));
      // בסבב הראשון "שוכח" את 3 ו-7
      const result = part.filter((x) => round > 1 || (x.i !== 3 && x.i !== 7)).map((x) => ({ i: x.i, translation: `ת${x.i}` }));
      return { result, usd: 0 };
    });
    expect(asked[1]).toEqual([3, 7]);
    expect(map.size).toBe(10);
    expect(missing).toEqual([]);
  });

  it('מתעלם ממספרים שלא נשאלו ומתרגומים ריקים; קבוצה שנכשלה פעמיים נשארת חסרה', async () => {
    const { map, missing } = await translateAll(items.slice(0, 4), async (part) => {
      if (part.some((x) => x.i === 2)) throw new Error('boom');
      return { result: [...part.map((x) => ({ i: x.i, translation: x.i === 1 ? '  ' : 'ok' })), { i: 99, translation: 'זר' }], usd: 0 };
    }, { size: 2 });
    expect(map.has(99)).toBe(false);
    expect(map.has(1)).toBe(false);
    expect(map.get(0)).toBe('ok');
    // בסבב ההשלמה 3 נשלח בלי 2 (שתמיד נכשל), ולכן מתורגם
    expect(map.get(3)).toBe('ok');
    expect(missing.sort()).toEqual([1, 2]);
  });
});

describe('looksBroken', () => {
  it('מזהה אותיות מכתב זר בתוך עברית', () => {
    expect(looksBroken('אוי ואבوي!')).toBe(true);
    expect(looksBroken('привет')).toBe(true);
    expect(looksBroken('אוי ואבוי!')).toBe(false);
    expect(looksBroken('ורונה (Verona), שנת 1597 – "שלום"')).toBe(false);
  });

  it('תרגום פגום נשלח שוב', async () => {
    let round = 0;
    const { map } = await translateAll([{ i: 0, text: 'Oh dear!' }], async () => {
      round++;
      return { result: [{ i: 0, translation: round === 1 ? 'אוי ואבوي!' : 'אוי ואבוי!' }], usd: 0 };
    });
    expect(round).toBe(2);
    expect(map.get(0)).toBe('אוי ואבוי!');
  });
});
