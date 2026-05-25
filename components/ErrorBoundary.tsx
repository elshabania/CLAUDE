"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render-time errors anywhere below it and shows a recoverable panel
 * instead of a blank window - so a bug in one view never bricks the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-0, #0f172a)",
          padding: 24,
        }}
      >
        <div className="panel" style={{ maxWidth: 520, width: "100%" }}>
          <div className="panel-header">
            <span>Something went wrong</span>
          </div>
          <div className="panel-body" style={{ fontSize: 13, lineHeight: 1.5 }}>
            <p style={{ marginTop: 0, color: "var(--text-2, #94a3b8)" }}>
              The view hit an unexpected error. Your work isn&apos;t lost — if you
              saved a project you can reopen it after reloading.
            </p>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "var(--bg-0, #0b1120)",
                border: "1px solid var(--line-strong, #334155)",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 12,
                color: "#fca5a5",
                maxHeight: 160,
                overflow: "auto",
              }}
            >
              {this.state.error.message}
            </pre>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => location.reload()}
              >
                Reload
              </button>
              <button
                className="btn btn-sm"
                onClick={() => this.setState({ error: null })}
              >
                Try to continue
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
