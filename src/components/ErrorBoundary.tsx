import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
  enableRecovery?: boolean;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  errorId?: string;
  retryCount: number;
  isRetrying: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  private retryTimeoutId?: NodeJS.Timeout;

  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false, 
      retryCount: 0, 
      isRetrying: false 
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Check if this is a Firestore internal assertion error
    const errorMessage = error.message || '';
    const errorStack = error.stack || '';
    const errorString = String(error);
    
    const isFirestoreError = (
      errorMessage.includes('INTERNAL ASSERTION FAILED') || 
      errorMessage.includes('FIRESTORE') && errorMessage.includes('Unexpected state') ||
      errorMessage.includes('ID: ca9') ||
      errorMessage.includes('ID: b815') ||
      errorStack.includes('INTERNAL ASSERTION FAILED') ||
      errorStack.includes('ID: ca9') ||
      errorStack.includes('ID: b815') ||
      errorString.includes('INTERNAL ASSERTION FAILED') ||
      errorString.includes('ID: ca9') ||
      errorString.includes('ID: b815')
    );
    
    if (isFirestoreError) {
      // For Firestore errors, don't show error UI
      return { hasError: false };
    }
    
    // Generate unique error ID for tracking
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Update state so the next render will show the fallback UI
    return { 
      hasError: true, 
      error,
      errorId
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Check if this is a Firestore internal assertion error
    const errorMessage = error.message || '';
    const errorStack = error.stack || '';
    const errorString = String(error);
    
    const isFirestoreError = (
      errorMessage.includes('INTERNAL ASSERTION FAILED') || 
      errorMessage.includes('FIRESTORE') && errorMessage.includes('Unexpected state') ||
      errorMessage.includes('ID: ca9') ||
      errorMessage.includes('ID: b815') ||
      errorStack.includes('INTERNAL ASSERTION FAILED') ||
      errorStack.includes('ID: ca9') ||
      errorStack.includes('ID: b815') ||
      errorString.includes('INTERNAL ASSERTION FAILED') ||
      errorString.includes('ID: ca9') ||
      errorString.includes('ID: b815')
    );
    
    if (isFirestoreError) {
      // For Firestore errors, completely suppress - don't even log
      return;
    }
    
    // Log the error to console and call optional error handler
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // Call optional error handler prop
    this.props.onError?.(error, errorInfo);

    // Report error to external service (if available)
    this.reportError(error, errorInfo);
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  private reportError = (error: Error, errorInfo: ErrorInfo) => {
    // In a real app, you might want to send this to an error reporting service
    // like Sentry, LogRocket, or Bugsnag
    try {
      const errorReport = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        errorId: this.state.errorId
      };
      
      // For now, just log it - in production, send to your error service
      console.log('Error Report:', errorReport);
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  };

  private handleRetry = () => {
    if (this.state.retryCount >= 3) {
      // After 3 retries, just refresh the page
      window.location.reload();
      return;
    }

    this.setState({ isRetrying: true });

    // Clear any existing timeout
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }

    // Retry after a short delay
    this.retryTimeoutId = setTimeout(() => {
      this.setState(prevState => ({
        hasError: false,
        error: undefined,
        errorInfo: undefined,
        retryCount: prevState.retryCount + 1,
        isRetrying: false
      }));
    }, 1000);
  };

  private handleRefresh = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Modern enhanced fallback UI
      return (
        <div 
          role="alert"
          className="card"
          style={{
            maxWidth: '600px',
            margin: '2rem auto',
            textAlign: 'center',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderLeft: '4px solid #ef4444'
          }}
        >
          {/* Error Icon */}
          <div style={{ 
            fontSize: '4rem', 
            marginBottom: '1rem',
            animation: 'pulse 2s infinite'
          }}>
            ⚠️
          </div>

          {/* Error Title */}
          <h2 style={{ 
            fontSize: '1.75rem', 
            fontWeight: 'bold', 
            marginBottom: '1rem',
            color: '#dc2626',
            background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            Oops! Something went wrong
          </h2>

          {/* Error Message */}
          <p style={{ 
            marginBottom: '2rem', 
            color: '#6b7280',
            fontSize: '1.1rem',
            lineHeight: '1.6'
          }}>
            We encountered an unexpected error. Don't worry, your data is safe. 
            {this.state.retryCount > 0 && (
              <span style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                Retry attempt: {this.state.retryCount}/3
              </span>
            )}
          </p>

          {/* Error ID for support */}
          {this.state.errorId && (
            <div style={{ 
              marginBottom: '1.5rem',
              padding: '0.5rem 1rem',
              backgroundColor: 'rgba(107, 114, 128, 0.1)',
              borderRadius: '8px',
              fontSize: '0.875rem',
              color: '#6b7280',
              fontFamily: 'monospace'
            }}>
              Error ID: {this.state.errorId}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ 
            display: 'flex', 
            gap: '1rem', 
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginBottom: '1.5rem'
          }}>
            {this.props.enableRecovery !== false && (
              <button
                onClick={this.handleRetry}
                disabled={this.state.isRetrying}
                className="primary"
                style={{
                  minWidth: '140px',
                  opacity: this.state.isRetrying ? 0.7 : 1
                }}
              >
                {this.state.isRetrying ? (
                  <>
                    <span style={{ 
                      display: 'inline-block',
                      width: '16px',
                      height: '16px',
                      border: '2px solid transparent',
                      borderTop: '2px solid currentColor',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      marginRight: '0.5rem'
                    }}></span>
                    Retrying...
                  </>
                ) : (
                  '🔄 Try Again'
                )}
              </button>
            )}

            <button
              onClick={this.handleRefresh}
              className="secondary"
              style={{ minWidth: '140px' }}
            >
              🔄 Refresh Page
            </button>

            <button
              onClick={this.handleGoHome}
              className="success"
              style={{ minWidth: '140px' }}
            >
              🏠 Go Home
            </button>
          </div>

          {/* Help Text */}
          <p style={{ 
            fontSize: '0.875rem', 
            color: '#9ca3af',
            marginBottom: '1rem'
          }}>
            If this problem persists, please contact support with the Error ID above.
          </p>

          {/* Development Error Details */}
          {(process.env.NODE_ENV === 'development' || this.props.showDetails) && this.state.error && (
            <details style={{ 
              textAlign: 'left', 
              marginTop: '1.5rem',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              <summary style={{ 
                cursor: 'pointer', 
                fontWeight: 'bold', 
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderBottom: '1px solid #e5e7eb'
              }}>
                🔍 Error Details {process.env.NODE_ENV === 'development' ? '(Development Only)' : ''}
              </summary>
              <div style={{ padding: '1rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <strong>Error Message:</strong>
                  <pre style={{ 
                    backgroundColor: '#f3f4f6', 
                    padding: '0.75rem', 
                    borderRadius: '4px', 
                    overflow: 'auto',
                    fontSize: '0.875rem',
                    color: '#374151',
                    marginTop: '0.5rem'
                  }}>
                    {this.state.error.message}
                  </pre>
                </div>
                
                {this.state.error.stack && (
                  <div style={{ marginBottom: '1rem' }}>
                    <strong>Stack Trace:</strong>
                    <pre style={{ 
                      backgroundColor: '#f3f4f6', 
                      padding: '0.75rem', 
                      borderRadius: '4px', 
                      overflow: 'auto',
                      fontSize: '0.75rem',
                      color: '#374151',
                      marginTop: '0.5rem',
                      maxHeight: '200px'
                    }}>
                      {this.state.error.stack}
                    </pre>
                  </div>
                )}

                {this.state.errorInfo?.componentStack && (
                  <div>
                    <strong>Component Stack:</strong>
                    <pre style={{ 
                      backgroundColor: '#f3f4f6', 
                      padding: '0.75rem', 
                      borderRadius: '4px', 
                      overflow: 'auto',
                      fontSize: '0.75rem',
                      color: '#374151',
                      marginTop: '0.5rem',
                      maxHeight: '200px'
                    }}>
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          )}

          {/* Add spin animation for loading state */}
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            @keyframes pulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.7; transform: scale(1.05); }
            }
          `}</style>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
