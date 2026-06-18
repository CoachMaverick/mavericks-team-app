'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("PAGE ERROR:", error);
    console.error('Uncaught error in component:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-6 text-center text-muted-foreground border rounded m-4 bg-yellow-50 text-yellow-800">
          <p className="font-medium">Something went wrong loading this section.</p>
          {this.state.error && (
            <p className="text-xs mt-1 font-mono break-all">Details: {this.state.error.message}</p>
          )}
          <p className="text-xs mt-2">Check console for full "PAGE ERROR:" logs. Some features may be temporarily unavailable.</p>
          <button 
            onClick={() => this.setState({ hasError: false })} 
            className="mt-2 text-sm underline"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
