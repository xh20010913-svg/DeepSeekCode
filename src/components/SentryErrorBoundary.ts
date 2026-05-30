import React from "react";

export class SentryErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  render(): React.ReactNode {
    if (this.state.error) return this.props.fallback ?? React.createElement("span", null, this.state.error.message);
    return this.props.children;
  }
}
