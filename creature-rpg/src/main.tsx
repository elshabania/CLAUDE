import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/theme.css';

const params = new URLSearchParams(location.search);
const tool = params.get('tool');
const App = lazy(() => (tool ? import('./tools/Tools') : import('./app/App')));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="boot">Tuning…</div>}>
      <App />
    </Suspense>
  </StrictMode>,
);
