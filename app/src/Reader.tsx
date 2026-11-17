// מסך הספר: מעטפת שטוענת את הפרק פעם אחת ומציגה מצב קריאה (עמודים) או מצב לימוד
// (משפט בשורה). הפרק, משפט העוגן והסרגל העליון (כולל נגן השמע) משותפים, כך שמעבר בין
// המצבים לא טוען מחדש, לא מאבד מקום ולא עוצר הקראה.

import { useRef } from 'preact/hooks';
import type { BookMeta } from '../../shared/book';
import type { DeviceSettings, ViewMode } from './deviceSettings';
import { ReaderHeader } from './reader/ReaderHeader';
import { ReadingView } from './reader/ReadingView';
import { StudyView } from './reader/StudyView';
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
  const study = settings.viewMode === 'study';
  const View = study ? StudyView : ReadingView;

  return (
    <div class="reader">
      <ReaderHeader
        book={book}
        chapterIdx={ch.chapterIdx}
        viewMode={settings.viewMode}
        onToggleMode={() => onPatchSettings({ viewMode: (study ? 'read' : 'study') as ViewMode })}
        onBack={onBack}
        onJumpToChapter={ch.jumpToChapter}
        onOpenSettings={onOpenSettings}
      />
      <View book={book} settings={settings} ch={ch} clearRef={clearRef} onPatchSettings={onPatchSettings} />
    </div>
  );
}
