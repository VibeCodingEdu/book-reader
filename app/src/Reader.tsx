// מסך הספר: מעטפת שטוענת את הפרק פעם אחת ומציגה מצב קריאה (עמודים) או מצב לימוד
// (משפט בשורה). הפרק, משפט העוגן והסרגל העליון (כולל נגן השמע) משותפים, כך שמעבר בין
// המצבים לא טוען מחדש, לא מאבד מקום ולא עוצר הקראה.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Annotation } from '../../shared/annotations';
import { bookPercent, chapterFraction } from '../../shared/progress';
import type { BookMeta } from '../../shared/book';
import type { DeviceSettings, ViewMode } from './deviceSettings';
import { ReaderHeader } from './reader/ReaderHeader';
import { ReadingView } from './reader/ReadingView';
import { StudyView } from './reader/StudyView';
import { NoteEditor } from './reader/NoteEditor';
import { TocSheet } from './reader/TocSheet';
import { useAnnotations } from './reader/useAnnotations';
import { useBookChapter } from './reader/useBookChapter';

interface Props {
  book: BookMeta;
  settings: DeviceSettings;
  onBack: () => void;
  onOpenSettings: () => void;
  onPatchSettings: (patch: Partial<DeviceSettings>) => void;
}

export function Reader({ book, settings, onBack, onOpenSettings, onPatchSettings }: Props) {
  const clearRef = useRef<() => void>(() => {});
  const ch = useBookChapter(book, () => clearRef.current());
  const ann = useAnnotations(book);
  const [tocOpen, setTocOpen] = useState(false);
  const [editing, setEditing] = useState<{ sid: string; sentence: string; existing?: Annotation } | null>(null);
  const study = settings.viewMode === 'study';
  const View = study ? StudyView : ReadingView;

  // התקדמות: כמה מהפרק הנוכחי עבר, וכמה מהספר
  const fraction = useMemo(() => {
    if (!ch.chapter || ch.chapterIdx === null || !ch.posSid?.startsWith(`c${ch.chapterIdx}.`)) return 0;
    return chapterFraction(ch.chapter, ch.posSid);
  }, [ch.chapter, ch.chapterIdx, ch.posSid]);
  const percent = ch.chapterIdx === null ? null : bookPercent(book.chapterWords, ch.chapterIdx, fraction);
  useEffect(() => {
    if (percent === null) return;
    try {
      localStorage.setItem(`reader.progress.${book.id}`, String(percent));
    } catch {
      /* ignore */
    }
  }, [percent, book.id]);

  const onEditNote = (sid: string, sentence: string, existing?: Annotation) => setEditing({ sid, sentence, existing });

  return (
    <div class="reader">
      <ReaderHeader
        book={book}
        chapterIdx={ch.chapterIdx}
        viewMode={settings.viewMode}
        onToggleMode={() => onPatchSettings({ viewMode: (study ? 'read' : 'study') as ViewMode })}
        onBack={onBack}
        onOpenToc={() => setTocOpen(true)}
        onOpenSettings={onOpenSettings}
      />
      <View
        book={book}
        settings={settings}
        ch={ch}
        clearRef={clearRef}
        onPatchSettings={onPatchSettings}
        ann={ann}
        onEditNote={onEditNote}
        percent={percent}
      />

      {tocOpen && (
        <TocSheet
          book={book}
          chapterIdx={ch.chapterIdx}
          fraction={fraction}
          annotations={ann.items}
          parserVersion={ann.parserVersion}
          onJumpChapter={ch.jumpToChapter}
          onJumpSentence={ch.jumpToSentence}
          onEditNote={(a) => setEditing({ sid: a.sentenceId, sentence: a.excerpt, existing: a })}
          onRemove={ann.remove}
          onClose={() => setTocOpen(false)}
        />
      )}
      {editing && (
        <NoteEditor
          sentence={editing.sentence}
          initial={editing.existing?.text ?? ''}
          onSave={(text) => {
            ann.saveNote(editing.sid, editing.sentence, text, editing.existing);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
