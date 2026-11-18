import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { validateAnnotation, type Annotation } from '../../shared/annotations';
import { validateReview, type Review } from '../../shared/review';
import { validateWord, type SavedWord } from '../../shared/words';
import { normalizeMeta, parseSentenceId, parserVersionOf, sentenceId, type BookMeta, type Chapter } from '../../shared/book';
import type {
  ChapterTranslateRequest,
  ChapterTranslateResponse,
  SentenceTranslateRequest,
  SentenceTranslateResponse,
  TextTranslateRequest,
  TextTranslateResponse,
  TextTranslation,
  WordLookupRequest,
  WordLookupResponse,
} from '../../shared/translate';
import { looksBroken, translateAll } from './translate/batch';
import { countChars, GOOGLE_FREE_CHARS, GOOGLE_NMT } from './translate/google';
import { validateUpload } from './upload';
import { billedChars, buildSsml, checkTimepoints } from '../../shared/tts';
import { DEFAULT_TTS_MONTHLY_CHARS, GOOGLE_TTS, isAllowedVoice, listVoices, synthesize, toBase64 } from './tts';
import { cachedSegments, chapterPrefix, ensureSegment, planSegments, QuotaError, SegmentTooLong, segmentBase } from './ttsAudio';
import { fetchExternal } from './external';
import { passphraseMatches, signToken, verifyToken, type TokenPayload } from './auth';
import { importGutenberg, searchGutenberg } from './gutenberg';
import * as store from './store';
import { coverSourceFor, decodeCoverDataUrl, downloadCover, RETRY_MISSING_MS } from './covers';
import { EngineUnavailable, getEngine, getSentenceEngine, pickEngineId, pickSentenceEngineId } from './translate/engines';

export interface Env {
  ALLOWED_ORIGINS: string;
  PASSPHRASE: string;
  TOKEN_SECRET: string;
  DB: D1Database;
  /** אחסון קובצי ההקראה (R2); חסר = הקראת פרקים לא זמינה */
  AUDIO?: R2Bucket;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GOOGLE_TRANSLATE_API_KEY?: string;
  /** מפתח Google Cloud Text-to-Speech (הקראה) */
  GOOGLE_TTS_API_KEY?: string;
  /** מכסת תווים חודשית להקראה (ברירת מחדל זהירה) */
  TTS_MONTHLY_CHARS?: string;
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

app.get('/api/books', async (c) => {
  // ספרים ישנים מקבלים כאן (פעם אחת) מספר מילים לכל פרק, לחישוב התקדמות
  const books = await Promise.all((await store.listBooks(c.env.DB)).map((b) => store.ensureChapterWords(c.env.DB, b)));
  return c.json({ books });
});

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
  const body = await c.req.json<{ meta?: BookMeta; chapters?: Chapter[]; cover?: string }>();
  const err = validateUpload(body.meta, body.chapters);
  if (err) return c.json({ error: err }, 400);
  const chapters = body.chapters!;
  const clean = normalizeMeta(body.meta!, chapters);
  await store.saveBook(c.env.DB, clean, chapters);
  // כריכה שחולצה מקובץ EPUB (אופציונלי; כריכה לא תקינה פשוט לא נשמרת)
  const cover = decodeCoverDataUrl(body.cover);
  if (cover) await store.putCover(c.env.DB, clean.id, cover);
  return c.json({ book: clean });
});

// כריכת ספר: מהמסד, ואם עוד אין – מורידים מהמקור (Gutenberg / english-e-reader) ושומרים.
app.get('/api/books/:id/cover', async (c) => {
  const id = c.req.param('id');
  let row = await store.getCover(c.env.DB, id);
  const stale = row?.missing && Date.now() - row.checkedAt > RETRY_MISSING_MS;
  if (!row || stale) {
    const book = await store.getBook(c.env.DB, id);
    if (!book) return c.json({ error: 'הספר לא נמצא' }, 404);
    const source = coverSourceFor(book);
    // ספר בלי מקור כריכה (PDF/TXT) – לא שומרים כלום, האפליקציה מציגה כריכה טיפוגרפית
    if (!source) return c.json({ error: 'אין כריכה' }, 404);
    const cover = await downloadCover(source);
    await store.putCover(c.env.DB, id, cover);
    row = await store.getCover(c.env.DB, id);
  }
  if (!row?.data || !row.mime) return c.json({ error: 'אין כריכה' }, 404);
  return new Response(row.data, { headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, max-age=604800' } });
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
  return book ? c.json({ book: await store.ensureChapterWords(c.env.DB, book) }) : c.json({ error: 'הספר לא נמצא' }, 404);
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
  const ttsLimit = Number(c.env.TTS_MONTHLY_CHARS ?? DEFAULT_TTS_MONTHLY_CHARS);
  return c.json({ month: store.currentMonth(), cap, ttsLimit, ...(await store.monthSpend(c.env.DB)) });
});

/**
 * פירוט ההוצאה החודשית: אילו פרקים תורגמו (תרגום מקביל מתרגם פרק שלם) וכמה תווים כל אחד.
 * התווים של פרק מחושבים מהטקסט המקורי של המשפטים שתורגמו, ולכן הם קרובים למה שנספר, לא זהים בהכרח.
 */
app.get('/api/spend/details', async (c) => {
  const month = store.currentMonth();
  const start = Date.parse(`${month}-01T00:00:00Z`);
  const { results } = await c.env.DB.prepare(
    'SELECT book_id, idx, engine, data, created_at FROM chapter_translations WHERE created_at >= ? ORDER BY created_at DESC LIMIT 200',
  )
    .bind(start)
    .all<{ book_id: string; idx: number; engine: string; data: string; created_at: number }>();
  const books = new Map<string, BookMeta | null>();
  const chapters = [];
  for (const r of results) {
    if (!books.has(r.book_id)) books.set(r.book_id, await store.getBook(c.env.DB, r.book_id));
    const book = books.get(r.book_id);
    const chapter = book ? await store.getChapter(c.env.DB, r.book_id, r.idx) : null;
    const sids = new Set(Object.keys(JSON.parse(r.data) as Record<string, string>));
    const sentences = chapter ? chapterSentences(chapter, r.idx).filter((s) => sids.has(s.sid)) : [];
    chapters.push({
      bookId: r.book_id,
      title: book?.title ?? r.book_id,
      chapterIdx: r.idx,
      chapterTitle: book?.chapterTitles[r.idx] ?? '',
      engine: r.engine,
      sentences: sids.size,
      chars: countChars(sentences.map((s) => s.text)),
      createdAt: r.created_at,
    });
  }
  return c.json({ month, chapters });
});

app.post('/api/translate/word', async (c) => {
  const req = await c.req.json<WordLookupRequest>();
  if (!req.sentence || !req.word || req.sentence.length > 2000) return c.json({ error: 'בקשה לא תקינה' }, 400);
  const engineId = pickEngineId(req.engine, c.env.DEFAULT_ENGINE, c.env);
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

// ---------- תרגום קטעים ומשפטים ----------
// מנוע המשפטים: Google Translate כשיש לו מפתח, אחרת מודל השפה (ראו pickSentenceEngineId).

/** המשפטים של פרק לפי הסדר, עם המזהה של כל אחד */
function chapterSentences(chapter: Chapter, chapterIdx: number): { sid: string; text: string }[] {
  return chapter.paragraphs.flatMap((p, pi) => p.map((text, si) => ({ sid: sentenceId(chapterIdx, pi, si), text })));
}

/**
 * לפני קריאה למנוע: תקרת ההוצאה החודשית בדולרים, ובנוסף – ב-Google Translate – תקרת התווים
 * החינמית לחודש. מחזיר הודעת שגיאה, או null אם אפשר להמשיך.
 */
async function quotaError(db: D1Database, env: Env, engineId: string, chars: number): Promise<string | null> {
  const cap = Number(env.MONTHLY_CAP_USD ?? '5');
  const { total, byEngine } = await store.monthSpend(db);
  if (total >= cap) return `הגעת לתקרת ההוצאה החודשית (${cap}$)`;
  if (engineId === GOOGLE_NMT && (byEngine[GOOGLE_NMT]?.chars ?? 0) + chars > GOOGLE_FREE_CHARS) {
    return 'הגעת למכסה החינמית של Google Translate לחודש הזה (500 אלף תווים). התרגום יחזור בתחילת החודש הבא.';
  }
  return null;
}

function sentenceEngineOr503(c: { env: Env }, engineId: string) {
  try {
    return getSentenceEngine(engineId, c.env);
  } catch (e) {
    if (e instanceof EngineUnavailable) return e;
    throw e;
  }
}

// קטע שסומן (לחיצה ארוכה ואז נגיעה)
app.post('/api/translate/text', async (c) => {
  const req = await c.req.json<TextTranslateRequest>();
  if (!req.text?.trim() || req.text.length > 3000 || (req.context ?? '').length > 6000) {
    return c.json({ error: 'בקשה לא תקינה' }, 400);
  }
  const engineId = pickSentenceEngineId(c.env.DEFAULT_ENGINE, c.env);
  const lang = req.lang || 'en';
  const key = await store.cacheKey(['text', engineId, lang, req.text.trim(), req.context ?? '']);
  const cached = await store.getCachedLookup(c.env.DB, key);
  if (cached) return c.json({ result: cached, engine: engineId, cached: true } as unknown as TextTranslateResponse);

  const text = req.text.trim();
  const qErr = await quotaError(c.env.DB, c.env, engineId, text.length);
  if (qErr) return c.json({ error: qErr }, 402);

  let result: TextTranslation;
  let usd = 0;
  let chars = 0;
  if (engineId === GOOGLE_NMT) {
    const engine = sentenceEngineOr503(c, engineId);
    if (engine instanceof Error) return c.json({ error: engine.message }, 503);
    const out = await engine.translateBatch([{ i: 0, text }], '');
    result = { translation: out.result[0]?.translation ?? '', note: '' };
    chars = out.chars;
  } else {
    let engine;
    try {
      engine = getEngine(engineId, c.env);
    } catch (e) {
      if (e instanceof EngineUnavailable) return c.json({ error: e.message }, 503);
      throw e;
    }
    ({ result, usd } = await engine.translateText({ ...req, lang }));
  }
  if (!result.translation || looksBroken(result.translation)) return c.json({ error: 'המנוע לא החזיר תרגום תקין' }, 502);
  await Promise.all([store.putCachedLookup(c.env.DB, key, engineId, result as never), store.addSpend(c.env.DB, engineId, usd, chars)]);
  return c.json({ result, engine: engineId, cached: false } satisfies TextTranslateResponse);
});

// תרגום מקביל של פרק שלם. נשמר בשרת לכל ספר, פרק, מנוע וגרסת פענוח.
app.post('/api/translate/chapter', async (c) => {
  const req = await c.req.json<ChapterTranslateRequest>();
  const idx = Number(req.chapterIdx);
  const book = typeof req.bookId === 'string' ? await store.getBook(c.env.DB, req.bookId) : null;
  if (!book || !Number.isInteger(idx) || idx < 0) return c.json({ error: 'בקשה לא תקינה' }, 400);
  const engineId = pickSentenceEngineId(c.env.DEFAULT_ENGINE, c.env);
  const pv = parserVersionOf(book);

  const cached = await store.getChapterTranslations(c.env.DB, book.id, idx, engineId, pv);
  if (cached) return c.json({ translations: cached, engine: engineId, cached: true } satisfies ChapterTranslateResponse);

  const chapter = await store.getChapter(c.env.DB, book.id, idx);
  if (!chapter) return c.json({ error: 'הפרק לא נמצא' }, 404);
  const sentences = chapterSentences(chapter, idx);
  const qErr = await quotaError(c.env.DB, c.env, engineId, countChars(sentences.map((s) => s.text)));
  if (qErr) return c.json({ error: qErr }, 402);
  const engine = sentenceEngineOr503(c, engineId);
  if (engine instanceof Error) return c.json({ error: engine.message }, 503);

  let chars = 0;
  const { map, usd, missing } = await translateAll(
    sentences.map((s, i) => ({ i, text: s.text })),
    async (part) => {
      const out = await engine.translateBatch(part, chapter.title);
      chars += out.chars;
      return out;
    },
  );
  const translations: Record<string, string> = {};
  sentences.forEach((s, i) => {
    const t = map.get(i);
    if (t) translations[s.sid] = t;
  });
  // שומרים גם פרק שחסרים בו כמה משפטים (אחרת כל פתיחה הייתה מתרגמת את כולו מחדש).
  // משפט חסר מתורגם לבד דרך /api/translate/sentence (כפתור "נסה שוב").
  if (missing.length) console.warn(`chapter ${book.id}/${idx}: ${missing.length} sentence(s) left untranslated`);
  await Promise.all([
    Object.keys(translations).length
      ? store.putChapterTranslations(c.env.DB, book.id, idx, engineId, pv, translations)
      : Promise.resolve(),
    store.addSpend(c.env.DB, engineId, usd, chars),
  ]);
  return c.json({ translations, engine: engineId, cached: false } satisfies ChapterTranslateResponse);
});

// תרגום משפט בודד (כפתור 🌐 / "תרגום כל המשפט" / "נסה שוב"): קודם מהתרגום המקביל אם קיים.
// ב-Google נשלח רק המשפט; במודל שפה – עם המשפט שלפניו ושאחריו בשביל ההקשר.
app.post('/api/translate/sentence', async (c) => {
  const req = await c.req.json<SentenceTranslateRequest>();
  const idx = Number(req.chapterIdx);
  const pos = typeof req.sid === 'string' ? parseSentenceId(req.sid) : null;
  const book = typeof req.bookId === 'string' ? await store.getBook(c.env.DB, req.bookId) : null;
  if (!book || !pos || pos.c !== idx) return c.json({ error: 'בקשה לא תקינה' }, 400);
  const engineId = pickSentenceEngineId(c.env.DEFAULT_ENGINE, c.env);
  const pv = parserVersionOf(book);

  const whole = await store.getChapterTranslations(c.env.DB, book.id, idx, engineId, pv);
  if (whole?.[req.sid]) {
    return c.json({ translation: whole[req.sid], engine: engineId, cached: true } satisfies SentenceTranslateResponse);
  }
  const key = await store.cacheKey(['sentence', engineId, pv, book.id, req.sid]);
  const one = (await store.getCachedLookup(c.env.DB, key)) as unknown as { translation: string } | null;
  if (one) return c.json({ translation: one.translation, engine: engineId, cached: true } satisfies SentenceTranslateResponse);

  const chapter = await store.getChapter(c.env.DB, book.id, idx);
  if (!chapter) return c.json({ error: 'הפרק לא נמצא' }, 404);
  const sentences = chapterSentences(chapter, idx);
  const k = sentences.findIndex((s) => s.sid === req.sid);
  if (k < 0) return c.json({ error: 'המשפט לא נמצא' }, 404);

  const around =
    engineId === GOOGLE_NMT ? [{ i: 0, text: sentences[k].text, sid: req.sid }]
    : sentences.slice(Math.max(0, k - 1), k + 2).map((s, j) => ({ i: j, text: s.text, sid: s.sid }));
  const target = around.find((s) => s.sid === req.sid)!;
  const qErr = await quotaError(c.env.DB, c.env, engineId, countChars(around.map((s) => s.text)));
  if (qErr) return c.json({ error: qErr }, 402);
  const engine = sentenceEngineOr503(c, engineId);
  if (engine instanceof Error) return c.json({ error: engine.message }, 503);

  let chars = 0;
  const { map, usd } = await translateAll(around.map(({ i, text }) => ({ i, text })), async (part) => {
    const out = await engine.translateBatch(part, chapter.title);
    chars += out.chars;
    return out;
  });
  const translation = map.get(target.i);
  await store.addSpend(c.env.DB, engineId, usd, chars);
  if (!translation) return c.json({ error: 'המנוע לא החזיר תרגום' }, 502);
  await store.putCachedLookup(c.env.DB, key, engineId, { translation } as never);
  return c.json({ translation, engine: engineId, cached: false } satisfies SentenceTranslateResponse);
});

// ---------- סימניות והערות ----------

app.get('/api/annotations', async (c) => {
  const bookId = c.req.query('bookId') ?? '';
  if (!bookId) return c.json({ error: 'חסר ספר' }, 400);
  return c.json({ items: await store.listAnnotations(c.env.DB, bookId) });
});

app.put('/api/annotations', async (c) => {
  const body = await c.req.json<{ items?: unknown[] }>();
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > 500) return c.json({ error: 'יותר מדי רשומות' }, 400);
  for (const it of items) {
    const err = validateAnnotation(it);
    if (err) return c.json({ error: err }, 400);
  }
  await store.upsertAnnotations(c.env.DB, items as Annotation[]);
  return c.json({ ok: true });
});

// ---------- מילים שמורות ----------

app.get('/api/words', async (c) => c.json({ items: await store.listWords(c.env.DB) }));

app.put('/api/words', async (c) => {
  const body = await c.req.json<{ items?: unknown[] }>();
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > 500) return c.json({ error: 'יותר מדי רשומות' }, 400);
  for (const it of items) {
    const err = validateWord(it);
    if (err) return c.json({ error: err }, 400);
  }
  await store.upsertWords(c.env.DB, items as SavedWord[]);
  return c.json({ ok: true });
});

// ---------- יומן חזרות (תרגול) ----------

app.get('/api/reviews', async (c) => {
  const after = Number(c.req.query('after') ?? 0);
  if (!Number.isInteger(after) || after < 0) return c.json({ error: 'מיקום לא תקין' }, 400);
  const { items, last } = await store.listReviewsAfter(c.env.DB, after);
  return c.json({ items, last, more: items.length === store.REVIEWS_PAGE });
});

app.post('/api/reviews', async (c) => {
  const body = await c.req.json<{ items?: unknown[] }>();
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > 500) return c.json({ error: 'יותר מדי רשומות' }, 400);
  for (const it of items) {
    const err = validateReview(it);
    if (err) return c.json({ error: err }, 400);
  }
  await store.addReviews(c.env.DB, items as Review[]);
  return c.json({ ok: true });
});

// ---------- הקראה (Google TTS) ----------

const TTS_OFF = 'ההקראה לא מוגדרת בשרת (חסר מפתח GOOGLE_TTS_API_KEY)';

app.get('/api/tts/voices', async (c) => {
  if (!c.env.GOOGLE_TTS_API_KEY) return c.json({ error: TTS_OFF }, 501);
  return c.json({ voices: await listVoices(c.env.GOOGLE_TTS_API_KEY) });
});

/** דוגמת קול קצרה (לבחירת קול ולבדיקה שזמני המילים חוזרים). נספרת במכסת התווים החודשית */
app.post('/api/tts/sample', async (c) => {
  if (!c.env.GOOGLE_TTS_API_KEY) return c.json({ error: TTS_OFF }, 501);
  const body = await c.req.json<{ voice?: string; text?: string }>();
  const text = (body.text ?? '').trim();
  if (!body.voice || !isAllowedVoice(body.voice)) return c.json({ error: 'קול לא נתמך' }, 400);
  if (!text || text.length > 400) return c.json({ error: 'טקסט לדוגמה חייב להיות עד 400 תווים' }, 400);
  const { ssml, marks } = buildSsml([text]);
  const chars = billedChars(ssml);
  const limit = Number(c.env.TTS_MONTHLY_CHARS ?? DEFAULT_TTS_MONTHLY_CHARS);
  const used = (await store.monthSpend(c.env.DB)).byEngine[GOOGLE_TTS]?.chars ?? 0;
  if (used + chars > limit) return c.json({ error: `מכסת התווים החודשית להקראה נוצלה (${used.toLocaleString('en-US')} מתוך ${limit.toLocaleString('en-US')})` }, 429);
  const { audio, timepoints } = await synthesize(c.env.GOOGLE_TTS_API_KEY, ssml, body.voice);
  await store.addSpend(c.env.DB, GOOGLE_TTS, 0, chars);
  return c.json({ audio: toBase64(audio), mime: 'audio/mpeg', timepoints, check: checkTimepoints(marks, timepoints), chars });
});

// ---------- הקראת פרק: תכנית, קטעים (עם מטמון ב-R2) והורדת שמע ----------

const AUDIO_OFF = 'אחסון השמע (R2) לא מוגדר בשרת';
const BOOK_ID = /^[\w.-]{1,100}$/;

/** הספר, הפרק והחלוקה לקטעים, או תשובת שגיאה מוכנה */
async function ttsChapter(c: Context<AppEnv>, q: { bookId?: unknown; chapter?: unknown; voice?: unknown }) {
  if (!c.env.GOOGLE_TTS_API_KEY) return { error: c.json({ error: TTS_OFF }, 501) };
  if (!c.env.AUDIO) return { error: c.json({ error: AUDIO_OFF }, 501) };
  const bookId = String(q.bookId ?? '');
  const chapterIdx = Number(q.chapter);
  const voice = String(q.voice ?? '');
  if (!BOOK_ID.test(bookId) || !Number.isInteger(chapterIdx) || chapterIdx < 0 || !isAllowedVoice(voice)) {
    return { error: c.json({ error: 'בקשה לא תקינה' }, 400) };
  }
  const book = await store.getBook(c.env.DB, bookId);
  const chapter = book ? await store.getChapter(c.env.DB, bookId, chapterIdx) : null;
  if (!book || !chapter) return { error: c.json({ error: 'הפרק לא נמצא' }, 404) };
  const prefix = chapterPrefix(bookId, parserVersionOf(book), voice, chapterIdx);
  return { chapterIdx, chapter, voice, prefix, segments: planSegments(chapterIdx, chapter) };
}

app.get('/api/tts/plan', async (c) => {
  const r = await ttsChapter(c, c.req.query());
  if ('error' in r) return r.error;
  const cached = await cachedSegments(c.env.AUDIO!, r.prefix);
  const segments = r.segments.map((s) => ({
    para: s.para,
    part: s.part,
    sids: s.sids,
    chars: billedChars(buildSsml(s.sentences).ssml),
    cached: cached.has(segmentBase(r.prefix, s.para, s.part)),
  }));
  return c.json({
    segments,
    totalChars: segments.reduce((n, s) => n + s.chars, 0),
    uncachedChars: segments.reduce((n, s) => n + (s.cached ? 0 : s.chars), 0),
  });
});

app.post('/api/tts/segment', async (c) => {
  const body = await c.req.json<{ bookId?: string; chapter?: number; para?: number; part?: number; voice?: string }>();
  const r = await ttsChapter(c, body);
  if ('error' in r) return r.error;
  const ref = r.segments.find((s) => s.para === body.para && s.part === body.part);
  if (!ref) return c.json({ error: 'הקטע לא נמצא' }, 404);
  const limit = Number(c.env.TTS_MONTHLY_CHARS ?? DEFAULT_TTS_MONTHLY_CHARS);
  try {
    const { meta, cached } = await ensureSegment(
      {
        bucket: c.env.AUDIO!,
        synth: (ssml) => synthesize(c.env.GOOGLE_TTS_API_KEY!, ssml, r.voice),
        used: async () => (await store.monthSpend(c.env.DB)).byEngine[GOOGLE_TTS]?.chars ?? 0,
        limit,
        onBilled: (n) => store.addSpend(c.env.DB, GOOGLE_TTS, 0, n),
      },
      r.prefix,
      ref,
    );
    return c.json({ meta, cached });
  } catch (e) {
    if (e instanceof QuotaError) return c.json({ error: e.message }, 429);
    if (e instanceof SegmentTooLong) return c.json({ error: e.message }, 422);
    throw e;
  }
});

app.get('/api/tts/audio', async (c) => {
  const r = await ttsChapter(c, c.req.query());
  if ('error' in r) return r.error;
  const obj = await c.env.AUDIO!.get(`${segmentBase(r.prefix, Number(c.req.query('para')), Number(c.req.query('part')))}.mp3`);
  if (!obj) return c.json({ error: 'הקטע עוד לא הוכן' }, 404);
  return c.body(obj.body, 200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=31536000, immutable' });
});

export default app;
