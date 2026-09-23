/**
 * ApiCallViewer — Reusable component that displays an API call as cURL and raw HTTP.
 * Designed to help developers understand what's happening under the hood.
 */
import { useState } from 'react';
import { Box, Typography, IconButton, Tooltip, Chip } from '@mui/material';
import type { ShuffleHostProps } from '@/Shuffle-MCPs/host-props';
import {
  Code2,
  Terminal,
  Check as CheckIcon,
  Copy as ContentCopyIcon
} from 'lucide-react';

export interface ApiCallConfig {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

interface ApiCallViewerProps extends ShuffleHostProps {
  config: ApiCallConfig;
  /** Whether to mask the Authorization header value */
  maskAuth?: boolean;
}

type ViewMode = 'curl' | 'http';

function buildCurl({ method, url, headers, body }: ApiCallConfig, maskAuth: boolean): string {
  const parts = [`curl -X ${method} '${url}'`];

  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      const displayValue = maskAuth && key.toLowerCase() === 'authorization'
        ? value.replace(/(Bearer\s+)(.{8}).*/, '$1$2…')
        : value;
      parts.push(`  -H '${key}: ${displayValue}'`);
    }
  }

  if (body) {
    const json = JSON.stringify(body, null, 2);
    parts.push(`  -d '${json}'`);
  }

  return parts.join(' \\\n');
}

function buildHttp({ method, url, headers, body }: ApiCallConfig, maskAuth: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    parsed = new URL(url, 'https://localhost');
  }

  const lines = [`${method} ${parsed.pathname}${parsed.search} HTTP/1.1`];
  lines.push(`Host: ${parsed.host}`);

  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'host') continue;
      const displayValue = maskAuth && key.toLowerCase() === 'authorization'
        ? value.replace(/(Bearer\s+)(.{8}).*/, '$1$2…')
        : value;
      lines.push(`${key}: ${displayValue}`);
    }
  }

  if (body) {
    lines.push('');
    lines.push(JSON.stringify(body, null, 2));
  }

  return lines.join('\n');
}

const ApiCallViewer = ({ config, maskAuth = true }: ApiCallViewerProps) => {
  const [mode, setMode] = useState<ViewMode>('curl');
  const [copied, setCopied] = useState(false);

  const content = mode === 'curl'
    ? buildCurl(config, maskAuth)
    : buildHttp(config, maskAuth);

  const handleCopy = async () => {
    // Copy without masking
    const raw = mode === 'curl'
      ? buildCurl(config, false)
      : buildHttp(config, false);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(raw);
      }
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box sx={{
      borderRadius: 2,
      border: '1px solid hsl(var(--border))',
      bgcolor: 'hsl(var(--background))',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 1,
        borderBottom: '1px solid hsl(var(--border))',
        bgcolor: 'hsl(var(--card))',
      }}>
        <Code2 size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          API Call
        </Typography>
        <Chip
          label={config.method}
          size="small"
          sx={{
            height: 18,
            fontSize: '0.6rem',
            fontWeight: 700,
            bgcolor: config.method === 'GET'
              ? 'hsla(var(--severity-low) / 0.15)'
              : 'hsla(var(--severity-medium) / 0.15)',
            color: config.method === 'GET'
              ? 'hsl(var(--severity-low))'
              : 'hsl(var(--severity-medium))',
            '& .MuiChip-label': { px: 0.75 },
          }}
        />
        <Box sx={{ flex: 1 }} />
        {/* Mode toggle */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {(['curl', 'http'] as ViewMode[]).map(m => (
            <Chip
              key={m}
              label={m === 'curl' ? 'cURL' : 'HTTP'}
              icon={m === 'curl' ? <Terminal size={12} /> : <Code2 size={12} />}
              size="small"
              onClick={() => setMode(m)}
              sx={{
                height: 22,
                fontSize: '0.6rem',
                fontWeight: 600,
                cursor: 'pointer',
                bgcolor: mode === m ? 'hsl(var(--primary) / 0.12)' : 'transparent',
                color: mode === m ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                border: mode === m ? '1px solid hsl(var(--primary) / 0.3)' : '1px solid transparent',
                '& .MuiChip-icon': {
                  color: mode === m ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                },
                '&:hover': {
                  bgcolor: mode === m ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--muted))',
                },
              }}
            />
          ))}
        </Box>
        <Tooltip title={copied ? 'Copied!' : 'Copy'} arrow>
          <IconButton size="small" onClick={handleCopy} sx={{ color: 'hsl(var(--muted-foreground))' }}>
            {copied ? <CheckIcon size={14} /> : <ContentCopyIcon size={14} />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Code block */}
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 2,
          fontSize: '0.7rem',
          fontFamily: "'JetBrains Mono', monospace",
          color: 'hsl(var(--foreground))',
          lineHeight: 1.6,
          overflow: 'auto',
          maxHeight: 280,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          '&::-webkit-scrollbar': { width: 4, height: 4 },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            background: 'hsl(var(--border))',
            borderRadius: 2,
          },
        }}
      >
        {content}
      </Box>
    </Box>
  );
};

export default ApiCallViewer;
