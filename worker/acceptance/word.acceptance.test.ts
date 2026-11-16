// בדיקות קבלה: תרגום מילה בהקשר (הטבלה מסעיף 3 בבקשה המקורית / סעיף 5 ב-SPEC).
// רצות מול המנועים האמיתיים (עולות סנטים בודדים), ולכן לא רצות עם npm test.
// הרצה: GitHub → Actions → "Acceptance" → Run workflow.

import { appendFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { stripNiqqud, type WordLookup } from '../../shared/translate';
import { getEngine, type EngineKeys } from '../src/translate/engines';

interface Case {
  sentence: string;
  word: string;
  /** לפחות אחת מהמחרוזות חייבת להופיע במשמעות בהקשר */
  expect: string[];
  /** אם מוגדר – היחידה שזוהתה חייבת להכיל את המילים האלה */
  unitIncludes?: string[];
}

const CASES: Case[] = [
  { sentence: 'One day a fight broke out in the street.', word: 'broke', expect: ['פרץ', 'פרצה'], unitIncludes: ['broke', 'out'] },
  { sentence: 'If you love her, you can begin to court her.', word: 'court', expect: ['חיזר', 'לחזר', 'תחזר', 'חזר אחרי'] },
  { sentence: 'The conflict eventually ended.', word: 'ended', expect: ['הסתיים', 'נגמר', 'הסתיימה', 'נסתיים'] },
  { sentence: 'The Prince ordered them to stop.', word: 'ordered', expect: ['ציווה', 'הורה', 'פקד', 'ציוה'] },
  { sentence: 'In Verona, two rich noble families lived side by side.', word: 'lived', expect: ['גרו', 'חיו', 'התגוררו', 'ישבו'] },
];

const keys: EngineKeys = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, GEMINI_API_KEY: process.env.GEMINI_API_KEY };
const engines = [
  { id: 'claude-haiku', has: !!keys.ANTHROPIC_API_KEY },
  { id: 'gemini-flash-lite', has: !!keys.GEMINI_API_KEY },
];

const rows: string[] = [];
let totalUsd = 0;

for (const eng of engines) {
  describe.skipIf(!eng.has)(`מנוע ${eng.id}`, () => {
    for (const tc of CASES) {
      it(`${tc.word} ← "${tc.sentence}"`, { timeout: 60000 }, async () => {
        const engine = getEngine(eng.id, keys);
        const t0 = Date.now();
        let r: WordLookup | null = null;
        let pass = false;
        try {
          const out = await engine.lookupWord({
            sentence: tc.sentence,
            word: tc.word,
            offset: tc.sentence.indexOf(tc.word),
            lang: 'en',
          });
          r = out.result;
          totalUsd += out.usd;
          const meaning = stripNiqqud(r.contextMeaning);
          // הביטוי זוהה אם היחידה מכילה את כל חלקיו, או אם סוג היחידה וצורת המילון מראים זאת
          const unitOk =
            !tc.unitIncludes ||
            tc.unitIncludes.every((w) => r!.unit.toLowerCase().includes(w)) ||
            (r.unitType === 'phrasal_verb' && r.lemma.toLowerCase().includes(tc.unitIncludes[tc.unitIncludes.length - 1]));
          pass = tc.expect.some((e) => meaning.includes(e)) && unitOk;
          return expect(pass, `קיבלנו: ${r.unit} = ${r.contextMeaning}`).toBe(true);
        } finally {
          const ms = Date.now() - t0;
          rows.push(
            `| ${eng.id} | ${tc.word} | ${r ? `${r.unit} (${r.unitType})` : '—'} | ${r?.contextMeaning ?? 'שגיאה'} | ${r?.lemma ?? ''} ${r?.ipa ?? ''} | ${pass ? '✅' : '❌'} | ${ms}ms |`,
          );
        }
      });
    }
  });
}

afterAll(() => {
  const table = [
    '## בדיקות קבלה – מילה בהקשר',
    '',
    '| מנוע | מילה | יחידה שזוהתה | משמעות בהקשר | צורת מילון | עבר | זמן |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
    `עלות משוערת לריצה: ${totalUsd.toFixed(5)}$`,
  ].join('\n');
  console.log(table);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table + '\n');
});
