import type { UnitType, WordLookup } from '../../shared/translate';
import { ENGINES } from '../../shared/translate';

export type Selection = {
  sid: string;
  sentence: string;
  word: string;
  offset: number;
} & (
  | { state: 'loading' }
  | { state: 'done'; result: WordLookup; engine: string; cached: boolean }
  | { state: 'error'; error: string }
);

const TYPE_LABEL: Record<UnitType, string | null> = {
  word: null,
  phrasal_verb: 'ביטוי פועלי',
  idiom: 'ניב',
  proper_noun: 'שם פרטי',
};

function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

export function WordSheet({ sel, onClose }: { sel: Selection; onClose: () => void }) {
  return (
    <div class="sheet" role="dialog" aria-label="תרגום" onClick={(e) => e.stopPropagation()}>
      <div class="sheet-head">
        <div class="sheet-word en" lang="en">
          {sel.state === 'done' ? sel.result.unit : sel.word}
        </div>
        {sel.state === 'done' && TYPE_LABEL[sel.result.unitType] && (
          <span class="badge">{TYPE_LABEL[sel.result.unitType]}</span>
        )}
        <span class="spacer" />
        <button
          class="icon-btn"
          aria-label="השמעה"
          onClick={() => speak(sel.state === 'done' ? sel.result.lemma : sel.word)}
        >
          🔊
        </button>
        <button class="icon-btn" aria-label="סגירה" onClick={onClose}>
          ✕
        </button>
      </div>

      {sel.state === 'loading' && <p class="sheet-muted">מתרגם בהקשר…</p>}
      {sel.state === 'error' && <p class="msg bad">{sel.error}</p>}
      {sel.state === 'done' && <LookupBody r={sel.result} engine={sel.engine} cached={sel.cached} />}
    </div>
  );
}

function LookupBody({ r, engine, cached }: { r: WordLookup; engine: string; cached: boolean }) {
  const engineLabel = ENGINES.find((e) => e.id === engine)?.label ?? engine;
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
        {engineLabel}
        {cached ? ' · מהמטמון' : ''}
      </p>
    </>
  );
}
