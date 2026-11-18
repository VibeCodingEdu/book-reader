import type { TextTranslation, UnitType, WordLookup } from '../../shared/translate';
import { ENGINE_LABELS } from '../../shared/translate';
import { toggleSpeak, useSpeakingKey } from './speech';
import type { SentenceTr } from './reader/useSentenceTranslations';

type Result<T> =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'done'; result: T; engine: string; cached: boolean }
  | { state: 'error'; error: string };

/** מילה אחת שנלחצה */
export type WordSel = { kind: 'word'; sid: string; sentence: string; word: string; offset: number } & Result<WordLookup>;
/** תחילת סימון קטע (אחרי לחיצה ארוכה) – מחכים ללחיצה על המילה האחרונה */
export type RangeStartSel = { kind: 'range-start'; sid: string; offset: number; word: string };
/** קטע מסומן: מכמה מילים ועד פסקה */
export type RangeSel = {
  kind: 'range';
  text: string;
  context: string;
  marks: { sid: string; o: number }[];
} & Result<TextTranslation>;

export type Selection = WordSel | RangeStartSel | RangeSel;

const TYPE_LABEL: Record<UnitType, string | null> = {
  word: null,
  phrasal_verb: 'ביטוי פועלי',
  idiom: 'ניב',
  proper_noun: 'שם פרטי',
};

const engineLabel = (id: string) => ENGINE_LABELS[id] ?? id;

interface Props {
  sel: Selection;
  onClose: () => void;
  onTranslate: () => void;
  /** תרגום כל המשפט של המילה שנלחצה (אם יש) */
  sentenceTr?: SentenceTr;
  onTranslateSentence?: () => void;
  /** סימנייה / הערה על המשפט של המילה */
  sentenceMarks?: { bookmarked: boolean; hasNote: boolean };
  onToggleBookmark?: () => void;
  onEditNote?: () => void;
}

export function WordSheet({ sel, onClose, onTranslate, sentenceTr, onTranslateSentence, sentenceMarks, onToggleBookmark, onEditNote }: Props) {
  const speaking = useSpeakingKey();
  const heading =
    sel.kind === 'range' ? sel.text : sel.kind === 'word' && sel.state === 'done' ? sel.result.unit : sel.word;
  const toSpeak =
    sel.kind === 'range' ? sel.text : sel.kind === 'word' && sel.state === 'done' ? sel.result.unit : sel.word;

  return (
    <div class="sheet" role="dialog" aria-label="תרגום" onClick={(e) => e.stopPropagation()}>
      <div class="sheet-head">
        <div class={`sheet-word en ${sel.kind === 'range' ? 'passage' : ''}`} lang="en">
          {heading}
          {sel.kind === 'range-start' && ' …'}
        </div>
        {sel.kind === 'word' && sel.state === 'done' && TYPE_LABEL[sel.result.unitType] && (
          <span class="badge">{TYPE_LABEL[sel.result.unitType]}</span>
        )}
        <span class="spacer" />
        <button
          class="icon-btn"
          aria-label={speaking === `sheet:${toSpeak}` ? 'עצירת ההשמעה' : 'השמעה באנגלית'}
          onClick={() => toggleSpeak(toSpeak, `sheet:${toSpeak}`)}
        >
          {speaking === `sheet:${toSpeak}` ? '⏹' : '🔊'}
        </button>
        <button class="icon-btn" aria-label="סגירה" onClick={onClose}>
          ✕
        </button>
      </div>

      {sel.kind === 'range-start' && <p class="sheet-hint">סימון קטע: לחצו עכשיו על המילה האחרונה בקטע.</p>}

      {sel.kind !== 'range-start' && sel.state === 'idle' && (
        <button class="translate-btn" onClick={onTranslate}>
          תרגם
        </button>
      )}
      {sel.kind !== 'range-start' && sel.state === 'loading' && <p class="sheet-muted">מתרגם בהקשר…</p>}
      {sel.kind !== 'range-start' && sel.state === 'error' && <p class="msg bad">{sel.error}</p>}

      {sel.kind === 'word' && sel.state === 'done' && <LookupBody r={sel.result} engine={sel.engine} cached={sel.cached} />}
      {sel.kind === 'range' && sel.state === 'done' && (
        <>
          <p class="sheet-meaning passage-tr">{sel.result.translation}</p>
          {sel.result.note && <p class="sheet-note">{sel.result.note}</p>}
          <p class="sheet-foot">
            {engineLabel(sel.engine)}
            {sel.cached ? ' · מהמטמון' : ''}
          </p>
        </>
      )}

      {sel.kind === 'word' && onTranslateSentence && (
        <div class="sheet-sentence">
          {!sentenceTr && (
            <button class="secondary sentence-btn" onClick={onTranslateSentence}>
              תרגום כל המשפט
            </button>
          )}
          {sentenceTr?.state === 'loading' && <p class="sheet-muted">מתרגם את המשפט…</p>}
          {sentenceTr?.state === 'error' && <p class="msg bad">{sentenceTr.error}</p>}
          {sentenceTr?.state === 'done' && (
            <p class="sheet-sentence-tr" dir="rtl">
              <span class="sheet-pos">המשפט: </span>
              {sentenceTr.text}
            </p>
          )}
        </div>
      )}

      {sel.kind === 'word' && onToggleBookmark && onEditNote && (
        <div class="row sheet-ann">
          <button class="secondary" aria-pressed={!!sentenceMarks?.bookmarked} onClick={onToggleBookmark}>
            🔖 {sentenceMarks?.bookmarked ? 'הסרת הסימנייה' : 'סימנייה למשפט'}
          </button>
          <button class="secondary" aria-pressed={!!sentenceMarks?.hasNote} onClick={onEditNote}>
            ✏️ {sentenceMarks?.hasNote ? 'עריכת ההערה' : 'הערה למשפט'}
          </button>
        </div>
      )}

      {sel.kind === 'word' && <p class="sheet-hint small">לסימון כמה מילים: לחיצה ארוכה על המילה הראשונה, ואז לחיצה על האחרונה.</p>}
    </div>
  );
}

function LookupBody({ r, engine, cached }: { r: WordLookup; engine: string; cached: boolean }) {
  return (
    <>
      <p class="sheet-meta">
        <span>{r.pos}</span>
        {r.lemma && (
          <>
            {' · '}
            <span class="en" lang="en">
              {r.lemma}
            </span>
          </>
        )}
        {r.ipa && (
          <>
            {' · '}
            <span class="en ipa">{r.ipa}</span>
          </>
        )}
      </p>
      <p class="sheet-meaning">{r.contextMeaning}</p>
      {r.otherMeanings.length > 0 && (
        <>
          <h3 class="sheet-sub">משמעויות נוספות</h3>
          <ul class="sheet-list">
            {r.otherMeanings.map((m, i) => (
              <li key={i}>
                <span class="sheet-pos">{m.pos}</span> {m.meaning}
              </li>
            ))}
          </ul>
        </>
      )}
      <p class="sheet-foot">
        {engineLabel(engine)}
        {cached ? ' · מהמטמון' : ''}
      </p>
    </>
  );
}
