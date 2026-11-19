// בחירת קול הקראה (Google TTS) ושמיעת דוגמה. הרשימה נטענת כשפותחים את ההגדרות.
// הדוגמה מושמעת עם סימון מילה-מילה (כמו בהקראה בספר), ואפשר לעצור אותה בכל רגע.
// היא גם בודקת שזמני המילים חוזרים מלאים.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { tokenize } from '../../shared/tokenize';
import { parseMarkName } from '../../shared/tts';
import { friendlyError, getTtsSample, getTtsVoices, type TtsVoice } from './api';
import { Icon } from './Icon';

const SAMPLE = 'Once upon a time there were four little Rabbits, and their names were Flopsy, Mopsy, Cotton-tail, and Peter.';
const GENDER: Record<string, string> = { MALE: 'גבר', FEMALE: 'אישה' };
const ACCENT: Record<string, string> = { 'en-US': 'אמריקאי', 'en-GB': 'בריטי' };
const TYPE: Record<string, string> = { Wavenet: 'WaveNet', Neural2: 'Neural2' };

/** "אישה · אמריקאי · Neural2" (בלי הרשימה, מפענחים מהשם: en-US-Neural2-A) */
function describe(name: string, voices: TtsVoice[] | null): string {
  const v = voices?.find((x) => x.name === name);
  const m = /^([a-z]{2,3}-[A-Z]{2})-(Wavenet|Neural2)-([A-Z])$/.exec(name);
  if (!m) return name;
  return [v ? GENDER[v.gender] : null, ACCENT[m[1]] ?? m[1], `${TYPE[m[2]]} ${m[3]}`].filter(Boolean).join(' · ');
}

export function VoicePicker({ voice, onChange }: { voice: string; onChange: (v: string) => void }) {
  const [voices, setVoices] = useState<TtsVoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  /** מיקום (offset) המילה שמושמעת עכשיו בדוגמה */
  const [now, setNow] = useState<number | null>(null);
  const [info, setInfo] = useState<{ ok: boolean; text: string } | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const raf = useRef(0);
  /** מספר ריצה: לחיצה על עצירה בזמן ההכנה מבטלת את ההשמעה שעוד לא התחילה */
  const run = useRef(0);
  const tokens = useMemo(() => tokenize(SAMPLE), []);

  const stop = () => {
    run.current++;
    cancelAnimationFrame(raf.current);
    audio.current?.pause();
    audio.current = null;
    setPlaying(false);
    setBusy(false);
    setNow(null);
  };

  useEffect(() => {
    getTtsVoices()
      .then(setVoices)
      .catch((e) => setError(friendlyError(e)));
    return stop;
  }, []);

  const play = async () => {
    if (!voice) return;
    stop();
    const my = run.current;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const r = await getTtsSample(voice, SAMPLE);
      if (my !== run.current) return;
      const bytes = Uint8Array.from(atob(r.audio), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
      const a = new Audio(url);
      audio.current = a;
      // זמני המילים: מילה → שניות
      const words = r.timepoints
        .map((tp) => ({ ref: parseMarkName(tp.markName), t: tp.timeSeconds }))
        .filter((w): w is { ref: { sentence: number; offset: number }; t: number } => !!w.ref && 'offset' in w.ref)
        .sort((x, y) => x.t - y.t);
      const tick = () => {
        let cur: number | null = null;
        for (const w of words) if (w.t <= a.currentTime) cur = w.ref.offset;
        setNow(cur);
        raf.current = requestAnimationFrame(tick);
      };
      a.onended = () => {
        URL.revokeObjectURL(url);
        if (audio.current === a) stop();
      };
      await a.play();
      setBusy(false);
      setPlaying(true);
      raf.current = requestAnimationFrame(tick);
      const ok = r.check.missing.length === 0;
      setInfo({ ok, text: ok ? 'הקול תומך בסימון מילה-מילה' : `חסרים סימונים (${r.check.returned} מתוך ${r.check.sent}): הקול לא מתאים לסימון מילה-מילה` });
    } catch (e) {
      if (my === run.current) {
        setError(friendlyError(e));
        setBusy(false);
      }
    }
  };

  // קבוצות לפי מבטא וסוג קול
  const groups = new Map<string, TtsVoice[]>();
  for (const v of voices ?? []) {
    const key = `${ACCENT[v.language] ?? v.language} · ${TYPE[v.type]}`;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }

  return (
    <div class="voice-picker">
      <div class="voice-current">
        <span class="voice-icon" aria-hidden="true">
          <Icon name="headphones" size={22} />
        </span>
        <div class="voice-current-text">
          <span class="voice-current-name">{voice ? describe(voice, voices) : 'עוד לא נבחר קול'}</span>
          {voice && (
            <span class="muted small en" lang="en" dir="ltr">
              {voice}
            </span>
          )}
        </div>
      </div>

      {voices && (
        <label class="voice-select">
          <span class="visually-hidden">בחירת קול</span>
          <select
            value={voice}
            onChange={(e) => {
              stop();
              onChange(e.currentTarget.value);
            }}
          >
            <option value="">בחירת קול…</option>
            {[...groups.entries()].map(([g, list]) => (
              <optgroup key={g} label={g}>
                {list.map((v) => (
                  <option key={v.name} value={v.name}>
                    {GENDER[v.gender] ?? v.gender} · {v.name.slice(-1)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      {!voices && !error && <p class="set-note">טוען קולות…</p>}

      <p class="voice-sample en" lang="en" dir="ltr" aria-label="טקסט הדוגמה">
        {tokens.map((t) => (t.word && t.offset === now ? <span class="tts-now">{t.text}</span> : t.text))}
      </p>

      <button class={`secondary voice-play ${playing ? 'is-playing' : ''}`} disabled={!voice || !voices || busy} onClick={playing ? stop : play}>
        {playing ? (
          <>
            <Icon name="stop" size={18} />
            עצירה
            <span class="wave" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          </>
        ) : (
          <>
            <Icon name="play" size={18} />
            {busy ? 'מכין דוגמה…' : 'שמיעת דוגמה'}
          </>
        )}
      </button>
      {info && (
        <p class={`set-note ${info.ok ? 'ok' : 'bad'}`}>
          {info.ok ? '✓ ' : ''}
          {info.text}
        </p>
      )}
      {error && <p class="set-note bad">{error}</p>}
    </div>
  );
}
