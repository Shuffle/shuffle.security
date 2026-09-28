/**
 * Agent Activity service — standalone fetcher for agent workflow executions.
 *
 * Self-contained: uses only the lib's API_CONFIG / getApiUrl / getAuthHeader
 * so it works in npm consumers without any project-side hooks or contexts.
 */

import { API_CONFIG, getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { safeRandomUUID } from '@/Shuffle-MCPs/uuid';

export interface AgentRunResult {
  action?: {
    app_name?: string;
    label?: string;
    id?: string;
  };
  result?: string;
  status?: string;
}

export interface AgentDecision {
  title?: string;
  description?: string;
  status?: string;
  timestamp?: string | number;
  duration?: number;
  action?: string;
  result?: string;
  tool?: string;
  reason?: string;
  category?: string;
  confidence?: number;
  runs?: string | number;
  fields?: unknown;
  approval_required?: boolean;
  run_details?: unknown;
  [key: string]: unknown;
}

export interface AgentRun {
  execution_id: string;
  workflow_id: string;
  status: string;
  started_at: string;
  completed_at?: string;
  result?: string;
  results?: AgentRunResult[];
  decisions?: AgentDecision[];
  execution_argument?: string;
  execution_source?: string;
  authorization?: string;
  workflow?: {
    name?: string;
    description?: string;
    actions?: Array<{
      app_name?: string;
      label?: string;
    }>;
  };
  duration?: number;
}

export interface AgentActivityResponse {
  success: boolean;
  runs: AgentRun[];
  cursor: string;
}

export interface AgentActivityParams {
  cursor?: string;
  limit?: number;
  /** Optional page size sent as the `?top` query parameter. */
  top?: number;
  status?: string;
  startTime?: string;
  endTime?: string;
  suborgRuns?: boolean;
  /** Override the lib's shared apiKey for this call. */
  apiKey?: string;
  /** Override the lib's shared baseUrl for this call. */
  apiBaseUrl?: string;
  /** Optional Shuffle Org ID — sent as the `Org-Id` header. */
  orgId?: string;
  /** Workflow ID to search. Defaults to the synthetic 'AGENT' grouping. */
  workflowId?: string;
}

const resolveUrl = (path: string, baseUrl?: string): string =>
  baseUrl ? `${baseUrl.replace(/\/+$/, '')}${path}` : getApiUrl(path);

const resolveHeaders = (apiKey?: string, orgId?: string): Record<string, string> => {
  const h: Record<string, string> = apiKey
    ? { Authorization: `Bearer ${apiKey}` }
    : { ...getAuthHeader() };
  if (orgId) h['Org-Id'] = orgId;
  return h;
};

const uuid = (): string => safeRandomUUID();

export type ScheduleStepId = 'name' | 'workflow' | 'schedule';
export type ScheduleStepState = 'active' | 'done' | 'error';
export interface ScheduleStepEvent {
  id: ScheduleStepId;
  state: ScheduleStepState;
  detail?: string;
}

export interface ScheduleAgentRunArgs {
  cron: string;
  input: string;
  apps?: Array<{ name: string; id?: string; icon?: string }>;
  onStep?: (event: ScheduleStepEvent) => void;
  apiKey?: string;
  apiBaseUrl?: string;
  orgId?: string;
}

const buildAppNameValue = (apps: Array<{ name: string }> = []): string =>
  apps.filter((a) => !!a?.name).map((a) => a.name).join(',');

const buildScheduleName = (input: string): { name: string; description: string } => {
  const prompt = (input || '').trim();
  const words = prompt
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  const title = words.length
    ? words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    : 'Scheduled Agent Run';
  return { name: title.slice(0, 80), description: (prompt || 'Scheduled Agent Run').slice(0, 240) };
};

/**
 * Search agent workflow executions (workflow_id = "AGENT" by default).
 */
export const searchAgentActivity = async (
  params: AgentActivityParams = {}
): Promise<AgentActivityResponse> => {
  const {
    cursor = '',
    limit = 50,
    top,
    status = '',
    startTime = '',
    endTime = '',
    suborgRuns = false,
    apiKey,
    apiBaseUrl,
    orgId,
    workflowId = 'AGENT',
  } = params;

  const payload = {
    workflow_id: workflowId,
    cursor,
    limit,
    status,
    start_time: startTime,
    end_time: endTime,
    suborg_runs: suborgRuns,
  };

  const query = typeof top === 'number' && top > 0 ? `?top=${top}` : '';

  const response = await fetch(resolveUrl(`/api/v1/workflows/search${query}`, apiBaseUrl), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...resolveHeaders(apiKey, orgId),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch agent activity: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    success: data.success ?? false,
    runs: data.runs || [],
    cursor: data.cursor || '',
  };
};

export interface AgentScheduleWorkflow {
  id: string;
  name: string;
  description?: string;
}

/**
 * List workflows of type AGENT_SCHEDULE — used to populate the agentic
 * workflow dropdown in the activity list.
 */
export const listAgentScheduleWorkflows = async (
  params: { apiKey?: string; apiBaseUrl?: string; orgId?: string } = {},
): Promise<AgentScheduleWorkflow[]> => {
  const { apiKey, apiBaseUrl, orgId } = params;
  const response = await fetch(resolveUrl('/api/v1/workflows', apiBaseUrl), {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...resolveHeaders(apiKey, orgId) },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch workflows: ${response.statusText}`);
  }
  const data = await response.json();
  const list: any[] = Array.isArray(data) ? data : (data?.workflows || []);
  return list
    .filter((w) => w && w.workflow_type === 'AGENT_SCHEDULE')
    .map((w) => ({ id: w.id || w._id, name: w.name || 'Untitled', description: w.description }));
};

/** Create a scheduled AI Agent workflow directly from the library. */
export const scheduleAgentRun = async ({ cron, input, apps = [], onStep, apiKey, apiBaseUrl, orgId }: ScheduleAgentRunArgs) => {
  const headers = { 'Content-Type': 'application/json', ...resolveHeaders(apiKey, orgId) };
  const step = (id: ScheduleStepId, state: ScheduleStepState, detail?: string) => {
    try { onStep?.({ id, state, detail }); } catch { /* ignore */ }
  };

  step('name', 'active');
  const { name, description } = buildScheduleName(input);
  step('name', 'done', name);

  step('workflow', 'active');
  const createRes = await fetch(resolveUrl('/api/v1/workflows', apiBaseUrl), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ name, description }),
  });
  if (!createRes.ok) {
    step('workflow', 'error', `HTTP ${createRes.status}`);
    throw new Error(`Create workflow failed (${createRes.status})`);
  }
  const created = await createRes.json();
  const workflowId: string = created.id || created._id || created.workflow_id;
  if (!workflowId) {
    step('workflow', 'error', 'no id returned');
    throw new Error('Workflow created but no id returned');
  }

  const triggerId = uuid();
  const actionId = uuid();
  const branchId = uuid();
  const trigger = {
    app_name: 'Schedule', app_version: '1.0.0', environment: 'cloud', id_: triggerId, _id_: triggerId, id: triggerId,
    finished: true, label: name, type: 'TRIGGER', is_valid: true, trigger_type: 'SCHEDULE', status: 'running', name: 'Schedule',
    parameters: [{ name: 'cron', example: '', value: cron }, { name: 'execution_argument', example: '', value: '' }],
    position: { x: 254, y: 617 }, flowOrientation: 'horizontal',
  };
  const action = {
    name: 'Run LLM', label: 'AI_Agent_1', app_name: 'AI Agent', app_version: '1.0.0', app_id: 'shuffle_agent',
    description: 'Run an LLM query against any tool you want', environment: 'Cloud', errors: [], id_: actionId, _id_: actionId, id: actionId,
    is_valid: true, type: 'ACTION', isStartNode: true, run_magic_output: false, authentication: [], example: '', category: '', authentication_id: '',
    template: false, finished: true, flowOrientation: 'horizontal', position: { x: 517, y: 370 }, selectedAuthentication: {}, circleId: uuid(), execution_delay: 0,
    parameters: [
      { name: 'app_name', value: buildAppNameValue(apps), required: true, description: 'Comma-separated list of app names the agent is allowed to use.' },
      { name: 'input', value: input, required: true, multiline: true, description: 'The input data for the LLM query' },
    ],
  };
  const updated = { ...created, id: workflowId, name, description, start: actionId, workflow_type: 'AGENT_SCHEDULE', actions: [action], triggers: [trigger], branches: [{ source_id: triggerId, destination_id: actionId, id: branchId }] };

  const putRes = await fetch(resolveUrl(`/api/v1/workflows/${workflowId}`, apiBaseUrl), {
    method: 'PUT', credentials: 'include', headers, body: JSON.stringify(updated),
  });
  if (!putRes.ok) {
    step('workflow', 'error', `HTTP ${putRes.status}`);
    throw new Error(`Update workflow failed (${putRes.status})`);
  }
  step('workflow', 'done', name);

  step('schedule', 'active');
  const schedRes = await fetch(resolveUrl(`/api/v1/workflows/${workflowId}/schedule`, apiBaseUrl), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({
      name: 'Schedule', frequency: cron, cron, execution_argument: '', environment: 'cloud', id: triggerId, start: actionId,
      parameters: [{ name: 'cron', value: cron }, { name: 'execution_argument', value: '' }],
    }),
  }).catch(async (err) => {
    await fetch(resolveUrl(`/api/v1/workflows/${workflowId}`, apiBaseUrl), { method: 'DELETE', credentials: 'include', headers: resolveHeaders(apiKey, orgId) }).catch(() => undefined);
    throw err;
  });

  if (!schedRes.ok) {
    const errText = await schedRes.text().catch(() => '');
    await fetch(resolveUrl(`/api/v1/workflows/${workflowId}`, apiBaseUrl), { method: 'DELETE', credentials: 'include', headers: resolveHeaders(apiKey, orgId) }).catch(() => undefined);
    step('schedule', 'error', `HTTP ${schedRes.status}`);
    throw new Error(`Scheduler rejected the cron \`${cron}\` (HTTP ${schedRes.status})${errText ? `: ${errText}` : ''}. The workflow has been deleted.`);
  }
  step('schedule', 'done', cron);
  return { workflowId, name, cron };
};

/** Find the AI Agent action's `input` parameter inside a workflow. */
const findAgentInputParam = (workflow: any): { action: any; param: any } | null => {
  const actions: any[] = workflow?.actions || [];
  for (const a of actions) {
    if ((a?.app_name || '').toLowerCase().includes('ai agent') || a?.app_id === 'shuffle_agent') {
      const params: any[] = a?.parameters || [];
      const p = params.find((x) => x?.name === 'input');
      if (p) return { action: a, param: p };
    }
  }
  return null;
};

/** Fetch a single workflow by ID. */
export const getWorkflow = async (
  workflowId: string,
  params: { apiKey?: string; apiBaseUrl?: string; orgId?: string } = {},
): Promise<any> => {
  const { apiKey, apiBaseUrl, orgId } = params;
  const res = await fetch(resolveUrl(`/api/v1/workflows/${workflowId}`, apiBaseUrl), {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...resolveHeaders(apiKey, orgId) },
  });
  if (!res.ok) throw new Error(`Failed to fetch workflow: ${res.statusText}`);
  return res.json();
};

/** Read the AI Agent prompt from a scheduled agent workflow. */
export const getAgentSchedulePrompt = async (
  workflowId: string,
  params: { apiKey?: string; apiBaseUrl?: string; orgId?: string } = {},
): Promise<{ workflow: any; prompt: string }> => {
  const workflow = await getWorkflow(workflowId, params);
  const found = findAgentInputParam(workflow);
  return { workflow, prompt: String(found?.param?.value || '') };
};

/** Read the AI Agent prompt + selected app names from a scheduled agent
 *  workflow. Apps are parsed from the AI Agent action's `app_name`
 *  parameter (comma-separated list of app names). */
export const getAgentScheduleConfig = async (
  workflowId: string,
  params: { apiKey?: string; apiBaseUrl?: string; orgId?: string } = {},
): Promise<{ workflow: any; prompt: string; apps: Array<{ name: string; id?: string }> }> => {
  const workflow = await getWorkflow(workflowId, params);
  const found = findAgentInputParam(workflow);
  const prompt = String(found?.param?.value || '');
  const action = found?.action;
  const actionParams: any[] = action?.parameters || [];
  const appNameParam = actionParams.find((x) => x?.name === 'app_name');
  const raw = String(appNameParam?.value || '');
  const apps = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
  return { workflow, prompt, apps };
};

/** Update the AI Agent prompt on a scheduled agent workflow. Overwrites
 *  the `input` parameter with exactly what the caller passes — no merging,
 *  no appended boilerplate. */
export const updateAgentSchedulePrompt = async (
  workflowId: string,
  newPrompt: string,
  params: { apiKey?: string; apiBaseUrl?: string; orgId?: string } = {},
): Promise<void> => {
  const { apiKey, apiBaseUrl, orgId } = params;
  const workflow = await getWorkflow(workflowId, params);
  const found = findAgentInputParam(workflow);
  if (!found) throw new Error('No AI Agent action found on this workflow');
  found.param.value = newPrompt;
  const res = await fetch(resolveUrl(`/api/v1/workflows/${workflowId}`, apiBaseUrl), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...resolveHeaders(apiKey, orgId) },
    body: JSON.stringify(workflow),
  });
  if (!res.ok) throw new Error(`Failed to update workflow: ${res.statusText}`);
};

/** Update both the prompt and the selected apps on a scheduled agent
 *  workflow. The `apps` array is written as a comma-separated list of app
 *  names to the AI Agent action's `app_name` parameter. */
export const updateAgentScheduleConfig = async (
  workflowId: string,
  config: { prompt: string; apps: Array<{ name: string; id?: string }> },
  params: { apiKey?: string; apiBaseUrl?: string; orgId?: string } = {},
): Promise<void> => {
  const { apiKey, apiBaseUrl, orgId } = params;
  const workflow = await getWorkflow(workflowId, params);
  const found = findAgentInputParam(workflow);
  if (!found) throw new Error('No AI Agent action found on this workflow');
  found.param.value = config.prompt;
  const action = found.action;
  const appValue = (config.apps || [])
    .filter((a) => !!a?.name)
    .map((a) => a.name)
    .join(',');
  const params_: any[] = action.parameters || [];
  const appNameParam = params_.find((x) => x?.name === 'app_name');
  if (appNameParam) {
    appNameParam.value = appValue;
  } else {
    params_.push({
      name: 'app_name',
      value: appValue,
      required: true,
      description: 'Comma-separated list of app names the agent is allowed to use.',
    });
    action.parameters = params_;
  }
  const res = await fetch(resolveUrl(`/api/v1/workflows/${workflowId}`, apiBaseUrl), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...resolveHeaders(apiKey, orgId) },
    body: JSON.stringify(workflow),
  });
  if (!res.ok) throw new Error(`Failed to update workflow: ${res.statusText}`);
};

/** Stop the schedule entirely by deleting the wrapper workflow. */
export const stopAgentSchedule = async (
  workflowId: string,
  params: { apiKey?: string; apiBaseUrl?: string; orgId?: string } = {},
): Promise<void> => {
  const { apiKey, apiBaseUrl, orgId } = params;
  const headers = { ...resolveHeaders(apiKey, orgId) };

  // 1. Delete the schedule trigger(s) first so the cron stops firing.
  try {
    const workflow = await getWorkflow(workflowId, params);
    const triggers: any[] = workflow?.triggers || [];
    const scheduleIds = triggers
      .filter((t) => (t?.trigger_type || '').toUpperCase() === 'SCHEDULE')
      .map((t) => t?.id || t?.id_ || t?._id_)
      .filter(Boolean);
    await Promise.all(
      scheduleIds.map((sid) =>
        fetch(resolveUrl(`/api/v1/workflows/${workflowId}/schedule/${sid}`, apiBaseUrl), {
          method: 'DELETE',
          credentials: 'include',
          headers,
        }).catch(() => undefined),
      ),
    );
  } catch {
    // Non-fatal — proceed to delete the workflow regardless.
  }

  // 2. Delete the workflow itself.
  const res = await fetch(resolveUrl(`/api/v1/workflows/${workflowId}`, apiBaseUrl), {
    method: 'DELETE',
    credentials: 'include',
    headers,
  });
  if (!res.ok) throw new Error(`Failed to stop schedule: ${res.statusText}`);
};

export interface AbortAgentExecutionParams {
  workflowId: string;
  executionId: string;
  authorization?: string;
  apiKey?: string;
  apiBaseUrl?: string;
  orgId?: string;
}

/** Abort an in-flight agent execution. Mirrors the AgentUI abort logic so
 *  other components can stop runs without reaching into UI hooks. */
export const abortAgentExecution = async ({
  workflowId,
  executionId,
  authorization,
  apiKey,
  apiBaseUrl,
  orgId,
}: AbortAgentExecutionParams): Promise<void> => {
  const headers: Record<string, string> = { ...resolveHeaders(apiKey, orgId) };
  if (authorization) headers.Authorization = `Bearer ${authorization}`;
  const res = await fetch(
    resolveUrl(`/api/v1/workflows/${workflowId}/executions/${executionId}/abort`, apiBaseUrl),
    {
      method: 'GET',
      credentials: 'include',
      headers,
    },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `Failed to abort execution: HTTP ${res.status}`);
  }
};

// Re-export so consumers can read base config if needed.
export { API_CONFIG };


