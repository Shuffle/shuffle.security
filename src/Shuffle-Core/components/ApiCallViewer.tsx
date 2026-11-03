/**
 * ApiCallViewer — Standardized, compact API call inspector and test runner.
 * Used across App Integrations and Documentation.
 *
 * Supports switching between cURL, Python, HTTP, and JSON payload inspection,
 * live testing via Shuffle HTTP app, and collapsible JSON parsing via JsonView.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Box, Typography, Button, Chip, CircularProgress, Collapse, useTheme } from '@mui/material';
import type { ShuffleHostProps } from '@/Shuffle-Core/host-props';
import { API_CONFIG, getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { toast } from '@/Shuffle-Core/toast';
import { useUserApiKey } from '@/Shuffle-Core/useUserApiKey';
import {
  useShuffleCoreTheme,
  readHtmlDarkClass,
} from '@/Shuffle-Core/components/ShuffleCoreThemeProvider';
import JsonView from 'react18-json-view';
import 'react18-json-view/src/style.css';
import 'react18-json-view/src/dark.css';
import { defaultCollapsed } from '@/lib/jsonView';

export interface ApiCallConfig {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface ParsedCurl {
  method: string;
  url: string;
  headers: Array<{ key: string; value: string }>;
  bodyJson: any | null;
  rawBody: string | null;
  otherFlags: string[];
}

export type SnippetLang = 'curl' | 'python' | 'http' | 'json';

export interface ApiCallViewerProps extends ShuffleHostProps {
  /** Structured API call configuration */
  config?: ApiCallConfig;
  /** Raw cURL command string (e.g. from documentation markdown) */
  rawCurl?: string;
  /** Whether to mask the Authorization header value in display (default: true) */
  maskAuth?: boolean;
  /** Initial selected tab mode (default: 'curl') */
  defaultMode?: SnippetLang;
  /** Title displayed in the header (default: 'API Call') */
  title?: string;
}

/** Recursively parse JSON-looking strings into objects/arrays so JsonView can collapse them. */
export const deepParseJsonStrings = (obj: any, depth = 0): any => {
  if (depth > 5) return obj;
  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null) {
          return deepParseJsonStrings(parsed, depth + 1);
        }
      } catch {
        // Keep raw string
      }
    }
    return obj;
  }
  if (Array.isArray(obj)) return obj.map((item) => deepParseJsonStrings(item, depth + 1));
  if (obj && typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepParseJsonStrings(value, depth + 1);
    }
    return result;
  }
  return obj;
};

/** Parses a raw cURL command into constituent parts. */
export function parseCurlCommand(raw: string): ParsedCurl {
  const normalized = raw
    .replace(/^(\s*[$#]\s*)+/gm, '')
    .replace(/\\\r?\n\s*/g, ' ')
    .trim();

  let method = 'GET';
  let url = '';
  const headers: Array<{ key: string; value: string }> = [];
  let rawBody: string | null = null;
  let bodyJson: any | null = null;
  const otherFlags: string[] = [];

  const tokenRegex = /(-[A-Za-z0-9_-]+|--[A-Za-z0-9_-]+)(?:\s+(?:'([^']*)'|"([^"]*)"|(\S+)))?/g;
  const dataFlagMatch = normalized.match(/(?:-d|--data|--data-raw|--data-binary)\s+/i);
  let cleanedForArgs = normalized;

  if (dataFlagMatch && dataFlagMatch.index !== undefined) {
    const afterData = normalized.slice(dataFlagMatch.index + dataFlagMatch[0].length).trim();
    let payload = '';
    let consumedLen = 0;

    let candidate = afterData.trim();
    let hasOuterQuote = false;
    if (candidate.startsWith("'") || candidate.startsWith('"')) {
      hasOuterQuote = true;
      candidate = candidate.slice(1).trimStart();
    }

    if (candidate.startsWith('{') || candidate.startsWith('[')) {
      let depth = 0;
      let inString = false;
      let escape = false;
      let endIdx = -1;

      for (let i = 0; i < candidate.length; i++) {
        const char = candidate[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\') {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === '{' || char === '[') depth++;
          else if (char === '}' || char === ']') {
            depth--;
            if (depth === 0) {
              endIdx = i + 1;
              break;
            }
          }
        }
      }

      if (endIdx !== -1) {
        const jsonStr = candidate.slice(0, endIdx);
        try {
          bodyJson = JSON.parse(jsonStr);
          payload = jsonStr;
          consumedLen = (hasOuterQuote ? 1 : 0) + (afterData.trim().length - candidate.length) + endIdx + (hasOuterQuote ? 1 : 0);
        } catch {
          try {
            bodyJson = JSON.parse(jsonStr.replace(/\\'/g, "'"));
            payload = jsonStr;
            consumedLen = (hasOuterQuote ? 1 : 0) + (afterData.trim().length - candidate.length) + endIdx + (hasOuterQuote ? 1 : 0);
          } catch {
            // Keep as raw
          }
        }
      }
    }

    if (!bodyJson) {
      if (afterData.startsWith("'")) {
        let endIdx = -1;
        for (let i = 1; i < afterData.length; i++) {
          if (afterData[i] === "'" && afterData[i - 1] !== '\\') {
            endIdx = i;
            break;
          }
        }
        payload = endIdx !== -1 ? afterData.slice(1, endIdx) : afterData.slice(1);
        consumedLen = endIdx !== -1 ? endIdx + 1 : afterData.length;
      } else if (afterData.startsWith('"')) {
        let endIdx = -1;
        for (let i = 1; i < afterData.length; i++) {
          if (afterData[i] === '"' && afterData[i - 1] !== '\\') {
            endIdx = i;
            break;
          }
        }
        payload = endIdx !== -1 ? afterData.slice(1, endIdx) : afterData.slice(1);
        consumedLen = endIdx !== -1 ? endIdx + 1 : afterData.length;
      } else {
        const match = afterData.match(/^\S+/);
        payload = match ? match[0] : afterData;
        consumedLen = payload.length;
      }
    }

    rawBody = payload;
    method = 'POST';
    cleanedForArgs = normalized.slice(0, dataFlagMatch.index) + ' ' + afterData.slice(consumedLen);
  }

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(cleanedForArgs)) !== null) {
    const flag = match[1];
    const val = match[2] ?? match[3] ?? match[4] ?? '';

    if (flag === '-X' || flag === '--request') {
      if (val) method = val.toUpperCase();
    } else if (flag === '-H' || flag === '--header') {
      if (val) {
        const colonIdx = val.indexOf(':');
        if (colonIdx !== -1) {
          headers.push({
            key: val.slice(0, colonIdx).trim(),
            value: val.slice(colonIdx + 1).trim(),
          });
        } else {
          headers.push({ key: val.trim(), value: '' });
        }
      }
    } else {
      otherFlags.push(val ? `${flag} ${val}` : flag);
    }
  }

  const words = cleanedForArgs.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/^['"]|['"]$/g, '');
    if (w.startsWith('http://') || w.startsWith('https://') || w.startsWith('/api/') || w.includes('/api/v1') || w.includes('/api/v2')) {
      url = w;
      break;
    }
  }

  if (!url) {
    const urlMatch = normalized.match(/(https?:\/\/[^\s'"]+)/);
    if (urlMatch) url = urlMatch[1];
  }

  return { method, url, headers, bodyJson, rawBody, otherFlags };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Single-pass tokenizer-based syntax highlighter for cURL, Python, and raw HTTP. */
function highlightSnippet(code: string, lang: SnippetLang, isDark = true): string {
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

  const PY_KEYWORDS = new Set([
    'import', 'from', 'as', 'def', 'return', 'if', 'else', 'elif', 'for',
    'while', 'in', 'None', 'True', 'False', 'print', 'class', 'with', 'try', 'except',
  ]);

  const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

  const wrap = (color: string, text: string) =>
    `<span style="color:${color}">${escapeHtml(text)}</span>`;

  const out: string[] = [];
  let i = 0;
  const n = code.length;

  while (i < n) {
    const ch = code[i];

    if (lang === 'python' && ch === '#') {
      let j = i;
      while (j < n && code[j] !== '\n') j++;
      out.push(wrap(COL.comment, code.slice(i, j)));
      i = j;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < n && code[j] !== quote) {
        if (code[j] === '\\' && j + 1 < n) j += 2;
        else j++;
      }
      j = Math.min(j + 1, n);
      out.push(wrap(COL.string, code.slice(i, j)));
      i = j;
      continue;
    }

    if (lang === 'curl' && ch === '-' && (i === 0 || /\s/.test(code[i - 1]))) {
      let j = i + 1;
      if (code[j] === '-') j++;
      while (j < n && /[\w-]/.test(code[j])) j++;
      out.push(wrap(COL.flag, code.slice(i, j)));
      i = j;
      continue;
    }

    if (/\d/.test(ch)) {
      let j = i;
      while (j < n && /[\d.]/.test(code[j])) j++;
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
      } else if (lang === 'python' && code[j] === '(') {
        out.push(wrap(COL.func, word));
      } else if (lang === 'curl' && word === 'curl') {
        out.push(wrap(COL.builtin, word));
      } else if (HTTP_METHODS.has(word.toUpperCase())) {
        out.push(wrap(COL.method, word));
      } else if (lang === 'http' && code[j] === ':') {
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

const sanitizeHeaderValue = (value: string): string =>
  value.replace(/\u2026/g, '...').replace(/\u2022/g, '*');

const maskAuthorizationHeaderValue = (value: string): string =>
  sanitizeHeaderValue(value).replace(/(Bearer\s+)(.{8}).*/, '$1$2...');

export function formatPythonValue(val: unknown, indentLevel = 0): string {
  if (val === null || val === undefined) return 'None';
  if (typeof val === 'boolean') return val ? 'True' : 'False';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'None';
  if (typeof val === 'string') return JSON.stringify(val);

  const pad = '  '.repeat(indentLevel);
  const childPad = '  '.repeat(indentLevel + 1);

  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    const items = val.map((item) => `${childPad}${formatPythonValue(item, indentLevel + 1)}`);
    return `[\n${items.join(',\n')}\n${pad}]`;
  }

  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    const items = entries.map(
      ([k, v]) => `${childPad}${JSON.stringify(k)}: ${formatPythonValue(v, indentLevel + 1)}`,
    );
    return `{\n${items.join(',\n')}\n${pad}}`;
  }

  return JSON.stringify(String(val));
}

export function unmaskSnippetCredentials(
  snippet: string,
  effectiveToken: string | null,
  maskedApiKey?: string,
  orgId?: string | null,
): string {
  let out = snippet;
  const cleanToken = effectiveToken?.trim() || null;

  if (cleanToken) {
    if (maskedApiKey && maskedApiKey !== '<API_KEY>') {
      out = out.split(maskedApiKey).join(cleanToken);
    }
    const prefix8 = cleanToken.slice(0, 8);
    if (prefix8) {
      out = out.split(`${prefix8}...`).join(cleanToken);
      out = out.split(`${prefix8}\u2026`).join(cleanToken);
    }
    out = out.replace(
      /(Bearer\s+)(?:[A-Za-z0-9_-]{4,16}(?:\.{3}|\u2026)|[A-Za-z0-9_-]{0,8}[\u2022*]{4,}[A-Za-z0-9_-]{0,8}|APIKEY|API_KEY|<API_KEY>|<APIKEY>|YOUR_API_KEY|<your-api-key>|YOUR_TOKEN|<TOKEN>)/gi,
      `$1${cleanToken}`,
    );
  }

  if (orgId) {
    out = out.replace(/(?:<ORG_ID>|<ORGID>|<org_id>|\bORGID\b)/g, orgId);
  }

  // Never allow Unicode ellipsis (\u2026) or bullet (\u2022) characters to remain in code/headers,
  // as Python's http.client encodes HTTP headers using latin-1.
  return out.replace(/\u2026/g, '...').replace(/\u2022/g, '*');
}

export function buildCurl(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  maskAuth: boolean,
): string {
  const needsFollowRedirect = /(?:^|\/\/)(?:[a-z0-9-]+\.)?shuffle\.security(?:\/|:|$)/i.test(url);
  const parts = [`curl${needsFollowRedirect ? ' -L' : ''} -X ${(method || 'GET').toUpperCase()} '${url}'`];

  for (const [key, value] of Object.entries(headers)) {
    const displayValue = maskAuth && key.toLowerCase() === 'authorization'
      ? maskAuthorizationHeaderValue(value)
      : sanitizeHeaderValue(value);
    parts.push(`  -H '${key}: ${displayValue}'`);
  }

  if (body !== undefined && body !== null) {
    let jsonStr: string;
    if (typeof body === 'string') {
      try {
        jsonStr = JSON.stringify(JSON.parse(body), null, 2);
      } catch {
        jsonStr = body;
      }
    } else {
      jsonStr = JSON.stringify(body, null, 2);
    }
    parts.push(`  -d '${jsonStr.replace(/'/g, "'\\''")}'`);
  }

  return parts.join(' \\\n');
}

export function buildPython(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  maskAuth: boolean,
): string {
  const lines: string[] = ['import requests'];
  let hasJsonBody = false;

  let bodyObj: any = body;
  if (typeof body === 'string') {
    try {
      bodyObj = JSON.parse(body);
      hasJsonBody = true;
    } catch {
      hasJsonBody = false;
    }
  } else if (body && typeof body === 'object') {
    hasJsonBody = true;
  }

  lines.push(`url = "${url}"`);

  const headerEntries = Object.entries(headers);
  if (headerEntries.length === 1) {
    const [key, value] = headerEntries[0];
    const displayValue = maskAuth && key.toLowerCase() === 'authorization'
      ? maskAuthorizationHeaderValue(value)
      : sanitizeHeaderValue(value);
    lines.push(`headers = {"${key}": "${displayValue}"}`);
  } else if (headerEntries.length > 1) {
    lines.push('headers = {');
    for (const [key, value] of headerEntries) {
      const displayValue = maskAuth && key.toLowerCase() === 'authorization'
        ? maskAuthorizationHeaderValue(value)
        : sanitizeHeaderValue(value);
      lines.push(`  "${key}": "${displayValue}",`);
    }
    lines.push('}');
  }

  if (bodyObj !== undefined && bodyObj !== null) {
    if (hasJsonBody) {
      lines.push(`payload = ${formatPythonValue(bodyObj, 0)}`);
    } else {
      lines.push(`payload = ${JSON.stringify(String(body).trim())}`);
    }
  }

  const methodUpper = (method || 'GET').toUpperCase();
  const headerArg = headerEntries.length > 0 ? ', headers=headers' : '';
  const bodyArg = bodyObj !== undefined && bodyObj !== null
    ? (hasJsonBody ? ', json=payload' : ', data=payload')
    : '';

  lines.push(`response = requests.request("${methodUpper}", url${headerArg}${bodyArg})`);
  lines.push('print(response.json())');

  return lines.join('\n');
}

export function buildHttp(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  maskAuth: boolean,
): string {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    try {
      parsed = new URL(url, 'https://localhost');
    } catch {
      parsed = null;
    }
  }

  const requestTarget = parsed ? `${parsed.pathname}${parsed.search}` : url || '/';
  const lines = [`${(method || 'GET').toUpperCase()} ${requestTarget} HTTP/1.1`];
  lines.push(`Host: ${parsed?.host ?? url}`);

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'host') continue;
    const displayValue = maskAuth && key.toLowerCase() === 'authorization'
      ? maskAuthorizationHeaderValue(value)
      : sanitizeHeaderValue(value);
    lines.push(`${key}: ${displayValue}`);
  }

  if (body !== undefined && body !== null) {
    lines.push('');
    const jsonStr = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
    lines.push(jsonStr);
  }

  return lines.join('\n');
}

function usePageDarkMode(
  themeProp: string | undefined,
  colorModeProp: string | undefined,
  fallbackDark: boolean,
): boolean {
  const themeScope = useShuffleCoreTheme();
  const resolvedModeProp = colorModeProp || (themeProp === 'system' ? 'auto' : themeProp);

  const compute = useCallback((): boolean => {
    if (resolvedModeProp === 'dark') return true;
    if (resolvedModeProp === 'light') return false;
    if (themeScope) return themeScope.isDark;
    if (typeof document !== 'undefined') {
      return readHtmlDarkClass();
    }
    return fallbackDark;
  }, [resolvedModeProp, themeScope, fallbackDark]);

  const [isDark, setIsDark] = useState<boolean>(compute);

  useEffect(() => {
    setIsDark(compute());
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const handleChange = () => setIsDark(compute());
    const observer = new MutationObserver(handleChange);
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    if (document.body) {
      observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    }
    window.addEventListener('shuffle:theme-change', handleChange);
    return () => {
      observer.disconnect();
      window.removeEventListener('shuffle:theme-change', handleChange);
    };
  }, [compute]);

  return isDark;
}

export const ApiCallViewer: React.FC<ApiCallViewerProps> = ({
  config,
  rawCurl,
  maskAuth = true,
  defaultMode = 'curl',
  title = 'API Call',
  theme: themeProp,
  colorMode: colorModeProp,
}) => {
  const theme = useTheme();
  const isDark = usePageDarkMode(themeProp, colorModeProp, theme.palette.mode === 'dark');

  let userKeyInfo: ReturnType<typeof useUserApiKey> | null = null;
  try {
    userKeyInfo = useUserApiKey();
  } catch {
    // Graceful fallback outside AuthProvider
  }

  const { apiKey, maskedApiKey, baseUrl: defaultBaseUrl, orgId } = userKeyInfo || {
    apiKey: null,
    maskedApiKey: '<API_KEY>',
    baseUrl: API_CONFIG.baseUrl || 'https://shuffle.security',
    orgId: null,
  };

  const [mode, setMode] = useState<SnippetLang>(defaultMode);
  const [editedSnippets, setEditedSnippets] = useState<Partial<Record<'curl' | 'python' | 'http', string>>>({});
  const [copied, setCopied] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [responseOutput, setResponseOutput] = useState<string | null>(null);
  const [parsedResponse, setParsedResponse] = useState<any | null>(null);
  const [responseStatus, setResponseStatus] = useState<string | null>(null);
  const [responseDuration, setResponseDuration] = useState<number | null>(null);
  const [isResponseOpen, setIsResponseOpen] = useState(false);
  const [responseViewMode, setResponseViewMode] = useState<'tree' | 'raw'>('tree');

  const parsedCurlData = useMemo(() => {
    if (rawCurl) {
      return parseCurlCommand(rawCurl);
    }
    return null;
  }, [rawCurl]);

  const requestInfo = useMemo(() => {
    let method = 'GET';
    let url = '';
    const headers: Record<string, string> = {};
    let bodyObj: any = null;

    if (config) {
      method = (config.method || 'GET').toUpperCase();
      url = config.url || '';
      if (config.headers) {
        Object.assign(headers, config.headers);
      }
      bodyObj = config.body;
    } else if (parsedCurlData) {
      method = (parsedCurlData.method || 'GET').toUpperCase();
      url = parsedCurlData.url || '';
      for (const h of parsedCurlData.headers) {
        headers[h.key] = h.value;
      }
      bodyObj = parsedCurlData.bodyJson || parsedCurlData.rawBody;
    }

    if (!url) {
      url = `${defaultBaseUrl}/api/v1`;
    } else if (url.startsWith('/')) {
      url = `${defaultBaseUrl}${url}`;
    } else {
      url = url
        .replace(/^https?:\/\/shuffler\.io/i, defaultBaseUrl)
        .replace(/^https?:\/\/<endpoint>:<port>/i, defaultBaseUrl);
    }

    const effectiveToken = apiKey || API_CONFIG.apiKey || null;
    let hasAuth = false;

    for (const [k, v] of Object.entries(headers)) {
      if (/^authorization$/i.test(k)) {
        hasAuth = true;
        if (
          effectiveToken &&
          /APIKEY|API_KEY|<API_KEY>|<APIKEY>|YOUR_API_KEY|<your-api-key>|YOUR_TOKEN|<TOKEN>|\u2026|\.{3}|\u2022|\*{4}/i.test(v)
        ) {
          headers[k] = `Bearer ${effectiveToken}`;
        } else {
          headers[k] = sanitizeHeaderValue(v);
        }
      } else if (/^org-id$/i.test(k) && orgId) {
        if (/<ORGID>|<ORG_ID>|ORGID|<org_id>/i.test(v)) {
          headers[k] = orgId;
        }
      } else {
        headers[k] = sanitizeHeaderValue(v);
      }
    }

    if (!hasAuth && effectiveToken) {
      headers['Authorization'] = `Bearer ${effectiveToken}`;
    }

    let parsedJson: any = null;
    if (typeof bodyObj === 'string') {
      try {
        parsedJson = JSON.parse(bodyObj);
      } catch {
        parsedJson = null;
      }
    } else if (bodyObj && typeof bodyObj === 'object') {
      parsedJson = bodyObj;
    }

    return { method, url, headers, body: bodyObj, parsedJson };
  }, [config, parsedCurlData, defaultBaseUrl, apiKey, orgId]);

  const hasJsonBody = requestInfo.parsedJson !== null;

  const generatedCode = useMemo(() => {
    return {
      curl: buildCurl(requestInfo.method, requestInfo.url, requestInfo.headers, requestInfo.body, maskAuth),
      python: buildPython(requestInfo.method, requestInfo.url, requestInfo.headers, requestInfo.body, maskAuth),
      http: buildHttp(requestInfo.method, requestInfo.url, requestInfo.headers, requestInfo.body, maskAuth),
    };
  }, [requestInfo, maskAuth]);

  const unmaskedGeneratedCode = useMemo(() => {
    return {
      curl: buildCurl(requestInfo.method, requestInfo.url, requestInfo.headers, requestInfo.body, false),
      python: buildPython(requestInfo.method, requestInfo.url, requestInfo.headers, requestInfo.body, false),
      http: buildHttp(requestInfo.method, requestInfo.url, requestInfo.headers, requestInfo.body, false),
    };
  }, [requestInfo]);

  const currentSnippet = mode === 'json' ? '' : (editedSnippets[mode] ?? generatedCode[mode]);
  const isCurrentEdited = mode !== 'json' && editedSnippets[mode] !== undefined && editedSnippets[mode] !== generatedCode[mode];

  const snippetLines = useMemo(() => {
    const lines = currentSnippet.split('\n');
    return lines.length > 0 ? lines : [''];
  }, [currentSnippet]);

  const copyableSnippet = useMemo(() => {
    if (mode === 'json') {
      return JSON.stringify(requestInfo.parsedJson, null, 2);
    }
    const effectiveToken = apiKey || API_CONFIG.apiKey || null;
    const edited = editedSnippets[mode];
    if (edited !== undefined) {
      return unmaskSnippetCredentials(edited, effectiveToken, maskedApiKey, orgId);
    }
    return unmaskSnippetCredentials(unmaskedGeneratedCode[mode], effectiveToken, maskedApiKey, orgId);
  }, [mode, requestInfo, editedSnippets, unmaskedGeneratedCode, apiKey, maskedApiKey, orgId]);

  const runnableCommand = useMemo(() => {
    const effectiveToken = apiKey || API_CONFIG.apiKey || null;
    const editedCurl = editedSnippets.curl;
    if (editedCurl !== undefined) {
      return unmaskSnippetCredentials(editedCurl, effectiveToken, maskedApiKey, orgId);
    }
    return unmaskSnippetCredentials(unmaskedGeneratedCode.curl, effectiveToken, maskedApiKey, orgId);
  }, [editedSnippets.curl, unmaskedGeneratedCode.curl, apiKey, maskedApiKey, orgId]);

  const runnablePython = useMemo(() => {
    const effectiveToken = apiKey || API_CONFIG.apiKey || null;
    const editedPy = editedSnippets.python;
    if (editedPy !== undefined) {
      return unmaskSnippetCredentials(editedPy, effectiveToken, maskedApiKey, orgId);
    }
    return unmaskSnippetCredentials(unmaskedGeneratedCode.python, effectiveToken, maskedApiKey, orgId);
  }, [editedSnippets.python, unmaskedGeneratedCode.python, apiKey, maskedApiKey, orgId]);

  const handleCopy = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyableSnippet);
      }
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed');
    }
  }, [copyableSnippet]);

  const handleReset = useCallback(() => {
    if (mode === 'json') return;
    setEditedSnippets((prev) => {
      const next = { ...prev };
      delete next[mode];
      return next;
    });
  }, [mode]);

  const handleRun = useCallback(async () => {
    setIsRunning(true);
    setIsResponseOpen(true);
    setResponseStatus(null);
    setResponseOutput(null);
    setParsedResponse(null);
    const start = Date.now();

    try {
      let endpoint = '/api/v1/apps/http/run?delete=true';
      let runnerPayload: Record<string, any>;

      if (mode === 'python') {
        endpoint = '/api/v1/apps/3e2bdf9d5069fe3f4746c29d68785a6a/run?delete=true';
        runnerPayload = {
          name: 'execute_python',
          app_id: '3e2bdf9d5069fe3f4746c29d68785a6a',
          app_name: 'Shuffle Tools',
          app_version: '1.2.0',
          environment: 'Cloud',
          parameters: [
            {
              name: 'code',
              value: runnablePython,
              schema: { type: 'string' },
            },
          ],
        };
      } else {
        runnerPayload = {
          name: 'curl',
          app_id: 'ebfe7d5c80000676588f86731db0a555',
          environment: 'Cloud',
          parameters: [
            {
              name: 'statement',
              value: runnableCommand,
              schema: { type: 'string' },
            },
          ],
          app_name: 'http',
          app_version: '1.4.0',
        };
      }

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
      } else if (data && typeof data === 'object') {
        parsed = data;
      }

      const formatted = parsed
        ? JSON.stringify(parsed, null, 2)
        : (typeof rawResult === 'string' ? rawResult : JSON.stringify(data, null, 2));

      setResponseOutput(formatted);
      setParsedResponse(parsed);

      const isSuccess = res.ok && (!rawResult || (typeof rawResult === 'string' && !rawResult.includes('"success": false')) || data?.success !== false);
      setResponseStatus(isSuccess ? `Status: ${res.status} OK` : `Status: ${res.status} Error`);

      if (isSuccess) {
        toast.success(`Request completed in ${duration}ms`);
      } else {
        toast.error('Request finished with error');
      }
    } catch (err: any) {
      setResponseDuration(Date.now() - start);
      setResponseStatus('Request Failed');
      setResponseOutput(err?.message || 'Network error executing request');
      setParsedResponse(null);
      toast.error('Failed to run request');
    } finally {
      setIsRunning(false);
    }
  }, [mode, runnableCommand, runnablePython]);

  const methodColor = useMemo(() => {
    switch (requestInfo.method) {
      case 'GET':
        return '#10b981';
      case 'POST':
        return '#f59e0b';
      case 'PUT':
      case 'PATCH':
        return '#3b82f6';
      case 'DELETE':
        return '#ef4444';
      default:
        return '#8b5cf6';
    }
  }, [requestInfo.method]);

  return (
    <Box
      className="not-prose"
      sx={{
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(15, 23, 42, 0.14)',
        bgcolor: isDark ? '#0d1117' : '#ffffff',
        color: isDark ? '#e6edf3' : '#1f2328',
        overflow: 'hidden',
        my: 2,
      }}
    >
      {/* Header bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
          rowGap: 0.75,
          px: { xs: 1.25, sm: 2 },
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
            letterSpacing: '0.05em',
          }}
        >
          {title}
        </Typography>

        <Chip
          label={requestInfo.method}
          size="small"
          sx={{
            height: 18,
            fontSize: '0.6rem',
            fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            bgcolor: `${methodColor}20`,
            color: methodColor,
            border: `1px solid ${methodColor}40`,
            '& .MuiChip-label': { px: 0.6 },
          }}
        />

        <Box sx={{ flex: 1 }} />

        {/* Compact Segmented Switcher: cURL / Python / HTTP / JSON */}
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
          {((['curl', 'python', 'http', ...(hasJsonBody ? ['json'] : [])] as SnippetLang[])).map((m) => {
            const active = mode === m;
            const label = m === 'curl' ? 'cURL' : m === 'python' ? 'Python' : m === 'http' ? 'HTTP' : 'JSON';
            return (
              <Box
                key={m}
                onClick={() => setMode(m)}
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
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  '&:hover': {
                    color: isDark ? '#f0f6fc' : '#1f2328',
                  },
                }}
              >
                {label}
              </Box>
            );
          })}
        </Box>

        {isCurrentEdited && (
          <Button
            size="small"
            variant="text"
            onClick={handleReset}
            sx={{
              height: 22,
              minWidth: 42,
              px: 0.75,
              fontSize: '0.62rem',
              fontWeight: 500,
              textTransform: 'none',
              borderRadius: 1,
              color: isDark ? '#8b949e' : '#57606a',
              '&:hover': {
                color: isDark ? '#f0f6fc' : '#1f2328',
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.06)',
              },
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

        {/* Test runner button */}
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
            'Test'
          )}
        </Button>
      </Box>

      {/* Main Body: Code or JSON Tree View */}
      {mode === 'json' ? (
        <Box
          sx={{
            p: 1.5,
            maxHeight: 280,
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
            src={deepParseJsonStrings(requestInfo.parsedJson)}
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
            alignItems: 'stretch',
            maxHeight: 280,
            overflow: 'auto',
            bgcolor: isDark ? '#0d1117' : '#ffffff',
            color: isDark ? '#e6edf3' : '#1f2328',
            fontFamily: "'JetBrains Mono', monospace",
            '&::-webkit-scrollbar': { width: 6, height: 6 },
            '&::-webkit-scrollbar-thumb': {
              background: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(15, 23, 42, 0.2)',
              borderRadius: 3,
            },
          }}
        >
          <Box
            aria-hidden="true"
            sx={{
              py: 1.25,
              px: 1.25,
              minWidth: 38,
              textAlign: 'right',
              userSelect: 'none',
              borderRight: '1px solid',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)',
              bgcolor: isDark ? '#13171e' : '#f8f9fb',
              color: isDark ? '#7d8590' : '#57606a',
              fontSize: '0.72rem',
              lineHeight: '1.35rem',
              fontFamily: "'JetBrains Mono', monospace",
              flexShrink: 0,
            }}
          >
            {snippetLines.map((_, idx) => (
              <Box key={idx} sx={{ height: '1.35rem' }}>
                {idx + 1}
              </Box>
            ))}
          </Box>
          <Box
            sx={{
              position: 'relative',
              flex: 1,
              minWidth: 0,
              bgcolor: isDark ? '#0d1117' : '#ffffff',
            }}
          >
            <Box
              component="div"
              aria-hidden="true"
              sx={{
                m: 0,
                py: 1.25,
                px: 1.75,
                fontSize: '0.76rem',
                fontFamily: "'JetBrains Mono', monospace",
                color: isDark ? '#e6edf3' : '#1f2328',
                bgcolor: 'transparent',
                border: 'none',
                lineHeight: '1.35rem',
                whiteSpace: 'pre',
                pointerEvents: 'none',
                minHeight: `${Math.max(snippetLines.length, 1) * 1.35 + 1.25}rem`,
              }}
              dangerouslySetInnerHTML={{
                __html: `${highlightSnippet(currentSnippet, mode, isDark)}\n`,
              }}
            />
            <Box
              component="textarea"
              value={currentSnippet}
              onCopy={(e: React.ClipboardEvent<HTMLTextAreaElement>) => {
                const target = e.currentTarget;
                const start = target.selectionStart ?? 0;
                const end = target.selectionEnd ?? 0;
                if (end > start && e.clipboardData) {
                  const selected = target.value.slice(start, end);
                  const effectiveToken = apiKey || API_CONFIG.apiKey || null;
                  const unmasked = unmaskSnippetCredentials(
                    selected,
                    effectiveToken,
                    maskedApiKey,
                    orgId,
                  );
                  if (unmasked !== selected) {
                    e.preventDefault();
                    e.clipboardData.setData('text/plain', unmasked);
                  }
                }
              }}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                const val = e.target.value;
                setEditedSnippets((prev) => ({
                  ...prev,
                  [mode]: val,
                }));
              }}
              onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const target = e.currentTarget;
                  const start = target.selectionStart;
                  const end = target.selectionEnd;
                  const next = `${currentSnippet.substring(0, start)}  ${currentSnippet.substring(end)}`;
                  setEditedSnippets((prev) => ({
                    ...prev,
                    [mode]: next,
                  }));
                  requestAnimationFrame(() => {
                    target.selectionStart = target.selectionEnd = start + 2;
                  });
                } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  if (!isRunning) {
                    handleRun();
                  }
                }
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              data-code-editor-overlay="true"
              aria-label={`${title} ${mode} code editor`}
              sx={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                m: 0,
                py: 1.25,
                px: 1.75,
                border: 'none',
                outline: 'none',
                resize: 'none',
                background: 'transparent',
                color: 'transparent',
                caretColor: 'hsl(var(--primary))',
                fontSize: '0.76rem !important',
                fontFamily: "'JetBrains Mono', monospace",
                lineHeight: '1.35rem',
                whiteSpace: 'pre',
                overflow: 'hidden',
                '&::selection': {
                  backgroundColor: 'hsl(var(--primary) / 0.25)',
                  color: 'transparent',
                },
              }}
            />
          </Box>
        </Box>
      )}

      {/* Collapsible Test Response Drawer */}
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
              maxHeight: 240,
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
                    fontFamily: 'inherit !important',
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
            ) : responseOutput ? (
              <Box
                component="div"
                sx={{
                  m: 0,
                  fontSize: '0.72rem',
                  lineHeight: 1.6,
                  color: isDark ? '#e6edf3' : '#1f2328',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {responseOutput}
              </Box>
            ) : (
              <Typography sx={{ fontSize: '0.72rem', color: isDark ? '#8b949e' : '#57606a' }}>
                No response received.
              </Typography>
            )}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
};

export default ApiCallViewer;
