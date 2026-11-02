/**
 * CodeBlockEditor — Standardized interactive code editor and executor used
 * across Documentation, Markdown rendering, and Shuffle-Core surfaces.
 *
 * Features:
 * - Line-numbered, syntax-highlighted editable code area
 * - Auto-detection for Python, Bash/Shell, cURL, and JSON
 * - Live execution for Python (`execute_python` via Shuffle Tools),
 *   Bash/Shell (`execute_bash` via Shuffle Tools), and cURL (`http` app)
 * - Automatic substitution of `<API_KEY>` / `APIKEY` / `https://shuffler.io`
 *   with the authenticated user's credentials and regional backend URL
 * - Collapsible Response panel with collapsible JSON tree (`JsonView`) and Raw view
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Box, Typography, Button, Chip, CircularProgress, Collapse, useTheme } from '@mui/material';
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

export interface CodeBlockEditorProps extends ShuffleHostProps {
  /** Initial raw code text (alias: `text`) */
  code?: string;
  /** Initial raw code text */
  text?: string;
  /** Optional language tag from the markdown fence (e.g. "python", "bash", "json") */
  language?: string;
  /** Optional title override for the header bar */
  title?: string;
  /** Force enable or disable the Run button (defaults to true for python, bash, curl) */
  runnable?: boolean;
  /** Allow editing the code inline (default: true) */
  editable?: boolean;
  children?: React.ReactNode;
}

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

  // Check JSON
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

  // Check cURL
  if (/^(?:\$\s*)?curl(?:\s+|$)/i.test(clean)) {
    return 'curl';
  }

  // Check Python heuristics
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

  // Check Bash heuristics
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

    // Line comments (# for python/bash/yaml/curl, // for js/ts)
    if (
      (ch === '#' && (lang === 'python' || lang === 'bash' || lang === 'yaml' || lang === 'curl' || lang === 'code')) ||
      (ch === '/' && code[i + 1] === '/' && (lang === 'javascript' || lang === 'typescript' || lang === 'json' || lang === 'code'))
    ) {
      let j = i;
      while (j < n && code[j] !== '\n') j++;
      out.push(wrap(COL.comment, code.slice(i, j)));
      i = j;
      continue;
    }

    // Triple-quoted strings in Python
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

    // Standard strings
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

    // CLI flags (-X, --header)
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

    // Shell / Shuffle variables ($VAR)
    if ((lang === 'bash' || lang === 'python' || lang === 'curl') && ch === '$' && /[A-Za-z_{]/.test(code[i + 1] || '')) {
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

    // Numbers
    if (/\d/.test(ch) && (i === 0 || !/[\w]/.test(code[i - 1]))) {
      let j = i;
      while (j < n && /[\d._xXa-fA-F]/.test(code[j])) j++;
      out.push(wrap(COL.number, code.slice(i, j)));
      i = j;
      continue;
    }

    // Identifiers & keywords
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
      } else if ((lang === 'json' || lang === 'yaml') && (word === 'true' || word === 'false' || word === 'null')) {
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

export const CodeBlockEditor: React.FC<CodeBlockEditorProps> = ({
  code: codeProp,
  text,
  language,
  title,
  runnable,
  editable = true,
}) => {
  const rawInput = codeProp ?? text ?? '';
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
    const trimmed = rawInput.replace(/\r\n/g, '\n').replace(/\n$/, '');
    if (!defaultBaseUrl) return trimmed;
    return trimmed
      .replace(/https?:\/\/shuffler\.io(?=\/api\b)/gi, defaultBaseUrl)
      .replace(/https?:\/\/<endpoint>:<port>/gi, defaultBaseUrl);
  }, [rawInput, defaultBaseUrl]);

  const detectedLang = useMemo(
    () => detectCodeLanguage(initialCode, language),
    [initialCode, language],
  );

  const parsedJson = useMemo(() => {
    if (detectedLang !== 'json') return null;
    try {
      const parsed = JSON.parse(initialCode.trim());
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }, [detectedLang, initialCode]);

  const [code, setCode] = useState<string>(initialCode);
  const [jsonViewMode, setJsonViewMode] = useState<'tree' | 'code'>('tree');
  const [copied, setCopied] = useState(false);

  const [isRunning, setIsRunning] = useState(false);
  const [responseOutput, setResponseOutput] = useState<string | null>(null);
  const [parsedResponse, setParsedResponse] = useState<any | null>(null);
  const [responseStatus, setResponseStatus] = useState<string | null>(null);
  const [responseDuration, setResponseDuration] = useState<number | null>(null);
  const [isResponseOpen, setIsResponseOpen] = useState(false);
  const [responseViewMode, setResponseViewMode] = useState<'tree' | 'raw'>('tree');

  const preRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);

  const isExecutable = useMemo(() => {
    if (runnable !== undefined) return runnable;
    return detectedLang === 'python' || detectedLang === 'bash' || detectedLang === 'curl';
  }, [runnable, detectedLang]);

  const isModified = code !== initialCode;

  const lineCount = useMemo(() => Math.max(code.split('\n').length, 1), [code]);

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
      const toCopy = substituteRuntimeCredentials(code);
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(toCopy);
      }
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed');
    }
  }, [code, substituteRuntimeCredentials]);

  const handleRun = useCallback(async () => {
    if (!code.trim() || isRunning) return;
    setIsRunning(true);
    setIsResponseOpen(true);
    setResponseStatus(null);
    setResponseOutput(null);
    setParsedResponse(null);
    const start = Date.now();

    try {
      const runnableCode = substituteRuntimeCredentials(code);
      const isCurl = detectedLang === 'curl' || /^(?:\$\s*)?curl(?:\s+|$)/i.test(runnableCode.trim());
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
        res.ok &&
        data?.success !== false &&
        (!parsed || parsed.success !== false);

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
  }, [code, isRunning, detectedLang, substituteRuntimeCredentials]);

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

  const editorHeight = useMemo(() => {
    const calculated = lineCount * 20.8 + 24;
    return Math.min(Math.max(calculated, 56), 380);
  }, [lineCount]);

  return (
    <Box
      className="not-prose"
      sx={{
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.14)',
        bgcolor: isDark ? '#0d1117' : '#ffffff',
        color: isDark ? '#e6edf3' : '#1f2328',
        overflow: 'hidden',
        my: 2.5,
      }}
    >
      {/* Header bar — matches ApiCallViewer */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 0.85,
          borderBottom: '1px solid',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.1)',
          bgcolor: isDark ? '#161b22' : '#f6f8fa',
        }}
      >
        <Typography
          sx={{
            fontSize: '0.7rem',
            fontWeight: 600,
            color: isDark ? '#8b949e' : '#57606a',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {langLabel}
        </Typography>

        {editable && detectedLang !== 'json' && (
          <Typography
            sx={{
              fontSize: '0.62rem',
              color: isDark ? '#7d8590' : '#656d76',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {isModified ? 'Edited' : 'Editable'}
          </Typography>
        )}

        <Box sx={{ flex: 1 }} />

        {/* JSON Tree / Code view toggle */}
        {parsedJson && (
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              p: 0.25,
              borderRadius: 1,
              bgcolor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.06)',
              border: '1px solid',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.12)',
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
                    bgcolor: active ? (isDark ? '#0d1117' : '#ffffff') : 'transparent',
                    color: active
                      ? isDark
                        ? '#f0f6fc'
                        : '#1f2328'
                      : isDark
                        ? '#8b949e'
                        : '#57606a',
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
            onClick={() => setCode(initialCode)}
            sx={{
              height: 22,
              minWidth: 0,
              px: 1,
              fontSize: '0.65rem',
              fontWeight: 500,
              textTransform: 'none',
              color: isDark ? '#8b949e' : '#57606a',
              '&:hover': { color: isDark ? '#f0f6fc' : '#1f2328' },
            }}
          >
            Reset
          </Button>
        )}

        {/* Copy button */}
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
            borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(15, 23, 42, 0.16)',
            color: isDark ? '#e6edf3' : '#1f2328',
            bgcolor: isDark ? '#0d1117' : '#ffffff',
            '&:hover': {
              borderColor: 'hsl(var(--primary) / 0.5)',
              bgcolor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.04)',
            },
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>

        {/* Run button for executable languages */}
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

      {/* Main Body: JSON Tree or Editable Code Area */}
      {parsedJson && jsonViewMode === 'tree' ? (
        <Box
          sx={{
            p: 1.5,
            maxHeight: 340,
            overflow: 'auto',
            bgcolor: isDark ? '#0d1117' : '#ffffff',
            color: isDark ? '#e6edf3' : '#1f2328',
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
        <Box
          sx={{
            display: 'flex',
            minHeight: editorHeight,
            maxHeight: 420,
            bgcolor: isDark ? '#0d1117' : '#ffffff',
            color: isDark ? '#e6edf3' : '#1f2328',
          }}
        >
          {/* Line numbers gutter */}
          <Box
            aria-hidden
            sx={{
              userSelect: 'none',
              py: 1.5,
              pl: 1.25,
              pr: 1,
              textAlign: 'right',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.75rem',
              lineHeight: '20.8px',
              color: isDark ? '#7d8590' : '#57606a',
              borderRight: '1px solid',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)',
              bgcolor: isDark ? '#13171e' : '#f8f9fb',
              minWidth: 36,
              overflow: 'hidden',
            }}
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </Box>

          {/* Highlighted layer + transparent editable textarea */}
          <Box
            sx={{
              flex: 1,
              position: 'relative',
              minHeight: editorHeight,
              overflow: 'hidden',
              bgcolor: isDark ? '#0d1117' : '#ffffff',
            }}
          >
            <Box
              ref={preRef}
              aria-hidden
              sx={{
                position: 'absolute',
                inset: 0,
                m: 0,
                p: 1.5,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.75rem',
                lineHeight: '20.8px',
                color: isDark ? '#e6edf3' : '#1f2328',
                whiteSpace: 'pre',
                pointerEvents: 'none',
                overflow: 'hidden',
              }}
              dangerouslySetInnerHTML={{
                __html: highlightCodeSnippet(code, detectedLang, isDark) + '\n',
              }}
            />
            <Box
              component="textarea"
              value={code}
              readOnly={!editable}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCode(e.target.value)}
              onScroll={(e: React.UIEvent<HTMLTextAreaElement>) => {
                if (preRef.current) {
                  preRef.current.scrollTop = e.currentTarget.scrollTop;
                  preRef.current.scrollLeft = e.currentTarget.scrollLeft;
                }
              }}
              spellCheck={false}
              sx={{
                position: 'relative',
                width: '100%',
                height: '100%',
                minHeight: editorHeight,
                maxHeight: 420,
                resize: 'vertical',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.75rem',
                lineHeight: '20.8px',
                color: 'transparent',
                WebkitTextFillColor: 'transparent',
                bgcolor: 'transparent',
                border: 'none',
                p: 1.5,
                m: 0,
                outline: 'none',
                caretColor: 'hsl(var(--primary))',
                whiteSpace: 'pre',
                overflow: 'auto',
                '&::selection': {
                  color: 'transparent',
                  WebkitTextFillColor: 'transparent',
                  bgcolor: 'hsl(var(--primary) / 0.28)',
                },
              }}
            />
          </Box>
        </Box>
      )}

      {/* Collapsible Execution Response Drawer */}
      <Collapse in={isResponseOpen}>
        <Box
          sx={{
            borderTop: '1px solid hsl(var(--border))',
            bgcolor: 'hsl(var(--card) / 0.4)',
          }}
        >
          {/* Response toolbar */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
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
                          color: active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
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

          {/* Response output */}
          <Box
            sx={{
              p: 1.5,
              maxHeight: 260,
              overflow: 'auto',
              fontFamily: "'JetBrains Mono', monospace",
              bgcolor: isDark ? '#0d1117' : '#ffffff',
              color: isDark ? '#e6edf3' : '#1f2328',
            }}
          >
            {isRunning ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                <CircularProgress size={12} color="inherit" />
                <Typography sx={{ fontSize: '0.72rem', color: isDark ? '#8b949e' : '#57606a' }}>
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
                  color: isDark ? '#e6edf3' : '#1f2328',
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
    </Box>
  );
};

export default CodeBlockEditor;
