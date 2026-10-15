/**
 * Sample data for the signed-out /dashboard. Deterministic (seeded) so the
 * charts look the same on every visit, with realistic names and shapes that
 * match what the real APIs return.
 *
 * installDashboardSampleFetch() answers only the dashboard API paths listed
 * below with sample responses and passes every other request through. It
 * returns a cleanup function that restores the original fetch.
 */

import { DEFAULT_SLA_CONFIG } from '@/hooks/useSlaConfig';

export const SAMPLE_ORG_ID = 'sample-org';
const DAY = 86_400_000;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const pick = <T,>(r: () => number, arr: T[]) => arr[Math.floor(r() * arr.length)];
const weighted = <T,>(r: () => number, items: [T, number][]) => {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of items) { if ((x -= w) <= 0) return v; }
  return items[items.length - 1][0];
};
/** Weekday-heavy activity curve with a slow upward trend. */
const dayVolume = (dayIndexFromStart: number, ts: number, base: number, r: () => number) => {
  const dow = new Date(ts).getDay();
  const weekend = dow === 0 || dow === 6 ? 0.45 : 1;
  const trend = 1 + dayIndexFromStart / 400;
  return Math.max(0, Math.round(base * weekend * trend * (0.7 + r() * 0.6)));
};

export interface SampleIncident { status: string; severity: string; createdTs: number; respondedTs?: number; resolvedTs?: number }

const INCIDENT_TITLES = [
  'Suspicious sign-in from new country', 'Phishing email reported by user', 'Malware detected on endpoint',
  'Impossible travel for account', 'Brute force against VPN gateway', 'Outbound traffic to known C2 domain',
  'Privilege escalation on server', 'Mass file deletion on file share', 'Disabled EDR agent', 'New admin account created',
];
const ASSIGNEES = ['Ingrid Hansen', 'Marcus Lee', 'Priya Nair', 'Jonas Berg', 'AI Agent'];
const SEV_ID: Record<string, number> = { informational: 1, low: 2, medium: 3, high: 4, critical: 5 };

/** Sample incidents in the datastore list format used by the report export. */
export function buildSampleIncidentList() {
  const r = rng(29);
  const keys = buildSampleIncidents().slice(-1500).map((inc, i) => ({
    key: `sample-incident-${i}`,
    created: Math.floor(inc.createdTs / 1000),
    value: JSON.stringify({
      finding_info: { title: pick(r, INCIDENT_TITLES) },
      severity: inc.severity[0].toUpperCase() + inc.severity.slice(1),
      severity_id: SEV_ID[inc.severity] || 3,
      status: inc.status,
      created_time: inc.createdTs,
      assignee: { name: inc.status === 'new' ? '' : pick(r, ASSIGNEES) },
    }),
  }));
  return { success: true, keys, cursor: '' };
}

function buildSampleAppAuth() {
  const apps = ['Microsoft Defender', 'CrowdStrike Falcon', 'Jira', 'Slack', 'Gmail', 'VirusTotal', 'Qualys', 'Okta'];
  const now = Date.now();
  return { success: true, data: apps.map((name, i) => ({
    app: { name }, label: `${name} production`, active: i !== 5,
    validation: { valid: i !== 5 }, edited: Math.floor((now - i * 9 * DAY) / 1000),
  })) };
}

// ── Incidents (Security overview) ─────────────────────────────────────────
export function buildSampleIncidents(now = Date.now(), days = 365) {
  const r = rng(11);
  const out: SampleIncident[] = [];
  const MIN = 60_000;
  for (let d = days - 1; d >= 0; d--) {
    const dayTs = now - d * DAY;
    const n = dayVolume(days - d, dayTs, 6, r);
    for (let i = 0; i < n; i++) {
      const ageDays = d;
      // Anything open past its resolve window counts as an SLA breach, so
      // the open backlog sits in the last few days: older days are mostly
      // handled with a light trickle of in-flight work, and breaches stay
      // low overall.
      const status = ageDays > 14
        ? weighted(r, [['resolved', 999], ['in_progress', 1]])
        : ageDays > 2
          ? weighted(r, [['resolved', 90], ['in_progress', 5], ['new', 2], ['on_hold', 3]])
          : ageDays > 0
            ? weighted(r, [['resolved', 82], ['in_progress', 10], ['new', 3], ['on_hold', 5]])
            : weighted(r, [['new', 55], ['in_progress', 30], ['resolved', 15]]);
      const severity = weighted(r, [['informational', 10], ['low', 30], ['medium', 35], ['high', 18], ['critical', 7]]);
      // Fresh incidents have not been triaged yet and sit inside their respond
      // window; only a small tail lingers and breaches.
      const createdTs = status === 'new' && ageDays <= 2
        ? dayTs - Math.floor(r() * (r() < 0.85 ? 45 * MIN : DAY))
        : dayTs - Math.floor(r() * DAY);
      const target = DEFAULT_SLA_CONFIG[severity as keyof typeof DEFAULT_SLA_CONFIG] || DEFAULT_SLA_CONFIG.fallback;
      // SLA breaches should be rare: almost everyone responds and resolves
      // inside the target, with a small overshoot when they are late.
      const late = (share: number) => (r() < share ? 1.1 + r() * 0.5 : 0.15 + r() * 0.8);
      const respondedTs = status === 'new' ? undefined : Math.min(now, createdTs + target.respondMinutes * MIN * late(0.05));
      const resolvedTs = status === 'resolved' ? Math.min(now, createdTs + target.resolveMinutes * MIN * late(0.06)) : undefined;
      out.push({ status, severity, createdTs, respondedTs, resolvedTs });
    }
  }
  return out;
}

// ── Vulnerabilities ────────────────────────────────────────────────────────
const HOSTS = ['web-prod-01', 'web-prod-02', 'api-gw-eu', 'db-primary', 'db-replica-2', 'build-runner-3', 'vpn-edge', 'mail-relay', 'hr-laptop-114', 'fin-laptop-027', 'k8s-node-a7', 'k8s-node-b2', 'jump-host'];
const SOURCES = ['Host Monitor', 'OSV', 'Tenable', 'Qualys', 'GitHub Dependabot', 'Wiz'];
const PACKAGES = ['openssl', 'log4j-core', 'curl', 'glibc', 'nginx', 'openssh', 'libxml2', 'sudo', 'python3-urllib3', 'node-lodash', 'tar', 'zlib'];

export function buildSampleVulns(now = Date.now(), count = 100) {
  const r = rng(29);
  const keys = [];
  for (let i = 0; i < count; i++) {
    const created = Math.floor((now - Math.floor(r() * r() * 365) * DAY - Math.floor(r() * DAY)) / 1000);
    const pkg = pick(r, PACKAGES);
    const severity = weighted(r, [['critical', 6], ['high', 20], ['medium', 42], ['low', 24], ['info', 8]]);
    const hostCount = 1 + Math.floor(r() * 3);
    const hosts = Array.from(new Set(Array.from({ length: hostCount }, () => pick(r, HOSTS)))).map(hostname => ({ hostname }));
    keys.push({
      key: `CVE-${2023 + Math.floor(r() * 4)}-${10000 + Math.floor(r() * 50000)}`,
      created,
      value: JSON.stringify({
        severity,
        source: pick(r, SOURCES),
        hosts,
        status: weighted(r, [['open', 70], ['in_progress', 15], ['resolved', 15]]),
        summary: `${pkg} vulnerability`,
        affected_packages: [{ name: pkg }],
      }),
    });
  }
  return { success: true, keys };
}

// ── Automation stats ───────────────────────────────────────────────────────
const STAT_ADDITIONS = ['phishing_reports_handled', 'iocs_enriched', 'tickets_created', 'users_notified'];

export function buildSampleStats(now = Date.now(), days = 365) {
  const r = rng(47);
  const daily_statistics = [];
  let wfTotal = 0, appTotal = 0;
  for (let d = days - 1; d >= 0; d--) {
    const ts = now - d * DAY;
    const finished = dayVolume(days - d, ts, 420, r);
    const failed = Math.round(finished * (0.015 + r() * 0.04));
    const apps = Math.round(finished * (5 + r() * 3));
    const appsFailed = Math.round(apps * (0.01 + r() * 0.03));
    wfTotal += finished + failed; appTotal += apps;
    daily_statistics.push({
      date: new Date(ts).toISOString(),
      workflow_executions: finished + failed,
      workflow_executions_finished: finished,
      workflow_executions_failed: failed,
      app_executions: apps,
      app_executions_failed: appsFailed,
      subflow_executions: Math.round(finished * 0.3),
      additions: STAT_ADDITIONS.map((key, k) => ({ key, value: Math.round(finished * (0.05 + k * 0.04) * (0.6 + r() * 0.8)) })),
    });
  }
  return {
    success: true,
    total_workflow_executions: wfTotal,
    total_app_executions: appTotal,
    daily_statistics,
    additions: STAT_ADDITIONS.map(key => ({ key, value: 0 })),
  };
}

export function buildSampleNotifications(now = Date.now()) {
  const r = rng(53);
  const titles = ['Workflow failed: Phishing triage', 'App authentication expired: Microsoft 365', 'High queue on runtime location', 'Workflow failed: EDR isolate host', 'Rate limit reached: VirusTotal'];
  return Array.from({ length: 38 }, (_, i) => ({
    id: `n-${i}`,
    title: pick(r, titles),
    created_at: Math.floor((now - Math.floor(r() * 30) * DAY) / 1000),
    read: r() > 0.4,
  }));
}

export function buildSampleEnvironments(now = Date.now()) {
  const sec = Math.floor(now / 1000);
  return [
    { Name: 'Cloud', Type: 'cloud', queue: 14, checkin: sec, running_ip: '' },
    { Name: 'Oslo datacenter', Type: 'onprem', queue: 37, checkin: sec - 20 },
    { Name: 'Frankfurt DMZ', Type: 'onprem', queue: 6, checkin: sec - 45 },
    { Name: 'Legacy lab', Type: 'onprem', queue: 120, checkin: sec - 86_400 },
  ];
}

export function buildSampleWorkflows() {
  const names = ['Phishing triage', 'EDR isolate host', 'IOC enrichment', 'Vulnerability ingestion', 'Ticket sync Jira', 'Daily email report', 'User offboarding', 'Firewall block IP', 'SIEM alert forwarding', 'Threat feed import', 'Slack escalation', 'Asset inventory sync'];
  return names.map((name, i) => ({ id: `sample-wf-${i}`, name, is_valid: true, org_id: SAMPLE_ORG_ID }));
}

// ── Agent runs ────────────────────────────────────────────────────────────
const AGENT_TOOLS = ['virustotal', 'microsoft_defender', 'crowdstrike_falcon', 'jira', 'slack', 'abuseipdb', 'okta', 'shuffle_datastore'];

export function buildSampleAgentRuns(now = Date.now(), count = 100) {
  const r = rng(71);
  return Array.from({ length: count }, (_, i) => {
    const start = Math.floor((now - Math.floor(r() * r() * 45 * DAY)) / 1000);
    const status = weighted(r, [['FINISHED', 78], ['FAILURE', 8], ['WAITING', 9], ['EXECUTING', 3], ['ABORTED', 2]]);
    const duration = 8 + Math.floor(r() * 140);
    const decisions = Array.from({ length: 1 + Math.floor(r() * 5) }, () => ({
      tool: pick(r, AGENT_TOOLS),
      approval_required: r() < 0.12,
    }));
    return {
      execution_id: `sample-exec-${i}`,
      workflow_id: 'AGENT',
      status,
      started_at: start,
      completed_at: status === 'FINISHED' || status === 'FAILURE' ? start + duration : 0,
      duration: status === 'FINISHED' || status === 'FAILURE' ? duration : 0,
      decisions,
      results: decisions.map(d => ({ action: { app_name: d.tool } })),
    };
  });
}

// ── Fetch interception ────────────────────────────────────────────────────
type Responder = (url: URL, init?: RequestInit) => unknown | undefined;

const RESPONDERS: Responder[] = [
  (u) => (/\/api\/v1\/orgs\/[^/]+\/list_cache$/.test(u.pathname) ? buildSampleIncidentList() : undefined),
  (u) => (u.pathname.endsWith('/api/v1/apps/authentication') ? buildSampleAppAuth() : undefined),
  (u) => (/\/api\/v1\/orgs\/[^/]+\/stats$/.test(u.pathname) ? buildSampleStats() : undefined),
  (u) => (u.pathname.endsWith('/api/v1/notifications') ? { success: true, notifications: buildSampleNotifications() } : undefined),
  (u) => (u.pathname.endsWith('/api/v1/getenvironments') ? buildSampleEnvironments() : undefined),
  (u) => (u.pathname.endsWith('/api/v2/vulns') ? buildSampleVulns() : undefined),
  (u) => (u.pathname.endsWith('/api/v1/workflows/search') ? { success: true, runs: buildSampleAgentRuns(), cursor: '' } : undefined),
  (u) => (u.pathname.endsWith('/api/v1/workflows') ? buildSampleWorkflows() : undefined),
];

export function sampleResponseFor(rawUrl: string, init?: RequestInit): unknown | undefined {
  let url: URL;
  try { url = new URL(rawUrl, 'http://localhost'); } catch { return undefined; }
  for (const respond of RESPONDERS) {
    const body = respond(url, init);
    if (body !== undefined) return body;
  }
  return undefined;
}

export function installDashboardSampleFetch(): () => void {
  if (typeof window === 'undefined') return () => {};
  const original = window.fetch;
  const patched: typeof fetch = (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = sampleResponseFor(raw, init);
    if (body === undefined) return original(input, init);
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
  window.fetch = patched;
  return () => { if (window.fetch === patched) window.fetch = original; };
}
