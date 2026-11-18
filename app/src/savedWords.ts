// התאמת מילים שמורות לטקסט: מי מהמילים בשמורות מופיעה במשפט, ואיפה.
// בלי רשת ובלי מנוע תרגום: משווים את הצורה שנשמרה ואת צורת המילון, כולל נטיות רגילות באנגלית.

import { inflections, normToken, type SavedWord, type WordStage } from '../../shared/words';
import { tokenize } from './paging';

interface Entry {
  word: SavedWord;
  /** לכל מילה ביחידה: הצורות שמתאימות לה */
  forms: Set<string>[];
}

export type SavedIndex = Map<string, Entry[]>;

export interface SavedMatch {
  word: SavedWord;
  /** מיקומי (offset) המילים במשפט שמהוות את היחידה */
  offsets: number[];
}

const wordsOf = (s: string) => tokenize(s).filter((t) => t.word).map((t) => normToken(t.text));

/** צורות לכל מקום ביחידה: מהצורה שנשמרה, ומצורת המילון כשיש לה אותו מספר מילים */
function formsFor(w: SavedWord): Set<string>[] {
  const unit = wordsOf(w.unit);
  const lemma = wordsOf(w.lemma);
  return unit.map((u, i) => {
    const set = inflections(u);
    if (lemma.length === unit.length && lemma[i]) for (const f of inflections(lemma[i])) set.add(f);
    // ביחידה של מילה אחת, צורת המילון יכולה להיות בכל אורך ("break out" ל-"broke") – לא מתאימים, כדי לא להגזים
    return set;
  });
}

/** אינדקס לפי המילה הראשונה של היחידה, כדי שההתאמה בטקסט תהיה מהירה */
export function buildIndex(words: SavedWord[]): SavedIndex {
  const idx: SavedIndex = new Map();
  for (const w of words) {
    if (w.deleted) continue;
    const forms = formsFor(w);
    if (!forms.length) continue;
    const entry: Entry = { word: w, forms };
    for (const key of forms[0]) {
      const list = idx.get(key);
      if (list) list.push(entry);
      else idx.set(key, [entry]);
    }
  }
  // היחידות הארוכות קודם – מעדיפים "broke out" על "broke"
  for (const list of idx.values()) list.sort((a, b) => b.forms.length - a.forms.length || b.word.updatedAt - a.word.updatedAt);
  return idx;
}

/** כל ההתאמות במשפט, בלי חפיפות */
export function matchSentence(idx: SavedIndex, sentence: string): SavedMatch[] {
  if (!idx.size) return [];
  const toks = tokenize(sentence).filter((t) => t.word);
  const norm = toks.map((t) => normToken(t.text));
  const out: SavedMatch[] = [];
  let i = 0;
  while (i < toks.length) {
    const cands = idx.get(norm[i]);
    let hit: Entry | undefined;
    if (cands) {
      hit = cands.find((c) => c.forms.every((set, k) => i + k < toks.length && set.has(norm[i + k])));
    }
    if (hit) {
      out.push({ word: hit.word, offsets: hit.forms.map((_, k) => toks[i + k].offset) });
      i += hit.forms.length;
    } else i++;
  }
  return out;
}

/** המילה השמורה שמכסה את המילה שנלחצה (לפי מיקומה במשפט), אם יש */
export function savedAt(idx: SavedIndex, sentence: string, offset: number): SavedMatch | undefined {
  return matchSentence(idx, sentence).find((m) => m.offsets.includes(offset));
}

export const STAGE_CLASS: Record<WordStage, string> = { new: 'sv-new', learning: 'sv-learning', known: 'sv-known' };
