// מתאם מנועי התרגום. כל מנוע מממש את אותו ממשק, והשאר לא יודע מי רץ מתחת.
// כדי להוסיף מנוע: לממש Engine ולהוסיף ל-ENGINE_FACTORIES.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { WordLookup, WordLookupRequest } from '../../../shared/translate';
import { WORD_SYSTEM_PROMPT, wordUserMessage } from './prompt';

export interface EngineResult {
  result: WordLookup;
  usd: number;
}

export interface Engine {
  id: string;
  lookupWord(req: WordLookupRequest): Promise<EngineResult>;
}

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
  };
}

// ---------- Gemini 2.5 Flash-Lite ----------
// מחירים (לפי אתרי השוואה, לא אומת): 0.10$ למיליון קלט, 0.40$ לפלט.
const FL_IN = 0.1 / 1e6;
const FL_OUT = 0.4 / 1e6;

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

function geminiEngine(apiKey: string): Engine {
  return {
    id: 'gemini-flash-lite',
    async lookupWord(req) {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: WORD_SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: wordUserMessage(req) }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: GEMINI_SCHEMA,
              temperature: 0,
            },
          }),
        },
      );
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const parsed = WordLookupSchema.safeParse(JSON.parse(text || '{}'));
      if (!parsed.success) throw new Error('המנוע לא החזיר תשובה תקינה');
      const u = data.usageMetadata ?? {};
      return { result: parsed.data, usd: (u.promptTokenCount ?? 0) * FL_IN + (u.candidatesTokenCount ?? 0) * FL_OUT };
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
