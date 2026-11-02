import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  useTheme,
} from '@mui/material';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  MatchDecorator,
} from '@codemirror/view';
import {
  foldable,
  syntaxTree,
  foldAll,
  unfoldEffect,
  foldEffect,
  foldedRanges,
  HighlightStyle,
  syntaxHighlighting,
} from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { ShuffleHostProps } from '@/Shuffle-Core/host-props';
import { API_CONFIG, getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { toast } from '@/Shuffle-Core/toast';
import { useUserApiKey } from '@/Shuffle-Core/useUserApiKey';
import { deepParseJsonStrings } from '@/Shuffle-Core/components/ApiCallViewer';
import JsonView from 'react18-json-view';
import 'react18-json-view/src/style.css';
import 'react18-json-view/src/dark.css';
import { defaultCollapsed } from '@/lib/jsonView';

export type CodeLanguage =
  | 'python'
  | 'bash'
  | 'curl'
  | 'json'
  | 'yaml'
  | 'javascript'
  | 'typescript'
  | 'http'
  | 'code';

export type CodeBlockLanguage = CodeLanguage;

export interface HighlightedFileEditorProps extends ShuffleHostProps {
  /** Controlled raw content value (alias: `code`, `text`) */
  value?: string;
  /** Controlled change callback */
  onChange?: (value: string) => void;
  /** Initial raw code text when used in uncontrolled / block mode */
  code?: string;
  /** Initial raw code text alias */
  text?: string;
  /** Optional language tag (e.g. "python", "bash", "json", "yaml") */
  language?: string;
  /** Optional title override for the header bar */
  title?: string;
  /** Whether to validate JSON syntax and show status message (default: false unless explicitly passed) */
  validateJson?: boolean;
  /** Callback invoked when JSON validation state changes */
  onValidationChange?: (isValid: boolean) => void;
  /** Allow editing the file/code inline (default: true) */
  editable?: boolean;
  /**
   * Identifier used to remember which top-level JSON fields the user expanded or
   * collapsed. The same key reuses the same layout across incidents/sessions.
   */
  foldStateKey?: string;
  /** Force enable or disable the Run button (defaults to true for python, bash, curl in block mode) */
  runnable?: boolean;
  /** Whether to render the top header bar (language label, Copy, Run, Tree/Code toggle) */
  showHeader?: boolean;
  /** Minimum height of the editor scroller */
  minHeight?: number | string;
  /** Maximum height of the editor scroller */
  maxHeight?: number | string;
  /** Optional placeholder text when editor is empty */
  placeholder?: string;
  children?: React.ReactNode;
}

export type CodeBlockEditorProps = HighlightedFileEditorProps;

// Decorator that highlights $variable.path patterns inside strings
const variableMark = Decoration.mark({ class: 'cm-variable-token' });
const variableMatcher = new MatchDecorator({
  regexp: /\$[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*/g,
  decoration: () => variableMark,
});
const variableHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = variableMatcher.createDeco(view as any);
    }
    update(update: ViewUpdate) {
      this.decorations = variableMatcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

const jsonHighlight = HighlightStyle.define([
  { tag: t.propertyName, color: 'hsl(var(--foreground))' },
  { tag: t.string, color: 'hsl(var(--status-resolved))' },
  { tag: t.number, color: 'hsl(var(--infra-email))' },
  { tag: [t.bool, t.null], color: 'hsl(var(--destructive))', fontWeight: '500' },
  { tag: [t.brace, t.squareBracket], color: 'hsl(var(--severity-medium))', fontWeight: '600' },
  { tag: [t.punctuation, t.separator], color: 'hsl(var(--foreground-muted))' },
]);

const createEditorTheme = (minHeight: string, maxHeight: string) =>
  EditorView.theme(
    {
      '&': {
        backgroundColor: 'hsl(var(--background-elevated) / 0.98) !important',
        color: 'hsl(var(--foreground))',
        fontSize: '0.75rem',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-content': {
        fontFamily: 'JetBrains Mono, monospace',
        caretColor: 'hsl(var(--primary))',
        padding: '14px 0',
      },
      '.cm-line': {
        lineHeight: '1.6',
        padding: '0 14px',
      },
      '.cm-scroller': {
        minHeight,
        maxHeight,
        overflow: 'auto',
      },
      '.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
        backgroundColor: 'hsl(var(--primary) / 0.2) !important',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'hsl(var(--primary))',
        borderLeftWidth: '2px',
      },
      '.cm-activeLine': {
        backgroundColor: 'hsl(var(--secondary) / 0.45)',
      },
      '.cm-gutters': {
        backgroundColor: 'hsl(var(--background) / 0.8) !important',
        color: 'hsl(var(--foreground-muted))',
        border: 'none',
        paddingRight: '4px',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
        color: 'hsl(var(--foreground) / 0.55)',
      },
      '.cm-foldGutter': {
        color: 'hsl(var(--foreground-muted))',
      },
      '.cm-matchingBracket': {
        backgroundColor: 'hsl(var(--primary) / 0.2)',
        outline: '1px solid hsl(var(--primary) / 0.45)',
        color: 'hsl(var(--severity-medium))',
      },
      '.cm-variable-token': {
        color: 'hsl(var(--primary))',
        fontWeight: '600',
      },
    },
    { dark: true },
  );

const getJsonError = (value: string, validateJson: boolean): string | null => {
  if (!validateJson) return null;
  if (!value.trim()) return 'JSON is required';

  try {
    JSON.parse(value);
    return null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid JSON';
    const positionMatch = message.match(/position (\d+)/i);

    if (positionMatch) {
      const position = Number(positionMatch[1]);
      const line = value.slice(0, position).split('\n').length;
      return `Line ${line}: ${message}`;
    }

    return message;
  }
};

const FOLD_PREFS_PREFIX = 'shuffle-json-fold::';

const readFoldPrefs = (key: string): string[] | null => {
  try {
    const raw = localStorage.getItem(`${FOLD_PREFS_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : null;
  } catch {
    return null;
  }
};

const writeFoldPrefs = (key: string, expanded: string[]) => {
  try {
    localStorage.setItem(`${FOLD_PREFS_PREFIX}${key}`, JSON.stringify(expanded));
  } catch {
    /* storage unavailable */
  }
};

/** Foldable ranges for the values of every top-level property, keyed by field name. */
const collectTopLevelFields = (
  view: EditorView,
): Array<{ name: string; from: number; to: number }> => {
  const out: Array<{ name: string; from: number; to: number }> = [];
  const tree = syntaxTree(view.state);
  let rootFrom: number | null = null;

  tree.iterate({
    enter: (node) => {
      if (
        rootFrom === null &&
        (node.type.name === 'Object' || node.type.name === 'Array') &&
        node.node.parent?.type.name === 'JsonText'
      ) {
        rootFrom = node.from;
        return true;
      }
      if (rootFrom !== null && node.type.name === 'Property' && node.node.parent?.from === rootFrom) {
        const nameNode = node.node.firstChild;
        if (!nameNode) return false;
        const name = view.state.doc.sliceString(nameNode.from, nameNode.to).replace(/^"|"$/g, '');
        const line = view.state.doc.lineAt(node.from);
        const range = foldable(view.state, line.from, line.to);
        if (range) out.push({ name, from: range.from, to: range.to });
        return false;
      }
      return true;
    },
  });

  return out;
};

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const PY_KEYWORDS = new Set([
  'import', 'from', 'as', 'def', 'return', 'if', 'else', 'elif', 'for',
  'while', 'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False',
  'print', 'class', 'with', 'try', 'except', 'finally', 'raise', 'pass',
  'break', 'continue', 'lambda', 'yield', 'async', 'await', 'global',
]);

const JS_KEYWORDS = new Set([
  'import', 'from', 'export', 'default', 'const', 'let', 'var', 'function',
  'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break',
  'continue', 'new', 'class', 'extends', 'this', 'await', 'async',
  'true', 'false', 'null', 'undefined', 'typeof', 'in', 'of', 'try',
  'catch', 'finally', 'throw', 'interface', 'type',
]);

const BASH_KEYWORDS = new Set([
  'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done',
  'case', 'esac', 'function', 'return', 'exit', 'export', 'local',
  'echo', 'cd', 'pwd', 'ls', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'grep',
  'awk', 'sed', 'chmod', 'chown', 'sudo', 'docker', 'kubectl', 'curl',
  'systemctl', 'journalctl', 'apt', 'apt-get', 'yum', 'dnf', 'pip', 'npm',
]);

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

export function detectCodeLanguage(rawCode: string, fenceLang?: string): CodeLanguage {
  const norm = (fenceLang || '').trim().toLowerCase();
  if (norm === 'py' || norm === 'python' || norm === 'python3') return 'python';
  if (norm === 'sh' || norm === 'bash' || norm === 'shell' || norm === 'zsh' || norm === 'console') {
    const clean = rawCode.replace(/^(?:#[^\r\n]*\r?\n\s*)+/, '').trim();
    if (/^(?:\$\s*)?curl(?:\s+|$)/i.test(clean)) return 'curl';
    return 'bash';
  }
  if (norm === 'curl') return 'curl';
  if (norm === 'json' || norm === 'jsonc') return 'json';
  if (norm === 'yaml' || norm === 'yml') return 'yaml';
  if (norm === 'js' || norm === 'jsx' || norm === 'javascript') return 'javascript';
  if (norm === 'ts' || norm === 'tsx' || norm === 'typescript') return 'typescript';
  if (norm === 'http') return 'http';

  const trimmed = rawCode.trim();
  const clean = trimmed.replace(/^(?:#[^\r\n]*\r?\n\s*)+/, '').trim();

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not strict JSON
    }
  }

  if (/^(?:\$\s*)?curl(?:\s+|$)/i.test(clean)) {
    return 'curl';
  }

  if (
    /^(?:import\s+[\w.]+|from\s+[\w.]+\s+import\s+|def\s+\w+\s*\(|class\s+\w+|print\s*\(|if\s+__name__\s*==)/m.test(
      clean,
    ) ||
    /\b(?:requests\.(?:get|post|put|delete|request)|Singul\s*\(|shuffle\.run_|self\.(?:get_key|set_key|get_file|set_files))\b/.test(
      clean,
    )
  ) {
    return 'python';
  }

  if (
    /^#!\/bin\/(?:ba)?sh/m.test(trimmed) ||
    /^(?:\$\s+)?(?:sudo|docker|kubectl|systemctl|journalctl|apt-get|apt|chmod|chown|export)\s+/m.test(
      clean,
    )
  ) {
    return 'bash';
  }

  return norm ? (norm as CodeLanguage) : 'code';
}

/** Single-pass tokenizer-based syntax highlighter for dark and light modes. */
export function highlightCodeSnippet(code: string, lang: CodeLanguage, isDark = true): string {
  const COL = isDark
    ? {
        string: '#7ee787',
        keyword: '#d2a8ff',
        func: '#f2cc60',
        number: '#79c0ff',
        flag: '#79c0ff',
        builtin: '#ff7b72',
        comment: '#8b949e',
        headerKey: '#79c0ff',
        method: '#7ee787',
      }
    : {
        string: '#116329',
        keyword: '#8250df',
        func: '#953800',
        number: '#0550ae',
        flag: '#0550ae',
        builtin: '#cf222e',
        comment: '#57606a',
        headerKey: '#0550ae',
        method: '#116329',
      };

  const wrap = (color: string, text: string) =>
    `<span style="color:${color}">${escapeHtml(text)}</span>`;

  const out: string[] = [];
  let i = 0;
  const n = code.length;

  while (i < n) {
    const ch = code[i];

    if (
      (ch === '#' &&
        (lang === 'python' ||
          lang === 'bash' ||
          lang === 'yaml' ||
          lang === 'curl' ||
          lang === 'code')) ||
      (ch === '/' &&
        code[i + 1] === '/' &&
        (lang === 'javascript' || lang === 'typescript' || lang === 'json' || lang === 'code'))
    ) {
      let j = i;
      while (j < n && code[j] !== '\n') j++;
      out.push(wrap(COL.comment, code.slice(i, j)));
      i = j;
      continue;
    }

    if (
      lang === 'python' &&
      ((ch === '"' && code[i + 1] === '"' && code[i + 2] === '"') ||
        (ch === "'" && code[i + 1] === "'" && code[i + 2] === "'"))
    ) {
      const triple = code.slice(i, i + 3);
      let j = i + 3;
      while (j < n && code.slice(j, j + 3) !== triple) {
        if (code[j] === '\\' && j + 1 < n) j += 2;
        else j++;
      }
      j = Math.min(j + 3, n);
      out.push(wrap(COL.string, code.slice(i, j)));
      i = j;
      continue;
    }

    if (ch === '"' || ch === "'" || (ch === '`' && (lang === 'javascript' || lang === 'typescript'))) {
      const quote = ch;
      let j = i + 1;
      while (j < n && code[j] !== quote && (quote === '`' || code[j] !== '\n')) {
        if (code[j] === '\\' && j + 1 < n) j += 2;
        else j++;
      }
      if (j < n && code[j] === quote) j++;
      out.push(wrap(COL.string, code.slice(i, j)));
      i = j;
      continue;
    }

    if ((lang === 'curl' || lang === 'bash') && ch === '-' && (i === 0 || /\s/.test(code[i - 1]))) {
      let j = i + 1;
      if (code[j] === '-') j++;
      while (j < n && /[\w-]/.test(code[j])) j++;
      if (j > i + 1) {
        out.push(wrap(COL.flag, code.slice(i, j)));
        i = j;
        continue;
      }
    }

    if (
      (lang === 'bash' || lang === 'python' || lang === 'curl') &&
      ch === '$' &&
      /[A-Za-z_{]/.test(code[i + 1] || '')
    ) {
      let j = i + 1;
      if (code[j] === '{') {
        while (j < n && code[j] !== '}') j++;
        if (j < n) j++;
      } else {
        while (j < n && /[\w.#@-]/.test(code[j])) j++;
      }
      out.push(wrap(COL.flag, code.slice(i, j)));
      i = j;
      continue;
    }

    if (/\d/.test(ch) && (i === 0 || !/[\w]/.test(code[i - 1]))) {
      let j = i;
      while (j < n && /[\d._xXa-fA-F]/.test(code[j])) j++;
      out.push(wrap(COL.number, code.slice(i, j)));
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[\w]/.test(code[j])) j++;
      const word = code.slice(i, j);

      if (lang === 'python' && PY_KEYWORDS.has(word)) {
        out.push(wrap(COL.keyword, word));
      } else if ((lang === 'javascript' || lang === 'typescript') && JS_KEYWORDS.has(word)) {
        out.push(wrap(COL.keyword, word));
      } else if (lang === 'bash' && BASH_KEYWORDS.has(word)) {
        out.push(wrap(COL.keyword, word));
      } else if (
        (lang === 'json' || lang === 'yaml') &&
        (word === 'true' || word === 'false' || word === 'null')
      ) {
        out.push(wrap(COL.keyword, word));
      } else if (code[j] === '(') {
        out.push(wrap(COL.func, word));
      } else if (lang === 'curl' && word === 'curl') {
        out.push(wrap(COL.builtin, word));
      } else if (HTTP_METHODS.has(word.toUpperCase()) && (lang === 'http' || lang === 'curl')) {
        out.push(wrap(COL.method, word));
      } else if ((lang === 'http' || lang === 'yaml') && code[j] === ':') {
        out.push(wrap(COL.headerKey, word));
      } else {
        out.push(escapeHtml(word));
      }
      i = j;
      continue;
    }

    out.push(escapeHtml(ch));
    i++;
  }

  return out.join('');
}

function usePageDarkMode(fallbackDark: boolean): boolean {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : fallbackDark,
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    setIsDark(root.classList.contains('dark'));
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains('dark'));
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

export const HighlightedFileEditor: React.FC<HighlightedFileEditorProps> = ({
  value: controlledValue,
  onChange,
  code: codeProp,
  text,
  language,
  title,
  validateJson,
  onValidationChange,
  editable = true,
  foldStateKey,
  runnable,
  showHeader,
  minHeight,
  maxHeight,
  placeholder,
}) => {
  const isControlledMode = controlledValue !== undefined && onChange !== undefined;
  const shouldShowHeader = showHeader ?? !isControlledMode;
  const shouldValidateJson = validateJson ?? isControlledMode;

  const rawInput = controlledValue ?? codeProp ?? text ?? '';
  const theme = useTheme();
  const isDark = usePageDarkMode(theme.palette.mode === 'dark');

  let userKeyInfo: ReturnType<typeof useUserApiKey> | null = null;
  try {
    userKeyInfo = useUserApiKey();
  } catch {
    // Graceful fallback outside AuthProvider
  }

  const { apiKey, baseUrl: defaultBaseUrl, orgId } = userKeyInfo || {
    apiKey: null,
    maskedApiKey: '<API_KEY>',
    baseUrl: API_CONFIG.baseUrl || 'https://shuffle.security',
    orgId: null,
  };

  const initialCode = useMemo(() => {
    if (isControlledMode) return rawInput;
    const trimmed = rawInput.replace(/\r\n/g, '\n').replace(/\n$/, '');
    if (!defaultBaseUrl) return trimmed;
    return trimmed
      .replace(/https?:\/\/shuffler\.io(?=\/api\b)/gi, defaultBaseUrl)
      .replace(/https?:\/\/<endpoint>:<port>/gi, defaultBaseUrl);
  }, [rawInput, defaultBaseUrl, isControlledMode]);

  const [internalCode, setInternalCode] = useState<string>(initialCode);

  useEffect(() => {
    if (!isControlledMode) {
      setInternalCode(initialCode);
    }
  }, [initialCode, isControlledMode]);

  const currentCode = isControlledMode ? (controlledValue ?? '') : internalCode;

  const handleCodeChange = useCallback(
    (nextVal: string) => {
      if (isControlledMode) {
        onChange?.(nextVal);
      } else {
        setInternalCode(nextVal);
        onChange?.(nextVal);
      }
    },
    [isControlledMode, onChange],
  );

  const detectedLang = useMemo(
    () => detectCodeLanguage(currentCode, language || (shouldValidateJson ? 'json' : undefined)),
    [currentCode, language, shouldValidateJson],
  );

  const editorViewRef = useRef<EditorView | null>(null);
  const hasAutoFoldedRef = useRef(false);
  const jsonError = useMemo(
    () => getJsonError(currentCode, shouldValidateJson),
    [currentCode, shouldValidateJson],
  );
  const isValid = !shouldValidateJson || jsonError === null;

  const persistFoldState = useCallback(
    (view: EditorView) => {
      if (!foldStateKey) return;
      const fields = collectTopLevelFields(view);
      if (!fields.length) return;
      const folded = foldedRanges(view.state);
      const expanded: string[] = [];
      for (const field of fields) {
        let isFolded = false;
        folded.between(field.from, field.to, (from, to) => {
          if (from === field.from && to === field.to) {
            isFolded = true;
            return false;
          }
          return undefined;
        });
        if (!isFolded) expanded.push(field.name);
      }
      writeFoldPrefs(foldStateKey, expanded);
    },
    [foldStateKey],
  );

  const autoFoldNested = useCallback(
    (view: EditorView, attempt = 0) => {
      if (hasAutoFoldedRef.current) return;

      let topLevelStart: number | null = null;
      const tree = syntaxTree(view.state);

      tree.iterate({
        enter: (node) => {
          if (
            topLevelStart === null &&
            (node.type.name === 'Object' || node.type.name === 'Array') &&
            node.node.parent?.type.name === 'JsonText'
          ) {
            topLevelStart = node.from;
            return false;
          }
          return undefined;
        },
      });

      if (topLevelStart === null) {
        if (attempt < 50) {
          setTimeout(() => autoFoldNested(view, attempt + 1), 100);
        }
        return;
      }

      foldAll(view);

      const topLevelLine = view.state.doc.lineAt(topLevelStart);
      const topLevelRange = foldable(view.state, topLevelLine.from, topLevelLine.to);

      if (topLevelRange) {
        view.dispatch({
          effects: unfoldEffect.of({ from: topLevelRange.from, to: topLevelRange.to }),
        });

        const prefs = foldStateKey ? readFoldPrefs(foldStateKey) : null;
        if (prefs) {
          const fields = collectTopLevelFields(view);
          const effects = fields
            .filter((field) => prefs.includes(field.name))
            .map((field) => unfoldEffect.of({ from: field.from, to: field.to }));
          const collapse = fields
            .filter((field) => !prefs.includes(field.name))
            .map((field) => foldEffect.of({ from: field.from, to: field.to }));
          if (effects.length || collapse.length) {
            view.dispatch({ effects: [...collapse, ...effects] });
          }
        }

        hasAutoFoldedRef.current = true;
        return;
      }

      if (attempt < 50) {
        setTimeout(() => autoFoldNested(view, attempt + 1), 100);
      }
    },
    [foldStateKey],
  );

  useEffect(() => {
    onValidationChange?.(isValid);
  }, [isValid, onValidationChange]);

  useEffect(() => {
    if (!editorViewRef.current || hasAutoFoldedRef.current || !currentCode.trim()) return;
    if (detectedLang === 'json' || shouldValidateJson) {
      autoFoldNested(editorViewRef.current);
    }
  }, [currentCode, autoFoldNested, detectedLang, shouldValidateJson]);

  const resolvedMinHeight = useMemo(() => {
    if (minHeight !== undefined) {
      return typeof minHeight === 'number' ? `${minHeight}px` : minHeight;
    }
    if (!shouldShowHeader) return '320px';
    const lineCount = Math.max(currentCode.split('\n').length, 1);
    const calculated = lineCount * 20.8 + 28;
    return `${Math.min(Math.max(calculated, 56), 380)}px`;
  }, [minHeight, shouldShowHeader, currentCode]);

  const resolvedMaxHeight = useMemo(() => {
    if (maxHeight !== undefined) {
      return typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight;
    }
    return shouldShowHeader ? '420px' : '70vh';
  }, [maxHeight, shouldShowHeader]);

  const cmTheme = useMemo(
    () => createEditorTheme(resolvedMinHeight, resolvedMaxHeight),
    [resolvedMinHeight, resolvedMaxHeight],
  );

  const extensions = useMemo(() => {
    const base = [
      ...(detectedLang === 'json' || shouldValidateJson
        ? [json(), syntaxHighlighting(jsonHighlight)]
        : []),
      variableHighlighter,
      EditorView.lineWrapping,
    ];
    if (!foldStateKey) return base;
    return [
      ...base,
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (!hasAutoFoldedRef.current) return;
        const changedFold = update.transactions.some((tr) =>
          tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect)),
        );
        if (changedFold) persistFoldState(update.view);
      }),
    ];
  }, [foldStateKey, persistFoldState, detectedLang, shouldValidateJson]);

  // Block-mode features (Header, Copy, Run, JSON Tree View)
  const parsedJson = useMemo(() => {
    if (!shouldShowHeader || detectedLang !== 'json') return null;
    try {
      const parsed = JSON.parse(currentCode.trim());
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }, [shouldShowHeader, detectedLang, currentCode]);

  const [jsonViewMode, setJsonViewMode] = useState<'tree' | 'code'>('tree');
  const [copied, setCopied] = useState(false);

  const [isRunning, setIsRunning] = useState(false);
  const [responseOutput, setResponseOutput] = useState<string | null>(null);
  const [parsedResponse, setParsedResponse] = useState<any | null>(null);
  const [responseStatus, setResponseStatus] = useState<string | null>(null);
  const [responseDuration, setResponseDuration] = useState<number | null>(null);
  const [isResponseOpen, setIsResponseOpen] = useState(false);
  const [responseViewMode, setResponseViewMode] = useState<'tree' | 'raw'>('tree');

  const isExecutable = useMemo(() => {
    if (runnable !== undefined) return runnable;
    if (!shouldShowHeader) return false;
    return detectedLang === 'python' || detectedLang === 'bash' || detectedLang === 'curl';
  }, [runnable, shouldShowHeader, detectedLang]);

  const isModified = !isControlledMode && currentCode !== initialCode;

  const substituteRuntimeCredentials = useCallback(
    (raw: string) => {
      let out = raw;
      const effectiveToken = apiKey || API_CONFIG.apiKey || null;
      if (effectiveToken) {
        out = out.replace(
          /\b(?:YOUR_API_KEY|YOUR_TOKEN|<API_KEY>|<APIKEY>|APIKEY|<your-api-key>)\b/g,
          effectiveToken,
        );
      }
      if (orgId) {
        out = out.replace(/\b(?:<ORG_ID>|<ORGID>|ORGID|<org_id>)\b/g, orgId);
      }
      if (defaultBaseUrl) {
        out = out
          .replace(/https?:\/\/shuffler\.io/gi, defaultBaseUrl)
          .replace(/https?:\/\/<endpoint>:<port>/gi, defaultBaseUrl);
      }
      return out;
    },
    [apiKey, orgId, defaultBaseUrl],
  );

  const handleCopy = useCallback(async () => {
    try {
      const toCopy = substituteRuntimeCredentials(currentCode);
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(toCopy);
      }
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed');
    }
  }, [currentCode, substituteRuntimeCredentials]);

  const handleRun = useCallback(async () => {
    if (!currentCode.trim() || isRunning) return;
    setIsRunning(true);
    setIsResponseOpen(true);
    setResponseStatus(null);
    setResponseOutput(null);
    setParsedResponse(null);
    const start = Date.now();

    try {
      const runnableCode = substituteRuntimeCredentials(currentCode);
      const isCurl =
        detectedLang === 'curl' || /^(?:\$\s*)?curl(?:\s+|$)/i.test(runnableCode.trim());
      const isBash = !isCurl && detectedLang === 'bash';

      const runnerPayload = isCurl
        ? {
            name: 'curl',
            app_id: 'ebfe7d5c80000676588f86731db0a555',
            environment: 'Cloud',
            parameters: [
              {
                name: 'statement',
                value: runnableCode,
                schema: { type: 'string' },
              },
            ],
            app_name: 'http',
            app_version: '1.4.0',
          }
        : isBash
          ? {
              name: 'execute_bash',
              app_id: '3e2bdf9d5069fe3f4746c29d68785a6a',
              environment: 'Cloud',
              parameters: [
                {
                  name: 'code',
                  value: runnableCode,
                  schema: { type: 'string' },
                },
                {
                  name: 'shuffle_input',
                  value: '',
                  schema: { type: 'string' },
                },
              ],
              app_name: 'Shuffle Tools',
              app_version: '1.2.0',
            }
          : {
              name: 'execute_python',
              app_id: '3e2bdf9d5069fe3f4746c29d68785a6a',
              environment: 'Cloud',
              parameters: [
                {
                  name: 'code',
                  value: runnableCode,
                  schema: { type: 'string' },
                },
              ],
              app_name: 'Shuffle Tools',
              app_version: '1.2.0',
            };

      const endpoint = isCurl
        ? '/api/v1/apps/http/run?delete=true'
        : '/api/v1/apps/3e2bdf9d5069fe3f4746c29d68785a6a/run?delete=true';

      const res = await fetch(getApiUrl(endpoint), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(runnerPayload),
      });

      const duration = Date.now() - start;
      setResponseDuration(duration);

      const data = await res.json();
      const rawResult = data?.result;

      let parsed: any = null;
      if (typeof rawResult === 'string') {
        try {
          parsed = JSON.parse(rawResult);
        } catch {
          parsed = null;
        }
      } else if (rawResult && typeof rawResult === 'object') {
        parsed = rawResult;
      } else if (data && typeof data === 'object' && rawResult === undefined) {
        parsed = data;
      }

      const formatted =
        parsed && typeof parsed === 'object'
          ? JSON.stringify(parsed, null, 2)
          : typeof rawResult === 'string' && rawResult.trim().length > 0
            ? rawResult
            : JSON.stringify(data, null, 2);

      setResponseOutput(formatted);
      setParsedResponse(parsed && typeof parsed === 'object' ? parsed : null);

      const isSuccess =
        res.ok && data?.success !== false && (!parsed || parsed.success !== false);

      setResponseStatus(isSuccess ? `Status: ${res.status} OK` : `Status: ${res.status} Error`);

      if (isSuccess) {
        toast.success(`Executed in ${duration}ms`);
      } else {
        toast.error(parsed?.reason || data?.reason || 'Execution finished with error');
      }
    } catch (err: any) {
      setResponseDuration(Date.now() - start);
      setResponseStatus('Execution Failed');
      setResponseOutput(err?.message || 'Network error executing code');
      setParsedResponse(null);
      toast.error('Failed to execute code');
    } finally {
      setIsRunning(false);
    }
  }, [currentCode, isRunning, detectedLang, substituteRuntimeCredentials]);

  const langLabel = useMemo(() => {
    if (title) return title;
    switch (detectedLang) {
      case 'python':
        return 'Python';
      case 'bash':
        return 'Bash';
      case 'curl':
        return 'cURL';
      case 'json':
        return 'JSON';
      case 'yaml':
        return 'YAML';
      case 'javascript':
        return 'JavaScript';
      case 'typescript':
        return 'TypeScript';
      case 'http':
        return 'HTTP';
      default:
        return language || 'Code';
    }
  }, [title, detectedLang, language]);

  return (
    <Box
      className="not-prose"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        ...(shouldShowHeader ? { my: 2.5 } : {}),
      }}
    >
      <Box
        sx={{
          borderRadius: 1.5,
          overflow: 'hidden',
          border: `1px solid ${
            jsonError ? 'hsl(var(--destructive) / 0.6)' : 'hsl(var(--border))'
          }`,
          transition: 'border-color 0.2s ease',
          '& .cm-editor': {
            backgroundColor: 'hsl(var(--background-elevated) / 0.98) !important',
          },
          '& .cm-scroller': {
            backgroundColor: 'transparent !important',
          },
          '& .cm-gutters': {
            backgroundColor: 'hsl(var(--background) / 0.8) !important',
          },
        }}
      >
        {shouldShowHeader && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 1,
              rowGap: 0.75,
              px: { xs: 1.25, sm: 2 },
              py: 0.85,
              borderBottom: '1px solid hsl(var(--border))',
              bgcolor: 'hsl(var(--muted) / 0.45)',
            }}
          >
            <Typography
              sx={{
                fontSize: '0.7rem',
                fontWeight: 600,
                color: 'hsl(var(--muted-foreground))',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontFamily: "'JetBrains Mono', monospace",
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {langLabel}
            </Typography>

            {editable && detectedLang !== 'json' && (
              <Typography
                sx={{
                  fontSize: '0.62rem',
                  color: 'hsl(var(--muted-foreground))',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {isModified ? 'Edited' : 'Editable'}
              </Typography>
            )}

            <Box sx={{ flex: 1 }} />

            {parsedJson && (
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  p: 0.25,
                  borderRadius: 1,
                  bgcolor: 'hsl(var(--muted) / 0.6)',
                  border: '1px solid hsl(var(--border))',
                }}
              >
                {(['tree', 'code'] as const).map((m) => {
                  const active = jsonViewMode === m;
                  return (
                    <Box
                      key={m}
                      onClick={() => setJsonViewMode(m)}
                      sx={{
                        height: 20,
                        px: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 0.75,
                        fontSize: '0.62rem',
                        fontWeight: active ? 700 : 500,
                        cursor: 'pointer',
                        userSelect: 'none',
                        transition: 'all 0.15s ease',
                        bgcolor: active ? 'hsl(var(--background))' : 'transparent',
                        color: active
                          ? 'hsl(var(--foreground))'
                          : 'hsl(var(--muted-foreground))',
                      }}
                    >
                      {m === 'tree' ? 'Tree' : 'Code'}
                    </Box>
                  );
                })}
              </Box>
            )}

            {isModified && (
              <Button
                size="small"
                variant="text"
                onClick={() => handleCodeChange(initialCode)}
                sx={{
                  height: 22,
                  minWidth: 0,
                  px: 1,
                  fontSize: '0.65rem',
                  fontWeight: 500,
                  textTransform: 'none',
                  color: 'hsl(var(--muted-foreground))',
                  '&:hover': { color: 'hsl(var(--foreground))' },
                }}
              >
                Reset
              </Button>
            )}

            <Button
              size="small"
              variant="outlined"
              onClick={handleCopy}
              sx={{
                height: 22,
                minWidth: 46,
                px: 1,
                fontSize: '0.65rem',
                fontWeight: 600,
                textTransform: 'none',
                borderRadius: 1,
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--foreground))',
                bgcolor: 'hsl(var(--background))',
                '&:hover': {
                  borderColor: 'hsl(var(--primary) / 0.5)',
                  bgcolor: 'hsl(var(--muted) / 0.4)',
                },
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>

            {isExecutable && (
              <Button
                size="small"
                variant="contained"
                disableElevation
                onClick={handleRun}
                disabled={isRunning}
                sx={{
                  height: 22,
                  minWidth: 46,
                  px: 1.25,
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: 1,
                  bgcolor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  '&:hover': {
                    bgcolor: 'hsl(var(--primary) / 0.9)',
                  },
                  '&.Mui-disabled': {
                    bgcolor: 'hsl(var(--primary) / 0.5)',
                    color: 'hsl(var(--primary-foreground) / 0.8)',
                  },
                }}
              >
                {isRunning ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CircularProgress size={10} color="inherit" />
                    <span>Running</span>
                  </Box>
                ) : (
                  'Run'
                )}
              </Button>
            )}
          </Box>
        )}

        {parsedJson && jsonViewMode === 'tree' ? (
          <Box
            sx={{
              p: 1.5,
              maxHeight: 340,
              overflow: 'auto',
              bgcolor: 'hsl(var(--background-elevated) / 0.98)',
              color: 'hsl(var(--foreground))',
              fontFamily: "'JetBrains Mono', monospace",
              '& .json-view': {
                fontSize: '0.75rem !important',
                fontFamily: 'inherit !important',
                bgcolor: 'transparent !important',
              },
            }}
          >
            <JsonView
              src={deepParseJsonStrings(parsedJson)}
              dark={isDark}
              collapsed={defaultCollapsed}
              collapseStringMode="word"
              collapseStringsAfterLength={120}
              enableClipboard
              displaySize
            />
          </Box>
        ) : (
          <CodeMirror
            value={currentCode}
            onChange={handleCodeChange}
            placeholder={placeholder}
            theme={cmTheme}
            extensions={extensions}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              bracketMatching: true,
            }}
            editable={editable}
            onCreateEditor={useCallback(
              (view: EditorView) => {
                editorViewRef.current = view;
                hasAutoFoldedRef.current = false;
                if (detectedLang === 'json' || shouldValidateJson) {
                  autoFoldNested(view);
                }
              },
              [autoFoldNested, detectedLang, shouldValidateJson],
            )}
          />
        )}

        {/* Collapsible Execution Response Drawer */}
        {shouldShowHeader && (
          <Collapse in={isResponseOpen}>
            <Box
              sx={{
                borderTop: '1px solid hsl(var(--border))',
                bgcolor: 'hsl(var(--card) / 0.4)',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 1,
                  px: 1.5,
                  py: 0.75,
                  borderBottom: '1px solid hsl(var(--border) / 0.5)',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography
                    sx={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      color: 'hsl(var(--muted-foreground))',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Response
                  </Typography>
                  {responseStatus && (
                    <Chip
                      label={responseStatus}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        fontFamily: "'JetBrains Mono', monospace",
                        borderRadius: 0.75,
                        bgcolor: responseStatus.includes('OK')
                          ? 'hsla(var(--severity-low) / 0.15)'
                          : 'hsla(var(--severity-critical) / 0.15)',
                        color: responseStatus.includes('OK')
                          ? 'hsl(var(--severity-low))'
                          : 'hsl(var(--severity-critical))',
                        border: '1px solid',
                        borderColor: responseStatus.includes('OK')
                          ? 'hsla(var(--severity-low) / 0.3)'
                          : 'hsla(var(--severity-critical) / 0.3)',
                        '& .MuiChip-label': { px: 0.5 },
                      }}
                    />
                  )}
                  {responseDuration !== null && (
                    <Typography
                      sx={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.65rem',
                        color: 'hsl(var(--muted-foreground))',
                      }}
                    >
                      {responseDuration}ms
                    </Typography>
                  )}
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  {parsedResponse && (
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        p: 0.25,
                        borderRadius: 0.75,
                        bgcolor: 'hsl(var(--muted) / 0.5)',
                        border: '1px solid hsl(var(--border))',
                      }}
                    >
                      {(['tree', 'raw'] as const).map((view) => {
                        const active = responseViewMode === view;
                        return (
                          <Box
                            key={view}
                            onClick={() => setResponseViewMode(view)}
                            sx={{
                              height: 18,
                              px: 0.75,
                              display: 'flex',
                              alignItems: 'center',
                              borderRadius: 0.5,
                              fontSize: '0.6rem',
                              fontWeight: active ? 700 : 500,
                              cursor: 'pointer',
                              userSelect: 'none',
                              bgcolor: active ? 'hsl(var(--background))' : 'transparent',
                              color: active
                                ? 'hsl(var(--foreground))'
                                : 'hsl(var(--muted-foreground))',
                            }}
                          >
                            {view === 'tree' ? 'JSON' : 'Raw'}
                          </Box>
                        );
                      })}
                    </Box>
                  )}

                  {responseOutput && (
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => {
                        try {
                          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                            navigator.clipboard.writeText(responseOutput);
                          }
                          toast.success('Response copied');
                        } catch {
                          toast.error('Copy failed');
                        }
                      }}
                      sx={{
                        height: 20,
                        fontSize: '0.62rem',
                        fontWeight: 500,
                        textTransform: 'none',
                        color: 'hsl(var(--muted-foreground))',
                        px: 0.75,
                        minWidth: 0,
                        '&:hover': {
                          color: 'hsl(var(--foreground))',
                        },
                      }}
                    >
                      Copy
                    </Button>
                  )}

                  <Button
                    size="small"
                    variant="text"
                    onClick={() => setIsResponseOpen(false)}
                    sx={{
                      height: 20,
                      fontSize: '0.62rem',
                      fontWeight: 500,
                      textTransform: 'none',
                      color: 'hsl(var(--muted-foreground))',
                      px: 0.75,
                      minWidth: 0,
                      '&:hover': {
                        color: 'hsl(var(--foreground))',
                      },
                    }}
                  >
                    Close
                  </Button>
                </Box>
              </Box>

              <Box
                sx={{
                  p: 1.5,
                  maxHeight: 260,
                  overflow: 'auto',
                  fontFamily: "'JetBrains Mono', monospace",
                  bgcolor: 'hsl(var(--background-elevated) / 0.98)',
                  color: 'hsl(var(--foreground))',
                }}
              >
                {isRunning ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                    <CircularProgress size={12} color="inherit" />
                    <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))' }}>
                      Executing in Shuffle...
                    </Typography>
                  </Box>
                ) : parsedResponse && responseViewMode === 'tree' ? (
                  <Box
                    sx={{
                      '& .json-view': {
                        fontSize: '0.72rem !important',
                        fontFamily: "'JetBrains Mono', monospace !important",
                        bgcolor: 'transparent !important',
                      },
                    }}
                  >
                    <JsonView
                      src={deepParseJsonStrings(parsedResponse)}
                      dark={isDark}
                      collapsed={defaultCollapsed}
                      collapseStringMode="word"
                      collapseStringsAfterLength={120}
                      enableClipboard
                      displaySize
                    />
                  </Box>
                ) : (
                  <Box
                    component="div"
                    sx={{
                      m: 0,
                      fontSize: '0.72rem',
                      fontFamily: 'inherit',
                      color: 'hsl(var(--foreground))',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      lineHeight: 1.5,
                    }}
                  >
                    {responseOutput}
                  </Box>
                )}
              </Box>
            </Box>
          </Collapse>
        )}
      </Box>

      {jsonError ? (
        <Typography
          variant="caption"
          sx={{
            color: 'hsl(var(--destructive))',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.7rem',
            mt: 0.5,
            px: 1,
          }}
        >
          Invalid JSON: {jsonError}
        </Typography>
      ) : (
        shouldValidateJson && (
          <Typography
            variant="caption"
            sx={{
              color: 'hsl(var(--primary))',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.7rem',
              mt: 0.5,
              px: 1,
            }}
          >
            Valid JSON
          </Typography>
        )
      )}
    </Box>
  );
};

export const CodeBlockEditor = HighlightedFileEditor;
export default HighlightedFileEditor;
