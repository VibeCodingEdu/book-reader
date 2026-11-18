import { render } from 'preact';
import { App } from './App';
// גופנים לקריאה, בתוך האפליקציה (עובדים בלי רשת). רק תת-קבוצת הלטינית; הקובץ יורד רק כשהגופן בשימוש.
import '@fontsource/literata/latin-400.css';
import '@fontsource/literata/latin-400-italic.css';
import '@fontsource/literata/latin-700.css';
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/source-serif-4/latin-400-italic.css';
import '@fontsource/source-serif-4/latin-700.css';
import '@fontsource/lexend/latin-400.css';
import '@fontsource/lexend/latin-700.css';
// גופני הממשק: Heebo (טקסט וכפתורים) ו-Frank Ruhl Libre (כותרות), בעברית ובלטינית
import '@fontsource/heebo/hebrew-400.css';
import '@fontsource/heebo/latin-400.css';
import '@fontsource/heebo/hebrew-500.css';
import '@fontsource/heebo/latin-500.css';
import '@fontsource/heebo/hebrew-600.css';
import '@fontsource/heebo/latin-600.css';
import '@fontsource/heebo/hebrew-700.css';
import '@fontsource/heebo/latin-700.css';
import '@fontsource/frank-ruhl-libre/hebrew-500.css';
import '@fontsource/frank-ruhl-libre/latin-500.css';
import '@fontsource/frank-ruhl-libre/hebrew-700.css';
import '@fontsource/frank-ruhl-libre/latin-700.css';
import './styles.css';

render(<App />, document.getElementById('app')!);
