/**
 * SingulActionsPreview — Standalone "Try individual actions" block.
 *
 * Renders the action picker (grouped by category), curl/python toggle,
 * editable snippet, Play button (calls Shuffle Tools `execute_python` or
 * the http app `curl` action) and a response area that streams in.
 *
 * Self-contained — pass in the app name + categories. Optionally pass
 * `activeOrgId` so multi-org curl previews include the right Org-Id header.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { toast } from '@/Shuffle-MCPs/toast';
import type { ShuffleHostProps } from '@/Shuffle-MCPs/host-props';
import {
  Box,
  Typography,
  Chip,
  Button,
  Autocomplete,
  TextField,
  IconButton,
  Tooltip,
  Avatar,
  useTheme,
} from '@mui/material';
import {
  Code2,
  Terminal,
  Check as CheckIcon,
  Copy as ContentCopyIcon,
  Lock as LockIcon,
  Play as PlayArrowIcon
} from 'lucide-react';
import { API_CONFIG, getApiUrl, getAuthHeader, getTrackedOrgId } from '@/Shuffle-MCPs/api';
import JsonView from 'react18-json-view';
import 'react18-json-view/src/style.css';
import 'react18-json-view/src/dark.css';
import { defaultCollapsed } from '@/lib/jsonView';

/** Recursively parse JSON-looking strings into objects/arrays so JsonView can collapse them. */
const deepParseJsonStrings = (obj: any, depth = 0): any => {
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
      } catch { /* ignore */ }
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

interface SingulAction {
  name: string;
  label: string;
  category: string;
  fields: { name: string; value: string }[];
}

/** Default starter fields per canonical action (lowercased snake_case key). */
const ACTION_DEFAULT_FIELDS: Record<string, { name: string; value: string }[]> = {
  list_messages: [{ name: 'channel', value: '#general' }, { name: 'limit', value: '10' }],
  send_message: [{ name: 'channel', value: '#general' }, { name: 'message', value: 'Hello from Shuffle' }],
  get_message: [{ name: 'message_id', value: '' }],
  search_messages: [{ name: 'query', value: 'incident' }],
  list_attachments: [{ name: 'message_id', value: '' }],
  get_attachment: [{ name: 'attachment_id', value: '' }],
  get_contact: [{ name: 'email', value: 'user@example.com' }],

  search: [{ name: 'query', value: 'event.type:login' }, { name: 'time_range', value: '24h' }],
  list_alerts: [{ name: 'severity', value: 'high' }],
  close_alert: [{ name: 'alert_id', value: '' }],
  get_alert: [{ name: 'alert_id', value: '' }],
  create_detection: [{ name: 'name', value: 'My detection' }, { name: 'query', value: 'event.type:login AND result:failure' }],
  add_to_lookup_list: [{ name: 'list_name', value: 'blocked_ips' }, { name: 'value', value: '1.2.3.4' }],
  isolate_endpoint: [{ name: 'host_id', value: '' }],

  block_hash: [{ name: 'hash', value: 'd41d8cd98f00b204e9800998ecf8427e' }],
  search_hosts: [{ name: 'query', value: 'hostname:laptop-*' }],
  isolate_host: [{ name: 'host_id', value: '' }],
  unisolate_host: [{ name: 'host_id', value: '' }],
  trigger_host_scan: [{ name: 'host_id', value: '' }],

  list_tickets: [{ name: 'status', value: 'open' }],
  get_ticket: [{ name: 'ticket_id', value: '' }],
  create_ticket: [{ name: 'title', value: 'New incident' }, { name: 'description', value: '' }, { name: 'priority', value: 'medium' }],
  close_ticket: [{ name: 'ticket_id', value: '' }],
  add_comment: [{ name: 'ticket_id', value: '' }, { name: 'comment', value: 'Investigation update' }],
  update_ticket: [{ name: 'ticket_id', value: '' }, { name: 'status', value: 'in_progress' }],
  search_tickets: [{ name: 'query', value: 'status:open' }],

  list_assets: [{ name: 'limit', value: '50' }],
  get_asset: [{ name: 'asset_id', value: '' }],
  search_assets: [{ name: 'query', value: 'os:windows' }],
  search_users: [{ name: 'query', value: 'department:finance' }],
  search_endpoints: [{ name: 'query', value: 'os:windows' }],
  search_vulnerabilities: [{ name: 'severity', value: 'critical' }],

  get_ioc: [{ name: 'value', value: '1.2.3.4' }],
  search_ioc: [{ name: 'query', value: 'malicious.com' }],
  create_ioc: [{ name: 'type', value: 'ipv4' }, { name: 'value', value: '1.2.3.4' }],
  update_ioc: [{ name: 'ioc_id', value: '' }, { name: 'value', value: '1.2.3.4' }],
  delete_ioc: [{ name: 'ioc_id', value: '' }],

  reset_password: [{ name: 'user_id', value: '' }],
  enable_user: [{ name: 'user_id', value: '' }],
  disable_user: [{ name: 'user_id', value: '' }],
  get_identity: [{ name: 'user_id', value: '' }],
  search_identity: [{ name: 'query', value: 'department:finance' }],
  get_kms_key: [{ name: 'key_id', value: '' }],

  get_rules: [],
  allow_ip: [{ name: 'ip', value: '1.2.3.4' }],
  block_ip: [{ name: 'ip', value: '1.2.3.4' }],

  answer_question: [{ name: 'question', value: 'What is this alert about?' }],
  run_action: [{ name: 'app', value: 'jira' }, { name: 'action', value: 'create_ticket' }],
  run_llm: [{ name: 'prompt', value: 'Summarize this incident' }, { name: 'model', value: 'gpt-4o-mini' }],

  update_info: [{ name: 'key', value: '' }, { name: 'value', value: '' }],
  get_info: [{ name: 'key', value: '' }],
  get_status: [],
  get_version: [],
  get_health: [],
  get_config: [{ name: 'key', value: '' }],
  get_configs: [],
  get_configs_by_type: [{ name: 'type', value: '' }],
  get_configs_by_name: [{ name: 'name', value: '' }],
  run_script: [{ name: 'script', value: 'whoami' }],
};

/** Default categories + their action labels (canonical order). */
const ACTION_CATEGORIES: { name: string; action_labels: string[] }[] = [
  { name: 'Communication', action_labels: ['List Messages', 'Send Message', 'Get Message', 'Search messages', 'List Attachments', 'Get Attachment', 'Get Contact'] },
  { name: 'SIEM', action_labels: ['Search', 'List Alerts', 'Close Alert', 'Get Alert', 'Create detection', 'Add to lookup list', 'Isolate endpoint'] },
  { name: 'Eradication', action_labels: ['List Alerts', 'Close Alert', 'Get Alert', 'Create detection', 'Block hash', 'Search Hosts', 'Isolate host', 'Unisolate host', 'Trigger host scan'] },
  { name: 'Cases', action_labels: ['List tickets', 'Get ticket', 'Create ticket', 'Close ticket', 'Add comment', 'Update ticket', 'Search tickets'] },
  { name: 'Assets', action_labels: ['List Assets', 'Get Asset', 'Search Assets', 'Search Users', 'Search endpoints', 'Search vulnerabilities'] },
  { name: 'Intel', action_labels: ['Get IOC', 'Search IOC', 'Create IOC', 'Update IOC', 'Delete IOC'] },
  { name: 'IAM', action_labels: ['Reset Password', 'Enable user', 'Disable user', 'Get Identity', 'Get Asset', 'Search Identity', 'Get KMS Key'] },
  { name: 'Network', action_labels: ['Get Rules', 'Allow IP', 'Block IP'] },
  { name: 'AI', action_labels: ['Answer Question', 'Run Action', 'Run LLM'] },
  { name: 'Internal', action_labels: ['Answer Question', 'Run Action', 'Run LLM'] },
  { name: 'Other', action_labels: ['Update Info', 'Get Info', 'Get Status', 'Get Version', 'Get Health', 'Get Config', 'Get Configs', 'Get Configs by type', 'Get Configs by name', 'Run script'] },
];

const labelToName = (label: string) =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Flat list of ALL actions across every category, preserving order. */
const ALL_ACTIONS: SingulAction[] = ACTION_CATEGORIES.flatMap((cat) =>
  cat.action_labels.map((label) => {
    const name = labelToName(label);
    return {
      name,
      label,
      category: cat.name,
      fields: ACTION_DEFAULT_FIELDS[name] ?? [],
    };
  }),
);

/** Pick the best matching default category for an app, given its raw categories. */
function pickDefaultCategory(categories?: string[]): string {
  if (!categories || categories.length === 0) return 'Other';
  const known = ACTION_CATEGORIES.map((c) => c.name.toLowerCase());
  for (const cat of categories) {
    const n = cat.toLowerCase();
    const direct = known.find((k) => k === n);
    if (direct) return ACTION_CATEGORIES.find((c) => c.name.toLowerCase() === direct)!.name;
    const partial = known.find((k) => n.includes(k) || k.includes(n));
    if (partial) return ACTION_CATEGORIES.find((c) => c.name.toLowerCase() === partial)!.name;
  }
  return 'Other';
}

function buildSingulCurl(
  appName: string,
  action: SingulAction | null,
  opts?: { apiKey?: string | null; orgId?: string | null; baseUrl?: string },
): string {
  const act = action?.name || '{action}';
  const body = {
    app: appName || '<appname>',
    action: act,
    fields: action?.fields.length ? action.fields : [{ name: 'field1', value: 'value1' }],
  };
  const token = opts?.apiKey || 'YOUR_TOKEN';
  const orgLine = opts?.orgId ? `\n  -H "Org-Id: ${opts.orgId}" \\` : '';
  const base = (opts?.baseUrl || '').replace(/\/+$/, '');
  return `curl -X POST ${base}/api/v1/singul \\
  -H "Authorization: Bearer ${token}" \\${orgLine}
  -d '${JSON.stringify(body, null, 2)}'`;
}

function buildSingulPython(
  appName: string,
  action: SingulAction | null,
  opts?: { apiKey?: string | null; baseUrl?: string },
): string {
  const act = action?.name || 'send_message';
  const app = appName || '<appname>';
  const fields = action?.fields.length ? action.fields : [];
  const fieldsStr = JSON.stringify(fields);
  const token = opts?.apiKey || 'APIKEY';
  const base = (opts?.baseUrl || '').replace(/\/+$/, '');
  return `from shufflepy import Singul

singul = Singul(
    "${token}",
    url="${base}",
)

response = singul.run("${app}", action="${act}", fields=${fieldsStr})

print(response)`;
}

type SnippetLang = 'curl' | 'python';

/** HTML-escape user content before injecting into a highlighted <pre>. */
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Single-pass tokenizer-based highlighter. We MUST NOT run successive regex
 *  passes over already-highlighted HTML, because the inline `style="color:hsl(...)"`
 *  attributes contain words/numbers that later passes would happily re-match
 *  (e.g. `hsl` matches `\w+(?=\()`, digits inside `280` match `\d+`). */
function highlightSnippet(code: string, lang: SnippetLang): string {
  const COL = {
    string: 'hsl(140 60% 65%)',
    keyword: 'hsl(280 70% 75%)',
    func: 'hsl(45 90% 65%)',
    number: 'hsl(20 90% 65%)',
    flag: 'hsl(200 80% 70%)',
    builtin: 'hsl(0 70% 70%)',
    comment: 'hsl(var(--muted-foreground))',
  };
  const PY_KEYWORDS = new Set([
    'import', 'from', 'as', 'def', 'return', 'if', 'else', 'elif', 'for',
    'while', 'in', 'None', 'True', 'False', 'print', 'class', 'with', 'try', 'except',
  ]);
  const wrap = (color: string, text: string) =>
    `<span style="color:${color}">${escapeHtml(text)}</span>`;

  const out: string[] = [];
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    // Strings
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
    // Python comments
    if (lang === 'python' && ch === '#') {
      let j = i;
      while (j < n && code[j] !== '\n') j++;
      out.push(wrap(COL.comment, code.slice(i, j)));
      i = j;
      continue;
    }
    // Curl flags ( -X / --header ), only at start of token
    if (lang === 'curl' && ch === '-' && (i === 0 || /\s/.test(code[i - 1]))) {
      let j = i + 1;
      if (code[j] === '-') j++;
      while (j < n && /[\w-]/.test(code[j])) j++;
      out.push(wrap(COL.flag, code.slice(i, j)));
      i = j;
      continue;
    }
    // Numbers
    if (/\d/.test(ch)) {
      let j = i;
      while (j < n && /[\d.]/.test(code[j])) j++;
      out.push(wrap(COL.number, code.slice(i, j)));
      i = j;
      continue;
    }
    // Identifiers / keywords / function calls
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[\w]/.test(code[j])) j++;
      const word = code.slice(i, j);
      if (lang === 'python' && PY_KEYWORDS.has(word)) {
        out.push(wrap(COL.keyword, word));
      } else if (lang === 'curl' && word === 'curl') {
        out.push(wrap(COL.builtin, word));
      } else if (code[j] === '(') {
        out.push(wrap(COL.func, word));
      } else {
        out.push(escapeHtml(word));
      }
      i = j;
      continue;
    }
    // Plain char (operators, whitespace, punctuation)
    out.push(escapeHtml(ch));
    i++;
  }
  return out.join('');
}



export interface SingulActionsPreviewProps extends ShuffleHostProps {
  appName: string;
  appIcon?: string;
  appId?: string | null;
  categories?: string[];
  activeOrgId?: string | null;
  /** Optional click handler invoked when the user presses the
   *  "Authenticate {App}" button surfaced after an
   *  `action: "app_authentication"` response. */
  onAuthenticate?: (appName: string) => void;
}

const SingulActionsPreview = ({
  appName,
  appIcon,
  categories,
  activeOrgId,
  onAuthenticate,
}: SingulActionsPreviewProps) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const defaultCategory = useMemo(() => pickDefaultCategory(categories), [categories]);
  const actions = ALL_ACTIONS;
  // Sort so that the app's default category appears first, rest follow original order.
  const sortedActions = useMemo(() => {
    const inCat = actions.filter((a) => a.category === defaultCategory);
    const rest = actions.filter((a) => a.category !== defaultCategory);
    return [...inCat, ...rest];
  }, [actions, defaultCategory]);
  const isDisabled = false;
  const [selected, setSelected] = useState<SingulAction | null>(null);
  const [lang, setLang] = useState<SnippetLang>('curl');
  const [snippet, setSnippet] = useState<string>('');

  const curlOpts = useMemo(() => {
    const apiKey = API_CONFIG.apiKey;
    const trackedOrg = getTrackedOrgId();
    const orgId = trackedOrg && activeOrgId && trackedOrg !== activeOrgId ? trackedOrg : null;
    const baseUrl = API_CONFIG.baseUrl;
    return { apiKey, orgId, baseUrl };
  }, [activeOrgId]);

  const buildSnippet = useCallback(
    (action: SingulAction | null, l: SnippetLang) =>
      l === 'python' ? buildSingulPython(appName, action, curlOpts) : buildSingulCurl(appName, action, curlOpts),
    [appName, curlOpts],
  );

  useEffect(() => {
    const initial = sortedActions[0] || null;
    setSelected(initial);
    setSnippet(buildSnippet(initial, lang));
  }, [appName, sortedActions, curlOpts, lang, buildSnippet]);

  const handleSelect = (action: SingulAction | null) => {
    setSelected(action);
    setSnippet(buildSnippet(action, lang));
  };

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(snippet);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed');
    }
  };

  const [playLoading, setPlayLoading] = useState(false);
  const [playResult, setPlayResult] = useState<string | null>(null);
  const responseRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);

  const scrollToResponse = () => {
    requestAnimationFrame(() => {
      responseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const handlePlay = async () => {
    if (!snippet || playLoading) return;
    setPlayLoading(true);
    setPlayResult('');
    scrollToResponse();
    try {
      const body = lang === 'python'
        ? {
            name: 'execute_python',
            app_id: '3e2bdf9d5069fe3f4746c29d68785a6a',
            environment: 'Cloud',
            parameters: [{ name: 'code', value: snippet, schema: { type: 'string' } }],
            app_name: 'Shuffle Tools',
            app_version: '1.2.0',
          }
        : {
            name: 'curl',
            app_id: 'ebfe7d5c80000676588f86731db0a555',
            environment: 'Cloud',
            parameters: [{ name: 'statement', value: snippet, schema: { type: 'string' } }],
            app_name: 'http',
            app_version: '1.4.0',
          };
      const path = lang === 'python' ? '/api/v1/apps/3e2bdf9d5069fe3f4746c29d68785a6a/run?delete=true' : '/api/v1/apps/http/run?delete=true';
      const res = await fetch(getApiUrl(path), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      let output = data?.result;
      if (typeof output === 'string') {
        try { output = JSON.stringify(JSON.parse(output), null, 2); } catch {}
      } else if (output != null) {
        output = JSON.stringify(output, null, 2);
      } else {
        output = JSON.stringify(data, null, 2);
      }
      setPlayResult(output);
      const parsed = (() => { try { return JSON.parse(data?.result || '{}'); } catch { return null; } })();
      if (parsed?.success === false) {
        toast.error(parsed.reason || 'Run failed');
      } else {
        toast.success(`Ran ${selected?.name || lang}`);
      }
    } catch (err: any) {
      const msg = err?.message || 'Run failed';
      setPlayResult(msg);
      toast.error(msg);
    } finally {
      setPlayLoading(false);
      scrollToResponse();
    }
  };

  const lineCount = useMemo(() => Math.max(snippet.split('\n').length, 1), [snippet]);

  return (
    <Box sx={{ mt: 5, mb: 3, opacity: isDisabled ? 0.55 : 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography sx={{ color: 'hsl(var(--foreground))', fontWeight: 600, fontSize: '0.95rem' }}>
          Try individual actions ({sortedActions.length})
        </Typography>
      </Box>

      <Box
        sx={{
          position: 'relative',
          p: 2,
          borderRadius: 2,
          border: '1px solid hsl(var(--border))',
          background: 'linear-gradient(180deg, hsl(var(--muted) / 0.35) 0%, hsl(var(--background) / 0.6) 100%)',
          pointerEvents: isDisabled ? 'none' : 'auto',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: -1,
            borderRadius: 2,
            padding: '1px',
            background: 'linear-gradient(135deg, hsl(var(--primary) / 0.35), transparent 40%, hsl(var(--primary) / 0.15))',
            WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
            pointerEvents: 'none',
          },
        }}
      >
        {isDisabled ? (
          <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', fontStyle: 'italic', textAlign: 'center', py: 1 }}>
            No category detected for this app
          </Typography>
        ) : (
          <>
            <Box sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'center' }}>
              <Autocomplete
                size="small"
                disableClearable
                options={sortedActions}
                value={selected ?? sortedActions[0]}
                onChange={(_, v) => v && handleSelect(v as SingulAction)}
                groupBy={(o: SingulAction) => o.category}
                getOptionLabel={(o: SingulAction | null) => o?.label ?? ''}
                isOptionEqualToValue={(a, b) => a?.name === b?.name && a?.category === b?.category}
                renderOption={(props, option) => (
                  <li {...props} key={`${option.category}-${option.name}`}>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <Typography sx={{ fontSize: '0.78rem', color: 'hsl(var(--foreground))' }}>{option.label}</Typography>
                      <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))' }}>
                        {option.name}
                      </Typography>
                    </Box>
                  </li>
                )}
                sx={{
                  flex: 1,
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: 'hsl(var(--card))',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.75rem',
                    color: 'hsl(var(--foreground))',
                    '& fieldset': { borderColor: 'hsl(var(--border))' },
                    '&:hover fieldset': { borderColor: 'hsl(var(--primary))' },
                    '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
                  },
                }}
                slotProps={{
                  popper: {
                    sx: {
                      zIndex: 10020,
                    },
                  },
                  paper: {
                    sx: {
                      backgroundColor: 'hsl(var(--card))',
                      color: 'hsl(var(--foreground))',
                      border: '1px solid hsl(var(--border))',
                      '& .MuiAutocomplete-groupLabel': {
                        backgroundColor: 'hsl(var(--muted) / 0.6)',
                        color: 'hsl(var(--muted-foreground))',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.6,
                        lineHeight: '24px',
                      },
                    },
                  },
                }}
                renderInput={(params) => (
                  <TextField {...params} placeholder="Select action" />
                )}
              />
            </Box>

            {/* Code card */}
            <Box
              sx={{
                position: 'relative',
                borderRadius: 1.5,
                border: '1px solid hsl(var(--border))',
                backgroundColor: 'hsl(var(--background))',
                overflow: 'hidden',
                boxShadow: '0 8px 24px -12px hsl(var(--primary) / 0.25)',
              }}
            >
              {/* Header bar — matches ApiCallViewer */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  py: 1,
                  borderBottom: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--card))',
                }}
              >
                <Code2 size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                <Typography
                  sx={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    color: 'hsl(var(--muted-foreground))',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Action
                </Typography>
                {selected && (
                  <Chip
                    label={selected.name}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace",
                      bgcolor: 'hsla(var(--severity-medium) / 0.15)',
                      color: 'hsl(var(--severity-medium))',
                      '& .MuiChip-label': { px: 0.75 },
                    }}
                  />
                )}
                <Box sx={{ flex: 1 }} />
                {/* Language toggle (cURL / Python) */}
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  {(['curl', 'python'] as SnippetLang[]).map((m) => (
                    <Chip
                      key={m}
                      label={m === 'curl' ? 'cURL' : 'Python'}
                      icon={m === 'curl' ? <Terminal size={12} /> : <Code2 size={12} />}
                      size="small"
                      onClick={() => setLang(m)}
                      sx={{
                        height: 22,
                        fontSize: '0.6rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        bgcolor: lang === m ? 'hsl(var(--primary) / 0.12)' : 'transparent',
                        color: lang === m ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                        border: lang === m ? '1px solid hsl(var(--primary) / 0.3)' : '1px solid transparent',
                        '& .MuiChip-icon': {
                          color: lang === m ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                        },
                        '&:hover': {
                          bgcolor: lang === m ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--muted))',
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
                <Button
                  size="small"
                  onClick={handlePlay}
                  disabled={playLoading}
                  startIcon={!playLoading && <PlayArrowIcon size={14} />}
                  sx={{
                    height: 26,
                    minWidth: 0,
                    px: 1.5,
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    textTransform: 'none',
                    color: 'hsl(var(--primary-foreground))',
                    backgroundColor: 'hsl(var(--primary))',
                    border: '1px solid hsl(var(--primary))',
                    boxShadow: '0 0 12px -2px hsl(var(--primary) / 0.6)',
                    '& .MuiButton-startIcon': { mr: 0.5 },
                    '&:hover': { backgroundColor: 'hsl(var(--primary) / 0.9)', boxShadow: '0 0 16px -2px hsl(var(--primary) / 0.7)' },
                    '&.Mui-disabled': { color: 'hsl(var(--primary-foreground) / 0.7)', backgroundColor: 'hsl(var(--primary) / 0.45)', boxShadow: 'none', borderColor: 'hsl(var(--primary) / 0.45)' },
                  }}
                >
                  {playLoading ? 'Running…' : 'Play'}
                </Button>
              </Box>

              {/* Editor area with line numbers */}
              <Box sx={{ display: 'flex', minHeight: 270 }}>
                <Box
                  aria-hidden
                  sx={{
                    userSelect: 'none',
                    py: 1.5,
                    pl: 1.25,
                    pr: 1,
                    textAlign: 'right',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.72rem',
                    lineHeight: 1.5,
                    color: 'hsl(var(--muted-foreground) / 0.6)',
                    borderRight: '1px solid hsl(var(--border))',
                    backgroundColor: 'hsl(var(--muted) / 0.25)',
                    minWidth: 36,
                  }}
                >
                  {Array.from({ length: lineCount }, (_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </Box>
                <Box sx={{ flex: 1, position: 'relative', minHeight: 270 }}>
                  <Box
                    aria-hidden
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      m: 0,
                      p: 1.5,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.72rem',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      pointerEvents: 'none',
                      overflow: 'hidden',
                    }}
                    dangerouslySetInnerHTML={{ __html: highlightSnippet(snippet, lang) + '\n' }}
                  />
                  <Box
                    component="textarea"
                    value={snippet}
                    onChange={(e: any) => setSnippet(e.target.value)}
                    spellCheck={false}
                    sx={{
                      position: 'relative',
                      width: '100%',
                      height: '100%',
                      minHeight: 270,
                      resize: 'vertical',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.72rem',
                      lineHeight: 1.5,
                      color: 'transparent',
                      WebkitTextFillColor: 'transparent',
                      backgroundColor: 'transparent',
                      border: 'none',
                      p: 1.5,
                      m: 0,
                      outline: 'none',
                      caretColor: 'hsl(var(--primary))',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      overflow: 'auto',
                      '&::selection': { color: 'inherit', backgroundColor: 'hsl(var(--primary) / 0.3)' },
                    }}
                  />
                </Box>
              </Box>
            </Box>
          </>
        )}

        {(playLoading || playResult !== null) && (() => {
          const parsedResult = (() => {
            if (!playResult) return null;
            try {
              const p = JSON.parse(playResult);
              return typeof p === 'object' && p !== null ? p : null;
            } catch { return null; }
          })();
          const needsAuth = !!parsedResult && (
            parsedResult.action === 'app_authentication' ||
            parsedResult.app_authentication === true
          );
          const pretty = appName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          const handleAuthClick = () => {
            if (onAuthenticate) {
              onAuthenticate(appName);
              return;
            }
            if (typeof document === 'undefined') return;
            const target = document.getElementById('app-auth-section');
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          };
          return (
            <Box ref={responseRef} sx={{ mt: 1.5 }}>
              {needsAuth && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    mb: 1,
                    borderRadius: 1.5,
                    border: '1px solid hsla(var(--severity-medium) / 0.3)',
                    bgcolor: 'hsla(var(--severity-medium) / 0.08)',
                  }}
                >
                  <LockIcon size={22} color={'hsl(var(--severity-medium))'} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                      {pretty} requires authentication
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                      {typeof parsedResult?.reason === 'string' && parsedResult.reason
                        ? parsedResult.reason
                        : `Connect your ${pretty} account so this action can run, then try again.`}
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={
                      <Avatar
                        src={appIcon || undefined}
                        alt=""
                        variant="rounded"
                        sx={{
                          width: 18, height: 18, borderRadius: 0.5,
                          bgcolor: 'hsl(var(--background) / 0.4)',
                          color: 'hsl(var(--background))',
                          fontSize: '0.7rem', fontWeight: 700,
                          '& img': { objectFit: 'contain' },
                        }}
                      >
                        {pretty.charAt(0)}
                      </Avatar>
                    }
                    onClick={handleAuthClick}
                    sx={{ height: 36, textTransform: 'none', fontWeight: 600, flexShrink: 0 }}
                  >
                    Authenticate {pretty}
                  </Button>
                </Box>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: needsAuth ? 'hsl(var(--severity-medium))' : 'hsl(140 60% 55%)' }} />
                <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))', letterSpacing: 0.4 }}>
                  response
                </Typography>
              </Box>
              {parsedResult ? (
                <Box
                  sx={{
                    p: 1.5,
                    maxHeight: 320,
                    overflow: 'auto',
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 1.5,
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    '& .json-view': {
                      fontSize: '0.72rem !important',
                      fontFamily: 'inherit !important',
                      bgcolor: 'transparent !important',
                    },
                  }}
                >
                  <JsonView
                    src={deepParseJsonStrings(parsedResult)}
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
                  component="pre"
                  sx={{
                    p: 1.5,
                    maxHeight: 240,
                    overflow: 'auto',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.7rem',
                    lineHeight: 1.5,
                    color: 'hsl(var(--foreground))',
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    m: 0,
                  }}
                >
                  {playLoading && !playResult ? 'Running…' : playResult}
                </Box>
              )}
            </Box>
          );
        })()}
      </Box>
    </Box>
  );
};

export default SingulActionsPreview;
