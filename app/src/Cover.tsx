// כריכת ספר: התמונה מהשרת (נשמרת במכשיר ב-IndexedDB, כך שהיא מוצגת גם בלי רשת),
// ואם אין – כריכה טיפוגרפית: שם הספר והמחבר על רקע בצבע קבוע שנגזר מהשם.

import { useEffect, useState } from 'preact/hooks';
import type { BookMeta } from '../../shared/book';
import { getCover } from './api';
import { idbGet, idbSet } from './idb';

const KEY = (id: string) => `cover.v1:${id}`;
/** אחרי "אין כריכה" מנסים שוב רק אחרי יום (השרת עצמו מנסה שוב אחרי כמה ימים) */
const NONE_TTL = 24 * 3600 * 1000;

type Cached = Blob | { none: number };

// כתובות שכבר נוצרו בהפעלה הזו – כדי לא ליצור URL חדש בכל רינדור
const urls = new Map<string, string | null>();

function useCoverUrl(bookId: string): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(urls.get(bookId));
  useEffect(() => {
    if (urls.has(bookId)) {
      setUrl(urls.get(bookId));
      return;
    }
    let alive = true;
    const done = (u: string | null) => {
      urls.set(bookId, u);
      if (alive) setUrl(u);
    };
    (async () => {
      const cached = await idbGet<Cached>(KEY(bookId));
      if (cached instanceof Blob) return done(URL.createObjectURL(cached));
      if (cached && Date.now() - cached.none < NONE_TTL) return done(null);
      try {
        let blob = await getCover(bookId);
        // כריכה "גנרית" שגוטנברג מייצר לספר בלי כריכה – עדיפה הכריכה הטיפוגרפית שלנו
        if (blob && (await isGeneratedCover(blob))) blob = null;
        await idbSet(KEY(bookId), blob ?? { none: Date.now() });
        done(blob ? URL.createObjectURL(blob) : null);
      } catch {
        // אין רשת – כריכה טיפוגרפית בינתיים, וננסה שוב בפעם הבאה
        if (alive) setUrl(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [bookId]);
  return url;
}

/**
 * גוטנברג מייצר לספרים בלי כריכה תמונה גנרית: בדיוק 200×300, שם הספר על פס לבן בחלק העליון
 * ודוגמה צבעונית מתחת. מזהים לפי המידות ולפי הפס הלבן (כריכה סרוקה כמעט אף פעם לא לבנה לגמרי שם).
 */
async function isGeneratedCover(blob: Blob): Promise<boolean> {
  try {
    const bmp = await createImageBitmap(blob);
    if (bmp.width !== 200 || bmp.height !== 300) return false;
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(bmp, 0, 0, 200, 60, 0, 0, 200, 60);
    const px = ctx.getImageData(0, 0, 200, 60).data;
    let white = 0;
    let total = 0;
    for (let i = 0; i < px.length; i += 16) {
      total++;
      if (px[i] > 240 && px[i + 1] > 240 && px[i + 2] > 240) white++;
    }
    return white / total > 0.8;
  } catch {
    return false;
  }
}

/** צבעים עמוקים וחמים לכריכות טיפוגרפיות; הבחירה קבועה לכל שם ספר */
const SHADES = ['#5b3a29', '#2f4a3a', '#2c3e57', '#6b2f2f', '#4a3b5c', '#3e4d36', '#7a4b1e', '#2e4b4f', '#563246'];

export function shadeFor(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return SHADES[h % SHADES.length];
}

export function Cover({ book, size = 'md' }: { book: Pick<BookMeta, 'id' | 'title' | 'author'>; size?: 'sm' | 'md' | 'lg' }) {
  const url = useCoverUrl(book.id);
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return (
      <div class={`cover ${size}`}>
        <img src={url} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
      </div>
    );
  }
  return (
    <div class={`cover ${size} typo ${url === undefined ? 'loading' : ''}`} style={{ '--cover-shade': shadeFor(book.title) }} aria-hidden="true">
      <span class="cover-title en" lang="en">
        {book.title}
      </span>
      {book.author && (
        <span class="cover-author en" lang="en">
          {book.author}
        </span>
      )}
    </div>
  );
}
