// מתאם מנועי התרגום. כל מנוע מממש את אותו ממשק, והשאר לא יודע מי רץ מתחת.
// כדי להוסיף מנוע: לממש Engine ולהוסיף ל-ENGINE_FACTORIES.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { TextTranslateRequest, TextTranslation, WordLookup, WordLookupRequest } from '../../../shared/translate';
import { TEXT_SYSTEM_PROMPT, textUserMessage, WORD_SYSTEM_PROMPT, wordUserMessage } from './prompt';

export interface EngineResult {
  result: WordLookup;
  usd: number;
}

export interface Engine {
  id: string;
  lookupWord(req: WordLookupRequest): Promise<EngineResult>;
  translateText(req: TextTranslateRequest): Promise<{ result: TextTranslation; usd: number }>;
}

export const TextTranslationSchema = z.object({ translation: z.string(), note: z.string() });

export interface EngineKeys {
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

const UNIT_TYPES = ['word', 'phrasal_verb', 'idiom', 'proper_noun'] as const;

export const WordLookupSchema = z.object({
  unit: z.string(),
  unitType: z.enum(UNIT_TYPES),
  lemma: z.string(),
  pos: z.string(),
  ipa: z.string(),
  contextMeaning: z.string(),
  otherMeanings: z.array(z.object({ pos: z.string(), meaning: z.string() })),
});

// ---------- Claude Haiku 5.5 ----------
// מחירים (3.11.2026): 0.10$ למיליון טוקני קלט, 0.50$ לפלט.
const HAIKU_IN = 0.1 / 1e6;
const HAIKU_OUT = 0.5 / 1e6;

function claudeEngine(apiKey: string): Engine {
  const client = new Anthropic({ apiKey });
  return {
    id: 'claude-haiku',
    async lookupWord(req) {
      const response = await client.messages.parse({
        model: 'claude-haiku-5-5',
        max_tokens: 1024,
        // משימה קצרה ומהירה: בלי חשיבה, מאמץ נמוך
        thinking: { type: 'disabled' },
        system: WORD_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: wordUserMessage(req) }],
        output_config: { effort: 'low', format: zodOutputFormat(WordLookupSchema) },
      });
      if (response.stop_reason === 'refusal' || !response.parsed_output) {
        throw new Error('המנוע לא החזיר תשובה תקינה');
      }
      const usd = response.usage.input_tokens * HAIKU_IN + response.usage.output_tokens * HAIKU_OUT;
      return { result: response.parsed_output, usd };
    },
    async translateText(req) {
      const response = await client.messages.parse({
        model: 'claude-haiku-5-5',
        max_tokens: 2048,
        thinking: { type: 'disabled' },
        system: TEXT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: textUserMessage(req.text, req.context) }],
        output_config: { effort: 'low', format: zodOutputFormat(TextTranslationSchema) },
      });
      if (response.stop_reason === 'refusal' || !response.parsed_output) {
        throw new Error('המנוע לא החזיר תשובה תקינה');
      }
      const usd = response.usage.input_tokens * HAIKU_IN + response.usage.output_tokens * HAIKU_OUT;
      return { result: response.parsed_output, usd };
    },
  };
}

// ---------- Gemini Flash-Lite ----------
// gemini-2.5-flash-lite כבר לא זמין למשתמשים חדשים (נובמבר 2026) – גוגל ממליצה על 3.5.
// מחירים משוערים (לא אומתו בדף הרשמי): 0.30$ למיליון קלט, 2.50$ לפלט. בשכבה החינמית – 0$.
const FL_IN = 0.3 / 1e6;
const FL_OUT = 2.5 / 1e6;
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    unit: { type: 'STRING' },
    unitType: { type: 'STRING', enum: [...UNIT_TYPES] },
    lemma: { type: 'STRING' },
    pos: { type: 'STRING' },
    ipa: { type: 'STRING' },
    contextMeaning: { type: 'STRING' },
    otherMeanings: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { pos: { type: 'STRING' }, meaning: { type: 'STRING' } },
        required: ['pos', 'meaning'],
      },
    },
  },
  required: ['unit', 'unitType', 'lemma', 'pos', 'ipa', 'contextMeaning', 'otherMeanings'],
  propertyOrdering: ['unit', 'unitType', 'lemma', 'pos', 'ipa', 'contextMeaning', 'otherMeanings'],
};

function geminiFetch(apiKey: string, system: string, user: string, schema: object): Promise<Response> {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 },
    }),
  });
}

async function geminiJson(
  apiKey: string,
  system: string,
  user: string,
  schema: object,
): Promise<{ data: unknown; usd: number }> {
  // עומס זמני אצל גוגל (429/503) – עד 2 ניסיונות חוזרים בהשהיה קצרה
  let res!: Response;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 700 * attempt));
    res = await geminiFetch(apiKey, system, user, schema);
    if (res.status !== 429 && res.status !== 503) break;
  }
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const u = data.usageMetadata ?? {};
  return { data: JSON.parse(text), usd: (u.promptTokenCount ?? 0) * FL_IN + (u.candidatesTokenCount ?? 0) * FL_OUT };
}

const GEMINI_TEXT_SCHEMA = {
  type: 'OBJECT',
  properties: { translation: { type: 'STRING' }, note: { type: 'STRING' } },
  required: ['translation', 'note'],
};

function geminiEngine(apiKey: string): Engine {
  return {
    id: 'gemini-flash-lite',
    async lookupWord(req) {
      const { data, usd } = await geminiJson(apiKey, WORD_SYSTEM_PROMPT, wordUserMessage(req), GEMINI_SCHEMA);
      const parsed = WordLookupSchema.safeParse(data);
      if (!parsed.success) throw new Error('המנוע לא החזיר תשובה תקינה');
      return { result: parsed.data, usd };
    },
    async translateText(req) {
      const { data, usd } = await geminiJson(apiKey, TEXT_SYSTEM_PROMPT, textUserMessage(req.text, req.context), GEMINI_TEXT_SCHEMA);
      const parsed = TextTranslationSchema.safeParse(data);
      if (!parsed.success) throw new Error('המנוע לא החזיר תשובה תקינה');
      return { result: parsed.data, usd };
    },
  };
}

export function getEngine(id: string, keys: EngineKeys): Engine {
  if (id === 'claude-haiku') {
    if (!keys.ANTHROPIC_API_KEY) throw new EngineUnavailable('חסר מפתח Claude בשרת');
    return claudeEngine(keys.ANTHROPIC_API_KEY);
  }
  if (id === 'gemini-flash-lite') {
    if (!keys.GEMINI_API_KEY) throw new EngineUnavailable('חסר מפתח Gemini בשרת');
    return geminiEngine(keys.GEMINI_API_KEY);
  }
  throw new EngineUnavailable(`מנוע לא מוכר: ${id}`);
}

export class EngineUnavailable extends Error {}

/**
 * איזה מנוע להפעיל: מה שהמשתמש ביקש; אחרת ברירת המחדל של השרת;
 * ואם לברירת המחדל אין מפתח – המנוע הראשון שיש לו מפתח.
 */
export function pickEngineId(requested: string | undefined, def: string | undefined, keys: EngineKeys): string {
  if (requested) return requested;
  const available = [
    keys.ANTHROPIC_API_KEY ? 'claude-haiku' : null,
    keys.GEMINI_API_KEY ? 'gemini-flash-lite' : null,
  ].filter(Boolean) as string[];
  if (def && available.includes(def)) return def;
  return available[0] ?? def ?? 'claude-haiku';
}
