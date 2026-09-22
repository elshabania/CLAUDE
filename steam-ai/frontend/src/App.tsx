import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { RunProvider } from './app/RunContext';
import { Footer } from './components/Footer';
import { TopBar } from './components/TopBar';
import { Loading } from './components/States';
import HomePage from './pages/HomePage';
import FindingsPage from './pages/FindingsPage';
import ChecksPage from './pages/ChecksPage';
import ReportsPage from './pages/ReportsPage';
import NotFoundPage from './pages/NotFoundPage';

// The map route pulls MapLibre and deck.gl; keep it out of the first paint.
const MapPage = lazy(() => import('./pages/MapPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function Frame() {
  const { pathname } = useLocation();
  const isMap = /\/map$/.test(pathname);
  return (
    <RunProvider>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopBar />
      <main id="main" className={`main ${isMap ? 'main--full' : ''}`} tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </RunProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Routes>
          <Route element={<Frame />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/runs/:runId" element={<HomePage />} />
            <Route path="/runs/:runId/findings" element={<FindingsPage />} />
            <Route
              path="/runs/:runId/map"
              element={
                <Suspense fallback={<div className="main"><Loading what="map" /></div>}>
                  <MapPage />
                </Suspense>
              }
            />
            <Route path="/runs/:runId/reports" element={<ReportsPage />} />
            <Route path="/checks" element={<ChecksPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
