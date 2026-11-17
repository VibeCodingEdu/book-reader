// תרגום הרבה משפטים בבקשות גדולות: חלוקה לקבוצות, הרצה במקביל (במגבלה), והשלמה
// של משפטים שהמנוע דילג עליהם. בלי תלות במנוע מסוים – כדי שאפשר יהיה לבדוק.

export interface BatchItem {
  /** מספר רץ בתוך הבקשה – כך מתאימים תרגום למשפט */
  i: number;
  text: string;
}

/**
 * תרגום שנראה פגום. במקום רשימה של כתבים אסורים (שתמיד תהיה חסרה – ראינו גם ערבית וגם
 * ארמנית), בודקים מה מותר: חייבת להיות לפחות אות עברית אחת, וכל אות אחרת היא עברית
 * או לטינית (לשמות כמו Verona). ספרות, פיסוק ורווחים לא נבדקים.
 */
export function looksBroken(translation: string): boolean {
  if (!/\p{Script=Hebrew}/u.test(translation)) return true;
  return /(?![\p{Script=Hebrew}\p{Script=Latin}])\p{L}/u.test(translation);
}

export type ChunkTranslator = (items: BatchItem[]) => Promise<{ result: { i: number; translation: string }[]; usd: number }>;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let k = 0; k < items.length; k += size) out.push(items.slice(k, k + size));
  return out;
}

/** מריץ פונקציות אסינכרוניות, לכל היותר `limit` בבת אחת */
async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const k = next++;
      results[k] = await fn(items[k]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * מתרגם את כל המשפטים. מחזיר מפה מספר → תרגום ואת העלות.
 * משפטים שחסרו בתשובה (או שתורגמו פגום) נשלחים שוב, כל אחד לבד; אם עדיין חסרים –
 * נשארים בלי תרגום, והמשתמש יכול לנסות שוב למשפט הבודד.
 */
export async function translateAll(
  items: BatchItem[],
  translateChunk: ChunkTranslator,
  { size = 40, concurrency = 3 }: { size?: number; concurrency?: number } = {},
): Promise<{ map: Map<number, string>; usd: number; missing: number[] }> {
  const map = new Map<number, string>();
  let usd = 0;
  const accept = (r: { i: number; translation: string }[], asked: BatchItem[]) => {
    const allowed = new Set(asked.map((x) => x.i));
    for (const { i, translation } of r) {
      if (allowed.has(i) && translation.trim() && !looksBroken(translation)) map.set(i, translation.trim());
    }
  };

  const runRound = async (todo: BatchItem[], groupSize: number) => {
    const parts = await pool(chunk(todo, groupSize), concurrency, async (part) => {
      try {
        return { part, ...(await translateChunk(part)) };
      } catch {
        return { part, result: [], usd: 0 }; // קבוצה שנכשלה – תנוסה שוב בסבב ההשלמה
      }
    });
    for (const p of parts) {
      usd += p.usd;
      accept(p.result, p.part);
    }
  };

  await runRound(items, size);
  // סבב השלמה: כל משפט שחסר (או שתורגם פגום) נשלח לבד. קלט שונה נותן בדרך כלל
  // תשובה שונה – אותה קבוצה בדיוק הייתה מחזירה כנראה אותה טעות.
  const missingFirst = items.filter((x) => !map.has(x.i));
  if (missingFirst.length) await runRound(missingFirst, 1);
  const missing = items.filter((x) => !map.has(x.i)).map((x) => x.i);
  return { map, usd, missing };
}
