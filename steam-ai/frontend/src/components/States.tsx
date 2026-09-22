import { ApiError } from '../api/client';

export function Loading({ what = 'data' }: { what?: string }) {
  return (
    <p className="state" role="status" aria-live="polite">
      Loading {what}…
    </p>
  );
}

export function ErrorState({ error, what = 'data' }: { error: unknown; what?: string }) {
  const e = error as Partial<ApiError> & { message?: string };
  return (
    <div className="state state--error" role="alert">
      <strong>Could not load {what}.</strong>{' '}
      <span>{e?.message ?? 'Unknown error'}</span>
      {e?.status !== undefined && e.url ? (
        <div className="small muted">
          HTTP {e.status || 'network'} · <code>{e.url}</code>
        </div>
      ) : null}
      {e?.status === 0 ? (
        <div className="small muted">
          The API did not answer. Start the backend (uvicorn on :8000) or run with <code>VITE_USE_MOCK=1</code>.
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="state">{children}</p>;
}
