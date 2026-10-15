/**
 * exportReport — configurable multi-section PDF report.
 *
 * The dashboard export dialog lets the user pick sections (dashboard
 * captures, tenant details, sub-tenants, incidents, workflows, runs, apps,
 * vulnerabilities, runtime locations). Each data section is fetched from the
 * API on demand during generation and rendered as a paginated table, scoped
 * to the chosen time range where the data carries a timestamp.
 */
import { jsPDF } from 'jspdf';
import { getApiUrl, getAuthHeader } from '../../api';

export type ReportSectionId =
  | 'dashboards'
  | 'tenant'
  | 'subtenants'
  | 'incidents'
  | 'workflows'
  | 'runs'
  | 'apps'
  | 'vulnerabilities'
  | 'locations';

export interface ReportSectionDef {
  id: ReportSectionId;
  label: string;
  description: string;
  /** True when rows are filtered by the chosen time range. */
  rangeScoped: boolean;
}

export const REPORT_SECTIONS: ReportSectionDef[] = [
  { id: 'dashboards', label: 'Dashboard charts and stats', description: 'Security Operations and Automation dashboards plus the raw stats summary.', rangeScoped: true },
  { id: 'tenant', label: 'Tenant details', description: 'Name, ID, region and plan of the current tenant.', rangeScoped: false },
  { id: 'subtenants', label: 'Sub-tenants', description: 'List of child tenants, when any exist.', rangeScoped: false },
  { id: 'incidents', label: 'Incidents', description: 'Incidents created in the chosen range.', rangeScoped: true },
  { id: 'workflows', label: 'Workflows', description: 'All workflows with status, triggers and last edit time.', rangeScoped: false },
  { id: 'runs', label: 'Workflow runs', description: 'Daily run, finished and failed counts in the chosen range.', rangeScoped: true },
  { id: 'apps', label: 'Apps', description: 'Authenticated apps and whether their credentials are valid.', rangeScoped: false },
  { id: 'vulnerabilities', label: 'Vulnerabilities', description: 'Vulnerabilities discovered in the chosen range.', rangeScoped: true },
  { id: 'locations', label: 'Runtime locations', description: 'Runtime locations with type, queue length and last check-in.', rangeScoped: false },
];

export interface ReportTable {
  title: string;
  note?: string;
  columns: { header: string; width: number }[]; // width = fraction of usable width
  rows: string[][];
}

export interface ReportContext {
  fromMs: number;
  toMs: number;
  orgId?: string;
  userdata?: any;
}

const MAX_ROWS = 1000;

const fetchJson = async (path: string): Promise<any> => {
  const res = await fetch(getApiUrl(path), {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
};

const toMs = (t: unknown): number => {
  if (t === null || t === undefined || t === '') return 0;
  const n = typeof t === 'number' ? t : Number(t);
  if (!isNaN(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  if (typeof t === 'string') {
    const d = new Date(t).getTime();
    return isNaN(d) ? 0 : d;
  }
  return 0;
};

const fmtDate = (ms: number) => (ms ? new Date(ms).toLocaleString() : '-');
const str = (v: unknown, fallback = '-') => {
  if (v === null || v === undefined || v === '') return fallback;
  return String(v);
};
const inRange = (ms: number, ctx: ReportContext) => ms >= ctx.fromMs && ms <= ctx.toMs;
const parseValue = (item: any) => {
  if (item?.value === undefined || item?.value === null) return item;
  if (typeof item.value !== 'string') return item.value;
  try { return JSON.parse(item.value); } catch { return null; }
};
const cap = (rows: string[][]): { rows: string[][]; note?: string } =>
  rows.length > MAX_ROWS
    ? { rows: rows.slice(0, MAX_ROWS), note: `Showing the first ${MAX_ROWS} of ${rows.length} rows.` }
    : { rows };

/** Follow datastore cursors for a category, up to `maxPages`. */
const fetchDatastoreList = async (basePath: string, maxPages = 20): Promise<any[]> => {
  const out: any[] = [];
  let cursor = '';
  for (let i = 0; i < maxPages; i++) {
    const sep = basePath.includes('?') ? '&' : '?';
    const data = await fetchJson(cursor ? `${basePath}${sep}cursor=${encodeURIComponent(cursor)}` : basePath);
    const list = Array.isArray(data) ? data : (data?.keys || data?.data || []);
    out.push(...list);
    const next = !Array.isArray(data) ? data?.cursor : '';
    if (!next || next === cursor || list.length === 0) break;
    cursor = next;
  }
  return out;
};

export const getChildTenants = (userdata: any): { id: string; name: string; region: string }[] => {
  const activeId = userdata?.active_org?.id;
  const fromOrgs = Array.isArray(userdata?.orgs)
    ? userdata.orgs.filter((o: any) => activeId && o?.creator_org === activeId)
    : [];
  const fromChild = Array.isArray(userdata?.active_org?.child_orgs) ? userdata.active_org.child_orgs : [];
  const seen = new Set<string>();
  const out: { id: string; name: string; region: string }[] = [];
  for (const o of [...fromOrgs, ...fromChild]) {
    const id = o?.id || '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: o?.name || id, region: o?.region || o?.region_url || '-' });
  }
  return out;
};

const SEV_MAP: Record<number, string> = { 1: 'Informational', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Critical', 6: 'Critical' };
const STATUS_MAP: Record<number, string> = { 1: 'New', 2: 'In progress', 3: 'Resolved', 4: 'On hold' };

export const buildSectionTable = async (id: ReportSectionId, ctx: ReportContext): Promise<ReportTable | null> => {
  const org = ctx.userdata?.active_org || {};
  switch (id) {
    case 'tenant': {
      return {
        title: 'Tenant details',
        columns: [{ header: 'Field', width: 0.3 }, { header: 'Value', width: 0.7 }],
        rows: [
          ['Name', str(org.name)],
          ['Tenant ID', str(org.id || ctx.orgId)],
          ['Region', str(org.region || org.region_url)],
          ['Plan', str(org.subscription_type || org.lead_info?.type || org.sync_features?.plan)],
          ['Parent tenant', str(org.creator_org, 'None')],
          ['Sub-tenants', String(getChildTenants(ctx.userdata).length)],
          ['Report user', str(ctx.userdata?.username)],
        ],
      };
    }
    case 'subtenants': {
      const children = getChildTenants(ctx.userdata);
      if (children.length === 0) return null;
      return {
        title: 'Sub-tenants',
        columns: [{ header: 'Name', width: 0.4 }, { header: 'Tenant ID', width: 0.4 }, { header: 'Region', width: 0.2 }],
        rows: children.map((c) => [c.name, c.id, c.region]),
      };
    }
    case 'incidents': {
      const items = await fetchDatastoreList('/api/v1/orgs/' + encodeURIComponent(ctx.orgId || org.id || '') + '/list_cache?category=incidents&top=100');
      const seen = new Set<string>();
      const rows: { ms: number; row: string[] }[] = [];
      for (const item of items) {
        const key = String(item?.key || '').split('::').pop() || '';
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        const d = parseValue(item);
        if (!d) continue;
        const ms = toMs(d.created_time) || toMs(item?.created);
        if (!inRange(ms, ctx)) continue;
        const custom = d?.metadata?.extensions?.custom_attributes || {};
        const severity = d.severity || SEV_MAP[d.severity_id] || 'Medium';
        const status = d.status || custom.status || STATUS_MAP[d.status_id] || 'New';
        const title = d.finding_info?.title || d.title || d.message || key || '-';
        const assignee = d.assignee?.name || d.assignee?.email_addr || custom.assignee || '-';
        rows.push({ ms, row: [str(title), str(severity), str(status), str(assignee), fmtDate(ms)] });
      }
      rows.sort((a, b) => b.ms - a.ms);
      const c = cap(rows.map((r) => r.row));
      return {
        title: 'Incidents',
        note: c.note,
        columns: [
          { header: 'Title', width: 0.4 }, { header: 'Severity', width: 0.12 }, { header: 'Status', width: 0.13 },
          { header: 'Assignee', width: 0.15 }, { header: 'Created', width: 0.2 },
        ],
        rows: c.rows,
      };
    }
    case 'workflows': {
      const data = await fetchJson('/api/v1/workflows');
      const list: any[] = Array.isArray(data) ? data : (data?.workflows || []);
      const rows = list
        .map((w) => ({ ms: toMs(w.edited) || toMs(w.created), w }))
        .sort((a, b) => b.ms - a.ms)
        .map(({ ms, w }) => [
          str(w.name),
          str(w.status || (w.is_valid === false ? 'invalid' : 'active')),
          String(Array.isArray(w.actions) ? w.actions.length : 0),
          String(Array.isArray(w.triggers) ? w.triggers.length : 0),
          fmtDate(ms),
        ]);
      const c = cap(rows);
      return {
        title: 'Workflows',
        note: c.note,
        columns: [
          { header: 'Name', width: 0.4 }, { header: 'Status', width: 0.14 }, { header: 'Actions', width: 0.1 },
          { header: 'Triggers', width: 0.11 }, { header: 'Last edited', width: 0.25 },
        ],
        rows: c.rows,
      };
    }
    case 'runs': {
      const orgId = ctx.orgId || org.id;
      if (!orgId) return null;
      const stats = await fetchJson(`/api/v1/orgs/${encodeURIComponent(orgId)}/stats`);
      const daily: any[] = Array.isArray(stats?.daily_statistics) ? stats.daily_statistics : [];
      let total = 0, finished = 0, failed = 0, appRuns = 0;
      const rows = daily
        .map((d) => ({ ms: new Date(d.date).getTime(), d }))
        .filter(({ ms }) => !isNaN(ms) && inRange(ms, ctx))
        .sort((a, b) => a.ms - b.ms)
        .map(({ ms, d }) => {
          total += d.workflow_executions || 0;
          finished += d.workflow_executions_finished || 0;
          failed += d.workflow_executions_failed || 0;
          appRuns += d.app_executions || 0;
          return [
            new Date(ms).toLocaleDateString(),
            String(d.workflow_executions || 0),
            String(d.workflow_executions_finished || 0),
            String(d.workflow_executions_failed || 0),
            String(d.app_executions || 0),
          ];
        });
      rows.push(['Total', String(total), String(finished), String(failed), String(appRuns)]);
      return {
        title: 'Workflow runs',
        columns: [
          { header: 'Date', width: 0.28 }, { header: 'Runs', width: 0.18 }, { header: 'Finished', width: 0.18 },
          { header: 'Failed', width: 0.18 }, { header: 'App runs', width: 0.18 },
        ],
        rows,
      };
    }
    case 'apps': {
      const data = await fetchJson('/api/v1/apps/authentication');
      const list: any[] = Array.isArray(data) ? data : (data?.data || []);
      const rows = list.map((a) => [
        str(a.app?.name || a.app_name),
        str(a.label),
        a.validation?.valid === false || a.active === false ? 'Invalid' : 'Valid',
        fmtDate(toMs(a.edited) || toMs(a.created)),
      ]);
      const c = cap(rows);
      return {
        title: 'Apps',
        note: c.note,
        columns: [
          { header: 'App', width: 0.3 }, { header: 'Authentication label', width: 0.35 },
          { header: 'Status', width: 0.12 }, { header: 'Last updated', width: 0.23 },
        ],
        rows: c.rows,
      };
    }
    case 'vulnerabilities': {
      const items = await fetchDatastoreList('/api/v2/vulns?skip_fields=false&top=100');
      const rows: { ms: number; row: string[] }[] = [];
      for (const item of items) {
        const v = parseValue(item);
        if (!v) continue;
        const ms = toMs(v.first_seen_time) || toMs(v.created_time) || toMs(v.published) || toMs(item?.created);
        if (!inRange(ms, ctx)) continue;
        const id = v.cve?.uid || v.id || v.uid || item?.key;
        const title = v.title || v.summary || v.desc || '-';
        const severity = v.severity || v.database_specific?.severity || '-';
        const host = v.device?.hostname || v.resource?.name || v.affected_packages?.[0]?.name || v.affected?.[0]?.package?.name || '-';
        rows.push({ ms, row: [str(id), str(title), str(severity), str(host), fmtDate(ms)] });
      }
      rows.sort((a, b) => b.ms - a.ms);
      const c = cap(rows.map((r) => r.row));
      return {
        title: 'Vulnerabilities',
        note: c.note,
        columns: [
          { header: 'ID', width: 0.17 }, { header: 'Title', width: 0.35 }, { header: 'Severity', width: 0.11 },
          { header: 'Asset or package', width: 0.17 }, { header: 'Discovered', width: 0.2 },
        ],
        rows: c.rows,
      };
    }
    case 'locations': {
      const envs = await fetchJson('/api/v1/getenvironments');
      const list: any[] = Array.isArray(envs) ? envs : [];
      const now = Math.floor(Date.now() / 1000);
      const rows = list
        .filter((e) => !e.archived)
        .map((e) => {
          const isCloud = String(e.Type || '').toLowerCase() === 'cloud';
          const active = isCloud || (e.checkin > 0 && now - e.checkin < 300);
          return [
            str(e.Name || e.name),
            str(e.Type),
            active ? 'Running' : 'Stopped',
            String(e.queue ?? 0),
            e.checkin > 0 ? fmtDate(e.checkin * 1000) : '-',
          ];
        });
      return {
        title: 'Runtime locations',
        columns: [
          { header: 'Name', width: 0.32 }, { header: 'Type', width: 0.14 }, { header: 'State', width: 0.14 },
          { header: 'Queue', width: 0.12 }, { header: 'Last check-in', width: 0.28 },
        ],
        rows,
      };
    }
    default:
      return null;
  }
};

// ── PDF rendering ─────────────────────────────────────────────────────────

const M = 32;
const ROW_FONT = 8.5;
const LINE_H = 10.5;

/** Render a table onto new pages, repeating the header on each page break. */
export const drawTable = (pdf: jsPDF, table: ReportTable, rangeLabel: string) => {
  pdf.addPage();
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const usable = pageW - M * 2;
  const xs: number[] = [];
  let acc = M;
  table.columns.forEach((c) => { xs.push(acc); acc += c.width * usable; });
  const widths = table.columns.map((c) => c.width * usable - 6);

  let y = M;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(20, 20, 20);
  pdf.text(table.title, M, y);
  y += 14;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(110, 110, 110);
  pdf.text(`${table.rows.length} rows · ${rangeLabel}`, M, y);
  y += 12;
  if (table.note) { pdf.text(table.note, M, y); y += 12; }
  y += 4;

  const header = () => {
    pdf.setFillColor(242, 242, 242);
    pdf.rect(M, y - 9, usable, 14, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(ROW_FONT);
    pdf.setTextColor(40, 40, 40);
    table.columns.forEach((c, i) => pdf.text(c.header, xs[i] + 3, y));
    y += 12;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(50, 50, 50);
  };
  header();

  if (table.rows.length === 0) {
    pdf.setTextColor(120, 120, 120);
    pdf.text('No data in this range.', M + 3, y + 4);
    return;
  }

  for (const row of table.rows) {
    const cells = row.map((v, i) => {
      const lines = pdf.splitTextToSize(String(v), widths[i]) as string[];
      return lines.length > 3 ? [...lines.slice(0, 2), `${lines[2].slice(0, -3)}...`] : lines;
    });
    const h = Math.max(...cells.map((l) => l.length)) * LINE_H + 3;
    if (y + h > pageH - M) {
      pdf.addPage();
      y = M + 4;
      header();
    }
    cells.forEach((lines, i) => pdf.text(lines, xs[i] + 3, y));
    pdf.setDrawColor(230, 230, 230);
    pdf.line(M, y + h - LINE_H + 1, M + usable, y + h - LINE_H + 1);
    y += h;
  }
};
