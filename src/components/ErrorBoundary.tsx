import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches errors thrown while rendering the tree below it and offers a reload,
 * instead of leaving a blank screen. It doesn't catch errors in event handlers
 * or async code. Its fallback uses only theme tokens, no app context.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <div
        role="alert"
        className="h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center bg-canvas text-ink"
      >
        <h1 className="text-2xl font-bold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-sm text-ink-muted max-w-sm break-words">
          {error.message}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="bg-accent text-on-accent font-semibold rounded-xl px-6 py-3 hover:bg-accent/90 active:scale-95 transition-all cursor-pointer"
        >
          Reload
        </button>
      </div>
    );
  }
}
