import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Typography, Button, Paper, Collapse } from '@mui/material';
import { RefreshCw, Home, Copy, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { recordCrash, copyCrashLogsToClipboard } from '@/lib/crashReporter';
import { getPlatform, isCapacitorNative } from '@/lib/platform';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
  showDetails: boolean;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    recordCrash(error, {
      source: 'react_boundary',
      componentStack: errorInfo.componentStack || undefined,
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    try {
      window.location.reload();
    } catch {
      window.location.href = '/';
    }
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/incidents';
  };

  private handleCopyDetails = async () => {
    const success = await copyCrashLogsToClipboard();
    if (success) {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 3000);
    }
  };

  public override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const platform = getPlatform();
      const isNative = isCapacitorNative();
      const errorMessage = this.state.error?.message || 'An unexpected rendering error occurred.';

      return (
        <Box
          sx={{
            minHeight: '100dvh',
            width: '100%',
            maxWidth: '100vw',
            bgcolor: 'hsl(var(--background))',
            color: 'hsl(var(--foreground))',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: { xs: 2.5, sm: 4 },
            pt: 'max(3rem, calc(1.5rem + env(safe-area-inset-top, 24px)))',
            pb: 'max(2rem, calc(1.5rem + env(safe-area-inset-bottom, 24px)))',
            boxSizing: 'border-box',
          }}
        >
          <Paper
            elevation={3}
            sx={{
              width: '100%',
              maxWidth: 540,
              p: { xs: 3, sm: 4 },
              borderRadius: 3,
              bgcolor: 'hsl(var(--card))',
              color: 'hsl(var(--foreground))',
              border: '1px solid hsl(var(--border))',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          >
            {/* Warning Icon Badge */}
            <Box
              sx={{
                display: 'inline-flex',
                p: 1.5,
                borderRadius: '50%',
                bgcolor: 'rgba(239, 68, 68, 0.12)',
                color: '#ef4444',
                mb: 2,
              }}
            >
              <AlertTriangle size={36} />
            </Box>

            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                mb: 1,
                fontSize: { xs: '1.25rem', sm: '1.45rem' },
                color: 'hsl(var(--foreground))',
              }}
            >
              Application Error Recovered
            </Typography>

            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', mb: 3, lineHeight: 1.6 }}>
              A view encountered an issue on {platform.toUpperCase()} ({isNative ? 'Native App' : 'Browser'}). Your session is preserved, and the crash has been logged to diagnostics.
            </Typography>

            {/* Error message snippet */}
            <Box
              sx={{
                p: 1.5,
                mb: 3,
                bgcolor: 'hsl(var(--muted))',
                borderRadius: 2,
                border: '1px solid hsl(var(--border))',
                textAlign: 'left',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                color: '#ef4444',
                overflowX: 'auto',
                wordBreak: 'break-word',
              }}
            >
              {errorMessage}
            </Box>

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2.5 }}>
              <Button
                variant="contained"
                onClick={this.handleReset}
                startIcon={<RefreshCw size={18} />}
                sx={{
                  py: 1.25,
                  bgcolor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: 2,
                  '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
                }}
              >
                Reload & Recover View
              </Button>

              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={this.handleGoHome}
                  startIcon={<Home size={18} />}
                  sx={{
                    py: 1.1,
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 2,
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                >
                  Go to Incidents
                </Button>

                <Button
                  fullWidth
                  variant="outlined"
                  onClick={this.handleCopyDetails}
                  startIcon={<Copy size={18} />}
                  sx={{
                    py: 1.1,
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 2,
                    borderColor: 'hsl(var(--border))',
                    color: this.state.copied ? '#22c55e' : 'hsl(var(--foreground))',
                  }}
                >
                  {this.state.copied ? 'Copied!' : 'Copy Report'}
                </Button>
              </Box>
            </Box>

            {/* Expandable Technical Details */}
            <Button
              size="small"
              onClick={() => this.setState({ showDetails: !this.state.showDetails })}
              endIcon={this.state.showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              sx={{ textTransform: 'none', color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem' }}
            >
              {this.state.showDetails ? 'Hide technical details' : 'View technical details'}
            </Button>

            <Collapse in={this.state.showDetails}>
              <Box
                sx={{
                  mt: 2,
                  p: 1.5,
                  bgcolor: 'hsl(var(--muted))',
                  borderRadius: 2,
                  textAlign: 'left',
                  maxHeight: 200,
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '0.72rem',
                  lineHeight: 1.4,
                  color: 'hsl(var(--muted-foreground))',
                }}
              >
                {this.state.error?.stack && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>Stack:</strong>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{this.state.error.stack}</pre>
                  </div>
                )}
                {this.state.errorInfo?.componentStack && (
                  <div>
                    <strong>Component Stack:</strong>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </Box>
            </Collapse>
          </Paper>
        </Box>
      );
    }

    return this.props.children;
  }
}
