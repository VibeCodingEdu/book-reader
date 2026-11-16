import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import type { BookMeta, Chapter } from '../../shared/book';
import type { TextTranslateRequest, TextTranslateResponse, WordLookupRequest, WordLookupResponse } from '../../shared/translate';
import { validateUpload } from './upload';
import { fetchExternal } from './external';
import { passphraseMatches, signToken, verifyToken, type TokenPayload } from './auth';
import { importGutenberg, searchGutenberg } from './gutenberg';
import * as store from './store';
import { EngineUnavailable, getEngine } from './translate/engines';

export interface Env {
  ALLOWED_ORIGINS: string;
  PASSPHRASE: string;
  TOKEN_SECRET: string;
  DB: D1Database;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  DEFAULT_ENGINE?: string;
  MONTHLY_CAP_USD?: string;
}

type AppEnv = { Bindings: Env; Variables: { user: TokenPayload } };

export const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim());
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  })(c, next);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : 'שגיאת שרת' }, 500);
});

app.get('/health', (c) => c.json({ ok: true }));

app.post('/auth/login', async (c) => {
  if (!c.env.PASSPHRASE || !c.env.TOKEN_SECRET) {
    return c.json({ error: 'השרת לא הוגדר: חסרים סודות' }, 500);
  }
  const body = await c.req.json<{ passphrase?: string; device?: string }>().catch(() => ({}) as never);
  const pass = typeof body.passphrase === 'string' ? body.passphrase : '';
  const device = (typeof body.device === 'string' ? body.device : 'מכשיר').slice(0, 40);

  if (!(await passphraseMatches(pass, c.env.PASSPHRASE))) {
    await new Promise((r) => setTimeout(r, 600)); // מאט ניחושים
    return c.json({ error: 'סיסמה שגויה' }, 401);
  }
  const token = await signToken(
    { d: device, iat: Math.floor(Date.now() / 1000), jti: crypto.randomUUID() },
    c.env.TOKEN_SECRET,
  );
  return c.json({ token });
});

// ---------- מכאן והלאה: רק עם טוקן ----------
const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = token ? await verifyToken(token, c.env.TOKEN_SECRET) : null;
  if (!user) return c.json({ error: 'לא מחובר' }, 401);
  c.set('user', user);
  await next();
});

app.use('/api/*', requireAuth);
app.use('/auth/me', requireAuth);

app.get('/auth/me', (c) => c.json({ device: c.get('user').d }));

// ---------- ספרייה ----------
app.get('/api/gutenberg/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.json({ results: [] });
  try {
    return c.json({ results: await searchGutenberg(q) });
  } catch {
    return c.json({ error: 'החיפוש ב-Gutenberg לא זמין כרגע. אפשר לייבא לפי מספר ספר.' }, 502);
  }
});

app.get('/api/books', async (c) => c.json({ books: await store.listBooks(c.env.DB) }));

app.post('/api/books/import', async (c) => {
  const body = await c.req.json<{ gutenbergId?: number; title?: string; author?: string }>();
  const id = Number(body.gutenbergId);
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'מספר ספר לא תקין' }, 400);
  const hint = typeof body.title === 'string' ? { title: body.title.slice(0, 200), author: String(body.author ?? '').slice(0, 200) } : undefined;
  const { meta, chapters } = await importGutenberg(id, hint);
  await store.saveBook(c.env.DB, meta, chapters);
  return c.json({ book: meta });
});

// ספר שפוענח בדפדפן (EPUB / PDF / TXT) – נשמר כמו ספר Gutenberg
app.post('/api/books/upload', async (c) => {
  const body = await c.req.json<{ meta?: BookMeta; chapters?: Chapter[] }>();
  const err = validateUpload(body.meta, body.chapters);
  if (err) return c.json({ error: err }, 400);
  const meta = body.meta!;
  const chapters = body.chapters!;
  const clean: BookMeta = {
    id: meta.id,
    lang: meta.lang || 'en',
    title: meta.title.slice(0, 300),
    author: (meta.author ?? '').slice(0, 300),
    source: meta.source,
    level: meta.level?.slice(0, 10),
    sourceUrl: meta.sourceUrl?.slice(0, 500),
    audioUrl: meta.audioUrl,
    chapterCount: chapters.length,
    wordCount: Number(meta.wordCount) || 0,
    chapterTitles: chapters.map((ch) => String(ch.title).slice(0, 200)),
  };
  await store.saveBook(c.env.DB, clean, chapters);
  return c.json({ book: clean });
});

// הורדת קובץ ספר מאתר קטלוג (בלחיצת המשתמש) – מועבר כמו שהוא לאפליקציה, שמפענחת אותו
app.get('/api/external', async (c) => {
  const url = c.req.query('url') ?? '';
  try {
    const res = await fetchExternal(url);
    return new Response(res.body, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ההורדה נכשלה' }, 502);
  }
});

app.get('/api/books/:id', async (c) => {
  const book = await store.getBook(c.env.DB, c.req.param('id'));
  return book ? c.json({ book }) : c.json({ error: 'הספר לא נמצא' }, 404);
});

app.delete('/api/books/:id', async (c) => {
  await store.deleteBook(c.env.DB, c.req.param('id'));
  return c.json({ ok: true });
});

app.get('/api/books/:id/chapters/:idx', async (c) => {
  const ch = await store.getChapter(c.env.DB, c.req.param('id'), Number(c.req.param('idx')));
  if (!ch) return c.json({ error: 'הפרק לא נמצא' }, 404);
  c.header('Cache-Control', 'private, max-age=86400');
  return c.json({ chapter: ch });
});

// ---------- מיקום קריאה ----------
app.get('/api/positions/:bookId', async (c) => {
  return c.json({ position: await store.getPosition(c.env.DB, c.req.param('bookId')) });
});

app.put('/api/positions/:bookId', async (c) => {
  const body = await c.req.json<{ sentenceId?: string; updatedAt?: number }>();
  if (typeof body.sentenceId !== 'string' || typeof body.updatedAt !== 'number') {
    return c.json({ error: 'נתונים חסרים' }, 400);
  }
  const position = await store.putPosition(c.env.DB, c.req.param('bookId'), {
    sentenceId: body.sentenceId,
    updatedAt: body.updatedAt,
    device: c.get('user').d,
  });
  return c.json({ position });
});

// ---------- הגדרות לכל מכשיר ----------
app.get('/api/settings', async (c) => c.json({ settings: await store.getSettings(c.env.DB, c.get('user').d) }));

app.put('/api/settings', async (c) => {
  const body = await c.req.json<{ data?: unknown; updatedAt?: number }>();
  if (typeof body.updatedAt !== 'number') return c.json({ error: 'נתונים חסרים' }, 400);
  await store.putSettings(c.env.DB, c.get('user').d, body.data, body.updatedAt);
  return c.json({ ok: true });
});

// ---------- תרגום ----------
app.get('/api/spend', async (c) => {
  const cap = Number(c.env.MONTHLY_CAP_USD ?? '5');
  return c.json({ month: store.currentMonth(), cap, ...(await store.monthSpend(c.env.DB)) });
});

app.post('/api/translate/word', async (c) => {
  const req = await c.req.json<WordLookupRequest>();
  if (!req.sentence || !req.word || req.sentence.length > 2000) return c.json({ error: 'בקשה לא תקינה' }, 400);
  const engineId = req.engine || c.env.DEFAULT_ENGINE || 'claude-haiku';
  const lang = req.lang || 'en';

  const key = await store.cacheKey([engineId, lang, req.word.toLowerCase(), req.offset ?? -1, req.sentence]);
  const cached = await store.getCachedLookup(c.env.DB, key);
  if (cached) return c.json({ result: cached, engine: engineId, cached: true } satisfies WordLookupResponse);

  const cap = Number(c.env.MONTHLY_CAP_USD ?? '5');
  const { total } = await store.monthSpend(c.env.DB);
  if (total >= cap) return c.json({ error: `הגעת לתקרת ההוצאה החודשית (${cap}$)` }, 402);

  let engine;
  try {
    engine = getEngine(engineId, c.env);
  } catch (e) {
    if (e instanceof EngineUnavailable) return c.json({ error: e.message }, 503);
    throw e;
  }
  const { result, usd } = await engine.lookupWord({ ...req, lang });
  await Promise.all([store.putCachedLookup(c.env.DB, key, engineId, result), store.addSpend(c.env.DB, engineId, usd)]);
  return c.json({ result, engine: engineId, cached: false } satisfies WordLookupResponse);
});

app.post('/api/translate/text', async (c) => {
  const req = await c.req.json<TextTranslateRequest>();
  if (!req.text?.trim() || req.text.length > 3000 || (req.context ?? '').length > 6000) {
    return c.json({ error: 'בקשה לא תקינה' }, 400);
  }
  const engineId = req.engine || c.env.DEFAULT_ENGINE || 'claude-haiku';
  const lang = req.lang || 'en';
  const key = await store.cacheKey(['text', engineId, lang, req.text.trim(), req.context ?? '']);
  const cached = await store.getCachedLookup(c.env.DB, key);
  if (cached) return c.json({ result: cached, engine: engineId, cached: true } as unknown as TextTranslateResponse);

  const cap = Number(c.env.MONTHLY_CAP_USD ?? '5');
  const { total } = await store.monthSpend(c.env.DB);
  if (total >= cap) return c.json({ error: `הגעת לתקרת ההוצאה החודשית (${cap}$)` }, 402);

  let engine;
  try {
    engine = getEngine(engineId, c.env);
  } catch (e) {
    if (e instanceof EngineUnavailable) return c.json({ error: e.message }, 503);
    throw e;
  }
  const { result, usd } = await engine.translateText({ ...req, lang });
  await Promise.all([
    store.putCachedLookup(c.env.DB, key, engineId, result as never),
    store.addSpend(c.env.DB, engineId, usd),
  ]);
  return c.json({ result, engine: engineId, cached: false } satisfies TextTranslateResponse);
});

export default app;
