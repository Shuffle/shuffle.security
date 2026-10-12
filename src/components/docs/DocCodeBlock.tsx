import { useState, type ReactNode } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { Check as CheckIcon, Copy as CopyIcon } from 'lucide-react';

interface DocCodeBlockProps {
  children?: ReactNode;
  /** Raw text content of the block, used for the copy button. */
  text: string;
  /** Language tag from the markdown fence (e.g. "bash"), if any. */
  language?: string;
}

/**
 * Styled code block for docs pages: language label, copy button and
 * high-contrast colors in both light and dark mode.
 */
export function DocCodeBlock({ children, text, language }: DocCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — leave state unchanged.
    }
  };

  return (
    <Box
      sx={{
        mb: 3,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        overflow: 'hidden',
        backgroundColor: (t) => (t.palette.mode === 'dark' ? '#111417' : '#F6F7F9'),
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 0.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          backgroundColor: (t) =>
            t.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)',
        }}
      >
        <Box
          component="span"
          sx={{
            fontSize: '0.7rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'text.secondary',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          {language || 'code'}
        </Box>
        <Tooltip title={copied ? 'Copied' : 'Copy'}>
          <IconButton
            size="small"
            aria-label="Copy code block"
            onClick={handleCopy}
            sx={{ p: 0.5, color: 'text.secondary' }}
          >
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          </IconButton>
        </Tooltip>
      </Box>
      <Box
        component="pre"
        sx={{
          m: 0,
          px: 2.5,
          py: 2,
          overflow: 'auto',
          fontSize: '0.8125rem',
          lineHeight: 1.7,
          fontFamily: 'JetBrains Mono, monospace',
          color: 'text.primary',
          '& code': {
            backgroundColor: 'transparent',
            p: 0,
            color: 'inherit',
            fontSize: 'inherit',
            lineHeight: 'inherit',
          },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
