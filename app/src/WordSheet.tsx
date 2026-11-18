import { useState } from 'preact/hooks';
import type { TextTranslation, UnitType, WordLookup } from '../../shared/translate';
import { ENGINE_LABELS } from '../../shared/translate';
import { Icon } from './Icon';
import { toggleSpeak, useSpeakingKey } from './speech';
import type { SentenceTr } from './reader/useSentenceTranslations';
import { useSheetDrag } from './useSheetDrag';

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

/** כפתור השמעה: בזמן ההשמעה – גל קול קטן מונפש (לחיצה עוצרת) */
export function SpeakButton({ text, speakKey, label = 'השמעה באנגלית' }: { text: string; speakKey: string; label?: string }) {
  const speaking = useSpeakingKey() === speakKey;
  return (
    <button
      class={`icon-btn speak-btn ${speaking ? 'speaking' : ''}`}
      aria-label={speaking ? 'עצירת ההשמעה' : label}
      aria-pressed={speaking}
      onClick={() => toggleSpeak(text, speakKey)}
    >
      {speaking ? (
        <span class="wave" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : (
        <Icon name="speak" />
      )}
    </button>
  );
}

/** מקום שמור לתוצאה בזמן הטעינה: קווים מהבהבים בעדינות (ב-E-ink: טקסט בלבד) */
function Skeleton({ label }: { label: string }) {
  return (
    <div class="skeleton" role="status">
      <span class="visually-hidden">{label}</span>
      <span class="sk-line w60" aria-hidden="true" />
      <span class="sk-line w85" aria-hidden="true" />
      <span class="sk-text" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}

export function WordSheet({ sel, onClose, onTranslate, sentenceTr, onTranslateSentence, sentenceMarks, onToggleBookmark, onEditNote }: Props) {
  const { sheetRef, handleProps } = useSheetDrag(onClose);
  const heading =
    sel.kind === 'range' ? sel.text : sel.kind === 'word' && sel.state === 'done' ? sel.result.unit : sel.word;
  const toSpeak =
    sel.kind === 'range' ? sel.text : sel.kind === 'word' && sel.state === 'done' ? sel.result.unit : sel.word;

  return (
    <div ref={sheetRef} class="sheet word-sheet" role="dialog" aria-label="תרגום" aria-live="polite" onClick={(e) => e.stopPropagation()}>
      <div class="sheet-grabber" aria-hidden="true" {...handleProps} />
      <div class="sheet-head" {...handleProps}>
        <div class="sheet-title">
          <div class={`sheet-word en ${sel.kind === 'range' ? 'passage' : ''}`} lang="en">
            {heading}
            {sel.kind === 'range-start' && ' …'}
          </div>
          {sel.kind === 'word' && sel.state === 'done' && (sel.result.ipa || TYPE_LABEL[sel.result.unitType]) && (
            <div class="word-chips">
              {sel.result.ipa && (
                <span class="ipa-chip en" lang="en">
                  {sel.result.ipa}
                </span>
              )}
              {TYPE_LABEL[sel.result.unitType] && <span class="badge">{TYPE_LABEL[sel.result.unitType]}</span>}
            </div>
          )}
        </div>
        <span class="spacer" />
        <SpeakButton text={toSpeak} speakKey={`sheet:${toSpeak}`} />
        <button class="icon-btn" aria-label="סגירה" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>

      {sel.kind === 'range-start' && <p class="sheet-hint">סימון קטע: לחצו עכשיו על המילה האחרונה בקטע.</p>}

      {sel.kind !== 'range-start' && sel.state === 'idle' && (
        <button class="translate-btn" onClick={onTranslate}>
          תרגם
        </button>
      )}
      {sel.kind !== 'range-start' && sel.state === 'loading' && <Skeleton label="מתרגם בהקשר…" />}
      {sel.kind !== 'range-start' && sel.state === 'error' && <p class="msg bad">{sel.error}</p>}

      {sel.kind === 'word' && sel.state === 'done' && <LookupBody key={sel.result.unit} r={sel.result} engine={sel.engine} cached={sel.cached} />}
      {sel.kind === 'range' && sel.state === 'done' && (
        <div class="reveal">
          <p class="sheet-meaning passage-tr">{sel.result.translation}</p>
          {sel.result.note && <p class="sheet-note">{sel.result.note}</p>}
          <p class="sheet-foot">
            {engineLabel(sel.engine)}
            {sel.cached ? ' · מהמטמון' : ''}
          </p>
        </div>
      )}

      {sel.kind === 'word' && onTranslateSentence && (
        <div class="sheet-sentence">
          {!sentenceTr && (
            <button class="secondary sentence-btn" onClick={onTranslateSentence}>
              <Icon name="translate" size={18} />
              תרגום כל המשפט
            </button>
          )}
          {sentenceTr?.state === 'loading' && <Skeleton label="מתרגם את המשפט…" />}
          {sentenceTr?.state === 'error' && <p class="msg bad">{sentenceTr.error}</p>}
          {sentenceTr?.state === 'done' && (
            <p class="sheet-sentence-tr reveal" dir="rtl">
              <span class="sheet-pos">המשפט: </span>
              {sentenceTr.text}
            </p>
          )}
        </div>
      )}

      {sel.kind === 'word' && onToggleBookmark && onEditNote && (
        <div class="row sheet-ann">
          <button class="secondary" aria-pressed={!!sentenceMarks?.bookmarked} onClick={onToggleBookmark}>
            <Icon name="bookmark" size={18} />
            {sentenceMarks?.bookmarked ? 'הסרת הסימנייה' : 'סימנייה למשפט'}
          </button>
          <button class="secondary" aria-pressed={!!sentenceMarks?.hasNote} onClick={onEditNote}>
            <Icon name="note" size={18} />
            {sentenceMarks?.hasNote ? 'עריכת ההערה' : 'הערה למשפט'}
          </button>
        </div>
      )}

      {sel.kind === 'word' && <p class="sheet-hint small">לסימון כמה מילים: לחיצה ארוכה על המילה הראשונה, ואז לחיצה על האחרונה.</p>}
    </div>
  );
}

function LookupBody({ r, engine, cached }: { r: WordLookup; engine: string; cached: boolean }) {
  const [more, setMore] = useState(false);
  return (
    <div class="reveal">
      <p class="sheet-meta">
        <span>{r.pos}</span>
        {r.lemma && r.lemma.toLowerCase() !== r.unit.toLowerCase() && (
          <>
            {' · '}
            <span class="en" lang="en">
              {r.lemma}
            </span>
          </>
        )}
      </p>
      <p class="sheet-meaning">{r.contextMeaning}</p>
      {r.otherMeanings.length > 0 && (
        <>
          <button class="link-btn more-toggle" aria-expanded={more} onClick={() => setMore(!more)}>
            <Icon name={more ? 'chevronUp' : 'chevronDown'} size={16} />
            {more ? 'פחות' : `עוד ${r.otherMeanings.length === 1 ? 'משמעות אחת' : `${r.otherMeanings.length} משמעויות`}`}
          </button>
          <div class={`collapse ${more ? 'open' : ''}`}>
            <div>
              <ul class="sheet-list">
                {r.otherMeanings.map((m, i) => (
                  <li key={i}>
                    <span class="sheet-pos">{m.pos}</span> {m.meaning}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
      <p class="sheet-foot">
        {engineLabel(engine)}
        {cached ? ' · מהמטמון' : ''}
      </p>
    </div>
  );
}
