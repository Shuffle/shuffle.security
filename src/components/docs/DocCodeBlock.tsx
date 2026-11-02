/**
 * DocCodeBlock — Standardized interactive code editor and runner for documentation.
 *
 * Re-exports the platform-wide `HighlightedFileEditor` from `@/Shuffle-Core` so
 * Markdown, Documentation, and Raw File views share the exact same editor.
 */

import React from 'react';
import {
  HighlightedFileEditor,
  detectCodeLanguage,
  highlightCodeSnippet,
  type HighlightedFileEditorProps,
  type CodeLanguage,
} from '@/Shuffle-Core/components/HighlightedFileEditor';

export { detectCodeLanguage, highlightCodeSnippet };
export type { CodeLanguage };
export type DocCodeBlockProps = HighlightedFileEditorProps;

export const DocCodeBlock: React.FC<DocCodeBlockProps> = (props) => {
  return <HighlightedFileEditor {...props} />;
};

export default DocCodeBlock;
