/**
 * Canonical workflow-generation helper. SINGLE source of truth for POST
 * /api/v2/workflows/generate — used by:
 *   - The onboarding AutomationConfig page (when the user enables a
 *     usecase / automation area).
 *   - The demo-mode live environment bootstrap (which generates the same
 *     usecase workflows so the demo runs in a working state).
 *
 * Keep this in sync with the backend contract. Changes here propagate to
 * both the real "enable usecase" UX and demo mode automatically.
 */

import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';

export interface GenerateWorkflowOptions {
  /** Workflow label (e.g. "Ingest Tickets", "Enable Threat feeds"). */
  label: string;
  /** App names to wire into the generated workflow. */
  enabledAppNames: string[];
  /** Datastore / workflow category. Defaults to "cases". */
  category?: string;
  /** Optional action_name (e.g. "disable", "remove"). */
  actionName?: string;
  /**
   * If true, the request is sent even when `enabledAppNames` is empty.
   * Used for schedule-based automations (Assign & Escalate) and demo-mode
   * sandboxed workflows where we explicitly want zero apps wired in.
   */
  allowEmpty?: boolean;
}

/**
 * Generate (or modify) a workflow by label. Best-effort — failures are
 * logged but never thrown so the caller's UI flow is never blocked.
 *
 * For `actionName === 'disable'` the request is always sent regardless
 * of `enabledAppNames` length, matching the original behavior in
 * AutomationConfig.
 */
export const generateWorkflow = async ({
  label,
  enabledAppNames,
  category = 'cases',
  actionName,
  allowEmpty = false,
}: GenerateWorkflowOptions): Promise<void> => {
  if (enabledAppNames.length === 0 && actionName !== 'disable' && !allowEmpty) {
    return;
  }

  const appNamesStr = enabledAppNames.join(',');

  try {
    const body: Record<string, string> = {
      label,
      app_name: appNamesStr,
      category,
    };
    if (actionName) body.action_name = actionName;

    await fetch(getApiUrl('/api/v2/workflows/generate'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn(`[workflowGenerate] failed for "${label}"`, err);
  }
};
