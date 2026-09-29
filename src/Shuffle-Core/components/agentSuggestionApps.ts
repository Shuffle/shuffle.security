/**
 * agentSuggestionApps — maps a curated prompt suggestion to the apps (or app
 * categories) the agent needs in order to actually run that task.
 *
 * Two kinds of requirements:
 *  - `app`      : a concrete app we can pre-select right away. Used for
 *                 Shuffle's own internal apps (Shuffle Incidents, Shuffle
 *                 Workflows, Shuffle App Management, Shuffle Datastore, HTTP)
 *                 and for vendors named explicitly in the suggestion text.
 *  - `category` : the task needs *some* app of a given type (SIEM, EDR, git,
 *                 email, cloud …) but only the user knows which one. The UI
 *                 renders these as a dashed "pick one" chip that opens the
 *                 Tools app search with the category query pre-filled.
 */

export interface SuggestionAppRequirement {
  kind: 'app' | 'category';
  /** For `app`: the Shuffle app name (snake_case). For `category`: the search query. */
  value: string;
  /** Human label shown in the chip / tooltip. */
  label: string;
}

interface Rule {
  /** Case-insensitive matcher against the suggestion text. */
  match: RegExp;
  reqs: SuggestionAppRequirement[];
}

const app = (value: string, label: string): SuggestionAppRequirement => ({ kind: 'app', value, label });
const cat = (value: string, label: string): SuggestionAppRequirement => ({ kind: 'category', value, label });

// Internal Shuffle apps — always available, so they can be pre-selected.
const SHUFFLE_INCIDENTS = app('shuffle_incidents', 'Shuffle Incidents');
const SHUFFLE_WORKFLOWS = app('shuffle_workflows', 'Shuffle Workflows');
const SHUFFLE_APPS = app('shuffles_app_management', 'Shuffle App Management');
const SHUFFLE_DATASTORE = app('shuffle_datastore', 'Shuffle Datastore');
const SHUFFLE_TOOLS = app('shuffle_tools', 'Shuffle Tools');
const HTTP = app('http', 'HTTP');

/**
 * Ordered rules — every matching rule contributes its requirements, deduped by
 * value, capped by the caller. Put the most specific rules first.
 */
const RULES: Rule[] = [
  // — Named vendors ————————————————————————————————————————————
  { match: /\bsplunk\b/i, reqs: [app('splunk', 'Splunk')] },
  { match: /\bsentinel\b/i, reqs: [app('microsoft_sentinel', 'Microsoft Sentinel')] },
  { match: /\bcrowdstrike\b/i, reqs: [app('crowdstrike', 'CrowdStrike')] },
  { match: /\bsentinelone\b/i, reqs: [app('sentinelone', 'SentinelOne')] },
  { match: /\bvirustotal\b/i, reqs: [app('virustotal', 'VirusTotal')] },
  { match: /\babuseipdb\b/i, reqs: [app('abuseipdb', 'AbuseIPDB')] },
  { match: /\bmalwarebazaar\b/i, reqs: [app('malwarebazaar', 'MalwareBazaar')] },
  { match: /\burlhaus\b/i, reqs: [app('urlhaus', 'URLhaus')] },
  { match: /\bphishtank\b/i, reqs: [app('phishtank', 'PhishTank')] },
  { match: /\bjira\b/i, reqs: [app('jira', 'Jira')] },
  { match: /\bcisa\b/i, reqs: [HTTP] },
  { match: /\bs3\b|\bIAM\b|security group|0\.0\.0\.0\/0|cloud account/i, reqs: [cat('aws cloud', 'Cloud provider')] },

  // — Categories ————————————————————————————————————————————————
  { match: /\bemail|inbox|mailbox|newsletter|unsubscribe|phishing report/i, reqs: [cat('email', 'Email app')] },
  { match: /\bcalendar|meeting|reschedul|agenda|focus time|on-call/i, reqs: [cat('calendar', 'Calendar app')] },
  { match: /\bSIEM\b|log source|auth logs|sign-?ins?\b/i, reqs: [cat('siem', 'SIEM')] },
  { match: /\bEDR\b|endpoint|isolate|quarantine|process tree|host monitor|LOLBin/i, reqs: [cat('edr', 'EDR')] },
  { match: /pull request|repo\b|repos\b|git\b|source code/i, reqs: [cat('git', 'Git provider')] },
  { match: /\bIOC|threat (intel|feed)|blocklist|firewall|bad domain|file hash/i, reqs: [cat('threat intelligence', 'Threat intel'), SHUFFLE_DATASTORE] },
  { match: /vulnerab|CVE|patch|exploit|CIS benchmark|scan/i, reqs: [cat('vulnerability scanner', 'Vuln scanner')] },
  { match: /user access|admin group|MFA|password reset|joiner|leaver|offboard|onboard|service account|dormant API|provision/i, reqs: [cat('identity access management', 'Identity provider')] },
  { match: /\bcloud|unencrypted database|certificate expiry|\bDNS\b|cloud spend/i, reqs: [cat('cloud', 'Cloud provider')] },
  { match: /\bticket|Kanban|release notes|postmortem|runbook/i, reqs: [cat('ticketing', 'Ticketing')] },
  { match: /\bnotify|page the|message|slack|digest|report to|send me|email the team|greetings/i, reqs: [cat('communication', 'Chat / comms')] },
  { match: /\bHR\b|performance review|new joiner|birthday|work anniversar/i, reqs: [cat('human resources', 'HR system')] },
  { match: /backup|restore|status page|uptime|endpoints? every minute|non-2xx/i, reqs: [HTTP] },
  { match: /invoice|expense|receipt|coffee|inventory drops/i, reqs: [cat('finance', 'Finance / ERP')] },
  { match: /sandbox|detonate/i, reqs: [cat('sandbox', 'Malware sandbox')] },
  { match: /news feed|advisor(y|ies)|newly registered domain|brand/i, reqs: [HTTP] },

  // — Shuffle internals ————————————————————————————————————————
  { match: /incident|alert queue|alerts?\b|case\b|SLA|MITRE|standup brief|triage/i, reqs: [SHUFFLE_INCIDENTS] },
  { match: /workflow|automation|detection rule|sigma|pipeline|playbook/i, reqs: [SHUFFLE_WORKFLOWS] },
  { match: /\bapps?\b|integration|coverage report/i, reqs: [SHUFFLE_APPS] },
  { match: /datastore|cache|prune entries|allowlist/i, reqs: [SHUFFLE_DATASTORE] },
];

/**
 * Resolve the apps / app categories a suggestion needs.
 * Returns matching requirements, or an empty list when no specific tools are needed.
 */
export const getSuggestionAppRequirements = (
  suggestion: string,
  limit = 3,
): SuggestionAppRequirement[] => {
  const text = suggestion || '';
  const out: SuggestionAppRequirement[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    if (!rule.match.test(text)) continue;
    for (const req of rule.reqs) {
      const key = `${req.kind}:${req.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(req);
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
};

/** "shuffle_workflows" -> "Shuffle Workflows" */
export const prettySuggestionAppName = (name: string) =>
  name
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
