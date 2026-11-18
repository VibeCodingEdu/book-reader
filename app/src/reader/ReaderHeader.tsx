// סרגל עליון של מסך הספר – משותף למצב קריאה ולמצב לימוד:
// חזרה לספרייה, מעבר לפרק, מעבר קריאה/לימוד, נגן ההקראה (MP3) והגדרות תצוגה.

import { useState } from 'preact/hooks';
import type { BookMeta } from '../../../shared/book';
import { AudioPanel } from '../AudioPanel';
import type { ViewMode } from '../deviceSettings';

interface Props {
  book: BookMeta;
  chapterIdx: number | null;
  viewMode: ViewMode;
  onToggleMode: () => void;
  onBack: () => void;
  onOpenToc: () => void;
  onOpenSettings: () => void;
}

export function ReaderHeader({ book, chapterIdx, viewMode, onToggleMode, onBack, onOpenToc, onOpenSettings }: Props) {
  const [audioOpen, setAudioOpen] = useState(false);
  const [audioMounted, setAudioMounted] = useState(false);

  return (
    <>
      <header class="reader-bar">
        <button class="icon-btn" onClick={onBack} aria-label="חזרה לספרייה">
          →
        </button>
        <button class="toc-btn" onClick={onOpenToc} aria-label="תוכן עניינים, סימניות והערות">
          <span aria-hidden="true">☰</span>
          <span class="toc-btn-title" dir="auto">
            {chapterIdx !== null ? book.chapterTitles[chapterIdx] : ''}
          </span>
        </button>
        <button
          class="icon-btn"
          onClick={onToggleMode}
          aria-label={viewMode === 'study' ? 'מעבר למצב קריאה' : 'מעבר למצב לימוד'}
          title={viewMode === 'study' ? 'קריאה' : 'לימוד'}
        >
          {viewMode === 'study' ? '📖' : '📝'}
        </button>
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
