import type { ReactNode } from 'react';

export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className = '',
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details className={`disclosure ${className}`} open={defaultOpen || undefined}>
      <summary>{summary}</summary>
      <div className="disclosure__body">{children}</div>
    </details>
  );
}
