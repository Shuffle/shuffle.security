/**
 * AgentActivityList — standalone list of agent workflow executions.
 *
 * Self-contained: no project hooks, contexts, or services. Pass
 * `apiKey` / `apiBaseUrl` / `orgId` to authenticate against any Shuffle
 * backend. `onRunClick(run)` is called when a row is clicked — the
 * consumer decides what happens next (typically: open AgentExecutionDrawer).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '@/lib/router-compat';
import {
  Avatar,
  AvatarGroup,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';

import type { SxProps, Theme } from '@mui/material';
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  Database,
  FileText,
  GitBranch,
  Globe,
  Hand,
  Image as ImageIcon,
  Loader2,
  Server,
  Workflow as WorkflowIcon,
  XCircle,
  Zap,
  Search as SearchIcon
} from 'lucide-react';

import {
  searchAgentActivity,
  listAgentScheduleWorkflows,
  getAgentScheduleConfig,
  stopAgentSchedule,
  abortAgentExecution,
  type AgentRun,
  type AgentDecision,
  type AgentScheduleWorkflow,
} from '@/Shuffle-MCPs/agentActivity';
import {
  broadcastAgentAborted,
  subscribeAgentAborted,
  getLastOpenedAgentRun,
  setLastOpenedAgentRun,
  subscribeLastOpenedAgentRun,
} from '@/Shuffle-MCPs/agentRunSync';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { navigateToShuffleCore } from '@/Shuffle-MCPs/navigation';

import { diagnoseOutputWarning } from '@/Shuffle-MCPs/agentDiagnosis';
import { fetchAppsViaApiConfig } from '@/Shuffle-MCPs/appsCache';
import { collectLlmImageAttachments } from '@/Shuffle-MCPs/agentAttachments';
import { toast } from '@/Shuffle-MCPs/toast';
import { Pencil, StopCircle, AlertTriangle } from 'lucide-react';

import { SegmentedControl } from '@/Shuffle-MCPs/components/SegmentedControl';
import type { ShuffleHostProps } from '@/Shuffle-MCPs/host-props';

// ── Status / icon helpers ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { icon: React.ReactNode; color: string; label: string }
> = {
  FINISHED: { icon: <CheckCircle size={16} />, color: 'hsl(var(--severity-low, 142 71% 45%))', label: 'Completed' },
  SUCCESS: { icon: <CheckCircle size={16} />, color: 'hsl(var(--severity-low, 142 71% 45%))', label: 'Completed' },
  FAILED: { icon: <XCircle size={16} />, color: 'hsl(var(--severity-critical, 0 72% 55%))', label: 'Failed' },
  ABORTED: { icon: <XCircle size={16} />, color: 'hsl(var(--severity-critical, 0 72% 55%))', label: 'Aborted' },
  EXECUTING: { icon: <Loader2 size={16} />, color: 'hsl(var(--severity-medium, 38 92% 50%))', label: 'Running' },
  RUNNING: { icon: <Loader2 size={16} />, color: 'hsl(var(--severity-medium, 38 92% 50%))', label: 'Running' },
  WAITING: { icon: <Clock size={16} />, color: 'hsl(var(--severity-info, 217 91% 60%))', label: 'Waiting' },
  LIMIT_REACHED: { icon: <AlertTriangle size={16} />, color: 'hsl(var(--severity-critical, 0 72% 55%))', label: 'Limit reached' },
};

/** Returns a synthetic "LIMIT_REACHED" status when the run finished but its
 *  output indicates an AI token-limit hit. Otherwise returns the raw status. */
const getEffectiveStatus = (run: AgentRun): string => {
  const raw = (run.status || '').toUpperCase();
  if (raw === 'FINISHED' || raw === 'SUCCESS' || raw === 'FAILED' || raw === 'ABORTED') {
    try {
      const d = diagnoseOutputWarning(run as any);
      if (d?.kind === 'token_limit') return 'LIMIT_REACHED';
    } catch {
      // ignore
    }
  }
  return raw;
};

// Classifies an agent run by where it was triggered from. The icon to the
// left of each row uses this so the user can tell at a glance whether the
// agent was started manually from the /agents UI, kicked off by another
// workflow, or fired by a datastore automation (enrichments, etc.).
const SOURCE_ICON_SIZE = 18;

interface RunSourceInfo {
  kind: 'manual' | 'workflow' | 'datastore' | 'schedule' | 'webhook' | 'form' | 'unknown';
  label: string;
  reason: string;
  icon: React.ReactNode;
  datastoreKey?: string;
  datastoreCategory?: string;
}

const looksLikeExecutionId = (s: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());

// Datastore automations start the agent with an `execution_argument` that
// contains the standardized "Key: <value>" and "Category: <value>" markers
// (and usually also "TASK:" / "Finding"). The key/category values are the
// only thing we actually need to deep-link back to the datastore item, so
// we match those independently rather than demanding a strict ordering.
// Values can be anything that is not whitespace.
const DATASTORE_KEY_RE = /\bKey:\s*(\S+)/i;
const DATASTORE_CATEGORY_RE = /\bCategory:\s*(\S+)/i;

const parseDatastoreTask = (
  arg?: string,
): { key: string; category: string } | null => {
  if (!arg) return null;
  const k = arg.match(DATASTORE_KEY_RE);
  const c = arg.match(DATASTORE_CATEGORY_RE);
  if (!k || !c) return null;
  const key = (k[1] || '').trim();
  const category = (c[1] || '').trim();
  if (!key || !category) return null;
  return { key, category };
};

const isAIAgentResult = (result: any): boolean =>
  String(result?.action?.app_name || '').trim().toLowerCase() === 'ai agent';

const getAIAgentResultPayload = (run: AgentRun): unknown => {
  const results = Array.isArray((run as any).results) ? (run as any).results : [];
  const agentResult = results.find(isAIAgentResult);
  if (!agentResult || typeof agentResult !== 'object' || !('result' in agentResult)) return null;
  return tryParseJson(agentResult.result);
};

const getDirectAgentInput = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.original_input === 'string' && obj.original_input.trim()) {
    return obj.original_input.trim();
  }
  if (typeof obj.input === 'string' && obj.input.trim()) {
    return obj.input.trim();
  }
  return null;
};

/** Scan every plausible text field on a run for the datastore Key/Category
 *  markers. The canonical datastore prompt lives in the AI Agent entry inside
 *  `results[]`, under its `result.original_input` or `result.input` field. */
const findDatastoreTaskInRun = (
  run: AgentRun,
): { key: string; category: string } | null => {
  const agentInput = getDirectAgentInput(getAIAgentResultPayload(run));
  const agentHit = parseDatastoreTask(agentInput || undefined);
  if (agentHit) return agentHit;

  const anyRun = run as any;
  const candidates: string[] = [];
  if (typeof anyRun.original_input === 'string') candidates.push(anyRun.original_input);
  if (typeof anyRun.input === 'string') candidates.push(anyRun.input);
  if (run.execution_argument) candidates.push(run.execution_argument);
  if (run.result) candidates.push(run.result);
  if (Array.isArray(anyRun.results)) {
    try { candidates.push(JSON.stringify(anyRun.results)); } catch { /* ignore */ }
  }
  for (const c of candidates) {
    const hit = parseDatastoreTask(c);
    if (hit) return hit;
  }
  return null;
};


const classifyRunSource = (run: AgentRun): RunSourceInfo => {
  const raw = (run.execution_source || '').trim();
  const src = raw.toLowerCase();

  // Datastore automation can be detected either via execution_source or by
  // finding the standardized Key:/Category: markers anywhere on the run.
  // `execution_source` for datastore automations looks like
  // `datastore|<category>|<key>`.
  const sourceParts = raw.split('|');
  const fromSource =
    src.startsWith('datastore') && sourceParts.length > 2
      ? { category: sourceParts[1].trim(), key: sourceParts[2].trim() }
      : null;
  const ds = findDatastoreTaskInRun(run) || fromSource;
  if (
    ds ||
    src.includes('datastore') ||
    src.includes('enrichment') ||
    src.includes('automation')
  ) {
    return {
      kind: 'datastore',
      label: 'Datastore automation',
      reason: ds
        ? `Category: ${ds.category}\nKey: ${ds.key}\nClick to open it in the Datastore.`
        : 'Started by a datastore automation (e.g. enrichment trigger).',
      icon: <Database size={SOURCE_ICON_SIZE} />,
      datastoreKey: ds?.key,
      datastoreCategory: ds?.category,
    };
  }



  if (src.includes('schedule') || src.includes('cron')) {
    return {
      kind: 'schedule',
      label: 'Schedule',
      reason: 'Started by a scheduled trigger (cron).',
      icon: <Clock size={SOURCE_ICON_SIZE} />,
    };
  }
  if (src.includes('webhook') || src.includes('http')) {
    return {
      kind: 'webhook',
      label: 'Webhook',
      reason: 'Started by an incoming webhook / HTTP trigger.',
      icon: <Globe size={SOURCE_ICON_SIZE} />,
    };
  }
  if (src.includes('form')) {
    return {
      kind: 'form',
      label: 'Form',
      reason: 'Started by a form submission.',
      icon: <FileText size={SOURCE_ICON_SIZE} />,
    };
  }
  if (raw && looksLikeExecutionId(raw)) {
    return {
      kind: 'workflow',
      label: 'Workflow',
      reason: 'Started by another workflow as a subflow.',
      icon: <WorkflowIcon size={SOURCE_ICON_SIZE} />,
    };
  }
  if (src === '' || src === 'manual' || src === 'default' || src === 'demo') {
    return {
      kind: 'manual',
      label: 'Manual',
      reason: 'Started manually from the Agents UI.',
      icon: <Hand size={SOURCE_ICON_SIZE} />,
    };
  }
  return {
    kind: 'unknown',
    label: raw || 'Unknown',
    reason: raw
      ? `Started by "${raw}".`
      : 'Trigger source unknown.',
    icon: <Zap size={SOURCE_ICON_SIZE} />,
  };
};


const getRunIconColor = (run: AgentRun): string => {
  const status = getEffectiveStatus(run);
  if (status === 'FINISHED' || status === 'SUCCESS') return 'hsl(var(--severity-low, 142 71% 45%))';
  if (status === 'FAILED' || status === 'ABORTED') return 'hsl(var(--severity-critical, 0 72% 55%))';
  if (status === 'LIMIT_REACHED') return 'hsl(var(--severity-critical, 0 72% 55%))';
  if (status === 'EXECUTING' || status === 'RUNNING') return 'hsl(var(--severity-medium, 38 92% 50%))';
  return 'hsl(var(--primary, 24 100% 50%))';
};

const formatDuration = (run: AgentRun): string => {
  if (run.started_at && run.completed_at) {
    const start = Number(run.started_at);
    const end = Number(run.completed_at);
    if (!isNaN(start) && !isNaN(end)) {
      // Backend may return Unix milliseconds or seconds. Normalize to ms
      // while preserving sub-second precision.
      const toMs = (n: number) => (n > 1e12 ? n : n * 1000);
      const ms = Math.max(0, toMs(end) - toMs(start));
      if (ms < 1000) return `${(ms / 1000).toFixed(2)}s`;
      if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
      return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    }
  }
  if (run.duration) return `${run.duration.toFixed(2)}s`;
  return '';
};

const getTimeAgo = (dateStr: string): string => {
  try {
    const ts = isNaN(Number(dateStr)) ? new Date(dateStr).getTime() : Number(dateStr) * 1000;
    if (isNaN(ts)) return dateStr;
    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  } catch {
    return dateStr;
  }
};

/** Recursively walk a parsed JSON value and return the first non-empty string
 *  found under any of the given keys. Stops at MAX_DEPTH to avoid runaway
 *  traversal on huge result blobs. Keys are matched case-insensitively. */
const PROMPT_KEYS = [
  'original_input', 'originalinput',
  'input', 'prompt', 'user_input', 'userinput', 'user_prompt', 'userprompt',
  'question', 'query', 'message', 'text', 'content', 'task', 'instruction', 'instructions',
];
const deepFindPrompt = (value: unknown, depth = 0): string | null => {
  if (value == null || depth > 6) return null;
  if (typeof value === 'string') {
    // Try to parse nested JSON strings transparently.
    const s = value.trim();
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      try { return deepFindPrompt(JSON.parse(s), depth + 1); } catch { /* not JSON */ }
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = deepFindPrompt(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // First pass: direct hits on known prompt keys at this level.
    for (const key of Object.keys(obj)) {
      if (PROMPT_KEYS.includes(key.toLowerCase())) {
        const v = obj[key];
        if (typeof v === 'string' && v.trim()) return v.trim();
        // Some payloads wrap the prompt in another object/array — recurse into it.
        const nested = deepFindPrompt(v, depth + 1);
        if (nested) return nested;
      }
    }
    // Second pass: descend into other fields.
    for (const key of Object.keys(obj)) {
      if (PROMPT_KEYS.includes(key.toLowerCase())) continue;
      const hit = deepFindPrompt(obj[key], depth + 1);
      if (hit) return hit;
    }
  }
  return null;
};

const tryParseJson = (s: unknown): unknown => {
  if (typeof s !== 'string') return s;
  const trimmed = s.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { return trimmed; }
};

/** Extract the original user prompt from a run, when available. */
const getRunPrompt = (run: AgentRun): string | null => {
  const anyRun = run as any;
  // 1) AI Agent node result inside results[]. Its `result` payload is the
  //    canonical agent result; read direct `original_input` first, then `input`.
  const agentInput = getDirectAgentInput(getAIAgentResultPayload(run));
  if (agentInput) return agentInput;

  // 2) Fallback: scan the AI Agent payload for older/nested shapes.
  const results = Array.isArray(anyRun.results) ? anyRun.results : null;
  if (results) {
    const agentResult = results.find(isAIAgentResult);
    if (agentResult?.result) {
      const hit = deepFindPrompt(tryParseJson(agentResult.result));
      if (hit) return hit;
    }
    // Also scan every other result row — some flows place the user input in
    // a Webhook / Trigger / Form node upstream of the AI Agent.
    for (const r of results) {
      if (r === agentResult) continue;
      const hit = deepFindPrompt(tryParseJson(r?.result));
      if (hit) return hit;
    }
  }
  // 3) Search-row fallbacks for runs without a results[] AI Agent entry.
  if (typeof anyRun.original_input === 'string' && anyRun.original_input.trim()) {
    return anyRun.original_input.trim();
  }
  if (typeof anyRun.input === 'string' && anyRun.input.trim()) {
    return anyRun.input.trim();
  }
  if (run.result) {
    const hit = deepFindPrompt(tryParseJson(run.result));
    if (hit) return hit;
  }
  // 4) Top-level `execution_argument` (sometimes raw text, sometimes JSON).
  if (run.execution_argument) {
    const parsed = tryParseJson(run.execution_argument);
    const hit = deepFindPrompt(parsed);
    if (hit) return hit;
    // Last resort: treat the whole thing as the prompt if it's short plain text.
    if (typeof parsed === 'string' && parsed.length < 240) return parsed;
  }
  return null;
};




/**
 * Strip Markdown syntax so a prompt/answer reads as plain text in single-line
 * title/subtitle rows. Prompts often come in with bold/italic/heading/inline
 * code markers (e.g. "**Answer this question:** @AIAgent ..."), which look
 * noisy when truncated and ellipsised. We render titles as text (not HTML),
 * so we normalize to plain text rather than rendering Markdown.
 */
const stripMarkdown = (input: string): string => {
  if (!input) return '';
  let s = input;
  // Fenced/inline code
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(/`([^`]*)`/g, '$1');
  // Images ![alt](url) → alt
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Links [text](url) → text
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Bold/italic markers (**, __, *, _)
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2');
  s = s.replace(/(\*|_)(?=\S)([^*_\n]+?)\1/g, '$2');
  // Headings, blockquotes, list bullets at line start
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  s = s.replace(/^\s{0,3}>\s?/gm, '');
  s = s.replace(/^\s*[-*+]\s+/gm, '');
  s = s.replace(/^\s*\d+\.\s+/gm, '');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
};

const getRunTitle = (run: AgentRun): string => {
  const prompt = getRunPrompt(run);
  if (prompt) {
    const oneLine = stripMarkdown(prompt);
    return oneLine.length > 80 ? oneLine.slice(0, 80) + '…' : oneLine;
  }
  if (run.workflow?.name) return stripMarkdown(run.workflow.name);
  return `Execution ${run.execution_id?.slice(0, 8) || '—'}`;
};

/** Count the number of decisions the agent made during this run. */
const getDecisionCount = (run: AgentRun): number => {
  if (Array.isArray(run.decisions)) return run.decisions.length;
  return 0;
};

const getRunSubtitle = (run: AgentRun): string => {
  if (run.result) {
    try {
      const p = JSON.parse(run.result);
      if (p.output && typeof p.output === 'string') {
        const out = stripMarkdown(p.output);
        return out.length > 120 ? out.slice(0, 120) + '…' : out;
      }
      if (p.original_input && typeof p.original_input === 'string') {
        const inp = stripMarkdown(p.original_input);
        return inp.length > 120 ? inp.slice(0, 120) + '…' : inp;
      }
      if (p.message && typeof p.message === 'string') return stripMarkdown(p.message);
    } catch {
      if (run.result.length < 120) return stripMarkdown(run.result);
    }
  }
  const status = getEffectiveStatus(run);
  const isRunning = status === 'EXECUTING' || status === 'RUNNING' || status === 'WAITING';
  return run.execution_source || (isRunning ? 'Agent still running…' : 'Agent execution');
};

// ── Run row ──────────────────────────────────────────────────────────────────

export type ToolStatus = 'success' | 'failure' | 'waiting' | 'unknown';

export interface RunTool {
  name: string;
  status: ToolStatus;
  id?: string;
}

const normalizeResultStatus = (s?: string): ToolStatus => {
  const v = (s || '').toUpperCase();
  if (v === 'SUCCESS' || v === 'FINISHED') return 'success';
  if (v === 'FAILURE' || v === 'FAILED' || v === 'ABORTED') return 'failure';
  if (v === 'WAITING' || v === 'SKIPPED') return 'waiting';
  return 'unknown';
};

/** Extract distinct tools/apps used in this run.
 *
 *  Prefers the agent's own `allowed_actions` list (format: "app:<id>:<name>"),
 *  which is the authoritative set of apps configured for the run. Falls back
 *  to scraping results/decisions only when allowed_actions is not available
 *  (e.g. very old runs). Per-app status is derived from matching results. */
const getRunTools = (run: AgentRun): RunTool[] => {
  const map = new Map<string, ToolStatus>();
  const ids = new Map<string, string>();
  const skip = (s: string) => /^(ai\s*agent|shuffle\s*agent|shuffle_agent)$/i.test(s);
  const rank: Record<ToolStatus, number> = { failure: 3, waiting: 2, success: 1, unknown: 0 };
  const merge = (name?: string, status?: ToolStatus, id?: string) => {
    if (!name) return;
    const s = String(name).trim();
    if (!s || skip(s)) return;
    const next = status || 'unknown';
    const prev = map.get(s);
    if (!prev || rank[next] > rank[prev]) map.set(s, next);
    if (id && !ids.has(s)) ids.set(s, id);
  };

  const allowed: string[] | undefined = (run as any).allowed_actions;
  if (Array.isArray(allowed) && allowed.length > 0) {
    // 1) Seed from allowed_actions — the configured app list.
    for (const entry of allowed) {
      if (typeof entry !== 'string') continue;
      const parts = entry.split(':');
      if (parts.length < 3 || parts[0] !== 'app') continue;
      const id = parts[1];
      const name = parts.slice(2).join(':');
      merge(name, 'unknown', id);
    }
    // 2) Upgrade statuses from any results/decisions that match by name.
    const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '_');
    const known = new Map<string, string>();
    for (const real of map.keys()) known.set(normalize(real), real);
    const apply = (name?: string, status?: ToolStatus) => {
      if (!name) return;
      const hit = known.get(normalize(name));
      if (hit) merge(hit, status);
    };
    (run.results || []).forEach((r) => {
      apply(r?.action?.app_name || r?.action?.label, normalizeResultStatus(r?.status));
    });
    (run.decisions || []).forEach((d) => {
      if (typeof d?.tool === 'string') apply(d.tool, normalizeResultStatus(d?.status as string));
    });
  } else {
    // Legacy fallback for runs without allowed_actions.
    (run.results || []).forEach((r) => {
      merge(r?.action?.app_name || r?.action?.label, normalizeResultStatus(r?.status));
    });
    (run.decisions || []).forEach((d) => {
      if (typeof d?.tool === 'string') merge(d.tool, normalizeResultStatus(d?.status as string));
    });
  }
  return Array.from(map.entries()).slice(0, 6).map(([name, status]) => ({ name, status, id: ids.get(name) }));
};

const TOOL_STATUS_RING: Record<ToolStatus, string> = {
  success: 'hsl(var(--severity-low, 142 71% 45%))',
  failure: 'hsl(var(--severity-critical, 0 72% 55%))',
  waiting: 'hsl(var(--severity-medium, 38 92% 50%))',
  unknown: 'hsl(var(--border))',
};

const TOOL_STATUS_LABEL: Record<ToolStatus, string> = {
  success: 'ran successfully',
  failure: 'failed',
  waiting: 'needs input',
  unknown: 'used',
};

interface RunRowProps {
  run: AgentRun;
  onClick: () => void;
  sx?: SxProps<Theme>;
  appIcons?: Record<string, string>;
  onAppClick?: (app: { id?: string; name: string }) => void;
  apiKey?: string;
  apiBaseUrl?: string;
  orgId?: string;
  abortingIds?: Set<string>;
  onAbort?: (run: AgentRun) => void;
}


const normToolKey = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, '_');

const AgentRunRow = ({ run, onClick, sx, appIcons, onAppClick, apiKey, apiBaseUrl, orgId, abortingIds, onAbort }: RunRowProps) => {
  const navigate = useNavigate();
  const statusKey = getEffectiveStatus(run);
  const iconColor = getRunIconColor(run);
  const duration = formatDuration(run);
  const tools = getRunTools(run);
  const decisionCount = getDecisionCount(run);
  const attachmentCount = collectLlmImageAttachments(run).length;
  const isRunning = statusKey === 'EXECUTING' || statusKey === 'RUNNING' || statusKey === 'WAITING';
  const isAborting = !!run.execution_id && !!abortingIds?.has(run.execution_id);
  const wfId = run.workflow_id || (run as any)?.workflow?.id;
  const canAbort = isRunning && !!run.execution_id && !!wfId && !isAborting;



  return (
    <Box
      onClick={onClick}
      sx={[
        {
          borderRadius: 2,
          border: '1px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--card))',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 2.5,
          py: 2,
          cursor: 'pointer',
          transition: 'background 0.15s ease, border-color 0.15s ease',
          '&:hover': {
            bgcolor: 'hsla(var(--muted) / 0.5)',
            borderColor: 'hsl(var(--muted-foreground) / 0.3)',
          },
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {(() => {
        const sourceInfo = classifyRunSource(run);
        const dsLink =
          sourceInfo.kind === 'datastore' && sourceInfo.datastoreKey && sourceInfo.datastoreCategory
            ? `https://shuffler.io/admin?tab=datastore&category=${encodeURIComponent(sourceInfo.datastoreCategory)}&key=${encodeURIComponent(sourceInfo.datastoreKey)}`
            : null;
        return (
          <Tooltip
            title={
              <Box sx={{ lineHeight: 1.4 }}>
                <Box sx={{ fontWeight: 600 }}>{sourceInfo.label}</Box>
                <Box sx={{ opacity: 0.85, whiteSpace: 'pre-line' }}>{sourceInfo.reason}</Box>
              </Box>

            }
            placement="top"
            arrow
          >
            <Box
              onClick={
                dsLink
                  ? async (e: React.MouseEvent) => {
                      e.stopPropagation();
                      await navigateToShuffleCore(dsLink, { newTab: true });
                    }
                  : undefined
              }
              sx={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: `${iconColor}15`,
                color: iconColor,
                flexShrink: 0,
                cursor: dsLink ? 'pointer' : 'inherit',
                transition: 'background 0.15s ease',
                '&:hover': dsLink
                  ? { bgcolor: `${iconColor}30` }
                  : undefined,
              }}
            >
              {sourceInfo.icon}
            </Box>
          </Tooltip>
        );
      })()}


      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
          <Typography
            sx={{
              fontSize: '0.9rem',
              fontWeight: 500,
              color: 'hsl(var(--foreground))',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {getRunTitle(run)}
          </Typography>
        </Box>

        <Typography
          sx={{
            fontSize: '0.78rem',
            color: 'hsl(var(--muted-foreground))',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {getRunSubtitle(run)}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
          <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', opacity: 0.7 }}>
            {run.started_at ? getTimeAgo(run.started_at) : '—'}
          </Typography>
          {duration && (
            <>
              <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', opacity: 0.4 }}>·</Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', opacity: 0.7 }}>
                {duration}
              </Typography>
            </>
          )}
          {decisionCount > 0 && (
            <>
              <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', opacity: 0.4 }}>·</Typography>
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'hsl(var(--muted-foreground))', opacity: 0.7 }}>
                <GitBranch size={11} />
                <Typography sx={{ fontSize: '0.72rem', color: 'inherit' }}>
                  {decisionCount} {decisionCount === 1 ? 'decision' : 'decisions'}
                </Typography>
              </Box>
            </>
          )}
          {attachmentCount > 0 && (
            <>
              <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', opacity: 0.4 }}>·</Typography>
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'hsl(var(--muted-foreground))', opacity: 0.7 }}>
                <ImageIcon size={11} />
                <Typography sx={{ fontSize: '0.72rem', color: 'inherit' }}>
                  {attachmentCount} {attachmentCount === 1 ? 'attachment' : 'attachments'}
                </Typography>
              </Box>
            </>
          )}
        </Box>
      </Box>

      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{
          display: { xs: 'none', sm: 'flex' },
          alignItems: 'center',
          justifyContent: 'flex-end',
          flexShrink: 0,
          ml: tools.length > 0 ? 1 : 0,
          width: tools.length > 0 ? 140 : 0,
          minHeight: tools.length > 0 ? 28 : 0,
        }}
      >
        {tools.length > 0 ? (
          <AvatarGroup
            max={5}
            sx={{
              '& .MuiAvatar-root': {
                width: 28,
                height: 28,
                fontSize: '0.7rem',
                borderColor: 'hsl(var(--border))',
                bgcolor: 'hsl(var(--muted))',
                color: 'hsl(var(--muted-foreground))',
              },
            }}
          >
            {tools.map((t) => {
              const icon = appIcons?.[normToolKey(t.name)];
              const label = t.name.replace(/_/g, ' ');
              const slug = t.name.toLowerCase().replace(/\s+/g, '_');
              const ring = TOOL_STATUS_RING[t.status];
              return (
                <Tooltip key={t.name} title={`${label} — ${TOOL_STATUS_LABEL[t.status]}`} arrow>
                  <Avatar
                    src={icon || undefined}
                    alt={label}
                    variant="rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onAppClick) {
                        onAppClick({ id: t.id, name: t.name });
                      } else {
                        navigate(`/apps/${encodeURIComponent(slug)}`);
                      }
                    }}
                    sx={{
                      cursor: 'pointer',
                      borderColor: `${ring} !important`,
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      transition: 'transform 0.15s ease, border-color 0.15s ease',
                      '&:hover': {
                        transform: 'scale(1.08)',
                        borderColor: 'hsl(var(--primary)) !important',
                      },
                    }}
                  >
                    {label.charAt(0).toUpperCase()}
                  </Avatar>
                </Tooltip>
              );
            })}
          </AvatarGroup>
        ) : null}
      </Box>

      {canAbort && (
        <Tooltip title={isAborting ? 'Aborting…' : 'Abort this execution'} arrow placement="top">
          <span>
            <IconButton
              size="small"
              disabled={isAborting}
              onClick={(e) => {
                e.stopPropagation();
                onAbort?.(run);
              }}
              sx={{
                flexShrink: 0,
                ml: 1.5,
                color: 'hsl(var(--muted-foreground))',
                '&:hover': { color: 'hsl(var(--destructive))', bgcolor: 'hsl(var(--muted))' },
              }}
            >
              {isAborting ? (
                <CircularProgress size={16} sx={{ color: 'hsl(var(--destructive))' }} />
              ) : (
                <StopCircle size={18} />
              )}
            </IconButton>
          </span>
        </Tooltip>
      )}

    </Box>

  );
};

// ── List ─────────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Completed', value: 'FINISHED' },
  { label: 'Running', value: 'EXECUTING' },
  { label: 'Failed', value: 'ABORTED' },
];

/**
 * A usecase-backed agent "type" surfaced in the run filter dropdown.
 * Hosts supply only the usecases that are actually enabled for the tenant.
 */
export interface AgentUsecaseFilter {
  /** Unique id (used as the menu value). */
  id: string;
  /** Menu label, e.g. "Incident Handler". */
  label: string;
  /** Case-insensitive substrings matched against run source/workflow metadata. */
  matchTokens: string[];
}

export interface AgentActivityListProps extends ShuffleHostProps {
  /** Optional Shuffle API key. Falls back to the shared API_CONFIG. */
  apiKey?: string;
  /** Optional Shuffle backend base URL. Falls back to the shared API_CONFIG. */
  apiBaseUrl?: string;
  /** Optional Shuffle Org ID — sent as the `Org-Id` header. */
  orgId?: string;
  /** Called when a run row is clicked. */
  onRunClick?: (run: AgentRun) => void;
  /** Called when "Edit" is clicked on a selected scheduled workflow. */
  onEditWorkflow?: (info: { workflowId: string; name: string; prompt: string; apps: Array<{ name: string; id?: string }> }) => void;
  /** Show the search box. Default: true. */
  showSearchBar?: boolean;
  /** Show the status filter chips. Default: true. */
  showStatusChips?: boolean;
  /** Page size. Default: 50. */
  limit?: number;
  /** Optional page size sent as the `?top` query parameter. */
  top?: number;
  /** Empty-state heading. */
  emptyTitle?: string;
  /** Empty-state subtitle. */
  emptySubtitle?: string;
  /** Optional className forwarded to the root container. */
  className?: string;
  /** Style overrides merged into the root container sx. */
  sx?: SxProps<Theme>;
  /** Style overrides for the filter/search toolbar. */
  toolbarSx?: SxProps<Theme>;
  /** Style overrides for each individual run row. */
  rowSx?: SxProps<Theme>;
  /** Usecase-backed agent types shown in the run filter dropdown. */
  usecaseFilters?: AgentUsecaseFilter[];
  /** Pre-loaded initial/fallback runs, e.g. for demo mode or offline preview. */
  initialRuns?: AgentRun[];
  /** When true, skips remote activity fetching entirely (e.g. for demo runs). */
  disableFetch?: boolean;
  /** Optional custom renderer for the app detail drawer (e.g. from Shuffle-Core) */
  renderAppDetailDrawer?: (props: {
    open: boolean;
    onClose: () => void;
    appName?: string | null;
    appId?: string | null;
    activeOrgId?: string | null;
    globalUrl?: string;
    theme?: string;
    colorMode?: 'light' | 'dark' | 'auto';
  }) => React.ReactNode;
}

const AgentActivityList = ({
  apiKey,
  apiBaseUrl,
  orgId,
  onRunClick,
  renderAppDetailDrawer,
  onEditWorkflow,
  showSearchBar = true,
  showStatusChips = true,
  limit = 50,
  top,
  emptyTitle = 'No agent activity found',
  emptySubtitle = 'The agent has not performed any actions yet',
  className,
  sx,
  toolbarSx,
  rowSx,
  usecaseFilters = [],
  globalUrl,
  theme,
  colorMode,
  initialRuns,
  disableFetch = false,
}: AgentActivityListProps) => {
  const [appDrawer, setAppDrawer] = useState<{ id?: string; name: string } | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>(initialRuns || []);
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [agentWorkflows, setAgentWorkflows] = useState<AgentScheduleWorkflow[]>([]);
  const [workflowFilter, setWorkflowFilter] = useState('');
  const [usecaseFilter, setUsecaseFilter] = useState('');
  const [stopOpen, setStopOpen] = useState(false);
  const [stopLoading, setStopLoading] = useState(false);
  const [appIcons, setAppIcons] = useState<Record<string, string>>({});
  const [enrichedRuns, setEnrichedRuns] = useState<Record<string, Partial<AgentRun>>>({});
  // Mirror of `enrichedRuns` + the set of execution ids already handled, so
  // the enrichment effect never restarts work on re-render.
  const enrichedRunsRef = useRef<Record<string, Partial<AgentRun>>>({});
  const processedRunIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { enrichedRunsRef.current = enrichedRuns; }, [enrichedRuns]);

  const [abortingIds, setAbortingIds] = useState<Set<string>>(new Set());
  const [abortedIds, setAbortedIds] = useState<Set<string>>(new Set());
  const [lastOpenedRunId, setLastOpenedRunId] = useState<string | null>(() => getLastOpenedAgentRun());

  // Keep this list in sync with aborts triggered elsewhere (e.g. the Agent drawer).
  useEffect(() => {
    const unsubAbort = subscribeAgentAborted((eid) => {
      setAbortedIds((prev) => (prev.has(eid) ? prev : new Set([...Array.from(prev), eid])));
      setRuns((prev) => prev.map((r) => (r.execution_id === eid ? { ...r, status: 'ABORTED' } : r)));
    });
    const unsubOpened = subscribeLastOpenedAgentRun((eid) => setLastOpenedRunId(eid));
    return () => { unsubAbort(); unsubOpened(); };
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);


  const selectedAgentWorkflow = agentWorkflows.find((w) => w.id === workflowFilter) || null;

  const openEditPrompt = useCallback(async () => {
    if (!workflowFilter) return;
    try {
      const { prompt, apps } = await getAgentScheduleConfig(workflowFilter, { apiKey, apiBaseUrl, orgId });
      onEditWorkflow?.({
        workflowId: workflowFilter,
        name: selectedAgentWorkflow?.name || 'Schedule',
        prompt,
        apps,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workflow');
    }
  }, [workflowFilter, selectedAgentWorkflow, apiKey, apiBaseUrl, orgId, onEditWorkflow]);


  const confirmStop = useCallback(async () => {
    if (!workflowFilter) return;
    setStopLoading(true);
    try {
      await stopAgentSchedule(workflowFilter, { apiKey, apiBaseUrl, orgId });
      setStopOpen(false);
      // Refresh workflow list and clear the filter so list goes back to "All".
      const items = await listAgentScheduleWorkflows({ apiKey, apiBaseUrl, orgId });
      setAgentWorkflows(items);
      setWorkflowFilter('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to stop schedule');
    } finally {
      setStopLoading(false);
    }
  }, [workflowFilter, apiKey, apiBaseUrl, orgId]);

  const handleAbort = useCallback(
    async (run: AgentRun) => {
      const eid = run.execution_id;
      const wfId = run.workflow_id || (run as any)?.workflow?.id;
      if (!eid || !wfId) return;
      const prevStatus = run.status;
      // Optimistic: spinner + ABORTED status on the same frame as the click,
      // and broadcast so any other mounted view stays in sync.
      setAbortingIds((prev) => new Set([...Array.from(prev), eid]));
      setAbortedIds((prev) => new Set([...Array.from(prev), eid]));
      broadcastAgentAborted(eid);
      try {
        await abortAgentExecution({
          workflowId: wfId,
          executionId: eid,
          authorization: run.authorization,
          apiKey,
          apiBaseUrl,
          orgId,
        });
        
        setRuns((prev) =>
          prev.map((r) => (r.execution_id === eid ? { ...r, status: 'ABORTED' } : r)),
        );
      } catch (e) {
        // Roll the optimistic state back so the run shows its real status again.
        setAbortedIds((prev) => {
          const next = new Set(Array.from(prev));
          next.delete(eid);
          return next;
        });
        setRuns((prev) =>
          prev.map((r) => (r.execution_id === eid ? { ...r, status: prevStatus } : r)),
        );
        toast({
          title: 'Abort failed',
          description: e instanceof Error ? e.message : 'Failed to abort execution',
          variant: 'destructive',
        });
      } finally {
        setAbortingIds((prev) => {
          const next = new Set(Array.from(prev));
          next.delete(eid);
          return next;
        });
      }
    },
    [apiKey, apiBaseUrl, orgId],
  );


  const updateSearchQuery = useCallback((q: string) => {

    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(q), 350);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const fetchRuns = useCallback(
    async (append = false, cursorParam = '') => {
      if (disableFetch) {
        if (initialRuns && !append) {
          setRuns(initialRuns);
        }
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const result = await searchAgentActivity({
          limit,
          top,
          status: statusFilter,
          cursor: cursorParam,
          apiKey,
          apiBaseUrl,
          orgId,
          workflowId: workflowFilter || 'AGENT',
        });
        if (result.success && result.runs && result.runs.length > 0) {
          setRuns((prev) => (append ? [...prev, ...result.runs] : result.runs));
          setCursor(result.cursor);
          setHasMore(!!result.cursor && result.runs.length > 0);
        } else if (result.success) {
          setRuns((prev) => (append ? prev : initialRuns && initialRuns.length > 0 ? initialRuns : []));
          setCursor(result.cursor);
          setHasMore(false);
        } else {
          if (initialRuns && initialRuns.length > 0 && !append) {
            setRuns(initialRuns);
          } else {
            setError('Failed to fetch agent activity');
          }
        }
      } catch (err) {
        if (initialRuns && initialRuns.length > 0 && !append) {
          setRuns(initialRuns);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to fetch agent activity');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [disableFetch, initialRuns, statusFilter, limit, top, apiKey, apiBaseUrl, orgId, workflowFilter],
  );

  useEffect(() => {
    fetchRuns(false, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, apiKey, apiBaseUrl, orgId, workflowFilter]);

  // Load the agentic workflow list (workflow_type = AGENT_SCHEDULE) once.
  useEffect(() => {
    let cancelled = false;
    listAgentScheduleWorkflows({ apiKey, apiBaseUrl, orgId })
      .then((items) => { if (!cancelled) setAgentWorkflows(items); })
      .catch(() => { /* non-fatal — dropdown stays "All" only */ });
    return () => { cancelled = true; };
  }, [apiKey, apiBaseUrl, orgId]);

  // Load app icons once so each run row can render the same Avatar-based
  // app indicators used elsewhere in the agent UI.
  useEffect(() => {
    let cancelled = false;
    fetchAppsViaApiConfig()
      .then((apps) => {
        if (cancelled || !Array.isArray(apps)) return;
        const map: Record<string, string> = {};
        for (const a of apps as Array<{ name?: string; large_image?: string; image_url?: string; image?: string }>) {
          const name = a?.name;
          const img = a?.large_image || a?.image_url || a?.image;
          if (!name || !img) continue;
          map[normToolKey(name)] = img;
        }
        setAppIcons(map);
      })
      .catch(() => { /* icons are non-critical — fall back to initials */ });
    return () => { cancelled = true; };
  }, []);

  // Enrich each visible run with full execution details (results, decisions,
  // execution_argument). The search endpoint sometimes already returns the
  // full payload — in that case we skip the sideload entirely and only fetch
  // `/api/v1/executions/{executionId}?authorization=...` as a fallback when
  // the row is missing the fields we need to render real prompts, app icons,
  // decision counts, and per-tool status.
  //
  // CPU notes: patches are buffered and flushed in one batched state update
  // (instead of one re-render per execution), the work is scheduled on idle
  // time so typing in the prompt field stays responsive, and every execution
  // id is only ever processed once (tracked in a ref) so re-renders of the
  // run list do not restart the whole enrichment pass.
  useEffect(() => {
    if (!runs.length) return;
    let cancelled = false;

    // Build the same patch shape we'd get from the execution endpoint, but
    // sourced from whatever the /workflows/search row already contains. The
    // AI Agent's decisions / original_input / allowed_actions live inside
    // results[i].result as a JSON string, so a row can be "complete" even
    // when its top-level fields look empty.
    const buildPatchFromRun = (
      r: AgentRun,
    ): (Partial<AgentRun> & { allowed_actions?: string[] }) | null => {
      const results = Array.isArray((r as any).results) ? (r as any).results : null;
      if (!results || results.length === 0) return null;
      const agentResult = results.find((x: any) => x?.action?.app_name === 'AI Agent');
      let decisions: AgentDecision[] | undefined = Array.isArray(r.decisions) ? r.decisions : undefined;
      let originalInput: string | undefined;
      let allowedActions: string[] | undefined;
      if (agentResult?.result) {
        try {
          const parsed = JSON.parse(agentResult.result);
          if (!decisions && Array.isArray(parsed?.decisions)) decisions = parsed.decisions;
          if (typeof parsed?.original_input === 'string') originalInput = parsed.original_input;
          if (Array.isArray(parsed?.allowed_actions)) allowedActions = parsed.allowed_actions;
        } catch { /* ignore */ }
      }
      const hasPrompt = !!r.execution_argument || !!originalInput || !!agentResult?.result;
      if (!decisions || !hasPrompt) return null;
      const patch: Partial<AgentRun> & { allowed_actions?: string[] } = {
        results,
        execution_argument: r.execution_argument,
        result: agentResult?.result ?? (r as any).result,
        decisions,
        allowed_actions: allowedActions,
      };
      if (originalInput && !patch.execution_argument) {
        patch.execution_argument = JSON.stringify({ original_input: originalInput });
      }
      return patch;
    };

    // Buffered flush — one state update per batch instead of per execution.
    let pending: Record<string, Partial<AgentRun> & { allowed_actions?: string[] }> = {};
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      flushTimer = null;
      if (cancelled) return;
      const batch = pending;
      pending = {};
      if (Object.keys(batch).length === 0) return;
      setEnrichedRuns((prev) => ({ ...prev, ...batch }));
    };
    const queuePatch = (id: string, patch: Partial<AgentRun> & { allowed_actions?: string[] }) => {
      pending[id] = patch;
      if (!flushTimer) flushTimer = setTimeout(flush, 250);
    };

    // First pass: hydrate from native data without any network calls.
    const needsFetch: string[] = [];
    for (const r of runs) {
      const id = r.execution_id;
      if (!id || enrichedRunsRef.current[id] || processedRunIdsRef.current.has(id)) continue;
      if (id.startsWith('demo-') || id.startsWith('dummy-')) {
        processedRunIdsRef.current.add(id);
        continue;
      }
      const native = buildPatchFromRun(r);
      if (native) {
        processedRunIdsRef.current.add(id);
        queuePatch(id, native);
      } else {
        needsFetch.push(id);
      }
    }

    // Sideload only for the rows that did not already carry enough data.
    const CONCURRENCY = 2;
    let i = 0;
    const fetchOne = async (executionId: string) => {
      try {
        const resp = await fetch(
          getApiUrl(
            `/api/v1/executions/${encodeURIComponent(executionId)}?authorization=${encodeURIComponent(executionId)}`,
          ),
          {
            method: 'GET',
            credentials: 'include',
            headers: {
              ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : getAuthHeader()),
              ...(orgId ? { 'Org-Id': orgId } : {}),
            },
          },
        );
        if (!resp.ok || cancelled) return;
        const json = await resp.json().catch(() => null);
        if (!json || cancelled) return;
        let decisions: AgentDecision[] | undefined;
        let originalInput: string | undefined;
        let allowedActions: string[] | undefined;
        const agentResult = Array.isArray(json.results)
          ? json.results.find((r: any) => r?.action?.app_name === 'AI Agent')
          : null;
        if (agentResult?.result) {
          try {
            const parsed = JSON.parse(agentResult.result);
            if (Array.isArray(parsed?.decisions)) decisions = parsed.decisions;
            if (typeof parsed?.original_input === 'string') originalInput = parsed.original_input;
            if (Array.isArray(parsed?.allowed_actions)) allowedActions = parsed.allowed_actions;
          } catch { /* ignore */ }
        }
        const patch: Partial<AgentRun> & { allowed_actions?: string[] } = {
          results: json.results,
          execution_argument: json.execution_argument,
          result: agentResult?.result,
          decisions,
          allowed_actions: allowedActions,
        };
        if (originalInput && !patch.execution_argument) {
          patch.execution_argument = JSON.stringify({ original_input: originalInput });
        }
        queuePatch(executionId, patch);
      } catch { /* non-critical */ }
    };

    // Yield to the browser between each fetch so the main thread stays free
    // for typing/scrolling.
    const idle = (fn: () => void) => {
      const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: any) => number);
      if (ric) ric(fn, { timeout: 1000 });
      else setTimeout(fn, 32);
    };
    const nextIdle = () => new Promise<void>((resolve) => idle(resolve));

    if (needsFetch.length > 0) {
      for (const id of needsFetch) processedRunIdsRef.current.add(id);
      const workers = Array.from({ length: Math.min(CONCURRENCY, needsFetch.length) }, async () => {
        while (!cancelled && i < needsFetch.length) {
          const id = needsFetch[i++];
          await nextIdle();
          if (cancelled) return;
          await fetchOne(id);
        }
      });
      Promise.all(workers).catch(() => { /* ignore */ });
    }

    return () => {
      cancelled = true;
      if (flushTimer) clearTimeout(flushTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, apiKey, orgId]);


  const mergedRuns = runs.map((r) => {
    const patch = r.execution_id ? enrichedRuns[r.execution_id] : undefined;
    const merged = patch ? { ...r, ...patch } : r;
    // Locally aborted runs stay ABORTED even if a poll returns a stale status.
    return r.execution_id && abortedIds.has(r.execution_id)
      ? { ...merged, status: 'ABORTED' }
      : merged;
  });


  const loadMore = useCallback(() => {
    if (cursor && !isLoading) fetchRuns(true, cursor);
  }, [cursor, isLoading, fetchRuns]);

  const activeUsecase = usecaseFilters.find((u) => u.id === usecaseFilter) || null;

  const usecaseMatchedRuns = activeUsecase
    ? mergedRuns.filter((r) => {
        const hay = [
          r.execution_source,
          r.workflow?.name,
          r.workflow?.description,
          r.execution_argument,
          ...(r.workflow?.actions || []).flatMap((a) => [a.app_name, a.label]),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return activeUsecase.matchTokens.some((t) => hay.includes(t.toLowerCase()));
      })
    : mergedRuns;

  const filteredRuns = debouncedQuery
    ? usecaseMatchedRuns.filter((r) => {
        const hay = [
          getRunTitle(r),
          getRunSubtitle(r),
          r.execution_id,
          r.execution_source,
          r.status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(debouncedQuery.toLowerCase());
      })
    : usecaseMatchedRuns;

  return (
    <Box
      className={className}
      sx={[{ display: 'flex', flexDirection: 'column', gap: 2 }, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}
    >
      {(showSearchBar || showStatusChips) && (
        <Box sx={[{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, flexWrap: 'wrap' }, ...(Array.isArray(toolbarSx) ? toolbarSx : toolbarSx ? [toolbarSx] : [])]}>
          <Select
            size="small"
            value={usecaseFilter ? `uc:${usecaseFilter}` : workflowFilter}
            onChange={(e) => {
              const val = String(e.target.value);
              if (val.startsWith('uc:')) {
                setUsecaseFilter(val.slice(3));
                setWorkflowFilter('');
              } else {
                setUsecaseFilter('');
                setWorkflowFilter(val);
              }
            }}
            displayEmpty
            renderValue={(val) => {
              if (!val) return 'All Agent runs';
              if (String(val).startsWith('uc:')) {
                const uc = usecaseFilters.find((u) => u.id === String(val).slice(3));
                return uc?.label || 'Usecase agent';
              }
              const wf = agentWorkflows.find((w) => w.id === val);
              return wf?.name || 'Selected workflow';
            }}

            sx={{
              height: 36,
              minWidth: 200,
              maxWidth: 260,
              fontSize: '0.85rem',
              bgcolor: 'hsl(var(--card))',
              color: 'hsl(var(--foreground))',
              borderRadius: 1.5,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--border))' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--muted-foreground) / 0.3)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--primary))' },
            }}
            MenuProps={{
              slotProps: {
                paper: {
                  sx: {
                    bgcolor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                    maxHeight: 320,
                  },
                },
              },
            }}
          >
            <MenuItem value="" sx={{ fontSize: '0.85rem' }}>All Agent runs</MenuItem>
            {usecaseFilters.length > 0 && (
              <Divider sx={{ borderColor: 'hsl(var(--border))', my: 0.5 }} />
            )}
            {usecaseFilters.length > 0 && (
              <Box
                sx={{
                  px: 1.5,
                  py: 0.5,
                  fontSize: '0.7rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'hsl(var(--muted-foreground))',
                  pointerEvents: 'none',
                }}
              >
                Usecase agents
              </Box>
            )}
            {usecaseFilters.map((u) => (
              <MenuItem key={u.id} value={`uc:${u.id}`} sx={{ fontSize: '0.85rem' }}>
                {u.label}
              </MenuItem>
            ))}
            {agentWorkflows.length > 0 && usecaseFilters.length > 0 && (
              <Divider sx={{ borderColor: 'hsl(var(--border))', my: 0.5 }} />
            )}
            {agentWorkflows.map((w) => (
              <MenuItem key={w.id} value={w.id} sx={{ fontSize: '0.85rem' }}>
                {w.name}
              </MenuItem>
            ))}
            <Divider sx={{ borderColor: 'hsl(var(--border))', my: 0.5 }} />

            <Box
              sx={{
                px: 1.5,
                py: 1,
                fontSize: '0.72rem',
                color: 'hsl(var(--muted-foreground))',
                lineHeight: 1.45,
                whiteSpace: 'normal',
                maxWidth: 280,
                pointerEvents: 'none',
              }}
            >
              Scheduled agent runs will appear in this list once you set them up.
            </Box>
          </Select>
          {showSearchBar && (
            <TextField
              placeholder="Search results..."
              size="small"
              value={searchQuery}
              onChange={(e) => updateSearchQuery(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon size={18} color={'hsl(var(--muted-foreground))'} />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{
                flex: 1,
                maxWidth: 280,
                minWidth: 160,
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'hsl(var(--card))',
                  borderRadius: 1.5,
                  fontSize: '0.85rem',
                  height: 36,
                  '& fieldset': { borderColor: 'hsl(var(--border))' },
                  '&:hover fieldset': { borderColor: 'hsl(var(--muted-foreground) / 0.3)' },
                  '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
                },
                '& .MuiInputBase-input': { color: 'hsl(var(--foreground))' },
              }}
            />
          )}
          {showStatusChips && (
            <SegmentedControl
              size="sm"
              ariaLabel="Filter by status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
            />
          )}
          {isLoading && runs.length > 0 && (
            <CircularProgress size={16} sx={{ color: 'hsl(var(--primary))', ml: 0.5 }} />
          )}
        </Box>
      )}

      {selectedAgentWorkflow && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.5,
            borderRadius: 2,
            border: '1px solid hsl(var(--border))',
            bgcolor: 'hsl(var(--card))',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedAgentWorkflow.name}
            </Typography>
            {selectedAgentWorkflow.description && (
              <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedAgentWorkflow.description}
              </Typography>
            )}
          </Box>
          <Button
            size="small"
            startIcon={<Pencil size={14} />}
            onClick={openEditPrompt}
            sx={{
              height: 36,
              border: '1px solid hsl(var(--border))',
              borderRadius: 1.5,
              color: 'hsl(var(--foreground))',
              textTransform: 'none',
              fontSize: '0.8rem',
              px: 1.5,
              '&:hover': { bgcolor: 'hsl(var(--muted))' },
            }}
          >
            Edit
          </Button>
          <Button
            size="small"
            startIcon={<StopCircle size={14} />}
            onClick={() => setStopOpen(true)}
            sx={{
              height: 36,
              border: '1px solid hsl(var(--severity-critical, 0 72% 55%) / 0.4)',
              borderRadius: 1.5,
              color: 'hsl(var(--severity-critical, 0 72% 55%))',
              textTransform: 'none',
              fontSize: '0.8rem',
              px: 1.5,
              '&:hover': { bgcolor: 'hsla(var(--severity-critical, 0 72% 55%) / 0.08)' },
            }}
          >
            Stop schedule
          </Button>
        </Box>
      )}

      {isLoading && runs.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={28} sx={{ color: 'hsl(var(--primary))' }} />
        </Box>
      ) : error ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', py: 6 }}>
          <AlertCircle size={28} style={{ color: 'hsl(var(--severity-critical, 0 72% 55%))', marginBottom: 8 }} />
          <Typography
            sx={{ color: 'hsl(var(--severity-critical, 0 72% 55%))', fontSize: '0.9rem', mb: 1 }}
          >
            {error}
          </Typography>
          <Button
            size="small"
            onClick={() => fetchRuns(false, '')}
            sx={{ color: 'hsl(var(--primary))', textTransform: 'none' }}
          >
            Try again
          </Button>
        </Box>
      ) : filteredRuns.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', py: 8 }}>
          <Activity
            size={40}
            style={{ color: 'hsl(var(--muted-foreground))', marginBottom: 12 }}
          />
          <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.9rem' }}>
            {emptyTitle}
          </Typography>
          <Typography
            sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem', mt: 0.5, opacity: 0.7 }}
          >
            {emptySubtitle}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {filteredRuns.map((run, idx) => (
            <AgentRunRow
              key={run.execution_id || idx}
              run={run}
              onClick={() => {
                setLastOpenedAgentRun(run.execution_id);
                setLastOpenedRunId(run.execution_id || null);
                onRunClick?.(run);
              }}
              sx={[
                ...(Array.isArray(rowSx) ? rowSx : rowSx ? [rowSx] : []),
                ...(run.execution_id && run.execution_id === lastOpenedRunId
                  ? [{
                      borderColor: 'hsl(var(--primary) / 0.55)',
                      bgcolor: 'hsl(var(--primary) / 0.06)',
                    }]
                  : []),
              ]}
              appIcons={appIcons}
              onAppClick={(app) => setAppDrawer(app)}
              apiKey={apiKey}
              apiBaseUrl={apiBaseUrl}
              orgId={orgId}
              abortingIds={abortingIds}
              onAbort={handleAbort}
            />
          ))}


          {hasMore && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
              <Button
                size="small"
                onClick={loadMore}
                disabled={isLoading}
                sx={{ color: 'hsl(var(--primary))', textTransform: 'none', fontSize: '0.8rem' }}
              >
                {isLoading ? <CircularProgress size={14} sx={{ mr: 1 }} /> : null}
                Load more
              </Button>
            </Box>
          )}
        </Box>
      )}

      <Dialog
        open={stopOpen}
        onClose={() => (stopLoading ? null : setStopOpen(false))}
        slotProps={{ paper: { sx: { bgcolor: 'hsl(var(--card))', color: 'hsl(var(--foreground))', border: '1px solid hsl(var(--border))' } } }}
      >
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>Stop schedule?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--muted-foreground))' }}>
            This will stop "{selectedAgentWorkflow?.name}" and delete the scheduled workflow. Past executions remain visible. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setStopOpen(false)} disabled={stopLoading} sx={{ textTransform: 'none', color: 'hsl(var(--muted-foreground))' }}>
            Cancel
          </Button>
          <Button
            onClick={confirmStop}
            disabled={stopLoading}
            sx={{ textTransform: 'none', bgcolor: 'hsl(var(--severity-critical, 0 72% 55%))', color: 'hsl(var(--primary-foreground))', '&:hover': { bgcolor: 'hsla(var(--severity-critical, 0 72% 55%) / 0.9)' } }}
          >
            {stopLoading ? <CircularProgress size={16} sx={{ color: 'hsl(var(--primary-foreground))', mr: 1 }} /> : null}
            Stop schedule
          </Button>
        </DialogActions>
      </Dialog>

      {renderAppDetailDrawer ? (
        renderAppDetailDrawer({
          open: !!appDrawer,
          onClose: () => setAppDrawer(null),
          appName: appDrawer?.name || null,
          appId: appDrawer?.id || null,
          activeOrgId: orgId || null,
          globalUrl: globalUrl || apiBaseUrl,
          theme,
          colorMode,
        })
      ) : null}
    </Box>
  );
};

export default AgentActivityList;
export { getRunTitle, getRunSubtitle, formatDuration, getTimeAgo, STATUS_CONFIG };
