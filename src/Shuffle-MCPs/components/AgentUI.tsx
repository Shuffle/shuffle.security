/**
 * AgentUI — Standalone "start + debug agents" surface.
 *
 * TypeScript port and modernization of the legacy Shuffle Core
 * `AgentUI.jsx`. One component, two modes:
 *
 *  1. **Starter** — large hero prompt ("What do you want to do?")
 *     with attached MCP/app chips. Submits to `/api/v1/agent`.
 *  2. **Debugger** — compact header + decision timeline driven by
 *     `/api/v1/streams/results`, with question/continuation forms
 *     and per-decision raw-JSON inspection.
 *
 * Mode switches automatically when an execution is started or when
 * `?execution_id=...&authorization=...` is present in the URL.
 *
 * Self-contained: uses {@link AppSearchDrawer} for app picking,
 * {@link runAgent} for the JSON-RPC call, and the library's
 * {@link toast} facade for notifications.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { broadcastAgentAborted, setLastOpenedAgentRun } from '@/Shuffle-MCPs/agentRunSync';
import { safeRandomUUID } from '@/Shuffle-MCPs/uuid';

import {
  Plus as AddIcon,
  Paperclip as AttachFileIcon,
  CheckCircle2 as CheckCircleIcon,
  Check as CheckIcon,
  X as CloseIcon,
  AlertCircle as ErrorIcon,
  TimerOff as HourglassDisabledIcon,
  Lock as LockIcon,
  ExternalLink as OpenInNewIcon,
  PanelRightOpen as PanelRightOpenIcon,
  Pause as PauseIcon,
  Play as PlayArrowRoundedIcon,
  RefreshCw as RefreshIcon,
  RotateCcw as RestartAltIcon,
  Clock as ScheduleIcon,
  Settings as SettingsIcon,
  Send as SendIcon,
  CircleStop as StopCircleIcon,
  ThumbsDown as ThumbDownIcon,
  ThumbsUp as ThumbUpIcon,
  AlertTriangle as WarningIcon,
  Search as SearchIcon,
  Image as ImageIcon,
  Plus as PlusIcon,
  Loader2 as Loader2Icon,
} from 'lucide-react';
import { fetchExecution as fetchExecutionSnapshot } from '@/Shuffle-Core/components/WorkflowRunExplorer';
import { useNavigate, useSearchParams } from '@/lib/router-compat';
import {
  Avatar,
  AvatarGroup,
  Box,
  Button,
  // ButtonGroup removed (replaced by chip tabs)
  Chip,
  CircularProgress,
  ClickAwayListener,
  Dialog,
  Divider,
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  MenuList,
  Paper,
  Popover,
  Popper,
  Select,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import {
  DEFAULT_AGENT_PROMPT_PLACEHOLDER,
  getRandomAgentPromptPlaceholder,
  getRandomAgentPromptPlaceholderForWidth,
  matchAgentPromptSuggestions,
} from './agentPromptSuggestions';
import {
  getSuggestionAppRequirements,
  prettySuggestionAppName,
  type SuggestionAppRequirement,
} from './agentSuggestionApps';
import { AppFallbackIcon } from './AppFallbackIcon';
import ShuffleMarkdown from '@/Shuffle-MCPs/components/Markdown';

import safeHandler from '@/Shuffle-MCPs/safeHandler';
import AgentPresets, { AGENT_PRESETS, filterAgentPresets, isRequiredPresetApp, isSupportUser, type AgentPreset } from '@/Shuffle-MCPs/components/AgentPresets';
import { getToolsForSkill, AGENT_TOOLS_CHANGED_EVENT } from '@/lib/agentTools';

import { useAgentPromptPrefix } from '@/Shuffle-MCPs/useAgentPromptPrefix';
import { runAgent, resolveAgentNodeId } from '@/Shuffle-MCPs/agentRun';
import { toast } from '@/Shuffle-MCPs/toast';

// Normalize agent answer text so react-markdown renders it correctly:
// - Decode literal escape sequences ("\n", "\t", "\r") that come back
//   double-encoded in some JSON payloads.
// - Strip surrounding quotes if the value is itself a JSON-encoded string.
// - Trim leading/trailing whitespace.
const normalizeMarkdown = (raw: unknown): string => {
  if (raw == null) return '';
  let s = typeof raw === 'string' ? raw : (() => {
    try { return JSON.stringify(raw, null, 2); } catch { return String(raw); }
  })();
  // If the whole thing is a JSON-encoded string, decode it once.
  if (s.length > 1 && s.startsWith('"') && s.endsWith('"')) {
    try { s = JSON.parse(s); } catch { /* keep as-is */ }
  }
  // Convert literal "\n" / "\t" / "\r" sequences into real characters.
  s = s.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
  return s.trim();
};
import JsonView from 'react18-json-view';
import 'react18-json-view/src/style.css';
import 'react18-json-view/src/dark.css';
import { defaultCollapsed } from '@/lib/jsonView';
import { extractCleanDisplayPrompt } from '@/lib/docsPromptContext';
import { ActionOutputView } from '@/Shuffle-Core/views/monitors/ActionOutputView';


const LAST_PRESET_STORAGE_KEY = 'agent_last_preset_id';
/**
 * Per-template tool overrides. Templates seed a default tool set, but the user
 * is free to add/remove tools — their choice is remembered per template id so
 * the defaults never get force-reapplied over it.
 */
const PRESET_APPS_STORAGE_KEY = 'agent_preset_apps_overrides';
/** Storage bucket used when no template is selected. */
const NO_PRESET_KEY = '__none__';

const PRESET_TEMPLATE_SLUGS: Record<string, string> = {
  'build-workflows': 'edit-workflow',
  'handle-notifications': 'handle-notifications',
  'incident-response': 'incident-handler',
  'host-monitor-control': 'computer-use',
  support: 'support',
  vulnerability: 'vulnerability',
  detection: 'detection',
};

const TEMPLATE_SLUG_TO_PRESET_ID: Record<string, string> = {
  'workflow-edit': 'build-workflows',
  'edit-workflow': 'build-workflows',
  'build-workflows': 'build-workflows',
  'incident-response': 'incident-response',
  'incident-handler': 'incident-response',
  'vulnerability': 'vulnerability',
  'vulnerability-management': 'vulnerability',
  'computer-use': 'host-monitor-control',
  support: 'support',
  'handle-notifications': 'handle-notifications',
  detection: 'detection',
};



const readPresetAppsOverride = (presetId: string): Array<{ name: string; id?: string; icon?: string }> | null => {
  try {
    const raw = localStorage.getItem(PRESET_APPS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, Array<{ name: string; id?: string; icon?: string }>>;
    const list = parsed?.[presetId];
    if (!Array.isArray(list)) return null;
    return list.filter((a) => a && typeof a.name === 'string');
  } catch {
    return null;
  }
};

const resolvePresetApps = (preset: AgentPreset): Array<{ name: string; id?: string; icon?: string }> => {
  const baseApps = (preset.defaultApps || []).map((app) => ({ name: app.name, id: app.id, icon: app.icon }));
  const assigned = getToolsForSkill(preset.id);
  const merged = [...baseApps];
  for (const t of assigned) {
    const key = (t.id || t.name).toLowerCase();
    if (!merged.some((m) => (m.id || m.name).toLowerCase() === key)) {
      merged.push({ name: t.name, id: t.id, icon: (t as any).icon || undefined });
    }
  }
  return merged;
};

const writePresetAppsOverride = (presetId: string, apps: Array<{ name: string; id?: string; icon?: string }>) => {
  try {
    const raw = localStorage.getItem(PRESET_APPS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    parsed[presetId] = apps.map((a) => ({ name: a.name, id: a.id, icon: a.icon }));
    localStorage.setItem(PRESET_APPS_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore storage errors */
  }
};

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

/**
 * Some decisions (e.g. the `shuffle_hostmonitors` screenshot action) return an
 * execution object whose nested result carries a base64 screenshot, typically at
 * `decision.run_details.raw_response.body.results[0].result`. We deep-parse the
 * payload and pull out the object/string that holds the image so it can be
 * rendered with the same viewer used on Host Monitors → Remote Control.
 */
const IMAGE_VALUE_KEYS = ['image_base64', 'imageBase64', 'image', 'screenshot', 'screenshot_base64', 'png', 'jpeg', 'jpg', 'b64', 'base64'];
const B64_IMAGE_PREFIXES = ['iVBORw0KGgo', '/9j/', 'R0lGOD', 'UklGR'];

const looksLikeBase64Image = (v: unknown): boolean => {
  if (typeof v !== 'string') return false;
  const s = v.trim().replace(/\s+/g, '');
  if (s.length < 200) return false;
  if (/^data:image\/[a-z+.-]+;base64,/i.test(s)) return true;
  if (!/^[A-Za-z0-9+/=]+$/.test(s)) return false;
  return B64_IMAGE_PREFIXES.some((p) => s.startsWith(p));
};

/**
 * Last-resort text scan: pull a base64 image blob straight out of raw text.
 * Handles payloads whose JSON is escaped, truncated or otherwise unparseable
 * (e.g. `"output":"[{\"image\":\"iVBORw0KGgo…`).
 */
const scanTextForImage = (text: string): string | null => {
  if (!text || text.length < 200) return null;
  const dataUri = text.match(/data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]{200,}/i);
  if (dataUri) return dataUri[0];
  const bare = text.match(/(?:iVBORw0KGgo|\/9j\/|R0lGOD|UklGR)[A-Za-z0-9+/=]{200,}/);
  return bare ? bare[0] : null;
};

/** Deep-walk a (possibly JSON-string-encoded) payload for a renderable screenshot. */
export const extractScreenshotPayload = (raw: unknown, depth = 0): string | null => {
  if (depth > 12 || raw == null) return null;
  if (typeof raw === 'string') {
    if (looksLikeBase64Image(raw)) return raw.trim();
    const parsed = tryParseJsonObject(raw);
    const nested = parsed ? extractScreenshotPayload(parsed, depth + 1) : null;
    if (nested) return nested;
    return depth === 0 ? scanTextForImage(raw) : null;
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const hit = extractScreenshotPayload(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  // Prefer the whole object when it holds the image directly — ActionOutputView
  // then also picks up `cursor` / `screen_size` metadata alongside the image.
  for (const key of IMAGE_VALUE_KEYS) {
    if (looksLikeBase64Image(rec[key])) return JSON.stringify(rec);
  }
  for (const value of Object.values(rec)) {
    const hit = extractScreenshotPayload(value, depth + 1);
    if (hit) return hit;
  }
  if (depth === 0) {
    try { return scanTextForImage(JSON.stringify(rec)); } catch { return null; }
  }
  return null;
};

/**
 * Same as `extractScreenshotPayload`, but collects EVERY renderable image in a
 * decision payload (an action can return several screenshots in one go).
 * De-duplicated, in first-seen order.
 */
export const extractScreenshotPayloads = (raw: unknown, depth = 0, out: string[] = []): string[] => {
  if (depth > 12 || raw == null) return out;
  if (typeof raw === 'string') {
    if (looksLikeBase64Image(raw)) {
      out.push(raw.trim());
      return out;
    }
    const parsed = tryParseJsonObject(raw);
    if (parsed) extractScreenshotPayloads(parsed, depth + 1, out);
    if (!out.length && depth === 0) {
      const scanned = scanTextForImage(raw);
      if (scanned) out.push(scanned);
    }
    return out;
  }
  if (Array.isArray(raw)) {
    for (const item of raw) extractScreenshotPayloads(item, depth + 1, out);
    return out;
  }
  if (typeof raw !== 'object') return out;
  const rec = raw as Record<string, unknown>;
  const holdsImage = IMAGE_VALUE_KEYS.some((key) => looksLikeBase64Image(rec[key]));
  if (holdsImage) {
    out.push(JSON.stringify(rec));
    return out;
  }
  for (const value of Object.values(rec)) extractScreenshotPayloads(value, depth + 1, out);
  if (!out.length && depth === 0) {
    try {
      const scanned = scanTextForImage(JSON.stringify(rec));
      if (scanned) out.push(scanned);
    } catch { /* ignore */ }
  }
  if (depth === 0) return Array.from(new Set(out));
  return out;
};




/** Try to parse a string as JSON object/array; returns null otherwise. */

const tryParseJsonObject = (raw: string): any => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')))) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') return deepParseJsonStrings(parsed);
  } catch { /* ignore */ }
  return null;
};

/** Strip a single surrounding ```json ... ``` (or generic ```) fence if the whole text is one. */
const stripSingleCodeFence = (raw: string): string => {
  const m = raw.match(/^\s*```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i);
  return m ? m[1] : raw;
};

/**
 * A decision whose FIRST field key is "continue" is a continuation of the
 * previous step — not a user-facing question. The backend reuses the ask
 * shape for these, so we detect and label them separately.
 */
export const isContinuationDecision = (decision?: any): boolean => {
  const fields = Array.isArray(decision?.fields) ? decision.fields : [];
  if (!fields.length) return false;
  return String(fields[0]?.key || '').trim().toLowerCase() === 'continue';
};

export const isAskDecision = (decision?: any, category?: string): boolean => {
  if (isContinuationDecision(decision)) return false;
  const action = String(decision?.action || '').toLowerCase();
  const decisionCategory = String(decision?.category || category || '').toLowerCase();
  return action === 'ask' || action === 'question' || decisionCategory === 'ask' || decisionCategory === 'question';
};

export const getQuestionFieldText = (field: any, decision?: any, category?: string): string => {
  const key = String(field?.key || '').trim().toLowerCase();
  const value = typeof field?.value === 'string' ? field.value.trim() : '';
  if (!value) return '';
  // For ask/question decisions the field key ("question", "question_text",
  // "name", …) is decorative — the value IS the question. Only exclude
  // approve/deny style controls we know are not free-form answers.
  if (isAskDecision(decision, category)) {
    if (key === 'approve' || key === 'deny' || key === 'decision') return '';
    return value;
  }
  if (key === 'question') return value;
  return '';
};

/**
 * When an ask/question decision arrives without any usable question field
 * value (all fields empty, or only control keys like approve/deny), fall
 * back to the decision's own free-form `reason` or `description`. The agent
 * often writes a full sentence there explaining what it needs, so we surface
 * that as the effective question instead of an empty prompt.
 */
export const getAskFallbackQuestion = (decision?: any): string => {
  const reason = typeof decision?.reason === 'string' ? decision.reason.trim() : '';
  if (reason) return reason;
  const description = typeof decision?.description === 'string' ? decision.description.trim() : '';
  if (description) return description;
  return '';
};

/**
 * Extract every unanswered question from an agent run's decisions using the
 * same detection helpers the AgentUI timeline uses. Returns pending "ask"
 * decisions that are still WAITING (or RUNNING) with at least one question
 * field. Callers can render an inline answer form for each entry.
 */
export const extractPendingAgentQuestions = (
  run: { decisions?: any[] } | null | undefined,
): Array<{ decisionId: string; questions: string[]; description?: string; reason?: string }> => {
  if (!run || !Array.isArray(run.decisions)) return [];
  const out: Array<{ decisionId: string; questions: string[]; description?: string; reason?: string }> = [];
  for (const decision of run.decisions) {
    if (!isAskDecision(decision)) continue;
    const status = String(decision?.run_details?.status || '').toUpperCase();
    // Only surface decisions that are still awaiting an answer.
    if (status && status !== 'WAITING' && status !== 'RUNNING' && status !== '') continue;
    const questions: string[] = [];
    let anyFieldAnswered = false;
    for (const f of (decision.fields as any[]) || []) {
      // Skip fields that already carry an answer — those have been resolved.
      const preAnswer = typeof (f as any).answer === 'string' ? (f as any).answer.trim() : '';
      if (preAnswer) { anyFieldAnswered = true; continue; }
      const q = getQuestionFieldText(f, decision);
      if (q) questions.push(q);
    }
    // Fallback: if the agent supplied no usable question text (empty value
    // fields, or only control keys) surface `reason`/`description` as the
    // question so the analyst still sees WHAT is being asked.
    if (!questions.length && !anyFieldAnswered) {
      const fallback = getAskFallbackQuestion(decision);
      if (fallback) questions.push(fallback);
    }
    if (!questions.length) continue;
    const decisionId = String(decision?.run_details?.id || decision?.id || '');
    if (!decisionId) continue;
    out.push({
      decisionId,
      questions,
      description: typeof decision?.description === 'string' ? decision.description : undefined,
      reason: typeof decision?.reason === 'string' ? decision.reason : undefined,
    });
  }
  return out;
};

const truncateReason = (reason?: string, maxLength = 280): string => {
  if (!reason) return '';
  if (reason.length <= maxLength) return reason;
  return reason.slice(0, maxLength).replace(/\s+\S*$/, '') + '…';
};

/**
 * Render the agent's "Run finished" answer:
 *  - If the whole text (or its sole code fence) is a JSON object/array → JsonView
 *  - Otherwise render Markdown, but route fenced code blocks that contain JSON
 *    through JsonView so they get the collapsible tree UI inline.
 */
const FinishAnswerMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const wholeJson = useMemo(() => tryParseJsonObject(stripSingleCodeFence(text)), [text]);
  if (wholeJson !== null) {
    return (
      <Box sx={{ '& .json-view': { backgroundColor: 'transparent !important', fontSize: '0.82rem' } }}>
        <JsonView src={wholeJson} collapsed={defaultCollapsed} enableClipboard displaySize theme="default" />
      </Box>
    );
  }
  return (
    <ShuffleMarkdown
      components={{
        code({ inline, className, children, ...props }: any) {
          const content = String(children ?? '').replace(/\n$/, '');
          // Only treat block-level code (not inline) as a JSON candidate.
          const isBlock = !inline && (content.includes('\n') || /language-/.test(className || ''));
          if (isBlock) {
            const parsed = tryParseJsonObject(content);
            if (parsed !== null) {
              return (
                <Box sx={{ my: 1, p: 1.5, borderRadius: 1, bgcolor: 'hsl(var(--muted))', '& .json-view': { backgroundColor: 'transparent !important', fontSize: '0.82rem' } }}>
                  <JsonView src={parsed} collapsed={defaultCollapsed} enableClipboard displaySize theme="default" />
                </Box>
              );
            }
          }
          return <code className={className} {...props}>{children}</code>;
        },
      }}
    >
      {text}
    </ShuffleMarkdown>
  );
};

/**
 * Shared "Run finished" summary used by both the Simple and Detailed views.
 * Renders the status header (with optional steps/duration meta and a
 * Raw/Rendered toggle) and the agent's final answer body underneath.
 *
 * `children` is rendered between the header row and the answer body — used by
 * the Simple view to insert auth-required banners or pending question forms.
 */
interface RunFinishedSummaryProps {
  status: string;
  isRunning: boolean;
  finishAnswer: string;
  /** Secondary line (the finish decision's `reason`) shown under the answer. */
  finishNote?: string;
  raw: boolean;
  onToggleRaw: () => void;
  decisionCount?: number;
  durationSec?: number | null;
  /** Show the "N steps · Ns" meta next to the title. */
  showMeta?: boolean;
  children?: React.ReactNode;
  bottomContent?: React.ReactNode;
}

const RunFinishedSummary: React.FC<RunFinishedSummaryProps> = ({
  status,
  isRunning,
  finishAnswer,
  finishNote,
  raw,
  onToggleRaw,
  decisionCount,
  durationSec,
  showMeta = false,
  children,
  bottomContent,
}) => {
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {isRunning ? (
          <Loader2Icon
            size={16}
            className="animate-spin"
            style={{ color: 'hsl(var(--primary))', flexShrink: 0 }}
          />
        ) : status === 'FINISHED' ? (
          <CheckCircleIcon size={18} color={'hsl(142 70% 45%)'} />
        ) : (
          <ErrorIcon size={18} color={'hsl(var(--destructive))'} />
        )}
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
          {isRunning ? 'Agent is working…' : status === 'FINISHED' ? 'Run finished' : `Run ${status.toLowerCase()}`}
        </Typography>
        {showMeta && (decisionCount != null || (durationSec != null && durationSec >= 1)) && (
          <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
            {decisionCount != null ? `${decisionCount} step${decisionCount === 1 ? '' : 's'}` : ''}
            {durationSec != null && durationSec >= 1 ? `${decisionCount != null ? ' · ' : ''}${Math.round(durationSec)}s` : ''}
          </Typography>
        )}

        <Box sx={{ flexGrow: 1 }} />
        {finishAnswer && (
          <Button
            size="small"
            variant="outlined"
            onClick={onToggleRaw}
            sx={{
              height: 28, textTransform: 'none', fontWeight: 500,
              fontSize: '0.72rem', px: 1, minWidth: 0,
              color: 'hsl(var(--muted-foreground))',
              borderColor: 'hsl(var(--border))',
            }}
          >
            {raw ? 'Rendered' : 'Raw'}
          </Button>
        )}
      </Box>

      {children}

      {finishAnswer && (
        <Box sx={{
          p: 2, borderRadius: 1.5,
          border: '1px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--background))',
          fontSize: '0.9rem',
          color: 'hsl(var(--foreground))',
          '& > *:first-of-type': { mt: 0 },
          '& > *:last-child': { mb: 0 },
          '& p': { my: 1, lineHeight: 1.55 },
          '& h1, & h2, & h3, & h4': { mt: 2, mb: 1, fontWeight: 600, lineHeight: 1.3 },
          '& h1': { fontSize: '1.15rem' },
          '& h2': { fontSize: '1.05rem' },
          '& h3, & h4': { fontSize: '0.95rem' },
          '& ul': { my: 1, pl: 3, listStyleType: 'disc', listStylePosition: 'outside' },
          '& ol': { my: 1, pl: 3, listStyleType: 'decimal', listStylePosition: 'outside' },
          '& ul ul': { listStyleType: 'circle' },
          '& ul ul ul': { listStyleType: 'square' },
          '& li': { my: 0.25, display: 'list-item' },
          '& li::marker': { color: 'hsl(var(--muted-foreground))' },
          '& a': { color: 'hsl(var(--primary))', textDecoration: 'underline' },
          '& code': {
            px: 0.5, py: 0.125, borderRadius: 0.5,
            bgcolor: 'hsl(var(--muted))',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.82em',
          },
          '& pre': {
            p: 1.5, my: 1, borderRadius: 1,
            bgcolor: 'hsl(var(--muted))',
            overflowX: 'auto',
            fontSize: '0.82rem',
          },
          '& pre code': { p: 0, bgcolor: 'transparent' },
          '& blockquote': {
            borderLeft: '3px solid hsl(var(--border))',
            pl: 1.5, my: 1, color: 'hsl(var(--muted-foreground))',
          },
          '& table': { borderCollapse: 'collapse', my: 1, fontSize: '0.85rem' },
          '& th, & td': { border: '1px solid hsl(var(--border))', px: 1, py: 0.5 },
          '& hr': { border: 0, borderTop: '1px solid hsl(var(--border))', my: 1.5 },
        }}>
          {raw ? (
            <Box
              component="pre"
              sx={{
                m: 0,
                fontSize: '0.78rem',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                color: 'hsl(var(--foreground))',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.55,
              }}
            >
              {finishAnswer}
            </Box>
          ) : (
            <FinishAnswerMarkdown text={normalizeMarkdown(finishAnswer)} />
          )}
        </Box>
      )}

      {finishAnswer && finishNote && !raw && (
        <Typography
          sx={{
            mt: 1,
            fontSize: '0.75rem',
            lineHeight: 1.5,
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          {finishNote}
        </Typography>
      )}

      {status !== 'FINISHED' && status !== 'SUCCESS' && bottomContent}
    </>
  );
};





import { SegmentedControl } from '@/Shuffle-MCPs/components/SegmentedControl';
import AgentIcon from '@/Shuffle-MCPs/components/AgentIcon';
import AppSearchDrawer from '@/Shuffle-MCPs/views/AppSearchDrawer';
import AppDetailDrawer from '@/Shuffle-MCPs/views/AppDetailDrawer';
import { getApiUrl, getAuthHeader, API_CONFIG, getShuffleCoreFormUrl } from '@/Shuffle-MCPs/api';
import { fetchApps } from '@/Shuffle-MCPs/appsCache';
import { resolveApps } from '@/Shuffle-MCPs/resolveApp';
import {
  detectLLMProvider,
  getProviderLogoUrl,
  SHUFFLE_AI_PRESET,
  resolveActiveLLMProvider,
  isOpenAICompatibleAuthEntry,
  providerLabelOfAuthEntry,
} from '@/Shuffle-MCPs/llmProviderDetect';
import { switchActiveLLM } from '@/Shuffle-MCPs/llmActiveProvider';
import { appRequiresAuthentication, isNoAuthApp, normalizeAppName } from '@/Shuffle-MCPs/noAuthApps';
import { parseScheduleHint } from '@/Shuffle-MCPs/scheduleHint';
import AgentRunDiagnosisBanner from '@/Shuffle-MCPs/components/AgentRunDiagnosisBanner';
import { isAiAuthFailure, isAiAuthText } from '@/Shuffle-MCPs/agentDiagnosis';
import AiAuthSuggestion from '@/Shuffle-MCPs/components/AiAuthSuggestion';
import AgentAttachmentsButton from '@/Shuffle-MCPs/components/AgentAttachmentsButton';
import { collectLlmImageAttachments } from '@/Shuffle-MCPs/agentAttachments';
import {
  resolveConnectedTools,
  mergeConnectedTools,
  setCachedConnectedTools,
  MAX_AUTO_ASSIGNED_TOOLS,
  type ConnectedToolApp,
} from '@/Shuffle-MCPs/connectedSourcesService';
import { getPageContextChoice, setPageContextChoice } from '@/Shuffle-MCPs/agentContextRegistry';


// ── Types ──────────────────────────────────────────────────────────────────────

export interface AgentUIApp {
  /** App slug, e.g. "http", "shuffle_tools", "gmail". */
  name: string;
  /** Algolia objectID / Shuffle app id (preferred). */
  id?: string;
  /** Optional preview icon URL. */
  icon?: string;
}

export interface AgentUIProps {
  /** Optional React key to force re-mounting when context changes */
  key?: React.Key;
  /** Controlled list of apps. When provided, overrides defaultApps and disables auto-load. */
  apps?: AgentUIApp[];
  /** Initial chip set under the prompt. Used only when `apps` is not provided. */
  defaultApps?: AgentUIApp[];
  /**
   * When true (default) and neither `apps` nor `defaultApps` is provided, fetch the
   * caller's authenticated apps via `/api/v1/apps/authentication` (requires an API
   * token to be set on `API_CONFIG`).
   */
  autoLoadApps?: boolean;
  /** Authoritative support flag from `/api/v1/getinfo`. */
  isSupport?: boolean;
  /**
   * Optional per-skill readiness CTAs. Keyed by skill (preset) id. When the
   * matching skill is selected and the host reports it has no real content
   * yet, AgentUI renders a small call-to-action under the prompt.
   */
  presetCtas?: Record<string, {
    /** When false, nothing is rendered (content exists / still loading). */
    show?: boolean;
    message: string;
    actionLabel: string;
    onAction?: () => void;
  }>;
  /** Hero title above the prompt. */
  title?: string;
  /** Optional subtitle/description shown under the title. */
  subtitle?: React.ReactNode;
  /** Placeholder shown in the empty prompt. */
  placeholder?: string;
  /** Pre-fill the prompt with this text. */
  defaultInput?: string;
  /** Submit immediately on mount when `defaultInput` is provided. */
  autoSubmit?: boolean;
  /** Hide the centered hero icon (compact mode). */
  hideHeroIcon?: boolean;
  /** Replace the default AgentIcon with a custom node (e.g. brand logo). */
  heroIcon?: React.ReactNode;
  /** Pixel size of the hero icon container. Default 84. */
  heroIconSize?: number;
  /** Maximum width of the centered card. */
  maxWidth?: number;
  /** Compact mode: hides the hero icon, shrinks padding. */
  compact?: boolean;
  /** Force the mobile/compact layout for narrow containers (e.g. side panels, split panes). Replaces the floating in-field skill badge with the compact `+` / skill icon menu button, removes the wide first-line indent, and sizes tool chips down to icons. */
  mobileView?: boolean;
  /** Hide the "Select Apps" chip row entirely. */
  hideAppPicker?: boolean;
  /** Hide the paperclip image-attachment button. */
  hideAttach?: boolean;
  /** Disable the "Start" tab in the run switcher (e.g. when viewing a fixed execution). */
  disableStartTab?: boolean;
  /** Label on the "Select Apps" chip. */
  appPickerLabel?: string;
  /** Title on the AppSearchDrawer. */
  appPickerTitle?: string;
  /** Subtitle on the AppSearchDrawer. */
  appPickerSubtitle?: string;
  /**
   * Handler for the "Choose LLM" chip. When provided, takes full ownership
   * of the click. When omitted, AgentUI dispatches a window
   * `agent-drawer-open` CustomEvent — that's what the bundled
   * `AgentRunDrawer` listens for. On hosts that don't mount the drawer,
   * provide this prop to wire your own LLM picker (or set it to a no-op
   * to hide the chip's intent entirely).
   */
  onChooseLLM?: () => void;
  /** Hide the "Choose LLM" chip entirely. */
  hideChooseLLM?: boolean;
  /** Whether the user is currently authenticated */
  isLoggedIn?: boolean;
  /** Tooltip on the submit button. Default: "⌘+Enter to send". */
  submitTooltip?: string;
  /** Custom icon for the submit button. */
  submitIcon?: React.ReactNode;
  /**
   * When provided, the submit button + Cmd/Ctrl+Enter call this instead of
   * running the agent. Used for "edit existing scheduled workflow" mode where
   * the same starter UI is reused for editing the prompt + apps.
   */
  submitOverride?: (info: { input: string; apps: Array<{ name: string; id?: string; icon?: string }> }) => void | Promise<void>;
  /** When set, renders the submit control as a wider labelled button instead of the icon-only send button. */
  submitLabel?: string;
  /** Force-disable the schedule (clock) button. Optional tooltip override. */
  disableSchedule?: boolean;
  disableScheduleTooltip?: string;
  /** Placeholder for the post-finish continuation field. */
  continuationPlaceholder?: string;
  /** Read `?execution_id` & `?authorization` from window URL on mount. */
  readUrlParams?: boolean;
  /**
   * Optional explicit execution to attach to on mount. Overrides URL params
   * and skips the starter — useful when embedding to monitor a known run.
   */
  executionId?: string;
  /** Authorization token paired with `executionId`. */
  authorization?: string;
  /**
   * Pre-loaded execution payload. When provided, AgentUI skips the starter
   * and renders Simple/Detailed views immediately — no `/streams/results`
   * fetch, no `authorization` token required. Useful for embedding inside
   * a list/drawer that already has the execution data in hand. If the run
   * is still EXECUTING and an `authorization` is also present, polling
   * continues normally.
   */
  initialExecution?: {
    execution_id?: string;
    authorization?: string;
    status?: string;
    started_at?: number | string;
    completed_at?: number | string;
    results?: any[];
    workflow?: { id?: string; name?: string };
    [k: string]: any;
  };
  /** Called whenever a run finishes (success or failure). */
  onRun?: (info: { input: string; success: boolean; executionId?: string; authorization?: string; error?: string }) => void;
  /** Called whenever the chip set under the prompt changes (add/remove apps). */
  onAppsChange?: (apps: AgentUIApp[]) => void;
  /** Called whenever the active top-level view changes (start / simple / detailed). */
  onViewChange?: (view: 'start' | 'simple' | 'detailed') => void;
  /**
   * Called when the user saves a recurring schedule (cron expression) for the
   * current prompt. When omitted, a toast is shown indicating scheduling is
   * not wired up in this embed.
   */
  onSchedule?: (info: {
    cron: string;
    input: string;
    apps?: Array<{ name: string; id?: string; icon?: string }>;
    presetId?: string;
    onStep?: (event: { id: 'name' | 'workflow' | 'schedule'; state: 'active' | 'done' | 'error'; detail?: string }) => void;
  }) => void | Promise<void>;
  /**
   * Optional Shuffle API key. When provided, all `/api/v1/*` calls made by
   * this component (agent run, polling, app autoload, icon fallback) use it
   * via `Authorization: Bearer <apiKey>`. When omitted, falls back to the
   * shared `API_CONFIG` (browser session / `localStorage.shuffle_api_key`).
   */
  apiKey?: string;
  /**
   * Optional Shuffle backend base URL (e.g. `https://shuffler.io`). When
   * omitted, falls back to the shared `API_CONFIG.baseUrl`. Useful when
   * embedding `AgentUI` inside another app that targets a different region.
   */
  apiBaseUrl?: string;
  /** Optional Shuffle Org ID — sent as the `Org-Id` header on every call. */
  orgId?: string;
  /** Optional theme mode forwarded to nested Shuffle drawers. */
  theme?: 'light' | 'dark' | 'system';
  /** Legacy theme alias forwarded to nested Shuffle drawers. */
  colorMode?: 'light' | 'dark' | 'auto';
  /** Optional className forwarded to the root container. */
  className?: string;
  /** Style overrides merged into the root container sx. */
  sx?: SxProps<Theme>;
  /** Style overrides for the inner content card (the column under the run-switcher). */
  contentSx?: SxProps<Theme>;
  /**
   * Storage key for the per-user prompt-prefix chip. Typically the current
   * Shuffle user id. When omitted, the prefix persists under `"default"`
   * (shared across all users on this browser).
   */
  userId?: string;
  /** Hide the "+ Templates" trigger next to the input. */
  hidePresets?: boolean;
  /** Override the built-in template list surfaced by the "+ Templates" trigger. */
  presets?: AgentPreset[];
  /** Preset/template to activate on mount. When omitted, restores from localStorage. */
  initialPresetId?: string | null;
  /** Called when the user picks a preset. Overrides the built-in seed behavior. */
  onSelectPreset?: (preset: AgentPreset) => void;
  /** Category used to auto-discover and connect tenant sources & destinations (e.g. 'incidents' or 'vulnerabilities') */
  contextCategory?: 'incidents' | 'vulnerabilities' | string;
  /** Storage key of the active page context to detect user overrides */
  contextStorageKey?: string;
  /**
   * When true, applies the dedicated Ask AI sidebar layout:
   * - Pins run switcher directly beneath the panel header
   * - Locks continuation form to the bottom of the sidebar
   * - Provides independent scroll container for middle content without top clipping
   */
  sidebarLayout?: boolean;
  /**
   * Optional callback to transform/compose raw prompt input before submitting to the backend
   * (e.g. pre-injecting dynamic documentation markdown).
   */
  composeSubmitInput?: (raw: string) => string;
  /** Context parameters (e.g. { id: 'hello' } when on /incidents/:id) */
  contextParams?: Record<string, string>;
  /** Optional target incident ID for incident-handler skill */
  incidentId?: string;
  /** Optional target incident context (observables, summary, tasks) */
  incidentContext?: Record<string, unknown>;
  /** Optional target vulnerability ID for vulnerability skill */
  vulnerabilityId?: string;
  /** Optional target workflow ID for edit-workflow skill */
  workflowId?: string;
}

/** Set of confirmed live built-in Shuffle services that are always available in the platform */
export const VERIFIED_BUILTIN_APPS = new Set<string>([
  'shuffle_incidents',
  'shuffle_workflows',
  'shuffle_workflows_builder',
  'shuffle_datastore',
  'shuffle_tools',
  'shuffle_detection',
  'shuffle_sensors',
  'shuffle_host_monitors',
  'shuffle_monitors',
  'shuffle_files',
  'shuffle_apps',
  'shuffles_app_management',
  'shuffle_vulnerabilities',
  'shuffle_software_and_packages',
  'shuffle_assets',
  'shuffle_software',
  'shuffle_packages',
  'http',
  'webhook',
  'email',
  'core',
  'singul',
]);

/** Format app names cleanly (e.g. "shuffle_software_and_packages" -> "Shuffle Software and Packages") */
export const formatAppDisplayName = (name: string): string => {
  if (!name) return '';
  const words = name.replace(/_/g, ' ').trim().split(/\s+/);
  return words
    .map((w, idx) => {
      const lower = w.toLowerCase();
      if (idx > 0 && (lower === 'and' || lower === 'or' || lower === 'of' || lower === 'the' || lower === 'in' || lower === 'on')) {
        return lower;
      }
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
};

interface ExecutionData {
  execution_id?: string;
  authorization?: string;
  status?: string;
  started_at?: number;
  completed_at?: number;
  results?: any[];
  workflow?: { id?: string; name?: string };
  [k: string]: any;
}

interface AgentDecision {
  action?: string;
  category?: string;
  reason?: string;
  fields?: Array<{ key?: string; value?: string }>;
  details?: any;
  run_details?: {
    id?: string;
    status?: string;
    started_at?: number;
    completed_at?: number;
    raw_response?: string;
  };
  [k: string]: any;
}

interface TimelineItem {
  label?: string;
  type: 'agent' | 'decision' | 'processing';
  category?: string;
  status?: string;
  start_time?: number;
  end_time?: number;
  details?: any;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Seconds a WAITING decision asked to wait before the agent resumes.
 * The backend may put this on the decision, its run_details, its details
 * blob, or as a `delay` field.
 */
const getDecisionDelaySeconds = (dec: any): number => {
  if (!dec || typeof dec !== 'object') return 0;
  const candidates: unknown[] = [
    dec.delay,
    dec.delay_seconds,
    dec.run_details?.delay,
    dec.details?.delay,
    dec.details?.delay_seconds,
  ];
  for (const f of dec.fields || []) {
    if (/^delay/i.test(String(f?.key || ''))) candidates.push(f?.value);
  }
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
};

/** Epoch ms when a delayed WAITING decision is expected to continue. */
const getScheduledResumeMs = (dec: any): number => {
  const delaySec = getDecisionDelaySeconds(dec);
  if (!delaySec) return 0;
  const rd = dec?.run_details || {};
  const base = Number(rd.completed_at || rd.started_at || 0);
  if (!base) return 0;
  const baseMs = base > 1e12 ? base : base * 1000;
  return baseMs + delaySec * 1000;
};

const formatTimeLeft = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const validateJson = (raw: unknown): { valid: boolean; result: any } => {
  if (raw == null) return { valid: false, result: null };
  if (typeof raw === 'object') return { valid: true, result: raw };
  if (typeof raw !== 'string') return { valid: false, result: raw };
  try {
    return { valid: true, result: JSON.parse(raw) };
  } catch {
    return { valid: false, result: raw };
  }
};

/**
 * Detect whether a single decision came back asking for app authentication.
 * Returns the app name (and optional id from `details.tool` when prefixed
 * "app:<id>:<name>") so the caller can render an inline "Authenticate X"
 * banner. Returns null when the decision did not request auth.
 */
/**
 * Built-in Shuffle apps that never require auth inside the Agent area —
 * they ride on the user's existing Shuffle session. Names are normalised
 * to lowercase with underscores so "Shuffle Host Monitors",
 * "shuffle-host-monitors" and "shuffle_host_monitors" all match.
 */
const normalizeAgentAppName = (name: string) => normalizeAppName(name);

const extractAuthRequest = (decision: any): { appName: string; appId: string | null } | null => {
  if (!decision || typeof decision !== 'object') return null;

  const raw = decision?.run_details?.raw_response;
  let parsed: any = null;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
  } else if (raw && typeof raw === 'object') {
    parsed = raw;
  }

  const candidateObjects = [
    parsed,
    decision?.result,
    decision?.run_details,
    decision,
  ].filter(Boolean);

  let toolAppName: string | undefined;
  let appId: string | null = null;
  if (typeof decision?.tool === 'string') {
    const t = decision.tool;
    if (t.startsWith('app:')) {
      const parts = t.split(':');
      appId = parts[1] || null;
      toolAppName = parts[2] || undefined;
    } else {
      toolAppName = t;
    }
  }

  let needsAuth = false;
  let candidateAppName: string | undefined;

  for (const obj of candidateObjects) {
    if (
      obj.action === 'app_authentication' ||
      obj.app_authentication === true ||
      obj.action === 'authenticate' ||
      obj.needs_auth === true ||
      obj.auth_required === true
    ) {
      needsAuth = true;
    }
    const candidate = obj.app || obj.app_name || obj.appname;
    if (typeof candidate === 'string' && candidate.trim()) {
      candidateAppName = candidate.trim();
    }
  }

  const textSources = [
    decision?.error,
    decision?.reason,
    decision?.status_message,
    decision?.message,
    decision?.run_details?.error,
    typeof raw === 'string' ? raw : '',
  ];
  const combinedText = textSources.filter(Boolean).join(' ').toLowerCase();
  if (
    combinedText.includes('app_authentication') ||
    combinedText.includes('requires authentication') ||
    combinedText.includes('missing authentication') ||
    combinedText.includes('unauthorized') ||
    combinedText.includes('not authenticated') ||
    combinedText.includes('invalid credentials') ||
    combinedText.includes('missing api key')
  ) {
    needsAuth = true;
  }

  if (
    !needsAuth &&
    (decision?.status === 'WAITING' ||
      decision?.status === 'PENDING' ||
      decision?.run_details?.status === 'WAITING' ||
      decision?.run_details?.status === 'PENDING')
  ) {
    if (toolAppName && appRequiresAuthentication(toolAppName)) {
      needsAuth = true;
    }
  }

  if (!needsAuth) return null;

  let appName: string | undefined = candidateAppName || toolAppName;
  if (!appName) {
    const f = (decision?.fields || []).find((x: any) => x?.key === 'app' || x?.key === 'app_name');
    if (f?.value) appName = f.value;
  }
  if (!appName) return null;
  return { appName, appId };
};

const STATUS_COLORS = {
  finished: 'hsl(142, 71%, 45%)',
  warning: 'hsl(38, 92%, 50%)',
  error: 'hsl(0, 72%, 55%)',
  running: 'hsl(var(--primary))',
};

const TERMINAL_RUN_STATUSES = ['FINISHED', 'FAILURE', 'ABORTED', 'CANCELLED', 'CANCELED'];

// The execution status and the agent status can disagree (e.g. agent says
// RUNNING while the execution already says FINISHED). If *either* side reports
// a terminal state, the run is complete.
const resolveRunStatus = (execStatus?: string, agentStatus?: string): string => {
  const e = (execStatus || '').toUpperCase();
  const a = (agentStatus || '').toUpperCase();
  if (e === 'FINISHED' || a === 'FINISHED' || e === 'SUCCESS' || a === 'SUCCESS') return 'FINISHED';
  if (e === 'FAILURE' || a === 'FAILURE') return 'FAILURE';
  if (e === 'ABORTED' || a === 'ABORTED') return 'ABORTED';
  if (e === 'CANCELLED' || a === 'CANCELLED' || e === 'CANCELED' || a === 'CANCELED') return 'CANCELLED';
  if (e === 'WAITING' || a === 'WAITING') return 'WAITING';
  if (e === 'PENDING' || a === 'PENDING') return 'PENDING';
  if (e === 'RUNNING' || a === 'RUNNING' || e === 'EXECUTING' || a === 'EXECUTING') return 'RUNNING';
  return e || a || '';
};

const buildToolName = (apps: AgentUIApp[]): string => {
  if (!apps.length) return 'API';
  return apps
    .map((a) => {
      const slug = a.name.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
      return a.id ? `app:${a.id}:${slug}` : slug;
    })
    .join(',');
};

/**
 * True when the app list is still the untouched built-in fallback
 * (`http` + `shuffle_tools`, no ids). Used so a run that has real
 * `allowed_actions` never sends `tool_name: "http,shuffle_tools"`.
 */
const isBuiltinDefaultApps = (apps: AgentUIApp[]): boolean => {
  if (!apps.length) return true;
  return apps.every(
    (a) => !a.id && ['http', 'shuffle_tools', 'shuffle-tools'].includes((a.name || '').toLowerCase()),
  );
};


// ── Inner: timeline item ──────────────────────────────────────────────────────

/** Compact live countdown text (no chip/icon) for the duration column. */
const DurationCountdown: React.FC<{ resumeAtMs: number }> = ({ resumeAtMs }) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = resumeAtMs - nowMs;
  return (
    <Tooltip title={`Scheduled to continue at ${new Date(resumeAtMs).toLocaleString()}`} arrow>
      <Box component="span" sx={{ whiteSpace: 'nowrap', cursor: 'default' }}>
        {remaining > 0 ? `in ${formatTimeLeft(remaining)}` : 'due now'}
      </Box>
    </Tooltip>
  );
};


const StatusIcon: React.FC<{ status?: string; resumeAtMs?: number; authBlockedApp?: string | null }> = ({
  status,
  resumeAtMs,
  authBlockedApp,
}) => {
  const s = (status || '').toUpperCase();
  const isScheduledWait = s === 'WAITING' && !!resumeAtMs;
  // Tick while a scheduled wait is counting down so the tooltip stays accurate.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isScheduledWait) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isScheduledWait]);
  let node: React.ReactNode;
  let label: string;

  if (authBlockedApp) {
    node = <LockIcon size={20} color={'hsl(var(--destructive))'} />;
    label = `Authentication required for ${formatAppDisplayName(authBlockedApp)} — step cannot proceed until connected`;
  } else if (s === 'RUNNING' || s === 'EXECUTING' || s === '') {
    node = <CircularProgress size={18} sx={{ color: STATUS_COLORS.running }} />;
    label = 'Running';
  } else if (s === 'WAITING') {
    if (isScheduledWait) {
      const remaining = (resumeAtMs as number) - nowMs;
      const at = new Date(resumeAtMs as number).toLocaleTimeString();
      node = <ScheduleIcon size={20} />;
      label = remaining > 0
        ? `Scheduled — continues in ${formatTimeLeft(remaining)} (at ${at})`
        : `Scheduled — due now (${at})`;
    } else {
      node = <PauseIcon size={20} />;
      label = 'Waiting for input';
    }
  } else if (s === 'FINISHED' || s === 'SUCCESS') {
    node = <CheckCircleIcon size={20} />;
    label = 'Finished successfully';
  } else if (s === 'ABORTED' || s === 'FAILURE') {
    node = <ErrorIcon size={20} color={'hsl(var(--destructive))'} />;
    label = s === 'ABORTED' ? 'Aborted' : 'Failed';
  } else if (s === 'IGNORED' || s === 'IGNORE') {
    node = <Box sx={{ width: 20, height: 20 }} />;
    label = 'Ignored — skipped after run finished';

  } else {
    node = <HourglassDisabledIcon size={20} color={'hsl(var(--muted-foreground))'} />;
    label = 'Pending';
  }
  return (
    <Tooltip title={label} arrow>
      <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {node}
      </Box>
    </Tooltip>
  );
};



interface TimelineRowProps {
  item: TimelineItem;
  index: number;
  open: boolean;
  onToggle: () => void;
  appsById: Record<string, AgentUIApp>;
  totalDuration: number;
  originalStartTime: number;
  maxWidth: number;
  questionAnswers: Record<string, { index: number; value: string }>;
  setQuestionAnswers: React.Dispatch<React.SetStateAction<Record<string, { index: number; value: string }>>>;
  onSubmitQuestions: (decisionId: string, answers: Record<string, any>, isContinuation?: boolean) => void;
  onRerunAgent: () => void;
  onRerunDecision: (decision: any) => void;
  agentRequestLoading: boolean;
  getFormUrl?: (decisionId: string) => string | null;
  runFinished?: boolean;
  onAuthenticateApp?: (appName: string, appId?: string | null) => void;
  onRefreshAuthenticatedApps?: () => void;
  isAppAuthenticated?: (appName: string, appId?: string | null) => boolean;
  authAppsLoading?: boolean;
  /** When true, briefly draw attention to this row + its output. Used after
   *  a "jump to evidence" click from the diagnosis banner. */
  highlight?: boolean;
  /** Optimistic UI: which decision the user just clicked Rerun on. That row
   *  shows a spinner and everything after it is dimmed. */
  rerunningDecisionId?: string | null;
  /** True when this row sits after the decision the user just rerun. */
  dimmedByRerun?: boolean;
  /** When set, this run has just been continued optimistically: the trailing
   *  finalise row is re-presented as the new "Continue" step with the user's
   *  input, instead of a stale spinning "Finalise". */
  optimisticContinueText?: string;
}

/** Compact relative time, e.g. "44m ago". Input is Unix seconds. */
const formatAgo = (sec: number): string => {
  const diff = Math.max(0, Date.now() / 1000 - sec);
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

// A scheduled WAITING row is still "running" from the user's point of view —
// its bar keeps filling from its start time up to now so the elapsed time is
// visible even though the row has no real end timestamp yet.
const ScheduledLiveBar: React.FC<{
  startSec: number;
  originalStartTime: number;
  totalDuration: number;
  maxWidth: number;
}> = ({ startSec, originalStartTime, totalDuration, maxWidth }) => {
  const [nowSec, setNowSec] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNowSec(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);
  if (!(startSec > 0) || !(totalDuration > 0) || !(maxWidth > 0)) return null;
  // The left edge is the row's real start position on the shared track and must
  // never be slid left to make room for the bar — an ongoing wait grows to the
  // right only, so the width is what gets clamped to the remaining track.
  const rawOffset = ((startSec - originalStartTime) / totalDuration) * maxWidth;
  const offset = Number.isFinite(rawOffset)
    ? Math.min(Math.max(0, rawOffset), Math.max(0, maxWidth - 4))
    : 0;
  const elapsed = Math.max(0, nowSec - startSec);
  const rawWidth = Math.max(4, (elapsed / totalDuration) * maxWidth);
  const width = Math.min(Number.isFinite(rawWidth) ? rawWidth : 4, maxWidth - offset);

  return (
    <Box sx={{
      position: 'absolute',
      left: `${(offset / maxWidth) * 100}%`,
      width: `${(width / maxWidth) * 100}%`,
      height: 8,
      top: 1,
      bgcolor: 'var(--timeline-bar-color)',
      borderRadius: 1,
      transition: 'all 0.2s ease, background-color 0.15s ease',
    }} />
  );
};

/** Live "N.NNs" counter for an ongoing processing row. */
const ElapsedSeconds: React.FC<{ sinceMs: number }> = ({ sinceMs }) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, (nowMs - sinceMs) / 1000);
  return (
    <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>
      {secs.toFixed(2)}s
    </Typography>
  );
};

const TimelineRow: React.FC<TimelineRowProps> = ({

  item, index, open, onToggle, appsById, totalDuration, originalStartTime,
  maxWidth, questionAnswers, setQuestionAnswers, onSubmitQuestions,
  onRerunAgent, onRerunDecision, agentRequestLoading, getFormUrl, runFinished,
  onAuthenticateApp, onRefreshAuthenticatedApps, isAppAuthenticated, authAppsLoading = false, highlight = false,
  rerunningDecisionId = null, dimmedByRerun = false, optimisticContinueText,
}) => {
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const validate = validateJson(item.details);
  const screenshotPayloads = useMemo(
    () => extractScreenshotPayloads(validate.valid ? validate.result : item.details),
    [validate.valid, validate.result, item.details],
  );
  const screenshotCount = screenshotPayloads.length;

  const itemStart = item.start_time || 0;
  const itemEnd = item.end_time || itemStart;
  const hasTiming = itemStart > 0 && itemEnd >= itemStart;
  const dur = hasTiming ? Math.max(0, itemEnd - itemStart) : 0;
  // Rows with real timestamps always show their duration — hiding sub-second
  // rows made sibling decisions look inconsistent (4 with a time, 1 blank).
  // Only genuinely negligible timings (< 50ms) are suppressed.
  const showTiming = dur >= 0.05;

  // Clamp the bar to the track. Timings coming back from the API are not
  // always consistent (an item can start before the computed run start, or
  // still be running so its end is "now" and exceeds the total), which would
  // otherwise push the bar out of its track and over the duration column.
  const rawWidth = totalDuration > 0 && hasTiming ? Math.max(4, (dur / totalDuration) * maxWidth) : 0;
  // Width is the source of truth: a longer duration must never render a
  // shorter bar. Clamp it to the track, then slide the offset left so the
  // bar stays inside the track instead of being truncated.
  const width = Number.isFinite(rawWidth) ? Math.min(rawWidth, maxWidth) : 0;
  const rawOffset = totalDuration > 0 && hasTiming ? ((itemStart - originalStartTime) / totalDuration) * maxWidth : 0;
  const offset = Number.isFinite(rawOffset)
    ? Math.min(Math.max(0, rawOffset), Math.max(0, maxWidth - width))
    : 0;
  const leftPct = maxWidth > 0 ? (Math.max(0, offset) / maxWidth) * 100 : 0;
  const widthPct = maxWidth > 0 ? (width / maxWidth) * 100 : 0;


  // Adapt label based on action/category
  let displayType = item.type as string;
  let displayLabel = item.label?.replace(/_/g, ' ') || '';
  const details = item.details as AgentDecision | undefined;
  const isProcessing = item.category === 'processing';
  const isLiveProcessing = isProcessing && (item.status || '').toUpperCase() === 'EXECUTING';
  // More than 60s without a new decision: the run is most likely stuck, not
  // still thinking. Flag it as a likely (not definite) timeout.
  const isLikelyTimedOut =
    isLiveProcessing && (item.end_time || 0) - (item.start_time || 0) > 60;
  // When this row is the run's Finalise, how long ago it completed.
  const finishedAtSec = item.end_time || item.start_time || 0;

  const isWaitingRow = isProcessing && item.label === 'waiting';
  if (isProcessing) {
    displayType = isWaitingRow ? 'waiting' : 'processing';
    displayLabel = '';
  } else if (details?.reason) {
    displayLabel = details.reason;
  }
  const isFinishLikeRow =
    item.category === 'finalise' || item.category === 'finish' ||
    details?.action === 'finalise' || details?.action === 'finish';
  // Optimistic continuation: the previous finalise row becomes the new
  // "Continue" step carrying the user's input.
  const isOptimisticContinueRow = Boolean(optimisticContinueText) && isFinishLikeRow;
  if (!isProcessing) {
    if (isOptimisticContinueRow) {
      displayType = 'continue';
      displayLabel = `User Input: ${optimisticContinueText}`;
    } else if (details?.action === 'finish' || item.category === 'finish' || details?.action === 'finalise') {
      displayType = 'finalise';
    } else if (isContinuationDecision(details)) {
      displayType = 'continue';
    } else if (isAskDecision(details, item.category)) {
      displayType = 'question';
    } else if (details?.action === 'add_tool') {
      displayType = 'add tool';
    }
  }

  // Plain-language explanation of each row type, shown on hover of the chip.
  const TYPE_TOOLTIPS: Record<string, string> = {
    agent: 'The overall agent run: total time from start to finish.',
    decision: 'A step the agent decided to take, usually an action against a tool or API.',
    processing: 'Dead time between steps while the agent was thinking and generating its next decision.',
    waiting: 'Idle time before the agent continued — it was not doing any work here.',
    continue: 'The agent chose to continue its current plan without taking a new action.',
    question: 'The agent asked for human input or approval before continuing.',
    finalise: 'The final answer or summary produced at the end of the run.',
    'add tool': 'The agent added a new tool to its available actions.',
  };
  const typeTooltip = TYPE_TOOLTIPS[displayType] || '';

  // Resolve app icon for the tool used. `details.tool` may be a name or an ID.
  // Skip finalise/question/finish actions — they use the agent's "core" tool.
  // Also skip generic transport tools (api/http/webhook/shuffle_tools/singul/
  // core) that don't represent a specific integration — otherwise we end up
  // showing whichever app happened to be cached under that generic key
  // (e.g. Gmail for tool="api"), which is misleading.
  let toolApp: AgentUIApp | undefined;
  const GENERIC_TOOLS = new Set(['api', 'http', 'https', 'webhook', 'singul', 'core', 'shuffle_tools', 'shuffle-tools']);
  const skipToolIcon =
    item.category === 'finalise' || item.category === 'finish' ||
    isAskDecision(details, item.category) || isContinuationDecision(details) ||
    details?.action === 'finalise' || details?.action === 'finish';
  if (!skipToolIcon && details?.tool && typeof details.tool === 'string') {
    const raw = details.tool;
    let tn = raw.toLowerCase().replace(/[\s-]+/g, '_');
    if (tn.startsWith('app:')) tn = tn.split(':')[2] || tn;
    if (!GENERIC_TOOLS.has(tn)) {
      const candidate = appsById[raw] || appsById[tn];
      // Only trust the lookup when the resolved app's id or normalized name
      // actually matches the tool slug — `appsById` is a shared map keyed by
      // multiple aliases, so a stale/aliased entry can otherwise return an
      // unrelated app (the original symptom: tool="api" → Gmail icon).
      if (candidate) {
        const candidateSlugs = new Set<string>();
        if (candidate.id) candidateSlugs.add(String(candidate.id).toLowerCase());
        if (candidate.name) candidateSlugs.add(candidate.name.toLowerCase().replace(/[\s-]+/g, '_'));
        if (candidateSlugs.has(tn) || candidateSlugs.has(raw.toLowerCase())) {
          toolApp = candidate;
        }
      }
    }
  }

  // Question fields. A field counts as "answered" when either the upstream
  // payload already carries an `answer` value on the field itself, or the
  // user has typed an answer locally in `questionAnswers`.
  const questions: { question: string; index: number; preAnswer?: string }[] = [];
  if (isAskDecision(details, item.category)) {
    let anyPreAnswered = false;
    for (const f of details?.fields || []) {
      const preAnswer = typeof (f as any).answer === 'string' ? (f as any).answer.trim() : '';
      if (preAnswer) anyPreAnswered = true;
      const questionText = getQuestionFieldText(f, details, item.category);
      if (questionText) {
        questions.push({ question: questionText, index: questions.length + 1, preAnswer: preAnswer || undefined });
      }
    }
    // No usable question text on any field — fall back to the decision's
    // reason/description so the analyst still has something to answer.
    if (!questions.length && !anyPreAnswered) {
      const fallback = getAskFallbackQuestion(details);
      if (fallback) questions.push({ question: fallback, index: 1 });
    }
  }
  const questionsAnswered = questions.every(
    (q) => q.preAnswer || questionAnswers[q.question]?.value
  );
  const unansweredQuestions = questions.filter(
    (q) => !q.preAnswer && !questionAnswers[q.question]?.value
  );

  // If the run as a whole has finished, treat any still-RUNNING/WAITING rows
  // (typically an unanswered ASK that the agent moved past) as ignored so we
  // don't keep highlighting them with the orange "running" bar.
  const isFinaliseRow =
    item.category === 'finalise' || item.category === 'finish' ||
    details?.action === 'finalise' || details?.action === 'finish';
  const effectiveStatus = (() => {
    const s = (item.status || '').toUpperCase();
    // An optimistically continued row is done — never leave it spinning.
    if (isOptimisticContinueRow) return 'FINISHED';
    if (!runFinished) return item.status;
    // The finalise row IS the run's completion — never leave it spinning once
    // the run itself reports FINISHED, even if the row carries no status.
    if (isFinaliseRow && (s === '' || s === 'RUNNING' || s === 'WAITING' || s === 'EXECUTING')) return 'FINISHED';
    // The run is over, so a step still claiming to run never concluded — most
    // likely it crashed. Never leave it spinning.
    if (s === '' || s === 'RUNNING' || s === 'WAITING' || s === 'EXECUTING') return 'IGNORED';

    return item.status;
  })();

  const isFailed = effectiveStatus === 'FAILURE' || effectiveStatus === 'ABORTED';
  // A WAITING decision that carries a delay is scheduled, not finished — its
  // completed_at is the moment the delay was set, not when the step completes.
  const scheduledResumeMs = getScheduledResumeMs(details);
  // A decision that carries a delay is scheduled, not finished — its
  // completed_at is the moment the delay was set, not when the step completes.
  // The backend does not always keep it in WAITING, so treat any not-yet-
  // concluded row with a delay as scheduled.
  const isScheduledWait = scheduledResumeMs > 0 && (() => {
    const s = (effectiveStatus || '').toUpperCase();
    return s === 'WAITING' || s === 'RUNNING' || s === 'EXECUTING' || s === '';
  })();

  const rowAuthReq = extractAuthRequest(details);
  const isRowAuthBlocked =
    !!rowAuthReq &&
    !isAppAuthenticated?.(rowAuthReq.appName, rowAuthReq.appId) &&
    (effectiveStatus === 'WAITING' || effectiveStatus === 'PENDING' || effectiveStatus === 'FAILURE' || effectiveStatus === 'ABORTED');

  // Default bar color: only failed executions stand out; everything else is
  // neutral so the timeline does not look like a color parade.
  const barColor = isProcessing
    ? 'hsl(var(--muted-foreground) / 0.45)'
    : (isFailed || isRowAuthBlocked)
      ? STATUS_COLORS.error
      : 'hsl(var(--muted-foreground) / 0.35)';
  // On hover we reveal the real status color so context is still one tap away.
  const hoverBarColor = isProcessing
    ? 'hsl(var(--muted-foreground) / 0.45)'
    : effectiveStatus === 'FINISHED' || effectiveStatus === 'IGNORED'
      ? STATUS_COLORS.finished
      : (isFailed || isRowAuthBlocked)
        ? STATUS_COLORS.error
        : STATUS_COLORS.running;


  const isRerunTarget =
    !!rerunningDecisionId &&
    item.type === 'decision' &&
    details?.run_details?.id === rerunningDecisionId;

  return (
    <Box
      data-timeline-index={index}
      sx={{
        borderTop: index === 0 ? 'none' : '1px solid hsl(var(--border))',
        bgcolor: highlight
          ? 'hsla(var(--severity-medium) / 0.12)'
          : isRerunTarget
            ? 'hsla(var(--primary) / 0.08)'
            : open
              ? 'hsl(var(--muted) / 0.3)'
              : 'transparent',
        transition: 'background-color 0.2s ease',
        '&:hover': {
          bgcolor: 'hsl(var(--muted) / 0.4)',
        },
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          bgcolor: barColor,
          transition: 'background-color 0.15s ease',
        },
        '&:hover::before': {
          bgcolor: hoverBarColor,
        },
        scrollMarginTop: 96,
        boxShadow: highlight
          ? 'inset 0 0 0 2px hsla(var(--severity-medium) / 0.55)'
          : isRerunTarget
            ? 'inset 0 0 0 1px hsla(var(--primary) / 0.5)'
            : 'none',
        opacity: dimmedByRerun ? 0.35 : 1,
        pointerEvents: dimmedByRerun ? 'none' : 'auto',
      }}
    >
      <Box
        onClick={onToggle}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          p: 1.5,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <Box sx={{ width: 24, display: 'flex', justifyContent: 'center' }}>
          {isRerunTarget ? (
            <CircularProgress size={14} sx={{ color: 'hsl(var(--primary))' }} />
          ) : isProcessing ? (
            isLikelyTimedOut ? (
              <Tooltip title="No new activity for over a minute — this run has most likely timed out." arrow>
                <Box sx={{ display: 'flex' }}>
                  <WarningIcon size={14} color={STATUS_COLORS.warning} />
                </Box>
              </Tooltip>
            ) : isLiveProcessing ? (
              <CircularProgress size={12} sx={{ color: 'hsl(var(--muted-foreground))' }} />
            ) : (
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'hsl(var(--muted-foreground) / 0.5)' }} />
            )
          ) : (
            <StatusIcon status={effectiveStatus} resumeAtMs={scheduledResumeMs} authBlockedApp={isRowAuthBlocked ? rowAuthReq.appName : null} />
          )}
        </Box>
        <Box sx={{ width: 24, display: 'flex', justifyContent: 'center' }}>
          {isProcessing ? (
            <Box sx={{ width: 22 }} />
          ) : toolApp?.icon ? (
            <Tooltip title={(toolApp.name || '').replace(/_/g, ' ')} arrow>
              <Avatar src={toolApp.icon} sx={{ width: 22, height: 22, bgcolor: 'transparent' }} variant="rounded" />
            </Tooltip>
          ) : item.category === 'finalise' || details?.action === 'finish' ? (
            <Tooltip title="Final answer" arrow>
              <CheckIcon size={18} />
            </Tooltip>
          ) : (
            <Box sx={{ width: 22 }} />
          )}
        </Box>

        <Tooltip
          title={isLikelyTimedOut ? 'No new activity for over a minute — this run has most likely timed out.' : typeTooltip}
          arrow
        >
          <Chip
            label={displayType}
            size="small"
            sx={{
              height: 22,
              bgcolor: isProcessing ? 'transparent' : 'hsl(var(--muted))',
              color: isLikelyTimedOut ? STATUS_COLORS.warning : isProcessing ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
              border: isLikelyTimedOut ? `1px dashed ${STATUS_COLORS.warning}` : isProcessing ? '1px dashed hsl(var(--border))' : 'none',
              fontSize: '0.7rem',
              fontWeight: 500,
              textTransform: 'capitalize',
              width: 92,
              minWidth: 92,
              maxWidth: 92,
              flexShrink: 0,
              fontStyle: isProcessing ? 'italic' : 'normal',
            }}
          />
        </Tooltip>

        <Box sx={{
          flex: 1,
          minWidth: 180,
          fontSize: '0.85rem',
          color: 'hsl(var(--foreground))',
          maxHeight: 60,
          overflow: 'hidden',
          '& p': { margin: 0 },
          '& pre, & code': { fontSize: '0.78rem' },
          '& a': { color: 'hsl(var(--primary))', textDecoration: 'underline', textUnderlineOffset: '2px' },
          '& a:hover': { opacity: 0.85 },
        }}>
          <ShuffleMarkdown>{normalizeMarkdown(displayLabel)}</ShuffleMarkdown>
        </Box>
        <Tooltip title={isScheduledWait ? (
          <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <span>Started: {new Date(itemStart * 1000).toLocaleString()}</span>
            <span>Scheduled to continue: {new Date(scheduledResumeMs).toLocaleString()}</span>
          </Box>
        ) : showTiming ? (
          <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <span>Started: {new Date(itemStart * 1000).toLocaleString()}</span>
            <span>Finished: {new Date((itemStart + dur) * 1000).toLocaleString()}</span>
            <span>Duration: {dur.toFixed(2)}s</span>
          </Box>
        ) : ''}>
          <Box sx={{ width: maxWidth, maxWidth, minWidth: 40, position: 'relative', height: 10, flexShrink: 1, flexBasis: maxWidth, overflow: 'hidden' }}>
            {isScheduledWait ? (
              <ScheduledLiveBar
                startSec={itemStart}
                originalStartTime={originalStartTime}
                totalDuration={totalDuration}
                maxWidth={maxWidth}
              />
            ) : showTiming && (
              <Box sx={{
                position: 'absolute',
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                height: 8,
                top: 1,
                bgcolor: 'var(--timeline-bar-color)',
                borderRadius: 1,
                transition: 'all 0.2s ease, background-color 0.15s ease',
              }} />
            )}

          </Box>
        </Tooltip>

        <Box sx={{ width: 84, flexShrink: 0, fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', textAlign: 'right', lineHeight: 1.3, whiteSpace: 'nowrap' }}>
          {isScheduledWait ? (
            <DurationCountdown resumeAtMs={scheduledResumeMs} />
          ) : showTiming ? `${dur.toFixed(2)}s` : ''}

          {displayType === 'finalise' && finishedAtSec > 0 && (
            <Tooltip title={`Finished: ${new Date(finishedAtSec * 1000).toLocaleString()}`} arrow>
              <Box component="div" sx={{ whiteSpace: 'nowrap', opacity: 0.75 }}>{formatAgo(finishedAtSec)}</Box>
            </Tooltip>
          )}
        </Box>


        {/* Per-row actions: Approve/Deny, Rerun, Screenshot indicator */}
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 0.25, ml: 1, minWidth: 68, flexShrink: 0, justifyContent: 'flex-end' }}
          onClick={(e) => {
            // Only swallow the click when it actually lands on a button —
            // otherwise the empty area inside this row-actions box would
            // block the parent's expand/collapse toggle.
            if ((e.target as HTMLElement).closest('button, a')) e.stopPropagation();
          }}
        >
          {item.type === 'decision'
            && details?.run_details?.status === 'WAITING'
            && isAskDecision(details, item.category)
            && questions.length === 0 && (
            <>
              <Tooltip title="Approve this step">
                <span>
                  <IconButton
                    size="small"
                    disabled={agentRequestLoading}
                    onClick={() => {
                      if (details?.run_details?.id) onSubmitQuestions(details.run_details.id, { approve: 'true' });
                    }}
                    sx={{ color: STATUS_COLORS.finished }}
                  >
                    <ThumbUpIcon size={16} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Deny this step">
                <span>
                  <IconButton
                    size="small"
                    disabled={agentRequestLoading}
                    onClick={() => {
                      if (details?.run_details?.id) onSubmitQuestions(details.run_details.id, { approve: 'false' });
                    }}
                    sx={{ color: STATUS_COLORS.error }}
                  >
                    <ThumbDownIcon size={16} />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          )}
          {item.type === 'agent' && null}
          {item.type === 'decision' && (() => {
            const action = details?.action;
            const cat = item.category;
            const isApiAction =
              !isAskDecision(details, cat) &&
              !isContinuationDecision(details) &&
              action !== 'finish' && action !== 'finalise' && cat !== 'finish' && cat !== 'finalise' &&
              cat !== 'processing' &&
              action !== 'add_tool';
            if (!isApiAction) return null;
            return (
              <Tooltip title={isRerunTarget ? 'Rerun starting…' : 'Rerun from this decision (clears all decisions after it)'}>
                <span>
                  <IconButton
                    size="small"
                    disabled={agentRequestLoading || !details?.run_details?.id || isRerunTarget}
                    onClick={() => details && onRerunDecision(details)}
                    sx={{ color: isRerunTarget ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--primary))' } }}
                  >
                    {isRerunTarget
                      ? <CircularProgress size={14} sx={{ color: 'hsl(var(--primary))' }} />
                      : <RestartAltIcon size={16} />}
                  </IconButton>
                </span>
              </Tooltip>
            );
          })()}
          {item.type === 'decision' && (details?.run_details as any)?.debug_url && (() => {
            const rawDebugUrl = String((details!.run_details as any).debug_url);
            // Pull the execution id out of the debug URL so we can open the
            // in-app execution sidebar instead of a new browser tab.
            let debugExecutionId = '';
            let debugAuthorization = '';
            try {
              const qp = rawDebugUrl.split('?')[1] || '';
              const parsed = new URLSearchParams(qp);
              debugExecutionId = parsed.get('execution_id') || '';
              debugAuthorization = parsed.get('authorization') || '';
            } catch { /* noop */ }
            if (!debugExecutionId) {
              const m = rawDebugUrl.match(/[0-9a-fA-F-]{36}/g);
              if (m && m.length > 0) debugExecutionId = m[m.length - 1];
            }
            // The explorer can resolve a run from the execution id alone (it
            // falls back to the session-authenticated fetch), so only the id
            // is required. The authorization token, when present in the debug
            // URL, is passed along as an extra hint.
            const canOpenRun = Boolean(debugExecutionId);
            return (
              <Tooltip title={canOpenRun
                ? 'View full execution'
                : 'Execution details are no longer available for this step (missing execution id)'}>
                <span>
                  <IconButton
                    size="small"
                    disabled={!canOpenRun}
                    onClick={() => {
                      if (!canOpenRun) return;
                      try {
                        window.dispatchEvent(new CustomEvent('workflow-run:open', {
                          detail: {
                            executionId: debugExecutionId,
                            authorization: debugAuthorization,
                          },
                        }));
                      } catch { /* noop */ }
                    }}
                    sx={{ color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--primary))' } }}
                  >
                    <PanelRightOpenIcon size={16} />
                  </IconButton>
                </span>
              </Tooltip>
            );
          })()}
          {item.type === 'decision' && !isProcessing && screenshotCount > 0 && (
            <Tooltip
              title={screenshotCount > 1 ? `${screenshotCount} screenshots in this decision` : 'Screenshot in this decision'}
              arrow
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0.25,
                  width: 28,
                  height: 28,
                  flexShrink: 0,
                  color: 'hsl(var(--muted-foreground))',
                }}
              >
                <ImageIcon size={14} />
                {screenshotCount > 1 && (
                  <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, lineHeight: 1 }}>
                    {screenshotCount}
                  </Typography>
                )}
              </Box>
            </Tooltip>
          )}

        </Box>
      </Box>

      {/* Question form (for ASK decisions) */}
      {questions.length > 0 && !runFinished && (item.status === 'RUNNING' || item.status === 'WAITING') && (
        <Box sx={{ px: 4, pb: 2 }}>
          {(() => {
            const trySubmit = () => {
              if (agentRequestLoading) return;
              if (!questionsAnswered) {
                setSubmitAttempted(true);
                return;
              }
              if (details?.run_details?.id) {
                onSubmitQuestions(details.run_details.id, questionAnswers);
              }
            };
            return (
              <>
                {details?.reason && (
                  <Box sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.4, mb: 1.5 }}>
                    {truncateReason(details.reason)}
                  </Box>
                )}
                {questions.map((q, qi) => {
                  const value = questionAnswers[q.question]?.value || '';
                  const isMissing = submitAttempted && !value;
                  return (
                    <Box key={qi} sx={{ mt: 2 }}>
                      <Box sx={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))', mb: 1 }}>
                        <ShuffleMarkdown>{normalizeMarkdown(q.question)}</ShuffleMarkdown>
                      </Box>
                      <TextField
                        fullWidth
                        multiline
                        minRows={2}
                        placeholder="Your answer here…"
                        value={value}
                        error={isMissing}
                        helperText={isMissing ? 'Please answer this question' : undefined}
                        onChange={(e) => {
                          const v = e.target.value;
                          setQuestionAnswers((prev) => ({
                            ...prev,
                            [q.question]: { index: qi, value: v },
                          }));
                        }}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            e.preventDefault();
                            trySubmit();
                          }
                        }}
                        size="small"
                        sx={{
                          '& .MuiOutlinedInput-root': { bgcolor: 'hsl(var(--card))' },
                        }}
                      />
                    </Box>
                  );
                })}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                  <Tooltip title={!questionsAnswered ? 'Please answer all questions first' : ''} placement="top" arrow>
                    <span>
                      <Button
                        variant="contained"
                        size="small"
                        disabled={agentRequestLoading || !questionsAnswered}
                        onClick={trySubmit}
                        startIcon={agentRequestLoading ? <CircularProgress size={14} sx={{ color: 'hsl(var(--primary-foreground))' }} /> : undefined}
                      >
                        {agentRequestLoading ? 'Submitting…' : 'Submit'}
                      </Button>
                    </span>
                  </Tooltip>
            {details?.run_details?.id && getFormUrl && getFormUrl(details.run_details.id) && (
              <Tooltip title="Answer in the Form UI" placement="right">
                <IconButton
                  size="small"
                  onClick={() => {
                    const url = getFormUrl(details.run_details!.id!);
                    if (url) window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  sx={{ color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--primary))' } }}
                >
                  <OpenInNewIcon size={18} />
                </IconButton>
              </Tooltip>
                  )}
                </Box>
              </>
            );
          })()}
        </Box>
      )}

      {/* Unanswered questions (read-only) when the run finished without an answer */}
      {open && runFinished && unansweredQuestions.length > 0 && (
        <Box sx={{ px: 4, pb: 2 }}>
          <Typography sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'hsl(var(--muted-foreground))', mb: 1 }}>
            {unansweredQuestions.length === 1 ? 'Question (unanswered)' : 'Questions (unanswered)'}
          </Typography>
          <Box sx={{
            p: 2, borderRadius: 1.5,
            border: '1px solid hsl(var(--border))',
            bgcolor: 'hsl(var(--background))',
            display: 'flex', flexDirection: 'column', gap: 1.5,
          }}>
            {unansweredQuestions.map((q, qi) => (
              <Box key={qi} sx={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))', '& p': { my: 0.5 } }}>
                <ShuffleMarkdown>{normalizeMarkdown(q.question)}</ShuffleMarkdown>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* App authentication required banner — surfaces whenever the upstream
          tool returned `action: "app_authentication"`. Always visible
          (regardless of expand state) so users do not have to click into
          a failed step to discover that auth is missing. */}
      {(() => {
        const req = extractAuthRequest(details);
        if (!req) return null;
        if (authAppsLoading) return null;
        const authed = !!isAppAuthenticated?.(req.appName, req.appId);
        const pretty = req.appName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        const slug = normalizeAgentAppName(req.appName);
        const appId = req.appId || appsById[req.appName]?.id || appsById[slug]?.id || null;
        const icon = appsById[req.appName]?.icon || appsById[slug]?.icon || (appId ? appsById[appId]?.icon : '') || '';
        return (
          <Box sx={{ px: 4, pb: 2 }}>
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 1.5,
              borderRadius: 1.5,
              border: authed
                ? '1px solid hsla(var(--severity-low) / 0.35)'
                : '1px solid hsla(var(--severity-medium) / 0.3)',
              bgcolor: authed
                ? 'hsla(var(--severity-low) / 0.08)'
                : 'hsla(var(--severity-medium) / 0.08)',
            }}>
              <LockIcon size={22} color={authed ? 'hsl(var(--severity-low))' : 'hsl(var(--severity-medium))'} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                  {authed
                    ? `${pretty} is now connected — rerun this action`
                    : `${pretty} requires authentication`}
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                  {authed
                    ? `This step failed because ${pretty} was not authenticated. Credentials are saved, so rerunning should succeed.`
                    : `Connect your ${pretty} account so the agent can complete this step, then rerun the decision.`}
                </Typography>
              </Box>
              {authed && (
                <Button
                  variant="text"
                  size="small"
                  startIcon={
                    <Avatar
                      src={icon || undefined}
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
                  disabled={!onAuthenticateApp}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRefreshAuthenticatedApps?.();
                    onAuthenticateApp?.(req.appName, appId);
                  }}
                  sx={{
                    height: 36, textTransform: 'none', fontWeight: 500,
                    color: 'hsl(var(--muted-foreground))',
                  }}
                >
                  Review authentication
                </Button>
              )}
              {authed ? (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<RestartAltIcon size={16} />}
                  disabled={agentRequestLoading || !details?.run_details?.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (details) onRerunDecision(details);
                  }}
                  sx={{ height: 36, textTransform: 'none', fontWeight: 600 }}
                >
                  Rerun action
                </Button>
              ) : (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={
                    <Avatar
                      src={icon || undefined}
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
                  disabled={!onAuthenticateApp}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRefreshAuthenticatedApps?.();
                    onAuthenticateApp?.(req.appName, appId);
                  }}
                  sx={{
                    height: 36, textTransform: 'none', fontWeight: 600,
                  }}
                >
                  Authenticate {pretty}
                </Button>
              )}
            </Box>
          </Box>
        );
      })()}

      {/* Screenshot returned by the action (e.g. shuffle_hostmonitors script:screenshot) */}
      {open && !isProcessing && item.type !== 'agent' && screenshotCount > 0 && (
        <Box sx={{ px: 4, pb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {screenshotCount > 1 && (
            <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>
              {screenshotCount} screenshots returned by this action
            </Typography>
          )}
          {screenshotPayloads.map((payload, i) => (
            <ActionOutputView key={i} output={payload} />
          ))}
        </Box>
      )}

      {/* Raw JSON */}
      {open && !isProcessing && item.details != null && item.details !== '' && (

        <Box sx={{ px: 4, pb: 2 }}>
          <Box
            sx={{
              p: 2,
              borderRadius: 1.5,
              border: highlight
                ? '1px solid hsl(var(--severity-medium))'
                : '1px solid hsl(var(--border))',
              bgcolor: 'hsl(var(--background))',
              boxShadow: highlight
                ? '0 0 0 3px hsla(var(--severity-medium) / 0.25)'
                : 'none',
              transition: 'border-color 0.6s ease, box-shadow 0.6s ease',
              overflow: 'auto',
              maxHeight: 400,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              '& .json-view': {
                fontSize: '0.72rem !important',
                fontFamily: 'inherit !important',
                bgcolor: 'transparent !important',
              },
            }}
          >
            {validate.valid && validate.result && typeof validate.result === 'object' ? (
              <JsonView
                src={deepParseJsonStrings(validate.result)}
                dark
                collapsed={defaultCollapsed}
                collapseStringMode="word"
                collapseStringsAfterLength={120}
                enableClipboard
                displaySize
              />
            ) : (
              <Box component="pre" sx={{ m: 0, fontSize: '0.72rem', color: 'hsl(var(--foreground))' }}>
                <code>{String(item.details ?? '')}</code>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

// ── Main component ────────────────────────────────────────────────────────────


const AgentUI: React.FC<AgentUIProps> = ({
  apps,
  defaultApps,
  autoLoadApps = true,
  title = 'What do you want to do?',
  subtitle,
  placeholder,
  defaultInput = '',
  autoSubmit = false,
  hideHeroIcon = false,
  heroIcon,
  heroIconSize = 84,
  maxWidth = 850,
  compact = false,
  mobileView,
  hideAppPicker = false,
  hideAttach = false,
  disableStartTab = false,
  appPickerLabel = 'Tools',
  appPickerTitle = 'Tools',
  appPickerSubtitle = 'Pick the tools the agent is allowed to use for this run',
  onChooseLLM,
  hideChooseLLM = false,
  isLoggedIn,
  submitTooltip = '⌘+Enter to send',
  submitIcon,
  submitOverride,
  submitLabel,
  disableSchedule,
  disableScheduleTooltip,
  continuationPlaceholder = 'Add more details to continue this task…',
  readUrlParams = true,
  executionId,
  authorization,
  initialExecution,
  onRun,
  onAppsChange,
  onViewChange,
  onSchedule,
  apiKey,
  apiBaseUrl,
  orgId,
  theme,
  colorMode,
  className,
  sx,
  contentSx,
  userId,
  hidePresets = false,
  presets,
  initialPresetId,
  onSelectPreset,
  contextCategory,
  contextStorageKey,
  isSupport,
  presetCtas,
  sidebarLayout = false,
  composeSubmitInput: propComposeSubmitInput,
  contextParams,
  incidentId: propIncidentId,
  incidentContext: propIncidentContext,
  vulnerabilityId: propVulnerabilityId,
  workflowId: propWorkflowId,
}) => {
  const isEffectiveSupport = isSupport !== undefined ? isSupport : isSupportUser();

  // Per-instance API target. Props win over the shared API_CONFIG so the
  // component can be embedded against a different Shuffle backend without
  // mutating global state.
  const resolveUrl = useCallback(
    (path: string) => (apiBaseUrl ? `${apiBaseUrl.replace(/\/+$/, '')}${path}` : getApiUrl(path)),
    [apiBaseUrl],
  );
  const resolveHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = apiKey
      ? { Authorization: `Bearer ${apiKey}` }
      : { ...getAuthHeader() };
    if (orgId) h['Org-Id'] = orgId;
    return h;
  }, [apiKey, orgId]);
  const hasApiKey = !!apiKey || !!API_CONFIG.apiKey;

  const resolvedIncidentId = propIncidentId || (
    contextCategory === 'incidents' ? contextParams?.id : undefined
  ) || (
    typeof window !== 'undefined' ? (window as any).__shuffleActiveIncidentId : undefined
  );

  const resolvedIncidentContext = propIncidentContext || (
    typeof window !== 'undefined' ? (window as any).__shuffleActiveIncidentContext : undefined
  );

  const resolvedVulnerabilityId = propVulnerabilityId || (
    contextCategory === 'vulnerabilities' ? contextParams?.id : undefined
  ) || (
    typeof window !== 'undefined' ? (window as any).__shuffleActiveVulnerabilityId : undefined
  );

  const resolvedWorkflowId = propWorkflowId || (
    contextCategory === 'workflows' ? contextParams?.id : undefined
  ) || (
    typeof window !== 'undefined' ? (window as any).__shuffleActiveWorkflowId : undefined
  );
  // Phone-sized viewports get a condensed starter block: no hero icon,
  // smaller title, tighter vertical rhythm. Desktop is unchanged.
  // When mobileView is explicitly provided, it overrides the viewport check.
  const isPhoneScreen = useMediaQuery('(max-width:600px)', { noSsr: true });
  const isPhone = mobileView !== undefined ? mobileView : isPhoneScreen;
  const [actionInput, setActionInput] = useState<string>(() => {
    if (contextStorageKey) {
      const saved = getPageContextChoice(contextStorageKey);
      if (saved?.draftPrompt !== undefined && saved.draftPrompt !== '') {
        return saved.draftPrompt;
      }
    }
    return defaultInput || '';
  });
  const lastStorageKeyRef = useRef(contextStorageKey);
  useEffect(() => {
    if (lastStorageKeyRef.current !== contextStorageKey) {
      lastStorageKeyRef.current = contextStorageKey;
      if (contextStorageKey) {
        const saved = getPageContextChoice(contextStorageKey);
        if (saved?.draftPrompt !== undefined && saved.draftPrompt !== '') {
          setActionInput(saved.draftPrompt);
        } else {
          setActionInput(defaultInput || '');
        }
      }
    }
  }, [contextStorageKey, defaultInput]);

  const prevDefaultInputRef = useRef(defaultInput);
  useEffect(() => {
    if (defaultInput && defaultInput !== prevDefaultInputRef.current) {
      prevDefaultInputRef.current = defaultInput;
      setActionInput(defaultInput);
    }
  }, [defaultInput]);
  // Editable per-user prompt prefix rendered as a chip at the start of the
  // input. Prepended to the submitted text so it feels like the user is
  // "typing to" the Shuffle Tools MCP without the prefix filling the box.
  //
  // Templates only swap the chip's visible label; the actual prompt and tool
  // selection are handled by the backend. The user's saved default prefix is
  // still prepended when no preset is selected.
  // Embedded execution views (drawer / list) never show the Start tab, so the
  // saved prefix is irrelevant there — skip its datastore fetch entirely so
  // opening the drawer does not wait on unrelated network requests.
  const { prompt: savedPromptPrefix } = useAgentPromptPrefix({ userId, persist: !disableStartTab });
  const [selectedPreset, setSelectedPreset] = useState<AgentPreset | null>(null);
  const presetsChipNodeRef = useRef<HTMLButtonElement | null>(null);

  const [presetsChipWidth, setPresetsChipWidth] = useState(0);
  const [inputScrolled, setInputScrolled] = useState(false);
  // Pixel scroll offset of the prompt textarea, so the floating Skill chip can
  // scroll together with the text instead of hovering above it. Applied
  // imperatively (not via state) so the chip never lags behind the text.
  const [inputScrollTop, setInputScrollTop] = useState(0);
  const chipOverlayRef = useRef<HTMLDivElement | null>(null);
  const applyChipScroll = useCallback((st: number) => {
    const el = chipOverlayRef.current;
    if (!el) return;
    // In multiline mode the chip is a static bottom-left element — it must not
    // be moved by the textarea's scroll offset.
    if (el.dataset.static === '1') {
      el.style.transform = '';
      el.style.opacity = '';
      el.style.pointerEvents = '';
      return;
    }
    el.style.transform = `translateY(${-st}px)`;
    el.style.opacity = st > 24 ? '0' : '1';
    el.style.pointerEvents = st > 4 ? 'none' : 'auto';
  }, []);

  const [promptSingleLine, setPromptSingleLine] = useState(true);
  const promptMultilineBase = !promptSingleLine;

  // Height of the attachment chip row (0 when nothing is attached). The
  // floating Templates chip is absolutely positioned, so it must be pushed
  // down by this amount to avoid overlapping the attachments.
  const [attachmentsRowHeight, setAttachmentsRowHeight] = useState(0);
  const attachmentsRowRef = useCallback((node: HTMLDivElement | null) => {
    setAttachmentsRowHeight(node ? node.getBoundingClientRect().height : 0);
  }, []);


  // Callback ref: measure the chip the instant it mounts (and whenever the
  // element is swapped out because the template label changed), so the
  // textarea's first-line indent is never stale or zero.
  const presetsChipRef = useCallback((node: HTMLButtonElement | null) => {
    presetsChipNodeRef.current = node;
    if (node) setPresetsChipWidth(node.getBoundingClientRect().width);
  }, []);

  const inputRef = useRef<HTMLInputElement>(null);
  // The template whose tool set is currently loaded. Tool changes are only
  // persisted as an override once the template's own tools have been seeded.
  const seededPresetIdRef = useRef<string | null>(null);


  // Restore the last used preset from localStorage so the choice survives
  // reloads, matching how assigned agent tools are remembered.
  // NOT when the input was prefilled by the caller (e.g. "Rerun" of an
  // existing run) — that prompt is already complete and must not be
  // silently wrapped in an unrelated template.
  useEffect(() => {
    if (!initialPresetId && defaultInput && defaultInput.trim().length > 0) {
      setSelectedPreset(null);
      return;
    }
    try {
      const lastId = initialPresetId !== undefined ? initialPresetId : localStorage.getItem(LAST_PRESET_STORAGE_KEY);
      if (!lastId) {
        if (initialPresetId === null) setSelectedPreset(null);
        return;
      }
      const list = filterAgentPresets(presets && presets.length > 0 ? presets : AGENT_PRESETS, isEffectiveSupport);
      const match = list.find((p) => p.id === lastId);
      if (!match || match.enabled === false) return;
      setSelectedPreset(match);
      // Restoring a template must also restore ITS tools — unless custom tools were already provided
      if (defaultApps === undefined && !apps) {
        const resolved = resolvePresetApps(match);
        const override = readPresetAppsOverride(match.id);
        if (override && override.length > 0) {
          // Merge in any newly assigned tools from permissions that weren't in the override
          const merged = [...override];
          for (const app of resolved) {
            const key = (app.id || app.name).toLowerCase();
            if (!merged.some((m) => (m.id || m.name).toLowerCase() === key)) {
              merged.push(app);
            }
          }
          setChosenApps(merged);
        } else {
          setChosenApps(resolved);
        }
      }
      seededPresetIdRef.current = match.id;
    } catch {
      /* ignore storage errors */
    }
  }, [presets, defaultInput, isEffectiveSupport, initialPresetId, defaultApps, apps]);

  useEffect(() => {
    const handleToolsChanged = () => {
      const targetPreset = selectedPreset || AGENT_PRESETS.find((p) => p.id === 'incident-response') || AGENT_PRESETS[0];
      if (targetPreset) {
        const next = resolvePresetApps(targetPreset);
        setChosenApps(next);
        writePresetAppsOverride(targetPreset.id, next);
      }
    };
    window.addEventListener(AGENT_TOOLS_CHANGED_EVENT, handleToolsChanged);
    return () => window.removeEventListener(AGENT_TOOLS_CHANGED_EVENT, handleToolsChanged);
  }, [selectedPreset]);



  // Keep the input's first-line text-indent in sync with the actual chip width
  // so wrapping text starts at the left edge below the chip.
  useLayoutEffect(() => {
    if (hidePresets) {
      setPresetsChipWidth(0);
      return;
    }
    const measure = () => {
      const node = presetsChipNodeRef.current;
      if (!node) return;
      const w = node.getBoundingClientRect().width;
      // Never fall back to 0 while the chip is mounted — a 0 indent makes the
      // first line render underneath the chip.
      setPresetsChipWidth(w > 0 ? w : 96);
    };
    measure();
    const raf = requestAnimationFrame(measure);
    // The chip's width changes after fonts load and when the template label
    // changes; without observing it the prefilled text (e.g. on "Rerun")
    // renders underneath the chip.
    const el = presetsChipNodeRef.current;
    let ro: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      try {
        ro = new ResizeObserver(measure);
        ro.observe(el);
      } catch {
        ro = null;
      }
    }

    let cancelled = false;
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready?.then(() => { if (!cancelled) measure(); }).catch(() => { /* ignore */ });
    return () => { cancelled = true; cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [selectedPreset, hidePresets, presets, actionInput]);

  // Keep the chip visible again once the textarea is back at the top (e.g. the
  // prompt was cleared or shortened, which does not always fire onScroll).
  useEffect(() => {
    const el = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!el) return;
    if (el.scrollTop <= 1 && inputScrolled) setInputScrolled(false);
    setInputScrollTop(el.scrollTop || 0);
    applyChipScroll(el.scrollTop || 0);
  }, [actionInput, inputScrolled, applyChipScroll]);


  // Track whether the prompt currently renders on a single line so the box can
  // stay fully pill-shaped until the text wraps.
  useLayoutEffect(() => {
    const el = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!el) { setPromptSingleLine(true); return; }
    const measure = () => {
      const node = inputRef.current as unknown as HTMLTextAreaElement | null;
      if (!node) return;
      const cs = window.getComputedStyle(node);
      const lh = parseFloat(cs.lineHeight || '0') || 20;
      const value = node.value || '';
      // An empty prompt is ALWAYS single line, regardless of any stale
      // scrollHeight the browser may still report after the text was cleared.
      if (value.length === 0) { setPromptSingleLine(true); return; }
      // While the box is locked to one line the textarea is height-capped with
      // overflow hidden, so scrollHeight alone is not a reliable wrap signal.
      // Measure the text directly against the room available on line 1
      // (content width minus the Skill chip's text-indent).
      let textWraps = value.includes('\n');
      if (!textWraps) {
        try {
          const contentWidth = node.clientWidth
            - (parseFloat(cs.paddingLeft || '0') || 0)
            - (parseFloat(cs.paddingRight || '0') || 0);
          const firstLineWidth = contentWidth - (parseFloat(cs.textIndent || '0') || 0);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx && firstLineWidth > 0) {
            ctx.font = cs.font && cs.font.trim().length > 0
              ? cs.font
              : `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`;
            // Expand well before the browser reaches the physical wrap point.
            // On top of the ratio guard we reserve ~5 characters of slack so
            // the switch happens while there is still visible room on line 1.
            const slack = ctx.measureText('00000').width;
            textWraps = ctx.measureText(value).width > (firstLineWidth * 0.82 - slack);
          }
        } catch { /* fall back to scrollHeight below */ }
      }
      const single = !textWraps && node.scrollHeight <= lh * 1.6;

      setPromptSingleLine((prev) => {
        if (prev === single) return prev;
        // Switching between one and multiple lines can leave the caret painted
        // at the wrong x-position (the browser does not re-lay-out the
        // first-line text-indent). Nudging the inline text-indent forces a
        // reflow in BOTH directions and puts the caret back where the glyphs
        // actually are.
        requestAnimationFrame(() => {
          const cs = window.getComputedStyle(node);
          const base = parseFloat(cs.textIndent || '0') || 0;
          node.style.textIndent = `${base + 0.01}px`;
          void node.offsetHeight;
          node.style.textIndent = '';
        });
        return single;
      });

    };
    const raf = requestAnimationFrame(measure);
    // Selecting/removing a Skill changes the first-line indent, which can wrap
    // (or unwrap) the text without the value changing. MUI's TextareaAutosize
    // only recomputes on value change or window resize, so nudge it explicitly
    // and re-measure afterwards — otherwise the box keeps its stale height.
    const nudge = requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      requestAnimationFrame(measure);
    });
    // A ResizeObserver here can feed back into MUI TextareaAutosize while the
    // textarea is shrinking and leave its old multiline height behind. Value
    // changes already re-run this effect; window resizes are the only external
    // layout change that needs an explicit measurement.
    const handleResize = () => requestAnimationFrame(measure);
    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(nudge);
      window.removeEventListener('resize', handleResize);
    };
  }, [actionInput, presetsChipWidth, selectedPreset, hidePresets]);







  // Pick ONE random autocomplete suggestion on mount and keep it stable, so
  // the placeholder does not rotate every render. If the caller supplied an
  // explicit placeholder, use that verbatim (no typewriter).
  const shouldTypewrite = placeholder === undefined;
  const [fullPlaceholder, setFullPlaceholder] = useState<string>(
    () => placeholder ?? getRandomAgentPromptPlaceholder(),
  );
  // Once the textarea has mounted, measure the actual available width for a
  // one-line placeholder (accounting for the Templates chip's text-indent) and
  // pick a suggestion that fully fits — no arbitrary character cutoff.
  const pickedPlaceholderRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!shouldTypewrite) return;
    const el = inputRef.current as HTMLTextAreaElement | HTMLInputElement | null;
    if (!el) return;
    const cs = window.getComputedStyle(el);
    const font = cs.font && cs.font.trim().length > 0
      ? cs.font
      : `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`;
    const contentWidth = el.clientWidth
      - parseFloat(cs.paddingLeft || '0')
      - parseFloat(cs.paddingRight || '0')
      - parseFloat(cs.textIndent || '0');
    const available = Math.max(0, contentWidth - 4);
    // Keep the already-picked placeholder as long as it still fits. Browser
    // zoom / resizes re-run this effect, and re-picking would restart the
    // typewriter animation on every zoom step.
    const already = pickedPlaceholderRef.current;
    if (already) {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.font = font;
          if (ctx.measureText(already).width <= available) return;
        } else {
          return;
        }
      } catch { return; }
    }
    const picked = getRandomAgentPromptPlaceholderForWidth(available, font);
    pickedPlaceholderRef.current = picked;
    setFullPlaceholder(picked);

    // Re-run when the chip width changes (affects text-indent, and therefore
    // the available room for the placeholder on line 1).
  }, [shouldTypewrite, presetsChipWidth, hidePresets]);

  // Typewriter placeholder. The animation writes straight to the DOM node
  // instead of going through React state: a setState every 22ms re-rendered
  // this entire (very large) component ~45 times per second on mount, which
  // is what made the page feel blocked while it loaded.
  const [typedPlaceholder, setTypedPlaceholder] = useState(
    shouldTypewrite ? '' : fullPlaceholder,
  );
  useEffect(() => {
    if (!shouldTypewrite) {
      setTypedPlaceholder(fullPlaceholder);
      return;
    }
    const el = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!el) {
      setTypedPlaceholder(fullPlaceholder);
      return;
    }
    setTypedPlaceholder('');
    el.placeholder = '';
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      el.placeholder = fullPlaceholder.slice(0, i);
      if (i >= fullPlaceholder.length) {
        window.clearInterval(id);
        // Sync React state once at the end so re-renders keep the full text.
        setTypedPlaceholder(fullPlaceholder);
      }
    }, 22);
    return () => window.clearInterval(id);
  }, [fullPlaceholder, shouldTypewrite]);


  const activePromptPrefix = savedPromptPrefix;
  // Send prompt input — passes through propComposeSubmitInput if provided (e.g. for docs context injection)
  const composeSubmitInput = useCallback(
    (raw: string) => {
      if (typeof propComposeSubmitInput === 'function') {
        return propComposeSubmitInput(raw);
      }
      return raw;
    },
    [propComposeSubmitInput],
  );


  // ── Prompt autocomplete ─────────────────────────────────────────
  // Google-style suggestion list under the starter input. Only shows when
  // the user has typed something AND there are substring matches in the
  // curated AGENT_PROMPT_SUGGESTIONS list.
  const promptAnchorRef = React.useRef<HTMLDivElement | null>(null);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const promptSuggestions = useMemo(
    () => matchAgentPromptSuggestions(actionInput, 8),
    [actionInput],
  );
  // Reset the highlighted item / dismiss flag whenever the input changes
  // (typing should always reopen the list if matches exist). Programmatic
  // changes from accepting a suggestion must NOT reopen the list.
  const programmaticInputRef = useRef(false);
  useEffect(() => {
    if (programmaticInputRef.current) {
      programmaticInputRef.current = false;
      return;
    }
    setSuggestionIndex(-1);
    setSuggestionsDismissed(false);
  }, [actionInput]);

  const suggestionsOpen = promptSuggestions.length > 0 && !suggestionsDismissed;
  /** Category requirements pending a concrete app pick, shown in the Tools bar. */
  const [pendingCategories, setPendingCategories] = useState<SuggestionAppRequirement[]>([]);
  const acceptSuggestion = useCallback((s: string) => {
    programmaticInputRef.current = true;
    setActionInput(s);
    if (contextStorageKey) {
      setPageContextChoice(contextStorageKey, { draftPrompt: s });
    }
    setSuggestionsDismissed(true);
    setSuggestionIndex(-1);
    // A text template from the prompt list acts as its own skill, so clear
    // any explicitly selected skill. The user is free to pick a skill again.
    setSelectedPreset(null);
    try { localStorage.removeItem(LAST_PRESET_STORAGE_KEY); } catch { /* ignore */ }
    // Replace the current selection with exactly the apps this suggestion
    // needs. Category requirements are surfaced as dashed chips.
    try {
      const reqs = getSuggestionAppRequirements(s);
      const concrete = reqs.filter((r) => r.kind === 'app');
      setChosenApps(concrete.map((r) => ({ name: r.value })));
      const categories = reqs.filter((r) => r.kind !== 'app');
      setPendingCategories(categories);
    } catch { /* ignore */ }
    // Refocus the textarea so the user can keep editing / press ⌘+Enter.
    requestAnimationFrame(() => {
      try { inputRef.current?.focus(); } catch { /* ignore */ }
    });
  }, []);


  const BUILTIN_DEFAULT_APPS: AgentUIApp[] = [
    { name: 'http' },
    { name: 'shuffle_tools' },
  ];
  const [chosenApps, setChosenApps] = useState<AgentUIApp[]>(() => {
    if (apps) return apps;
    if (defaultApps !== undefined) return defaultApps.slice(0, MAX_AUTO_ASSIGNED_TOOLS);
    const saved = readPresetAppsOverride(NO_PRESET_KEY);
    if (saved) return saved;
    return BUILTIN_DEFAULT_APPS;
  });
  const isInitialMountChosenAppsRef = useRef(true);
  const isInitialMountPresetOverrideRef = useRef(true);

  // Apps the caller has authenticated — used to resolve icons by name and as
  // suggestions in the picker. NOT auto-selected as `chosenApps`.
  const [availableApps, setAvailableApps] = useState<AgentUIApp[]>([]);
  const [authAppsLoading, setAuthAppsLoading] = useState(autoLoadApps && hasApiKey);
  // Detected LLM provider derived from the saved OpenAI auth's `url` field.
  // Populated by `loadAuthenticatedApps` so the "Choose LLM" chip can show
  // the matching vendor logo and label.
  const [detectedLLM, setDetectedLLM] = useState<{ label: string; url: string; logo: string } | null>(null);
  const [configuredLLMOptions, setConfiguredLLMOptions] = useState<Array<{ label: string; id?: string }>>([]);
  const [llmMenuAnchor, setLlmMenuAnchor] = useState<null | HTMLElement>(null);
  // Apps actually allowed for the current execution, derived from the agent's
  // `allowed_actions` field (format: "app:<id>:<name>"). Falls back to
  // `chosenApps` when the field is missing (legacy runs).
  const [executionApps, setExecutionApps] = useState<AgentUIApp[]>([]);
  // Icons resolved on-demand for tools referenced in the timeline that are
  // NOT in chosenApps/executionApps. Resolution order:
  //   1) /api/v1/apps cache — match by id, then by lowercase+underscore name
  //   2) Algolia — match by objectID, then by name
  const [resolvedToolApps, setResolvedToolApps] = useState<Record<string, AgentUIApp>>({});
  const [appSearchOpen, setAppSearchOpen] = useState(false);
  /** Pre-filled query for the Tools app search (e.g. "git" from a suggestion chip). */
  const [appSearchQuery, setAppSearchQuery] = useState('');
  /** Category chip the app search was opened for, so the pick can replace it. */
  const [categoryTarget, setCategoryTarget] = useState<string | null>(null);
  const [authDrawerApp, setAuthDrawerApp] = useState<{ name: string; id?: string | null } | null>(null);
  const [agentRequestLoading, setAgentRequestLoading] = useState(false);
  // Optimistic UI: track which decision the user just clicked Rerun on so we
  // can immediately hide later decisions and show a spinner on that row while
  // the backend catches up. Cleared when the poll returns fresh decisions or
  // after a safety timeout.
  const [rerunningDecisionId, setRerunningDecisionId] = useState<string | null>(null);
  const rerunDecisionsSigRef = useRef<string>('');
  // Optimistic UI for the top-level "Rerun agent" button.
  const [rerunAgentPending, setRerunAgentPending] = useState(false);
  const [abortLoading, setAbortLoading] = useState(false);

  const [execution, setExecution] = useState<ExecutionData | null>(() => {
    if (initialExecution) return initialExecution as ExecutionData;
    if (contextStorageKey) {
      const saved = getPageContextChoice(contextStorageKey);
      if (saved?.executionId) {
        return {
          execution_id: saved.executionId,
          authorization: saved.authorization || undefined,
          status: saved.executionStatus || 'EXECUTING',
        } as ExecutionData;
      }
    }
    return null;
  });
  const [agentData, setAgentData] = useState<{ decisions?: AgentDecision[]; original_input?: string; status?: string; started_at?: number; completed_at?: number; [k: string]: any }>({});
  const [agentActionResult, setAgentActionResult] = useState<any>(null);
  // Images attached to the run's `llm_requests` (deep-walked, deduped).
  const llmImageAttachments = useMemo(
    () => collectLlmImageAttachments(agentData),
    [agentData],
  );
  const [showStarter, setShowStarter] = useState(() => {
    if (initialExecution?.execution_id) return false;
    if (contextStorageKey) {
      const saved = getPageContextChoice(contextStorageKey);
      if (saved?.executionId && saved.viewMode !== 'start') {
        return false;
      }
    }
    return true;
  });

  const handleRemovePreset = useCallback(() => {
    try { localStorage.removeItem(LAST_PRESET_STORAGE_KEY); } catch { /* ignore */ }
    setSelectedPreset(null);
  }, []);

  const handleSelectPresetInternal = useCallback((preset: AgentPreset) => {
    try { localStorage.setItem(LAST_PRESET_STORAGE_KEY, preset.id); } catch { /* ignore */ }
    const resolved = resolvePresetApps(preset);
    const override = readPresetAppsOverride(preset.id);
    if (override && override.length > 0) {
      const merged = [...override];
      for (const app of resolved) {
        const key = (app.id || app.name).toLowerCase();
        if (!merged.some((m) => (m.id || m.name).toLowerCase() === key)) {
          merged.push(app);
        }
      }
      setChosenApps(merged);
    } else {
      setChosenApps(resolved);
    }
    seededPresetIdRef.current = preset.id;

    if (onSelectPreset) {
      onSelectPreset(preset);
      return;
    }
    setSelectedPreset(preset);

    setTimeout(() => {
      const el = inputRef.current as HTMLTextAreaElement | HTMLInputElement | null;
      try { el?.focus(); } catch { /* ignore */ }
    }, 0);
  }, [onSelectPreset]);

  const [scheduleAnchor, setScheduleAnchor] = useState<HTMLElement | null>(null);
  // Mobile-only "+" menu that groups Skills / Schedule / Attach into one control.
  const [mobilePlusAnchor, setMobilePlusAnchor] = useState<HTMLElement | null>(null);
  const [scheduleCron, setScheduleCron] = useState('0 * * * *');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleSteps, setScheduleSteps] = useState<Array<{ id: 'name' | 'workflow' | 'schedule'; state: 'pending' | 'active' | 'done' | 'error'; detail?: string }>>([
    { id: 'name', state: 'pending' },
    { id: 'workflow', state: 'pending' },
    { id: 'schedule', state: 'pending' },
  ]);
  // Structured recurrence controls (Google-Calendar style). These compile
  // down to a 5-field cron expression in `scheduleCron`. The advanced cron
  // text field at the bottom of the popover lets power users override.
  type SchedFreq = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  const [schedFreq, setSchedFreq] = useState<SchedFreq>('hours');
  const [schedInterval, setSchedInterval] = useState<number>(1);
  const [schedHour, setSchedHour] = useState<number>(9);
  const [schedMinute, setSchedMinute] = useState<number>(0);
  // Cron day-of-week: 0=Sun .. 6=Sat
  const [schedWeekdays, setSchedWeekdays] = useState<Set<number>>(() => new Set([1]));
  const [schedDayOfMonth, setSchedDayOfMonth] = useState<number>(1);
  const [schedAdvancedOpen, setSchedAdvancedOpen] = useState<boolean>(false);
  // When the user clicks a preset chip or types a custom cron, we mark the
  // structured controls "dirty" so the auto-compile effect doesn't clobber
  // it on the same render.
  const cronManualOverrideRef = useRef<boolean>(false);
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(new Set());
  // Briefly pulses a row + its output box after the diagnosis banner's
  // "Where this was found" jump. Cleared on a timer.
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  // Briefly pulses the continuation form after the diagnosis banner's
  // "continue in the area below" CTA. Cleared on a timer.
  const [continueHighlighted, setContinueHighlighted] = useState(false);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, { index: number; value: string }>>({});
  const [simpleSubmitAttempted, setSimpleSubmitAttempted] = useState(false);
  const [finishAnswerRaw, setFinishAnswerRaw] = useState(false);
  const [continuationText, setContinuationText] = useState('');
  /**
   * True once the run is terminal AND a final answer has landed. Polling stops
   * immediately at that point instead of running out the continuation grace
   * window.
   */
  const [runComplete, setRunComplete] = useState(false);
  /**
   * Optimistic continuation state. When the user submits "Continue this agent
   * run" we immediately pretend the agent is working again (a Processing row,
   * no "Run finished" summary) until the backend produces a new decision.
   */
  const [optimisticContinue, setOptimisticContinue] = useState<{ at: number; decisions: number; text?: string } | null>(null);
  /** Continuation input — focused automatically once the run finishes. */
  const continuationInputRef = useRef<HTMLTextAreaElement | null>(null);
  const continuationFocusedForRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Non-blocking warning shown when polling fails while we already have data.
  // Cleared as soon as a poll succeeds again.
  const [pollWarning, setPollWarning] = useState<string | null>(null);
  // True once at least one successful execution payload has been rendered, so
  // later transient poll failures do not replace good data with an error.
  const hasExecutionDataRef = useRef(false);
  /** Execution id the last successful payload belonged to. */
  const loadedExecutionIdRef = useRef<string | null>(null);
  /**
   * Epoch ms until which we keep polling even after the run reports a terminal
   * status. Continuations (and reruns) keep producing decisions in the
   * background while the parent execution already says FINISHED, so stopping
   * the poll on the first terminal status freezes the timeline.
   */
  const keepPollingUntilRef = useRef<number>(0);
  /**
   * Whether the execution sidebar can actually load this run. We probe the
   * exact same endpoint the explorer uses, so the "View full execution"
   * button is disabled instead of opening a drawer that only says
   * "Execution not found or is no longer available."
   */
  const [runExplorerAvailable, setRunExplorerAvailable] = useState<'checking' | 'yes' | 'no'>('checking');
  const [searchParams, setSearchParams] = useSearchParams();
  const initialViewParam = searchParams.get('agentView');

  const readStoredViewMode = (): 'simple' | 'detailed' => {
    if (initialViewParam === 'detailed') return 'detailed';
    if (contextStorageKey) {
      const saved = getPageContextChoice(contextStorageKey);
      if (saved?.viewMode === 'detailed' || saved?.viewMode === 'simple') {
        return saved.viewMode;
      }
    }
    if (typeof window === 'undefined') return 'simple';
    try {
      const stored = window.localStorage.getItem('shuffle-agents-view-mode');
      if (stored === 'detailed' || stored === 'simple') return stored;
    } catch { /* localStorage unavailable — ignore */ }
    return 'simple';
  };

  const [viewMode, setViewMode] = useState<'simple' | 'detailed'>(readStoredViewMode);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('shuffle-agents-view-mode', viewMode);
      }
    } catch { /* localStorage unavailable — ignore */ }
  }, [viewMode]);

  const [attachedImages, setAttachedImages] = useState<{ dataUrl: string; name: string }[]>([]);
  const [previewImage, setPreviewImage] = useState<{ dataUrl: string; name: string } | null>(null);
  // Attachments always force the multiline layout so the attachment chips can
  // live on the bottom bar next to the Skills chip.
  // On mobile/sidebar, having a skill selected expands the text-field by default
  // so the prompt area has comfortable space and the skill chip sits cleanly
  // next to the '+' button on the bottom row.
  const promptMultiline = promptMultilineBase || attachedImages.length > 0 || (isPhone && Boolean(selectedPreset));
  const promptSingleLineLocked = !promptMultiline;

  const [nowTick, setNowTick] = useState(() => Math.floor(Date.now() / 1000));
  // Local fallback start timestamp captured the moment we first see an
  // execution_id, so the "Agent is working… Xs" counter starts ticking
  // immediately — even before the backend echoes `started_at` back to us.
  const [localRunStart, setLocalRunStart] = useState<number | null>(null);
  const chipBarRef = useRef<HTMLDivElement | null>(null);
  const chipBarResizeObserverRef = useRef<ResizeObserver | null>(null);
  const [chipBarMultiline, setChipBarMultiline] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chipBarCallbackRef = useCallback((node: HTMLDivElement | null) => {
    chipBarRef.current = node;
    chipBarResizeObserverRef.current?.disconnect();
    if (!node) return;

    const measure = () => {
      // Single line height with p: 0.5 and 28px chips is 36px.
      // If clientHeight or scrollHeight exceeds 42px, it has wrapped to 2+ lines.
      const isMulti = node.clientHeight > 42 || node.scrollHeight > 42;
      setChipBarMultiline(isMulti);
    };

    measure();
    if (typeof ResizeObserver !== 'undefined') {
      try {
        const ro = new ResizeObserver(() => {
          measure();
        });
        ro.observe(node);
        chipBarResizeObserverRef.current = ro;
      } catch {
        chipBarResizeObserverRef.current = null;
      }
    }
  }, []);
  // Tracks the execution_id we currently want to display. Used to discard
  // stale poll responses from a previous run after the user has started a
  // new one (otherwise an in-flight fetch can repaint the old execution).
  const activeExecutionIdRef = useRef<string | null>(
    executionId ||
    initialExecution?.execution_id ||
    (contextStorageKey ? getPageContextChoice(contextStorageKey)?.executionId || null : null),
  );
  // Separates poll generations even when a failed rerun restores the same
  // execution ID. An older response must never become valid again merely
  // because its ID was restored.
  const executionPollGenerationRef = useRef(0);
  // AbortController for the in-flight POST /api/v1/agent request, plus a
  // generation counter so a slow request that resolves AFTER the user clicks
  // "Cancel and go to Start" cannot repaint the UI or swap tabs back.
  const runAbortRef = useRef<AbortController | null>(null);
  const runGenerationRef = useRef(0);
  // Sticky flag set when the user manually clicks the "Start" tab while a run
  // is loaded. Prevents downstream effects (URL sync, initialExecution attach,
  // etc.) from flipping back to Simple/Detailed when a poll response lands.
  // Cleared the moment the user actually submits a new run.
  const userPickedStartRef = useRef(false);
  // Mirror of state used inside async callbacks (e.g. submitInput) so we can
  // snapshot prior values for rollback without making the callback re-render
  // on every state change.
  const stateRef = useRef({
    execution: null as ExecutionData | null,
    agentData: {} as any,
    agentActionResult: null as any,
    openIndexes: new Set<number>(),
    questionAnswers: {} as Record<string, { index: number; value: string }>,
    continuationText: '',
    localRunStart: null as number | null,
    showStarter: true,
  });

  // Mirror state into stateRef on every render so async callbacks can read the
  // current values without taking them as dependencies.
  stateRef.current.execution = execution;
  stateRef.current.agentData = agentData;
  stateRef.current.agentActionResult = agentActionResult;
  stateRef.current.openIndexes = openIndexes;
  stateRef.current.questionAnswers = questionAnswers;
  stateRef.current.continuationText = continuationText;
  stateRef.current.localRunStart = localRunStart;
  stateRef.current.showStarter = showStarter;

  // Ensure multiline status stays reactive when apps/presets change
  useEffect(() => {
    const el = chipBarRef.current;
    if (el) {
      setChipBarMultiline(el.clientHeight > 42 || el.scrollHeight > 42);
    }
  }, [chosenApps, availableApps, selectedPreset]);

  useEffect(() => {
    return () => {
      chipBarResizeObserverRef.current?.disconnect();
    };
  }, []);

  // Reset / capture the local run start. Seed as soon as the user submits
  // (so the counter ticks from t=0 even before /agent returns), and keep it
  // pinned until the run is cleared. Without this, the "0s/1s" counter
  // freezes because the backend's `started_at` keeps catching up to `now`
  // on every poll.
  useEffect(() => {
    if (execution?.execution_id || agentRequestLoading) {
      setLocalRunStart((prev) => prev ?? Math.floor(Date.now() / 1000));
    } else {
      setLocalRunStart(null);
    }
  }, [execution?.execution_id, agentRequestLoading]);

  // Tick every second while anything run-related is in flight. Deps are
  // intentionally minimal so the interval is NOT torn down and recreated on
  // every poll response — that was making the "Xs" counter look frozen at 1s.
  // Only ticks when a run actually exists: on the idle start page there is
  // nothing to count, and a permanent 1s setState re-rendered this whole
  // (very large) component every second, which made /agents feel laggy.
  useEffect(() => {
    if (!execution?.execution_id && !agentRequestLoading) return;
    const status = (execution?.status || agentData?.status || '').toUpperCase();
    const TERMINAL = ['FINISHED', 'FAILURE', 'ABORTED', 'CANCELLED', 'CANCELED'];
    if (TERMINAL.includes(status)) return;
    const id = setInterval(() => setNowTick(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [execution?.execution_id, execution?.status, agentData?.status, agentRequestLoading]);



  const readImageAsDataUrl = (file: File): Promise<{ dataUrl: string; name: string } | null> =>
    new Promise((resolve) => {
      if (!file.type.startsWith('image/')) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        resolve(typeof result === 'string' ? { dataUrl: result, name: file.name || 'Pasted image' } : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });

  const handleImagesSelected = async (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files);
    const nonImages = arr.some((f) => !f.type.startsWith('image/'));
    if (nonImages) setError('Only image files can be attached.');
    // Cap at three images total.
    const remainingSlots = Math.max(0, 3 - attachedImages.length);
    const limited = arr.slice(0, remainingSlots);
    if (remainingSlots === 0) {
      setError('You can attach a maximum of 3 images.');
      return;
    }
    if (limited.length < arr.length) {
      setError('Only the first 3 images can be attached.');
    }
    const results = await Promise.all(limited.map(readImageAsDataUrl));
    const valid = results.filter((r): r is { dataUrl: string; name: string } => r !== null);
    if (valid.length > 0) {
      setAttachedImages((prev) => [...prev, ...valid].slice(0, 3));
      setError(null);
    }
  };


  const appsById = useMemo(() => {
    const m: Record<string, AgentUIApp> = {};
    const add = (a: AgentUIApp) => {
      if (!a?.name) return;
      const slug = a.name.toLowerCase().replace(/[\s-]+/g, '_');
      if (!m[slug] || (!m[slug].icon && a.icon)) m[slug] = a;
      if (a.id) {
        if (!m[a.id] || (!m[a.id].icon && a.icon)) m[a.id] = a;
      }
    };
    for (const a of chosenApps) add(a);
    for (const a of executionApps) add(a);
    for (const [k, v] of Object.entries(resolvedToolApps)) {
      if (!m[k] || (!m[k].icon && v.icon)) m[k] = v;
      add(v);
    }
    return m;
  }, [chosenApps, executionApps, resolvedToolApps]);

  // Predicate used by the auth banners — an app is considered authenticated
  // when it appears in the caller's `availableApps` list (which is populated
  // from /api/v1/apps/authentication and only includes valid entries).
  const isAppAuthenticated = useCallback((appName: string, appId?: string | null) => {
    if (!appName && !appId) return false;
    const target = normalizeAgentAppName(appName);
    // Shuffle's own built-in apps don't require auth inside the Agent area
    // (they piggyback on the user's existing Shuffle session). They DO need
    // auth elsewhere — this short-circuit is scoped to AgentUI only.
    if (isNoAuthApp(target)) return true;
    return availableApps.some((a) => {
      if (appId && a.id && String(a.id) === String(appId)) return true;
      return !!appName && normalizeAgentAppName(a.name || '') === target;
    });
  }, [availableApps]);

  // Unique apps that require authentication and are not yet authenticated.
  // Combines:
  // 1) Any decisions waiting for or reporting missing auth
  // 2) Any app selected in executionApps or chosenApps that requires auth and is not authenticated
  const pendingAuthApps = useMemo(() => {
    if (authAppsLoading) return [];
    const seen = new Set<string>();
    const out: { appName: string; appId: string | null; icon: string }[] = [];

    // 1) From decisions
    const decisions: any[] = (agentData?.decisions as any[]) || [];
    for (const d of decisions) {
      const req = extractAuthRequest(d);
      if (!req) continue;
      const slug = normalizeAgentAppName(req.appName);
      if (seen.has(slug)) continue;
      if (isAppAuthenticated(req.appName, req.appId)) continue;
      seen.add(slug);
      const appId = req.appId || appsById[req.appName]?.id || appsById[slug]?.id || null;
      const icon = appsById[req.appName]?.icon || appsById[slug]?.icon || (appId ? appsById[appId]?.icon : '') || '';
      out.push({ appName: req.appName, appId, icon });
    }

    // 2) Check active execution apps and chosen apps
    const hasAllowed = Array.isArray((agentData as any)?.allowed_actions)
      && ((agentData as any).allowed_actions as unknown[]).length > 0;
    const activeAppList = hasAllowed ? executionApps : chosenApps;

    for (const app of activeAppList) {
      if (!app?.name) continue;
      const slug = normalizeAgentAppName(app.name);
      if (seen.has(slug)) continue;
      if (appRequiresAuthentication(slug) && !isAppAuthenticated(app.name, (app as any).id || null)) {
        seen.add(slug);
        const appId = (app as any).id || appsById[app.name]?.id || appsById[slug]?.id || null;
        const icon = app.icon || appsById[app.name]?.icon || appsById[slug]?.icon || (appId ? appsById[appId]?.icon : '') || '';
        out.push({ appName: app.name, appId, icon });
      }
    }

    return out;
  }, [agentData, executionApps, chosenApps, appsById, authAppsLoading, isAppAuthenticated]);

  // Sync controlled `apps` prop into local state.
  useEffect(() => {
    if (apps) setChosenApps(apps);
  }, [apps]);

  // Required tools of the active skill are always selected — a stored override
  // (or a manual removal attempt) can never drop them.
  useEffect(() => {
    const required = selectedPreset?.requiredApps;
    if (!required || required.length === 0) return;
    setChosenApps((prev) => {
      const missing = required.filter((name) => !prev.some((a) => isRequiredPresetApp(selectedPreset, a.name || '') && normalizeAgentAppName(a.name || '') === normalizeAgentAppName(name)));
      if (missing.length === 0) return prev;
      return [...prev, ...missing.map((name) => ({ name }))];
    });
  }, [selectedPreset]);

  // Resolve icons for tools referenced in the timeline that aren't already
  // covered by chosenApps/executionApps. Lookup order:
  //   1) /api/v1/apps cache — by id, then by lowercase+underscore name
  //   2) Algolia — by objectID, then by name
  useEffect(() => {
    const decisions = (agentData as any)?.decisions || [];
    if (!Array.isArray(decisions) || decisions.length === 0) return;

    const norm = (s: string) => s.toLowerCase().replace(/[\s-]+/g, '_');
    // Collect unique tool tokens (raw + slug variant) that we haven't resolved.
    const wanted: { raw: string; slug: string }[] = [];
    const seen = new Set<string>();
    const consider = (raw: string) => {
      if (!raw || typeof raw !== 'string') return;
      let slug = norm(raw);
      if (slug.startsWith('app:')) slug = slug.split(':')[2] || slug;
      if (appsById[raw]?.icon || appsById[slug]?.icon) return;
      if (resolvedToolApps[raw]?.icon || resolvedToolApps[slug]?.icon) return;
      const key = `${raw}|${slug}`;
      if (seen.has(key)) return;
      seen.add(key);
      wanted.push({ raw, slug });
    };
    for (const dec of decisions) {
      const action = dec?.action || dec?.details?.action;
      const category = dec?.category || dec?.details?.category;
      // Tool tokens — skip terminal/ask steps.
      if (action !== 'finish' && action !== 'finalise' && !isAskDecision(dec, category) &&
          category !== 'finish' && category !== 'finalise') {
        const tool = dec?.details?.tool ?? dec?.tool;
        if (tool && tool !== 'singul' && tool !== 'core') consider(tool);
      }
      // App auth requests — banner needs the icon too.
      const req = extractAuthRequest(dec);
      if (req?.appName) consider(req.appName);
    }
    if (wanted.length === 0) return;

    let cancelled = false;
    (async () => {
      // Single general-purpose resolver — checks authenticated apps,
      // /api/v1/apps and Algolia in order so we get an icon even when the
      // app isn't activated yet.
      const tokens = Array.from(new Set(wanted.flatMap((w) => [w.raw, w.slug])));
      const resolved = await resolveApps(tokens);
      if (cancelled) return;

      const found: Record<string, AgentUIApp> = {};
      for (const { raw, slug } of wanted) {
        const r = resolved[raw] || resolved[slug];
        if (!r) continue;
        const app: AgentUIApp = { id: r.id, name: r.name || slug, icon: r.image || '' };
        found[raw] = app;
        found[slug] = app;
      }

      if (Object.keys(found).length === 0) return;
      setResolvedToolApps((prev) => ({ ...prev, ...found }));
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify((agentData as any)?.decisions?.map((d: any) => [d?.details?.tool || d?.tool, extractAuthRequest(d)?.appName]) || []), appsById]);

  // Sideload missing app icons via Algolia (same source as the picker), so
  // built-in/default chips like "http" and "shuffle_tools" show their logo
  // even when the caller didn't pass one in.
  useEffect(() => {
    const missing = chosenApps.filter((a) => !a.icon && a.name);
    if (missing.length === 0) return;
    let cancelled = false;
    const norm = (n: string) => n.toLowerCase().replace(/[\s_\-]+/g, '_');

    (async () => {
      // Pass 1 — try Algolia (public, works without an API key).
      const resolved: Record<string, string> = {};
      try {
        const { algoliasearch } = await import('algoliasearch');
        const client = algoliasearch('JNSS5CFDZZ', '33e4e3564f4f060e96e0531957bed552');
        await Promise.all(missing.map(async (a) => {
          const known = availableApps.find((x) => norm(x.name) === norm(a.name));
          if (known?.icon) { resolved[a.name] = known.icon; return; }
          try {
            const res = await client.searchSingleIndex({
              indexName: 'appsearch',
              searchParams: { query: a.name.replace(/_/g, ' '), hitsPerPage: 3 },
            });
            const match = (res.hits as any[]).find((h) => norm(h.name || '') === norm(a.name))
              || (res.hits as any[])[0];
            if (match?.image_url) resolved[a.name] = match.image_url;
          } catch { /* fall through to /api/v1/apps */ }
        }));
      } catch { /* fall through to /api/v1/apps */ }

      // Pass 2 — for anything Algolia didn't resolve, fall back to /api/v1/apps
      // so built-in chips (http, shuffle_tools) still get their logo even when
      // Algolia is blocked or offline.
      const stillMissing = missing.filter((a) => !resolved[a.name]);
      if (stillMissing.length > 0) {
        try {
          const baseUrl = apiBaseUrl ? apiBaseUrl.replace(/\/+$/, '') : API_CONFIG.baseUrl;
          const apps = await fetchApps({
            baseUrl,
            apiKey: apiKey || API_CONFIG.apiKey,
            orgId: orgId || null,
          });
          if (Array.isArray(apps)) {
            for (const a of stillMissing) {
              const m = apps.find((x: any) => norm(x.name || '') === norm(a.name));
              const img = m?.large_image || m?.image_url || m?.image;
              if (img) resolved[a.name] = img;
            }
          }
        } catch { /* chips will just show initials */ }
      }

      if (cancelled) return;
      setChosenApps((prev) => prev.map((a) => {
        if (a.icon) return a;
        const icon = resolved[a.name];
        return icon ? { ...a, icon } : a;
      }));
    })();
    return () => { cancelled = true; };
  }, [chosenApps, availableApps, resolveUrl, resolveHeaders]);

  // Auto-load the caller's authenticated apps whenever an API token is
  // configured. Also fetches workflows to discover and connect tenant
  // incident sources/destinations (e.g. Elastic Security, Jira) or vulnerability
  // scanners (e.g. Qualys).
  const loadAuthenticatedApps = useCallback(async (signal?: { cancelled: boolean }) => {
    setAuthAppsLoading(true);
    try {
      const [authRes, wfRes] = await Promise.allSettled([
        fetch(resolveUrl('/api/v1/apps/authentication'), {
          credentials: 'include',
          headers: { ...resolveHeaders() },
        }),
        fetch(resolveUrl('/api/v1/workflows'), {
          credentials: 'include',
          headers: { ...resolveHeaders() },
        }),
      ]);

      const resp = authRes.status === 'fulfilled' ? authRes.value : null;
      if (!resp || !resp.ok) {
        if (!signal?.cancelled) setAvailableApps([]);
        return;
      }
      const result = await resp.json();
      const list = Array.isArray(result) ? result : (result?.data || []);
      const seen = new Set<string>();
      const loaded: AgentUIApp[] = [];
      for (const entry of list) {
        const app = entry?.app || entry;
        const name: string | undefined = app?.name;
        if (!name) continue;
        const valid = entry?.active || entry?.validation?.valid || entry?.hasValidAuth || app?.is_valid || app?.tested;
        if (valid === false) continue;
        const key = normalizeAgentAppName(name);
        if (seen.has(key)) continue;
        seen.add(key);
        loaded.push({
          name,
          id: app?.id || entry?.id,
          icon: app?.large_image || app?.image_url || app?.image || entry?.bestImage || '',
        });
      }
      if (signal?.cancelled) return;
      setAvailableApps(loaded);

      // Extract workflows for connected ingestion sources and forward destinations
      const wfResp = wfRes.status === 'fulfilled' ? wfRes.value : null;
      const wfResult = wfResp && wfResp.ok ? await wfResp.json() : [];

      // Determine category (explicit prop or inferred from default/chosen apps)
      const effectiveCategory = contextCategory || (
        (defaultApps || chosenApps).some((a) => normalizeAgentAppName(a.name || '').includes('incident'))
          ? 'incidents'
          : (defaultApps || chosenApps).some((a) => normalizeAgentAppName(a.name || '').includes('vulnerabilit'))
            ? 'vulnerabilities'
            : undefined
      );

      let connectedTools: ConnectedToolApp[] = [];
      if (effectiveCategory) {
        connectedTools = resolveConnectedTools(effectiveCategory, list, wfResult, MAX_AUTO_ASSIGNED_TOOLS);
        if (connectedTools.length > 0) {
          setCachedConnectedTools(effectiveCategory, connectedTools);
        }
      }

      setChosenApps((prev) => {
        let changed = false;

        // Check if user has explicit saved customization for this page
        const savedChoice = contextStorageKey ? getPageContextChoice(contextStorageKey) : null;
        let baseList = prev;

        // If user hasn't explicitly customized apps on this page, merge connected tools (max 4 tools)
        if (!savedChoice?.apps && connectedTools.length > 0) {
          const merged = mergeConnectedTools(prev, connectedTools, MAX_AUTO_ASSIGNED_TOOLS);
          if (merged.length !== prev.length || merged.some((m, idx) => prev[idx]?.name !== m.name)) {
            baseList = merged;
            changed = true;
          }
        }

        const updated = baseList.map((app) => {
          if (app.icon && app.id) return app;
          const slug = normalizeAgentAppName(app.name || '');
          const match = loaded.find((a) => normalizeAgentAppName(a.name || '') === slug);
          if (!match) return app;
          if ((!app.icon && match.icon) || (!app.id && match.id)) {
            changed = true;
            return {
              ...app,
              id: app.id || match.id,
              icon: app.icon || match.icon,
            };
          }
          return app;
        });

        if (changed && onAppsChange) {
          onAppsChange(updated);
        }
        return changed ? updated : prev;
      });

      // Shared resolver — the exact same logic the LocalLLM sidebar uses, so
      // the chip and the sidebar can never disagree. Runs on the RAW list
      // (validation state must not hide an active provider).
      setDetectedLLM(resolveActiveLLMProvider(list));

      const llmEntries = list.filter(isOpenAICompatibleAuthEntry);
      const configuredMap = new Map<string, string>();
      for (const entry of llmEntries) {
        const label = providerLabelOfAuthEntry(entry);
        if (label && label !== SHUFFLE_AI_PRESET && entry?.id) {
          configuredMap.set(label, entry.id);
        }
      }
      const opts: Array<{ label: string; id?: string }> = [
        { label: SHUFFLE_AI_PRESET },
      ];
      for (const [label, id] of configuredMap.entries()) {
        opts.push({ label, id });
      }
      setConfiguredLLMOptions(opts);
    } catch {
      // silent — caller can still pick apps manually
    } finally {
      if (!signal?.cancelled) setAuthAppsLoading(false);
    }
  }, [resolveUrl, resolveHeaders, contextCategory, contextStorageKey, defaultApps, onAppsChange]);

  useEffect(() => {
    if (!autoLoadApps) return;
    if (!hasApiKey) return;
    const signal = { cancelled: false };
    loadAuthenticatedApps(signal);
    return () => { signal.cancelled = true; };
  }, [autoLoadApps, hasApiKey, loadAuthenticatedApps]);

  // Re-fetch authenticated apps whenever auth state changes anywhere
  // (e.g. the user just saved/validated credentials via the auth drawer or
  // any other AppAuthCard on the page). Keeps the "X requires authentication"
  // banner reactive without a page reload.
  useEffect(() => {
    if (!hasApiKey) return;
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent?.detail?.activeProvider) {
        const label = customEvent.detail.activeProvider;
        const url = customEvent.detail.url || '';
        const logo = customEvent.detail.logo || getProviderLogoUrl(label, url);
        setDetectedLLM({ label, url, logo });
      }
      loadAuthenticatedApps();
    };
    window.addEventListener('integrations-changed', handler);
    return () => window.removeEventListener('integrations-changed', handler);
  }, [hasApiKey, loadAuthenticatedApps]);


  // Derive the apps actually allowed for the current execution from the
  // agent's `allowed_actions` field. Format: "app:<id>:<name>". Resolves
  // icons via `availableApps` (in-memory) first, then falls back to the
  // global `/api/v1/apps` cache by id (preferred) or name.
  useEffect(() => {
    const raw = (agentData as any)?.allowed_actions;
    if (!Array.isArray(raw) || raw.length === 0) {
      setExecutionApps([]);
      return;
    }
    const parsed: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    for (const entry of raw) {
      if (typeof entry !== 'string') continue;
      const parts = entry.split(':');
      if (parts.length < 3 || parts[0] !== 'app') continue;
      let id = parts[1] || '';
      // Format is `app:<id>:<name>`; some backends append the action name as a
      // 4th segment (`app:<id>:<name>:<action>`) — only take the app name.
      let name = parts[2] || '';
      // Name-keyed form: `app:name:<something>:<real_name>` — there is no app
      // id at all, so use the LAST segment as the app name and resolve it via
      // the apps cache / Algolia by name.
      if (id.toLowerCase() === 'name') {
        id = '';
        name = parts[parts.length - 1] || name;
      }


      if (!name && !id) continue;
      const key = `${id}|${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parsed.push({ id, name });
    }
    if (parsed.length === 0) {
      setExecutionApps([]);
      return;
    }

    // First pass: resolve from availableApps without any network call.
    const resolveFromAvailable = (id: string, name: string): AgentUIApp => {
      const byId = id ? availableApps.find((a) => a.id === id) : undefined;
      const byName = !byId && name
        ? availableApps.find((a) => (a.name || '').toLowerCase() === name.toLowerCase())
        : undefined;
      const hit = byId || byName;
      return { id: id || hit?.id, name: hit?.name || name, icon: hit?.icon };
    };
    const initial = parsed.map(({ id, name }) => resolveFromAvailable(id, name));
    setExecutionApps(initial);

    // Second pass: fill missing icons from the global apps cache (covers
    // apps that the user has not authenticated yet). Lookup order:
    //   1) /api/v1/apps — by id, then by lowercase+underscore name
    //   2) Algolia      — by objectID, then by name
    if (initial.every((a) => !!a.icon)) return;
    let cancelled = false;
    const norm = (s: string) => (s || '').toLowerCase().replace(/[\s-]+/g, '_');
    (async () => {
      let next = initial;
      // Pass A — /api/v1/apps cache.
      try {
        const all = await fetchApps({
          baseUrl: API_CONFIG.baseUrl,
          apiKey: apiKey || API_CONFIG.apiKey,
          orgId: orgId || null,
        });
        if (!cancelled && Array.isArray(all) && all.length > 0) {
          const byIdMap = new Map<string, any>();
          const byNameMap = new Map<string, any>();
          for (const a of all) {
            if (a?.id) byIdMap.set(String(a.id), a);
            if (a?.name) byNameMap.set(norm(String(a.name)), a);
          }
          next = next.map((a) => {
            if (a.icon) return a;
            const hit = (a.id && byIdMap.get(a.id)) || byNameMap.get(norm(a.name || ''));
            if (!hit) return a;
            return {
              id: a.id || hit.id,
              name: hit.name || a.name,
              icon: hit.large_image || hit.image_url || hit.image || a.icon,
            } as AgentUIApp;
          });
        }
      } catch { /* fall through to Algolia */ }

      // Pass B — Algolia (objectID, then name) for anything still missing.
      const stillMissing = next.filter((a) => !a.icon);
      if (stillMissing.length > 0) {
        try {
          const { algoliasearch } = await import('algoliasearch');
          const client = algoliasearch('JNSS5CFDZZ', '33e4e3564f4f060e96e0531957bed552');
          const resolved: Record<string, { name: string; icon: string; id: string }> = {};
          await Promise.all(stillMissing.map(async (a) => {
            try {
              if (a.id) {
                try {
                  const obj = await (client as any).getObject({ indexName: 'appsearch', objectID: a.id });
                  if (obj?.image_url) {
                    resolved[a.id || a.name] = { name: obj.name || a.name, icon: obj.image_url, id: obj.objectID || a.id };
                    return;
                  }
                } catch { /* not an objectID — fall through */ }
              }
              const res = await client.searchSingleIndex({
                indexName: 'appsearch',
                searchParams: { query: (a.name || '').replace(/_/g, ' '), hitsPerPage: 3 },
              });
              const hits = (res.hits as any[]) || [];
              const match = hits.find((h) => norm(h.name || '') === norm(a.name || '')) || hits[0];
              if (match?.image_url) {
                resolved[a.id || a.name] = { name: match.name || a.name, icon: match.image_url, id: match.objectID || a.id || '' };
              }
            } catch { /* skip */ }
          }));
          if (Object.keys(resolved).length > 0) {
            next = next.map((a) => {
              if (a.icon) return a;
              const r = resolved[a.id || a.name];
              return r ? { id: r.id || a.id, name: r.name || a.name, icon: r.icon } : a;
            });
          }
        } catch { /* algolia unavailable */ }
      }

      if (!cancelled) setExecutionApps(next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify((agentData as any)?.allowed_actions || []), availableApps]);

  // ── Fetch execution result (poll-friendly) ──
  const getExecution = useCallback(async (executionId: string, authorization?: string) => {
    const pollGeneration = executionPollGenerationRef.current;
    if (loadedExecutionIdRef.current !== executionId) hasExecutionDataRef.current = false;
    if (!executionId || executionId.startsWith('demo-') || executionId.startsWith('dummy-')) return;
    // Sideloaded runs (from the activity listing) often have no explicit
    // authorization token. The streams API accepts the execution id itself
    // when the session is authenticated, so fall back to that.
    const auth = authorization || executionId;
    try {
      const resp = await fetch(resolveUrl('/api/v1/streams/results'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...resolveHeaders() },
        body: JSON.stringify({ execution_id: executionId, authorization: auth }),
      });
      // Discard stale responses: if the user has since started a different
      // run (or cleared this one), do not write old data back into state.
      // Discard stale responses: only accept when the ref still matches the
      // execution we fetched. (Submitting a new run briefly clears the ref;
      // any in-flight poll from the previous run must be dropped, not written
      // back into state — otherwise the UI snaps to the old execution.)
      if (
        activeExecutionIdRef.current !== executionId ||
        executionPollGenerationRef.current !== pollGeneration
      ) return;
      if (!resp.ok) {
        // Error responses still carry a JSON body with a `reason` — surface it
        // instead of a bare status code.
        let reason = '';
        try {
          const body = await resp.clone().json();
          reason = typeof body?.reason === 'string' ? body.reason : '';
        } catch {
          try {
            const text = (await resp.clone().text())?.trim();
            if (text && text.length < 300 && !text.startsWith('<')) reason = text;
          } catch { /* ignore */ }
        }
        // A single failed poll must not hide a timeline we already rendered.
        if (!hasExecutionDataRef.current) {
          setError(reason ? `${reason} (${resp.status})` : `Could not fetch execution (${resp.status}).`);
        } else {
          setPollWarning(reason ? `${reason} (${resp.status}) Showing the last known state.` : `Live updates are failing (${resp.status}). Showing the last known state.`);
        }
        return;
      }
      const json = await resp.json();
      if (
        activeExecutionIdRef.current !== executionId ||
        executionPollGenerationRef.current !== pollGeneration
      ) return;
      if (json?.success === false) {
        if (!hasExecutionDataRef.current) setError(json.reason || 'Failed to load agent data.');
        else setPollWarning(json.reason || 'Live updates are failing. Showing the last known state.');
        return;
      }

      // Find AI Agent result for the timeline
      let actionResult: any = null;
      if (Array.isArray(json?.results)) {
        actionResult =
          json.results.find((r: any) => r?.action?.app_name === 'AI Agent') || json.results[0];
      } else {
        actionResult = json;
      }
      const v = validateJson(actionResult?.result);

      // A degraded/partial poll response must never wipe a timeline we have
      // already rendered. When we previously had data but this payload carries
      // none, keep the last good state and just clear the error.
      const payloadHasResults = Array.isArray(json?.results) ? json.results.length > 0 : Boolean(json);
      if (hasExecutionDataRef.current && !payloadHasResults) {
        setExecution((prev) => (prev ? { ...prev, ...json, results: (prev as any).results, execution_id: executionId, authorization: auth } : { ...json, execution_id: executionId, authorization: auth }));
        setError(null);
        setPollWarning(null);
        return;
      }

      setExecution({ ...json, execution_id: executionId, authorization: auth });
      if (contextStorageKey) {
        setPageContextChoice(contextStorageKey, {
          executionId,
          authorization: auth || undefined,
          executionStatus: json.status,
        });
      }
      if (actionResult) setAgentActionResult(actionResult);
      if (v.valid) {
        setAgentData({ ...v.result, started_at: json.started_at, completed_at: json.completed_at, status: json.status });
      } else if (hasExecutionDataRef.current) {
        // Keep the previously parsed agent payload, only refresh run metadata.
        setAgentData((prev) => (prev && Object.keys(prev).length > 0
          ? { ...prev, started_at: json.started_at ?? (prev as any).started_at, completed_at: json.completed_at ?? (prev as any).completed_at, status: json.status ?? (prev as any).status }
          : prev));
      }
      hasExecutionDataRef.current = true;
      loadedExecutionIdRef.current = executionId;
      setError(null);
      setPollWarning(null);
    } catch (err) {
      if (
        activeExecutionIdRef.current !== executionId ||
        executionPollGenerationRef.current !== pollGeneration
      ) return;
      // Transient network blips ("Failed to fetch") happen while polling a
      // long-running execution. Only surface them when nothing loaded yet.
      if (!hasExecutionDataRef.current) setError(err instanceof Error ? err.message : 'Network error.');
      else setPollWarning(`Live updates are failing (${err instanceof Error ? err.message : 'network error'}). Showing the last known state.`);
    }
  }, []);

  // ── Probe whether the execution sidebar can load this run ──
  // Uses the explorer's own fetch so the answer matches exactly what the
  // drawer would render. Re-probes when the execution (or its token) changes.
  useEffect(() => {
    const eid = execution?.execution_id;
    const auth = execution?.authorization;
    if (!eid) { setRunExplorerAvailable('checking'); return; }
    if (!auth) { setRunExplorerAvailable('no'); return; }
    let cancelled = false;
    setRunExplorerAvailable('checking');
    (async () => {
      let found = await fetchExecutionSnapshot(eid, auth);
      if (!found && !cancelled) {
        // Transient failures (rate limits, cold reads) are common while a run
        // is live — retry once before declaring the run unavailable.
        await new Promise((r) => setTimeout(r, 1500));
        if (cancelled) return;
        found = await fetchExecutionSnapshot(eid, auth);
      }
      if (cancelled) return;
      // If we are successfully rendering this run's data ourselves, the run
      // clearly exists — never mark it unavailable.
      setRunExplorerAvailable(found || hasExecutionDataRef.current ? 'yes' : 'no');
    })();
    return () => { cancelled = true; };
  }, [execution?.execution_id, execution?.authorization]);

  // Any successfully rendered poll proves the execution exists.
  useEffect(() => {
    if (execution?.authorization && (execution?.results?.length || 0) > 0) {
      setRunExplorerAvailable('yes');
    }
  }, [execution?.authorization, execution?.results?.length]);



  // Attach to an explicit execution (props) or one passed via URL params.
  // Props take precedence over URL params.
  useEffect(() => {
    let eid: string | null = null;
    let auth: string | null = null;
    let initialStatus: string = 'EXECUTING';
    let savedViewMode: 'start' | 'simple' | 'detailed' | null = null;

    if (executionId) {
      eid = executionId;
      auth = authorization || null;
    } else if (readUrlParams) {
      const params = new URLSearchParams(window.location.search);
      eid = params.get('execution_id');
      auth = params.get('authorization');
      if (!eid && typeof window !== 'undefined') {
        const pathMatch = window.location.pathname.match(/\/agents\/([a-zA-Z0-9_.-]+)/);
        if (pathMatch && pathMatch[1] && pathMatch[1] !== 'index') {
          eid = pathMatch[1];
        }
      }
    } else if (contextStorageKey) {
      const saved = getPageContextChoice(contextStorageKey);
      if (saved?.executionId) {
        eid = saved.executionId;
        auth = saved.authorization || null;
        if (saved.executionStatus) initialStatus = saved.executionStatus;
        if (saved.viewMode) savedViewMode = saved.viewMode;
      }
    }
    if (eid) {
      if (savedViewMode === 'start') {
        setShowStarter(true);
        userPickedStartRef.current = true;
      } else {
        if (!userPickedStartRef.current) setShowStarter(false);
        if (savedViewMode === 'simple' || savedViewMode === 'detailed') {
          setViewMode(savedViewMode);
        }
      }
      activeExecutionIdRef.current = eid;
      setExecution({ execution_id: eid, authorization: auth || undefined, status: initialStatus });
      getExecution(eid, auth || undefined);
    }
  }, [readUrlParams, executionId, authorization, getExecution, contextStorageKey]);

  // Attach to a pre-loaded execution (e.g. embedded inside a list/drawer
  // that already has the run data). Skips the starter and seeds Simple/
  // Detailed views directly — no `/streams/results` fetch, no
  // `authorization` token required.
  useEffect(() => {
    if (!initialExecution || !initialExecution.execution_id) return;
    if (!userPickedStartRef.current) setShowStarter(false);
    activeExecutionIdRef.current = initialExecution.execution_id;
    setExecution(initialExecution as ExecutionData);
    let actionResult: any = null;
    if (Array.isArray(initialExecution.results)) {
      actionResult =
        initialExecution.results.find((r: any) => r?.action?.app_name === 'AI Agent') ||
        initialExecution.results[0];
    } else {
      actionResult = initialExecution;
    }
    setAgentActionResult(actionResult);
    const v = validateJson(actionResult?.result);
    if (v.valid) {
      setAgentData({
        ...v.result,
        started_at: initialExecution.started_at,
        completed_at: initialExecution.completed_at,
        status: initialExecution.status,
      });
    }
    setError(null);

    // Sideloaded executions from the listing endpoint sometimes ship a
    // placeholder result body like `{ success: false, reason: "Result too
    // large to handle ...", extra: "replace" }` instead of the real agent
    // output. Detect that and re-fetch the full payload directly from
    // /api/v1/streams/results so the timeline renders properly.
    const needsReplace = (() => {
      // Raw string placeholders ("too large", "replace") also occur.
      const raw = actionResult?.result;
      if (typeof raw === 'string' && (/too\s*(large|big)/i.test(raw) || /"extra"\s*:\s*"replace"/i.test(raw))) return true;
      const r = v.valid ? v.result : null;
      if (!r || typeof r !== 'object') return false;
      if (typeof r.reason === 'string' && /too\s*(large|big)/i.test(r.reason)) return true;
      if (r.extra === 'replace') return true;
      // No decisions at all on a finished run is also a truncated payload.
      return false;
    })();
    if (needsReplace && initialExecution.execution_id) {
      getExecution(initialExecution.execution_id, initialExecution.authorization);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialExecution?.execution_id]);

  // Poll while running. Continue indefinitely until we see a terminal status
  // (FINISHED / FAILURE / ABORTED). We never give up on our own — long
  // executions just keep streaming results back.
  //
  // A terminal status is NOT always the end: continuations and reruns keep
  // adding decisions in the background while the parent execution already
  // reports FINISHED. So we keep polling (slower) while any decision is still
  // unfinished, and for a grace window after the user submits something.
  useEffect(() => {
    if (!execution?.execution_id) return;
    const status = (execution.status || '').toUpperCase();
    const TERMINAL = ['FINISHED', 'FAILURE', 'ABORTED', 'CANCELLED', 'CANCELED'];
    const isTerminal = TERMINAL.includes(status);
    const hasPendingDecision = ((agentData?.decisions as any[]) || []).some((d) => {
      const s = String(d?.run_details?.status || '').toUpperCase();
      return s === '' || s === 'RUNNING' || s === 'EXECUTING' || s === 'WAITING';
    });
    // The run looks done and a final answer is on screen. Do NOT stop polling
    // completely: the backend can flip the same execution back to RUNNING
    // (continuations, reruns, background steps). Keep a slow heartbeat so the
    // UI never claims FINISHED while the backend says otherwise.
    const settled = isTerminal && !hasPendingDecision && runComplete;
    if (settled) keepPollingUntilRef.current = 0;
    const intervalMs = settled ? 15000 : isTerminal ? 5000 : 3000;
    const id = setInterval(() => {
      getExecution(execution.execution_id!, execution.authorization);
    }, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execution?.execution_id, execution?.authorization, execution?.status, agentData?.decisions, runComplete, getExecution]);


  // ── Submit input ──
  const submitInput = useCallback(async (
    text: string,
    presetOverride?: AgentPreset | null,
    appsOverride?: AgentUIApp[],
  ) => {
    if (!text.trim()) return;
    if (isLoggedIn === false) {
      setError('Authentication required. Please log in to run AI agents.');
      return;
    }
    if (contextStorageKey) {
      setPageContextChoice(contextStorageKey, { draftPrompt: '' });
    }
    const composed = composeSubmitInput(text);
    // `undefined` means "use current selection"; `null` explicitly clears it.
    const effectivePreset = presetOverride !== undefined ? presetOverride : selectedPreset;
    setError(null);
    setAgentRequestLoading(true);

    // Mint a generation id for THIS submit. If the user aborts before the
    // request resolves, abortAgent() will bump runGenerationRef so the stale
    // resolution below short-circuits instead of swapping tabs back.
    const myGeneration = ++runGenerationRef.current;
    // Cancel any previous in-flight controller, then install a fresh one so
    // abortAgent() can actually kill the underlying fetch.
    try { runAbortRef.current?.abort(); } catch { /* noop */ }
    const controller = new AbortController();
    runAbortRef.current = controller;

    // Snapshot prior run state so a failed network request does not leave
    // the user staring at an empty page with no way to retry. We only
    // commit the destructive reset once the new run has been accepted.
    const prevExecution = stateRef.current.execution;
    const prevAgentData = stateRef.current.agentData;
    const prevAgentActionResult = stateRef.current.agentActionResult;
    const prevOpenIndexes = stateRef.current.openIndexes;
    const prevQuestionAnswers = stateRef.current.questionAnswers;
    const prevContinuationText = stateRef.current.continuationText;
    const prevLocalRunStart = stateRef.current.localRunStart;
    const prevActiveExecutionId = activeExecutionIdRef.current;
    const prevShowStarter = stateRef.current.showStarter;
    const prevViewMode = viewMode;

    // Hard reset NOW — kill the previous run's poll loop, blank the
    // execution/timeline state, drop the previous execution_id +
    // agentView from the URL, and reset the view to simple. Otherwise
    // the previous run's poll keeps writing into state during the
    // in-flight request and the user sees the old "Detailed" tab flash
    // back in.
    executionPollGenerationRef.current += 1;
    activeExecutionIdRef.current = null;
    setExecution(null);
    setAgentData({ original_input: composed.trim() });
    setAgentActionResult(null);
    setExecutionApps([]);
    setResolvedToolApps({});
    setHighlightedIndex(null);
    setOpenIndexes(new Set());
    setQuestionAnswers({});
    setContinuationText('');
    setSimpleSubmitAttempted(false);
    
    setError(null);
    setLocalRunStart(null);
    // When starting a new run, respect the user's stored Simple/Detailed
    // preference rather than forcing Simple every time.
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('shuffle-agents-view-mode') : null;
      setViewMode(stored === 'detailed' ? 'detailed' : 'simple');
    } catch {
      setViewMode('simple');
    }
    setShowStarter(false);
    // The user is starting a new run — drop any sticky "manual Start" pin so
    // future polls/effects can populate Simple/Detailed normally.
    userPickedStartRef.current = false;
    if (readUrlParams) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('execution_id');
        next.delete('authorization');
        next.delete('agentView');
        return next;
      }, { replace: true });
    }


    const result = await runAgent({
      input: composed.trim(),
      skipPolling: true,
      signal: controller.signal,
      ...(apiKey ? { apiKey } : {}),
      ...(apiBaseUrl ? { apiBaseUrl } : {}),
      ...(orgId ? { orgId } : {}),
      ...(resolvedIncidentId ? { incidentId: resolvedIncidentId } : {}),
      ...(resolvedIncidentContext ? { incidentContext: resolvedIncidentContext } : {}),
      ...(resolvedVulnerabilityId ? { vulnerabilityId: resolvedVulnerabilityId } : {}),
      ...(resolvedWorkflowId ? { workflowId: resolvedWorkflowId } : {}),
      // Send a single comma-separated `tool_name` in the format
      // `app:<objectID>:<slug>,app:<objectID>:<slug>` so the backend resolves
      // the exact app versions instead of guessing by slug. When the current
      // run already has resolved `allowed_actions` apps and the picker is
      // still on the untouched built-in fallback, use those instead of
      // sending `http,shuffle_tools`.
      ...((() => {
        const effectiveApps = appsOverride ?? (
          executionApps.length > 0 && isBuiltinDefaultApps(chosenApps)
            ? executionApps
            : chosenApps
        );
        return effectiveApps.length > 0 ? { toolName: buildToolName(effectiveApps) } : {};
      })()),

      // Pass the selected preset so the backend can apply its prompt/tools.
      ...(effectivePreset ? { presetId: effectivePreset.id } : {}),
      ...(attachedImages.length > 0 ? { images: attachedImages.map((img) => {
        const m = /^data:([^;]+);base64,(.*)$/.exec(img.dataUrl);
        return m ? { mimeType: m[1], data: m[2], name: img.name } : { mimeType: 'image/png', data: img.dataUrl, name: img.name };
      }) } : {}),
    });

    // If the user aborted while we were waiting, drop this result on the floor.
    // Do NOT touch UI state — abortAgent() already reset us to the Start tab.
    if (myGeneration !== runGenerationRef.current || controller.signal.aborted) {
      // Best-effort: if the backend still managed to spawn an execution
      // before our fetch was aborted, ask it to abort that execution too.
      const raw: any = (result as any)?.rawData;
      const eid = raw?.execution_id;
      const auth = raw?.authorization;
      const wfId = raw?.workflow?.id;
      if (eid && wfId) {
        try {
          fetch(
            resolveUrl(`/api/v1/workflows/${wfId}/executions/${eid}/abort`),
            {
              method: 'GET',
              credentials: 'include',
              headers: { ...resolveHeaders(), ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
            },
          ).catch(() => { /* noop */ });
        } catch { /* noop */ }
      }
      return;
    }

    setAgentRequestLoading(false);

    if (!result.success) {
      if (contextStorageKey) {
        setPageContextChoice(contextStorageKey, { draftPrompt: text });
      }
      // Restore the previous run so the user can try Rerun again.
      setError(result.error || 'Agent run failed.');
      activeExecutionIdRef.current = prevActiveExecutionId;
      setExecution(prevExecution);
      setAgentData(prevAgentData);
      setAgentActionResult(prevAgentActionResult);
      setOpenIndexes(prevOpenIndexes);
      setQuestionAnswers(prevQuestionAnswers);
      setContinuationText(prevContinuationText);
      setLocalRunStart(prevLocalRunStart);
      setShowStarter(prevShowStarter);
      setViewMode(prevViewMode);
      if (prevActiveExecutionId) {
        getExecution(prevActiveExecutionId, prevExecution?.authorization);
      }
      onRun?.({ input: text, success: false, error: result.error });
      return;
    }

    // Success — start the live timer for the new run. The destructive
    // reset already happened up-front, so all we need to do here is
    // seed the timer reference for elapsed-time rendering.
    const browserStart = Math.floor(Date.now() / 1000);
    setNowTick(browserStart);
    setLocalRunStart(browserStart);

    const raw = result.rawData as any;
    const eid = raw?.execution_id;
    const auth = raw?.authorization;
    if (eid && auth) {
      // Seed an EXECUTING stub so the poll effect starts immediately,
      // then kick off the first fetch. The poller continues until terminal.
      activeExecutionIdRef.current = eid;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('shuffle:agent_execution_status', {
            detail: { executionId: eid, status: 'running', incidentId: resolvedIncidentId },
          }),
        );
      }
      if (contextStorageKey) {
        setPageContextChoice(contextStorageKey, {
          draftPrompt: '',
          executionId: eid,
          authorization: auth,
          executionStatus: 'EXECUTING',
          viewMode: viewMode === 'detailed' ? 'detailed' : 'simple',
        });
      }
      setExecution({ execution_id: eid, authorization: auth, status: 'EXECUTING' });
      // Reflect the new execution in the URL so the run is shareable/refreshable.
      if (readUrlParams) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set('execution_id', eid);
          next.set('authorization', auth);
          return next;
        }, { replace: true });
      }
      getExecution(eid, auth);
      onRun?.({ input: text, success: true, executionId: eid, authorization: auth });
    } else {
      if (contextStorageKey && eid) {
        setPageContextChoice(contextStorageKey, {
          draftPrompt: '',
          executionId: eid,
          authorization: auth || undefined,
          executionStatus: 'FINISHED',
          viewMode: viewMode === 'detailed' ? 'detailed' : 'simple',
        });
      }
      // Direct response (no async execution): synthesize a single-step view
      setExecution({
        execution_id: eid || safeRandomUUID(),
        authorization: auth,
        status: 'FINISHED',
        results: [{ action: { app_name: 'AI Agent' }, result: raw }],
      });
      const v = validateJson(raw);
      if (v.valid) {
        setAgentData({ ...v.result, status: 'FINISHED', original_input: text });
      } else {
        setAgentData({ original_input: text, status: 'FINISHED', message: result.content });
      }
      onRun?.({ input: text, success: true, executionId: eid, authorization: auth });
    }
    // `selectedPreset` MUST be a dependency: without it the callback keeps a
    // stale skill (e.g. "Build Workflows") and keeps posting to
    // /api/v1/agent/workflow-edit after the skill was unselected.
  }, [chosenApps, executionApps, getExecution, onRun, attachedImages, readUrlParams, setSearchParams, viewMode, selectedPreset, isLoggedIn]);

  // Auto-submit on mount or when defaultInput updates with autoSubmit.
  const lastSubmittedInputRef = useRef<string | null>(null);
  useEffect(() => {
    if (autoSubmit && defaultInput && defaultInput !== lastSubmittedInputRef.current) {
      lastSubmittedInputRef.current = defaultInput;
      submitInput(defaultInput);
    }
  }, [autoSubmit, defaultInput, submitInput]);

  // ── Submit answers / continuation ──
  const submitQuestions = useCallback(async (
    decisionId: string,
    answers: Record<string, any>,
    isContinuation?: boolean,
  ) => {
    if (!execution?.execution_id || !execution?.authorization) return;

    let newArgument: Record<string, string> = {};
    if (isContinuation) {
      newArgument = { ...answers };
    } else {
      for (const k in answers) {
        if (k === 'approve') {
          newArgument[k] = answers[k];
          break;
        }
        const a = answers[k];
        newArgument[`question_${a.index}`] = a.value;
      }
    }

    setAgentRequestLoading(true);
    // The parent execution may already be FINISHED — keep polling so the new
    // decisions produced by this continuation stream into the timeline.
    setRunComplete(false);
    // Optimistically flip the UI back into "working" mode straight away.
    setOptimisticContinue({
      at: Date.now(),
      decisions: (agentData?.decisions || []).length,
      text: isContinuation && typeof answers?.continue === 'string' ? String(answers.continue).trim() : undefined,
    });
    keepPollingUntilRef.current = Date.now() + 10 * 60 * 1000;
    const wfId = execution.workflow?.id || execution.execution_id;
    const params = new URLSearchParams({
      reference_execution: execution.execution_id,
      authorization: execution.authorization,
      answer: 'true',
      note: JSON.stringify(newArgument),
      agentic: 'true',
      decision_id: decisionId,
    });
    // The backend needs the Agentic action ID to find the start node, or it
    // fails with "No Agentic Start node found … during workflow continuation".
    const nodeId = await resolveAgentNodeId(execution.execution_id, execution.authorization);
    params.set('node_id', nodeId || 'null');
    try {
      const resp = await fetch(resolveUrl(`/api/v1/workflows/${wfId}/run?${params.toString()}`), {
        method: 'GET',
        credentials: 'include',
        headers: { ...resolveHeaders() },
      });
      const json = await resp.json();
      if (json.success === false) {
        setOptimisticContinue(null);
        toast({ title: 'Failed to submit', description: json.reason || 'Try again later.', variant: 'destructive' });
      } else {
        // No success toast — the UI updates inline.
        setQuestionAnswers({});
        setContinuationText('');
        setTimeout(() => {
          getExecution(execution.execution_id!, execution.authorization!);
        }, 600);
      }
    } catch (err) {
      setOptimisticContinue(null);
      toast({ title: 'Network error', description: String(err), variant: 'destructive' });
    } finally {
      setAgentRequestLoading(false);
    }
  }, [execution, getExecution, agentData?.decisions]);

  // ── Rerun the whole agent with the original input ──
  // Instead of silently re-submitting (which leaves the user staring at the
  // same screen wondering if anything happened), bounce them back to the
  // Start tab with the prompt + tools pre-filled so they can review and
  // hit Start themselves.
  // Resolve the prompt for the currently-loaded run from every place the
  // backend may stash it. New runs set `agentData.original_input` directly,
  // but runs loaded by execution_id rarely have that — fall back to the AI
  // Agent action's `input` parameter and the execution_argument.
  const resolveRunInput = useCallback((): string => {
    const fromData = agentData?.original_input;
    if (fromData && typeof fromData === 'string') return fromData;
    if (actionInput && typeof actionInput === 'string' && actionInput.trim()) return actionInput;
    const params: any[] = (agentActionResult as any)?.action?.parameters || [];
    const inputParam = params.find((p) => p?.name === 'input');
    if (inputParam?.value && typeof inputParam.value === 'string') return inputParam.value;
    const msgs = (agentData as any)?.input?.messages || [];
    const userMsg = msgs.find((mm: any) => mm?.role === 'user');
    if (userMsg?.content && typeof userMsg.content === 'string') return userMsg.content;
    const execArg = (execution as any)?.execution_argument;
    if (execArg && typeof execArg === 'string') {
      try {
        const parsed = JSON.parse(execArg);
        if (parsed?.input && typeof parsed.input === 'string') return parsed.input;
        if (parsed?.prompt && typeof parsed.prompt === 'string') return parsed.prompt;
      } catch {
        if (execArg.length < 4000) return execArg;
      }
    }
    // Last resort: deep-scan the loaded run for anything that looks like the
    // original prompt. Runs loaded straight from an execution_id often nest it
    // under input.text / params.input.text / question etc.
    const PROMPT_KEYS = new Set([
      'original_input', 'input', 'text', 'prompt', 'question', 'query', 'user_input',
      'user_prompt', 'goal', 'instruction', 'instructions', 'task', 'objective', 'message',
    ]);
    const seen = new WeakSet<object>();
    const deepFind = (node: any, depth = 0): string => {
      if (!node || depth > 8) return '';
      if (typeof node !== 'object') return '';
      if (seen.has(node)) return '';
      seen.add(node);
      if (Array.isArray(node)) {
        for (const item of node) {
          const found = deepFind(item, depth + 1);
          if (found) return found;
        }
        return '';
      }
      // Shuffle parameter shape: { name: "input", value: "..." }
      if (typeof (node as any).name === 'string' && typeof (node as any).value === 'string'
        && PROMPT_KEYS.has(String((node as any).name).toLowerCase())
        && (node as any).value.trim().length >= 2) {
        return (node as any).value;
      }
      // Chat message shape: { role: "user", content: "..." }
      if ((node as any).role === 'user' && typeof (node as any).content === 'string'
        && (node as any).content.trim().length >= 2) {
        return (node as any).content;
      }
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === 'string' && PROMPT_KEYS.has(k.toLowerCase()) && v.trim().length >= 2) return v;
      }
      for (const v of Object.values(node)) {
        if (v && typeof v === 'object') {
          const found = deepFind(v, depth + 1);
          if (found) return found;
        }
      }
      return '';
    };
    return deepFind(agentData) || deepFind(agentActionResult) || deepFind(execution) || '';
  }, [agentData, actionInput, agentActionResult, execution]);



  // The agent output carries a `template` field whenever the run was started
  // through a Skill (e.g. "computer-use", "workflow-edit"). Resolve it back to
  // one of our presets so the rerun hits the same /api/v1/agent/{name} path.
  const resolveRunTemplate = useCallback((): AgentPreset | null => {
    const candidates: unknown[] = [
      (agentData as any)?.template,
      (agentData as any)?.input?.template,
      (agentActionResult as any)?.template,
    ];
    const execArg = (execution as any)?.execution_argument;
    if (execArg && typeof execArg === 'string') {
      try { candidates.push(JSON.parse(execArg)?.template); } catch { /* not JSON */ }
    }
    const raw = candidates.find((c) => typeof c === 'string' && (c as string).trim());
    if (!raw) return null;
    const slug = String(raw).trim().toLowerCase();
    const list = presets && presets.length > 0 ? presets : AGENT_PRESETS;
    return (
      list.find(
        (p) =>
          p.id === slug ||
          PRESET_TEMPLATE_SLUGS[p.id] === slug ||
          TEMPLATE_SLUG_TO_PRESET_ID[slug] === p.id,
      ) ?? null
    );
  }, [agentData, agentActionResult, execution, presets]);

  const rerunAgent = useCallback(() => {
    const resolved = resolveRunInput();
    const input = (typeof resolved === 'string' && resolved.trim() ? resolved : actionInput) || '';
    const template = resolveRunTemplate();
    const canSubmit = input.trim().length >= 2;
    // Optimistic feedback for the button — flip immediately, cleared when
    // the new execution loads (see effect below).
    setRerunAgentPending(true);
    if (input) {
      setActionInput(extractCleanDisplayPrompt(input));
    }
    if (executionApps.length > 0) {
      setChosenApps(executionApps);
    }
    // Keep the Skill chip in sync with the run we are repeating.
    setSelectedPreset(template);
    if (canSubmit) {
      // submitInput() resets the view itself — do NOT bounce to the Start tab
      // first, otherwise the starter can win the race and the run looks like
      // it never began.
      userPickedStartRef.current = false;
      submitInput(input, template, executionApps.length > 0 ? executionApps : undefined);
    } else {
      // Nothing usable to resend — show the Start tab with the fields filled
      // so the user can adjust and run manually. In embedded mode (drawer)
      // the Start tab is disabled, so surface the reason instead of failing
      // silently and leaving the button looking dead.
      if (!disableStartTab) {
        setShowStarter(true);
      } else {
        setViewMode('simple');
        setError('Could not resolve the original prompt for this run. Type it below and start a new run.');
      }
      setRerunAgentPending(false);
      return;
    }

    // Safety timeout in case submitInput never produces a new execution.
    setTimeout(() => setRerunAgentPending(false), 8000);
  }, [resolveRunInput, resolveRunTemplate, actionInput, executionApps, disableStartTab, submitInput]);


  // Clear the top-level rerun-pending flag as soon as we're loading or a
  // new execution has taken over.
  useEffect(() => {
    if (rerunAgentPending && (agentRequestLoading || execution?.execution_id)) {
      setRerunAgentPending(false);
    }
  }, [rerunAgentPending, agentRequestLoading, execution?.execution_id]);

  // ── Abort the currently running agent execution ──
  // If the agent has not produced an execution_id yet (i.e. the initial
  // /run request is still in flight or failed silently), we simply discard
  // the in-flight UI state and bounce the user back to the Start tab so
  // they can try again. Once an execution_id exists, we ask the backend to
  // abort the workflow execution; the existing poll loop will then pick up
  // the ABORTED status on its next tick.
  const abortAgent = useCallback(async () => {
    // Optimistic: flip the button into its destructive loading state and tell
    // every mounted activity list the run is aborted BEFORE any await, so the
    // spinner and the background list update on the same frame as the click.
    flushSync(() => setAbortLoading(true));
    const execId = execution?.execution_id;
    const auth = execution?.authorization;
    const wfId = (execution as any)?.workflow?.id;
    if (execId) broadcastAgentAborted(execId);

    // Bump the run-generation counter and abort any in-flight POST /agent
    // request immediately. This guarantees a slow initial request that
    // resolves AFTER the user clicks "Cancel" cannot repaint the UI or
    // swap tabs back to the run view.
    runGenerationRef.current += 1;
    try { runAbortRef.current?.abort(); } catch { /* noop */ }
    runAbortRef.current = null;


    // Helper: wipe local run state and return to the Start tab.
    const resetToStart = () => {
      activeExecutionIdRef.current = null;
      setExecution(null);
      setAgentData({});
      setAgentRequestLoading(false);
      setShowStarter(true);
      if (contextStorageKey) {
        setPageContextChoice(contextStorageKey, {
          executionId: null,
          authorization: null,
          executionStatus: null,
          viewMode: 'start',
        });
      }
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('agentView');
        next.delete('execution_id');
        next.delete('authorization');
        return next;
      }, { replace: true });
    };

    // Agent never produced an execution — nothing to abort server-side.
    if (!execId || !wfId) {
      resetToStart();
      toast({ title: 'Run aborted', description: 'The agent had not started yet — reset to Start.' });
      setAbortLoading(false);
      return;
    }

    try {
      const resp = await fetch(
        resolveUrl(`/api/v1/workflows/${wfId}/executions/${execId}/abort`),
        {
          method: 'GET',
          credentials: 'include',
          headers: {
            ...resolveHeaders(),
            ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
          },
        },
      );
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        toast({ title: 'Abort failed', description: txt || `HTTP ${resp.status}`, variant: 'destructive' });
        setAbortLoading(false);
        return;
      }
      
      // Nudge the poll loop to refresh sooner so the UI reflects the change.
      setTimeout(() => getExecution(execId, auth!), 500);
      setTimeout(() => getExecution(execId, auth!), 2500);
    } catch (err) {
      toast({ title: 'Network error', description: String(err), variant: 'destructive' });
    } finally {
      setAbortLoading(false);
    }
  }, [execution, resolveUrl, resolveHeaders, getExecution, setSearchParams]);

  // Remember the run currently open so the activity list can highlight it
  // once the user navigates back.
  useEffect(() => {
    if (execution?.execution_id) setLastOpenedAgentRun(execution.execution_id);
  }, [execution?.execution_id]);





  // Build a popout URL to answer the agent's question in the standalone Form UI.
  // Mirrors the legacy AgentUI behavior so users can hand off to /forms/...
  const getFormUrl = useCallback((decisionId: string): string | null => {
    const wfId = (execution as any)?.workflow?.id;
    const auth = execution?.authorization;
    const execId = execution?.execution_id;
    const sourceNode = agentActionResult?.action?.id;
    if (!wfId || !auth || !execId || !sourceNode || !decisionId) return null;
    const backend = apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    const params = new URLSearchParams({
      authorization: auth,
      reference_execution: execId,
      source_node: sourceNode,
      decision_id: decisionId,
      ...(backend ? { backend_url: backend } : {}),
    });
    return `/forms/${wfId}?${params.toString()}`;
  }, [execution, agentActionResult, apiBaseUrl]);

  // ── Rerun a single decision (clears decisions after it on the backend) ──
  const rerunDecision = useCallback(async (decision: any) => {
    if (!execution?.execution_id) {
      toast({ title: 'No execution loaded', description: 'Cannot rerun this decision.', variant: 'destructive' });
      return;
    }
    if (!agentActionResult?.action) {
      toast({ title: 'Missing action context', description: 'Could not locate the agent action node.', variant: 'destructive' });
      return;
    }
    const decisionId = decision?.run_details?.id;
    if (!decisionId) {
      toast({ title: 'Missing decision id', description: 'This decision cannot be rerun.', variant: 'destructive' });
      return;
    }
    const body: any = { ...agentActionResult.action };
    body.source_execution = execution.execution_id;
    body.source_workflow = execution.workflow?.id;
    // Optimistic feedback — flip the UI *before* the network round-trip so
    // the click feels instantaneous. Poll updates will overwrite these
    // hints with real backend state.
    setRerunningDecisionId(decisionId);
    rerunDecisionsSigRef.current = JSON.stringify(
      (agentData?.decisions || []).map((d: any) => d?.run_details?.id || ''),
    );
    setAgentRequestLoading(true);
    setRunComplete(false);
    keepPollingUntilRef.current = Date.now() + 10 * 60 * 1000;
    try {
      const resp = await fetch(resolveUrl(`/api/v1/apps/agent/run?rerun=true&decision_id=${encodeURIComponent(decisionId)}`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...resolveHeaders() },
        body: JSON.stringify(body),
      });
      const json = await resp.json().catch(() => ({}));
      if (json?.success === false) {
        toast({ title: 'Rerun failed', description: json.reason || 'Try again later.', variant: 'destructive' });
        setRerunningDecisionId(null);
      } else {
        setTimeout(() => getExecution(execution.execution_id!, execution.authorization!), 800);
        setTimeout(() => getExecution(execution.execution_id!, execution.authorization!), 5000);
      }
    } catch (err) {
      toast({ title: 'Network error', description: String(err), variant: 'destructive' });
      setRerunningDecisionId(null);
    } finally {
      setAgentRequestLoading(false);
    }
  }, [execution, agentActionResult, agentData, getExecution, resolveUrl, resolveHeaders]);

  // Clear the optimistic rerun flag once the backend reflects the change
  // (decisions list signature changes) or after a safety timeout.
  useEffect(() => {
    if (!rerunningDecisionId) return;
    const sig = JSON.stringify(
      (agentData?.decisions || []).map((d: any) => d?.run_details?.id || ''),
    );
    if (sig !== rerunDecisionsSigRef.current) {
      setRerunningDecisionId(null);
      return;
    }
    const t = setTimeout(() => setRerunningDecisionId(null), 20000);
    return () => clearTimeout(t);
  }, [agentData?.decisions, rerunningDecisionId]);

  // Ticking clock so the trailing live "Processing" row keeps counting while
  // the run is still executing. Gated on an actual run existing — without a
  // run there is nothing to count and the tick would re-render this whole
  // component once per second on the idle start page.
  const runStillExecuting = Boolean(execution?.execution_id || agentRequestLoading)
    && !TERMINAL_RUN_STATUSES.includes(
      resolveRunStatus(execution?.status, agentData?.status)
    );
  const [liveNowSec, setLiveNowSec] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!runStillExecuting) return;
    setLiveNowSec(Date.now() / 1000);
    const t = setInterval(() => setLiveNowSec(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, [runStillExecuting]);


  // ── Build timeline ──

  const { timeline, originalStartTime, totalDuration, finishDecisionId, finishAnswer, finishNote } = useMemo(() => {
    // Backend may return Unix milliseconds (UnixMillis) or seconds. Normalize to seconds.
    const toSec = (t: any): number => {
      const n = Number(t) || 0;
      // Preserve sub-second precision so durations < 1s render as e.g. "0.8s"
      // instead of being floored to 0.
      return n > 1e12 ? n / 1000 : n;
    };
    const overallStatus = resolveRunStatus(execution?.status, agentData?.status);
    const runIsFinished = TERMINAL_RUN_STATUSES.includes(overallStatus);
    const runEndSec = toSec(agentData?.completed_at || execution?.completed_at);
    // When the whole run has ended, cap any unfinished decisions at the run's
    // end time (or the latest known timestamp) so they stop counting up.
    let fallbackEnd = Date.now() / 1000;
    if (runIsFinished) {
      let maxKnown = runEndSec || 0;
      for (const dec of agentData?.decisions || []) {
        const rd = dec.run_details || {};
        maxKnown = Math.max(maxKnown, toSec(rd.completed_at), toSec(rd.started_at));
      }
      fallbackEnd = maxKnown || fallbackEnd;
    }

    const items: TimelineItem[] = [
      {
        label: 'AI Agent',
        type: 'agent',
        category: 'agent',
        details: agentData,
        status: execution?.status || agentData?.status,
        start_time: toSec(agentData?.started_at || execution?.started_at),
        // While the run is still executing there is no `completed_at` yet —
        // anchor the end to "now" so the total agent bar and duration grow in
        // realtime instead of staying blank until the run finishes.
        end_time: toSec(agentData?.completed_at || execution?.completed_at)
          || (runStillExecuting ? liveNowSec : 0),
      },
    ];

    let finishId = '';
    let finishAns = '';
    let finishNote = '';
    let lastKnownEnd = toSec(agentData?.started_at || execution?.started_at);
    for (const dec of agentData?.decisions || []) {
      const rd = dec.run_details || {};
      const decStartSec = toSec(rd.started_at);
      const decEndSec = toSec(rd.completed_at);
      const decIsFinish = dec.action === 'finish' || dec.category === 'finish'
        || dec.details?.action === 'finalise' || dec.action === 'finalise';
      // Only fall back to "now"/run-end when we actually know when the
      // decision started — otherwise the bar would stretch from epoch 0
      // to now and look like a full-width row.
      // Finalise rows often come back with started_at/completed_at = 0. Anchor
      // them to the run's end time so the preceding "Processing" gap is
      // computed correctly and the duration is accurate.
      let startTime = decStartSec || 0;
      let endTime = decEndSec || (decStartSec ? fallbackEnd : 0);
      // Some rows (continuations / asks) come back with started_at = 0 but a
      // valid completed_at. Anchor them to their completion time so the
      // preceding waiting/"Processing" gap is computed and rendered.
      if (!decStartSec && decEndSec) {
        startTime = decEndSec;
        endTime = decEndSec;
      }

      if (decIsFinish && !decStartSec && !decEndSec && (runEndSec || fallbackEnd)) {
        const anchor = runEndSec || fallbackEnd;
        startTime = anchor;
        endTime = anchor;
      }
      if (endTime > 0) lastKnownEnd = Math.max(lastKnownEnd, endTime);

      items.push({
        label: dec.action,
        type: 'decision',
        category: dec.category,
        status: rd.status,
        start_time: startTime,
        end_time: endTime,
        details: dec,
      });

      if (dec.action === 'finish' || dec.category === 'finish' || dec.details?.action === 'finalise' || dec.action === 'finalise') {
        finishId = rd.id || '';
        const reasonText = (dec.reason || '').trim();
        const fieldText = (Array.isArray(dec.fields) && dec.fields.length > 0 ? (dec.fields[0]?.value || '') : '').trim();
        // Prefer whichever has more substance. Sometimes the field value is a
        // short headline like "Task Failed" while the real explanation lives
        // in `reason` — surface that to the user instead of the headline.
        if (fieldText && reasonText && reasonText.length > fieldText.length * 1.5) {
          finishAns = reasonText;
        } else {
          finishAns = fieldText || reasonText;
        }
        finishNote = reasonText;
      }
    }

    // Always send the latest finish decision's ID when continuing. If no
    // finish decision exists, the backend still needs a marker so we send
    // "MISSING_<short_id>" rather than guessing a fallback decision ID.
    if (!finishId && runIsFinished) {
      const shortId = (execution?.execution_id || '').slice(-8) || safeRandomUUID().slice(0, 8);
      finishId = `MISSING_${shortId}`;
    }



    // The agent's `output` field carries the actual answer, while the finish
    // decision's `reason` is usually just a one-line rationale ("Answer the
    // conversational query directly."). Prefer `output` as the main answer and
    // keep the finish reason as a secondary note underneath.
    {
      const stringify = (v: unknown): string => {
        if (v == null) return '';
        if (typeof v === 'string') return v.trim();
        try { return JSON.stringify(v, null, 2); } catch { return ''; }
      };
      const candidates: unknown[] = [];
      const ad: any = agentData || {};
      candidates.push(ad.output, ad.result, ad.answer);
      const decs: any[] = (ad.decisions as any[]) || [];
      for (let i = decs.length - 1; i >= 0; i--) {
        const d = decs[i] || {};
        candidates.push(d.output, d.run_details?.output, d.details?.output, d.result);
      }
      let outputText = '';
      for (const c of candidates) {
        const text = stringify(c);
        if (text) { outputText = text; break; }
      }
      if (outputText) {
        if (finishAns && finishAns !== outputText) {
          // Keep the finish text as the secondary note when it differs.
          finishNote = finishAns;
        }
        finishAns = outputText;
      }
      if (finishNote && finishNote === finishAns) finishNote = '';
    }

    // Sort: Agent row pinned to top, Finalise pinned to bottom, everything
    // else preserves insertion order (the index `i` from the decisions array).
    // Timestamps are intentionally NOT used — they're often missing or 0,
    // which would scatter rows unpredictably.
    const isFinalise = (it: TimelineItem) => {
      const det: any = it.details || {};
      const cat = (it.category || '').toLowerCase();
      const act = (det.action || '').toLowerCase();
      return cat === 'finish' || cat === 'finalise' || act === 'finish' || act === 'finalise';
    };
    const rank = (it: TimelineItem) => {
      if (it.type === 'agent') return 0;
      if (isFinalise(it)) return 2;
      return 1;
    };
    const sortItems = (arr: TimelineItem[]) => {
      const indexed = arr.map((it, i) => ({ it, i }));
      indexed.sort((a, b) => {
        const ra = rank(a.it);
        const rb = rank(b.it);
        if (ra !== rb) return ra - rb;
        return a.i - b.i;
      });
      arr.length = 0;
      arr.push(...indexed.map((x) => x.it));
    };
    sortItems(items);

    // Insert "processing" placeholder rows inline between consecutive decisions
    // when there is meaningful dead time (the agent is thinking / the LLM is
    // generating the next step). Walk the already-sorted items list and splice
    // the Thinking rows in-place so they stay between the two decisions whose
    // gap they represent. Do NOT re-sort afterwards — that would clump them.
    const withProcessing: TimelineItem[] = [];
    const agentItem = items.find((it) => it.type === 'agent');
    const runStart = agentItem?.start_time || 0;
    const runEnd = agentItem?.end_time || 0;
    let prevDecEnd = runStart;
    const pushThinking = (from: number, to: number, kind: 'processing' | 'waiting' = 'processing') => {
      if (from > 0 && to > 0 && to - from >= 1) {
        withProcessing.push({
          label: kind,
          type: 'decision',
          category: 'processing',
          status: 'FINISHED',
          start_time: from,
          end_time: to,
          details: undefined as any,
        });
      }
    };

    let lastWasFinalise = false;
    let lastWasScheduledWait = false;
    for (const it of items) {
      if (it.type === 'decision') {
        const decStart = it.start_time || 0;
        // Insert Thinking before this decision (works for first decision after
        // run start, gaps between decisions, and the gap before Finalise).
        // A gap before a continuation is not the agent processing — it is just
        // dead time while it waits, so label it "Waiting" instead.
        pushThinking(prevDecEnd, decStart, isContinuationDecision(it.details as any) ? 'waiting' : 'processing');
        withProcessing.push(it);
        prevDecEnd = it.end_time || decStart || prevDecEnd;
        lastWasFinalise = isFinalise(it);
        // A decision with a delay is scheduled to resume later — that
        // is not the agent processing, so no live timer row after it.
        lastWasScheduledWait = ['WAITING', 'RUNNING', 'EXECUTING', ''].includes((it.status || '').toUpperCase())
          && !!getScheduledResumeMs(it.details);

      } else {
        withProcessing.push(it);
      }
    }
    // Tail: if the last decision finished well before the run ended and there
    // was no Finalise, surface that trailing dead time too. Skip when the run
    // already ended in a Finalise — nothing is "processing" after the finish.
    if (runEnd > 0 && !lastWasFinalise && !runStillExecuting) pushThinking(prevDecEnd, runEnd);

    // Live tail: while the run is still executing, show a "Processing" row after
    // the last decision that counts up in realtime once at least 1s of dead time
    // has elapsed, so it is obvious how long ago the last step happened.
    if (runStillExecuting && !lastWasScheduledWait && prevDecEnd > 0 && liveNowSec - prevDecEnd >= 1) {

      withProcessing.push({
        label: '',
        type: 'decision',
        category: 'processing',
        status: 'EXECUTING',
        start_time: prevDecEnd,
        end_time: liveNowSec,
        details: undefined as any,
      });
    }


    items.length = 0;
    items.push(...withProcessing);

    const start = items.reduce((acc, it) => Math.min(acc, it.start_time || acc), Infinity);
    const end = items.reduce((acc, it) => Math.max(acc, it.end_time || acc), 0);
    const startSafe = start === Infinity ? 0 : start;
    const total = Math.max(1, end - startSafe);
    return { timeline: items, originalStartTime: startSafe, totalDuration: total, finishDecisionId: finishId, finishAnswer: finishAns, finishNote };
  }, [agentData, execution?.status, execution?.started_at, execution?.completed_at, runStillExecuting, liveNowSec]);

  // Mark the run complete once it is terminal and a final answer has landed,
  // so the poller can stop instead of running out the grace window.
  useEffect(() => {
    const status = (execution?.status || '').toUpperCase();
    const isTerminal = ['FINISHED', 'FAILURE', 'ABORTED', 'CANCELLED', 'CANCELED'].includes(status);
    const hasPendingDecision = ((agentData?.decisions as any[]) || []).some((d) => {
      const s = String(d?.run_details?.status || '').toUpperCase();
      return s === '' || s === 'RUNNING' || s === 'EXECUTING' || s === 'WAITING';
    });
    setRunComplete(Boolean(isTerminal && !hasPendingDecision && (finishAnswer || finishDecisionId)));
  }, [execution?.status, agentData?.decisions, finishAnswer, finishDecisionId]);

  // Broadcast execution status changes so assigned tasks update their state and status dots
  useEffect(() => {
    const eid = execution?.execution_id || activeExecutionIdRef.current;
    const status = (execution?.status || agentData?.status || '').toUpperCase();
    if (!eid || !status || typeof window === 'undefined') return;

    if (status === 'FINISHED' || status === 'SUCCESS') {
      window.dispatchEvent(
        new CustomEvent('shuffle:agent_execution_status', {
          detail: { executionId: eid, status: 'completed', incidentId: resolvedIncidentId },
        }),
      );
      if (resolvedIncidentId) {
        window.dispatchEvent(
          new CustomEvent('incident:refresh', {
            detail: { id: resolvedIncidentId, incidentId: resolvedIncidentId, executionId: eid },
          }),
        );
      }
    } else if (['FAILURE', 'ABORTED', 'CANCELLED', 'CANCELED'].includes(status)) {
      window.dispatchEvent(
        new CustomEvent('shuffle:agent_execution_status', {
          detail: { executionId: eid, status: 'failed', incidentId: resolvedIncidentId },
        }),
      );
    } else if (['RUNNING', 'EXECUTING', 'IN_PROGRESS', 'WAITING'].includes(status)) {
      window.dispatchEvent(
        new CustomEvent('shuffle:agent_execution_status', {
          detail: { executionId: eid, status: 'running', incidentId: resolvedIncidentId },
        }),
      );
    }
  }, [execution?.execution_id, execution?.status, agentData?.status, resolvedIncidentId]);

  // Auto-focus the continuation field when the run finishes, so it is obvious
  // the execution can be continued.
  useEffect(() => {
    if (!finishDecisionId || agentRequestLoading) return;
    if (continuationFocusedForRef.current === finishDecisionId) return;
    continuationFocusedForRef.current = finishDecisionId;
    const t = setTimeout(() => {
      const el = continuationInputRef.current;
      if (el && document.activeElement !== el) el.focus({ preventScroll: true });
    }, 150);
    return () => clearTimeout(t);
  }, [finishDecisionId, agentRequestLoading]);

  const openLocalLlmArea = useCallback(() => {
    if (onChooseLLM) {
      onChooseLLM();
      return;
    }
    if (typeof window === 'undefined') return;
    const evt = new CustomEvent('agent-drawer-open', {
      detail: { tab: 'localLLM' },
      cancelable: true,
    });
    const handled = window.dispatchEvent(evt);
    if (handled && !(window as any).__shuffleAgentDrawerMounted) {
      // eslint-disable-next-line no-console
      console.warn(
        '[AgentUI] "Local LLM" was clicked but no drawer listener handled the event. Pass `onChooseLLM` to wire your own drawer, or wrap AgentUI in `<AgentRunDrawer />`.',
      );
    }
  }, [onChooseLLM]);

  const isAiAuthIssue = useMemo(() => {
    // If the run finished cleanly, it cannot be an AI model authentication failure.
    const status = (execution?.status || agentData?.status || '').toUpperCase();
    const isFinished = status === 'FINISHED' || status === 'SUCCESS';
    if (isFinished && !isAiAuthText(error)) {
      return false;
    }

    // If the agent completed with a valid final answer that is NOT an AI auth error,
    // it did not fail AI authentication.
    if (finishAnswer && finishAnswer.trim().length > 0 && !isAiAuthText(finishAnswer)) {
      return false;
    }

    const diagnosable = execution?.results?.length ? execution : (agentData as any);
    return isAiAuthFailure(diagnosable, error || '');
  }, [execution, agentData, finishAnswer, error]);

  const aiAuthSuggestionNode = isAiAuthIssue ? (
    <Box sx={{ mt: 1.5 }}>
      <AiAuthSuggestion onOpenLocalLlm={openLocalLlmArea} />
    </Box>
  ) : null;

  // Clear the optimistic continuation as soon as the backend produces a new
  // decision (or the run visibly restarts), with a hard 5 minute safety stop.
  useEffect(() => {
    if (!optimisticContinue) return;
    const count = (agentData?.decisions || []).length;
    if (count > optimisticContinue.decisions) {
      setOptimisticContinue(null);
      return;
    }
    const t = setTimeout(() => setOptimisticContinue(null), 5 * 60 * 1000);
    return () => clearTimeout(t);
  }, [optimisticContinue, agentData?.decisions]);

  /** True while we are pretending the agent is working after a continuation. */
  const optimisticRunning = Boolean(optimisticContinue);
  const optimisticContinueText = optimisticContinue?.text || undefined;

  /**
   * True when a decision never concluded (still marked running/waiting) even
   * though the run itself has ended — typically an agent crash. Used to warn
   * the user that the run may be incomplete.
   */
  const stuckDecision = useMemo(() => {
    const list = ((agentData?.decisions as any[]) || []).filter((d) => {
      // Only a real, identifiable decision can be stuck (and rerun).
      if (!d?.run_details?.id) return false;
      const s = String(d?.run_details?.status || '').toUpperCase();
      return s === 'RUNNING' || s === 'EXECUTING' || s === 'WAITING';
    });
    return list.length ? list[list.length - 1] : null;
  }, [agentData?.decisions]);

  const hasInFlightDecision = Boolean(stuckDecision?.run_details?.id);


  /** The stuck decision can only be rerun when the backend gave it an id. */
  const stuckDecisionId = stuckDecision?.run_details?.id || null;



  const toggleOpen = (i: number) => {
    let opening = false;
    setOpenIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else { next.add(i); opening = true; }
      return next;
    });

    // When expanding, make sure the newly revealed content is visible. The row
    // body renders (and images/tables can grow) a frame or two after the state
    // change, so nudge the bottom of the row into view a couple of times.
    if (typeof window === 'undefined') return;
    const scrollRowIntoView = () => {
      if (!opening) return;
      try {
        const el = document.querySelector(`[data-timeline-index="${i}"]`);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        // Only scroll if the expanded row overflows the viewport bottom.
        if (rect.bottom > window.innerHeight - 8) {
          el.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      } catch {}
    };
    requestAnimationFrame(() => requestAnimationFrame(scrollRowIntoView));
    window.setTimeout(scrollRowIntoView, 260);
  };

  // ── Auto-follow the detailed timeline ───────────────────────────────────
  // While a run is live we keep the newest decision in view — but only as
  // long as the user has not scrolled themselves. Any manual scroll gesture
  // stops the following; scrolling back to the bottom resumes it.
  const timelineEndRef = useRef<HTMLDivElement | null>(null);
  const followTimelineRef = useRef(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const getScrollParent = (node: HTMLElement | null): HTMLElement | null => {
      let el = node?.parentElement || null;
      while (el) {
        const style = window.getComputedStyle(el);
        if (/(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) return el;
        el = el.parentElement;
      }
      return null;
    };

    const isAtBottom = () => {
      const parent = getScrollParent(timelineEndRef.current);
      if (parent) {
        return parent.scrollHeight - parent.scrollTop - parent.clientHeight < 120;
      }
      const doc = document.documentElement;
      return doc.scrollHeight - window.scrollY - window.innerHeight < 120;
    };

    // Only real user gestures flip the flag — programmatic scrollIntoView must
    // never turn following off.
    const onUserScroll = () => { followTimelineRef.current = isAtBottom(); };
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) {
        window.setTimeout(onUserScroll, 60);
      }
    };

    window.addEventListener('wheel', onUserScroll, { passive: true });
    window.addEventListener('touchmove', onUserScroll, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onUserScroll);
      window.removeEventListener('touchmove', onUserScroll);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const timelineCount = timeline.length;
  const runIsLive = optimisticRunning
    || !['FINISHED', 'FAILURE', 'ABORTED', 'CANCELLED', 'CANCELED'].includes(
      (resolveRunStatus(execution?.status, agentData?.status) || 'EXECUTING').toUpperCase(),
    );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (viewMode !== 'detailed') return;
    if (!runIsLive) return;
    if (!followTimelineRef.current) return;
    const el = timelineEndRef.current;
    if (!el) return;
    const scroll = () => {
      if (!followTimelineRef.current) return;
      timelineEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    };
    const raf = requestAnimationFrame(scroll);
    const t = window.setTimeout(scroll, 240);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, [timelineCount, viewMode, runIsLive]);

  // Reset following whenever a new run starts.
  useEffect(() => { followTimelineRef.current = true; }, [execution?.execution_id]);




  const handlePrimarySubmit = useCallback(() => {
    const composed = composeSubmitInput(actionInput);
    if (submitOverride) {
      submitOverride({ input: composed, apps: chosenApps });
    } else {
      submitInput(composed);
    }
  }, [submitOverride, actionInput, chosenApps, submitInput, composeSubmitInput]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Autocomplete navigation takes priority over the normal submit shortcut
    // — but only when the suggestion list is actually open with matches.
    if (suggestionsOpen && promptSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex((i) => (i + 1) % promptSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex((i) => (i <= 0 ? promptSuggestions.length - 1 : i - 1));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSuggestionsDismissed(true);
        setSuggestionIndex(-1);
        return;
      }
      if (e.key === 'Tab' && suggestionIndex >= 0) {
        e.preventDefault();
        acceptSuggestion(promptSuggestions[suggestionIndex]);
        return;
      }
      if (e.key === 'Enter' && suggestionIndex >= 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        acceptSuggestion(promptSuggestions[suggestionIndex]);
        return;
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handlePrimarySubmit();
    }
  };

  // restart() removed — Start tab now toggles via goToTab() while preserving the execution.


  // The three top-level "tabs": Start (the prompt form), Simple summary,
  // and Detailed timeline. They're all available once an execution exists,
  // so the user can flip back and forth without losing the run.
  type TabKey = 'start' | 'simple' | 'detailed';
  const activeTab: TabKey = showStarter ? 'start' : viewMode;
  const hasExecution = !!execution?.execution_id;
  const showRunSwitcher = hasExecution || agentRequestLoading;
  useEffect(() => {
    onViewChange?.(activeTab);
  }, [activeTab, onViewChange]);
  useEffect(() => {
    if (isInitialMountChosenAppsRef.current) {
      isInitialMountChosenAppsRef.current = false;
      return;
    }
    onAppsChange?.(chosenApps);
  }, [chosenApps, onAppsChange]);
  // Remember tool customisations per template so a template's defaults are a
  // starting point, not a forced set.
  useEffect(() => {
    if (isInitialMountPresetOverrideRef.current) {
      isInitialMountPresetOverrideRef.current = false;
      return;
    }
    const key = selectedPreset?.id ?? NO_PRESET_KEY;
    // Do not write the previous template's tools onto the newly selected one.
    if (selectedPreset && seededPresetIdRef.current !== selectedPreset.id) return;
    writePresetAppsOverride(key, chosenApps.filter((a) => !!a?.name));
  }, [chosenApps, selectedPreset]);
  const goToTab = (t: TabKey) => {
    if (t === 'start') {
      // Seed the starter form with the current run's prompt + tools so the
      // user can tweak and resubmit instead of starting from a blank slate.
      const runInput = resolveRunInput();
      let cleanPrompt = '';
      if (runInput && typeof runInput === 'string') {
        cleanPrompt = extractCleanDisplayPrompt(runInput);
        setActionInput(cleanPrompt);
      }
      if (executionApps.length > 0) {
        setChosenApps(executionApps);
      }
      setShowStarter(true);
      // Pin: user manually chose Start. Stay here even when polls land or
      // initialExecution is re-attached, until they explicitly start a new run
      // or click Simple/Detailed themselves.
      userPickedStartRef.current = true;
      if (contextStorageKey) {
        setPageContextChoice(contextStorageKey, {
          viewMode: 'start',
          ...(cleanPrompt ? { draftPrompt: cleanPrompt } : {}),
        });
      }
      if (readUrlParams) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('agentView');
          next.delete('execution_id');
          next.delete('authorization');
          return next;
        }, { replace: true });
      }
    } else {
      setShowStarter(false);
      userPickedStartRef.current = false;
      setViewMode(t);
      if (contextStorageKey) {
        setPageContextChoice(contextStorageKey, {
          viewMode: t,
        });
      }
      if (readUrlParams) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set('agentView', t);
          // Keep the execution shareable when returning to a run view from Start.
          if (execution?.execution_id && execution?.authorization) {
            next.set('execution_id', execution.execution_id);
            next.set('authorization', execution.authorization);
          }
          return next;
        }, { replace: true });
      }
    }
  };

  // Schedule discovery: one shared mechanism for Start / Simple / Detailed.
  // The only hard block is an unfinished run; everything else is advisory.
  const { scheduleDisabledReasons, scheduleWarnings } = useMemo(() => {
    const decisions: any[] = (agentData?.decisions as any[]) || [];
    const runStatus = resolveRunStatus(execution?.status, agentData?.status);
    const isNotFinished = runStatus !== '' && !['FINISHED', 'FAILURE', 'ABORTED', 'CANCELLED', 'CANCELED'].includes(runStatus);
    const NON_ACTION_CATS = new Set(['finish', 'finalise', 'ask', 'agent', 'processing']);
    const NON_ACTION_ACTIONS = new Set(['finish', 'finalise', 'ask']);
    const finishCount = decisions.filter(
      (d) => d?.action === 'finish' || d?.action === 'finalise' || d?.category === 'finish' || d?.category === 'finalise',
    ).length;
    const continuedAfterFinish = decisions.some((d) =>
      Array.isArray(d?.fields) && d.fields.some((f: any) => String(f?.key || '').toLowerCase() === 'continue' && f?.value),
    );
    const hadContinuation = finishCount > 1 || continuedAfterFinish;
    const actionCount = decisions.filter((d) => {
      const cat = String(d?.category || '').toLowerCase();
      const act = String(d?.action || '').toLowerCase();
      if (NON_ACTION_CATS.has(cat)) return false;
      if (NON_ACTION_ACTIONS.has(act)) return false;
      return true;
    }).length;
    // A decision failed if its run_details.status is FAILURE/ABORTED, or the
    // parsed raw_response reports success: false. We deliberately ignore
    // ASK/FINISH categories — those are agent-internal control steps.
    const failedDecision = decisions.some((d) => {
      const cat = String(d?.category || '').toLowerCase();
      const act = String(d?.action || '').toLowerCase();
      if (NON_ACTION_CATS.has(cat) || NON_ACTION_ACTIONS.has(act)) return false;
      const status = String(d?.run_details?.status || '').toUpperCase();
      if (status === 'FAILURE' || status === 'ABORTED') return true;
      const raw = d?.run_details?.raw_response;
      let parsed: any = null;
      if (typeof raw === 'string') {
        try { parsed = JSON.parse(raw); } catch { parsed = null; }
      } else if (raw && typeof raw === 'object') {
        parsed = raw;
      }
      if (parsed && parsed.success === false) return true;
      if (parsed && parsed.action === 'app_authentication') return true;
      return false;
    });
    // A question was answered if an ASK decision has an "answer" field, OR if
    // its run finished (the agent submits answers to advance ask runs from
    // WAITING to FINISHED). Either way the prompt cannot run unattended.
    const answeredQuestion = decisions.some((d) => {
      const cat = String(d?.category || '').toLowerCase();
      const act = String(d?.action || '').toLowerCase();
      const isAsk = cat === 'ask' || act === 'ask';
      if (!isAsk) return false;
      const hasAnswerField = Array.isArray(d?.fields)
        && d.fields.some((f: any) => String(f?.key || '').toLowerCase() === 'answer' && f?.value);
      const status = String(d?.run_details?.status || '').toUpperCase();
      return hasAnswerField || status === 'FINISHED';
    });
    const reasons: string[] = [];
    const warnings: string[] = [];
    if (isNotFinished) {
      // The ONLY hard block, and it is identical on Start / Simple / Detailed.
      reasons.push('Wait for the agent to finish before scheduling.');
    }
    // Quality gates are advisory only — they surface in the tooltip but never
    // disable the button, so scheduling behaves the same in every view.
    if (hadContinuation) {
      warnings.push('This run needed a follow-up message to continue, so the one-shot prompt did not succeed on its own.');
    }
    if (actionCount === 0) {
      warnings.push('This run did not perform any app or tool actions, so a scheduled run may have nothing meaningful to do.');
    }
    if (failedDecision) {
      warnings.push('A decision in this run failed. Consider fixing the failing step and rerunning before scheduling.');
    }
    if (answeredQuestion) {
      warnings.push('A question in this run was answered manually. Scheduled runs are unattended.');
    }
    return { scheduleDisabledReasons: reasons, scheduleWarnings: warnings };
  }, [agentData, execution?.status]);


  // Detect natural-language scheduling intent in the prompt (e.g. "daily at 6 am",
  // "next monday at 2am", "every 15 minutes"). Used to highlight the Schedule
  // button and pre-seed the cron picker.
  // One-off reminders ("in 15 minutes", "in 2 days", "this coming monday") are
  // executed by the agent itself, so they must not surface the Schedule button
  // or pre-seed a recurring cron — only true recurrences drive the UI.
  const scheduleHint = useMemo(() => {
    const parsed = parseScheduleHint(actionInput);
    return parsed && parsed.once ? null : parsed;
  }, [actionInput]);

  // Track which hint we last auto-applied so we never overwrite a manual pick.
  const lastAppliedHintRef = useRef<string | null>(null);
  useEffect(() => {
    if (!scheduleHint) return;
    if (scheduleAnchor) return; // never override while popover is open
    if (lastAppliedHintRef.current === scheduleHint.cron) return;
    setScheduleCron(scheduleHint.cron);
    lastAppliedHintRef.current = scheduleHint.cron;
  }, [scheduleHint, scheduleAnchor]);

  // Post-run discovery: the same requirements we surface *before* a run
  // (schedule intent + apps/categories the prompt needs) are still relevant
  // once the run finishes, so the "Run finished" area can help set them up.
  // IMPORTANT: this must derive from the prompt that produced the *finished
  // run*, not the live textarea — the textarea is cleared after submit (and
  // may hold an unrelated draft), which is why the block used to disappear and
  // then reappear with unrelated suggestions after switching tabs.
  const finishedRunInput = useMemo(() => extractCleanDisplayPrompt(resolveRunInput()), [resolveRunInput]);

  const postRunScheduleHint = useMemo(() => {
    const parsed = parseScheduleHint(finishedRunInput);
    return parsed && parsed.once ? null : parsed;
  }, [finishedRunInput]);

  const postRunAppReqs = useMemo<SuggestionAppRequirement[]>(() => {
    const text = (finishedRunInput || '').trim();
    if (text.length < 4) return [];
    const reqs = getSuggestionAppRequirements(text, 4);
    // Drop the generic fallback requirement.
    const meaningful = reqs.filter((r) => !(r.kind === 'app' && r.value === 'shuffle_tools'));
    const chosen = chosenApps.map((a) => normalizeAgentAppName(a.name || '').replace(/_/g, ' '));
    return meaningful.filter((r) => {
      const target = r.value.toLowerCase().replace(/[_-]+/g, ' ');
      return !chosen.some((c) => c && (c === target || c.includes(target) || target.includes(c)));
    });
  }, [finishedRunInput, chosenApps]);







  // Compile structured recurrence controls into a 5-field cron expression.
  // Skipped if the user has manually overridden via preset chip / advanced
  // cron text field — that override is cleared whenever they touch a
  // structured control again.
  useEffect(() => {
    if (cronManualOverrideRef.current) return;
    const m = Math.max(0, Math.min(59, schedMinute));
    const h = Math.max(0, Math.min(23, schedHour));
    const n = Math.max(1, Math.floor(schedInterval || 1));
    let cron = '';
    if (schedFreq === 'minutes') {
      cron = `*/${n} * * * *`;
    } else if (schedFreq === 'hours') {
      cron = `${m} */${n} * * *`;
    } else if (schedFreq === 'days') {
      cron = n === 1 ? `${m} ${h} * * *` : `${m} ${h} */${n} * *`;
    } else if (schedFreq === 'weeks') {
      // Cron has no native "every N weeks", so we use the weekday set and
      // surface a small note in the UI when interval > 1.
      const days = schedWeekdays.size > 0
        ? [...schedWeekdays].sort((a, b) => a - b).join(',')
        : '*';
      cron = `${m} ${h} * * ${days}`;
    } else if (schedFreq === 'months') {
      const dom = Math.max(1, Math.min(31, schedDayOfMonth));
      cron = n === 1 ? `${m} ${h} ${dom} * *` : `${m} ${h} ${dom} */${n} *`;
    }
    if (cron) setScheduleCron(cron);
  }, [schedFreq, schedInterval, schedHour, schedMinute, schedWeekdays, schedDayOfMonth]);

  const scheduleDisabledReason = scheduleDisabledReasons[0] || '';
  const scheduleDisabledTooltip: React.ReactNode = scheduleDisabledReasons.length > 1 ? (
    <Box>
      <Box sx={{ fontWeight: 600, mb: 0.5 }}>Cannot schedule for {scheduleDisabledReasons.length} reasons:</Box>
      <Box sx={{ m: 0 }}>
        {scheduleDisabledReasons.map((r, i) => (
          <Box key={i} sx={{ mb: 0.5, display: 'flex', gap: 0.75 }}>
            <Box component="span" sx={{ fontWeight: 700, flexShrink: 0 }}>{i + 1}.</Box>
            <Box component="span">{r}</Box>
          </Box>
        ))}
      </Box>
    </Box>
  ) : scheduleDisabledReasons.length === 1 ? `Cannot schedule: ${scheduleDisabledReasons[0]}` : (
    scheduleWarnings.length > 0 ? (
      <Box>
        <Box sx={{ fontWeight: 600, mb: 0.5 }}>Schedule this prompt to run repeatedly on a cron schedule</Box>
        <Box sx={{ m: 0 }}>
          {scheduleWarnings.map((r, i) => (
            <Box key={i} sx={{ mb: 0.5, display: 'flex', gap: 0.75 }}>
              <Box component="span" sx={{ fontWeight: 700, flexShrink: 0 }}>·</Box>
              <Box component="span">{r}</Box>
            </Box>
          ))}
        </Box>
      </Box>
    ) : ''
  );

  // Rendered inline (not a nested component) so it isn't remounted on every
  // parent re-render — the live duration ticker would otherwise reset hover
  // state every second and swallow clicks.
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const runStatusUpper = resolveRunStatus(execution?.status, agentData?.status);
  const runIsActive = hasExecution && !['FINISHED', 'FAILURE', 'ABORTED', 'CANCELLED', 'CANCELED'].includes(runStatusUpper);
  const tabBar = (
    <Box
      ref={tabBarRef}
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
        width: isPhone ? '100%' : 'fit-content',
        alignSelf: 'center',
        position: 'sticky',
        top: isPhone ? 0 : 8,
        left: 'auto',
        right: 'auto',
        zIndex: isPhone ? 20 : 5,
        bgcolor: isPhone ? 'hsl(var(--background))' : 'hsl(var(--card))',
        borderRadius: isPhone ? 0 : 9999,
        boxShadow: isPhone ? '0 4px 16px rgba(0,0,0,0.12)' : 'none',
        px: isPhone ? 1 : 0,
        py: isPhone ? 1 : 0,
      }}
    >
      <SegmentedControl
        layoutId="agentui-view-switcher"
        ariaLabel="Agent view"
        value={activeTab}
        onChange={(v) => goToTab(v as TabKey)}
        options={[
          { value: 'start', label: 'Start', disabled: disableStartTab, title: disableStartTab ? 'Open a new agent run from the /agents page to start a new prompt' : undefined },
          { value: 'simple', label: 'Simple', disabled: !hasExecution },
          {
            value: 'detailed',
            label: runIsActive ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Detailed
                <Loader2Icon
                  size={12}
                  className="animate-spin"
                  style={{ color: 'hsl(var(--primary))' }}
                />
              </span>
            ) : (
              'Detailed'
            ),
            disabled: !hasExecution,
            title: runIsActive ? 'Current agent run is in progress — view live detailed timeline' : undefined,
          },
          { type: 'divider', key: 'div' },
          {
            type: 'action',
            key: 'reload',
            label: <RefreshIcon size={14} />,
            title: 'Reload execution data',
            disabled: !hasExecution,
            onClick: () => {
              if (execution?.execution_id && execution?.authorization) {
                getExecution(execution.execution_id, execution.authorization);
              }
            },
          },
          {
            type: 'action',
            key: 'schedule',
            label: <ScheduleIcon size={14} />,
            title: scheduleDisabledReason
              ? `Cannot schedule: ${scheduleDisabledReason}`
              : 'Schedule this prompt to run repeatedly on a cron schedule',
            disabled: Boolean(scheduleDisabledReason),
            onClick: () => {
              if (!scheduleDisabledReason && tabBarRef.current) {
                setScheduleAnchor(tabBarRef.current);
              }
            },
          },
          // The live run indicator is rendered in the Detailed tab label above.
        ]}
      />
    </Box>
  );


  // Popover is rendered outside `tabBar` so it still mounts when the tab bar
  // is hidden (e.g. on the Start view where `showRunSwitcher` is false). The
  // schedule (clock) icon in the chat composer shares the same anchor state.
  const schedulePopover = (
      <Popover
        open={Boolean(scheduleAnchor)}
        anchorEl={scheduleAnchor}
        onClose={() => setScheduleAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              p: 2,
              width: 360,
              borderRadius: 2,
              border: '1px solid hsl(var(--border))',
              bgcolor: 'hsl(var(--card))',
              color: 'hsl(var(--foreground))',
              boxShadow: '0 8px 24px hsl(0 0% 0% / 0.35)',
            },
          },
        }}
      >
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, mb: 0.5 }}>
          Schedule recurring run
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', mb: 1.5 }}>
          Choose how often this prompt should run. The schedule keeps running until you remove it.
        </Typography>
        {scheduleHint && (
          <Box
            sx={{
              mb: 1.5,
              p: 1,
              borderRadius: 1.5,
              border: '1px solid hsl(var(--primary) / 0.4)',
              bgcolor: 'hsl(var(--primary) / 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <ScheduleIcon size={16} color={'hsl(var(--primary))'} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', mb: 0.25 }}>
                Detected from your prompt
              </Box>
              <Box sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                {scheduleHint.label}
              </Box>
              <Box sx={{ fontSize: '0.68rem', fontFamily: 'monospace', color: 'hsl(var(--muted-foreground))' }}>
                {scheduleHint.cron}
              </Box>
            </Box>
            {scheduleCron !== scheduleHint.cron && (
              <Button
                size="small"
                onClick={() => { cronManualOverrideRef.current = true; setScheduleCron(scheduleHint.cron); }}
                sx={{
                  height: 28,
                  textTransform: 'none',
                  fontSize: '0.7rem',
                  color: 'hsl(var(--primary))',
                  '&:hover': { bgcolor: 'hsl(var(--primary) / 0.12)' },
                }}
              >
                Use
              </Button>
            )}
          </Box>
        )}
        {/* Structured recurrence builder (Google Calendar style) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
          <Typography sx={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}>
            Repeat every
          </Typography>
          <TextField
            size="small"
            type="number"
            value={schedInterval}
            onChange={(e) => { cronManualOverrideRef.current = false; setSchedInterval(Math.max(1, Number(e.target.value) || 1)); }}
            slotProps={{ htmlInput: { min: 1, max: 999, style: { padding: '6px 8px', width: 48, textAlign: 'center', fontSize: '0.8rem' } } }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'hsl(var(--muted))',
                color: 'hsl(var(--foreground))',
                '& fieldset': { borderColor: 'hsl(var(--border))' },
                '&:hover fieldset': { borderColor: 'hsl(var(--border))' },
                '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
              },
            }}
          />
          <Select
            size="small"
            value={schedFreq}
            onChange={(e) => { cronManualOverrideRef.current = false; setSchedFreq(e.target.value as SchedFreq); }}
            sx={{
              flex: 1,
              fontSize: '0.8rem',
              bgcolor: 'hsl(var(--muted))',
              color: 'hsl(var(--foreground))',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--border))' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--border))' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--primary))' },
              '& .MuiSelect-icon': { color: 'hsl(var(--muted-foreground))' },
              '& .MuiSelect-select': { py: '6px' },
            }}
            MenuProps={{ slotProps: { paper: { sx: { bgcolor: 'hsl(var(--popover))', color: 'hsl(var(--foreground))', border: '1px solid hsl(var(--border))' } } } }}
          >
            <MenuItem value="minutes" sx={{ fontSize: '0.8rem' }}>{schedInterval === 1 ? 'minute' : 'minutes'}</MenuItem>
            <MenuItem value="hours" sx={{ fontSize: '0.8rem' }}>{schedInterval === 1 ? 'hour' : 'hours'}</MenuItem>
            <MenuItem value="days" sx={{ fontSize: '0.8rem' }}>{schedInterval === 1 ? 'day' : 'days'}</MenuItem>
            <MenuItem value="weeks" sx={{ fontSize: '0.8rem' }}>{schedInterval === 1 ? 'week' : 'weeks'}</MenuItem>
            <MenuItem value="months" sx={{ fontSize: '0.8rem' }}>{schedInterval === 1 ? 'month' : 'months'}</MenuItem>
          </Select>
        </Box>

        {(schedFreq === 'days' || schedFreq === 'weeks' || schedFreq === 'months') && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
            <Typography sx={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}>
              At
            </Typography>
            <TextField
              size="small"
              type="time"
              value={`${String(schedHour).padStart(2, '0')}:${String(schedMinute).padStart(2, '0')}`}
              onChange={(e) => {
                cronManualOverrideRef.current = false;
                const [hh, mm] = (e.target.value || '09:00').split(':').map(Number);
                setSchedHour(Number.isFinite(hh) ? hh : 9);
                setSchedMinute(Number.isFinite(mm) ? mm : 0);
              }}
              slotProps={{ htmlInput: { style: { padding: '6px 8px', fontSize: '0.8rem' } } }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'hsl(var(--muted))',
                  color: 'hsl(var(--foreground))',
                  '& fieldset': { borderColor: 'hsl(var(--border))' },
                  '&:hover fieldset': { borderColor: 'hsl(var(--border))' },
                  '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
                },
              }}
            />
          </Box>
        )}

        {schedFreq === 'weeks' && (
          <Box sx={{ mb: 1.25 }}>
            <Typography sx={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))', mb: 0.75 }}>
              Repeat on
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {(['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const).map((label, i) => {
                const active = schedWeekdays.has(i);
                return (
                  <Box
                    key={i}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      cronManualOverrideRef.current = false;
                      setSchedWeekdays((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        return next;
                      });
                    }}
                    sx={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      userSelect: 'none',
                      bgcolor: active ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                      color: active ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
                      border: '1px solid',
                      borderColor: active ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                      transition: 'background-color 120ms',
                      '&:hover': { bgcolor: active ? 'hsl(var(--primary))' : 'hsl(var(--muted) / 0.7)' },
                    }}
                  >
                    {label}
                  </Box>
                );
              })}
            </Box>
            {schedInterval > 1 && (
              <Typography sx={{ fontSize: '0.68rem', color: 'hsl(var(--muted-foreground))', mt: 0.75 }}>
                Cron does not support every {schedInterval} weeks natively — this will run weekly on the selected days.
              </Typography>
            )}
          </Box>
        )}

        {schedFreq === 'months' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
            <Typography sx={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}>
              On day
            </Typography>
            <TextField
              size="small"
              type="number"
              value={schedDayOfMonth}
              onChange={(e) => { cronManualOverrideRef.current = false; setSchedDayOfMonth(Math.max(1, Math.min(31, Number(e.target.value) || 1))); }}
              slotProps={{ htmlInput: { min: 1, max: 31, style: { padding: '6px 8px', width: 56, textAlign: 'center', fontSize: '0.8rem' } } }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'hsl(var(--muted))',
                  color: 'hsl(var(--foreground))',
                  '& fieldset': { borderColor: 'hsl(var(--border))' },
                  '&:hover fieldset': { borderColor: 'hsl(var(--border))' },
                  '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
                },
              }}
            />
            <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))' }}>
              of the month
            </Typography>
          </Box>
        )}

        <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', mt: 0.5, mb: 0.5 }}>
          Quick presets
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
          {([
            ['Every 15 min', '*/15 * * * *'],
            ['Hourly', '0 * * * *'],
            ['Daily 9am', '0 9 * * *'],
            ['Weekdays 9am', '0 9 * * 1-5'],
            ['Weekly Mon', '0 9 * * 1'],
            ['Monthly 1st', '0 9 1 * *'],
          ] as const).map(([label, expr]) => (
            <Chip
              key={expr}
              label={label}
              size="small"
              onClick={() => { cronManualOverrideRef.current = true; setScheduleCron(expr); }}
              sx={{
                fontSize: '0.7rem',
                bgcolor: scheduleCron === expr ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--muted))',
                color: scheduleCron === expr ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
                border: scheduleCron === expr ? '1px solid hsl(var(--primary))' : '1px solid transparent',
                '&:hover': { bgcolor: 'hsl(var(--muted) / 0.8)' },
              }}
            />
          ))}
        </Box>

        <Box sx={{ mt: 1.25 }}>
          <Box
            role="button"
            tabIndex={0}
            onClick={() => setSchedAdvancedOpen((v) => !v)}
            sx={{
              fontSize: '0.7rem',
              color: 'hsl(var(--muted-foreground))',
              cursor: 'pointer',
              userSelect: 'none',
              '&:hover': { color: 'hsl(var(--foreground))' },
            }}
          >
            {schedAdvancedOpen ? '▾' : '▸'} Advanced — edit cron expression
          </Box>
          {schedAdvancedOpen && (
            <TextField
              size="small"
              fullWidth
              value={scheduleCron}
              onChange={(e) => { cronManualOverrideRef.current = true; setScheduleCron(e.target.value); }}
              placeholder="0 9 * * 1-5"
              slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: '0.78rem', padding: '6px 8px' } } }}
              sx={{
                mt: 0.75,
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'hsl(var(--muted))',
                  color: 'hsl(var(--foreground))',
                  '& fieldset': { borderColor: 'hsl(var(--border))' },
                  '&:hover fieldset': { borderColor: 'hsl(var(--border))' },
                  '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
                },
              }}
            />
          )}
          <Typography sx={{ fontSize: '0.68rem', fontFamily: 'monospace', color: 'hsl(var(--muted-foreground))', mt: 0.75 }}>
            cron: {scheduleCron || '—'}
          </Typography>
        </Box>
        {scheduleSaving && (
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 0.75, p: 1.25, borderRadius: 1, bgcolor: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))' }}>
            {scheduleSteps.map((s) => {
              const label =
                s.id === 'name' ? 'Generating name & description'
                : s.id === 'workflow' ? 'Creating workflow'
                : 'Enabling schedule';
              const color =
                s.state === 'done' ? 'hsl(var(--primary))'
                : s.state === 'error' ? 'hsl(var(--destructive))'
                : s.state === 'active' ? 'hsl(var(--foreground))'
                : 'hsl(var(--muted-foreground))';
              return (
                <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.78rem', color }}>
                  <Box sx={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {s.state === 'active' && <CircularProgress size={12} sx={{ color: 'hsl(var(--primary))' }} />}
                    {s.state === 'done' && <Box sx={{ fontSize: '0.85rem', lineHeight: 1, color: 'hsl(var(--primary))' }}>✓</Box>}
                    {s.state === 'error' && <Box sx={{ fontSize: '0.85rem', lineHeight: 1, color: 'hsl(var(--destructive))' }}>!</Box>}
                    {s.state === 'pending' && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'hsl(var(--muted-foreground))', opacity: 0.4 }} />}
                  </Box>
                  <Box component="span" sx={{ fontFamily: 'inherit' }}>
                    {label}
                    {s.detail && s.state !== 'pending' && (
                      <Box component="span" sx={{ ml: 0.75, color: 'hsl(var(--muted-foreground))', fontFamily: 'monospace', fontSize: '0.72rem' }}>
                        — {s.detail}
                      </Box>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
          <Button
            size="small"
            onClick={() => setScheduleAnchor(null)}
            disabled={scheduleSaving}
            sx={{ height: 36, color: 'hsl(var(--muted-foreground))', textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            disabled={!scheduleCron.trim() || scheduleSaving}
            onClick={async () => {
              const cron = scheduleCron.trim();
              console.log('[AgentUI] Save schedule clicked', { cron, hasOnSchedule: typeof onSchedule === 'function', inputLen: actionInput?.length });
              if (!cron) return;
              setScheduleSteps([
                { id: 'name', state: 'pending' },
                { id: 'workflow', state: 'pending' },
                { id: 'schedule', state: 'pending' },
              ]);
              setScheduleSaving(true);
              try {
                if (onSchedule) {
                  await onSchedule({
                    cron,
                    input: actionInput || '',
                    apps: chosenApps.filter((a) => !!a?.name).map((a) => ({ name: a.name, id: a.id, icon: a.icon })),
                    ...(selectedPreset ? { presetId: selectedPreset.id } : {}),
                    onStep: (ev) => {
                      setScheduleSteps((prev) => prev.map((p) => p.id === ev.id ? { ...p, state: ev.state, detail: ev.detail } : p));
                    },
                  });
                  toast({ title: 'Schedule saved', description: 'This prompt will now run on the selected schedule.' });
                  setScheduleAnchor(null);
                } else {
                  toast({ title: 'Scheduling not configured', description: 'No handler is wired up for scheduled runs in this view.', variant: 'destructive' });
                  setScheduleAnchor(null);
                }
              } catch (err) {
                console.error('[AgentUI] Schedule failed', err);
                toast({ title: 'Failed to save schedule', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
              } finally {
                setScheduleSaving(false);
              }
            }}
            sx={{
              height: 36, textTransform: 'none',
              bgcolor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))',
              '&:hover': { bgcolor: 'hsl(var(--primary))', filter: 'brightness(1.1)' },
            }}
          >
            {scheduleSaving ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : 'Save schedule'}
          </Button>
        </Box>
      </Popover>
  );

  // Shared post-run discovery block: surfaces the same schedule intent and
  // missing app/category requirements we show before a run, so the finished
  // state can help set it up. Used by both the compact and detailed views.
  // Hidden except for support users to guide towards things working better over time.
  const postRunDiscovery = isEffectiveSupport && ((Boolean(postRunScheduleHint) && !scheduleDisabledReason) || postRunAppReqs.length > 0) ? (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1,
        p: 1.5, borderRadius: 1.5,
        border: '1px solid hsl(var(--border))',
        bgcolor: 'hsl(var(--muted) / 0.35)',
      }}
    >
      <Tooltip
        title="Visible to support users only — this helps guide us towards things working better over time."
        arrow
      >
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            mr: 0.5,
            cursor: 'help',
          }}
        >
          <Typography sx={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))' }}>
            Set this up to run on its own
          </Typography>
          <Box
            component="span"
            sx={{
              fontSize: '0.64rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              px: 0.75,
              py: 0.15,
              borderRadius: '4px',
              bgcolor: 'hsl(var(--muted))',
              color: 'hsl(var(--muted-foreground))',
              border: '1px solid hsl(var(--border))',
            }}
          >
            Support only
          </Box>
        </Box>
      </Tooltip>
      {postRunScheduleHint && !scheduleDisabledReason && (
        <Tooltip title={`Detected schedule: ${postRunScheduleHint.label}. Click to review and save.`} arrow>
          <Box
            role="button"
            onClick={(e) => setScheduleAnchor(e.currentTarget as HTMLElement)}
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.5,
              px: 1, py: 0.25, borderRadius: 999,
              border: '1px solid hsl(var(--primary) / 0.7)',
              bgcolor: 'hsl(var(--primary) / 0.12)',
              color: 'hsl(var(--primary))',
              fontSize: '0.8rem', fontWeight: 600,
              cursor: 'pointer',
              '&:hover': { bgcolor: 'hsl(var(--primary) / 0.2)' },
            }}
          >
            <ScheduleIcon size={13} />
            {postRunScheduleHint.label}
          </Box>
        </Tooltip>
      )}
      {postRunAppReqs.map((req) => (
        <Tooltip
          key={`post-${req.kind}-${req.value}`}
          title={req.kind === 'category'
            ? `Suggested from your prompt: no ${req.label} app was used in this run. Click to pick one.`
            : `Suggested from your prompt: ${req.label} was not used in this run. Click to add it.`}
          arrow
        >
          <Box
            role="button"
            onClick={() => {
              if (req.kind === 'category') setCategoryTarget(req.value);
              setAppSearchQuery(req.kind === 'category' ? req.value : req.label);
              setAppSearchOpen(true);
            }}
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.5,
              px: 1, py: 0.25, borderRadius: 999,
              border: '1px dashed hsl(var(--severity-medium) / 0.7)',
              bgcolor: 'hsl(var(--severity-medium) / 0.12)',
              color: 'hsl(var(--foreground))',
              fontSize: '0.8rem',
              cursor: 'pointer',
              '&:hover': { bgcolor: 'hsl(var(--severity-medium) / 0.2)' },
            }}
          >
            <WarningIcon size={13} color={'hsl(var(--severity-medium))'} />
            {req.label}
          </Box>
        </Tooltip>
      ))}
    </Box>
  ) : null;

  // ── Mobile "+" menu: Skills / Schedule / Attach in one control ──
  const mobilePlusCanSchedule = (hasExecution || showStarter)
    && !scheduleDisabledReason
    && !disableSchedule
    && (actionInput || '').trim().length >= 1;

  const mobilePlusButton = isPhone ? (
    <Tooltip
      title={selectedPreset ? `Skill: ${selectedPreset.label} (click to change)` : 'Add skill, schedule, or attachments'}
      arrow
    >
      <IconButton
        type="button"
        aria-label="Skills, schedule and attachments"
        onClick={(e) => setMobilePlusAnchor(e.currentTarget)}
        sx={{
          width: 32,
          height: 32,
          flexShrink: 0,
          alignSelf: 'center',
          border: '1px solid hsl(var(--border))',
          color: selectedPreset ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
          bgcolor: selectedPreset ? 'hsl(var(--muted))' : 'transparent',
          '&:hover': { bgcolor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))' },
        }}
      >
        <PlusIcon size={16} />
      </IconButton>
    </Tooltip>
  ) : null;

  const mobileSkillChip = isPhone && selectedPreset && !hidePresets ? (
    <AgentPresets
      variant="floating"
      chipRef={presetsChipRef}
      presets={presets}
      isSupport={isEffectiveSupport}
      selectedPreset={selectedPreset}
      onRemoveSelected={handleRemovePreset}
      onSelectPreset={handleSelectPresetInternal}
      placement="bottom-start"
      sx={{
        height: 32,
        alignSelf: 'center',
      }}
    />
  ) : null;

  const mobilePlusMenu = isPhone ? (
    <Popover
      open={Boolean(mobilePlusAnchor)}
      anchorEl={mobilePlusAnchor}
      onClose={() => setMobilePlusAnchor(null)}
      anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{
        paper: {
          sx: {
            mt: -1,
            minWidth: 220,
            bgcolor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
          },
        },
      }}
    >
      <MenuList dense disablePadding>
        {!hidePresets && (
          <MenuItem
            onClick={() => {
              setMobilePlusAnchor(null);
              setTimeout(() => { try { presetsChipNodeRef.current?.click(); } catch { /* ignore */ } }, 0);
            }}
            sx={{ gap: 1.25, py: 1, fontSize: '0.85rem', color: 'hsl(var(--foreground))' }}
          >
            <SettingsIcon size={16} />
            {selectedPreset ? `Skill: ${selectedPreset.label}` : 'Choose a skill'}
          </MenuItem>
        )}
        {!hidePresets && selectedPreset && (
          <MenuItem
            onClick={() => {
              setMobilePlusAnchor(null);
              try { localStorage.removeItem(LAST_PRESET_STORAGE_KEY); } catch { /* ignore */ }
              setSelectedPreset(null);
            }}
            sx={{ gap: 1.25, py: 1, fontSize: '0.85rem', color: 'hsl(var(--muted-foreground))' }}
          >
            <CloseIcon size={16} />
            Remove skill
          </MenuItem>
        )}
        {!disableSchedule && (
          <MenuItem
            disabled={!mobilePlusCanSchedule || agentRequestLoading}
            onClick={() => {
              const el = mobilePlusAnchor;
              setMobilePlusAnchor(null);
              if (el) setScheduleAnchor(el);
            }}
            sx={{ gap: 1.25, py: 1, fontSize: '0.85rem', color: 'hsl(var(--foreground))' }}
          >
            <ScheduleIcon size={16} />
            Schedule this prompt
          </MenuItem>
        )}
        {!hideAttach && (
          <MenuItem
            disabled={agentRequestLoading || attachedImages.length >= 3}
            onClick={() => {
              setMobilePlusAnchor(null);
              fileInputRef.current?.click();
            }}
            sx={{ gap: 1.25, py: 1, fontSize: '0.85rem', color: 'hsl(var(--foreground))' }}
          >
            <AttachFileIcon size={16} />
            {attachedImages.length > 0 ? `Attach image (${attachedImages.length}/3)` : 'Attach image'}
          </MenuItem>
        )}
      </MenuList>
    </Popover>
  ) : null;

  // Continuation form (after a finish decision)
  const continuationMultiline = continuationText.includes('\n') || continuationText.length > 80;
  const continuationElement = (finishDecisionId && !optimisticRunning) ? (
    <Box sx={{ width: '100%', maxWidth: 640, mx: 'auto' }}>
      <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', mb: 0.75, textAlign: 'center' }}>
        Continue this agent run with more details
      </Typography>
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (continuationText.trim()) {
            submitQuestions(finishDecisionId, { continue: continuationText }, true);
          }
        }}
        sx={{
          display: 'flex',
          alignItems: continuationMultiline ? 'flex-end' : 'center',
          gap: 1,
          borderRadius: isPhone ? (continuationMultiline ? '20px' : '28px') : '28px',
          border: '1.5px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--card))',
          px: isPhone ? 1.5 : 2.25,
          py: isPhone ? (continuationMultiline ? 1.25 : 1) : 1,
          boxSizing: 'border-box',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          '&:focus-within': {
            borderColor: 'hsl(var(--primary))',
            boxShadow: '0 0 0 3px hsla(var(--primary) / 0.12)',
          },
          ...(continueHighlighted && {
            borderColor: 'hsl(var(--primary))',
            boxShadow: '0 0 0 3px hsla(var(--primary) / 0.12)',
          }),
        }}
      >
        <InputBase
          fullWidth
          multiline
          minRows={1}
          maxRows={4}
          placeholder={continuationPlaceholder}
          inputRef={continuationInputRef}
          autoFocus
          value={continuationText}
          onChange={(e) => setContinuationText(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if ((e.key === 'Enter' && !e.shiftKey) || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
              e.preventDefault();
              if (continuationText.trim() && !agentRequestLoading) {
                submitQuestions(finishDecisionId, { continue: continuationText }, true);
              }
            }
          }}
          disabled={agentRequestLoading}
          sx={{
            fontSize: '0.9rem',
            color: 'hsl(var(--foreground))',
            py: 0,
            flex: '1 1 auto',
            minWidth: 0,
            '& .MuiInputBase-input': {
              pt: '5px',
              pb: '6px',
              lineHeight: 1.5,
            },
            '& textarea::placeholder': {
              color: 'hsl(var(--muted-foreground))',
              opacity: 0.7,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          }}
        />
        <Tooltip title={submitTooltip === '⌘+Enter to send' ? 'Enter to send, Shift+Enter for new line' : submitTooltip} placement="top" arrow>
          <span>
            <IconButton
              type="submit"
              disabled={!continuationText.trim() || agentRequestLoading}
              sx={{
                width: 32,
                height: 32,
                flexShrink: 0,
                bgcolor: continuationText.trim() && !agentRequestLoading ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                color: continuationText.trim() && !agentRequestLoading ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                '&:hover': continuationText.trim() && !agentRequestLoading ? { filter: 'brightness(1.1)', bgcolor: 'hsl(var(--primary))' } : {},
                '&.Mui-disabled': { bgcolor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' },
              }}
            >
              {agentRequestLoading ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : (submitIcon ?? <PlayArrowRoundedIcon />)}
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  ) : null;

  // ── Render ──

  return (
    <Box
      className={className}
      sx={[
        {
          width: '100%',
          height: sidebarLayout ? '100%' : undefined,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: sidebarLayout ? 'flex-start' : 'center',
          overflow: sidebarLayout ? 'hidden' : undefined,
          pb: sidebarLayout ? 0 : (isPhone ? 1 : 4),
          ...(isPhone && showStarter && !sidebarLayout ? { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' } : {}),
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {/* Pinned Top Bar in Sidebar Layout */}
      {sidebarLayout && showRunSwitcher && (
        <Box
          sx={{
            flexShrink: 0,
            width: '100%',
            py: 1,
            px: 1.5,
            display: 'flex',
            justifyContent: 'center',
            borderBottom: '1px solid hsl(var(--border) / 0.5)',
            bgcolor: 'hsl(var(--card))',
            zIndex: 10,
          }}
        >
          {tabBar}
        </Box>
      )}

      {/* Middle Scrollable Container */}
      <Box
        sx={[
          {
            width: '100%',
            maxWidth: sidebarLayout ? '100%' : maxWidth,
            display: 'flex',
            flexDirection: 'column',
            flex: sidebarLayout ? 1 : (isPhone && showStarter ? 1 : undefined),
            minHeight: sidebarLayout ? 0 : undefined,
            overflowY: sidebarLayout ? 'auto' : undefined,
            overflowX: sidebarLayout ? 'hidden' : undefined,
            gap: isPhone ? 1.5 : (sidebarLayout ? 2 : 3),
            px: sidebarLayout ? 1.5 : 0,
            pb: sidebarLayout ? 1.5 : 0,
            ...(isPhone && showStarter && !sidebarLayout ? { flex: 1, justifyContent: 'center' } : {}),
          },
          ...(Array.isArray(contentSx) ? contentSx : contentSx ? [contentSx] : []),
        ]}
      >
        {!sidebarLayout && showRunSwitcher && tabBar}
        {schedulePopover}
        {mobilePlusMenu}
        {showStarter ? (
          <Box
            component="form"
            onSubmit={(e) => { e.preventDefault(); handlePrimarySubmit(); }}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: isPhone ? 1.5 : (compact ? 2 : 3),
              py: isPhone ? 1 : (compact ? 2 : 4),
              width: '100%',
              ...(sidebarLayout
                ? { my: 'auto' }
                : (isPhone ? { flex: 1, justifyContent: 'center', marginTop: compact ? '-16px' : '-50px' } : {})),
            }}
          >
            {!hideHeroIcon && !compact && !isPhone && (
              <Box sx={{
                width: heroIconSize, height: heroIconSize, borderRadius: 3,
                bgcolor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
              }}>
                {heroIcon ?? <AgentIcon size={Math.round(heroIconSize * 0.67)} />}
              </Box>
            )}
            {title ? (
              <Typography component="h1" sx={{
                fontSize: isPhone ? '1.35rem' : compact ? { xs: '1.1rem', md: '1.5rem' } : { xs: '1.35rem', md: '2.25rem' },
                fontWeight: 600,
                color: 'hsl(var(--foreground))',
                textAlign: 'center',
                letterSpacing: '-0.01em',
              }}>
                {title}
              </Typography>
            ) : null}
            {subtitle && (
              <Typography sx={{
                fontSize: { xs: '0.8rem', sm: '0.95rem' },
                color: 'hsl(var(--muted-foreground))',
                textAlign: 'center',
                mt: isPhone ? -0.5 : -1,
                maxWidth: 600,
              }}>
                {subtitle}
              </Typography>
            )}

            <Box ref={promptAnchorRef} sx={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              // Keep the same radius in both states so growing to multiple
              // lines does not visually snap from a pill to a boxy card.
              borderRadius: isPhone ? (promptMultiline ? '20px' : '28px') : '28px',
              border: '1.5px solid hsl(var(--border))',
              bgcolor: 'hsl(var(--card))',
              px: isPhone ? 1.5 : 2.25,
              py: isPhone ? (promptMultiline ? 1.25 : 1) : 1,
              boxSizing: 'border-box',


              // A one-line prompt is a fixed-size control. Lock all three
              // dimensions so TextareaAutosize cannot retain a stale
              // multiline inline height after Skill/focus changes.
              ...(promptSingleLineLocked ? {
                height: '52px',
                minHeight: '52px',
                maxHeight: '52px',
                boxSizing: 'border-box',
              } : {}),

              position: 'relative',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              '&:focus-within': {
                borderColor: 'hsl(var(--primary))',
                boxShadow: '0 0 0 3px hsla(var(--primary) / 0.12)',
              },
            }}>
              <Box sx={{
                display: 'flex',
                // One line: everything stays on a single row (chip overlay,
                // text, buttons). Past one line the textarea takes the full
                // width and the chip + buttons wrap onto their own bottom bar.
                flexWrap: promptMultiline ? 'wrap' : 'nowrap',
                alignItems: promptMultiline ? 'center' : 'flex-start',
                gap: 1,
                width: '100%',
                position: 'relative',
                ...(promptSingleLineLocked ? {
                  height: '33px',
                  minHeight: '33px',
                  maxHeight: '33px',
                } : {}),
              }}>

              {isPhone && !promptMultiline && (
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                  {mobilePlusButton}
                  {mobileSkillChip}
                </Box>
              )}

              <InputBase
                inputRef={inputRef}
                autoFocus
                multiline
                // Once expanded, immediately reserve the second line so the
                // first line does not jump when the text actually wraps.
                minRows={promptMultiline ? 2 : 1}
                maxRows={6}
                fullWidth
                value={actionInput}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setActionInput(nextValue);
                  if (contextStorageKey) {
                    setPageContextChoice(contextStorageKey, { draftPrompt: nextValue });
                  }
                  if (nextValue.length === 0) {
                    setPromptSingleLine(true);
                    setInputScrolled(false);
                    setInputScrollTop(0);
                    applyChipScroll(0);
                  }
                }}
                onBlur={(e) => {
                  const node = e.target as HTMLTextAreaElement;
                  if (contextStorageKey) {
                    setPageContextChoice(contextStorageKey, { draftPrompt: node.value || '' });
                  }
                  // Only an empty prompt collapses back to the single-line
                  // pill on blur. Any remaining text keeps whatever the wrap
                  // measurement decided, so wrapped text can never be clipped
                  // behind the Skills chip.
                  if ((node.value || '').length === 0) {
                    setPromptSingleLine(true);
                    node.scrollTop = 0;
                    setInputScrolled(false);
                    setInputScrollTop(0);
                    applyChipScroll(0);
                  }
                }}

                placeholder={typedPlaceholder}
                onKeyDown={onKeyDown}
                onScroll={(e) => {
                  const st = (e.target as HTMLTextAreaElement).scrollTop;
                  // Move the chip in the same frame as the scroll event.
                  applyChipScroll(st);
                  setInputScrolled((prev) => (prev === st > 1 ? prev : st > 1));
                  setInputScrollTop(st);
                }}


                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  const files: File[] = [];
                  for (const item of Array.from(items)) {
                    if (item.kind === 'file' && item.type.startsWith('image/')) {
                      const file = item.getAsFile();
                      if (file) files.push(file);
                    }
                  }
                  if (files.length > 0) {
                    e.preventDefault();
                    handleImagesSelected(files);
                  }
                }}
                disabled={agentRequestLoading}
                sx={{
                  fontSize: '0.9rem',
                  color: 'hsl(var(--foreground))',
                  py: 0,
                  // Past one line the input takes the full width so the
                  // scrollbar sits at the far right and the action buttons
                  // wrap down to their own bottom row.
                  flex: promptMultiline ? '1 0 100%' : '1 1 auto',
                  minWidth: 0,
                    ...(promptSingleLineLocked ? {
                      height: '33px',
                      minHeight: '33px',
                      maxHeight: '33px',
                    } : {}),

                  '& .MuiInputBase-input': {
                    pt: '5px',
                    pb: '6px',
                    lineHeight: 1.5,
                    // Only line 1 is indented for the skill chip while the
                    // prompt is a single line. Once it wraps, the chip drops to
                    // its own bottom row so the indent is removed.
                    textIndent: (!hidePresets && !promptMultiline && !isPhone) ? `${(presetsChipWidth || 96) + 6}px` : 0,
                    transition: 'text-indent 180ms cubic-bezier(0.4, 0, 0.2, 1)',
                     ...(promptSingleLineLocked ? {
                       height: '33px !important',
                       minHeight: '33px !important',
                       maxHeight: '33px !important',
                       boxSizing: 'border-box',
                       overflowY: 'hidden !important',
                     } : {}),
                  },
                  '& textarea::placeholder': { color: 'hsl(var(--muted-foreground))', opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
                }}

              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  handleImagesSelected(e.target.files);
                  if (e.target) e.target.value = '';
                }}
              />
              {!hidePresets && (
                <Box
                  ref={chipOverlayRef}
                  data-static={promptMultiline ? '1' : '0'}
                  sx={isPhone ? {
                    // Mobile: when no preset is selected, keep an invisible trigger mounted
                    // so the "+" menu can programmatically open the skills picker.
                    position: 'absolute',
                    left: 0,
                    bottom: 0,
                    width: 0,
                    height: 0,
                    overflow: 'hidden',
                    opacity: 0,
                    pointerEvents: 'none',
                  } : promptMultiline ? {
                    // Multiline: the skill chip drops down into its own bottom
                    // bar, pinned to the bottom-left next to the action buttons.
                    // The left offset matches the single-line overlay exactly so
                    // the chip keeps the same left margin in both states.
                    position: 'static',
                    ml: '-7px',
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                    transform: 'none',
                    opacity: 1,
                    pointerEvents: 'auto',
                    // Glide down from the line-1 position instead of snapping,
                    // and also glide back up when returning to a single line.
                    animation: 'agentSkillChipDrop 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                    '@keyframes agentSkillChipDrop': {
                      from: { transform: 'translateY(-26px)', opacity: 0.6 },
                      to: { transform: 'translateY(0)', opacity: 1 },
                    },
                  } : {
                    position: 'absolute', left: '-7px', top: '6px',

                    height: 'calc(0.9rem * 1.45)', display: 'flex', alignItems: 'center', zIndex: 1,
                    // The chip scrolls together with the textarea content so text
                    // never runs underneath it while scrolling. The transform is
                    // updated imperatively on scroll so it stays in lockstep with
                    // the text instead of lagging a render behind.
                    willChange: 'transform',
                    transform: `translateY(${-inputScrollTop}px)`,
                    opacity: inputScrollTop > 24 ? 0 : 1,
                    pointerEvents: inputScrollTop > 4 ? 'none' : 'auto',
                    // Rise up from the bottom bar when returning to a single line.
                    animation: 'agentSkillChipRise 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                    '@keyframes agentSkillChipRise': {
                      from: { transform: 'translateY(26px)', opacity: 0.6 },
                      to: { transform: 'translateY(0)', opacity: 1 },
                    },
                  }}

                >
                  {(!isPhone || !selectedPreset) && (
                    <AgentPresets
                      variant="floating"
                      chipRef={(!isPhone || !selectedPreset) ? presetsChipRef : undefined}
                      presets={presets}
                      isSupport={isEffectiveSupport}
                      selectedPreset={selectedPreset}
                      onRemoveSelected={handleRemovePreset}
                      onSelectPreset={handleSelectPresetInternal}
                    />
                  )}
                </Box>
              )}

              {attachedImages.length > 0 && (
                <Box ref={attachmentsRowRef} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                  {attachedImages.map((img, idx) => (
                    <Box key={`${img.name}-${idx}`} sx={{
                      display: 'inline-flex', alignItems: 'center', gap: 0.75,
                      height: 28, pl: '6px', pr: '8px', borderRadius: '999px',
                      border: '1px solid hsl(var(--border))',
                      maxWidth: '100%',
                    }}>
                      <Box
                        component="img"
                        src={img.dataUrl}
                        alt={img.name}
                        onClick={() => setPreviewImage(img)}
                        sx={{
                          width: 18, height: 18, borderRadius: '999px', objectFit: 'cover', flexShrink: 0,
                          cursor: 'pointer',
                          transition: 'transform 150ms ease, opacity 150ms ease',
                          '&:hover': { transform: 'scale(1.1)', opacity: 0.85 },
                        }}
                      />
                      <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--foreground))', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {img.name}
                      </Typography>
                      <IconButton size="small" onClick={() => setAttachedImages((prev) => prev.filter((_, i) => i !== idx))} sx={{ p: 0.125, color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--destructive))' } }} aria-label="Remove attached image">
                        <CloseIcon size={11} />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}


              {isPhone && promptMultiline && (
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0, minWidth: 0, maxWidth: 'calc(100% - 60px)' }}>
                  {mobilePlusButton}
                  {mobileSkillChip}
                </Box>
              )}

              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                ml: 'auto',
                mr: isPhone ? 0 : '-8px',
                flexShrink: 0,
                maxWidth: '100%',
                // Slide down into the bottom bar when expanding, and back up when collapsing.
                animation: promptMultiline
                  ? 'agentButtonsDrop 300ms cubic-bezier(0.4, 0, 0.2, 1)'
                  : 'agentButtonsRise 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                '@keyframes agentButtonsDrop': {
                  from: { transform: 'translateY(-26px)', opacity: 0.6 },
                  to: { transform: 'translateY(0)', opacity: 1 },
                },
                '@keyframes agentButtonsRise': {
                  from: { transform: 'translateY(26px)', opacity: 0.6 },
                  to: { transform: 'translateY(0)', opacity: 1 },
                },
              }}>
              {(() => {
                // On mobile the schedule control lives in the "+" menu.
                if (isPhone) return null;


                const allowWithoutExecution = showStarter;
                const promptTooShort = showStarter && (actionInput || '').trim().length < 1;
                const canSchedule = (hasExecution || allowWithoutExecution) && !scheduleDisabledReason && !promptTooShort && !disableSchedule;
                const hintActive = Boolean(scheduleHint) && canSchedule;
                const tip: React.ReactNode = disableSchedule
                  ? (disableScheduleTooltip || 'Scheduling is disabled while editing')
                  : scheduleDisabledReason
                    ? scheduleDisabledTooltip
                    : promptTooShort
                      ? 'Type a prompt before scheduling.'
                      : hintActive
                        ? `Detected schedule: ${scheduleHint!.label}. Click to review and save.`
                        : 'Schedule this prompt to run repeatedly on a cron schedule';
                return (
                  <Tooltip title={tip} placement="top" arrow>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                      <IconButton
                        type="button"
                        onClick={(e) => { if (canSchedule) setScheduleAnchor(e.currentTarget); }}
                        disabled={!canSchedule || agentRequestLoading}
                        sx={{
                          height: 32,
                          minWidth: 32,
                          px: hintActive ? 1.25 : 0,
                          width: hintActive ? 'auto' : 32,
                          borderRadius: hintActive ? 999 : '50%',
                          gap: hintActive ? 0.75 : 0,
                          color: hintActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                          bgcolor: hintActive ? 'hsl(var(--primary) / 0.12)' : 'transparent',
                          border: hintActive ? '1px solid hsl(var(--primary) / 0.5)' : '1px solid transparent',
                          '&:hover': hintActive
                            ? { bgcolor: 'hsl(var(--primary) / 0.2)', color: 'hsl(var(--primary))' }
                            : { color: 'hsl(var(--foreground))', bgcolor: 'hsl(var(--muted))' },
                          '&.Mui-disabled': { opacity: 0.4, color: 'hsl(var(--muted-foreground))' },
                          transition: 'all 160ms ease',
                        }}
                      >
                        <ScheduleIcon size={18} />
                        {hintActive && (
                          <Box
                            component="span"
                            sx={{
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              lineHeight: 1,
                              whiteSpace: 'nowrap',
                              maxWidth: 180,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {scheduleHint!.label}
                          </Box>
                        )}
                      </IconButton>
                    </Box>
                  </Tooltip>
                );
              })()}
              {!hideAttach && !isPhone && (
              <IconButton
                type="button"
                onClick={() => {
                  if (attachedImages.length >= 3) {
                    setError('You can attach a maximum of 3 images.');
                    return;
                  }
                  fileInputRef.current?.click();
                }}
                disabled={agentRequestLoading || attachedImages.length >= 3}
                title={attachedImages.length >= 3 ? 'Maximum 3 images attached' : (attachedImages.length > 0 ? `Add image (${attachedImages.length}/3 attached)` : 'Attach image')}
                sx={{
                  width: 32, height: 32,
                  color: attachedImages.length > 0 ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  bgcolor: attachedImages.length > 0 ? 'hsla(var(--primary) / 0.1)' : 'transparent',
                  '&:hover': { color: 'hsl(var(--foreground))', bgcolor: 'hsl(var(--muted))' },
                }}
              >
                <AttachFileIcon size={18} />
              </IconButton>
              )}

              <Tooltip title={isLoggedIn === false ? 'Log in to run agent' : submitTooltip} placement="top" arrow>
                <span>
                  {submitLabel ? (
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                      <Tooltip title="Try this prompt without saving" placement="top" arrow>
                        <IconButton
                          type="button"
                          onClick={() => submitInput(composeSubmitInput(actionInput))}
                          disabled={actionInput.trim().length < 1 || agentRequestLoading}
                          sx={{
                            width: 32, height: 32,
                            bgcolor: 'transparent',
                            border: '1px solid hsl(var(--border))',
                            color: 'hsl(var(--foreground))',
                            '&:hover': { bgcolor: 'hsl(var(--muted))' },
                            '&.Mui-disabled': { color: 'hsl(var(--muted-foreground))' },
                          }}
                        >
                          <PlayArrowRoundedIcon />
                        </IconButton>
                      </Tooltip>
                      <Button
                        type="submit"
                        variant="contained"
                        disabled={actionInput.trim().length < 1 || agentRequestLoading}
                        startIcon={agentRequestLoading ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : null}
                        sx={{
                          height: 32,
                          px: 2,
                          textTransform: 'none',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          boxShadow: 'none',
                          bgcolor: 'hsl(var(--primary))',
                          color: 'hsl(var(--primary-foreground))',
                          '&:hover': { bgcolor: 'hsl(var(--primary))', filter: 'brightness(1.1)', boxShadow: 'none' },
                          '&.Mui-disabled': { bgcolor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' },
                        }}
                      >
                        {submitLabel}
                      </Button>
                    </Box>
                  ) : (
                    <IconButton
                      type="submit"
                      disabled={actionInput.trim().length < 1 || agentRequestLoading}
                      sx={{
                        width: 32, height: 32,
                        bgcolor: actionInput.trim().length >= 1 ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                        color: actionInput.trim().length >= 1 ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                        '&:hover': actionInput.trim().length >= 1 ? { filter: 'brightness(1.1)', bgcolor: 'hsl(var(--primary))' } : {},
                        '&.Mui-disabled': { bgcolor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' },
                      }}
                    >
                      {agentRequestLoading ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : (submitIcon ?? <PlayArrowRoundedIcon />)}
                    </IconButton>
                  )}
                </span>
              </Tooltip>
              </Box>
              </Box>

            </Box>
            <Popper
              open={suggestionsOpen}
              anchorEl={promptAnchorRef.current}
              placement="bottom-start"
              style={{ zIndex: 1300, width: promptAnchorRef.current?.offsetWidth }}
              modifiers={[{ name: 'offset', options: { offset: [0, 6] } }]}
            >
              <ClickAwayListener onClickAway={() => setSuggestionsDismissed(true)}>
                <Paper
                  elevation={6}
                  sx={{
                    bgcolor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 2,
                    overflow: 'hidden',
                    maxHeight: 320,
                    overflowY: 'auto',
                  }}
                >
                  <MenuList dense disablePadding>
                    {promptSuggestions.map((s, i) => {
                      const q = actionInput.trim();
                      const lower = s.toLowerCase();
                      const idx = q ? lower.indexOf(q.toLowerCase()) : -1;
                      const before = idx >= 0 ? s.slice(0, idx) : s;
                      const match = idx >= 0 ? s.slice(idx, idx + q.length) : '';
                      const after = idx >= 0 ? s.slice(idx + q.length) : '';
                      const reqs = getSuggestionAppRequirements(s);
                      return (
                        <MenuItem
                          key={s}
                          selected={i === suggestionIndex}
                          onMouseEnter={() => setSuggestionIndex(i)}
                          onMouseDown={(e) => { e.preventDefault(); acceptSuggestion(s); }}
                          sx={{
                            fontSize: '0.88rem',
                            color: 'hsl(var(--foreground))',
                            py: 0.75,
                            px: 2,
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 1,
                            '&.Mui-selected, &.Mui-selected:hover': {
                              bgcolor: 'hsl(var(--muted) / 0.6)',
                            },
                          }}
                        >
                          <SearchIcon size={14} style={{ marginTop: 4, marginRight: 4, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                          <Box component="span" sx={{ whiteSpace: 'normal', lineHeight: 1.4, flex: 1, minWidth: 0 }}>
                            {before}
                            <Box component="span" sx={{ fontWeight: 700, color: 'hsl(var(--foreground))' }}>{match}</Box>
                            {after}
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, ml: 0.5 }}>
                            {reqs.map((req: SuggestionAppRequirement) => (
                              req.kind === 'app' ? (
                                <Tooltip key={`${req.kind}:${req.value}`} title={`Uses ${req.label}`} arrow>
                                  <Box
                                    sx={{
                                      width: 22,
                                      height: 22,
                                      borderRadius: 0.75,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      overflow: 'hidden',
                                      bgcolor: 'hsl(var(--muted))',
                                      border: '1px solid hsl(var(--border))',
                                      filter: 'grayscale(1)',
                                      opacity: 0.7,
                                      transition: 'filter 120ms ease, opacity 120ms ease',
                                      '&:hover': { filter: 'none', opacity: 1 },
                                    }}
                                  >
                                    <AppFallbackIcon
                                      name={prettySuggestionAppName(req.value)}
                                      size={18}
                                      style={{ borderRadius: 3 }}
                                    />
                                  </Box>
                                </Tooltip>
                              ) : (
                                <Tooltip key={`${req.kind}:${req.value}`} title={`Needs a ${req.label} — click to pick one`} arrow>
                                  <Box
                                    component="span"
                                    role="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      acceptSuggestion(s);
                                      setAppSearchQuery(req.value);
                                      setAppSearchOpen(true);
                                    }}
                                    sx={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      height: 22,
                                      px: 0.875,
                                      borderRadius: 999,
                                      fontSize: '0.68rem',
                                      fontWeight: 600,
                                      whiteSpace: 'nowrap',
                                      color: 'hsl(var(--muted-foreground))',
                                      border: '1px dashed hsl(var(--border))',
                                      cursor: 'pointer',
                                      '&:hover': {
                                        color: 'hsl(var(--primary))',
                                        borderColor: 'hsl(var(--primary))',
                                        bgcolor: 'hsl(var(--primary) / 0.08)',
                                      },
                                    }}
                                  >
                                    {req.label}
                                  </Box>
                                </Tooltip>
                              )
                            ))}
                          </Box>
                        </MenuItem>
                      );
                    })}
                  </MenuList>
                </Paper>
              </ClickAwayListener>
            </Popper>

            {(() => {
              const cta = selectedPreset ? presetCtas?.[selectedPreset.id] : undefined;
              if (!cta || cta.show === false) return null;
              return (
                <Box sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5,
                  px: 1.5, py: 1, borderRadius: 2,
                  border: '1px solid hsl(var(--border))',
                  bgcolor: 'hsl(var(--muted) / 0.4)',
                }}>
                  <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}>
                    {cta.message}
                  </Typography>
                  <Button
                    type="button"
                    size="small"
                    variant="outlined"
                    onClick={() => cta.onAction?.()}
                    sx={{
                      height: 30, textTransform: 'none', fontSize: '0.78rem', fontWeight: 600,
                      whiteSpace: 'nowrap', flexShrink: 0,
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--foreground))',
                      '&:hover': { borderColor: 'hsl(var(--primary))', bgcolor: 'hsl(var(--primary) / 0.08)' },
                    }}
                  >
                    {cta.actionLabel}
                  </Button>
                </Box>
              );
            })()}

            {!hideAppPicker && (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Box
                ref={chipBarCallbackRef}
                sx={{
                  display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5,
                  minHeight: 36,
                  boxSizing: 'border-box',
                  p: chipBarMultiline ? 0.75 : 0.5,
                  borderRadius: chipBarMultiline ? '20px' : 999,
                  border: '1px solid hsl(var(--border))',
                  bgcolor: 'hsl(var(--card))',
                  maxWidth: '100%',
                  transition: 'border-radius 0.15s ease, padding 0.15s ease',
                }}
              >
                {!hideChooseLLM && (
                <Tooltip title={configuredLLMOptions.length > 1 ? 'Switch or configure AI provider' : 'Configure the AI provider used for this agent'}>
                  <Box
                    component="button"
                    type="button"
                    onClick={(e) => {
                      if (configuredLLMOptions.length > 1) {
                        setLlmMenuAnchor(e.currentTarget);
                      } else {
                        openLocalLlmArea();
                      }
                    }}
                    sx={{
                      all: 'unset', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 0.5,
                      pl: isPhone ? 0.5 : 2.5,
                      pr: isPhone ? 0.5 : 1.5,
                      py: 0.5,
                      height: 28,
                      boxSizing: 'border-box',
                      lineHeight: 1,
                      borderRadius: 999,
                      fontSize: '0.8rem', fontWeight: 500,
                      color: 'hsl(var(--muted-foreground))',
                      bgcolor: 'transparent',
                      transition: 'color 0.12s ease, background-color 0.12s ease',
                      '&:hover': { color: 'hsl(var(--foreground))', bgcolor: 'hsl(var(--muted) / 0.5)' },
                    }}
                  >
                    {detectedLLM?.logo ? (
                      <Box
                        component="img"
                        src={detectedLLM.logo}
                        alt=""
                        sx={{ width: 14, height: 14, borderRadius: '3px', objectFit: 'contain', display: 'block' }}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <SettingsIcon size={14} />
                    )}
                    {!isPhone && (detectedLLM?.label || 'Shuffle AI')}
                  </Box>
                </Tooltip>
                )}
                {!hideChooseLLM && configuredLLMOptions.length > 1 && (
                  <Menu
                    anchorEl={llmMenuAnchor}
                    open={Boolean(llmMenuAnchor)}
                    onClose={() => setLlmMenuAnchor(null)}
                    slotProps={{
                      paper: {
                        sx: {
                          bgcolor: 'hsl(var(--popover))',
                          color: 'hsl(var(--popover-foreground))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 1.5,
                          minWidth: 190,
                          py: 0.5,
                          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                        },
                      },
                    }}
                  >
                    <Box sx={{ px: 1.5, py: 0.5, fontSize: '0.72rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      AI Provider
                    </Box>
                    {configuredLLMOptions.map((opt) => {
                      const isActive = (detectedLLM?.label || SHUFFLE_AI_PRESET) === opt.label;
                      return (
                        <MenuItem
                          key={opt.label}
                          onClick={async () => {
                            setLlmMenuAnchor(null);
                            const target = opt.label === SHUFFLE_AI_PRESET ? SHUFFLE_AI_PRESET : (opt.id || opt.label);
                            setDetectedLLM({
                              label: opt.label,
                              url: '',
                              logo: getProviderLogoUrl(opt.label, ''),
                            });
                            await switchActiveLLM(target);
                            loadAuthenticatedApps();
                          }}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1.5,
                            fontSize: '0.8rem',
                            py: 0.75,
                            px: 1.5,
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box
                              component="img"
                              src={getProviderLogoUrl(opt.label, '')}
                              alt=""
                              sx={{ width: 14, height: 14, borderRadius: '2px', objectFit: 'contain' }}
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            />
                            <Typography sx={{ fontSize: '0.8rem', fontWeight: isActive ? 600 : 400 }}>
                              {opt.label}
                            </Typography>
                          </Box>
                          {isActive && (
                            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'hsl(var(--primary))' }}>
                              Active
                            </Typography>
                          )}
                        </MenuItem>
                      );
                    })}
                    <Divider sx={{ my: 0.5 }} />
                    <MenuItem
                      onClick={() => {
                        setLlmMenuAnchor(null);
                        openLocalLlmArea();
                      }}
                      sx={{ fontSize: '0.8rem', py: 0.75, px: 1.5, color: 'hsl(var(--muted-foreground))' }}
                    >
                      Configure providers...
                    </MenuItem>
                  </Menu>
                )}
                {!hideChooseLLM && (
                  <Box
                    component="span"
                    aria-hidden
                    sx={{
                      width: '1px',
                      height: 16,
                      bgcolor: 'hsl(var(--border))',
                      mx: 0.5,
                      alignSelf: 'center',
                      flexShrink: 0,
                    }}
                  />
                )}
                <Tooltip title={agentRequestLoading ? 'Locked while the agent is running' : ''}>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => { if (!agentRequestLoading) setAppSearchOpen(true); }}
                    disabled={agentRequestLoading}
                    sx={{
                      all: 'unset', cursor: agentRequestLoading ? 'not-allowed' : 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 0.5,
                      px: 1.5, py: 0.5,
                      height: 28,
                      boxSizing: 'border-box',
                      lineHeight: 1,
                      borderRadius: 999,
                      fontSize: '0.8rem', fontWeight: 500,
                      color: 'hsl(var(--muted-foreground))',
                      bgcolor: 'transparent',
                      opacity: agentRequestLoading ? 0.5 : 1,
                      transition: 'color 0.12s ease, background-color 0.12s ease, opacity 0.12s ease',
                      '&:hover': agentRequestLoading ? {} : { color: 'hsl(var(--foreground))', bgcolor: 'hsl(var(--muted) / 0.5)' },
                    }}
                  >
                    <AddIcon size={14} />
                    {appPickerLabel}
                  </Box>
                </Tooltip>
                {chosenApps.map((app, i) => {
                  const slug = normalizeAgentAppName(app.name || '');
                  const needsAuth = !authAppsLoading && appRequiresAuthentication(slug) && !isAppAuthenticated(app.name || '', app.id || null);
                  const isVerifiedBuiltin = VERIFIED_BUILTIN_APPS.has(slug);
                  const isAvailable =
                    isVerifiedBuiltin ||
                    availableApps.some((a) => {
                      if (app.id && a.id && String(a.id) === String(app.id)) return true;
                      return !!app.name && normalizeAgentAppName(a.name || '') === slug;
                    });
                  const isUnavailable = !authAppsLoading && !isAvailable && !needsAuth;
                  const isRequired = isRequiredPresetApp(selectedPreset, app.name || '');
                  const appDisplayName = formatAppDisplayName(app.name || '');
                  return (
                  <Tooltip
                    key={`${app.name}-${i}`}
                    title={
                      isRequired
                        ? `${appDisplayName} is required by the ${selectedPreset?.label} skill and cannot be removed`
                        : isUnavailable
                          ? `${appDisplayName} is not configured or available in this workspace — click to view`
                          : needsAuth
                            ? `${appDisplayName} is not authenticated yet — click to set it up`
                            : `Open ${appDisplayName}`
                    }
                    arrow
                  >
                  <Box
                    onClick={!agentRequestLoading ? () => setAuthDrawerApp({ name: app.name, id: app.id || null }) : undefined}
                    sx={{
                      display: 'inline-flex', alignItems: 'center', gap: 0.5,
                      pl: 0.5,
                      pr: isPhone ? 0.375 : 0.75,
                      py: 0.25,
                      height: 28,
                      boxSizing: 'border-box',
                      lineHeight: 1,
                      borderRadius: 999,
                      bgcolor: isUnavailable
                        ? 'hsl(var(--severity-medium) / 0.08)'
                        : needsAuth
                          ? 'hsl(var(--severity-medium) / 0.12)'
                          : 'hsl(var(--muted) / 0.6)',
                      border: isUnavailable
                        ? '1px dashed hsl(var(--severity-medium) / 0.7)'
                        : needsAuth
                          ? '1px solid hsl(var(--severity-medium) / 0.55)'
                          : '1px solid transparent',
                      fontSize: '0.8rem',
                      color: 'hsl(var(--foreground))',
                      cursor: !agentRequestLoading ? 'pointer' : 'default',
                      transition: 'background-color 0.12s ease',
                      '&:hover': !agentRequestLoading ? {
                        bgcolor: isUnavailable
                          ? 'hsl(var(--severity-medium) / 0.16)'
                          : needsAuth
                            ? 'hsl(var(--severity-medium) / 0.18)'
                            : 'hsl(var(--muted) / 0.9)',
                      } : {},
                    }}
                  >
                    {(() => {
                      const appIcon =
                        app.icon ||
                        availableApps.find((a) => normalizeAgentAppName(a.name || '') === slug)?.icon ||
                        resolvedToolApps[slug]?.icon;
                      return (
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, flexShrink: 0 }}>
                          <AppFallbackIcon
                            name={app.name}
                            imageUrl={appIcon}
                            size={18}
                            style={{ borderRadius: 3, objectFit: 'contain' }}
                          />
                        </Box>
                      );
                    })()}
                    {!isPhone && (
                      <Typography
                        component="span"
                        sx={{
                          fontSize: '0.8rem',
                          mx: 0.25,
                          m: 0,
                          p: 0,
                          lineHeight: 1,
                          display: 'inline-block',
                          verticalAlign: 'middle',
                        }}
                      >
                        {formatAppDisplayName(app.name || '')}
                      </Typography>
                    )}
                    {needsAuth ? (
                      <Box
                        component="span"
                        sx={{
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          color: 'hsl(var(--destructive))',
                          bgcolor: 'hsl(var(--destructive) / 0.12)',
                          border: '1px solid hsl(var(--destructive) / 0.3)',
                          borderRadius: 1,
                          px: 0.6,
                          py: 0.1,
                          letterSpacing: '0.02em',
                          textTransform: 'uppercase',
                          ml: 0.5,
                          mr: 0.25,
                        }}
                      >
                        Missing auth
                      </Box>
                    ) : isUnavailable ? (
                      <Box
                        component="span"
                        sx={{
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          color: 'hsl(var(--severity-medium))',
                          bgcolor: 'hsl(var(--severity-medium) / 0.12)',
                          border: '1px solid hsl(var(--severity-medium) / 0.3)',
                          borderRadius: 1,
                          px: 0.6,
                          py: 0.1,
                          letterSpacing: '0.02em',
                          textTransform: 'uppercase',
                          ml: 0.5,
                          mr: 0.25,
                        }}
                      >
                        Unavailable
                      </Box>
                    ) : null}
                    {isRequired ? (
                      <LockIcon
                        size={11}
                        style={{ marginLeft: 2, marginRight: 2, opacity: 0.55 }}
                        color={'hsl(var(--muted-foreground))'}
                      />
                    ) : (
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); setChosenApps((prev) => prev.filter((_, idx) => idx !== i)); }}
                        disabled={agentRequestLoading}
                        sx={{ p: 0.125, color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--destructive))' }, '&.Mui-disabled': { opacity: 0.4 } }}
                      >
                        <CloseIcon size={12} />
                      </IconButton>
                    )}
                  </Box>
                  </Tooltip>
                  );
                })}
                {pendingCategories.map((req) => (
                  <Tooltip key={`cat-${req.value}`} title={`Requires input — pick a ${req.label}`} arrow>
                    <Box
                      onClick={!agentRequestLoading ? () => { setCategoryTarget(req.value); setAppSearchQuery(req.value); setAppSearchOpen(true); } : undefined}
                      sx={{
                        display: 'inline-flex', alignItems: 'center', gap: 0.5,
                        px: 1, py: 0.25,
                        height: 28,
                        boxSizing: 'border-box',
                        lineHeight: 1,
                        borderRadius: 999,
                        border: '1px dashed hsl(var(--severity-medium) / 0.7)',
                        bgcolor: 'hsl(var(--severity-medium) / 0.12)',
                        fontSize: '0.8rem',
                        color: 'hsl(var(--foreground))',
                        cursor: !agentRequestLoading ? 'pointer' : 'default',
                        transition: 'border-color 0.12s ease, background-color 0.12s ease',
                        '&:hover': !agentRequestLoading ? {
                          borderColor: 'hsl(var(--severity-medium))',
                          bgcolor: 'hsl(var(--severity-medium) / 0.2)',
                        } : {},
                      }}
                    >
                      <WarningIcon size={13} color={'hsl(var(--severity-medium))'} />
                      {req.label}
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); setPendingCategories((prev) => prev.filter((p) => p.value !== req.value)); }}
                        disabled={agentRequestLoading}
                        sx={{ p: 0.125, color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--destructive))' }, '&.Mui-disabled': { opacity: 0.4 } }}
                      >
                        <CloseIcon size={12} />
                      </IconButton>
                    </Box>
                  </Tooltip>
                ))}
              </Box>

            </Box>
            )}

            {/* Pre-run auth advisory — non-blocking. Lists chosen apps that
                are not yet authenticated and offers a one-click CTA to open
                the app drawer to set them up. The agent can still run
                without these — Shuffle will request auth mid-run if needed. */}
            {!hideAppPicker && (() => {
                        if (authAppsLoading) return null;
              const unauthed = chosenApps.filter((a) => {
                const slug = normalizeAgentAppName(a.name || '');
                return appRequiresAuthentication(slug) && !isAppAuthenticated(a.name || '', a.id || null);
              });
              if (unauthed.length === 0) return null;
              return (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: -0.5 }}>
                  <Box sx={{
                    display: 'inline-flex', alignItems: 'center', gap: 1,
                    px: 1.25, py: 0.5,
                    borderRadius: 999,
                    border: '1px solid hsl(var(--severity-medium) / 0.45)',
                    bgcolor: 'hsl(var(--severity-medium) / 0.08)',
                    fontSize: '0.75rem',
                    color: 'hsl(var(--foreground))',
                    maxWidth: '100%',
                  }}>
                    <WarningIcon size={14} color={'hsl(var(--severity-medium))'} />
                    <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                      {unauthed.length === 1
                        ? `${unauthed[0].name.replace(/_/g, ' ')} is not authenticated.`
                        : `${unauthed.length} apps are not authenticated.`}
                    </Typography>
                    <Box
                      component="button"
                      type="button"
                      onClick={() => setAuthDrawerApp({ name: unauthed[0].name, id: unauthed[0].id || null })}
                      sx={{
                        all: 'unset', cursor: 'pointer',
                        fontSize: '0.75rem', fontWeight: 600,
                        color: 'hsl(var(--primary))',
                        textTransform: 'capitalize',
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      Set up {unauthed[0].name.replace(/_/g, ' ')} →
                    </Box>
                  </Box>
                </Box>
              );
            })()}


            {pollWarning && !error && (
              <Box sx={{
                width: '100%', p: 1.5, borderRadius: 1.5,
                display: 'flex', alignItems: 'center', gap: 1,
                border: '1px solid hsl(var(--warning, 38 92% 50%) / 0.4)',
                bgcolor: 'hsl(var(--warning, 38 92% 50%) / 0.08)',
                color: 'hsl(var(--warning, 38 92% 50%))',
                fontSize: '0.8rem',
              }}>
                <WarningIcon size={14} style={{ flexShrink: 0 }} />
                {pollWarning}
              </Box>
            )}
            {error && (
              <Box sx={{
                width: '100%', p: 1.5, borderRadius: 1.5,
                border: '1px solid hsl(var(--destructive) / 0.4)',
                bgcolor: 'hsl(var(--destructive) / 0.08)',
                color: 'hsl(var(--destructive))',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1.5,
              }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>{error}</Box>
                {/auth required|log in|401/i.test(error) && (
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        const returnUrl = window.location.pathname + window.location.search;
                        window.location.href = `/login?view=${encodeURIComponent(returnUrl)}`;
                      }
                    }}
                    sx={{
                      textTransform: 'none',
                      fontSize: '0.75rem',
                      py: 0.3,
                      px: 1,
                      minHeight: 0,
                      borderRadius: 1,
                      bgcolor: 'hsl(var(--destructive))',
                      color: 'hsl(var(--destructive-foreground, var(--background)))',
                      '&:hover': {
                        bgcolor: 'hsl(var(--destructive) / 0.9)',
                      },
                      flexShrink: 0,
                    }}
                  >
                    Log In
                  </Button>
                )}
              </Box>
            )}
          </Box>
        ) : (
          <Box sx={{ pb: sidebarLayout ? 1.5 : '200px' }}>
            {/* Status row */}
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 2,
              p: 2,
              borderRadius: 2,
              border: '1px solid hsl(var(--border))',
              bgcolor: 'hsl(var(--card))',
              mb: 2,
            }}>
              <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 28, height: 28, borderColor: 'hsl(var(--border))', fontSize: '0.7rem' } }}>
                {(() => {
                  // When viewing a real run, `allowed_actions` on the agent is
                  // authoritative — even if it's a non-app entry like ["API"]
                  // that parses to zero apps, do NOT fall back to the picker's
                  // built-in defaults (`http`, `shuffle_tools`), which would
                  // misrepresent what the run was actually allowed to do.
                  const hasAllowed = Array.isArray((agentData as any)?.allowed_actions)
                    && ((agentData as any).allowed_actions as unknown[]).length > 0;
                  const list = hasAllowed ? executionApps : chosenApps;
                  return list;
                })().map((app, i) => {
                  const slug = normalizeAgentAppName(app.name || '');
                  const appNeedsAuth =
                    !authAppsLoading &&
                    appRequiresAuthentication(slug) &&
                    !isAppAuthenticated(app.name || '', (app as any).id || null);
                  const appIcon =
                    app.icon ||
                    availableApps.find((a) => normalizeAgentAppName(a.name || '') === slug)?.icon ||
                    resolvedToolApps[slug]?.icon;
                  return (
                    <Tooltip
                      key={i}
                      title={
                        appNeedsAuth
                          ? `${formatAppDisplayName(app.name || '')} — Missing authentication (Click to connect)`
                          : formatAppDisplayName(app.name || '')
                      }
                    >
                      <Box
                        onClick={() => setAuthDrawerApp({ name: app.name, id: (app as any).id || null })}
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 24,
                          height: 24,
                          borderRadius: '6px',
                          overflow: 'hidden',
                          bgcolor: 'hsl(var(--muted))',
                          cursor: 'pointer',
                          transition: 'transform 0.15s ease, border-color 0.15s ease',
                          border: appNeedsAuth ? '2px solid hsl(var(--destructive)) !important' : 'none',
                          boxShadow: appNeedsAuth ? '0 0 0 1px hsl(var(--destructive) / 0.4)' : 'none',
                          '&:hover': { transform: 'scale(1.08)', borderColor: 'hsl(var(--primary)) !important' },
                        }}
                      >
                        <AppFallbackIcon
                          name={app.name}
                          imageUrl={appIcon}
                          size={24}
                          style={{ borderRadius: 6, objectFit: 'contain' }}
                        />
                      </Box>
                    </Tooltip>
                  );
                })}
              </AvatarGroup>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {extractCleanDisplayPrompt(agentData?.original_input) || actionInput || 'Agent run'}
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.25 }}>
                  <span>Status: {execution?.status || agentData?.status || '—'} · {execution?.execution_id?.slice(0, 8) || ''}</span>
                  {pendingAuthApps.map((a) => (
                    <Box
                      key={a.appName}
                      component="span"
                      onClick={() => setAuthDrawerApp({ name: a.appName, id: a.appId })}
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        px: 0.75,
                        py: 0.15,
                        borderRadius: 1,
                        bgcolor: 'hsl(var(--destructive) / 0.12)',
                        border: '1px solid hsl(var(--destructive) / 0.35)',
                        color: 'hsl(var(--destructive))',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textTransform: 'none',
                        '&:hover': { bgcolor: 'hsl(var(--destructive) / 0.2)' },
                      }}
                    >
                      Missing Auth: {formatAppDisplayName(a.appName)} — Connect
                    </Box>
                  ))}
                </Typography>
              </Box>
              <AgentAttachmentsButton attachments={llmImageAttachments} />
              {(() => {
                const topStatus = resolveRunStatus(execution?.status, agentData?.status);
                const topRunning = !!(execution?.execution_id || agentRequestLoading) && !['FINISHED', 'FAILURE', 'ABORTED', 'CANCELLED', 'CANCELED'].includes(topStatus);
                return topRunning ? (
                  <Tooltip title={abortLoading ? 'Aborting…' : execution?.execution_id ? 'Abort this execution' : 'Cancel and return to Start'}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={abortLoading}
                        onClick={safeHandler('Cancel run', abortAgent)}
                        sx={{
                          color: 'hsl(var(--muted-foreground))',
                          '&:hover': { color: 'hsl(var(--destructive))', bgcolor: 'hsl(var(--muted))' },
                        }}
                      >
                        {abortLoading ? <CircularProgress size={16} sx={{ color: 'hsl(var(--destructive))' }} /> : <StopCircleIcon size={18} />}
                      </IconButton>
                    </span>
                  </Tooltip>

                ) : null;
              })()}
              <Tooltip title={rerunAgentPending ? 'Rerun starting…' : 'Rerun with the same prompt and tools'}>
                <span>
                  <IconButton
                    size="small"
                    disabled={agentRequestLoading || rerunAgentPending}
                    onClick={safeHandler('Rerun', rerunAgent)}
                    sx={{
                      color: rerunAgentPending ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                      '&:hover': { color: 'hsl(var(--primary))', bgcolor: 'hsl(var(--muted))' },
                    }}
                  >
                    {rerunAgentPending
                      ? <CircularProgress size={16} sx={{ color: 'hsl(var(--primary))' }} />
                      : <RestartAltIcon size={18} />}
                  </IconButton>
                </span>
              </Tooltip>
              {execution?.execution_id && (() => {
                // If we are already rendering this run's data, the execution is
                // by definition available — never claim otherwise. Only when we
                // have an id but no data at all AND the probe says "no" do we
                // disable the button.
                const hasRenderedRun = Boolean(
                  (Array.isArray(execution.results) && execution.results.length > 0) ||
                  execution.workflow ||
                  execution.status,
                );
                const canOpenRun = hasRenderedRun || runExplorerAvailable !== 'no';
                const tooltipTitle = canOpenRun
                  ? 'View full execution'
                  : 'Execution details are no longer available for this run';

                return (
                  <Tooltip title={tooltipTitle}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={!canOpenRun}
                        onClick={() => {
                          if (!canOpenRun) return;
                          try {
                            window.dispatchEvent(new CustomEvent('workflow-run:open', {
                              detail: {
                                executionId: execution.execution_id,
                                authorization: execution.authorization,
                              },
                            }));
                          } catch { /* noop */ }
                        }}
                        sx={{
                          color: 'hsl(var(--muted-foreground))',
                          '&:hover': { color: 'hsl(var(--primary))', bgcolor: 'hsl(var(--muted))' },
                        }}
                      >
                        <PanelRightOpenIcon size={18} />
                      </IconButton>
                    </span>
                  </Tooltip>
                );
              })()}
            </Box>

            {pollWarning && !error && (
              <Box sx={{
                p: 1.5, borderRadius: 1.5, mb: 2,
                display: 'flex', alignItems: 'center', gap: 1,
                border: '1px solid hsl(var(--warning, 38 92% 50%) / 0.4)',
                bgcolor: 'hsl(var(--warning, 38 92% 50%) / 0.08)',
                color: 'hsl(var(--warning, 38 92% 50%))',
                fontSize: '0.8rem',
              }}>
                <WarningIcon size={14} style={{ flexShrink: 0 }} />
                {pollWarning}
              </Box>
            )}
            {error && (
              <Box sx={{
                p: 1.5, borderRadius: 1.5, mb: 2,
                border: '1px solid hsl(var(--destructive) / 0.4)',
                bgcolor: 'hsl(var(--destructive) / 0.08)',
                color: 'hsl(var(--destructive))',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 1.5,
              }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {error}
                  {isAiAuthIssue && (
                    <Box sx={{ mt: 1.5 }}>
                      <AiAuthSuggestion onOpenLocalLlm={openLocalLlmArea} />
                    </Box>
                  )}
                </Box>
                {/auth required|log in|401/i.test(error) && (
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        const returnUrl = window.location.pathname + window.location.search;
                        window.location.href = `/login?view=${encodeURIComponent(returnUrl)}`;
                      }
                    }}
                    sx={{
                      textTransform: 'none',
                      fontSize: '0.75rem',
                      py: 0.3,
                      px: 1,
                      minHeight: 0,
                      borderRadius: 1,
                      bgcolor: 'hsl(var(--destructive))',
                      color: 'hsl(var(--destructive-foreground, var(--background)))',
                      '&:hover': {
                        bgcolor: 'hsl(var(--destructive) / 0.9)',
                      },
                      flexShrink: 0,
                    }}
                  >
                    Log In
                  </Button>
                )}
              </Box>
            )}

            {/* Shared diagnosis banner — same component used by drawers and
                incident pages, so the user sees identical reasoning here. */}
            <AgentRunDiagnosisBanner
              run={execution?.results?.length ? execution : agentData}
              sx={{ px: 1.5, pb: 0, mb: 2 }}
              executionId={execution?.execution_id}
              onFocusContinue={() => {
                // Focus and briefly highlight the continuation form so the user
                // knows where to continue the run after a failed decision.
                const el = continuationInputRef.current;
                if (el) {
                  el.focus();
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                setContinueHighlighted(true);
                window.setTimeout(() => {
                  setContinueHighlighted(false);
                }, 2800);
              }}
              onJumpToEvidence={(decisionIndex) => {
                // Locate the timeline row for the offending decision and
                // expand + scroll to it on the detailed view, regardless of
                // whether the user is currently on Simple or Detailed.
                const dec = (agentData?.decisions || [])[decisionIndex];
                let rowIndex = -1;
                if (dec) {
                  rowIndex = timeline.findIndex((it) => it.details === dec);
                  if (rowIndex < 0 && dec.run_details?.id) {
                    rowIndex = timeline.findIndex(
                      (it) => (it.details as any)?.run_details?.id === dec.run_details?.id
                    );
                  }
                }
                // Fall back to the agent row (0) if we cannot resolve.
                const targetIndex = rowIndex >= 0 ? rowIndex : 0;
                setOpenIndexes((prev) => {
                  const next = new Set(prev);
                  next.add(targetIndex);
                  return next;
                });
                goToTab('detailed');
                // Pulse the row + its output box so the user can see exactly
                // which step the diagnosis was pulled from. Auto-clears after
                // a couple seconds; re-clicking restarts the pulse.
                setHighlightedIndex(targetIndex);
                window.setTimeout(() => {
                  setHighlightedIndex((curr) => (curr === targetIndex ? null : curr));
                }, 2800);
                // Wait for the detailed view to mount, then scroll the row
                // into view. requestAnimationFrame x2 ensures layout has
                // settled after the tab switch.
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    try {
                      const el = document.querySelector(
                        `[data-timeline-index="${targetIndex}"]`
                      ) as HTMLElement | null;
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    } catch {}
                  });
                });
              }}
            />


            {/* Simple summary view */}
            {viewMode === 'simple' && (
              <Box sx={{
                borderRadius: 2,
                border: '1px solid hsl(var(--border))',
                bgcolor: 'hsl(var(--card))',
                p: 2.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
              }}>
                {(() => {
                  const status = (execution?.status || agentData?.status || 'EXECUTING').toUpperCase();
                  const decisionCount = (agentData?.decisions || []).length;
                  const isRunning = optimisticRunning || !['FINISHED', 'FAILURE', 'ABORTED', 'CANCELLED', 'CANCELED'].includes(status);
                  const rawStartedAt = agentData?.started_at || execution?.started_at || 0;
                  // Normalize: backend may return Unix milliseconds (UnixMillis) or seconds.
                  const startedAtSec = rawStartedAt > 1e12 ? Math.floor(rawStartedAt / 1000) : rawStartedAt;
                  // Prefer our locally-captured start while the run is in
                  // progress — the backend's `started_at` is sometimes
                  // restamped on every poll, which made the counter look
                  // frozen at "1s". Once finished, prefer the backend value
                  // so the displayed total matches the recorded run.
                  const effectiveStart = isRunning
                    ? (localRunStart || startedAtSec || 0)
                    : (startedAtSec || localRunStart || 0);
                  let durationSec: number | null = null;
                  if (isRunning && effectiveStart) {
                    durationSec = Math.max(0, nowTick - effectiveStart);
                  } else if (totalDuration && totalDuration > 0) {
                    durationSec = totalDuration;
                  }
                  // Detect a pending ASK decision (agent waiting on a user answer)
                  const pendingAsk = (agentData?.decisions || []).slice().reverse().find((d) => {
                    const isAsk = isAskDecision(d, d.category);
                    const st = (d.run_details?.status || '').toUpperCase();
                    return isAsk && (st === 'RUNNING' || st === 'WAITING');
                  });
                  const pendingQuestions: { question: string; index: number }[] = [];
                  if (pendingAsk) {
                    for (const f of pendingAsk.fields || []) {
                      const questionText = getQuestionFieldText(f, pendingAsk, pendingAsk.category);
                      if (questionText) {
                        pendingQuestions.push({ question: questionText, index: pendingQuestions.length + 1 });
                      }
                    }
                    // Fallback to reason/description when no field text.
                    if (pendingAsk && !pendingQuestions.length) {
                      const fallback = getAskFallbackQuestion(pendingAsk);
                      if (fallback) pendingQuestions.push({ question: fallback, index: 1 });
                    }
                  }
                  const pendingAnswered = pendingQuestions.every((q) => questionAnswers[q.question]?.value);

                  return (
                    <>
                      <RunFinishedSummary
                        status={status}
                        isRunning={isRunning}
                        finishAnswer={finishAnswer}
                        finishNote={finishNote}
                        raw={finishAnswerRaw}
                        onToggleRaw={() => setFinishAnswerRaw((v) => !v)}
                        decisionCount={decisionCount}
                        durationSec={durationSec}
                        showMeta
                        bottomContent={aiAuthSuggestionNode}
                      >
                        {/* Discovery: keep surfacing the schedule intent and the
                            apps this prompt needs, now that the run finished. */}
                        {!isRunning && postRunDiscovery}

                      </RunFinishedSummary>

                      {!finishAnswer && pendingAsk && pendingQuestions.length > 0 ? (

                        (() => {
                          const trySimpleSubmit = () => {
                            if (agentRequestLoading) return;
                            if (!pendingAnswered) {
                              setSimpleSubmitAttempted(true);
                              return;
                            }
                            if (pendingAsk.run_details?.id) {
                              submitQuestions(pendingAsk.run_details.id, questionAnswers);
                            }
                          };
                          return (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                              {pendingAsk?.reason && (
                                <Box sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.4 }}>
                                  {truncateReason(pendingAsk.reason)}
                                </Box>
                              )}
                              {pendingQuestions.map((q, qi) => {
                                const value = questionAnswers[q.question]?.value || '';
                                const isMissing = simpleSubmitAttempted && !value;
                                return (
                                  <Box key={qi}>
                                    <Box sx={{ fontSize: '0.9rem', color: 'hsl(var(--foreground))', mb: 1, '& p': { my: 0.5 } }}>
                                      <ShuffleMarkdown>{normalizeMarkdown(q.question)}</ShuffleMarkdown>
                                    </Box>
                                    <TextField
                                      fullWidth
                                      multiline
                                      minRows={2}
                                      placeholder="Your answer here…"
                                      value={value}
                                      error={isMissing}
                                      helperText={isMissing ? 'Please answer this question' : undefined}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setQuestionAnswers((prev) => ({
                                          ...prev,
                                          [q.question]: { index: qi, value: v },
                                        }));
                                      }}
                                      onKeyDown={(e) => {
                                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                          e.preventDefault();
                                          trySimpleSubmit();
                                        }
                                      }}
                                      size="small"
                                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'hsl(var(--background))' } }}
                                    />
                                  </Box>
                                );
                              })}
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Tooltip title={!pendingAnswered ? 'Please answer all questions first' : ''} placement="top" arrow>
                                  <span>
                                    <Button
                                      variant="contained"
                                      size="small"
                                      disabled={agentRequestLoading || !pendingAnswered}
                                      onClick={trySimpleSubmit}
                                      startIcon={agentRequestLoading ? <CircularProgress size={14} sx={{ color: 'hsl(var(--primary-foreground))' }} /> : undefined}
                                    >
                                      {agentRequestLoading ? 'Submitting…' : 'Submit'}
                                    </Button>
                                  </span>
                                </Tooltip>
                                {pendingAsk.run_details?.id && getFormUrl(pendingAsk.run_details.id) && (
                                  <Tooltip title="Answer in the Form UI" placement="right">
                                    <IconButton
                                      size="small"
                                      onClick={() => {
                                        const url = getFormUrl(pendingAsk.run_details!.id!);
                                        if (url) window.open(url, '_blank', 'noopener,noreferrer');
                                      }}
                                      sx={{ color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--primary))' } }}
                                    >
                                      <OpenInNewIcon size={18} />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Box>
                            </Box>
                          );
                        })()
                      ) : !finishAnswer && isRunning ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                          <Loader2Icon
                            size={14}
                            className="animate-spin"
                            style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}
                          />
                          <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--muted-foreground))' }}>
                            Agent is running…
                          </Typography>
                        </Box>
                      ) : !finishAnswer ? (
                        <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--muted-foreground))' }}>
                          No final answer returned.
                        </Typography>
                      ) : null}

                      <Box>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setViewMode('detailed')}
                          sx={{ color: 'hsl(var(--primary))', textTransform: 'none', px: 0 }}
                        >
                          {isRunning ? 'View live detailed timeline →' : 'View detailed timeline →'}
                        </Button>
                      </Box>
                    </>
                  );
                })()}
              </Box>
            )}

            {/* Detailed timeline view */}
            {viewMode === 'detailed' && (() => {
              const detailedStatus = resolveRunStatus(execution?.status, agentData?.status) || 'EXECUTING';
              const detailedIsRunning = optimisticRunning
                || !['FINISHED', 'FAILURE', 'ABORTED', 'CANCELLED', 'CANCELED'].includes(detailedStatus);


              const detailedRunFinished = !detailedIsRunning;
              
              return (
              <Box sx={{
                borderRadius: 2,
                border: '1px solid hsl(var(--border))',
                bgcolor: 'hsl(var(--card))',
                overflow: 'hidden',
              }}>

              {timeline.length === 0 || (timeline.length === 1 && agentRequestLoading) ? (
                <Box sx={{ p: 4, textAlign: 'center', color: 'hsl(var(--muted-foreground))', fontSize: '0.85rem' }}>
                  <CircularProgress size={20} sx={{ mb: 1 }} />
                  <Typography sx={{ fontSize: '0.85rem' }}>Waiting for agent response…</Typography>
                </Box>
              ) : (
                <>
                  {(() => {
                    const rerunIdx = rerunningDecisionId
                      ? timeline.findIndex(
                          (t) => (t as any)?.details?.run_details?.id === rerunningDecisionId,
                        )
                      : -1;
                    return timeline.map((item, i) => (
                      <TimelineRow
                        key={i}
                        item={item}
                        index={i}
                        open={openIndexes.has(i)}
                        onToggle={() => toggleOpen(i)}
                        appsById={appsById}
                        totalDuration={totalDuration}
                        originalStartTime={originalStartTime}
                        maxWidth={210}
                        questionAnswers={questionAnswers}
                        setQuestionAnswers={setQuestionAnswers}
                        onSubmitQuestions={submitQuestions}
                        onRerunAgent={safeHandler('Rerun', rerunAgent)}
                        onRerunDecision={rerunDecision}
                        agentRequestLoading={agentRequestLoading}
                        getFormUrl={getFormUrl}
                        runFinished={detailedRunFinished}
                        onAuthenticateApp={(name, id) => setAuthDrawerApp({ name, id })}
                        onRefreshAuthenticatedApps={() => { loadAuthenticatedApps(); }}
                        isAppAuthenticated={isAppAuthenticated}
                        authAppsLoading={authAppsLoading}
                        highlight={highlightedIndex === i}
                        rerunningDecisionId={rerunningDecisionId}
                        dimmedByRerun={rerunIdx >= 0 && i > rerunIdx}
                        optimisticContinueText={optimisticContinueText}
                      />
                    ));
                  })()}
                  {optimisticRunning && timeline[timeline.length - 1]?.category !== 'processing' && (
                    <TimelineRow
                      key="optimistic-processing"
                      item={{
                        label: '',
                        type: 'decision',
                        category: 'processing',
                        status: 'EXECUTING',
                        start_time: Math.floor((optimisticContinue?.at || Date.now()) / 1000),
                        end_time: liveNowSec,
                        details: undefined as any,
                      }}
                      index={timeline.length}
                      open={false}
                      onToggle={() => {}}
                      appsById={appsById}
                      totalDuration={totalDuration}
                      originalStartTime={originalStartTime}
                      maxWidth={210}
                      questionAnswers={questionAnswers}
                      setQuestionAnswers={setQuestionAnswers}
                      onSubmitQuestions={submitQuestions}
                      onRerunAgent={safeHandler('Rerun', rerunAgent)}
                      onRerunDecision={rerunDecision}
                      agentRequestLoading={agentRequestLoading}
                      getFormUrl={getFormUrl}
                      runFinished={false}
                      onAuthenticateApp={(name, id) => setAuthDrawerApp({ name, id })}
                      onRefreshAuthenticatedApps={() => { loadAuthenticatedApps(); }}
                      isAppAuthenticated={isAppAuthenticated}
                      authAppsLoading={authAppsLoading}
                    />
                  )}

                  {/* Sentinel used to auto-follow the live timeline */}
                  <Box ref={timelineEndRef} sx={{ height: 1, scrollMarginBottom: 24 }} />



                  {detailedRunFinished && (
                    <Box sx={{
                      borderTop: '1px solid hsl(var(--border))',
                      p: 2.5,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1.5,
                      bgcolor: 'hsl(var(--muted) / 0.2)',
                    }}>
                      <RunFinishedSummary
                        status={detailedStatus}
                        isRunning={false}
                        finishAnswer={finishAnswer}
                        finishNote={finishNote}
                        raw={finishAnswerRaw}
                        onToggleRaw={() => setFinishAnswerRaw((v) => !v)}
                        bottomContent={aiAuthSuggestionNode}
                      >
                        {postRunDiscovery}
                      </RunFinishedSummary>


                      {hasInFlightDecision && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                            One step did not finish.
                          </Typography>
                          {stuckDecisionId && (
                            <Button
                              size="small"
                              variant="text"
                              disableRipple
                              disabled={agentRequestLoading || rerunningDecisionId === stuckDecisionId}
                              onClick={safeHandler('Rerun step', () => rerunDecision(stuckDecision))}
                              startIcon={
                                rerunningDecisionId === stuckDecisionId ? (
                                  <CircularProgress size={12} sx={{ color: 'hsl(var(--muted-foreground))' }} />
                                ) : (
                                  <RestartAltIcon size={14} />
                                )
                              }
                              sx={{
                                textTransform: 'none',
                                fontSize: '0.75rem',
                                color: 'hsl(var(--muted-foreground))',
                                p: 0,
                                minWidth: 0,
                                '&:hover': { color: 'hsl(var(--primary))', bgcolor: 'transparent' },
                                '& .MuiButton-startIcon': { mr: 0.5 },
                              }}
                            >
                              {rerunningDecisionId === stuckDecisionId ? 'Rerunning…' : 'Rerun step'}
                            </Button>
                          )}
                          <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                            or
                          </Typography>
                          <Box
                            component="span"
                            role="button"
                            tabIndex={0}
                            onClick={() => { continuationInputRef.current?.focus(); }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                continuationInputRef.current?.focus();
                              }
                            }}
                            sx={{
                              fontSize: '0.75rem',
                              color: 'hsl(var(--muted-foreground))',
                              textDecoration: 'underline',
                              cursor: 'pointer',
                              '&:hover': { color: 'hsl(var(--primary))' },
                            }}
                          >
                            continue below
                          </Box>
                        </Box>
                      )}



                    </Box>

                  )}
                </>
              )}
            </Box>
              );
            })()}

            {/* Continuation form (after a finish decision) - in standard layout */}
            {!sidebarLayout && continuationElement && (
              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
                {continuationElement}
              </Box>
            )}
          </Box>
        )}

        {/* Image preview dialog */}
        <Dialog
          open={Boolean(previewImage)}
          onClose={() => setPreviewImage(null)}
          maxWidth="lg"
          slotProps={{
            paper: {
              sx: {
                bgcolor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 3,
                p: 1,
                maxWidth: 'min(90vw, 900px)',
              },
            },
          }}
        >
          {previewImage && (
            <Box sx={{ position: 'relative' }}>
              <IconButton
                onClick={() => setPreviewImage(null)}
                sx={{
                  position: 'absolute', top: 8, right: 8,
                  bgcolor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))',
                  '&:hover': { bgcolor: 'hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))' },
                }}
                aria-label="Close preview"
              >
                <CloseIcon size={18} />
              </IconButton>
              <Box
                component="img"
                src={previewImage.dataUrl}
                alt={previewImage.name}
                sx={{ width: '100%', height: 'auto', maxHeight: '80vh', borderRadius: 2, display: 'block' }}
              />
              <Typography sx={{ mt: 1, fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
                {previewImage.name}
              </Typography>
            </Box>
          )}
        </Dialog>

        <AppSearchDrawer

          open={appSearchOpen}
          initialQuery={appSearchQuery || undefined}
          onClose={() => { setAppSearchOpen(false); setAppSearchQuery(''); setCategoryTarget(null); }}
          title={appPickerTitle}
          subtitle={appPickerSubtitle}
          multiSelect
          selectedApps={chosenApps.map((a) => ({ name: a.name, id: a.id || null, icon: a.icon }))}
          globalUrl={apiBaseUrl}
          theme={theme}
          colorMode={colorMode}
          onSelectionChange={(next) => {
            const added = next.length > chosenApps.length;
            // Dedupe by normalized name so an app seeded from a previous run
            // (name-only, no Algolia id) cannot linger as a second, invisible
            // entry that keeps the picker row highlighted after deselecting.
            const slug = (s?: string) => (s || '').toLowerCase().replace(/[\s_-]+/g, '');
            const seen = new Set<string>();
            const mapped = next
              .map((app) => {
                const known = availableApps.find(
                  (a) => slug(a.name) === slug(app.name),
                );
                return {
                  name: app.name,
                  icon: app.icon || known?.icon,
                  id: app.id || known?.id || undefined,
                };
              })
              .filter((app) => {
                const key = slug(app.name);
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
              });
            setChosenApps(mapped);
            // Picking an app for a category requirement resolves that chip
            // and closes the picker.
            if (categoryTarget && added) {
              setPendingCategories((prev) => prev.filter((p) => p.value !== categoryTarget));
              setCategoryTarget(null);
              setAppSearchQuery('');
              setAppSearchOpen(false);
            }
          }}
        />

        <AppDetailDrawer
          open={!!authDrawerApp}
          onClose={() => setAuthDrawerApp(null)}
          onRefresh={() => { loadAuthenticatedApps(); }}
          appName={authDrawerApp?.name || null}
          appId={authDrawerApp?.id || null}
          activeOrgId={orgId || null}
          globalUrl={apiBaseUrl}
          theme={theme}
          colorMode={colorMode}
        />
      </Box>

      {/* Pinned Bottom Footer in Sidebar Layout */}
      {sidebarLayout && continuationElement && (
        <Box
          sx={{
            flexShrink: 0,
            width: '100%',
            px: 1.5,
            pt: 1,
            pb: 1.5,
            borderTop: '1px solid hsl(var(--border) / 0.5)',
            bgcolor: 'hsl(var(--card))',
            zIndex: 10,
          }}
        >
          {continuationElement}
        </Box>
      )}
    </Box>
  );
};

export default AgentUI;
