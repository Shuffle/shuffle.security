/**
 * Service to send raw sample alerts to an ingestion webhook, validate
 * workflow execution results for ingest issues, and poll for the materialized
 * incident in the datastore.
 */

import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { getDatastoreByCategory, DATASTORE_CATEGORIES, DatastoreItem } from '@/Shuffle-MCPs/datastore';
import { fetchExecution, WorkflowExecution } from '@/Shuffle-Core/components/WorkflowRunExplorer';
import { getNextSampleAlert, SampleAlert } from '@/services/sampleAlerts';

export type IngestionStage = 'idle' | 'sending' | 'validating' | 'polling' | 'complete' | 'failed';

export interface IngestionValidationProgress {
  stage: IngestionStage;
  message: string;
}

export interface IngestExecutionIssue {
  actionName: string;
  errorMessage: string;
  status?: string;
}

export interface IngestionValidationResult {
  success: boolean;
  stage: IngestionStage;
  alert: SampleAlert;
  executionId?: string;
  executionStatus?: string;
  incidentKey?: string;
  issues?: IngestExecutionIssue[];
  errorMessage?: string;
  warningMessage?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Counts and checks for parameter-level errors inside an action result
 * (e.g. liquid_error, shuffle_error).
 */
export const countActionErrors = (result: any): number => {
  if (!result?.action?.parameters?.length) return 0;
  const params = result.action.parameters;
  let count = 0;
  for (const param of params) {
    if (
      param?.name &&
      param.name.endsWith('_error') &&
      (param.name.startsWith('shuffle_') || param.name.startsWith('liquid_'))
    ) {
      count += 1;
    }
  }
  return count;
};

/**
 * Extracts a human-readable error description from an action execution result.
 */
export const extractActionError = (result: any): string | null => {
  if (!result) return null;

  // 1. Check parameter-level errors (Liquid syntax error, template error, etc.)
  if (result.action?.parameters?.length) {
    for (const p of result.action.parameters) {
      if (
        p?.name &&
        p.name.endsWith('_error') &&
        (p.name.startsWith('shuffle_') || p.name.startsWith('liquid_'))
      ) {
        if (p.value) {
          const valStr = typeof p.value === 'string' ? p.value : JSON.stringify(p.value);
          return valStr;
        }
      }
    }
  }

  // 2. Check result body for error fields
  if (result.result) {
    if (typeof result.result === 'string') {
      if (/error|fail|exception/i.test(result.result)) {
        return result.result.slice(0, 240);
      }
    } else if (typeof result.result === 'object') {
      if (result.result.error) return String(result.result.error);
      if (result.result.reason) return String(result.result.reason);
      if (result.result.message && result.result.success === false) return String(result.result.message);
    }
  }

  // 3. Fallback to status flag
  if (result.status === 'FAILURE' || result.status === 'ERROR' || result.status === 'ABORTED') {
    return `Action returned ${result.status}`;
  }

  return null;
};

/**
 * Fetches the list of executions for a given workflow.
 */
const fetchWorkflowExecutions = async (workflowId: string): Promise<any[]> => {
  try {
    const res = await fetch(getApiUrl(`/api/v2/workflows/${workflowId}/executions`), {
      credentials: 'include',
      headers: { ...getAuthHeader() },
    });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data?.executions || [];
    }
  } catch {
    // Try v1 fallback
    try {
      const v1Res = await fetch(getApiUrl(`/api/v1/workflows/${workflowId}/executions`), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });
      if (v1Res.ok) {
        const data = await v1Res.json();
        return Array.isArray(data) ? data : data?.executions || [];
      }
    } catch {
      // Best-effort
    }
  }
  return [];
};

/**
 * Broadcasts refresh event to update all incident views and datastore listeners.
 */
export const broadcastIncidentRefresh = () => {
  try {
    window.dispatchEvent(new CustomEvent('demo:refresh', { detail: { category: DATASTORE_CATEGORIES.INCIDENTS } }));
    [600, 1800, 3500].forEach((delay) => {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('demo:refresh', { detail: { category: DATASTORE_CATEGORIES.INCIDENTS } }));
      }, delay);
    });
  } catch {
    // SSR / older browser fallback
  }
};

/**
 * Sends a raw alert payload to the ingestion webhook, tracks execution
 * to validate ingest health, and polls datastore for the new incident.
 */
export async function sendSampleIncidentAndValidate({
  webhookUrl,
  workflowId,
  sampleAlert,
  onProgress,
}: {
  webhookUrl: string;
  workflowId?: string | null;
  sampleAlert?: SampleAlert;
  onProgress?: (progress: IngestionValidationProgress) => void;
}): Promise<IngestionValidationResult> {
  const alert = sampleAlert || getNextSampleAlert();

  // 1. Snapshot baseline
  onProgress?.({ stage: 'sending', message: `Preparing test incident (${alert.sourceName})...` });

  let initialExecIds = new Set<string>();
  if (workflowId) {
    const execs = await fetchWorkflowExecutions(workflowId);
    initialExecIds = new Set(execs.map((e: any) => e.execution_id || e.id).filter(Boolean));
  }

  let initialIncidentKeys = new Set<string>();
  try {
    const datastoreRes = await getDatastoreByCategory(DATASTORE_CATEGORIES.INCIDENTS);
    const incidentItems = datastoreRes.data || (datastoreRes as { items?: DatastoreItem[] }).items;
    if (datastoreRes.success && Array.isArray(incidentItems)) {
      initialIncidentKeys = new Set(incidentItems.map((item: DatastoreItem) => item.key));
    }
  } catch {
    // Best-effort baseline
  }

  // 2. Post raw alert payload to webhook URL
  onProgress?.({ stage: 'sending', message: `Sending ${alert.sourceName} alert to webhook...` });

  let executionId: string | null = null;
  try {
    const postRes = await fetch(webhookUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(alert.payload),
    });

    if (!postRes.ok) {
      const errText = await postRes.text().catch(() => '');
      return {
        success: false,
        stage: 'failed',
        alert,
        errorMessage: `Webhook returned HTTP ${postRes.status}${errText ? `: ${errText.slice(0, 120)}` : ''}`,
      };
    }

    const postData = await postRes.json().catch(() => null);
    if (postData) {
      executionId = postData.execution_id || postData.id || postData.executionId || null;
    }
  } catch (error: any) {
    return {
      success: false,
      stage: 'failed',
      alert,
      errorMessage: error?.message ? `Failed to connect to webhook: ${error.message}` : 'Network error sending alert',
    };
  }

  // 3. Execution identification (if not in immediate POST response)
  onProgress?.({ stage: 'validating', message: 'Validating workflow execution...' });

  if (!executionId && workflowId) {
    for (let i = 0; i < 8; i++) {
      await sleep(1500);
      const currentExecs = await fetchWorkflowExecutions(workflowId);
      const newExec = currentExecs.find((e: any) => {
        const id = e.execution_id || e.id;
        return id && !initialExecIds.has(id);
      });
      if (newExec) {
        executionId = newExec.execution_id || newExec.id;
        break;
      }
    }
  }

  // 4. Poll execution run until completion and validate results
  let executionData: WorkflowExecution | null = null;
  const issues: IngestExecutionIssue[] = [];

  if (executionId) {
    onProgress?.({
      stage: 'validating',
      message: `Inspecting execution ${executionId.slice(0, 8)}...`,
    });

    const maxWaitCycles = 12;
    for (let cycle = 0; cycle < maxWaitCycles; cycle++) {
      executionData = await fetchExecution(executionId);
      if (executionData) {
        const st = (executionData.status || '').toUpperCase();
        const isRunning = st === 'EXECUTING' || st === 'WAITING' || st === 'RUNNING' || st === 'PENDING' || st === '';
        if (!isRunning) {
          break;
        }
      }
      await sleep(1500);
    }

    // Inspect execution for failures and action errors
    if (executionData) {
      const st = (executionData.status || '').toUpperCase();
      const results = Array.isArray(executionData.results) ? executionData.results : [];

      for (const res of results) {
        const hasErr = res.status === 'FAILURE' || res.status === 'ERROR' || countActionErrors(res) > 0;
        if (hasErr) {
          const actionName = res.action?.label || res.action?.name || res.action?.app_name || 'Action';
          const errMsg = extractActionError(res) || `Action execution returned ${res.status || 'failure'}`;
          issues.push({
            actionName,
            errorMessage: errMsg,
            status: res.status,
          });
        }
      }

      const executionFailed = st === 'FAILED' || st === 'ABORTED' || st === 'ERROR';
      if (executionFailed || issues.length > 0) {
        const primaryIssue = issues[0];
        const failMessage = primaryIssue
          ? `Ingest error in "${primaryIssue.actionName}": ${primaryIssue.errorMessage}`
          : `Workflow execution ended with status ${st}`;

        return {
          success: false,
          stage: 'failed',
          alert,
          executionId,
          executionStatus: st,
          issues,
          errorMessage: failMessage,
        };
      }
    }
  }

  // 5. Poll datastore for materialized incident
  onProgress?.({ stage: 'polling', message: 'Polling for materialized incident...' });

  let materializedKey: string | null = null;
  const maxDatastorePolls = 8;

  for (let poll = 0; poll < maxDatastorePolls; poll++) {
    try {
      const datastoreRes = await getDatastoreByCategory(DATASTORE_CATEGORIES.INCIDENTS);
      const incidentItems = datastoreRes.data || (datastoreRes as { items?: DatastoreItem[] }).items;
      if (datastoreRes.success && Array.isArray(incidentItems)) {
        // Look for item key not present in baseline
        const newItem = incidentItems.find((item: DatastoreItem) => !initialIncidentKeys.has(item.key));
        if (newItem) {
          materializedKey = newItem.key;
          break;
        }

        // Secondary check: match finding UID or title inside item value
        const matchItem = incidentItems.find((item: DatastoreItem) => {
          const raw = typeof item.value === 'string' ? item.value : JSON.stringify(item.value || {});
          return raw.includes(alert.id) || raw.includes(alert.title);
        });
        if (matchItem) {
          materializedKey = matchItem.key;
          break;
        }
      }
    } catch {
      // Best effort retry
    }
    await sleep(1500);
  }

  // Broadcast refresh to UI components
  broadcastIncidentRefresh();

  return {
    success: true,
    stage: 'complete',
    alert,
    executionId: executionId || undefined,
    executionStatus: executionData?.status || 'COMPLETED',
    incidentKey: materializedKey || undefined,
    warningMessage: !materializedKey
      ? 'Workflow execution finished, but incident has not yet appeared in datastore cache.'
      : undefined,
  };
}
