import { type ReactNode } from 'react';
import { Box } from '@mui/material';
import CodeBlockEditor from '@/Shuffle-Core/components/CodeBlockEditor';

interface DocCodeBlockProps {
  children?: ReactNode;
  /** Raw text content of the block, used for the editor, copy button, and runner. */
  text: string;
  /** Language tag from the markdown fence (e.g. "python", "bash"), if any. */
  language?: string;
  /** Optional title override for the header bar. */
  title?: string;
}

/**
 * Documentation code block wrapper around Shuffle-Core's shared CodeBlockEditor.
 * Renders syntax-highlighted, line-numbered, editable code with live execution
 * via Shuffle Tools (execute_python / execute_bash) or HTTP (curl) and interactive
 * JSON tree view.
 */
export function DocCodeBlock({ text, language, title }: DocCodeBlockProps) {
  return (
    <Box className="not-prose" sx={{ my: 2.5 }}>
      <CodeBlockEditor code={text} language={language} title={title} />
    </Box>
  );
}

