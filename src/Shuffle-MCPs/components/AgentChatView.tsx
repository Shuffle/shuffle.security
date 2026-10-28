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
import { Box, Button, CircularProgress, MenuItem, Select, Tooltip, Typography } from '@mui/material';
import ShuffleMarkdown from '@/Shuffle-Core/components/Markdown';
import AgentActivityList from '@/Shuffle-MCPs/components/AgentActivityList';
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
  getChangedNodeIds,
  getDecisionOutput,
  getFailureReason,
  getLatestChanges,
  getNodeLabels,
  getField,
  getQuickReplies,
  getResult,
  getRunIdleSeconds,
  getRunNodes,
  getStepDuration,
  getStepStatus,
  getWorkflowProblems,
  getWorkflowRuns,
  isAction,
  isAsk,
  isFinish,
  pickRevisionBefore,
  parseJson,
  toSeconds,
  type AgentFocusNodeDetail,
  type AgentOpenExecutionDetail,
  type BackendJson,
  type AgentWorkflowChangedDetail,
  type ChatDecision,
  type ChatThreadItem,
  type ChatWorkflowRun,
} from '@/Shuffle-MCPs/agentChat';

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
}

const readMode = (): 'auto' | 'ask' => {
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
  '&:hover': { color: 'hsl(var(--primary))', bgcolor: 'transparent' },
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
        {!done && execution && <CircularProgress size={11} sx={{ color: 'hsl(var(--primary))' }} />}
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
  const [showPastChats, setShowPastChats] = useState(false);
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
  // when it is first shown are old news.
  useEffect(() => {
    if (!executionId) return;
    const edits = decisions.filter((d) => isAction(d, 'put_agent_update') && getStepStatus(d) === 'done' && d.run_details?.id);
    if (announcedEditsRef.current?.executionId !== executionId) {
      announcedEditsRef.current = { executionId, ids: new Set(edits.map((d) => d.run_details!.id!)) };
      return;
    }
    const fresh = edits.filter((d) => !announcedEditsRef.current!.ids.has(d.run_details!.id!));
    if (fresh.length === 0 || !workflowId) return;
    fresh.forEach((d) => announcedEditsRef.current!.ids.add(d.run_details!.id!));
    const detail: AgentWorkflowChangedDetail = { workflowId, nodeIds: fresh.flatMap(getChangedNodeIds) };
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
  const chatStartedAt = Number(execution?.started_at) || 0;
  const revert = async () => {
    if (!workflowId || !chatStartedAt || reverting) return;
    if (!window.confirm('Revert the workflow to how it was before this chat changed it? Edits made since then, also by others, are replaced.')) return;
    setReverting(true);
    try {
      const listResp = await fetch(resolveUrl(`/api/v1/workflows/${workflowId}/revisions?count=100`), {
        credentials: 'include',
        headers: { ...resolveHeaders() },
      });
      if (!listResp.ok) throw new Error(`loading saved versions failed with status ${listResp.status}`);
      const revisions = await listResp.json();
      const before = pickRevisionBefore(Array.isArray(revisions) ? revisions : [], chatStartedAt);
      if (!before) throw new Error('there is no saved version from before this chat');
      const { revision_id: _revisionId, ...workflow } = before;
      const resp = await fetch(resolveUrl(`/api/v1/workflows/${workflowId}`), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...resolveHeaders() },
        body: JSON.stringify(workflow),
      });
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      toast.success('Reverted the changes from this chat');
      const detail: AgentWorkflowChangedDetail = { workflowId, nodeIds: [], reverted: true };
      window.dispatchEvent(new CustomEvent(AGENT_WORKFLOW_CHANGED_EVENT, { detail }));
    } catch (err) {
      toast.error(`Failed to revert: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setReverting(false);
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
            {details.map((detail, index) => <Typography key={index} sx={mutedSx}>{detail}</Typography>)}
            <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5 }}>
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

  const renderItem = (item: ChatThreadItem) => {
    if (item.type === 'user') {
      return (
        <Box key={item.key} sx={{ display: 'flex', justifyContent: 'flex-end', my: 1.25 }}>
          <Box sx={{
            ...textSx, maxWidth: '85%', px: 1.5, py: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            bgcolor: 'hsl(var(--primary) / 0.12)', border: '1px solid hsl(var(--primary) / 0.25)', borderRadius: '12px 12px 2px 12px',
          }}>
            {item.text}
          </Box>
        </Box>
      );
    }

    if (item.type === 'agent') {
      return (
        <Box key={item.key} sx={{ ...textSx, my: 1.25, '& p': { my: 0.5 } }}>
          <ShuffleMarkdown>{item.text}</ShuffleMarkdown>
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
          {live && <CircularProgress size={11} sx={{ color: 'hsl(var(--primary))' }} />}
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
        <Box sx={{ my: 1.25, p: 1.5, border: '1px solid hsl(var(--primary) / 0.5)', borderRadius: 2 }}>
          <Typography sx={textSx}>The agent wants to: {label}</Typography>
          {waitingApproval.reason && <Typography sx={{ ...mutedSx, mt: 0.5 }}>{waitingApproval.reason}</Typography>}
          <Box sx={{ display: 'flex', gap: 1, mt: 1.25 }}>
            <Button size="small" variant="contained" disabled={busy} onClick={() => onSubmit(approvalId, { approve: 'true' })} sx={{ textTransform: 'none' }}>Approve</Button>
            <Button size="small" variant="outlined" disabled={busy} onClick={() => onSubmit(approvalId, { approve: 'false' })} sx={{ textTransform: 'none' }}>Deny</Button>
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
          <Box key={app.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, mb: 1, border: '1px solid hsl(var(--primary) / 0.5)', borderRadius: 2 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={textSx}>Connect {app.name}</Typography>
              <Typography sx={mutedSx}>
                {watchingAuth
                  ? (needsApproval ? 'Waiting for the credentials. You will still confirm the plan yourself.' : 'Waiting for the credentials. The agent continues once they are saved.')
                  : (needsApproval ? 'Add credentials, then reply to the agent.' : 'Add credentials and the agent continues by itself.')}
              </Typography>
            </Box>
            <Button size="small" variant="contained" onClick={() => connect(app)} sx={{ textTransform: 'none', flexShrink: 0 }}>Connect</Button>
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

  const renderSummary = () => {
    if (!finished) return null;
    const changes = getLatestChanges(decisions, labels);
    const problems = [
      ...appsNeedingAuth.filter((app) => !isAppAuthenticated(app.name, app.id)).map((app) => ({ text: `${app.name} needs credentials before it can run`, nodeId: undefined as string | undefined })),
      ...getWorkflowProblems(decisions),
    ];
    const canRevert = !!workflowId && !!chatStartedAt && changes.length > 0;
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
              const linked = !!change.nodeId && !!workflowId;
              return (
                <Typography
                  key={index}
                  onClick={linked ? () => focusNode(change.nodeId) : undefined}
                  sx={{ ...textSx, cursor: linked ? 'pointer' : 'default', '&:hover': linked ? { color: 'hsl(var(--primary))' } : undefined }}
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
            {problems.map((problem, index) => (
              <Typography
                key={index}
                onClick={() => focusNode(problem.nodeId)}
                sx={{ ...textSx, cursor: problem.nodeId && workflowId ? 'pointer' : 'default' }}
              >
                {problem.text}
              </Typography>
            ))}
          </>
        )}
        {canRevert && (
          <Button size="small" disableRipple disabled={reverting} onClick={revert} sx={{ ...linkButtonSx, mt: 1 }}>
            {reverting ? 'Reverting...' : 'Revert all changes from this chat'}
          </Button>
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
    {/* Past chats sits with the composer, so it stays visible however far the chat is scrolled */}
    {showPastChats && onOpenRun && (
      <Box sx={{ mb: 1, maxHeight: '45vh', overflow: 'auto', border: '1px solid hsl(var(--border))', borderRadius: 2, bgcolor: 'hsl(var(--background))' }}>
        <AgentActivityList
          apiBaseUrl={apiBaseUrl}
          showStatusChips={false}
          top={25}
          limit={25}
          onRunClick={(run) => {
            setShowPastChats(false);
            onOpenRun(run.execution_id, run.authorization, run.status);
          }}
        />
      </Box>
    )}
    <Box
      component="form"
      onSubmit={(e) => { e.preventDefault(); send(); }}
      sx={{
        border: waitingQuestion ? '1px solid hsl(var(--primary) / 0.6)' : '1px solid hsl(var(--border))',
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
        {onOpenRun && (
          <Button size="small" disableRipple onClick={() => setShowPastChats((open) => !open)} sx={{ ...linkButtonSx, whiteSpace: 'nowrap' }}>
            {showPastChats ? 'Hide past chats' : 'Past chats'}
          </Button>
        )}
        {onNewChat && executionId && !busy && (
          <Button size="small" disableRipple onClick={() => { setShowPastChats(false); onNewChat(); }} sx={{ ...linkButtonSx, whiteSpace: 'nowrap' }}>New chat</Button>
        )}
        <Box sx={{ flex: 1 }} />
        {isRunning && !waitingQuestion ? (
          <Button size="small" variant="outlined" disabled={stopping} onClick={onStop} sx={{ textTransform: 'none', fontSize: '0.75rem', minHeight: 0, py: 0.25 }}>{stopping ? 'Stopping...' : 'Stop'}</Button>
        ) : (
          <Button type="submit" size="small" variant="contained" disabled={!canType || !input.trim()} sx={{ textTransform: 'none', fontSize: '0.75rem', minHeight: 0, py: 0.25 }}>
            {busy ? 'Sending...' : 'Send'}
          </Button>
        )}
      </Box>
    </Box>
    </>
  );

  const stalled = stalledFor > STALL_MS;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: 0 }}>
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
          <CircularProgress size={11} sx={{ color: 'hsl(var(--primary))' }} />
        </Box>
      )}
      {renderWaiting()}
      {renderSummary()}

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
