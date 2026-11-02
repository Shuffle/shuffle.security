import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
} from '@mui/material';
import {
  Activity,
  Copy,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Smartphone,
  ChevronDown,
  Bug,
  Globe,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  getCrashLogs,
  clearCrashLogs,
  copyCrashLogsToClipboard,
  recordCrash,
  CrashLog,
} from '@/lib/crashReporter';
import { getDeviceDiagnostics, DeviceDiagnostics } from '@/lib/platform';
import { toast } from '@/lib/toast';

export const DiagnosticsLogsCard: React.FC = () => {
  const [diagnostics, setDiagnostics] = useState<DeviceDiagnostics>(getDeviceDiagnostics());
  const [logs, setLogs] = useState<CrashLog[]>(getCrashLogs());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleUpdate = () => {
      setLogs(getCrashLogs());
      setDiagnostics(getDeviceDiagnostics());
    };

    window.addEventListener('shuffle:crash-logs-updated', handleUpdate);
    return () => window.removeEventListener('shuffle:crash-logs-updated', handleUpdate);
  }, []);

  const handleCopyReport = async () => {
    const success = await copyCrashLogsToClipboard();
    if (success) {
      setCopied(true);
      toast.success('Diagnostic report copied to clipboard');
      setTimeout(() => setCopied(false), 3000);
    } else {
      toast.error('Failed to copy report to clipboard');
    }
  };

  const handleClearLogs = () => {
    clearCrashLogs();
    setLogs([]);
    toast.info('Crash logs cleared');
  };

  const handleTestCrash = () => {
    try {
      throw new Error(`Test diagnostics exception triggered at ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      recordCrash(err, { source: 'manual', extra: { trigger: 'user_diagnostics_test' } });
      toast.warning('Test crash logged to diagnostics');
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        bgcolor: 'transparent',
        backgroundImage: 'none',
        border: 'none',
        boxShadow: 'none',
        boxSizing: 'border-box',
        mb: 3,
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            sx={{
              p: 1,
              borderRadius: 2,
              bgcolor: 'rgba(59, 130, 246, 0.12)',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Activity size={20} />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Platform & Crash Diagnostics
            </Typography>
            <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              Real-time cross-platform telemetry and runtime exception logs
            </Typography>
          </Box>
        </Box>

        {/* Platform Pill */}
        <Chip
          icon={<Smartphone size={14} />}
          label={`${diagnostics.platform.toUpperCase()} ${diagnostics.isNative ? '(Native App)' : '(Web)'}`}
          size="small"
          sx={{
            bgcolor: diagnostics.isNative ? 'rgba(34, 197, 94, 0.12)' : 'hsl(var(--muted))',
            color: diagnostics.isNative ? '#22c55e' : 'hsl(var(--foreground))',
            fontWeight: 600,
            fontSize: '0.75rem',
          }}
        />
      </Box>

      {/* Diagnostics Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
          gap: 1.5,
          p: 1.5,
          borderRadius: 2,
          bgcolor: 'hsl(var(--muted) / 0.5)',
          border: '1px solid hsl(var(--border) / 0.6)',
          mb: 2.5,
        }}
      >
        <Box>
          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block' }}>
            Resolution
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {diagnostics.screenWidth} x {diagnostics.screenHeight}
          </Typography>
        </Box>

        <Box>
          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block' }}>
            Connection
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {diagnostics.online ? (
              <Wifi size={14} style={{ color: '#22c55e' }} />
            ) : (
              <WifiOff size={14} style={{ color: '#ef4444' }} />
            )}
            <Typography variant="body2" sx={{ fontWeight: 600, color: diagnostics.online ? '#22c55e' : '#ef4444' }}>
              {diagnostics.online ? 'Online' : 'Offline'}
            </Typography>
          </Box>
        </Box>

        <Box>
          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block' }}>
            WebView Mode
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {diagnostics.isIosWebView ? 'iOS WKWebView' : diagnostics.isAndroidWebView ? 'Android WebView' : 'Browser'}
          </Typography>
        </Box>

        <Box>
          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block' }}>
            Recorded Issues
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, color: logs.length > 0 ? '#ef4444' : '#22c55e' }}>
            {logs.length} {logs.length === 1 ? 'event' : 'events'}
          </Typography>
        </Box>
      </Box>

      {/* Action Toolbar */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
        <Button
          variant="contained"
          size="small"
          onClick={handleCopyReport}
          startIcon={<Copy size={15} />}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 2,
            bgcolor: copied ? '#22c55e' : 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
          }}
        >
          {copied ? 'Copied Report!' : 'Copy Diagnostic Report'}
        </Button>

        <Button
          variant="outlined"
          size="small"
          onClick={handleTestCrash}
          startIcon={<Bug size={15} />}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 2,
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--foreground))',
          }}
        >
          Simulate Test Error
        </Button>

        {logs.length > 0 && (
          <Button
            variant="text"
            size="small"
            onClick={handleClearLogs}
            startIcon={<Trash2 size={15} />}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              color: 'hsl(var(--destructive, #ef4444))',
              ml: 'auto',
            }}
          >
            Clear Logs
          </Button>
        )}
      </Box>

      {/* Crash Log Accordion List */}
      {logs.length === 0 ? (
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            bgcolor: 'rgba(34, 197, 94, 0.06)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
          }}
        >
          <CheckCircle size={18} style={{ color: '#22c55e', flexShrink: 0 }} />
          <Typography variant="body2" sx={{ color: '#22c55e', fontWeight: 500 }}>
            Zero unhandled crashes recorded. Platform runtime is stable.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>
            RECENT RUNTIME EVENTS (LAST {logs.length}):
          </Typography>
          {logs.map((log) => (
            <Accordion
              key={log.id}
              disableGutters
              elevation={0}
              sx={{
                bgcolor: 'hsl(var(--muted) / 0.3)',
                border: '1px solid hsl(var(--border))',
                borderRadius: 2,
                '&:before': { display: 'none' },
                overflow: 'hidden',
              }}
            >
              <AccordionSummary expandIcon={<ChevronDown size={16} />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', pr: 1 }}>
                  <AlertTriangle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600, flexGrow: 1, maxWidth: '65%' }}>
                    {log.message}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}>
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <Divider sx={{ mb: 1.5 }} />
                <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                  <Chip size="small" label={`Route: ${log.route}`} sx={{ fontSize: '0.7rem' }} />
                  <Chip size="small" label={`Source: ${log.source}`} sx={{ fontSize: '0.7rem' }} />
                  <Chip size="small" label={`Platform: ${log.platform}`} sx={{ fontSize: '0.7rem' }} />
                </Box>

                {log.stack && (
                  <Box
                    sx={{
                      p: 1.25,
                      bgcolor: 'hsl(var(--background))',
                      borderRadius: 1.5,
                      border: '1px solid hsl(var(--border))',
                      fontFamily: 'monospace',
                      fontSize: '0.72rem',
                      maxHeight: 160,
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: 'hsl(var(--muted-foreground))',
                    }}
                  >
                    {log.stack}
                  </Box>
                )}

                {log.breadcrumbs?.length > 0 && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                      Action Breadcrumbs:
                    </Typography>
                    {log.breadcrumbs.slice(-5).map((b, i) => (
                      <Typography key={i} variant="caption" sx={{ display: 'block', color: 'hsl(var(--muted-foreground))', fontFamily: 'monospace' }}>
                        [{new Date(b.timestamp).toLocaleTimeString()}] [{b.category}] {b.message}
                      </Typography>
                    ))}
                  </Box>
                )}
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}
    </Paper>
  );
};
