/**
 * Incident Report Service
 *
 * Builds a structured report object for an incident by extracting
 * deterministic data from the incident itself, and using the AI
 * conversation endpoint (askAI) only for sections that benefit from
 * natural-language synthesis (Executive Summary, Event Analysis).
 *
 * Reports are persisted in the `shuffle-security_reports` datastore
 * category, keyed by incident id, so re-opening the dialog does not
 * regenerate the report.
 */

import { askAI } from '@/services/ai';
import {
  DATASTORE_CATEGORIES,
  getDatastoreItem,
  setDatastoreItem,
} from '@/Shuffle-Core/datastore';
import type { Observable, IncidentTask } from '@/config/ocsfIncidentSchema';

export interface ReportSection {
  title: string;
  body: string; // plain text or simple markdown-ish
}

export interface ReportTimelineEntry {
  timestamp: number; // ms
  label: string;
  detail?: string;
  source?: string; // e.g. "Comment", "Status", "Agent", "Task"
}

export interface ReportIOC {
  type: string;
  value: string;
  first_seen?: number | string;
  last_seen?: number | string;
}

export interface IncidentReport {
  incidentId: string;
  generatedAt: number;
  generatedBy?: string;
  version: number;
  // 1. Title
  title: string;
  // 2. Description / executive summary (AI generated)
  executiveSummary: string;
  rawDescription: string;
  // 3. Alert details (extracted)
  alertDetails: {
    source?: string;
    severity?: string;
    status?: string;
    assignee?: string | null;
    created?: string;
    edited?: string;
    tlp?: string;
    pap?: string;
    labels?: string[];
    references?: string[];
    customFields?: Record<string, string | number | boolean>;
  };
  // 4. Tasks (extracted)
  tasks: Array<{
    title: string;
    completed: boolean;
    assignee?: string;
    category?: string;
    dueDate?: string;
    completedAt?: number;
  }>;
  // 5. Event analysis (AI generated)
  eventAnalysis: string;
  // 6. IOCs (extracted)
  iocs: ReportIOC[];
  // 7. Full timeline (extracted)
  timeline: ReportTimelineEntry[];
}

export interface GenerateReportInput {
  incidentId: string;
  title: string;
  description: string;
  source?: string;
  severity?: string;
  status?: string;
  assignee?: string | null;
  created?: string;
  edited?: string;
  tlp?: string;
  pap?: string;
  labels?: string[];
  references?: string[];
  customFields?: Record<string, string | number | boolean>;
  observables?: Observable[];
  enrichments?: Array<{ type: string; value?: string; data?: string; first_seen?: string | number; last_seen?: string | number }>;
  tasks?: IncidentTask[];
  activity?: Array<{
    id?: string;
    type?: string;
    user?: string;
    timestamp?: number;
    content?: string;
  }>;
  agentRuns?: Array<{
    execution_id?: string;
    started_at?: number;
    status?: string;
    decision?: string;
    summary?: string;
  }>;
  workflowRuns?: Array<{
    execution_id?: string;
    started_at?: number | string;
    status?: string;
    workflow?: { name?: string };
  }>;
  rawOCSF?: any;
}

const REPORT_VERSION = 1;

/** Strip HTML tags for safe inclusion in AI prompts and PDF text. */
const stripHtml = (s: string | undefined): string => {
  if (!s) return '';
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
};

const trim = (s: string, max: number): string => {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
};

/** Identify which observable types should be considered IOCs. */
const IOC_TYPES = new Set([
  'ip', 'ipv4', 'ipv6', 'domain', 'hostname', 'url', 'fqdn',
  'md5', 'sha1', 'sha256', 'hash', 'file_hash', 'filename', 'filepath',
  'email', 'email_address', 'cve', 'mutex', 'registry_key',
]);

const isIocType = (t: string | undefined): boolean => {
  if (!t) return false;
  return IOC_TYPES.has(t.toLowerCase());
};

/** Build the structured timeline by merging activity, tasks, agent runs, and lifecycle events. */
const buildTimeline = (input: GenerateReportInput): ReportTimelineEntry[] => {
  const entries: ReportTimelineEntry[] = [];

  if (input.created) {
    const ts = Date.parse(input.created);
    if (!isNaN(ts)) {
      entries.push({
        timestamp: ts,
        label: 'Incident created',
        detail: input.source ? `Source: ${input.source}` : undefined,
        source: 'Lifecycle',
      });
    }
  }

  (input.activity || []).forEach(a => {
    if (!a?.timestamp) return;
    const ts = typeof a.timestamp === 'number' ? a.timestamp : Date.parse(String(a.timestamp));
    if (!ts || isNaN(ts)) return;
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const type = a.type || 'comment';
    const label =
      type === 'comment' ? `Comment by ${a.user || 'unknown'}` :
      type === 'status' ? `Status change by ${a.user || 'unknown'}` :
      type === 'assignment' ? `Assignment by ${a.user || 'unknown'}` :
      type === 'change' ? `Edit by ${a.user || 'unknown'}` :
      `${type} by ${a.user || 'unknown'}`;
    entries.push({
      timestamp: ms,
      label,
      detail: stripHtml(a.content),
      source: type.charAt(0).toUpperCase() + type.slice(1),
    });
  });

  (input.tasks || []).forEach(t => {
    if (t.createdAt) {
      entries.push({
        timestamp: t.createdAt,
        label: `Task created: ${t.title}`,
        detail: t.assignee ? `Assigned to ${t.assignee}` : undefined,
        source: 'Task',
      });
    }
    if (t.completed && t.completedAt) {
      entries.push({
        timestamp: t.completedAt,
        label: `Task completed: ${t.title}`,
        source: 'Task',
      });
    }
  });

  (input.agentRuns || []).forEach(r => {
    if (!r.started_at) return;
    const ms = r.started_at < 1e12 ? r.started_at * 1000 : r.started_at;
    entries.push({
      timestamp: ms,
      label: `Agent run (${r.status || 'completed'})`,
      detail: r.summary || r.decision,
      source: 'Agent',
    });
  });

  (input.workflowRuns || []).forEach(r => {
    if (!r?.started_at) return;
    const raw = typeof r.started_at === 'number' ? r.started_at : (Number(r.started_at) || Date.parse(String(r.started_at)));
    if (!raw || isNaN(raw)) return;
    const ms = raw < 1e12 ? raw * 1000 : raw;
    entries.push({
      timestamp: ms,
      label: `Workflow run: ${r.workflow?.name || 'Workflow'} (${(r.status || 'unknown').toLowerCase()})`,
      source: 'Workflow',
    });
  });

  return entries.sort((a, b) => a.timestamp - b.timestamp);
};

/** Rebuild the timeline of a stored report from current incident data so it is always complete. */
export const refreshReportTimeline = (report: IncidentReport, input: GenerateReportInput): IncidentReport => ({
  ...report,
  timeline: buildTimeline(input),
});

const buildIocs = (input: GenerateReportInput): ReportIOC[] => {
  const seen = new Set<string>();
  const iocs: ReportIOC[] = [];
  const push = (type: string, value: string, first_seen?: any, last_seen?: any) => {
    if (!value) return;
    const k = `${type.toLowerCase()}::${value.toLowerCase()}`;
    if (seen.has(k)) return;
    seen.add(k);
    iocs.push({ type, value, first_seen, last_seen });
  };

  (input.observables || []).forEach(o => {
    if (o.archived) return;
    if (isIocType(o.type)) push(o.type, o.value, o.first_seen, o.last_seen);
  });
  (input.enrichments || []).forEach(e => {
    const v = e.value || e.data || '';
    if (!v) return;
    if (isIocType(e.type)) push(e.type, v, e.first_seen, e.last_seen);
  });
  return iocs;
};

/**
 * Compose a compact context blob for the LLM. We deliberately strip HTML and
 * truncate to keep token usage small.
 */
const buildAIContext = (input: GenerateReportInput): string => {
  const desc = trim(stripHtml(input.description), 4000);
  const tasksLine = (input.tasks || [])
    .slice(0, 25)
    .map(t => `- [${t.completed ? 'x' : ' '}] ${t.title}${t.assignee ? ` (@${t.assignee})` : ''}`)
    .join('\n');
  const obsLine = (input.observables || [])
    .filter(o => !o.archived)
    .slice(0, 25)
    .map(o => `- ${o.type}: ${o.value}`)
    .join('\n');
  const activityLine = (input.activity || [])
    .slice(-15)
    .map(a => `- ${new Date((a.timestamp || 0) < 1e12 ? (a.timestamp || 0) * 1000 : (a.timestamp || 0)).toISOString()} ${a.user || 'system'} (${a.type || 'comment'}): ${trim(stripHtml(a.content), 240)}`)
    .join('\n');

  return [
    `Title: ${input.title}`,
    `Source: ${input.source || 'unknown'}`,
    `Severity: ${input.severity || 'unknown'}`,
    `Status: ${input.status || 'unknown'}`,
    `Created: ${input.created || 'unknown'}`,
    '',
    `Description:\n${desc || '(no description)'}`,
    '',
    `Tasks:\n${tasksLine || '(none)'}`,
    '',
    `Observables:\n${obsLine || '(none)'}`,
    '',
    `Recent activity:\n${activityLine || '(none)'}`,
  ].join('\n');
};

const SUMMARY_PROMPT = `You are a senior SOC analyst writing the executive summary for an incident report.
Write 2-4 short paragraphs of plain prose (no bullet lists, no markdown, no headings).
Cover: what happened, why it matters, current status, and what was done so far.
Be factual; do not invent details that are not in the context.

Incident context:
`;

const EVENT_ANALYSIS_PROMPT = `You are a senior SOC analyst writing the "Event Analysis" section of an incident report.
Provide a technical narrative reconstruction of the event in 3-6 short paragraphs of plain prose.
Cover (when supported by the data): initial trigger, affected entities, observed indicators, attacker behavior or hypothesis, and gaps in visibility.
Do not invent indicators, hostnames, users, or timestamps that are not in the context.

Incident context:
`;

const callAISafe = async (prompt: string, fallback: string): Promise<string> => {
  try {
    const res = await askAI({ query: prompt });
    if (res.success && res.result && res.result.trim().length > 0) {
      return res.result.trim();
    }
    return fallback;
  } catch {
    return fallback;
  }
};

/**
 * Build a fresh report. Calls the AI for summary + event analysis;
 * extracts everything else deterministically.
 */
export const generateIncidentReport = async (
  input: GenerateReportInput,
  generatedBy?: string,
): Promise<IncidentReport> => {
  const ctx = buildAIContext(input);

  const [executiveSummary, eventAnalysis] = await Promise.all([
    callAISafe(
      SUMMARY_PROMPT + ctx,
      stripHtml(input.description) ||
        'No description available. This incident was generated from automated detection without a written summary.',
    ),
    callAISafe(
      EVENT_ANALYSIS_PROMPT + ctx,
      'No event analysis is available for this incident. Insufficient context to produce a technical reconstruction.',
    ),
  ]);

  return {
    incidentId: input.incidentId,
    generatedAt: Date.now(),
    generatedBy,
    version: REPORT_VERSION,
    title: input.title || 'Untitled incident',
    executiveSummary,
    rawDescription: stripHtml(input.description),
    alertDetails: {
      source: input.source,
      severity: input.severity,
      status: input.status,
      assignee: input.assignee ?? null,
      created: input.created,
      edited: input.edited,
      tlp: input.tlp,
      pap: input.pap,
      labels: input.labels,
      references: input.references,
      customFields: input.customFields,
    },
    tasks: (input.tasks || []).map(t => ({
      title: t.title,
      completed: !!t.completed,
      assignee: t.assignee,
      category: t.category,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
    })),
    eventAnalysis,
    iocs: buildIocs(input),
    timeline: buildTimeline(input),
  };
};

/** Load a previously stored report for the given incident, or undefined. */
export const loadIncidentReport = async (
  incidentId: string,
  overrideOrgId?: string,
): Promise<IncidentReport | undefined> => {
  const res = await getDatastoreItem(incidentId, DATASTORE_CATEGORIES.REPORTS, overrideOrgId);
  if (!res.success || !res.item?.value) return undefined;
  try {
    const parsed = JSON.parse(res.item.value);
    if (parsed && typeof parsed === 'object' && parsed.incidentId === incidentId) {
      return parsed as IncidentReport;
    }
  } catch {
    /* ignore */
  }
  return undefined;
};

/** Persist a report so it does not need to be regenerated. */
export const saveIncidentReport = async (
  report: IncidentReport,
  overrideOrgId?: string,
): Promise<boolean> => {
  const res = await setDatastoreItem(
    report.incidentId,
    JSON.stringify(report),
    DATASTORE_CATEGORIES.REPORTS,
    overrideOrgId,
  );
  return !!res.success;
};
