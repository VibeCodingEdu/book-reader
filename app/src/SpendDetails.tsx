// פירוט ההוצאה החודשית (בהגדרות): מה צרך את מכסת התווים של Google Translate.
// תרגום מקביל מתרגם פרק שלם בבת אחת, ולכן פרק אחד יכול להיות אחוזים בודדים מהמכסה.
// נטען כשפותחים את הפריט המתקפל.

import { useEffect, useState } from 'preact/hooks';
import { friendlyError, getSpendDetails, type Spend, type SpendChapter } from './api';

const n = (x: number) => x.toLocaleString('he-IL');
const when = (t: number) => new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });

export function SpendDetails({ spend }: { spend: Spend }) {
  const [rows, setRows] = useState<SpendChapter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getSpendDetails()
      .then((r) => setRows(r.chapters))
      .catch((e) => setError(friendlyError(e)));
  }, []);

  const google = spend.byEngine['google-nmt']?.chars ?? 0;
  const chapters = (rows ?? []).filter((r) => r.engine === 'google-nmt');
  const chapterChars = chapters.reduce((s, r) => s + r.chars, 0);
  const other = Math.max(0, google - chapterChars);
  const byBook = new Map<string, { title: string; chars: number; chapters: SpendChapter[] }>();
  for (const r of chapters) {
    const b = byBook.get(r.bookId) ?? { title: r.title, chars: 0, chapters: [] };
    b.chars += r.chars;
    b.chapters.push(r);
    byBook.set(r.bookId, b);
  }

  if (error) return <p class="set-note bad">{error}</p>;
  if (!rows) return <p class="set-note">טוען…</p>;
  return (
    <div class="spend-details">
      <p class="set-note">
        תרגום מקביל מתרגם <strong>פרק שלם</strong> בבת אחת: {chapters.length === 1 ? 'פרק אחד' : `${chapters.length} פרקים`} · כ-{n(chapterChars)} תווים
      </p>
      {[...byBook.values()]
        .sort((a, b) => b.chars - a.chars)
        .map((b) => (
          <div key={b.title} class="spend-book">
            <div class="spend-book-head">
              <span class="spend-book-title en" lang="en" dir="ltr">
                {b.title}
              </span>
              <span class="spend-book-chars">{n(b.chars)}</span>
            </div>
            <ul>
              {b.chapters.map((c) => (
                <li key={`${c.bookId}:${c.chapterIdx}`}>
                  <span>{c.chapterTitle || `פרק ${c.chapterIdx + 1}`}</span>
                  <span class="muted">
                    {n(c.chars)} תווים · {when(c.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      <p class="set-note">משפטים וקטעים בודדים שתורגמו (בקירוב): {n(other)} תווים</p>
      <p class="set-note">תרגום מילים (לחיצה על מילה) נספר בנפרד, בטוקנים של Gemini, ולא במכסת התווים.</p>
    </div>
  );
}
