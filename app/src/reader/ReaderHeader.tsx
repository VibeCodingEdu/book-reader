// סרגל עליון של מסך הספר – משותף למצב קריאה ולמצב לימוד:
// חזרה לספרייה, מעבר לפרק, מעבר קריאה/לימוד, נגן ההקראה (MP3) והגדרות תצוגה.

import { useState } from 'preact/hooks';
import type { BookMeta } from '../../../shared/book';
import { AudioPanel } from '../AudioPanel';
import { Icon } from '../Icon';
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
          <Icon name="back" />
        </button>
        <button class="toc-btn" onClick={onOpenToc} aria-label="תוכן עניינים, סימניות והערות">
          <Icon name="toc" size={18} />
          <span class="toc-btn-title" dir="auto">
            {chapterIdx !== null ? book.chapterTitles[chapterIdx] : ''}
          </span>
        </button>
        <div class="segmented mode-switch" role="group" aria-label="מצב תצוגה">
          <button aria-pressed={viewMode === 'read'} onClick={() => viewMode !== 'read' && onToggleMode()}>
            קריאה
          </button>
          <button aria-pressed={viewMode === 'study'} onClick={() => viewMode !== 'study' && onToggleMode()}>
            לימוד
          </button>
        </div>
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
            <Icon name="headphones" />
          </button>
        )}
        <button class="icon-btn" onClick={onOpenSettings} aria-label="הגדרות תצוגה">
          <Icon name="type" />
        </button>
      </header>
      {/* הנגן נשאר מחובר גם כשהוא מוסתר, כדי שההשמעה תמשיך */}
      {audioMounted && <AudioPanel book={book} open={audioOpen} />}
    </>
  );
}
