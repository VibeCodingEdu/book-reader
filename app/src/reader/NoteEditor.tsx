// עורך הערה על משפט: המשפט למעלה, תיבת טקסט, שמירה / מחיקה / ביטול.

import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../Icon';
import { useSheetDrag } from '../useSheetDrag';

interface Props {
  sentence: string;
  initial: string;
  onSave: (text: string) => void;
  onClose: () => void;
}

export function NoteEditor({ sentence, initial, onSave, onClose }: Props) {
  const { sheetRef, handleProps } = useSheetDrag(onClose);
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);

  return (
    <div class="overlay" onClick={onClose}>
      <div ref={sheetRef} class="sheet note-editor" role="dialog" aria-label="הערה על המשפט" onClick={(e) => e.stopPropagation()}>
        <div class="sheet-grabber" aria-hidden="true" {...handleProps} />
        <div class="sheet-head" {...handleProps}>
          <h2>{initial ? 'עריכת הערה' : 'הערה חדשה'}</h2>
          <span class="spacer" />
          <button class="icon-btn" aria-label="סגירה" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <p class="note-sentence en" lang="en" dir="ltr">
          {sentence}
        </p>
        <textarea
          ref={ref}
          dir="auto"
          rows={5}
          placeholder="ההערה שלך (עברית או אנגלית)"
          value={text}
          onInput={(e) => setText(e.currentTarget.value)}
          maxLength={5000}
        />
        <div class="row note-actions">
          <button onClick={() => onSave(text)} disabled={!text.trim() && !initial}>
            שמירה
          </button>
          {initial && (
            <button class="secondary" onClick={() => onSave('')}>
              מחיקת ההערה
            </button>
          )}
          <button class="secondary" onClick={onClose}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
