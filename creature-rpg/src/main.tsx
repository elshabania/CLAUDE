import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/theme.css';

const params = new URLSearchParams(location.search);
const tool = import.meta.env.DEV || import.meta.env.VITE_QA === '1' ? params.get('tool') : null;
if (import.meta.env.DEV || import.meta.env.VITE_QA === '1') {
  import('./state/runtime').then((m) => ((window as any).__qa = { runtime: m.runtime }));
}
const App = lazy(() => (tool ? import('./tools/Tools') : import('./app/App')));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="boot">Tuning…</div>}>
      <App />
    </Suspense>
  </StrictMode>,
);
