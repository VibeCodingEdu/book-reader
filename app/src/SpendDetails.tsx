// פירוט ההוצאה החודשית (בהגדרות): מה צרך את מכסת התווים של Google Translate, ושל ההקראה.
// תרגום מקביל מתרגם פרק שלם בבת אחת, ולכן פרק אחד יכול להיות אחוזים בודדים מהמכסה.

import { useState } from 'preact/hooks';
import { friendlyError, getSpendDetails, type Spend, type SpendChapter } from './api';

const FREE = 500_000;
const n = (x: number) => x.toLocaleString('he-IL');
const when = (t: number) => new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });

export function SpendDetails({ spend }: { spend: Spend }) {
  const [rows, setRows] = useState<SpendChapter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    if (rows) return;
    try {
      setRows((await getSpendDetails()).chapters);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const google = spend.byEngine['google-nmt'];
  const tts = spend.byEngine['google-tts'];
  const chapters = (rows ?? []).filter((r) => r.engine === 'google-nmt');
  const chapterChars = chapters.reduce((s, r) => s + r.chars, 0);
  const other = Math.max(0, (google?.chars ?? 0) - chapterChars);
  // סיכום לפי ספר
  const byBook = new Map<string, { title: string; chars: number; chapters: SpendChapter[] }>();
  for (const r of chapters) {
    const b = byBook.get(r.bookId) ?? { title: r.title, chars: 0, chapters: [] };
    b.chars += r.chars;
    b.chapters.push(r);
    byBook.set(r.bookId, b);
  }

  return (
    <details class="diag-details" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && load()}>
      <summary>פירוט ההוצאה החודשית</summary>
      <div class="spend-details">
        <p class="small">
          <strong>תרגום Google:</strong> {n(google?.chars ?? 0)} מתוך {n(FREE)} תווים חינם ({Math.round(((google?.chars ?? 0) / FREE) * 100)}%)
        </p>
        {!rows && !error && <p class="muted small">טוען…</p>}
        {error && <p class="msg bad">{error}</p>}
        {rows && (
          <>
            <p class="muted small">
              תרגום פרקים שלמים (תרגום מקביל): כ-{n(chapterChars)} תווים · {chapters.length === 1 ? 'פרק אחד' : `${chapters.length} פרקים`}
            </p>
            {[...byBook.values()].map((b) => (
              <div key={b.title} class="spend-book">
                <div class="spend-book-title en" lang="en">
                  {b.title} <span class="muted">· {n(b.chars)}</span>
                </div>
                <ul class="muted small">
                  {b.chapters.map((c) => (
                    <li key={`${c.bookId}:${c.chapterIdx}`}>
                      {c.chapterTitle || `פרק ${c.chapterIdx + 1}`} · {n(c.chars)} תווים · {when(c.createdAt)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p class="muted small">
              משפטים וקטעים בודדים שתורגמו (בקירוב): {n(other)} תווים
            </p>
          </>
        )}
        <p class="small">
          <strong>הקראה:</strong> {n(tts?.chars ?? 0)}
          {spend.ttsLimit ? ` מתוך ${n(spend.ttsLimit)}` : ''} תווים החודש
        </p>
        <p class="muted small">תרגום מילים (לחיצה על מילה) נספר בנפרד, בטוקנים של Gemini, ולא במכסת התווים.</p>
      </div>
    </details>
  );
}
