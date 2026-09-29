import { getApiUrl, shuffleFetch } from "@/Shuffle-Core/api";
import { WorkflowSummary } from "@/hooks/useWorkflows";
import { invalidateWorkflowsCache } from "@/Shuffle-Core/views/appsFetchCache";

export interface UpdateWorkflowEnvResult {
  success: boolean;
  reason?: string;
}

/**
 * Updates a workflow's runtime location across the workflow root, actions, and triggers.
 * Fetches the full workflow definition first to ensure coordinates, branches, and configs are preserved.
 */
export const updateWorkflowEnvironment = async (
  workflowId: string,
  newEnvName: string,
  fallbackWorkflow?: WorkflowSummary | Record<string, unknown>,
): Promise<UpdateWorkflowEnvResult> => {
  try {
    // 1. Fetch full workflow to ensure all branches, nodes, triggers are preserved
    let fullWorkflow: Record<string, unknown> = (fallbackWorkflow as Record<
      string,
      unknown
    >) || { id: workflowId };

    try {
      const getRes = await shuffleFetch(
        getApiUrl(`/api/v1/workflows/${workflowId}`),
      );
      if (getRes.ok) {
        const fetched = (await getRes.json()) as Record<string, unknown>;
        if (fetched && typeof fetched === "object") {
          const wfObj =
            fetched.id === workflowId
              ? fetched
              : (fetched.workflow as Record<string, unknown> | undefined)?.id === workflowId
              ? (fetched.workflow as Record<string, unknown>)
              : (fetched.data as Record<string, unknown> | undefined)?.id === workflowId
              ? (fetched.data as Record<string, unknown>)
              : fetched;
          if (wfObj) {
            fullWorkflow = { ...fullWorkflow, ...wfObj };
          }
        }
      }
    } catch {
      // Fall back to provided object
    }

    // Determine actions from fullWorkflow or fallbackWorkflow
    const existingActions =
      Array.isArray(fullWorkflow.actions) && fullWorkflow.actions.length > 0
        ? (fullWorkflow.actions as Record<string, unknown>[])
        : Array.isArray((fallbackWorkflow as Record<string, unknown>)?.actions) &&
          ((fallbackWorkflow as Record<string, unknown>).actions as unknown[]).length > 0
        ? ((fallbackWorkflow as Record<string, unknown>).actions as Record<string, unknown>[])
        : [];

    const updatedActions = existingActions.map((act: Record<string, unknown>) => ({
      ...act,
      environment: newEnvName,
      execution_environment: newEnvName,
    }));

    // Determine triggers from fullWorkflow or fallbackWorkflow
    const existingTriggers =
      Array.isArray(fullWorkflow.triggers) && fullWorkflow.triggers.length > 0
        ? (fullWorkflow.triggers as Record<string, unknown>[])
        : Array.isArray((fallbackWorkflow as Record<string, unknown>)?.triggers) &&
          ((fallbackWorkflow as Record<string, unknown>).triggers as unknown[]).length > 0
        ? ((fallbackWorkflow as Record<string, unknown>).triggers as Record<string, unknown>[])
        : [];

    const updatedTriggers = existingTriggers.map((trig: Record<string, unknown>) => ({
      ...trig,
      environment:
        newEnvName.toLowerCase() === "cloud" &&
        (trig.environment === "cloud" ||
          trig.trigger_type === "SCHEDULE")
          ? "cloud"
          : newEnvName,
      execution_environment:
        newEnvName.toLowerCase() === "cloud" &&
        (trig.environment === "cloud" ||
          trig.trigger_type === "SCHEDULE")
          ? "cloud"
          : newEnvName,
    }));

    // 2. Update environment at workflow level, actions level, and triggers level
    const updatedWorkflow: Record<string, unknown> = {
      ...fullWorkflow,
      environment: newEnvName,
      execution_environment: newEnvName,
      actions: updatedActions,
      triggers: updatedTriggers,
    };

    // 3. Persist update
    const putRes = await shuffleFetch(
      getApiUrl(`/api/v1/workflows/${workflowId}`),
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(updatedWorkflow),
      },
    );

    const rawText = await putRes.text().catch(() => "");
    let resJson: {
      success?: boolean;
      reason?: string;
      error?: string;
      message?: string;
    } | null = null;
    try {
      if (rawText) resJson = JSON.parse(rawText);
    } catch {
      // Not JSON
    }

    if (!putRes.ok) {
      const reason =
        (resJson && typeof resJson.reason === "string" && resJson.reason) ||
        (resJson && typeof resJson.error === "string" && resJson.error) ||
        (resJson && typeof resJson.message === "string" && resJson.message) ||
        rawText.trim() ||
        `HTTP ${putRes.status}`;
      return { success: false, reason };
    }

    if (
      resJson &&
      resJson.success === false
    ) {
      const reason =
        (typeof resJson.reason === "string" && resJson.reason) ||
        (typeof resJson.error === "string" && resJson.error) ||
        "Failed to update workflow environment";
      return { success: false, reason };
    }

    // Invalidate local in-memory cache so subsequent fetches hit the network
    invalidateWorkflowsCache();

    return { success: true };
  } catch (err) {
    return {
      success: false,
      reason: err instanceof Error ? err.message : "Network error",
    };
  }
};
