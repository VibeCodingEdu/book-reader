// מיקום קריאה: נשמר מקומית מיד, ונשלח לשרת בהשהיה קצרה.
// בפתיחת ספר משווים בין המקומי לשרת – החדש יותר גובר.

import { getPosition, putPosition } from './api';

export interface LocalPosition {
  sentenceId: string;
  updatedAt: number;
}

const key = (bookId: string) => `reader.pos.${bookId}`;

export function loadLocalPosition(bookId: string): LocalPosition | null {
  try {
    const raw = localStorage.getItem(key(bookId));
    return raw ? (JSON.parse(raw) as LocalPosition) : null;
  } catch {
    return null;
  }
}

function saveLocalPosition(bookId: string, p: LocalPosition) {
  try {
    localStorage.setItem(key(bookId), JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function pickNewer<T extends { updatedAt: number }>(a: T | null, b: T | null): T | null {
  if (!a) return b;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}

/** מיקום התחלתי: החדש מבין המקומי והשרת (אם השרת לא זמין – המקומי) */
export async function resolveStartPosition(bookId: string): Promise<LocalPosition | null> {
  const local = loadLocalPosition(bookId);
  try {
    const server = await getPosition(bookId);
    const best = pickNewer(local, server);
    if (best) saveLocalPosition(bookId, { sentenceId: best.sentenceId, updatedAt: best.updatedAt });
    return best;
  } catch {
    return local;
  }
}

/** שומר מיקום: מקומית מיד, לשרת אחרי 2 שניות שקט (או מיד ביציאה מהאפליקציה) */
export function createPositionSaver(bookId: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: LocalPosition | null = null;

  const flush = (keepalive = false) => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (!pending) return;
    const p = pending;
    pending = null;
    putPosition(bookId, p.sentenceId, p.updatedAt, keepalive).catch(() => {
      // נכשל (אין רשת) – ננסה שוב בשמירה הבאה
      pending = pending ?? p;
    });
  };

  const onHide = () => {
    if (document.visibilityState === 'hidden') flush(true);
  };
  document.addEventListener('visibilitychange', onHide);

  return {
    save(sentenceId: string) {
      const p = { sentenceId, updatedAt: Date.now() };
      saveLocalPosition(bookId, p);
      pending = p;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => flush(), 2000);
    },
    dispose() {
      flush(true);
      document.removeEventListener('visibilitychange', onHide);
    },
  };
}
