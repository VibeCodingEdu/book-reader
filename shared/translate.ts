// תוצאת "לחיצה על מילה" – משותפת לשרת ולאפליקציה.

export type UnitType = 'word' | 'phrasal_verb' | 'idiom' | 'proper_noun';

export interface WordLookup {
  /** המילה או הביטוי המלא כפי שהם מופיעים במשפט, למשל "broke out" */
  unit: string;
  unitType: UnitType;
  /** צורת מילון, למשל "break out" */
  lemma: string;
  /** חלק דיבר בעברית: פועל, שם עצם... */
  pos: string;
  ipa: string;
  /** המשמעות בעברית שמתאימה למשפט הזה – מוצגת ראשונה */
  contextMeaning: string;
  otherMeanings: { pos: string; meaning: string }[];
}

export interface WordLookupRequest {
  sentence: string;
  word: string;
  /** מיקום המילה (באותיות) בתוך המשפט – כדי להבחין בין מופעים חוזרים */
  offset: number;
  lang: string;
  engine?: string;
}

export interface WordLookupResponse {
  result: WordLookup;
  engine: string;
  cached: boolean;
}

export const ENGINES = [
  { id: 'claude-haiku', label: 'Claude Haiku 5.5' },
  { id: 'gemini-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
] as const;

/** מסיר ניקוד, לצורך השוואות */
export function stripNiqqud(s: string): string {
  return s.replace(/[֑-ׇ]/g, '');
}
