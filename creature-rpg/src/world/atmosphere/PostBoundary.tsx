// Error boundary for optional render features (post stack): on a failed chunk load or composer error
// the feature unmounts and the scene keeps rendering through the renderer's own ACES path.
import { Component, type ReactNode } from 'react';

export class PostBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.warn('post stack disabled:', e);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
