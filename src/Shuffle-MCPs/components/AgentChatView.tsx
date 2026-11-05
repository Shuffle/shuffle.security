/**
 * AgentChatView — the "Chat" tab of AgentUI.
 *
 * Shows an agent run as a conversation: the user's messages, the steps the
 * agent took (collapsed once done), its questions with one-click replies, and
 * its answers. It renders the run AgentUI already polls and uses AgentUI's own
 * actions to start runs, answer questions and continue finished runs, so the
 * Start / Simple / Detailed tabs see exactly the same run.
 *
 * Workflow edits are announced with AGENT_WORKFLOW_CHANGED_EVENT and node
 * links with AGENT_FOCUS_NODE_EVENT, so a host that shows the workflow can
 * reload and highlight it. Workflow runs the agent starts are shown from the
 * execution itself, not the agent's words, and announced with
 * AGENT_OPEN_EXECUTION_EVENT so the host can open its own run view. Without a
 * listener the chat still works fully.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Button, ButtonBase, CircularProgress, IconButton, InputBase, MenuItem, Popover, Select, Tooltip, Typography } from '@mui/material';
import { Bookmark, History, MessageCirclePlus, Undo2 } from 'lucide-react';
import ShuffleMarkdown from '@/Shuffle-Core/components/Markdown';
import { getRunTitle, getTimeAgo } from '@/Shuffle-MCPs/components/AgentActivityList';
import { searchAgentActivity, type AgentRun } from '@/Shuffle-MCPs/agentActivity';
import { toast } from '@/Shuffle-Core/toast';
import {
  AGENT_FOCUS_NODE_EVENT,
  AGENT_OPEN_EXECUTION_EVENT,
  AGENT_WORKFLOW_CHANGED_EVENT,
  ASK_FIRST_PREFIX,
  asksForApproval,
  buildChatThread,
  describeStep,
  formatDuration,
  getAnswersFromModelReplies,
  getAppsNeedingAuth,
  getCalloutTone,
  getChangedNodeIds,
  getChangesAfter,
  getLatestChanges,
  getDecisionOutput,
  getFailureReason,
  getNodeLabels,
  getField,
  getQuickReplies,
  getResult,
  getRunIdleSeconds,
  getRunNodes,
  getStatusTone,
  getStepDuration,
  getStepStatus,
  getWorkflowProblems,
  getWorkflowRuns,
  isAction,
  isAppliedRevert,
  isAsk,
  isFinish,
  pickRevisionBefore,
  parseJson,
  toSeconds,
  type AgentFocusNodeDetail,
  type AgentOpenExecutionDetail,
  type BackendJson,
  type AgentWorkflowChangedDetail,
  type AgentTone,
  type ChatDecision,
  type ChatThreadItem,
  type ChatWorkflowRun,
  stripModePrefix,
} from '@/Shuffle-MCPs/agentChat';

// Colored alerts and status badges for the agent's replies only. Passed to ShuffleMarkdown
// where agent text renders, so the shared renderer and its other callers stay unchanged.
// --warning isn't defined in every host theme, hence the fallback.
const AGENT_TONES: Record<AgentTone, { color: string; background: string; label: string }> = {
  error: { color: 'hsl(var(--destructive))', background: 'hsl(var(--destructive) / 0.1)', label: 'Error' },
  warning: { color: 'hsl(var(--warning, 38 92% 50%))', background: 'hsl(var(--warning, 38 92% 50%) / 0.12)', label: 'Warning' },
  success: { color: 'hsl(142 71% 45%)', background: 'hsl(142 71% 45% / 0.12)', label: 'Success' },
  note: { color: 'hsl(var(--primary))', background: 'hsl(var(--primary) / 0.08)', label: 'Note' },
};

const isLineBreak = (node: React.ReactNode) => React.isValidElement(node) && node.type === 'br';
const isBlank = (node: React.ReactNode) => typeof node === 'string' && !node.trim();

/** "> [!ERROR] ..." becomes a colored callout; any other quote renders as before. */
const AgentCallout = ({ children, node: _node, ...props }: { children?: React.ReactNode; node?: unknown }) => {
  const items = React.Children.toArray(children);
  const firstIndex = items.findIndex((item) => React.isValidElement(item));
  const first = items[firstIndex] as React.ReactElement<{ children?: React.ReactNode }> | undefined;
  const parts = first ? React.Children.toArray(first.props.children) : [];
  const callout = typeof parts[0] === 'string' ? getCalloutTone(parts[0]) : null;
  if (!first || !callout) return <blockquote {...props}>{children}</blockquote>;

  // Drop the marker, and the line break the agent usually puts after it
  let rest = callout.rest ? [callout.rest, ...parts.slice(1)] : parts.slice(1);
  while (rest.length && (isLineBreak(rest[0]) || isBlank(rest[0]))) rest = rest.slice(1);
  const tone = AGENT_TONES[callout.tone];
  return (
    <Box
      role="note"
      sx={{ my: 1, px: 1.5, py: 1, borderRadius: 1, borderLeft: `3px solid ${tone.color}`, backgroundColor: tone.background, '& > *:last-child': { mb: 0 } }}
    >
      <Box sx={{ color: tone.color, fontWeight: 600, fontSize: '0.85em', mb: 0.25 }}>{tone.label}</Box>
      {rest.length > 0 && React.cloneElement(first, {}, ...rest)}
      {items.slice(firstIndex + 1)}
    </Box>
  );
};

/** Inline `FAILED`, `HTTP 400`, `SUCCESS` ... get their color; other inline code is untouched. */
const AgentStatusCode = ({ children, node: _node, ...props }: { children?: React.ReactNode; node?: unknown; className?: string }) => {
  const tone = !props.className && typeof children === 'string' ? getStatusTone(children) : null;
  if (!tone) return <code {...props}>{children}</code>;
  const { color, background } = AGENT_TONES[tone];
  // Inline style, as the renderer's own `& code` rule is more specific than a class
  return <code {...props} style={{ color, backgroundColor: background, fontWeight: 600 }}>{children}</code>;
};

const agentMarkdownComponents = { blockquote: AgentCallout, code: AgentStatusCode };

const STALL_MS = 90 * 1000;
const RUN_POLL_MS = 3000;
const RUN_STUCK_SECONDS = 120;
const AUTH_WATCH_MS = 4000;
const MODE_STORAGE_KEY = 'shuffle-agent-chat-mode';

export interface AgentChatViewProps {
  /** The execution AgentUI is showing ({ execution_id, authorization, status, ... }). */
  execution: { execution_id?: string; authorization?: string; status?: string; workflow?: { id?: string } } | null;
  /** The parsed AI Agent result (decisions, output, original_input, llm_responses, ...). */
  agentData: Record<string, BackendJson>;
  /** True while the run is working, including right after the user replied. */
  isRunning: boolean;
  /** True while a request to start or answer is in flight. */
  busy: boolean;
  /** Live-update warning from AgentUI's poller, if any. */
  pollWarning?: string | null;
  error?: string | null;
  /** The workflow the agent works on, when known. Enables revert and canvas events. */
  workflowId?: string;
  placeholder?: string;
  /** Where to render the composer (AgentUI's pinned footer in sidebar layout). Inline when omitted. */
  composerContainer?: HTMLElement | null;
  /** Extra horizontal space on both sides of the conversation. Defaults to none. */
  contentPaddingX?: number;

  /** Where to render the bookmark, history and new chat buttons (the sidebar header). Above the chat when omitted. */
  headerActionsContainer?: HTMLElement | null;
  onStart: (text: string) => void | Promise<void>;
  /** Answers a question, approval or continuation, using AgentUI's submitQuestions shape. */
  onSubmit: (decisionId: string, answers: Record<string, BackendJson>, isContinuation?: boolean) => void | Promise<void>;
  onStop: () => void;
  /** True while a Stop request is in flight. */
  stopping?: boolean;
  onRefresh: () => void;
  isAppAuthenticated: (appName: string, appId?: string | null) => boolean;
  /** Opens the credentials flow for an app (AgentUI's app drawer, or the app page). */
  onAuthenticateApp: (app: { name: string; id: string; url?: string }) => void;
  onRefreshAuthenticatedApps: () => void;
  resolveUrl: (path: string) => string;
  resolveHeaders: () => Record<string, string>;
  /** Backend for the past chats list (the Agents page run list). */
  apiBaseUrl?: string;
  /** Opens an earlier agent run in this chat. Past chats are hidden without it. */
  onOpenRun?: (executionId: string, authorization?: string, status?: string) => void;
  /** Clears the current run so the next message starts a new one. */
  onNewChat?: () => void;
  /** Switches to the Timeline tab and highlights the exact decision (and operation, if any) that produced a change. */
  onFocusDecision?: (target: {
    decisionId?: string;
    decisionIndex?: number;
    operationIndex?: number;
    changeText?: string;
    nodeId?: string;
  }) => void;
}

// Bookmarks are kept in this browser: there is nothing for them on the backend yet. Each keeps
// its title, so the list works for chats older than the history fetches.
const BOOKMARKS_STORAGE_KEY = 'shuffle:agent_chat_bookmarks';
type ChatBookmark = { execution_id: string; authorization?: string; title: string; started_at: string; workflow_id?: string };

const readBookmarks = (): ChatBookmark[] => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(BOOKMARKS_STORAGE_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

const writeBookmarks = (bookmarks: ChatBookmark[]) => {
  try {
    window.localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
  } catch {
    // Storage blocked: the bookmark lasts until the page reloads
  }
};

const shortTimeAgo = (startedAt: string) => (startedAt ? getTimeAgo(startedAt).replace(' ago', '') : '');

const headerIconButtonSx = {
  color: 'hsl(var(--muted-foreground))',
  p: 0.75,
  borderRadius: '8px',
  '&:hover': { color: 'hsl(var(--foreground))', bgcolor: 'hsl(var(--muted))' },
  '&.Mui-disabled': { color: 'hsl(var(--muted-foreground) / 0.4)' },
};

export const readMode = (): 'auto' | 'ask' => {
  try {
    return window.localStorage.getItem(MODE_STORAGE_KEY) === 'ask' ? 'ask' : 'auto';
  } catch {
    return 'auto';
  }
};

const textSx = { fontSize: '0.8125rem', color: 'hsl(var(--foreground))', lineHeight: 1.55 };
const mutedSx = { fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' };
const linkButtonSx = {
  textTransform: 'none',
  fontSize: '0.75rem',
  color: 'hsl(var(--muted-foreground))',
  p: 0,
  minWidth: 0,
  '&:hover': { color: 'hsl(var(--foreground))', bgcolor: 'transparent' },
} as const;
const primaryActionButtonSx = {
  textTransform: 'none',
  fontSize: '0.75rem',
  minHeight: 0,
  py: 0.25,
  bgcolor: 'hsl(var(--foreground))',
  color: 'hsl(var(--background))',
  boxShadow: 'none',
  '&:hover': {
    bgcolor: 'hsl(var(--foreground) / 0.88)',
    boxShadow: 'none',
  },
  '&.Mui-disabled': {
    bgcolor: 'hsl(var(--muted))',
    color: 'hsl(var(--muted-foreground))',
  },
} as const;
const outlinedActionButtonSx = {
  textTransform: 'none',
  fontSize: '0.75rem',
  minHeight: 0,
  py: 0.25,
  borderColor: 'hsl(var(--border))',
  color: 'hsl(var(--foreground))',
  '&:hover': {
    borderColor: 'hsl(var(--foreground) / 0.4)',
    bgcolor: 'hsl(var(--muted) / 0.5)',
  },
} as const;
const replySx = {
  textTransform: 'none',
  fontSize: '0.75rem',
  borderRadius: 9999,
  px: 1.25,
  py: 0.25,
  minHeight: 0,
  color: 'hsl(var(--foreground))',
  borderColor: 'hsl(var(--border))',
} as const;

const statusLabel: Record<string, string> = { running: 'Running', waiting: 'Waiting', done: 'Done', failed: 'Failed' };
const runNodeLabel: Record<string, string> = { done: 'Done', failed: 'Failed', skipped: 'Skipped', running: 'Running', waiting: 'Waiting', 'not run': 'Not run' };

/** A workflow run the agent started, read from the execution itself. */
const RunCard: React.FC<{
  run: ChatWorkflowRun;
  onOpen?: () => void;
  resolveUrl: (path: string) => string;
  resolveHeaders: () => Record<string, string>;
}> = ({ run, onOpen, resolveUrl, resolveHeaders }) => {
  const [execution, setExecution] = useState<BackendJson>(null);
  const [failedToLoad, setFailedToLoad] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const runStatus = String(execution?.status || '').toUpperCase();
  const done = ['FINISHED', 'ABORTED', 'FAILURE'].includes(runStatus);

  useEffect(() => {
    if (done) return undefined;
    let cancelled = false;
    let lastText = '';
    const load = async () => {
      try {
        const resp = await fetch(resolveUrl('/api/v1/streams/results'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...resolveHeaders() },
          body: JSON.stringify({ execution_id: run.executionId, authorization: run.authorization }),
        });
        if (!resp.ok) throw new Error(`status ${resp.status}`);
        const text = await resp.text();
        if (!cancelled) {
          // An unchanged run keeps the same object, so the card's derived data isn't rebuilt
          if (text !== lastText) setExecution(JSON.parse(text));
          lastText = text;
          setFailedToLoad(false);
          setNow(Date.now());
        }
      } catch {
        if (!cancelled) setFailedToLoad(true);
      }
    };
    load();
    const id = window.setInterval(load, RUN_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [done, run.executionId, run.authorization, resolveUrl, resolveHeaders]);

  const nodes = execution ? getRunNodes(execution) : [];
  const waitingOn = nodes.find((node) => node.status === 'waiting' || node.status === 'running');
  const idle = execution && !done ? getRunIdleSeconds(execution, now) : 0;
  const elapsed = toSeconds(execution?.completed_at || now) - toSeconds(execution?.started_at);
  const heading = !execution ? 'Workflow run'
    : runStatus === 'FINISHED' ? `Workflow run finished${elapsed > 0 ? ` in ${formatDuration(elapsed)}` : ''}`
    : done ? `Workflow run ${runStatus === 'ABORTED' ? 'aborted' : 'failed'}`
    : `Workflow running${elapsed > 0 ? ` for ${formatDuration(elapsed)}` : ''}`;

  return (
    <Box sx={{ my: 1, p: 1.25, border: '1px solid hsl(var(--border))', borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ ...textSx, flex: 1, fontWeight: 600 }}>{heading}</Typography>
        {!done && execution && <CircularProgress size={11} sx={{ color: 'hsl(var(--muted-foreground))' }} />}
      </Box>
      {!execution && <Typography sx={{ ...mutedSx, mt: 0.5 }}>{failedToLoad ? 'Could not load this run.' : 'Loading the run...'}</Typography>}
      {nodes.map((node) => (
        <Box key={node.id} sx={{ mt: 0.5 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
            <Typography sx={{ ...textSx, flex: 1 }}>{node.label}</Typography>
            <Typography sx={{ ...mutedSx, flexShrink: 0, color: node.status === 'failed' ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))' }}>
              {runNodeLabel[node.status]}
            </Typography>
          </Box>
          {node.reason && <Typography sx={{ ...mutedSx, color: 'hsl(var(--destructive))', wordBreak: 'break-word' }}>{node.reason}</Typography>}
        </Box>
      ))}
      {idle > RUN_STUCK_SECONDS && (
        <Typography sx={{ ...mutedSx, mt: 0.75 }}>
          No progress for {formatDuration(idle)}.{waitingOn ? ` Still waiting on ${waitingOn.label}.` : ''} The run may be stuck.
        </Typography>
      )}
      {onOpen && (
        <Button size="small" disableRipple onClick={onOpen} sx={{ ...linkButtonSx, mt: 0.75 }}>Open in debug view</Button>
      )}
    </Box>
  );
};

export const AgentChatView: React.FC<AgentChatViewProps> = ({
  execution,
  agentData,
  isRunning,
  busy,
  pollWarning,
  error,
  workflowId: propWorkflowId,
  placeholder,
  composerContainer,
  contentPaddingX = 0,
  headerActionsContainer,
  onStart,

  onSubmit,
  onStop,
  stopping = false,
  onRefresh,
  isAppAuthenticated,
  onAuthenticateApp,
  onRefreshAuthenticatedApps,
  resolveUrl,
  resolveHeaders,
  apiBaseUrl,
  onOpenRun,
  onNewChat,
  onFocusDecision,
}) => {
  const executionId = execution?.execution_id || '';
  const decisions = useMemo<ChatDecision[]>(
    () => [...((agentData?.decisions as ChatDecision[]) || [])].sort((a, b) => (a.i || 0) - (b.i || 0)),
    [agentData?.decisions],
  );
  const status = String(execution?.status || agentData?.status || '').toUpperCase();
  const finished = status === 'FINISHED' && !isRunning;
  const stopped = ['FAILURE', 'ABORTED', 'CANCELLED', 'CANCELED'].includes(status);

  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'auto' | 'ask'>(readMode);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({});
  const [rawSteps, setRawSteps] = useState<Record<string, boolean>>({});
  const [watchingAuth, setWatchingAuth] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [bookmarks, setBookmarks] = useState<ChatBookmark[]>(readBookmarks);
  const [historyAnchor, setHistoryAnchor] = useState<HTMLElement | null>(null);
  const [historyTab, setHistoryTab] = useState<'all' | 'bookmarked'>('all');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyRuns, setHistoryRuns] = useState<AgentRun[] | null>(null);
  const [historyError, setHistoryError] = useState('');
  // A reply or follow-up the backend hasn't recorded yet, shown so it doesn't vanish until it has
  const [pendingMessage, setPendingMessage] = useState('');
  const [now, setNow] = useState(() => Date.now());

  // Answers seen in this session, by finish decision id. A follow-up rewrites that
  // decision, so this keeps the answer on screen without waiting for the replies.
  const knownAnswersRef = useRef<Record<string, string>>({});
  const announcedEditsRef = useRef<{ executionId: string; ids: Set<string> } | null>(null);
  const autoAnsweredRef = useRef<string>('');
  const progressRef = useRef<{ signature: string; at: number }>({ signature: '', at: Date.now() });
  const endRef = useRef<HTMLDivElement | null>(null);

  const workflowId = useMemo(() => {
    if (propWorkflowId) return propWorkflowId;
    for (const decision of decisions) {
      const body = isAction(decision, 'put_agent_update') ? parseJson(getField(decision, 'body')?.value) : null;
      if (body?.workflow_id) return String(body.workflow_id);
    }
    return '';
  }, [propWorkflowId, decisions]);

  const finishDecision = useMemo(() => [...decisions].reverse().find(isFinish), [decisions]);
  const finalAnswer = getDecisionOutput(finishDecision) || agentData?.output || agentData?.message || '';
  if (finishDecision?.run_details?.id && finalAnswer) knownAnswersRef.current[finishDecision.run_details.id] = finalAnswer;

  const labels = useMemo(() => getNodeLabels(decisions), [decisions]);
  const runs = useMemo(() => getWorkflowRuns(decisions), [decisions]);
  const announcedRunsRef = useRef<{ executionId: string; ids: Set<string> } | null>(null);
  const thread = useMemo(() => buildChatThread({
    prompt: agentData?.original_input,
    decisions,
    finalAnswer,
    finished,
    knownAnswers: knownAnswersRef.current,
    modelAnswers: getAnswersFromModelReplies(agentData?.llm_responses),
  }), [agentData?.original_input, agentData?.llm_responses, decisions, finalAnswer, finished]);

  // What the agent is waiting on, if anything
  const waitingQuestion = decisions.find((d) => isAsk(d) && (d.run_details?.status || '').toUpperCase() === 'WAITING');
  const waitingApproval = !waitingQuestion
    ? decisions.find((d) => !isAsk(d) && (d.run_details?.status || '').toUpperCase() === 'WAITING')
    : undefined;
  const questionIndex = waitingQuestion ? Math.max(0, (waitingQuestion.fields || []).findIndex((f) => f.key === 'question')) : 0;
  const questionText = waitingQuestion?.fields?.[questionIndex]?.value || '';
  const needsApproval = asksForApproval(questionText);

  const appsNeedingAuth = useMemo(() => getAppsNeedingAuth(decisions), [decisions]);
  const pendingAuth = appsNeedingAuth.filter((app) => !isAppAuthenticated(app.name, app.id));
  const connectedAuth = appsNeedingAuth.filter((app) => isAppAuthenticated(app.name, app.id));
  const replies = waitingQuestion && !busy ? getQuickReplies(questionText) : [];

  // Reset per-run state when a different run is shown
  useEffect(() => {
    setOpenGroups({});
    setOpenSteps({});
    setRawSteps({});
    setWatchingAuth(false);
    autoAnsweredRef.current = '';
  }, [executionId]);

  // Spot a stuck run: nothing new for a while although it should be working
  const signature = `${status}|${decisions.map((d) => `${d.run_details?.id}:${d.run_details?.status}`).join(',')}`;
  if (signature !== progressRef.current.signature) progressRef.current = { signature, at: Date.now() };
  useEffect(() => {
    if (!isRunning) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, [isRunning]);
  const stalledFor = isRunning && !waitingQuestion && !waitingApproval ? now - progressRef.current.at : 0;

  // Tell the host about workflow edits it hasn't seen. Edits already in a run
  // when it is first shown are old news. An agent revert reloads the canvas
  // like the chat's own revert does.
  useEffect(() => {
    if (!executionId) return;
    const edits = decisions.filter((d) => (isAction(d, 'put_agent_update') || isAppliedRevert(d)) && getStepStatus(d) === 'done' && d.run_details?.id);
    if (announcedEditsRef.current?.executionId !== executionId) {
      announcedEditsRef.current = { executionId, ids: new Set(edits.map((d) => d.run_details!.id!)) };
      return;
    }
    const fresh = edits.filter((d) => !announcedEditsRef.current!.ids.has(d.run_details!.id!));
    if (fresh.length === 0 || !workflowId) return;
    fresh.forEach((d) => announcedEditsRef.current!.ids.add(d.run_details!.id!));
    const detail: AgentWorkflowChangedDetail = fresh.some(isAppliedRevert)
      ? { workflowId, nodeIds: [], reverted: true }
      : { workflowId, nodeIds: fresh.flatMap(getChangedNodeIds) };
    window.dispatchEvent(new CustomEvent(AGENT_WORKFLOW_CHANGED_EVENT, { detail }));
  }, [decisions, executionId, workflowId]);

  // Open runs the agent starts in the host's run view. Runs already in the
  // agent run when it is first shown are not reopened.
  const openRun = useCallback((run: ChatWorkflowRun) => {
    if (!propWorkflowId) return;
    const detail: AgentOpenExecutionDetail = { workflowId: run.workflowId || propWorkflowId, executionId: run.executionId, authorization: run.authorization };
    window.dispatchEvent(new CustomEvent(AGENT_OPEN_EXECUTION_EVENT, { detail }));
  }, [propWorkflowId]);

  useEffect(() => {
    if (!executionId) return;
    if (announcedRunsRef.current?.executionId !== executionId) {
      announcedRunsRef.current = { executionId, ids: new Set(runs.map((run) => run.executionId)) };
      return;
    }
    const fresh = runs.filter((run) => !announcedRunsRef.current!.ids.has(run.executionId));
    fresh.forEach((run) => announcedRunsRef.current!.ids.add(run.executionId));
    if (fresh.length > 0) openRun(fresh[fresh.length - 1]);
  }, [runs, executionId, openRun]);

  // Credentials: once the user opened the setup, keep refreshing the org's
  // credentials until they exist, then carry on for them if that was all the
  // agent asked. A question that also wants approval waits for the user.
  useEffect(() => {
    if (!watchingAuth || pendingAuth.length > 0) return undefined;
    setWatchingAuth(false);
    const names = connectedAuth.map((app) => app.name).join(', ');
    const decisionId = waitingQuestion?.run_details?.id;
    if (!decisionId || needsApproval || autoAnsweredRef.current === decisionId) {
      if (names) toast.success(`${names} connected. Reply to the agent to continue.`);
      return undefined;
    }
    autoAnsweredRef.current = decisionId;
    toast.success(`${names} connected. Continuing.`);
    onSubmit(decisionId, { answer: { index: questionIndex, value: `I've added the ${names} credentials.` } });
    return undefined;
  }, [watchingAuth, pendingAuth.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!watchingAuth) return undefined;
    const id = window.setInterval(onRefreshAuthenticatedApps, AUTH_WATCH_MS);
    return () => window.clearInterval(id);
  }, [watchingAuth, onRefreshAuthenticatedApps]);

  // Drop the pending message once the run shows it, or when sending it failed
  const pendingRecorded = !!pendingMessage && thread.some((item) => item.type === 'user' && item.text === pendingMessage);
  useEffect(() => {
    if (pendingMessage && (pendingRecorded || (!busy && !isRunning))) setPendingMessage('');
  }, [pendingMessage, pendingRecorded, busy, isRunning]);

  // Keep the newest message in view
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread.length, waitingQuestion?.run_details?.id, finished]);

  const changeMode = (value: 'auto' | 'ask') => {
    setMode(value);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, value);
    } catch { /* ignore */ }
  };

  const compose = (text: string) => (mode === 'ask' && workflowId ? ASK_FIRST_PREFIX + text : text);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy || (isRunning && !waitingQuestion)) return;
    setInput('');

    if (waitingQuestion?.run_details?.id) {
      setPendingMessage(text);
      await onSubmit(waitingQuestion.run_details.id, { answer: { index: questionIndex, value: text } });
      return;
    }
    if (finished && finishDecision?.run_details?.id) {
      setPendingMessage(text);
      await onSubmit(finishDecision.run_details.id, { continue: compose(text) }, true);
      return;
    }
    await onStart(compose(text));
  };

  // The workflow as it was before this chat comes from its saved revisions, not from
  // memory, so revert still works after closing the panel or reloading the page.
  const chatStartedAt = Number((execution as { started_at?: unknown } | undefined)?.started_at) || 0;
  // Reverting asks first in a popover listing what it undoes. `until` (unix seconds) picks
  // the newest version saved by then: the chat start, or when one of the user's messages was sent.
  const [revertTarget, setRevertTarget] = useState<{ anchor: HTMLElement; until: number } | null>(null);
  const revert = async (until: number) => {
    if (!workflowId || !until || reverting) return;
    const toTurn = until !== chatStartedAt;
    setReverting(true);
    try {
      const listResp = await fetch(resolveUrl(`/api/v1/workflows/${workflowId}/revisions?count=100`), {
        credentials: 'include',
        headers: { ...resolveHeaders() },
      });
      if (!listResp.ok) throw new Error(`loading saved versions failed with status ${listResp.status}`);
      const revisions = await listResp.json();
      const before = pickRevisionBefore(Array.isArray(revisions) ? revisions : [], until);
      if (!before) throw new Error(`there is no saved version from ${toTurn ? 'that point' : 'before this chat'}`);
      const { revision_id: _revisionId, ...workflow } = before;
      const resp = await fetch(resolveUrl(`/api/v1/workflows/${workflowId}`), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...resolveHeaders() },
        body: JSON.stringify(workflow),
      });
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      toast.success(toTurn ? 'Reverted the workflow to that point in the chat' : 'Reverted the changes from this chat');
      const detail: AgentWorkflowChangedDetail = { workflowId, nodeIds: [], reverted: true };
      window.dispatchEvent(new CustomEvent(AGENT_WORKFLOW_CHANGED_EVENT, { detail }));
    } catch (err) {
      toast.error(`Failed to revert: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setReverting(false);
      setRevertTarget(null);
    }
  };

  const focusNode = (nodeId?: string) => {
    if (!nodeId || !workflowId) return;
    const detail: AgentFocusNodeDetail = { workflowId, nodeId };
    window.dispatchEvent(new CustomEvent(AGENT_FOCUS_NODE_EVENT, { detail }));
  };

  const connect = (app: { id: string; name: string; url?: string }) => {
    onAuthenticateApp(app);
    setWatchingAuth(true);
  };

  const renderStep = (decision: ChatDecision) => {
    const id = decision.run_details?.id || `${decision.i}`;
    const stepStatus = getStepStatus(decision);
    const { label, details } = describeStep(decision, labels);
    const failure = getFailureReason(decision);
    const duration = getStepDuration(decision);
    const nodeIds = isAction(decision, 'put_agent_update') ? getChangedNodeIds(decision) : [];
    const open = !!openSteps[id];

    return (
      <Box key={id} sx={{ py: 0.75 }}>
        <Box
          role="button"
          tabIndex={0}
          onClick={() => setOpenSteps((prev) => ({ ...prev, [id]: !prev[id] }))}
          onKeyDown={(e) => { if (e.key === 'Enter') setOpenSteps((prev) => ({ ...prev, [id]: !prev[id] })); }}
          sx={{ display: 'flex', gap: 1, alignItems: 'baseline', cursor: 'pointer' }}
        >
          <Typography sx={{ ...textSx, flex: 1 }}>{label}</Typography>
          <Typography sx={{
            ...mutedSx,
            flexShrink: 0,
            color: stepStatus === 'failed' ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))',
          }}>
            {stepStatus === 'done' ? formatDuration(duration) || statusLabel.done : statusLabel[stepStatus]}
          </Typography>
        </Box>
        {decision.reason && <Typography sx={{ ...mutedSx, fontStyle: 'italic', mt: 0.25 }}>{decision.reason}</Typography>}
        {failure && <Typography sx={{ ...mutedSx, color: 'hsl(var(--destructive))', mt: 0.25 }}>{failure}</Typography>}
        {open && (
          <Box sx={{ mt: 0.75, pl: 1.5, borderLeft: '2px solid hsl(var(--border))' }}>
            {details.map((detail, index) => {
              const isUpdateStep = isAction(decision, 'put_agent_update');
              const clickableDetail = Boolean(onFocusDecision && isUpdateStep);
              return (
                <Typography
                  key={index}
                  role={clickableDetail ? 'button' : undefined}
                  tabIndex={clickableDetail ? 0 : undefined}
                  onClick={clickableDetail ? () => onFocusDecision?.({
                    decisionId: id,
                    operationIndex: index,
                    changeText: detail,
                  }) : undefined}
                  onKeyDown={clickableDetail ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onFocusDecision?.({
                        decisionId: id,
                        operationIndex: index,
                        changeText: detail,
                      });
                    }
                  } : undefined}
                  sx={{
                    ...mutedSx,
                    cursor: clickableDetail ? 'pointer' : 'default',
                    '&:hover': clickableDetail ? { color: 'hsl(var(--foreground))', textDecoration: 'underline' } : undefined,
                  }}
                >
                  {detail}
                </Typography>
              );
            })}
            <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5 }}>
              {onFocusDecision && (
                <Button size="small" disableRipple onClick={() => onFocusDecision({ decisionId: id })} sx={linkButtonSx}>Show in timeline</Button>
              )}
              {nodeIds.length > 0 && workflowId && (
                <Button size="small" disableRipple onClick={() => focusNode(nodeIds[0])} sx={linkButtonSx}>Show on canvas</Button>
              )}
              <Button size="small" disableRipple onClick={() => setRawSteps((prev) => ({ ...prev, [id]: !prev[id] }))} sx={linkButtonSx}>
                {rawSteps[id] ? 'Hide request and response' : 'Show request and response'}
              </Button>
            </Box>
            {rawSteps[id] && (
              <Box component="pre" sx={{
                fontSize: '0.6875rem', color: 'hsl(var(--muted-foreground))', bgcolor: 'hsl(var(--muted) / 0.4)',
                borderRadius: 1, p: 1, mt: 0.75, maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {JSON.stringify({ tool: decision.tool, action: decision.action, fields: decision.fields, result: getResult(decision) ?? decision.run_details?.raw_response }, null, 2)}
              </Box>
            )}
          </Box>
        )}
      </Box>
    );
  };

  // Only the newest item can be live. Right after the user sends a message the
  // agent has no steps for it yet, so the previous turn's steps must stay finished.
  const working = isRunning && !waitingQuestion;
  const lastItem = thread[thread.length - 1];
  const liveGroupKey = working && lastItem?.type === 'steps' ? lastItem.key : undefined;

  // When each user message was sent, as a point to revert the workflow to: the chat start for
  // the first, else when the agent began on it (the editor saves right before). Only messages
  // the agent edited the workflow after get one.
  const revertPoints: Record<string, number> = {};
  thread.forEach((item, index) => {
    if (item.type !== 'user') return;
    const next = thread.slice(index + 1).find((later) => later.type === 'steps');
    const until = item.key === 'prompt' ? chatStartedAt : toSeconds(next?.type === 'steps' ? next.steps[0]?.run_details?.started_at : 0);
    if (until && getChangesAfter(decisions, labels, until).length > 0) revertPoints[item.key] = until;
  });

  const renderItem = (item: ChatThreadItem) => {
    if (item.type === 'user') {
      const cleanUserText = stripModePrefix(item.text);
      if (!cleanUserText) return null;
      const until = workflowId && !working ? revertPoints[item.key] : 0;
      return (
        // Right padding leaves room for the revert button on the bubble's corner
        <Box key={item.key} sx={{ display: 'flex', justifyContent: 'flex-end', my: 1.25, pr: 1, '&:hover .revert-to-here': { opacity: 1 } }}>
          <Box sx={{
            ...textSx, position: 'relative', maxWidth: '85%', px: 1.5, py: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            bgcolor: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))', borderRadius: '12px 12px 2px 12px',
          }}>
            {cleanUserText}
            {!!until && (
              <Tooltip title="Revert Workflow to this point">
                <IconButton
                  className="revert-to-here"
                  aria-label="Revert Workflow to this point"
                  onClick={(event) => setRevertTarget({ anchor: event.currentTarget, until })}
                  sx={{
                    position: 'absolute', top: -10, right: -10, width: 22, height: 22, p: 0,
                    opacity: revertTarget?.until === until ? 1 : 0, transition: 'opacity 120ms',
                    bgcolor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))',
                    '&:hover': { bgcolor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))' },
                    '&:focus-visible': { opacity: 1 },
                    '@media (hover: none)': { opacity: 1 },
                  }}
                >
                  <Undo2 size={13} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>
      );
    }

    if (item.type === 'agent') {
      return (
        <Box key={item.key} sx={{ ...textSx, my: 1.25, '& p': { my: 0.5 } }}>
          <ShuffleMarkdown components={agentMarkdownComponents}>{item.text}</ShuffleMarkdown>
        </Box>
      );
    }

    // Steps: the live group stays open, finished ones fold into one line
    const live = item.key === liveGroupKey;
    const open = openGroups[item.key] ?? live;
    const failed = item.steps.filter((step) => getStepStatus(step) === 'failed').length;
    const starts = item.steps.map((s) => toSeconds(s.run_details?.started_at)).filter(Boolean);
    const ends = item.steps.map((s) => toSeconds(s.run_details?.completed_at)).filter(Boolean);
    const duration = starts.length && ends.length ? Math.max(...ends) - Math.min(...starts) : 0;

    const stepIds = new Set(item.steps.map((step) => step.run_details?.id || `${step.i}`));
    const groupRuns = runs.filter((run) => stepIds.has(run.decisionId));

    return (
      <React.Fragment key={item.key}>
      <Box sx={{ my: 1, border: '1px solid hsl(var(--border))', borderRadius: 2, bgcolor: 'hsl(var(--muted) / 0.2)' }}>
        <Box
          role="button"
          tabIndex={0}
          onClick={() => setOpenGroups((prev) => ({ ...prev, [item.key]: !open }))}
          onKeyDown={(e) => { if (e.key === 'Enter') setOpenGroups((prev) => ({ ...prev, [item.key]: !open })); }}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.75, cursor: 'pointer' }}
        >
          <Typography sx={{ ...mutedSx, flex: 1 }}>
            {live ? 'Working' : 'Worked'}{duration > 0 ? ` for ${formatDuration(duration)}` : ''}
            {` · ${item.steps.length} step${item.steps.length === 1 ? '' : 's'}`}
            {failed > 0 ? ` · ${failed} failed` : ''}
          </Typography>
          {live && <CircularProgress size={11} sx={{ color: 'hsl(var(--muted-foreground))' }} />}
          <Typography sx={mutedSx}>{open ? 'Hide' : 'Show'}</Typography>
        </Box>
        {open && <Box sx={{ px: 1.25, pb: 0.5, borderTop: '1px solid hsl(var(--border))' }}>{item.steps.map(renderStep)}</Box>}
      </Box>
      {groupRuns.map((run) => (
        <RunCard
          key={run.executionId}
          run={run}
          onOpen={propWorkflowId && (!run.workflowId || run.workflowId === propWorkflowId) ? () => openRun(run) : undefined}
          resolveUrl={resolveUrl}
          resolveHeaders={resolveHeaders}
        />
      ))}
      </React.Fragment>
    );
  };

  const renderWaiting = () => {
    if (waitingApproval?.run_details?.id) {
      const { label } = describeStep(waitingApproval, labels);
      const approvalId = waitingApproval.run_details.id;
      return (
        <Box sx={{ my: 1.25, p: 1.5, border: '1px solid hsl(var(--border))', borderRadius: 2, bgcolor: 'hsl(var(--muted) / 0.25)' }}>
          <Typography sx={textSx}>The agent wants to: {label}</Typography>
          {waitingApproval.reason && <Typography sx={{ ...mutedSx, mt: 0.5 }}>{waitingApproval.reason}</Typography>}
          <Box sx={{ display: 'flex', gap: 1, mt: 1.25 }}>
            <Button size="small" variant="contained" disabled={busy} onClick={() => onSubmit(approvalId, { approve: 'true' })} sx={primaryActionButtonSx}>Approve</Button>
            <Button size="small" variant="outlined" disabled={busy} onClick={() => onSubmit(approvalId, { approve: 'false' })} sx={outlinedActionButtonSx}>Deny</Button>
          </Box>
        </Box>
      );
    }
    if (!waitingQuestion) return null;

    return (
      <Box sx={{ my: 1 }}>
        {connectedAuth.map((app) => (
          <Typography key={app.id} sx={{ ...mutedSx, mb: 0.75 }}>{app.name} connected</Typography>
        ))}
        {pendingAuth.map((app) => (
          <Box key={app.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, mb: 1, border: '1px solid hsl(var(--border))', borderRadius: 2, bgcolor: 'hsl(var(--muted) / 0.25)' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={textSx}>Connect {app.name}</Typography>
              <Typography sx={mutedSx}>
                {watchingAuth
                  ? (needsApproval ? 'Waiting for the credentials. You will still confirm the plan yourself.' : 'Waiting for the credentials. The agent continues once they are saved.')
                  : (needsApproval ? 'Add credentials, then reply to the agent.' : 'Add credentials and the agent continues by itself.')}
              </Typography>
            </Box>
            <Button size="small" variant="contained" onClick={() => connect(app)} sx={{ ...primaryActionButtonSx, flexShrink: 0 }}>Connect</Button>
          </Box>
        ))}
        {replies.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {replies.map((reply) => (
              <Button key={reply} size="small" variant="outlined" onClick={() => send(reply)} sx={replySx}>{reply}</Button>
            ))}
          </Box>
        )}
      </Box>
    );
  };

  // What the agent changed since the last message and what still needs doing before the workflow can run.
  // Reverting is on each message: reverting to the first one undoes the whole chat.
  const renderSummary = () => {
    if (!finished) return null;
    const changes = getLatestChanges(decisions, labels);
    const problems: { text: string; nodeId?: string; decisionId?: string; decisionIndex?: number }[] = [
      ...appsNeedingAuth.filter((app) => !isAppAuthenticated(app.name, app.id)).map((app) => ({ text: `${app.name} needs credentials before it can run`, nodeId: undefined as string | undefined })),
      ...getWorkflowProblems(decisions),
    ];
    if (changes.length === 0 && problems.length === 0) return null;
    // The change list is folded by default, like finished steps
    const changesOpen = !!openGroups['summary-changes'];
    const toggleChanges = () => setOpenGroups((prev) => ({ ...prev, 'summary-changes': !changesOpen }));

    return (
      <Box sx={{ my: 1.25, p: 1.5, border: '1px solid hsl(var(--border))', borderRadius: 2 }}>
        {changes.length > 0 && (
          <>
            <Box
              role="button"
              tabIndex={0}
              onClick={toggleChanges}
              onKeyDown={(e) => { if (e.key === 'Enter') toggleChanges(); }}
              sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', mb: changesOpen ? 0.5 : 0 }}
            >
              <Typography sx={{ ...mutedSx, flex: 1 }}>Changed · {changes.length} change{changes.length === 1 ? '' : 's'}</Typography>
              <Typography sx={mutedSx}>{changesOpen ? 'Hide' : 'Show'}</Typography>
            </Box>
            {changesOpen && changes.map((change, index) => {
              const linked = Boolean(onFocusDecision || (change.nodeId && workflowId));
              const handleSelectChange = () => {
                focusNode(change.nodeId);
                onFocusDecision?.({
                  decisionId: change.decisionId,
                  decisionIndex: change.decisionIndex,
                  operationIndex: change.operationIndex,
                  changeText: change.text,
                  nodeId: change.nodeId,
                });
              };
              return (
                <Typography
                  key={index}
                  role={linked ? 'button' : undefined}
                  tabIndex={linked ? 0 : undefined}
                  onClick={linked ? handleSelectChange : undefined}
                  onKeyDown={linked ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectChange();
                    }
                  } : undefined}
                  sx={{
                    ...textSx,
                    cursor: linked ? 'pointer' : 'default',
                    borderRadius: 1,
                    px: 0.5,
                    mx: -0.5,
                    py: 0.15,
                    transition: 'color 0.15s ease, background-color 0.15s ease',
                    '&:hover': linked ? { color: 'hsl(var(--foreground))', bgcolor: 'hsl(var(--muted) / 0.5)', textDecoration: 'underline' } : undefined,
                  }}
                >
                  {change.text}
                </Typography>
              );
            })}
          </>
        )}
        {problems.length > 0 && (
          <>
            <Typography sx={{ ...mutedSx, mt: changes.length ? 1.25 : 0, mb: 0.5 }}>Needs attention before running</Typography>
            {problems.map((problem, index) => {
              const linkedProblem = Boolean(
                (onFocusDecision && (problem.decisionId !== undefined || problem.decisionIndex !== undefined)) ||
                (problem.nodeId && workflowId),
              );
              const handleSelectProblem = () => {
                focusNode(problem.nodeId);
                if (problem.decisionId !== undefined || problem.decisionIndex !== undefined) {
                  onFocusDecision?.({
                    decisionId: problem.decisionId,
                    decisionIndex: problem.decisionIndex,
                    nodeId: problem.nodeId,
                  });
                }
              };
              return (
                <Typography
                  key={index}
                  role={linkedProblem ? 'button' : undefined}
                  tabIndex={linkedProblem ? 0 : undefined}
                  onClick={linkedProblem ? handleSelectProblem : undefined}
                  onKeyDown={linkedProblem ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectProblem();
                    }
                  } : undefined}
                  sx={{
                    ...textSx,
                    cursor: linkedProblem ? 'pointer' : 'default',
                    '&:hover': linkedProblem ? { color: 'hsl(var(--foreground))', textDecoration: 'underline' } : undefined,
                  }}
                >
                  {problem.text}
                </Typography>
              );
            })}
          </>
        )}
      </Box>
    );
  };

  const composerPlaceholder = waitingQuestion
    ? 'Reply to the agent...'
    : stopping ? 'Stopping the agent...'
    : isRunning ? 'The agent is working...'
    : finished && finishDecision ? 'Ask a follow-up or for more changes...'
    : placeholder || 'Ask about this workflow or describe a change...';
  const canType = !busy && (!isRunning || !!waitingQuestion);

  const composer = (
    <>
    <Box
      component="form"
      onSubmit={(e) => { e.preventDefault(); send(); }}
      sx={{
        border: waitingQuestion ? '1px solid hsl(var(--foreground) / 0.4)' : '1px solid hsl(var(--border))',
        borderRadius: 2,
        bgcolor: 'hsl(var(--background))',
        px: 1.25,
        pt: 1,
        pb: 0.75,
      }}
    >
      <Box
        component="textarea"
        value={input}
        disabled={!canType}
        placeholder={composerPlaceholder}
        rows={2}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        sx={{
          width: '100%', border: 'none', outline: 'none', resize: 'none', bgcolor: 'transparent',
          color: 'hsl(var(--foreground))', fontFamily: 'inherit', fontSize: '0.8125rem', lineHeight: 1.5, maxHeight: 160,
        }}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5 }}>
        {workflowId && (
          <Tooltip title="Auto-build makes changes right away. Ask before changing shows a plan and waits for your OK.">
            <Select
              size="small"
              variant="standard"
              disableUnderline
              value={mode}
              onChange={(e) => changeMode(e.target.value as 'auto' | 'ask')}
              sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}
            >
              <MenuItem value="auto" sx={{ fontSize: '0.8125rem' }}>Auto-build</MenuItem>
              <MenuItem value="ask" sx={{ fontSize: '0.8125rem' }}>Ask before changing</MenuItem>
            </Select>
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        {isRunning && !waitingQuestion ? (
          <Button size="small" variant="outlined" disabled={stopping} onClick={onStop} sx={outlinedActionButtonSx}>{stopping ? 'Stopping...' : 'Stop'}</Button>
        ) : (
          <Button type="submit" size="small" variant="contained" disabled={!canType || !input.trim()} sx={primaryActionButtonSx}>
            {busy ? 'Sending...' : 'Send'}
          </Button>
        )}
      </Box>
    </Box>
    </>
  );

  const renderRevertConfirm = () => {
    if (!revertTarget) return null;
    const undone = getChangesAfter(decisions, labels, revertTarget.until);
    const whole = revertTarget.until === chatStartedAt;
    const close = () => { if (!reverting) setRevertTarget(null); };
    return (
      <Popover
        open
        anchorEl={revertTarget.anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1, p: 1.5, width: 320,
              bgcolor: 'hsl(var(--card))', color: 'hsl(var(--foreground))',
              border: '1px solid hsl(var(--border))', backgroundImage: 'none',
            },
          },
        }}
      >
        <Typography sx={{ ...textSx, fontWeight: 600 }}>{whole ? 'Revert all changes from this chat?' : 'Revert workflow to this point?'}</Typography>
        <Typography sx={{ ...mutedSx, mt: 0.5, mb: 0.75 }}>
          Undoes {undone.length} change{undone.length === 1 ? '' : 's'} the agent made {whole ? 'in this chat' : 'after this message'}:
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.25, maxHeight: 180, overflowY: 'auto' }}>
          {undone.map((text, index) => (
            <Typography component="li" key={index} sx={{ ...textSx, fontSize: '0.75rem' }}>{text}</Typography>
          ))}
        </Box>
        <Typography sx={{ ...mutedSx, mt: 1 }}>Anything saved since then is replaced too, including your own edits and other people's.</Typography>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1.5 }}>
          <Button size="small" variant="outlined" disabled={reverting} onClick={close} sx={outlinedActionButtonSx}>Cancel</Button>
          <Button size="small" variant="contained" disabled={reverting} onClick={() => revert(revertTarget.until)} sx={primaryActionButtonSx}>
            {reverting ? 'Reverting...' : 'Revert'}
          </Button>
        </Box>
      </Popover>
    );
  };

  // Header: bookmark this chat, chat history, new chat
  const bookmarked = !!executionId && bookmarks.some((bookmark) => bookmark.execution_id === executionId);
  const toggleBookmark = () => {
    if (!executionId) return;
    const next = bookmarked
      ? bookmarks.filter((bookmark) => bookmark.execution_id !== executionId)
      : [{
        execution_id: executionId,
        authorization: execution?.authorization,
        title: getRunTitle(execution as unknown as AgentRun),
        started_at: String((execution as { started_at?: unknown } | undefined)?.started_at || ''),
        workflow_id: workflowId || undefined,
      }, ...bookmarks];
    setBookmarks(next);
    writeBookmarks(next);
  };

  // The light list (no conversations) loads in the background when the chat opens, and again on
  // each open of history; the last list shows meanwhile, so it opens instantly
  const loadHistory = useCallback(() => {
    setHistoryError('');
    searchAgentActivity({ limit: 50, apiBaseUrl, workflowId: 'AGENT', light: true })
      .then((result) => {
        if (result.success) setHistoryRuns(result.runs || []);
        else setHistoryError('Could not load your chats');
      })
      .catch(() => setHistoryError('Could not load your chats'));
  }, [apiBaseUrl]);

  useEffect(() => {
    if (onOpenRun) loadHistory();
  }, [loadHistory, onOpenRun]);

  const openHistory = (anchor: HTMLElement) => {
    setHistoryAnchor(anchor);
    setHistoryQuery('');
    loadHistory();
  };

  const openChat = (chatId: string, authorization?: string, runStatus?: string) => {
    setHistoryAnchor(null);
    if (chatId !== executionId) onOpenRun?.(chatId, authorization, runStatus);
  };

  const headerActions = (
    <>
      <Tooltip title={!executionId ? 'Send a message first to bookmark this chat' : bookmarked ? 'Remove bookmark' : 'Bookmark this chat'}>
        <span>
          <IconButton size="small" aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this chat'} aria-pressed={bookmarked} disabled={!executionId} onClick={toggleBookmark} sx={headerIconButtonSx}>
            <Bookmark size={16} fill={bookmarked ? 'currentColor' : 'none'} />
          </IconButton>
        </span>
      </Tooltip>
      {onOpenRun && (
        <Tooltip title="Chat history">
          <IconButton size="small" aria-label="Chat history" aria-haspopup="dialog" onClick={(event) => openHistory(event.currentTarget)} sx={headerIconButtonSx}>
            <History size={16} />
          </IconButton>
        </Tooltip>
      )}
      {onNewChat && (
        <Tooltip title="New chat">
          <span>
            <IconButton size="small" aria-label="New chat" disabled={!executionId || busy} onClick={onNewChat} sx={headerIconButtonSx}>
              <MessageCirclePlus size={16} />
            </IconButton>
          </span>
        </Tooltip>
      )}
    </>
  );

  const renderHistory = () => {
    const query = historyQuery.trim().toLowerCase();
    const items = historyTab === 'bookmarked'
      ? bookmarks.map((bookmark) => ({ id: bookmark.execution_id, authorization: bookmark.authorization, status: undefined as string | undefined, title: bookmark.title, startedAt: bookmark.started_at, workflowId: bookmark.workflow_id }))
      : (historyRuns || []).map((run) => ({ id: run.execution_id, authorization: run.authorization, status: run.status as string | undefined, title: getRunTitle(run), startedAt: run.started_at, workflowId: run.execution_argument }));
    const shown = items
      .filter((item) => !query || item.title.toLowerCase().includes(query))
      .sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0));
    // A chat on a workflow keeps that workflow's ID as its argument
    const sections = workflowId
      ? [
        { label: 'This workflow', items: shown.filter((item) => item.workflowId === workflowId) },
        { label: 'Other chats', items: shown.filter((item) => item.workflowId !== workflowId) },
      ]
      : [{ label: '', items: shown }];
    const loading = historyTab === 'all' && historyRuns === null && !historyError;
    const emptyText = historyTab === 'all' && historyError
      ? historyError
      : query ? 'No chats match your search'
        : historyTab === 'bookmarked' ? 'No bookmarked chats yet. Bookmark one from the top of a chat.' : 'No chats yet';

    return (
      <Popover
        open={!!historyAnchor}
        anchorEl={historyAnchor}
        onClose={() => setHistoryAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1, p: 1, width: 360, maxWidth: 'calc(100vw - 32px)',
              bgcolor: 'hsl(var(--card))', color: 'hsl(var(--foreground))', backgroundImage: 'none',
              border: '1px solid hsl(var(--border))', borderRadius: '12px', boxShadow: '0 12px 32px rgba(0, 0, 0, 0.28)',
            },
          },
        }}
      >
        <Box role="tablist" aria-label="Chats" sx={{ display: 'flex', p: 0.375, gap: 0.375, borderRadius: '10px', bgcolor: 'hsl(var(--muted) / 0.6)' }}>
          {(['all', 'bookmarked'] as const).map((tab) => {
            const active = historyTab === tab;
            return (
              <ButtonBase
                key={tab}
                role="tab"
                aria-selected={active}
                onClick={() => setHistoryTab(tab)}
                sx={{
                  flex: 1, py: 0.75, borderRadius: '8px', fontSize: '0.8125rem', fontWeight: active ? 600 : 500,
                  color: active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                  bgcolor: active ? 'hsl(var(--background))' : 'transparent',
                  boxShadow: active ? '0 1px 2px rgba(0, 0, 0, 0.2)' : 'none',
                  transition: 'background-color 0.15s ease, color 0.15s ease',
                  '&:hover': { color: 'hsl(var(--foreground))' },
                }}
              >
                {tab === 'all' ? 'All chats' : `Bookmarked${bookmarks.length ? ` (${bookmarks.length})` : ''}`}
              </ButtonBase>
            );
          })}
        </Box>
        <InputBase
          autoFocus
          fullWidth
          value={historyQuery}
          onChange={(event) => setHistoryQuery(event.target.value)}
          placeholder="Search chats..."
          inputProps={{ 'aria-label': 'Search chats' }}
          sx={{ mt: 1, px: 1.25, py: 0.5, fontSize: '0.8125rem', color: 'hsl(var(--foreground))', borderBottom: '1px solid hsl(var(--border) / 0.6)' }}
        />
        <Box sx={{ mt: 0.75, maxHeight: 380, overflowY: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={16} sx={{ color: 'hsl(var(--muted-foreground))' }} /></Box>
          ) : shown.length === 0 ? (
            <Typography sx={{ ...mutedSx, px: 1.25, py: 2.5, textAlign: 'center' }}>{emptyText}</Typography>
          ) : sections.map((section, sectionIndex) => (section.items.length === 0 && !section.label ? null : (
            <Box key={section.label || 'all'} role="group" aria-label={section.label || undefined} sx={{ mt: sectionIndex > 0 ? 1 : 0 }}>
              {section.label && (
                <Typography sx={{ ...mutedSx, fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', px: 1.25, pt: 0.5, pb: 0.5 }}>
                  {section.label}
                </Typography>
              )}
              {section.items.length === 0 && (
                <Typography sx={{ ...mutedSx, px: 1.25, pb: 0.75 }}>
                  {query ? 'No matching chats' : historyTab === 'bookmarked' ? 'No bookmarked chats here' : 'No chats yet'}
                </Typography>
              )}
              {section.items.map((item) => {
            const current = item.id === executionId;
            return (
              <ButtonBase
                key={item.id}
                onClick={() => openChat(item.id, item.authorization, item.status)}
                aria-current={current ? 'true' : undefined}
                sx={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, px: 1.25, py: 0.875, borderRadius: '8px', textAlign: 'left',
                  bgcolor: current ? 'hsl(var(--muted))' : 'transparent',
                  '&:hover, &.Mui-focusVisible': { bgcolor: 'hsl(var(--muted) / 0.7)' },
                }}
              >
                <Typography noWrap sx={{ ...textSx, flex: 1, minWidth: 0, fontWeight: current ? 600 : 400 }}>{item.title}</Typography>
                <Typography sx={{ ...mutedSx, flexShrink: 0 }}>{shortTimeAgo(item.startedAt)}</Typography>
              </ButtonBase>
            );
              })}
            </Box>
          )))}
        </Box>
      </Popover>
    );
  };

  const stalled = stalledFor > STALL_MS;

  return (
    // contentPaddingX is plain pixels: MUI multiplies numeric spacing values by
    // the theme's 8px unit, so 15 would become 120px.
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: 0, pl: contentPaddingX ? `${contentPaddingX}px` : 0, pr: contentPaddingX ? `${contentPaddingX}px` : 0 }}>
      {headerActionsContainer
        ? createPortal(headerActions, headerActionsContainer)
        : <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.25 }}>{headerActions}</Box>}
      {renderHistory()}
      {!executionId && !busy && thread.length === 0 && (
        <Box sx={{ py: 3, textAlign: 'center' }}>
          <Typography sx={{ ...textSx, fontWeight: 600 }}>Chat with the agent</Typography>
          <Typography sx={{ ...mutedSx, mt: 0.5 }}>
            Ask questions or describe a change. Each step shows as the agent works, and it asks when it needs something from you.
          </Typography>
        </Box>
      )}

      {thread.map(renderItem)}
      {pendingMessage && !pendingRecorded && renderItem({ type: 'user', text: pendingMessage, key: 'pending-message' })}
      {/* Starting a run or sending a reply waits for the agent's first LLM round, which takes a while */}
      {(busy || working) && !liveGroupKey && (busy || lastItem) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 1, px: 1.25, py: 0.75, border: '1px solid hsl(var(--border))', borderRadius: 2, bgcolor: 'hsl(var(--muted) / 0.2)' }}>
          <Typography sx={{ ...mutedSx, flex: 1 }}>Working</Typography>
          <CircularProgress size={11} sx={{ color: 'hsl(var(--muted-foreground))' }} />
        </Box>
      )}
      {renderWaiting()}
      {renderSummary()}
      {renderRevertConfirm()}

      {stopped && (
        <Box sx={{ my: 1, p: 1.25, border: '1px solid hsl(var(--destructive) / 0.4)', borderRadius: 2 }}>
          <Typography sx={textSx}>The agent stopped ({status.toLowerCase()}). Send a message to start a new chat.</Typography>
        </Box>
      )}

      {(stalled || pollWarning || error) && (
        <Box sx={{ my: 1, p: 1.25, border: '1px solid hsl(var(--border))', borderRadius: 2 }}>
          <Typography sx={textSx}>
            {error || pollWarning || `No progress for ${formatDuration(stalledFor / 1000)}. The agent may be stuck.`}
          </Typography>
          {(stalled || pollWarning) && (
            <Box sx={{ display: 'flex', gap: 1.5, mt: 0.75 }}>
              <Button size="small" disableRipple onClick={onRefresh} sx={linkButtonSx}>Check again</Button>
              <Button size="small" disableRipple onClick={onStop} sx={linkButtonSx}>Stop the agent</Button>
            </Box>
          )}
        </Box>
      )}

      <Box ref={endRef} sx={{ height: 1 }} />

      {composerContainer ? createPortal(composer, composerContainer) : <Box sx={{ mt: 1.5 }}>{composer}</Box>}
    </Box>
  );
};

export default AgentChatView;
