// סרגל ההקראה (Google TTS): הפעלה / השהיה, מצב ההכנה, זמן ומהירות.
// נשאר מחובר גם כשהוא מוסתר, כדי שההקראה תמשיך.

import { Icon } from '../Icon';
import { TTS_RATES, type ChapterTts } from './useChapterTts';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function TtsBar({ tts, open, onOpenSettings }: { tts: ChapterTts; open: boolean; onOpenSettings: () => void }) {
  const { status, progress, playing, time } = tts;
  return (
    <div class={`tts-bar ${open ? '' : 'hidden'}`} role="region" aria-label="הקראה">
      {!tts.hasVoice ? (
        <div class="tts-msg">
          <span>עוד לא נבחר קול להקראה.</span>
          <button class="secondary" onClick={onOpenSettings}>
            בחירת קול
          </button>
        </div>
      ) : (
        <>
          <button
            class="tts-play"
            onClick={() => void tts.toggle()}
            disabled={status === 'preparing'}
            aria-label={playing ? 'השהיה' : 'הקראת הפרק'}
          >
            <Icon name={playing ? 'pause' : 'play'} size={26} />
          </button>
          <div class="tts-status" aria-live="polite">
            {status === 'preparing' && (
              <>
                <span>מכינים את הפרק… {progress.total ? `${progress.done} מתוך ${progress.total}` : ''}</span>
                <span class="tts-progress" aria-hidden="true">
                  <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                </span>
              </>
            )}
            {status === 'error' && <span class="msg bad">{tts.error}</span>}
            {status === 'idle' && <span class="muted">לחצו ▶ להקראת הפרק</span>}
            {status === 'ready' && (
              <span class="tts-time" dir="ltr">
                {mmss(time.now)} / {mmss(time.total)}
              </span>
            )}
            {status === 'ready' && tts.error && <span class="msg bad">{tts.error}</span>}
          </div>
          <select class="tts-rate" aria-label="מהירות הקראה" value={tts.rate} onChange={(e) => tts.setRate(Number(e.currentTarget.value))}>
            {TTS_RATES.map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
