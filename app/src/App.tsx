import { useEffect, useMemo, useState } from 'preact/hooks';
import { ApiError, checkSession, loadSession, login, logout, type Session } from './api';
import { collectDiagnostics, splitSentences } from './diagnostics';
import { loadSettings, saveSettings, type DeviceSettings, type Theme } from './deviceSettings';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'light', label: 'בהיר' },
  { id: 'dark', label: 'כהה' },
  { id: 'sepia', label: 'ספיה' },
  { id: 'eink', label: 'E-ink' },
];

const SAMPLE =
  'Two rich noble families lived in the city. One day a fight broke out in the street. ' +
  'The Prince ordered them to stop, and the conflict eventually ended.';

function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'אייפון';
  if (/Android/.test(ua) && navigator.maxTouchPoints > 0) return 'Boox';
  return 'מחשב';
}

export function App() {
  const [settings, setSettings] = useState<DeviceSettings>(loadSettings);
  const [session, setSession] = useState<Session | null>(loadSession);
  const [status, setStatus] = useState<{ text: string; kind: 'ok' | 'bad' } | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!session) return;
    checkSession(session)
      .then((ok) => {
        if (ok) setStatus({ text: 'מחובר לשרת ✓', kind: 'ok' });
        else {
          setSession(null);
          setStatus({ text: 'החיבור פג. יש להתחבר מחדש.', kind: 'bad' });
        }
      })
      .catch((e: unknown) => setStatus({ text: e instanceof Error ? e.message : 'שגיאה', kind: 'bad' }));
  }, []);

  const diag = useMemo(collectDiagnostics, []);
  const sentences = useMemo(() => splitSentences(SAMPLE), []);

  return (
    <main class="page">
      <h1>קורא ספרים</h1>

      <section class="card" aria-labelledby="h-conn">
        <h2 id="h-conn">חיבור לשרת</h2>
        {session ? (
          <div class="row">
            <span>
              המכשיר מחובר בשם <strong>{session.device}</strong>
            </span>
            <button
              class="secondary"
              onClick={() => {
                logout();
                setSession(null);
                setStatus(null);
              }}
            >
              התנתקות
            </button>
          </div>
        ) : (
          <LoginForm
            onDone={(s) => {
              setSession(s);
              setStatus({ text: 'מחובר לשרת ✓', kind: 'ok' });
            }}
            onError={(text) => setStatus({ text, kind: 'bad' })}
          />
        )}
        {status && (
          <p class={`msg ${status.kind}`} role="status">
            {status.text}
          </p>
        )}
      </section>

      <section class="card" aria-labelledby="h-view">
        <h2 id="h-view">תצוגה במכשיר הזה</h2>
        <div class="segmented" role="group" aria-label="ערכת צבע">
          {THEMES.map((t) => (
            <button
              key={t.id}
              aria-pressed={settings.theme === t.id}
              onClick={() => setSettings({ ...settings, theme: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div class="row" style={{ marginTop: '12px' }}>
          <button
            class="secondary"
            aria-label="הקטנת גופן"
            onClick={() => setSettings({ ...settings, fontSize: Math.max(12, settings.fontSize - 1) })}
          >
            א−
          </button>
          <span aria-live="polite">{settings.fontSize}px</span>
          <button
            class="secondary"
            aria-label="הגדלת גופן"
            onClick={() => setSettings({ ...settings, fontSize: Math.min(40, settings.fontSize + 1) })}
          >
            א+
          </button>
          <button
            class="secondary"
            onClick={() =>
              setSettings({ ...settings, fontFamily: settings.fontFamily === 'serif' ? 'sans' : 'serif' })
            }
          >
            {settings.fontFamily === 'serif' ? 'גופן: סריף' : 'גופן: סנס'}
          </button>
        </div>
        <p
          class={`en sample ${settings.fontFamily}`}
          lang="en"
          style={{ '--reader-size': `${settings.fontSize}px` }}
        >
          {sentences.map((s, i) => (
            <span key={i}>
              <span class="sentence">{s}</span>{' '}
            </span>
          ))}
        </p>
        <p class="msg">זוהו {sentences.length} משפטים בקטע (קו מנוקד מתחת לכל משפט).</p>
      </section>

      <section class="card" aria-labelledby="h-diag">
        <h2 id="h-diag">בדיקת מכשיר</h2>
        <table class="diag">
          <tbody>
            {diag.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td class={r.label === 'User-Agent' ? 'ua' : undefined}>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function LoginForm(props: { onDone: (s: Session) => void; onError: (msg: string) => void }) {
  const [device, setDevice] = useState(guessDeviceName);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          props.onDone(await login(pass, device.trim() || 'מכשיר'));
          setPass('');
        } catch (err) {
          props.onError(
            err instanceof ApiError && err.status === 401
              ? 'סיסמה שגויה'
              : err instanceof Error
                ? err.message
                : 'שגיאה',
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        <span>שם המכשיר</span>
        <input type="text" value={device} onInput={(e) => setDevice(e.currentTarget.value)} />
      </label>
      <label>
        <span>סיסמה אישית</span>
        <input
          type="password"
          autoComplete="current-password"
          value={pass}
          onInput={(e) => setPass(e.currentTarget.value)}
          required
        />
      </label>
      <button type="submit" disabled={busy || !pass}>
        {busy ? 'מתחבר…' : 'התחברות'}
      </button>
    </form>
  );
}
