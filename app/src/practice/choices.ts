// בחירה מבין 4 תרגומים: המשמעות הנכונה + 3 מסיחים ממילים אחרות ברשימה.
// הסדר דטרמיניסטי (לפי מזהי המילים), כך שהכרטיס לא "מתערבב" בכל רינדור.

import type { SavedWord } from '../../../shared/words';
import { normAnswer } from './answer';

/** גיבוב פשוט ויציב (FNV-1a) */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Choice {
  id: string;
  meaning: string;
}

/** 4 אפשרויות (כולל הנכונה), או null אם אין מספיק משמעויות שונות ברשימה */
export function pickChoices(target: SavedWord, all: SavedWord[], n = 4): Choice[] | null {
  const seen = new Set([normAnswer(target.meaning)]);
  const pool = all.filter((w) => w.id !== target.id).sort((a, b) => hash(target.id + a.id) - hash(target.id + b.id));
  const picked: SavedWord[] = [];
  for (const w of pool) {
    const m = normAnswer(w.meaning);
    if (!m || seen.has(m)) continue;
    seen.add(m);
    picked.push(w);
    if (picked.length === n - 1) break;
  }
  if (picked.length < n - 1) return null;
  return [target, ...picked]
    .sort((a, b) => hash('o' + target.id + a.id) - hash('o' + target.id + b.id))
    .map((w) => ({ id: w.id, meaning: w.meaning }));
}
