// תרגום הרבה משפטים בבקשות גדולות: חלוקה לקבוצות, הרצה במקביל (במגבלה), והשלמה
// של משפטים שהמנוע דילג עליהם. בלי תלות במנוע מסוים – כדי שאפשר יהיה לבדוק.

export interface BatchItem {
  /** מספר רץ בתוך הבקשה – כך מתאימים תרגום למשפט */
  i: number;
  text: string;
}

/**
 * תרגום שנראה פגום: אותיות מכתב זר (ערבית, קירילית, יוונית, סינית...) בתוך תרגום עברי.
 * קורה לפעמים במודלים קלים ("אוי ואבوي!"). תרגום כזה נחשב חסר ונשלח שוב.
 */
export function looksBroken(translation: string): boolean {
  return /[\u0600-\u06FF\u0400-\u04FF\u0370-\u03FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(translation);
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
 * משפטים שחסרו בתשובה נשלחים שוב פעם אחת; אם עדיין חסרים – נשארים בלי תרגום.
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

  const runRound = async (todo: BatchItem[]) => {
    const parts = await pool(chunk(todo, size), concurrency, async (part) => {
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

  await runRound(items);
  const missingFirst = items.filter((x) => !map.has(x.i));
  if (missingFirst.length) await runRound(missingFirst);
  const missing = items.filter((x) => !map.has(x.i)).map((x) => x.i);
  return { map, usd, missing };
}
