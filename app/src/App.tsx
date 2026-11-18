import { useEffect, useRef, useState } from 'preact/hooks';
import type { BookMeta } from '../../shared/book';
import {
  ApiError,
  getServerSettings,
  loadSession,
  login,
  logout,
  putServerSettings,
  setUnauthorizedHandler,
  type Session,
} from './api';
import { loadSettings, normalizeSettings, saveSettings, type DeviceSettings } from './deviceSettings';
import { Catalog } from './Catalog';
import { Library } from './Library';
import { Reader } from './Reader';
import { SettingsSheet } from './SettingsSheet';

function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'אייפון';
  if (/Android/.test(ua) && navigator.maxTouchPoints > 0) return 'Boox';
  return 'מחשב';
}

export function App() {
  const [settings, setSettings] = useState<DeviceSettings>(loadSettings);
  const [session, setSession] = useState<Session | null>(loadSession);
  const [book, setBook] = useState<BookMeta | null>(null);
  const [catalog, setCatalog] = useState<Set<string> | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => setUnauthorizedHandler(() => setSession(null)), []);

  // ערכת הצבע חלה על כל הדף. "אוטו" = יום/לילה לפי המכשיר, ומתעדכן כשהמכשיר מתחלף.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const t = settings.theme === 'auto' ? (mq?.matches ? 'dark' : 'light') : settings.theme;
      document.documentElement.dataset.theme = t;
      // שורת המצב באייפון/אנדרואיד בצבע הרקע של הערכה
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#ffffff');
    };
    apply();
    if (settings.theme !== 'auto' || !mq) return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);

  // סנכרון הגדרות: בהתחברות – לוקחים מהשרת אם שם חדש יותר
  useEffect(() => {
    if (!session) return;
    getServerSettings()
      .then((srv) => {
        if (srv && srv.updatedAt > settings.updatedAt) {
          const s = normalizeSettings({ ...(srv.data as object), updatedAt: srv.updatedAt });
          setSettings(s);
          saveSettings(s);
        }
      })
      .catch(() => {});
  }, [session?.token]);

  const pushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const updateSettings = (next: DeviceSettings) => {
    const s = { ...next, updatedAt: Date.now() };
    setSettings(s);
    saveSettings(s);
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      const { updatedAt, ...data } = s;
      putServerSettings(data, updatedAt).catch(() => {});
    }, 1500);
  };

  if (!session) return <LoginScreen onDone={setSession} />;

  return (
    <>
      {book ? (
        <Reader
          book={book}
          settings={settings}
          onBack={() => setBook(null)}
          onOpenSettings={() => setShowSettings(true)}
          onPatchSettings={(patch) => updateSettings({ ...settings, ...patch })}
        />
      ) : catalog ? (
        <Catalog
          have={catalog}
          onBack={() => setCatalog(null)}
          onUploaded={(b) => {
            setCatalog(null);
            setBook(b);
          }}
        />
      ) : (
        <Library onOpen={setBook} onOpenSettings={() => setShowSettings(true)} onOpenCatalog={setCatalog} />
      )}
      {showSettings && (
        <SettingsSheet
          settings={settings}
          session={session}
          onChange={updateSettings}
          onClose={() => setShowSettings(false)}
          onLogout={() => {
            logout();
            setShowSettings(false);
            setBook(null);
            setSession(null);
          }}
        />
      )}
    </>
  );
}

function LoginScreen({ onDone }: { onDone: (s: Session) => void }) {
  const [device, setDevice] = useState(guessDeviceName);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main class="page">
      <h1>קורא ספרים</h1>
      <section class="card">
        <h2>התחברות</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              onDone(await login(pass, device.trim() || 'מכשיר'));
            } catch (err) {
              setError(
                err instanceof ApiError && err.status === 401 ? 'סיסמה שגויה' : err instanceof Error ? err.message : 'שגיאה',
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
          {error && (
            <p class="msg bad" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
