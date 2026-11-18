// בחירת קול הקראה (Google TTS) ושמיעת דוגמה. הרשימה נטענת רק כשפותחים את החלק הזה.
// הדוגמה גם בודקת שזמני המילים חוזרים מלאים (הבסיס לסימון מילה-מילה בהקראה).

import { useRef, useState } from 'preact/hooks';
import { friendlyError, getTtsSample, getTtsVoices, type TtsVoice } from './api';

const SAMPLE = 'Once upon a time there were four little Rabbits, and their names were Flopsy, Mopsy, Cotton-tail, and Peter.';
const GENDER: Record<string, string> = { MALE: 'גבר', FEMALE: 'אישה' };
const TYPE: Record<string, string> = { Wavenet: 'WaveNet', Neural2: 'Neural2' };

const label = (v: TtsVoice) => `${v.language} · ${TYPE[v.type]} · ${GENDER[v.gender] ?? v.gender} · ${v.name.slice(-1)}`;

export function VoicePicker({ voice, onChange }: { voice: string; onChange: (v: string) => void }) {
  const [voices, setVoices] = useState<TtsVoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const load = async () => {
    if (voices) return;
    try {
      setVoices(await getTtsVoices());
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const play = async () => {
    if (!voice) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const r = await getTtsSample(voice, SAMPLE);
      const bytes = Uint8Array.from(atob(r.audio), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
      audio.current?.pause();
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
      setInfo(`זמני מילים: ${r.check.returned} מתוך ${r.check.sent}${r.check.missing.length ? ' – חסרים סימונים, הקול לא מתאים לסימון מילה-מילה' : ' ✓'} · ${r.chars} תווים`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details class="diag-details" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && load()}>
      <summary>קול הקראה{voice ? ` · ${voice}` : ''}</summary>
      <div class="voice-picker">
        {!voices && !error && <p class="muted small">טוען קולות…</p>}
        {voices && (
          <label class="field">
            <span>קול</span>
            <select value={voice} onChange={(e) => onChange(e.currentTarget.value)}>
              <option value="">לא נבחר</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
        )}
        {voices && (
          <button class="secondary" disabled={!voice || busy} onClick={play}>
            {busy ? 'מכין…' : 'השמעת דוגמה'}
          </button>
        )}
        {info && <p class="muted small">{info}</p>}
        {error && <p class="msg bad">{error}</p>}
      </div>
    </details>
  );
}
