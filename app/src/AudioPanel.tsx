import { useEffect, useRef, useState } from 'preact/hooks';
import type { BookMeta } from '../../shared/book';

const RATES = [0.75, 0.9, 1, 1.15, 1.25, 1.5];

/**
 * נגן ההקראה של הספר (קובץ MP3 מאתר המקור). נגן audio רגיל – באייפון ממשיך לנגן
 * גם כשהמסך כבוי, ומופיע במסך הנעילה. סנכרון עם הטקסט – באבן דרך 4.
 */
export function AudioPanel({ book, open }: { book: BookMeta; open: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: book.title, artist: book.author });
    }
  }, [book.id]);

  if (!book.audioUrl) return null;
  return (
    <div class={`audio-panel ${open ? '' : 'hidden'}`} dir="ltr">
      <audio
        ref={audio}
        src={book.audioUrl}
        controls
        preload="none"
        onError={() => setError(true)}
        onPlay={() => {
          setError(false);
          if (audio.current) audio.current.playbackRate = rate;
        }}
      />
      <select aria-label="מהירות הקראה" value={rate} onChange={(e) => setRate(Number(e.currentTarget.value))}>
        {RATES.map((r) => (
          <option key={r} value={r}>
            {r}×
          </option>
        ))}
      </select>
      {error && (
        <p class="msg bad" dir="rtl">
          לא ניתן לנגן את קובץ השמע (ייתכן שאין לספר הזה הקראה באתר).
        </p>
      )}
    </div>
  );
}
