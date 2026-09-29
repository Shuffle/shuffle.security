/**
 * Demo Mode — "make the environment live" bootstrap.
 *
 * Runs the same enablement steps an operator would normally do on
 * /onboarding/automate, so the demo tour starts in a working state.
 *
 * The indicator-pipeline portion runs in a strict sequence so step 4 can
 * actually pick a real IOC instead of falling back to a static pool:
 *
 *   Stage A (parallel):
 *     1. Initialize IOC Types defaults     (no-op if already populated)
 *     2. Initialize Threat Feeds defaults  (no-op if already populated)
 *
 *   Stage B (after A):
 *     3. Run the "Enable Threat feeds" workflow so feeds get parsed into
 *        the `ioc_domain` / `ioc_ip` datastore categories.
 *
 *   Stage C (after B):
 *     4. Poll `ioc_domain` until at least one indicator is present (or we
 *        give up after a short budget). The indicator-availability promise
 *        is exposed as `indicatorReady` so the incidents-list seeder can
 *        await it before picking real IOCs.
 *
 * Independent steps (workflow generation, monitor host, agents, agent
 * permissions) fire in parallel alongside Stage A — they do not gate the
 * indicator pipeline.
 *
 * Best-effort: all failures are swallowed and logged; the tour continues
 * regardless so a flaky API does not block the user.
 */

import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { getAutomationLabels } from '@/config/usecases';
import {
  findIngestTicketsWorkflow,
  extractWorkflowAppNames,
} from '@/Shuffle-Core/ingestionDetection';
import { deduplicateAuthApps, type AuthAppEntry } from '@/lib/utils';
import { getDatastoreByCategory, setDatastoreItems, deleteDatastoreItems, DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';
// Canonical seeders + workflow generator — SAME functions used by the
// Threat Feeds page, IOC Types page, and the onboarding AutomationConfig.
// Keeping a single source of truth means changes there propagate to demo
// mode automatically (and vice-versa).
import { seedDefaultThreatFeeds } from '@/hooks/useThreatFeeds';
import { seedDefaultIOCTypes } from '@/hooks/useIOCTypes';
import { generateWorkflow } from '@/lib/workflowGenerate';
import { enableThreatIntelAutomation } from '@/Shuffle-Core/hooks/useEnrichmentStatus';
import { DEFAULT_AGENT_PERMISSIONS } from '@/hooks/useAgentPermissions';
import { DEMO_FLAG_KEY, DEMO_ACTIVE_KEY } from '@/lib/demoSeedData';

/**
 * Enable the "Assign & Escalate" background workflow(s) — same call the
 * Automation Readiness banner performs via `useAssignEscalateStatus.enable`.
 * Schedule-based, so `allowEmpty` is required.
 */
const enableAssignEscalateAutomation = async (): Promise<void> => {
  const labels = getAutomationLabels('assign_escalate');
  await Promise.allSettled(
    labels.map((label) =>
      generateWorkflow({ label, enabledAppNames: [], category: 'cases', allowEmpty: true }),
    ),
  );
};

/**
 * Local de-duped writer into the demo cleanup index. Mirrors `recordSeed`
 * in services/demoMode.ts (importing it here would create a cycle, since
 * demoMode already imports from this file). Keeps the SENSORS_CATEGORY key
 * tracked so getDemoStats counts the host as an asset and cleanup removes
 * it on tear-down.
 */
const recordSeedLocal = (category: string, keys: string[]) => {
  try {
    const raw = localStorage.getItem(DEMO_FLAG_KEY) || '{}';
    const idx = JSON.parse(raw) as Record<string, string[]>;
    const existing = new Set(idx[category] || []);
    for (const k of keys) existing.add(k);
    idx[category] = Array.from(existing);
    localStorage.setItem(DEMO_FLAG_KEY, JSON.stringify(idx));
    localStorage.setItem(DEMO_ACTIVE_KEY, 'true');
  } catch (err) {
    console.warn('[demo] recordSeedLocal failed', err);
  }
};

/**
 * localStorage key holding the JSON-encoded list of app names that were on
 * the user's "Ingest Tickets" workflow before demo mode took it over. On
 * cleanup we use this to restore the original sources.
 */
export const DEMO_INGEST_APPS_BACKUP_KEY = 'shuffle_demo_ingest_apps_backup';

/** The label "Ingest Tickets" comes from the usecase registry — keep in sync. */
const INGEST_TICKETS_LABEL = 'Ingest Tickets';

// Workflow generation delegates to the shared canonical helper so the
// demo bootstrap and the onboarding AutomationConfig page stay in
// lockstep — any backend contract change touches one file.

/** Fetch the current authenticated apps. */
const fetchAuthenticatedApps = async (): Promise<AuthAppEntry[]> => {
  try {
    const res = await fetch(getApiUrl('/api/v1/apps/authentication'), {
      credentials: 'include',
      headers: { ...getAuthHeader() },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data?.data || []);
    return list as AuthAppEntry[];
  } catch {
    return [];
  }
};

/** Fetch all workflows. */
const fetchWorkflows = async (): Promise<any[]> => {
  try {
    const res = await fetch(getApiUrl('/api/v1/workflows'), {
      credentials: 'include',
      headers: { ...getAuthHeader() },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data?.workflows || []);
  } catch {
    return [];
  }
};

/**
 * Shuffle's own internal tool apps that should never be passed as
 * `app_name` to /api/v2/workflows/generate — they are platform primitives,
 * not integrations the user wired up. Mirrors the filter used by the
 * usecase diagram (UsecaseAlluvialDiagram.tsx).
 */
const SHUFFLE_INTERNAL_PATTERNS = ['shuffle tools', 'shuffle_tools', 'shuffle datastore', 'shuffle workflow'];
const isShuffleInternalApp = (name: string): boolean => {
  const lower = name.toLowerCase().replace(/_/g, ' ');
  return SHUFFLE_INTERNAL_PATTERNS.some(p => lower.includes(p.replace(/_/g, ' ')));
};

/**
 * Snapshot the apps currently wired into the user's "Ingest Tickets"
 * workflow (if any) so we can restore them when the demo ends. We only
 * write the backup the first time — subsequent demo runs must not
 * overwrite the real snapshot with an already-cleared workflow.
 *
 * Shuffle's own internal tools (Shuffle Tools, Datastore, etc.) are
 * filtered out so we never POST `app_name: "shuffle_tools"` back to the
 * generate endpoint, which would be meaningless.
 */
const backupExistingIngestTicketsApps = async (): Promise<void> => {
  if (localStorage.getItem(DEMO_INGEST_APPS_BACKUP_KEY) !== null) return;
  const workflows = await fetchWorkflows();
  const ingest = findIngestTicketsWorkflow(workflows);
  const names = ingest
    ? Array.from(extractWorkflowAppNames(ingest)).filter(n => !isShuffleInternalApp(n))
    : [];
  localStorage.setItem(DEMO_INGEST_APPS_BACKUP_KEY, JSON.stringify(names));
};

/**
 * Generate the onboarding workflows (Ingest + Threat Intel).
 *
 * Demo-mode behavior for "Ingest Tickets": we explicitly DO NOT pass any of
 * the user's real apps. We snapshot whatever apps were on the existing
 * workflow first (so cleanup can restore them), then generate the workflow
 * empty so the demo runs in isolation. Threat Intel and the webhook variant
 * keep the original behavior.
 */
const generateOnboardingWorkflows = async (): Promise<void> => {
  const authedApps = await fetchAuthenticatedApps();
  const valid = authedApps.filter(a => a.active || a.validation?.valid);

  // Threat-intel apps still get wired up — only Ingest Tickets is sandboxed.
  const dedupAll = deduplicateAuthApps(valid).map(d => d.app.name);
  const threatIntelAppNames = Array.from(new Set(dedupAll));

  // Snapshot the user's real Ingest Tickets apps before we overwrite them.
  await backupExistingIngestTicketsApps();

  const ingestLabels = getAutomationLabels('automatic_ingestion');
  const threatLabels = getAutomationLabels('threat_intel');

  // Fire all generations in parallel — each is independent.
  const tasks: Promise<void>[] = [];
  for (const label of ingestLabels) {
    // Skip the webhook variant entirely. We want the user to discover and
    // enable the Ingestion Webhook themselves during the tour so they see
    // where the webhook URL comes from.
    if (label.endsWith('_webhook')) continue;
    if (label === INGEST_TICKETS_LABEL) {
      // Demo: generate with NO apps so we never touch the user's integrations.
      tasks.push(generateWorkflow({ label, enabledAppNames: [], category: 'cases', allowEmpty: true }));
    } else {
      tasks.push(generateWorkflow({ label, enabledAppNames: [], category: 'cases', allowEmpty: true }));
    }
  }
  for (const label of threatLabels) {
    tasks.push(generateWorkflow({ label, enabledAppNames: threatIntelAppNames, category: 'cases' }));
  }
  await Promise.allSettled(tasks);
};

/**
 * Restore the user's original "Ingest Tickets" apps from the backup
 * snapshot. Called from cleanupDemoData. If the backup recorded zero apps
 * (the workflow was empty or absent before the demo), we explicitly clear
 * the workflow so the demo state isn't left behind.
 */
export const restoreOriginalIngestTicketsApps = async (): Promise<void> => {
  const raw = localStorage.getItem(DEMO_INGEST_APPS_BACKUP_KEY);
  if (raw === null) return; // nothing to restore
  let names: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      names = parsed
        .filter(n => typeof n === 'string')
        // Strip Shuffle's internal apps from older backups so cleanup never
        // POSTs `app_name: "shuffle_tools"` to /workflows/generate.
        .filter(n => !isShuffleInternalApp(n));
    }
  } catch { /* ignore corrupt backup */ }

  try {
    if (names.length > 0) {
      // Re-generate with the original apps.
      await fetch(getApiUrl('/api/v2/workflows/generate'), {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: INGEST_TICKETS_LABEL,
          category: 'cases',
          app_name: names.join(','),
        }),
      });
    } else {
      // Original workflow had no apps — explicitly remove the demo placeholder.
      await fetch(getApiUrl('/api/v2/workflows/generate'), {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: INGEST_TICKETS_LABEL,
          category: 'cases',
          action_name: 'remove',
        }),
      });
    }
  } catch (err) {
    console.warn('[demo] restore ingest tickets apps failed', err);
  } finally {
    localStorage.removeItem(DEMO_INGEST_APPS_BACKUP_KEY);
  }
};

/** Label of the workflow generated by the Threat Feeds enablement. */
const THREAT_FEEDS_WORKFLOW_LABEL = 'Enable Threat feeds';

/** Datastore category populated by the threat-feeds parser. We track URLs
 *  rather than domains because the demo picks a full `ioc_url` entry. */
const IOC_URL_CATEGORY = 'ioc_url';

/** Sleep helper. */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Look up the "Enable Threat feeds" workflow, retrying briefly while the
 * generate call settles. Returns the workflow id or null if it never
 * shows up. Polls every 500ms up to ~5s.
 */
const findThreatFeedsWorkflowId = async (): Promise<string | null> => {
  for (let i = 0; i < 10; i++) {
    const workflows = await fetchWorkflows();
    const wf = workflows.find(
      (w: any) => typeof w?.name === 'string' && w.name === THREAT_FEEDS_WORKFLOW_LABEL,
    );
    if (wf?.id) return wf.id as string;
    await sleep(500);
  }
  return null;
};

/**
 * Execute the "Enable Threat feeds" workflow once. Awaitable — returns
 * when /execute resolves (success or failure). Used as Stage B so the IOC
 * categories actually get populated before we poll for indicators.
 */
const runThreatFeedsWorkflow = async (): Promise<void> => {
  try {
    const wfId = await findThreatFeedsWorkflowId();
    if (!wfId) {
      console.warn('[demo] threat feeds workflow not found after retries');
      return;
    }
    await fetch(getApiUrl(`/api/v1/workflows/${wfId}/execute`), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ execution_source: 'demo', start: '' }),
    });
  } catch (err) {
    console.warn('[demo] threat feeds workflow execute failed', err);
  }
};

/**
 * Snapshot of a datastore category — captured before we overwrite it with
 * defaults so we can restore the user's custom config afterwards.
 *
 * `items` is the raw list returned by /list_cache (key + parsed value).
 * An empty array means the user had nothing configured — in that case the
 * defaults stay in place after the workflow run.
 */
type DatastoreSnapshot = { items: Array<{ key: string; value: unknown }> };

const snapshotCategory = async (category: string): Promise<DatastoreSnapshot> => {
  try {
    const res = await getDatastoreByCategory(category);
    if (!res.success || !res.data) return { items: [] };
    const items = res.data.map(it => {
      let value: unknown = it.value;
      if (typeof it.value === 'string') {
        try { value = JSON.parse(it.value); } catch { /* keep raw string */ }
      }
      return { key: it.key, value };
    });
    return { items };
  } catch {
    return { items: [] };
  }
};

/**
 * Restore a previously-captured snapshot. Deletes everything currently in
 * the category (which at this point is the freshly-seeded defaults) and
 * writes the original user items back. No-op when the snapshot is empty —
 * we leave the defaults in place so the user is not worse off than before.
 */
const restoreSnapshot = async (
  category: string,
  snapshot: DatastoreSnapshot,
): Promise<void> => {
  if (snapshot.items.length === 0) return;
  try {
    const current = await getDatastoreByCategory(category);
    const currentKeys = current.success && current.data ? current.data.map(it => it.key) : [];
    if (currentKeys.length > 0) {
      await deleteDatastoreItems(currentKeys, category);
    }
    await setDatastoreItems(
      snapshot.items.map(({ key, value }) => ({ key, value: value as string | object })),
      category,
    );
  } catch (err) {
    console.warn(`[demo] restore snapshot failed for ${category}`, err);
  }
};

/**
 * Snapshot Threat Feeds (so we can restore the user's config later) and
 * unconditionally reset to defaults — same write the Threat Feeds page
 * "Reset to Defaults" performs. The reset is required because the demo
 * needs the curated default feeds active for IOC enrichment to work; the
 * snapshot ensures we put the user's config back once the workflow has
 * populated indicators.
 */
const initThreatFeedsDefaults = async (): Promise<DatastoreSnapshot> => {
  const snapshot = await snapshotCategory(DATASTORE_CATEGORIES.THREAT_FEEDS);
  try {
    await seedDefaultThreatFeeds();
  } catch (err) {
    console.warn('[demo] threat feeds reset failed', err);
  }
  return snapshot;
};

/**
 * Poll `ioc_url` until at least one indicator is present, or we hit
 * the timeout. Returns true if an indicator was observed.
 *
 * The threat-feed parser is async on the backend, so we give it a short
 * but generous window. If it never shows up, the caller falls back to its
 * static pool — but at least we tried.
 */
const waitForFirstIndicatorUrl = async (
  { timeoutMs = 15000, intervalMs = 1000 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await getDatastoreByCategory(IOC_URL_CATEGORY);
      const count = res.success && res.data ? res.data.length : 0;
      if (count > 0) return true;
    } catch {
      /* keep polling */
    }
    await sleep(intervalMs);
  }
  return false;
};

// ─── Fake Host Monitor injection ────────────────────────────────────────────
// The demo narrative pivots on Sarah Chen's compromised laptop FIN-LAPTOP-04.
// To let the AI agent propose "Isolate host" and the user approve it, the
// host must show up on /monitors. We do this purely on the frontend by
// seeding `shuffle-security_sensors` with the rich host record (recent
// checkin included). The Monitors list page surfaces sensor-datastore
// records that aren't backed by a real environment host, so no
// /api/v1/setenvironments mutation is required. The record is tagged
// demo:true so cleanup can find it later.

export const DEMO_HOST_HOSTNAME = 'FIN-LAPTOP-04';
export const DEMO_HOST_UUID = 'demo-host-fin-laptop-04';
export const DEMO_HOST_GROUP = 'shuffle_sensors';
const SENSORS_CATEGORY = 'shuffle-security_sensors';

const buildDemoSensorHost = () => {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    uuid: DEMO_HOST_UUID,
    hostname: DEMO_HOST_HOSTNAME,
    os: 'windows',
    arch: 'amd64',
    serial: 'FIN-LAPTOP-04-SN-9821',
    checkin: nowSec,
    last_checkin: nowSec,
    hd_encrypted: true,
    automatic_screen_lock_enabled: true,
    elevated_access: true,
    sensor_mode: true,
    response_actions: 'full',
    log_forwarding: '',
    // Owner identity — drives automatic cross-correlation with the
    // phishing/Sliver incidents (which share sarah.chen@example.com) and the
    // stakeholder registry seeded later in the tour.
    owner: { name: 'Sarah Chen', email: 'sarah.chen@example.com' },
    user: 'sarah.chen@example.com',
    username: 'sarah.chen',
    installed_software: [
      { name: 'Google Chrome', version: '124.0.6367.91', vendor: 'Google LLC' },
      { name: 'Microsoft Edge', version: '125.0.2535.51', vendor: 'Microsoft' },
      { name: 'Slack', version: '4.38.121', vendor: 'Slack Technologies' },
      { name: 'Zoom', version: '5.17.11', vendor: 'Zoom Video Communications' },
      { name: '1Password', version: '8.10.30', vendor: 'AgileBits' },
      { name: 'Microsoft 365 Apps', version: '16.0.17328.20184', vendor: 'Microsoft' },
    ],
    code_scanner: [],
    metadata: {
      uid: DEMO_HOST_UUID,
      extensions: { custom_attributes: { demo: true } },
    },
  };
};

/** Seed the rich sensor record into the datastore. Idempotent on key. */
const initDemoSensorRecord = async (): Promise<void> => {
  try {
    const key = DEMO_HOST_HOSTNAME.toLowerCase();
    await setDatastoreItems(
      [{ key, value: buildDemoSensorHost() }],
      SENSORS_CATEGORY,
    );
    // Track in the demo cleanup index so the asset stat reflects the host
    // and cleanup removes it on tear-down. recordSeedLocal de-duplicates.
    recordSeedLocal(SENSORS_CATEGORY, [key]);
  } catch (err) {
    console.warn('[demo] sensor record init failed', err);
  }
};

/** Seed the demo sensor record into the sensors datastore. */
const initDemoMonitorHost = async (): Promise<void> => {
  await initDemoSensorRecord();
};

/**
 * Snapshot Observable Regexes (IOC Types) and unconditionally reset them
 * to the canonical defaults — same write the IOC Types page "Reset to
 * Defaults" performs. The snapshot is restored after the Threat Feeds
 * workflow has run so a customised regex set is preserved.
 */
const initIOCTypesDefaults = async (): Promise<DatastoreSnapshot> => {
  const snapshot = await snapshotCategory(DATASTORE_CATEGORIES.IOCS);
  try {
    await seedDefaultIOCTypes();
  } catch (err) {
    console.warn('[demo] IOC types reset failed', err);
  }
  return snapshot;
};

/** Seed a "Security Analyst" agent persona into the agents datastore. */
export const DEMO_AGENTS_CATEGORY = 'shuffle-security_agents';
export const DEMO_SECURITY_ANALYST_KEY = 'demo-agent-security-analyst';

const buildDemoSecurityAnalystAgent = () => ({
  id: DEMO_SECURITY_ANALYST_KEY,
  name: 'Security Analyst',
  role: 'security_analyst',
  description:
    'A focused AI analyst that supports you on incident triage, evidence gathering, and recommended response actions. Acts as your second pair of eyes — never takes high-risk actions without approval.',
  goals: [
    'Triage new incidents and surface the ones that need a human first',
    'Pull together host, user, and threat-intel context for each incident',
    'Recommend a clear next action and ask for approval on anything risky',
  ],
  capabilities: [
    'Read incidents, assets, users, and host monitors',
    'Enrich observables against threat feeds',
    'Propose response actions (e.g. isolate host) for human approval',
  ],
  status: 'active',
  created_at: new Date().toISOString(),
  metadata: {
    uid: DEMO_SECURITY_ANALYST_KEY,
    extensions: { custom_attributes: { demo: true } },
  },
});

const initDemoAgents = async (): Promise<void> => {
  try {
    const res = await getDatastoreByCategory(DEMO_AGENTS_CATEGORY);
    if (res.success && res.data) {
      const exists = res.data.some(item => item.key === DEMO_SECURITY_ANALYST_KEY);
      if (exists) return;
    }
    await setDatastoreItems(
      [{ key: DEMO_SECURITY_ANALYST_KEY, value: buildDemoSecurityAnalystAgent() }],
      DEMO_AGENTS_CATEGORY,
    );
  } catch (err) {
    console.warn('[demo] agents init failed', err);
  }
};

/**
 * Seed the AI Agent's default Response Action permissions into the
 * `shuffle-security_configuration` datastore under the `agent_permissions`
 * key (same shape the Response Actions page reads/writes via
 * useAgentPermissions). For the demo we want at least one high-impact
 * action — "Isolate Systems" — enabled out of the box so the agent has
 * something meaningful to act on. We never overwrite an existing config so
 * users that already configured permissions keep their choices.
 */
const AGENT_PERMISSIONS_KEY = 'agent_permissions';

const buildDemoAgentPermissions = () =>
  DEFAULT_AGENT_PERMISSIONS.map(cat => ({
    ...cat,
    permissions: cat.permissions.map(p =>
      // Enable "Isolate Systems" by default for the demo so the agent has
      // a high-impact host action available without extra setup.
      p.id === 'isolate_systems' ? { ...p, enabled: true } : p,
    ),
  }));

const initAgentPermissionsDefaults = async (): Promise<void> => {
  try {
    const res = await getDatastoreByCategory(DATASTORE_CATEGORIES.CONFIGURATION);
    if (res.success && res.data) {
      const exists = res.data.some(item => item.key === AGENT_PERMISSIONS_KEY);
      if (exists) return;
    }
    await setDatastoreItems(
      [{ key: AGENT_PERMISSIONS_KEY, value: buildDemoAgentPermissions() }],
      DATASTORE_CATEGORIES.CONFIGURATION,
    );
  } catch (err) {
    console.warn('[demo] agent permissions init failed', err);
  }
};

/**
 * Result of the live-environment bootstrap.
 *
 * `indicatorReady` resolves with `true` once at least one entry exists in
 * `ioc_domain` (i.e. step 4 succeeded), `false` if we gave up. Callers
 * that pick real IOCs (the incidents-list seeder) should `await` this
 * promise so they do not fall back to the static pool unnecessarily.
 */
export interface LiveDemoEnvironmentResult {
  /** Resolves once Stage A + B + the independent tasks have settled. */
  ready: Promise<void>;
  /** Resolves true once `ioc_domain` has at least one entry, false on timeout. */
  indicatorReady: Promise<boolean>;
}

/**
 * Run the full live-environment bootstrap. Safe to call multiple times —
 * all sub-steps are idempotent.
 *
 * Sequencing for the indicator pipeline (1 → 2 → 3 → 4):
 *   - Stage A: IOC Types + Threat Feeds defaults in parallel.
 *   - Stage B: execute the "Enable Threat feeds" workflow.
 *   - Stage C: poll `ioc_domain` for the first indicator.
 *
 * Independent steps (workflow generation, monitor host, agents, agent
 * permissions) run in parallel alongside Stage A so the bootstrap is
 * still quick — they do not depend on the indicator pipeline.
 *
 * The Stage-C poll is exposed separately as `indicatorReady` so callers
 * can await indicators *before* picking IOCs without forcing the whole
 * UI to wait on it.
 */
export const enableLiveDemoEnvironment = (): LiveDemoEnvironmentResult => {
  // Reset incident timeline filters so the demo always starts with the
  // default set (agent, manual, tasks, observables, correlations).
  try { localStorage.removeItem('shuffle-incident-timeline-filters-v2'); } catch { /* ignore */ }

  // Stage A — snapshot the user's existing Threat Feeds + Observable
  // Regexes (so we can restore them later) and force-reset both to the
  // canonical defaults the demo needs.
  const iocTypesSnapshotP = initIOCTypesDefaults();
  const threatFeedsSnapshotP = initThreatFeedsDefaults();
  const stageA = Promise.allSettled([iocTypesSnapshotP, threatFeedsSnapshotP]);

  // Independent steps — fire alongside Stage A. generateOnboardingWorkflows
  // is what creates the threat-intel usecase workflows (incl. "Enable
  // Threat feeds") that Stage B then executes. We also call the SAME
  // standalone helpers the Automation Readiness banner uses so Enrichment
  // and Assign & Escalate flip Active at the same time as everything else.
  const independent = Promise.allSettled([
    generateOnboardingWorkflows(),
    enableThreatIntelAutomation(),
    enableAssignEscalateAutomation(),
    initDemoMonitorHost(),
    initDemoAgents(),
    initAgentPermissionsDefaults(),
  ]);

  // Stage B — run the Threat Feeds workflow once defaults are in place
  // and the workflow row has been generated.
  const stageB = Promise.all([stageA, independent]).then(() => runThreatFeedsWorkflow());

  // Stage B' — once the workflow has populated indicators, restore the
  // user's original Threat Feeds + Observable Regex configs (if any).
  // Empty snapshots are no-ops so the defaults we just seeded stay put
  // for users who had nothing configured.
  const restored = stageB.then(async () => {
    const [iocSnap, feedsSnap] = await Promise.all([iocTypesSnapshotP, threatFeedsSnapshotP]);
    await Promise.allSettled([
      restoreSnapshot(DATASTORE_CATEGORIES.IOCS, iocSnap),
      restoreSnapshot(DATASTORE_CATEGORIES.THREAT_FEEDS, feedsSnap),
    ]);
  });

  // Stage C — poll `ioc_domain` until an indicator exists. Resolves false
  // on timeout so callers can fall back gracefully.
  const indicatorReady = stageB.then(() => waitForFirstIndicatorUrl());

  const ready = restored.then(() => undefined);
  return { ready, indicatorReady };
};
