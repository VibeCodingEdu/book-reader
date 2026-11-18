// פירוק משפט למילים. משותף לאפליקציה (מילים לחיצות, סימון, תרגול) ולשרת (סימוני ההקראה),
// כדי שמיקום כל מילה במשפט (offset) יהיה זהה בשניהם.

export interface Token {
  text: string;
  word: boolean;
  /** מיקום באותיות בתוך המשפט */
  offset: number;
}

const WORD = /[A-Za-z0-9À-ɏ]+(?:['’][A-Za-z]+)*(?:-[A-Za-zÀ-ɏ]+)*/g;

export function tokenize(sentence: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of sentence.matchAll(WORD)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: sentence.slice(last, i), word: false, offset: last });
    out.push({ text: m[0], word: true, offset: i });
    last = i + m[0].length;
  }
  if (last < sentence.length) out.push({ text: sentence.slice(last), word: false, offset: last });
  return out;
}
