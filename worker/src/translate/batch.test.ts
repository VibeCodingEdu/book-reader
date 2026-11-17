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

  it('משלים משפטים שהמנוע דילג עליהם – כל אחד בבקשה נפרדת', async () => {
    let round = 0;
    const asked: number[][] = [];
    const { map, missing } = await translateAll(items.slice(0, 10), async (part) => {
      round++;
      asked.push(part.map((x) => x.i));
      // בסבב הראשון "שוכח" את 3 ו-7
      const result = part.filter((x) => round > 1 || (x.i !== 3 && x.i !== 7)).map((x) => ({ i: x.i, translation: `ת${x.i}` }));
      return { result, usd: 0 };
    });
    expect(asked.slice(1).sort()).toEqual([[3], [7]]);
    expect(map.size).toBe(10);
    expect(missing).toEqual([]);
  });

  it('מתעלם ממספרים שלא נשאלו ומתרגומים ריקים; קבוצה שנכשלה פעמיים נשארת חסרה', async () => {
    const { map, missing } = await translateAll(items.slice(0, 4), async (part) => {
      if (part.some((x) => x.i === 2)) throw new Error('boom');
      return { result: [...part.map((x) => ({ i: x.i, translation: x.i === 1 ? '  ' : 'תקין' })), { i: 99, translation: 'זר' }], usd: 0 };
    }, { size: 2 });
    expect(map.has(99)).toBe(false);
    expect(map.has(1)).toBe(false);
    expect(map.get(0)).toBe('תקין');
    // בסבב ההשלמה כל משפט נשלח לבד: 3 מתורגם, 2 נכשל שוב, 1 שוב ריק
    expect(map.get(3)).toBe('תקין');
    expect(missing.sort()).toEqual([1, 2]);
  });
});

describe('looksBroken', () => {
  it('מזהה אותיות מכתב זר בתוך עברית', () => {
    expect(looksBroken('אוי ואבوي!')).toBe(true); // ערבית
    expect(looksBroken('Օփ, աստված ադի!')).toBe(true); // ארמנית
    expect(looksBroken('привет')).toBe(true); // קירילית
    expect(looksBroken('გამარჯობა')).toBe(true); // גאורגית
    expect(looksBroken('Hello there')).toBe(true); // בכלל לא תורגם
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

describe('סבב השלמה עם קלט שונה', () => {
  it('משפט שנכשל בקבוצה מצליח כשהוא נשלח לבד', async () => {
    // המנוע "נכשל" על Oh dear! רק כשהוא בתוך קבוצה, כמו שראינו מול Gemini
    const { map, missing } = await translateAll(
      [
        { i: 0, text: 'Two families lived in Verona.' },
        { i: 1, text: 'Oh dear!' },
      ],
      async (part) => ({
        result: part.map((x) => ({ i: x.i, translation: x.i === 1 && part.length > 1 ? 'אוי ואבوي!' : `ת${x.i}` })),
        usd: 0,
      }),
    );
    expect(map.get(1)).toBe('ת1');
    expect(missing).toEqual([]);
  });
});
