/**
 * useScheduleAgentRun — shared handler that turns an AgentUI prompt + cron
 * expression into a real Shuffle SCHEDULE workflow. Used by both the
 * /agents page and the global agent drawer so scheduling works anywhere
 * the user can start or debug an agent.
 *
 * Behavior:
 *  1. Generate a short name + description from the prompt via the internal
 *     LLM gateway (falls back gracefully on failure).
 *  2. POST /api/v1/workflows to create the wrapper workflow.
 *  3. PUT /api/v1/workflows/:id with a Schedule trigger + AI Agent action +
 *     branch.
 *  4. POST /api/v1/workflows/:id/schedule with the cron in `frequency`.
 *  5. If step 4 fails (network or HTTP), DELETE the workflow and surface a
 *     clear error message including the cron + server reason.
 */

import { useCallback } from 'react';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { askAI } from '@/services/ai';
import { safeRandomUUID } from '@/utils/uuid';

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
  presetId?: string;
  onStep?: (event: ScheduleStepEvent) => void;
}

const buildAppNameValue = (apps: Array<{ name: string }>): string => {
  if (!apps || apps.length === 0) return '';
  return apps
    .filter((a) => !!a?.name)
    .map((a) => a.name)
    .join(',');
};

export const useScheduleAgentRun = () => {
  return useCallback(async ({ cron, input, apps, presetId, onStep }: ScheduleAgentRunArgs) => {
    const step = (id: ScheduleStepId, state: ScheduleStepState, detail?: string) => {
      try { onStep?.({ id, state, detail }); } catch { /* ignore */ }
    };

    // 1. Short name + description (raw text response, parsed locally).
    step('name', 'active');
    const promptText = (input || '').trim();
    const fallbackName = promptText.slice(0, 40) || 'Scheduled Agent Run';
    const fallbackDescription = promptText || 'Scheduled Agent Run';
    let name = '';
    let description = '';
    try {
      const { success, result } = await askAI({
        query: [
          'You are naming a scheduled AI Agent workflow based on the user prompt below.',
          'The name and description MUST be specific to what the prompt actually does — not generic. Reference the concrete subject, action, or target from the prompt (for example "Daily phishing inbox triage" or "Hourly EDR alert summary"), never placeholders like "Scheduled Agent Run".',
          '',
          'Return ONLY a single JSON object, no markdown, no code fences, no commentary, in this EXACT shape:',
          '{',
          '  "name": "<3-6 words, Title Case, specific to the prompt>",',
          '  "description": "<one sentence, max 20 words, summarising what this scheduled run does>"',
          '}',
          '',
          'Prompt:',
          input,
        ].join('\n'),
        outputFormat: 'formatting',
      });
      if (success && result) {
        const cleaned = result.replace(/^```[a-zA-Z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        try {
          const parsed = JSON.parse(cleaned);
          if (parsed?.name) name = String(parsed.name).replace(/^["']|["']$/g, '').slice(0, 80);
          if (parsed?.description) description = String(parsed.description).replace(/^["']|["']$/g, '').slice(0, 240);
        } catch {
          // Fallback: try to recover from a near-miss response.
          const nameMatch = result.match(/"name"\s*:\s*"([^"]+)"/i);
          const descMatch = result.match(/"description"\s*:\s*"([^"]+)"/i);
          if (nameMatch?.[1]) name = nameMatch[1].slice(0, 80);
          if (descMatch?.[1]) description = descMatch[1].slice(0, 240);
        }
      }
    } catch (e) {
      console.warn('[schedule] AI name generation failed, using fallback', e);
    }
    if (!name) name = fallbackName;
    if (!description) description = fallbackDescription;
    step('name', 'done', name);

    // 2. Create the workflow.
    step('workflow', 'active');
    const createRes = await fetch(getApiUrl('/api/v1/workflows'), {
      method: 'POST',
      credentials: 'include',
      headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
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

    // 3. Build trigger + action + branch and PUT the full workflow.
    const triggerId = uuid();
    const actionId = uuid();
    const branchId = uuid();

    const trigger = {
      app_name: 'Schedule',
      app_version: '1.0.0',
      environment: 'cloud',
      id_: triggerId,
      _id_: triggerId,
      id: triggerId,
      finished: true,
      label: name,
      type: 'TRIGGER',
      is_valid: true,
      trigger_type: 'SCHEDULE',
      status: 'running',
      name: 'Schedule',
      parameters: [
        { name: 'cron', example: '', value: cron },
        { name: 'execution_argument', example: '', value: '' },
      ],
      position: { x: 254, y: 617 },
      flowOrientation: 'horizontal',
    };

    const action = {
      name: 'Run LLM',
      label: 'AI_Agent_1',
      app_name: 'AI Agent',
      app_version: '1.0.0',
      app_id: 'shuffle_agent',
      description: 'Run an LLM query against any tool you want',
      environment: 'Cloud',
      errors: [],
      id_: actionId,
      _id_: actionId,
      id: actionId,
      is_valid: true,
      type: 'ACTION',
      parameters: [
        {
          name: 'app_name',
          value: buildAppNameValue(apps || []),
          required: true,
          description: 'Comma-separated list of app names the agent is allowed to use.',
        },
        {
          name: 'input',
          value: input,
          required: true,
          multiline: true,
          description: 'The input data for the LLM query',
        },
        ...(presetId
          ? [{
              name: 'preset_id',
              value: presetId,
              required: false,
              description: 'Agent preset to apply on the backend.',
            }]
          : []),
      ],
      isStartNode: true,
      run_magic_output: false,
      authentication: [],
      example: '',
      category: '',
      authentication_id: '',
      template: false,
      finished: true,
      flowOrientation: 'horizontal',
      position: { x: 517, y: 370 },
      selectedAuthentication: {},
      circleId: uuid(),
      execution_delay: 0,
    };

    const branch = { source_id: triggerId, destination_id: actionId, id: branchId };

    const updated = {
      ...created,
      id: workflowId,
      name,
      description,
      start: actionId,
      workflow_type: 'AGENT_SCHEDULE',
      actions: [action],
      triggers: [trigger],
      branches: [branch],
    };

    const putRes = await fetch(getApiUrl(`/api/v1/workflows/${workflowId}`), {
      method: 'PUT',
      credentials: 'include',
      headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (!putRes.ok) {
      step('workflow', 'error', `HTTP ${putRes.status}`);
      throw new Error(`Update workflow failed (${putRes.status})`);
    }
    step('workflow', 'done', name);

    // 4. Start the schedule. If this fails, roll back by deleting the workflow.
    step('schedule', 'active');
    let schedRes: Response;
    try {
      schedRes = await fetch(getApiUrl(`/api/v1/workflows/${workflowId}/schedule`), {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Schedule',
          frequency: cron,
          cron,
          execution_argument: '',
          environment: 'cloud',
          id: triggerId,
          start: actionId,
          parameters: [
            { name: 'cron', value: cron },
            { name: 'execution_argument', value: '' },
          ],
        }),
      });
    } catch (err) {
      await fetch(getApiUrl(`/api/v1/workflows/${workflowId}`), {
        method: 'DELETE',
        credentials: 'include',
        headers: { ...getAuthHeader() },
      }).catch(() => {});
      step('schedule', 'error', 'network');
      throw new Error(
        `Could not reach the scheduler — workflow rolled back. ${err instanceof Error ? err.message : ''}`.trim(),
      );
    }

    if (!schedRes.ok) {
      const errText = await schedRes.text().catch(() => '');
      await fetch(getApiUrl(`/api/v1/workflows/${workflowId}`), {
        method: 'DELETE',
        credentials: 'include',
        headers: { ...getAuthHeader() },
      }).catch(() => {});

      let detail = errText;
      try {
        const parsed = JSON.parse(errText);
        detail = parsed?.reason || parsed?.error || parsed?.message || errText;
      } catch {
        /* keep raw text */
      }
      step('schedule', 'error', `HTTP ${schedRes.status}`);
      throw new Error(
        `Scheduler rejected the cron \`${cron}\` (HTTP ${schedRes.status})${detail ? `: ${detail}` : ''}. The workflow has been deleted — please adjust the schedule and try again.`,
      );
    }
    step('schedule', 'done', cron);

    return { workflowId, name, cron };
  }, []);
};
