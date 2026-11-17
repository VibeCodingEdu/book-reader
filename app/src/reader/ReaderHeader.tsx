// סרגל עליון של מסך הספר – משותף למצב קריאה ולמצב לימוד (M2):
// חזרה לספרייה, מעבר לפרק, נגן ההקראה (MP3) והגדרות תצוגה.

import { useState } from 'preact/hooks';
import type { BookMeta } from '../../../shared/book';
import { AudioPanel } from '../AudioPanel';

interface Props {
  book: BookMeta;
  chapterIdx: number | null;
  onBack: () => void;
  onJumpToChapter: (idx: number) => void;
  onOpenSettings: () => void;
}

export function ReaderHeader({ book, chapterIdx, onBack, onJumpToChapter, onOpenSettings }: Props) {
  const [audioOpen, setAudioOpen] = useState(false);
  const [audioMounted, setAudioMounted] = useState(false);

  return (
    <>
      <header class="reader-bar">
        <button class="icon-btn" onClick={onBack} aria-label="חזרה לספרייה">
          →
        </button>
        <select
          class="chapter-select"
          dir="ltr"
          aria-label="מעבר לפרק"
          value={chapterIdx ?? 0}
          onChange={(e) => onJumpToChapter(Number(e.currentTarget.value))}
        >
          {book.chapterTitles.map((t, i) => (
            <option key={i} value={i}>
              {t}
            </option>
          ))}
        </select>
        {book.audioUrl && (
          <button
            class="icon-btn"
            aria-label="הקראה (MP3)"
            aria-pressed={audioOpen}
            onClick={() => {
              setAudioMounted(true);
              setAudioOpen(!audioOpen);
            }}
          >
            🎧
          </button>
        )}
        <button class="icon-btn" onClick={onOpenSettings} aria-label="הגדרות תצוגה">
          Aa
        </button>
      </header>
      {/* הנגן נשאר מחובר גם כשהוא מוסתר, כדי שההשמעה תמשיך */}
      {audioMounted && <AudioPanel book={book} open={audioOpen} />}
    </>
  );
}
