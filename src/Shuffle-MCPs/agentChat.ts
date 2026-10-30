/**
 * Chat view of an agent run: pure helpers that turn the run's decisions into a
 * conversation (user messages, the steps taken, the agent's answers).
 *
 * Everything is derived from the run data AgentUI already polls
 * (`/api/v1/streams/results`), so it works against BackendJson backend version.
 */

/** Tool results and workflow payloads are untyped JSON from the backend. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BackendJson = any;

export type ChatField = { key?: string; value?: string; answer?: string };

export type ChatDecision = {
  i?: number;
  action?: string;
  tool?: string;
  category?: string;
  reason?: string;
  fields?: ChatField[];
  run_details?: {
    id?: string;
    status?: string;
    started_at?: number;
    completed_at?: number;
    raw_response?: string;
  };
};

export type ChatLookupApp = {
  app_id: string;
  app_name?: string;
  actions?: unknown[];
  setup_url?: string;
  authenticated?: boolean;
};

export type ChatThreadItem =
  | { type: 'user'; key: string; text: string }
  | { type: 'agent'; key: string; text: string; question?: boolean }
  | { type: 'steps'; key: string; steps: ChatDecision[] };

export type ChatStepStatus = 'running' | 'waiting' | 'done' | 'failed';

/** Sent by the chat when the agent changed a workflow. Hosts showing that
 * workflow can reload it and highlight the nodes. */
export const AGENT_WORKFLOW_CHANGED_EVENT = 'shuffle:agent_workflow_changed';
export type AgentWorkflowChangedDetail = { workflowId: string; nodeIds: string[]; reverted?: boolean };

/** Sent when the user asks to see a node the agent touched. */
export const AGENT_FOCUS_NODE_EVENT = 'shuffle:agent_focus_node';
export type AgentFocusNodeDetail = { workflowId: string; nodeId: string };

/** Sent when the agent started a workflow run, or the user asks to see it.
 * Hosts showing that workflow can open the run in their own run view. */
export const AGENT_OPEN_EXECUTION_EVENT = 'shuffle:agent_open_execution';
export type AgentOpenExecutionDetail = { workflowId: string; executionId: string; authorization: string };

import { extractCleanDisplayPrompt } from '@/lib/docsPromptContext';

/** Prepended to the user's message in "Ask before changing" mode. */
export const ASK_FIRST_PREFIX =
  '(Mode: ask before changing) Before changing the workflow, use the ask action to show me a short numbered plan of the changes and wait for my confirmation. Then make the changes.\n\n';

export const stripModePrefix = (text?: string | null): string => {
  if (!text) return '';
  const withoutMode = text
    .replace(ASK_FIRST_PREFIX, '')
    .replace(/\n*=== USECASE CONTEXT ===[\s\S]*?(?:=== END USECASE CONTEXT ===|$)/g, '')
    .replace(/\n*=== DOCS ARTICLE CONTEXT ===[\s\S]*?(?:=== END DOCS CONTEXT ===|$)/g, '')
    .trim();
  return extractCleanDisplayPrompt(withoutMode);
};

export const parseJson = (value: unknown): BackendJson => {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalize = (value?: string) => (value || '').toLowerCase().replace(/[_\s-]/g, '');
export const humanize = (value?: string) => (value || '').replace(/_/g, ' ').trim();

/** Executions report seconds, agent decisions milliseconds. */
export const toSeconds = (value: unknown): number => {
  const number = Number(value) || 0;
  return number > 1e11 ? number / 1000 : number;
};

export const getField = (decision: ChatDecision | null | undefined, key: string): ChatField | undefined =>
  (decision?.fields || []).find((field) => field.key === key);

export const isAsk = (decision?: ChatDecision | null) => decision?.action === 'ask' || decision?.category === 'ask';
export const isFinish = (decision?: ChatDecision | null) =>
  ['finish', 'finalise'].includes(decision?.action || '') || ['finish', 'finalise'].includes(decision?.category || '');
export const isAction = (decision: ChatDecision | null | undefined, ...names: string[]) =>
  names.some((name) => normalize(decision?.action) === normalize(name));
/** A "continue" ask is the user's follow-up after a finished turn. */
export const isContinue = (decision?: ChatDecision | null) => isAsk(decision) && !!getField(decision, 'continue');

export const getDecisionOutput = (decision?: ChatDecision | null) => getField(decision, 'output')?.value || '';

// Tool results come back wrapped differently depending on how the tool ran
// ({success, body: {...}} in-process, or the raw app response). Walk until something matches.
const findInResult = (value: BackendJson, match: (v: BackendJson) => boolean, depth = 0): BackendJson => {
  if (!value || typeof value !== 'object' || depth > 6) return null;
  if (match(value)) return value;
  for (const key of Object.keys(value)) {
    const inner = typeof value[key] === 'string' && depth < 2 ? parseJson(value[key]) : value[key];
    const found = findInResult(inner, match, depth + 1);
    if (found) return found;
  }
  return null;
};

export const getResult = (decision?: ChatDecision | null) => parseJson(decision?.run_details?.raw_response);

export const getOperations = (decision?: ChatDecision | null): BackendJson[] => {
  const body = parseJson(getField(decision, 'body')?.value);
  return Array.isArray(body?.operations) ? body.operations : [];
};

export const getLookupApps = (decision?: ChatDecision | null): ChatLookupApp[] => {
  const list = findInResult(getResult(decision), (v) =>
    Array.isArray(v) && v.some((item) => item && typeof item === 'object' && 'app_id' in item && 'actions' in item));
  return Array.isArray(list) ? list : [];
};

export const getOpsResponse = (decision?: ChatDecision | null): BackendJson =>
  findInResult(getResult(decision), (v) => !Array.isArray(v) && ('operations_applied' in v || 'id_mapping' in v || 'failed_at_op' in v));

export const getFailureReason = (decision?: ChatDecision | null): string => {
  const result = getResult(decision);
  if (!result) {
    // e.g. "[ERROR] Decision marked as FAILURE due to 5 minute timeout."
    const raw = (decision?.run_details?.raw_response || '').trim();
    return decision?.run_details?.status === 'FAILURE' ? raw.replace(/^\[ERROR\]\s*/, '').substring(0, 200) : '';
  }
  const failed = findInResult(result, (v) => !Array.isArray(v) && v.success === false && (v.reason || v.error));
  return failed ? String(failed.reason || failed.error || '') : '';
};

export const getStepStatus = (decision: ChatDecision): ChatStepStatus => {
  const status = (decision.run_details?.status || '').toUpperCase();
  if (status === 'FAILURE' || getFailureReason(decision)) return 'failed';
  if (status === 'FINISHED' || status === 'SUCCESS') return 'done';
  if (status === 'WAITING') return 'waiting';
  return 'running';
};

export const getStepDuration = (decision: ChatDecision): number => {
  const { started_at: start, completed_at: end } = decision.run_details || {};
  return start && end ? Math.max(0, toSeconds(end) - toSeconds(start)) : 0;
};

/** Node id -> label, from the workflow the agent read or changed, plus nodes it created. */
export const getNodeLabels = (decisions: ChatDecision[]): Record<string, string> => {
  const labels: Record<string, string> = {};
  const addNodes = (workflow: BackendJson) => {
    for (const node of [...(workflow?.actions || []), ...(workflow?.triggers || [])]) {
      if (node?.id) labels[node.id] = node.label || node.app_name;
    }
  };

  for (const decision of decisions) {
    if (isAction(decision, 'get_minimal_workflow')) addNodes(getResult(decision)?.body || getResult(decision));
    const response = getOpsResponse(decision);
    addNodes(response?.workflow);
    for (const op of getOperations(decision)) {
      const data = parseJson(op.data) || {};
      const name = data.label || data.app_name;
      if (!name) continue;
      if (op.temp_id) labels[op.temp_id] = name;
      const realId = response?.id_mapping?.[op.temp_id];
      if (realId) labels[realId] = name;
    }
  }
  return labels;
};

export const describeOperation = (op: BackendJson, labels: Record<string, string>): string => {
  const data = parseJson(op?.data) || {};
  const labelOf = (id?: string) => (id && labels[id]) || 'a node';
  switch (op?.op) {
    case 'add_node':
      return `Added ${data.label || humanize(data.app_name) || 'a node'}${data.app_name && data.label ? ` (${humanize(data.app_name)})` : ''}`;
    case 'edit_node': {
      if (data.app_id || data.app_name) {
        return `Changed ${labelOf(op.id)} to ${humanize(data.app_name) || 'another app'}${data.action_name ? ` (${humanize(data.action_name)})` : ''}`;
      }
      const params = Array.isArray(data.parameters) ? data.parameters.map((param: BackendJson) => param?.name).filter(Boolean) : [];
      const renamed = data.label && data.label !== labels[op.id] ? `, renamed to ${data.label}` : '';
      return `Updated ${labelOf(op.id)}${params.length ? ` (${params.join(', ')})` : ''}${renamed}`;
    }
    case 'delete_node':
    case 'remove_node':
      return `Removed ${labelOf(op.id)}`;
    case 'move_node':
      return `Moved ${labelOf(op.id)}`;
    case 'add_branch':
      return `Connected ${labelOf(data.source_id)} to ${labelOf(data.destination_id)}`;
    case 'edit_branch':
      return data.source_id && data.destination_id
        ? `Reconnected ${labelOf(data.source_id)} to ${labelOf(data.destination_id)}`
        : 'Updated a branch';
    case 'delete_branch':
    case 'remove_branch':
      return 'Removed a branch';
    case 'add_condition':
    case 'edit_condition':
    case 'delete_condition':
      return `${humanize(op.op).replace(/^\w/, (c) => c.toUpperCase())} on a branch`;
    case 'set_start_node':
      return `Set ${labelOf(op.id)} as the start`;
    case 'save_workflow':
      return 'Saved the workflow';
    default:
      return humanize(op?.op);
  }
};

/** A plain-language label for one step, plus extra detail lines. */
export const describeStep = (decision: ChatDecision, labels: Record<string, string>): { label: string; details: string[] } => {
  if (isAction(decision, 'get_minimal_workflow')) return { label: 'Read the workflow', details: [] };
  if (isAction(decision, 'post_get_app_actions_summary', 'get_app_actions_summary')) {
    const body = parseJson(getField(decision, 'body')?.value) || {};
    const requested = body.app_names || getField(decision, 'app_names')?.value;
    const names = (Array.isArray(requested) ? requested : [requested]).filter(Boolean).map(humanize);
    return {
      label: `Looked up ${names.join(', ') || 'apps'}`,
      details: getLookupApps(decision).map((app) =>
        `${humanize(app.app_name)}: ${app.actions?.length || 0} actions, ${app.setup_url ? 'needs credentials' : 'ready to use'}`),
    };
  }
  if (isAction(decision, 'put_agent_update')) {
    const ops = getOperations(decision);
    const details = ops.filter((op) => op?.op !== 'save_workflow').map((op) => describeOperation(op, labels));
    const label = details.length === 0
      ? (ops.length ? 'Saved the workflow' : 'Updated the workflow')
      : details.length === 1 ? details[0] : `${details[0]} and ${details.length - 1} more`;
    return { label, details: details.length > 1 ? details : [] };
  }
  if (isAction(decision, 'post_create_workflow')) return { label: 'Created a new workflow', details: [] };
  if (isAction(decision, 'post_run_workflow')) return { label: 'Ran the workflow', details: [] };
  if (isAction(decision, 'get_workflow_execution', 'post_check_execution_results')) return { label: 'Checked the run results', details: [] };
  if (isAction(decision, 'get_apps_summary')) return { label: "Listed the org's apps", details: [] };
  return { label: [humanize(decision.tool), humanize(decision.action)].filter(Boolean).join(': ') || 'Step', details: [] };
};

/** Node ids a finished workflow edit touched, for highlighting on a canvas. */
export const getChangedNodeIds = (decision: ChatDecision): string[] => {
  const response = getOpsResponse(decision);
  const ids: string[] = [];
  for (const op of getOperations(decision)) {
    if (['edit_node', 'move_node'].includes(op?.op) && op.id) ids.push(op.id);
    if (op?.op === 'add_node') ids.push(response?.id_mapping?.[op.temp_id] || op.temp_id);
  }
  return ids.filter(Boolean);
};

/** Apps the agent found that need credentials and haven't been set up since. */
export const getAppsNeedingAuth = (decisions: ChatDecision[]): { id: string; name: string; url?: string }[] => {
  const byId: Record<string, { id: string; name: string; url?: string }> = {};
  for (const decision of decisions) {
    for (const app of getLookupApps(decision)) {
      if (!app?.app_id) continue;
      if (app.setup_url && !app.authenticated) {
        byId[app.app_id] = { id: app.app_id, name: humanize(app.app_name), url: app.setup_url };
      } else {
        delete byId[app.app_id];
      }
    }
  }
  return Object.values(byId);
};

/** The newest saved version of the workflow from before a chat started, from its
 *  revisions (`edited` and `startedAt` both in unix seconds). Every save writes one,
 *  and the editor saves right before starting a chat. */
export const pickRevisionBefore = (revisions: BackendJson[], startedAt: number): BackendJson | undefined => {
  let best: BackendJson | undefined;
  for (const revision of revisions || []) {
    const edited = Number(revision?.edited);
    if (!edited || edited > startedAt) continue;
    if (!best || edited > Number(best.edited)) best = revision;
  }
  return best;
};

const NODE_OPS = new Set(['add_node', 'edit_node', 'move_node', 'set_start_node']);

/** What the agent changed since the user's latest message. Only changes to nodes that
 *  are still in the workflow carry a nodeId; removals and branches have nothing to show. */
export const getLatestChanges = (decisions: ChatDecision[], labels: Record<string, string>): { text: string; nodeId?: string }[] => {
  const lastContinue = decisions.map(isContinue).lastIndexOf(true);
  const list: { text: string; nodeId?: string }[] = [];
  const lastUpdate = [...decisions].reverse().find((decision) => isAction(decision, 'put_agent_update') && getOpsResponse(decision)?.workflow);
  const workflow = getOpsResponse(lastUpdate)?.workflow;
  const existing = workflow ? new Set([...(workflow.actions || []), ...(workflow.triggers || [])].map((node: BackendJson) => node?.id)) : null;
  for (const decision of decisions.slice(lastContinue + 1)) {
    if (!isAction(decision, 'put_agent_update') || getStepStatus(decision) !== 'done') continue;
    const response = getOpsResponse(decision);
    for (const op of getOperations(decision)) {
      if (op?.op === 'save_workflow') continue;
      const nodeId = !NODE_OPS.has(op?.op) ? undefined : op.op === 'add_node' ? response?.id_mapping?.[op.temp_id] : op.id;
      list.push({
        text: describeOperation(op, labels),
        nodeId: nodeId && (!existing || existing.has(nodeId)) ? nodeId : undefined,
      });
    }
  }
  return list;
};

/** Problems the last workflow edit reported (node errors), for a "before you run" list. */
export const getWorkflowProblems = (decisions: ChatDecision[]): { text: string; nodeId?: string }[] => {
  const lastUpdate = [...decisions].reverse().find((decision) => isAction(decision, 'put_agent_update') && getOpsResponse(decision)?.workflow);
  const workflow = getOpsResponse(lastUpdate)?.workflow;
  const list: { text: string; nodeId?: string }[] = (workflow?.errors || []).map((error: string) => ({ text: error }));
  for (const node of [...(workflow?.actions || []), ...(workflow?.triggers || [])]) {
    for (const error of node.errors || []) list.push({ text: `${node.label}: ${error}`, nodeId: node.id });
  }
  return list;
};

// The decisions in one stored model reply ({choices: [{message: {content}}]})
const parseModelDecisions = (reply: unknown): ChatDecision[] => {
  const content = parseJson(reply)?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return [];
  const start = content.indexOf('[');
  const end = content.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  const parsed = parseJson(content.substring(start, end + 1));
  return Array.isArray(parsed) ? parsed : [];
};

/** Every answer the agent gave, oldest first. Continuing a chat rewrites the
 * previous finish decision into the user's follow-up, so older answers only
 * survive in the stored model replies. */
export const getAnswersFromModelReplies = (replies: unknown): string[] =>
  (Array.isArray(replies) ? replies : [])
    .flatMap(parseModelDecisions)
    .filter(isFinish)
    .map(getDecisionOutput)
    .filter(Boolean);

/**
 * The chat as turns: user message, the steps taken, then the agent's answer.
 * `knownAnswers` (finish decision id -> answer, seen earlier in this session)
 * wins over answers recovered from model replies, which are matched to turns
 * from the newest backwards in case older replies weren't kept.
 */
export const buildChatThread = ({
  prompt,
  decisions,
  finalAnswer,
  finished,
  knownAnswers = {},
  modelAnswers = [],
}: {
  prompt?: string;
  decisions: ChatDecision[];
  finalAnswer?: string;
  finished: boolean;
  knownAnswers?: Record<string, string>;
  modelAnswers?: string[];
}): ChatThreadItem[] => {
  const items: ChatThreadItem[] = [];
  if (prompt) items.push({ type: 'user', text: stripModePrefix(prompt), key: 'prompt' });

  // Right after a follow-up is sent the run already counts as working, but its last
  // decision is still the previous answer until the backend turns it into a continuation.
  const answered = finished || isFinish(decisions[decisions.length - 1]);
  const answeredTurns = decisions.filter(isContinue).length + (answered ? 1 : 0);
  const offset = modelAnswers.length - answeredTurns;
  const recovered = (turn: number) => (offset + turn >= 0 ? modelAnswers[offset + turn] : '');

  let turn = 0;
  let group: { type: 'steps'; key: string; steps: ChatDecision[] } | null = null;
  const closeGroup = () => {
    if (group) items.push(group);
    group = null;
  };

  for (const decision of decisions) {
    const id = decision.run_details?.id || `${decision.i}`;
    if (isAsk(decision)) {
      closeGroup();
      const continueField = getField(decision, 'continue');
      if (continueField) {
        const answer = knownAnswers[id] || recovered(turn);
        if (answer) items.push({ type: 'agent', text: answer, key: `answer-turn-${turn}` });
        turn += 1;
        if (continueField.answer) items.push({ type: 'user', text: stripModePrefix(continueField.answer), key: `continue-${id}` });
        continue;
      }

      const question = getField(decision, 'question');
      if (question?.value) items.push({ type: 'agent', text: question.value, key: `ask-${id}`, question: true });
      if (question?.answer) items.push({ type: 'user', text: stripModePrefix(question.answer), key: `answer-${id}` });
      continue;
    }

    if (isFinish(decision)) {
      closeGroup();
      continue;
    }

    if (!group) group = { type: 'steps', key: `group-${id}`, steps: [] };
    (group as { steps: ChatDecision[] }).steps.push(decision);
  }
  closeGroup();

  if (answered) {
    const answer = finalAnswer || recovered(turn);
    if (answer) items.push({ type: 'agent', text: answer, key: `answer-turn-${turn}` });
  }
  return items;
};

/** Questions that also want a yes before changing anything (e.g. a plan plus a
 * credentials link). Adding credentials must not count as that yes. */
export const asksForApproval = (question?: string | null) =>
  /\b(confirm|proceed|approve|go ahead|shall i|should i|would you like|do you want|ok to)\b/i.test(question || '');

/** One-click replies: the numbered options the agent listed, or Yes/No. */
export const getQuickReplies = (question?: string | null): string[] => {
  const text = (question || '').trim();
  if (!text) return [];
  const options = text
    .split('\n')
    .map((line) => line.match(/^\s*(\d+)[.)]\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => !!match)
    .map((match) => match[2].replace(/\*\*/g, '').trim());
  if (options.length >= 2 && options.length <= 6) return options.map((option) => (option.length > 60 ? `${option.substring(0, 57)}...` : option));

  const lastSentence = text.split(/(?<=[.!?])\s+/).pop() || '';
  if (/\?\s*$/.test(lastSentence) && /^(should|do|does|can|could|would|will|is|are|shall|may|want)\b/i.test(lastSentence.trim())) return ['Yes', 'No'];
  return asksForApproval(text) ? ['Yes, go ahead', 'No'] : [];
};

export const formatDuration = (seconds: number): string => {
  if (!seconds || seconds < 0) return '';
  if (seconds < 1) return '<1s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
};

export type ChatWorkflowRun = { decisionId: string; workflowId: string; executionId: string; authorization: string };

/** Workflow runs the agent started, from the run tool's response. */
export const getWorkflowRuns = (decisions: ChatDecision[]): ChatWorkflowRun[] =>
  decisions.flatMap((decision) => {
    if (!isAction(decision, 'post_run_workflow', 'run_workflow', 'execute_workflow')) return [];
    const started = findInResult(getResult(decision), (v) => !Array.isArray(v) && typeof v.execution_id === 'string' && typeof v.authorization === 'string');
    if (!started) return [];
    const workflowId = getField(decision, 'workflowId')?.value || getField(decision, 'workflow_id')?.value || started.workflow_id || '';
    return [{ decisionId: decision.run_details?.id || `${decision.i}`, workflowId: String(workflowId), executionId: started.execution_id, authorization: started.authorization }];
  });

export type RunNodeStatus = 'done' | 'failed' | 'skipped' | 'running' | 'waiting' | 'not run';
export type RunNode = { id: string; label: string; status: RunNodeStatus; reason?: string };

const resultReason = (result: unknown): string => {
  const parsed = parseJson(result);
  if (parsed && typeof parsed === 'object') {
    const text = parsed.reason || parsed.error || parsed.message || parsed.details;
    if (typeof text === 'string') return text.substring(0, 300);
  }
  return typeof result === 'string' ? result.substring(0, 300) : '';
};

/** Each node of a workflow run as the engine recorded it, in workflow order.
 * Nodes without a result are "waiting" when everything before them is done, else "not run". */
export const getRunNodes = (execution: BackendJson): RunNode[] => {
  const actions: BackendJson[] = execution?.workflow?.actions || [];
  const branches: BackendJson[] = execution?.workflow?.branches || [];
  const results: BackendJson[] = execution?.results || [];
  const byId: Record<string, BackendJson> = {};
  results.forEach((result) => { if (result?.action?.id) byId[result.action.id] = result; });
  const finished = ['FINISHED', 'ABORTED', 'FAILURE'].includes(String(execution?.status || '').toUpperCase());

  return actions.map((action) => {
    const result = byId[action.id];
    const label = humanize(action.label || action.name || action.app_name);
    const status = String(result?.status || '').toUpperCase();
    if (status === 'SUCCESS') return { id: action.id, label, status: 'done' };
    if (status === 'FAILURE' || status === 'ABORTED') return { id: action.id, label, status: 'failed', reason: resultReason(result.result) };
    if (status === 'SKIPPED') return { id: action.id, label, status: 'skipped' };
    if (status) return { id: action.id, label, status: 'running' };
    if (finished) return { id: action.id, label, status: 'not run' };
    const parents = branches.filter((branch) => branch.destination_id === action.id).map((branch) => branch.source_id);
    const ready = parents.length === 0 ? action.id === execution?.start : parents.every((id) => byId[id]);
    return { id: action.id, label, status: ready ? 'waiting' : 'not run' };
  });
};

/** Seconds since the run last made progress (started, or a node finished). */
export const getRunIdleSeconds = (execution: BackendJson, nowMs: number): number => {
  const times = [toSeconds(execution?.started_at), ...((execution?.results || []) as BackendJson[]).map((r) => toSeconds(r?.completed_at))].filter(Boolean);
  return times.length ? nowMs / 1000 - Math.max(...times) : 0;
};
