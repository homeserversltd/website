import React, { Component, ErrorInfo, ReactNode } from 'react';
import { fallbackManager } from '../../utils/fallbackManager';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary component that catches rendering errors
 * and activates the fallback tablet when needed
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    console.log('[ErrorBoundary] Error detected, updating state to show fallback UI');
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught rendering error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    
    // Activate fallback mode
    console.log('[ErrorBoundary] Activating fallback mode due to rendering error');
    fallbackManager.activateFallback('render_error');
    
    // Dispatch custom event for other components
    const errorEvent = new CustomEvent('tablet-load-error', {
      detail: {
        reason: 'render_error',
        error,
        errorInfo
      }
    });
    window.dispatchEvent(errorEvent);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // We'll let the fallback manager handle showing the fallback screen
      // This returns a minimal container to avoid additional errors
      return (
        <div className="error-boundary-container">
          {/* Fallback manager will handle showing the proper UI */}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 