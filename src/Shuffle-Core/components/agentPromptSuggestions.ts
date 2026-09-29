/**
 * Curated "continuous task" prompt suggestions for the AgentUI starter
 * input. Skewed towards security operations and the everyday SOC / IT /
 * workplace chores that benefit from being run on a schedule.
 *
 * Used by the AgentUI prompt autocomplete: as the user types, we filter
 * this list for substring matches (case-insensitive) and surface the
 * top results, Google-style.
 */
export const AGENT_PROMPT_SUGGESTIONS: string[] = [
  // — Email & comms ————————————————————————————————————————————————
  'Take care of my emails by pretending to be me and answering them',
  'Triage my inbox every hour and draft replies for anything urgent',
  'Summarise my unread emails from the last 24 hours and rank them by importance',
  'Forward any phishing-looking emails in my inbox to the security team and quarantine them',
  'Reply to scheduling requests in my inbox using my working hours and calendar availability',
  'Every morning, send me a digest of overnight emails grouped by sender and topic',
  'Auto-unsubscribe from marketing emails I have not opened in 60 days',
  'Snooze low-priority newsletters until Friday afternoon',
  'Flag and archive shipping notifications once the package is delivered',
  'Clean up my inbox by archiving anything older than 30 days that I have already read',

  // — Calendar & meetings ————————————————————————————————————————————
  'Block focus time on my calendar every weekday morning between 9 and 11',
  'Decline meetings that conflict with my focus blocks and propose alternatives',
  'Send me a daily agenda every weekday at 8am with prep notes per meeting',
  'Reschedule any meeting without an agenda 24 hours before it starts',
  'Send meeting notes and action items to all attendees after every call',
  'Find a 30-minute slot this week that works for me and the people I mention',
  'Cancel recurring meetings that I have skipped 3 times in a row',
  'Remind me 15 minutes before any meeting that I have not prepared for',

  // — Incidents & SOC operations ———————————————————————————————————
  'Triage new incidents every 15 minutes and assign severity, owner, and next steps',
  'Watch for new critical incidents and page the on-call engineer immediately',
  'Close incidents older than 30 days that have had no activity and no observables',
  'Merge duplicate incidents that share the same observable or hostname',
  'Enrich every new incident with threat intel and asset context within 2 minutes',
  'Auto-acknowledge incidents from known maintenance windows and link them to the change ticket',
  'Summarise yesterday\'s incidents into a daily standup brief for the SOC team',
  'Escalate any incident that breaches its SLA to the team lead',
  'Tag every incident with the MITRE ATT&CK technique that best matches its observables',
  'Watch the alert queue and group related alerts into a single incident',
  'Auto-resolve incidents whose root cause matches a previously closed incident',
  'Reopen any closed incident if the same observable shows up again within 7 days',
  'Send a weekly incident trend report every Monday morning to the security leadership',

  // — Threat intel & IOCs —————————————————————————————————————————
  'Pull new IOCs from my threat feeds every hour and push them to the firewall blocklist',
  'Check every external IP in today\'s incidents against VirusTotal and AbuseIPDB',
  'Sweep the environment for any host that has connected to a known bad domain in the last 7 days',
  'Subscribe to new CISA advisories and turn them into detection rules where possible',
  'Cross-reference observed file hashes against MalwareBazaar daily',
  'Watch for newly registered domains that look like our brand and report them',
  'Alert me whenever a new CVE with a known exploit affects software in our inventory',
  'Refresh the IOC datastore every 6 hours and prune entries older than 30 days',

  // — Detection engineering ———————————————————————————————————————
  'Review noisy detection rules every week and propose tuning suggestions',
  'Convert the latest Sigma rules from the public repo into our SIEM\'s format and stage them for review',
  'Tell me which detection rules have not fired in the last 90 days so I can retire them',
  'Audit MITRE ATT&CK coverage every Monday and flag techniques with zero detections',
  'Backtest new detection rules against the last 30 days of logs before promoting them to production',

  // — SIEM operations ———————————————————————————————————————————
  'Triage new Splunk alerts every 10 minutes and assign severity, owner, and next steps',
  'Watch Microsoft Sentinel for high-severity incidents and page the on-call analyst immediately',
  'Suppress noisy SIEM alerts that fire more than 50 times per hour and open a tuning ticket',
  'Correlate failed login spikes in the SIEM with VPN logs and flag possible brute-force attempts',
  'Hunt the SIEM every morning for sign-ins from countries we do not operate in',
  'Forward critical SIEM detections straight to Case Management and skip the alert queue',
  'Run a weekly SIEM data-source health check and alert me on any log source silent for over 1 hour',
  'Enrich every SIEM alert with asset owner, criticality, and recent vulnerabilities before triage',
  'Search the SIEM for the latest IOCs from threat intel feeds every 30 minutes',
  'Summarise top 10 noisiest SIEM rules every Friday and propose tuning candidates',
  'Detect lateral movement patterns in SIEM auth logs and open an incident with the affected hosts',
  'Watch the SIEM for any disable or delete of audit logging and treat it as a critical incident',

  // — EDR operations ————————————————————————————————————————————
  'Isolate any endpoint that triggers a critical CrowdStrike alert and notify the user\'s manager',
  'Kill any process on a flagged host that matches a known malware family in EDR telemetry',
  'Watch SentinelOne for ransomware behavior detections and auto-contain the host within 60 seconds',
  'Pull the process tree from EDR for every malware detection and attach it to the incident',
  'Sweep all endpoints for a given hash or filename when a new IOC arrives and report matches',
  'Detect newly created local admin accounts on any endpoint and require approval before keeping them',
  'Alert when an EDR agent goes offline for more than 1 hour and open a ticket against the asset owner',
  'Quarantine any binary flagged as suspicious by EDR and email the user with next steps',
  'Hunt EDR telemetry every night for LOLBins executed from user-writable directories',
  'Correlate EDR alerts with SIEM auth events to detect credential theft followed by execution',
  'Run a weekly EDR coverage report and list endpoints without an active agent',
  'Auto-resolve EDR alerts that match a known-good signed binary on our allowlist',



  // — Vulnerability management ————————————————————————————————————
  'Scan our asset inventory daily and open tickets for any new critical or high vulnerability',
  'Remind asset owners every Friday about open vulnerabilities older than 14 days',
  'Re-scan hosts that recently patched a critical vulnerability and close the ticket if clean',
  'Send the patch compliance report every Monday morning to IT and security leadership',
  'Correlate vulnerabilities with active exploits in the wild and re-prioritise the queue',

  // — Endpoint & host monitoring ———————————————————————————————————
  'Watch my host monitors and alert me if any agent goes offline for more than 1 hour',
  'Isolate any endpoint that triggers a critical EDR alert and notify the user\'s manager',
  'Kill any process on a flagged host that matches a known malware family',
  'Run an inventory of installed software on every endpoint every Sunday',
  'Detect new local admin accounts created on any endpoint and require approval',
  'Make sure full-disk encryption is on for every laptop and report exceptions weekly',

  // — Identity & access —————————————————————————————————————————
  'Review user access every quarter and flag anyone with privileges they have not used in 90 days',
  'Disable accounts that have not logged in for 60 days and notify their manager',
  'Watch for impossible travel sign-ins and force a password reset plus MFA re-enrolment',
  'Alert me whenever someone is added to an admin group and require justification within 24 hours',
  'Audit MFA enrolment weekly and email any user without a second factor',
  'Rotate service account credentials every 90 days and update the vault',
  'Detect dormant API keys older than 180 days and revoke them after notice',
  'Make sure new joiners get baseline access provisioned within 1 hour of their start date',
  'Make sure leavers have all access revoked within 15 minutes of their termination event',

  // — Cloud, infra & posture ————————————————————————————————————
  'Check our cloud accounts every hour for public S3 buckets and lock them down',
  'Detect new IAM roles with wildcard permissions and require review before they go live',
  'Watch for unencrypted databases in production and open a ticket against the owner',
  'Run a CIS benchmark scan against all production cloud accounts every Sunday',
  'Alert on any new security group that opens ports to 0.0.0.0/0',
  'Monitor cloud spend daily and warn me if any service\'s cost jumps more than 50% week-over-week',
  'Check certificate expiry across our domains weekly and renew anything within 30 days',
  'Watch our DNS records for unauthorised changes and revert them',

  // — Phishing & user reports ———————————————————————————————————
  'Investigate phishing reports from the abuse mailbox and respond to the reporter within 1 hour',
  'Detonate suspicious attachments in a sandbox and attach the verdict to the incident',
  'Pull URLs from reported phishing emails and submit them to URLhaus and PhishTank',
  'Send a phishing simulation to a sample of users every month and report results',

  // — Compliance, audit & reporting —————————————————————————————
  'Generate the SOC2 evidence pack at the start of every month',
  'Track changes to security policies and alert the GRC team when one is edited',
  'Send a weekly KPI report covering MTTD, MTTR, and open incident backlog',
  'Audit log retention every Sunday and confirm we still meet the 1-year requirement',
  'Generate a monthly executive summary of incidents, vulnerabilities, and detection coverage',

  // — Backups, DR & uptime ————————————————————————————————————
  'Verify nightly backups completed successfully and alert me if any failed',
  'Test restore from backup on a sample workload every month and report results',
  'Watch our public status page for incidents at our critical vendors and notify the team',
  'Ping our public endpoints every minute and open an incident if any return non-2xx for 3 minutes',

  // — Tickets, workflow & docs ——————————————————————————————————
  'Triage new Jira tickets in the security project every hour and assign by category',
  'Close tickets that have been waiting on the reporter for more than 14 days',
  'Summarise this week\'s closed tickets into release notes every Friday',
  'Pull action items out of meeting notes I share and create tickets for them',
  'Keep the on-call runbook in sync with the latest incident postmortems',
  'Review pull requests in our security repos and leave a summary comment within an hour',

  // — People, HR & onboarding ————————————————————————————————————
  'Send a welcome message and security training link to every new joiner on their start date',
  'Run the offboarding checklist whenever someone is marked as a leaver in HR',
  'Remind managers to complete quarterly performance reviews 1 week before the deadline',
  'Send birthday and work anniversary greetings from me on the right day',

  // — Personal / lightweight ops chores —————————————————————————
  'Order more office coffee whenever the inventory drops below 2 bags',
  'File my receipts every Friday and submit the expense report',
  'Track my open invoices and chase clients whose payment is more than 14 days overdue',
  'Send a polite follow-up to anyone I have emailed but who has not replied in 5 working days',
  'Read the security news feeds every morning and summarise the top 5 stories for me',
];

/**
 * Return the top suggestions matching the user\'s current input.
 * Substring match (case-insensitive), ranked by:
 *   1. Prefix match wins over mid-string match.
 *   2. Earlier match position wins.
 *   3. Shorter suggestion wins (more specific).
 *
 * Returns an empty array when the input is empty/blank — we only show
 * suggestions while the user is actively typing.
 */
export const matchAgentPromptSuggestions = (
  input: string,
  limit = 8,
): string[] => {
  const q = (input || '').trim().toLowerCase();
  if (!q) return [];
  const scored: Array<{ text: string; score: number }> = [];
  for (const text of AGENT_PROMPT_SUGGESTIONS) {
    const lower = text.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx < 0) continue;
    // Lower score = better. Prefix matches get a big boost.
    const score = idx === 0 ? -1000 + text.length : idx * 10 + text.length;
    scored.push({ text, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((s) => s.text);
};

/** The default continuous-task placeholder for the AgentUI prompt. */
export const DEFAULT_AGENT_PROMPT_PLACEHOLDER = 'What do you want to do?';

/** Pick a random autocomplete suggestion (fallback ~50 chars, no width awareness). */
export const getRandomAgentPromptPlaceholder = (): string => {
  const suggestion = AGENT_PROMPT_SUGGESTIONS[Math.floor(Math.random() * AGENT_PROMPT_SUGGESTIONS.length)];
  const MAX_CHARS = 50;
  if (suggestion.length <= MAX_CHARS) return suggestion;
  return `${suggestion.slice(0, MAX_CHARS - 1).trimEnd()}…`;
};

/**
 * Pick a random suggestion that fully fits on one line of `availableWidthPx`
 * for the given CSS font. Tries suggestions in random order and returns the
 * first one whose measured width fits; falls back to a truncated one with
 * ellipsis when nothing fits. Runs in the browser only (uses <canvas>).
 */
export const getRandomAgentPromptPlaceholderForWidth = (
  availableWidthPx: number,
  font: string,
): string => {
  if (typeof document === 'undefined' || !availableWidthPx || availableWidthPx <= 0) {
    return getRandomAgentPromptPlaceholder();
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return getRandomAgentPromptPlaceholder();
  ctx.font = font;
  const measure = (t: string) => ctx.measureText(t).width;

  // Shuffle a copy so we do not always return the same short entries.
  const order = AGENT_PROMPT_SUGGESTIONS.map((s, i) => ({ s, i, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.s);

  for (const s of order) {
    if (measure(s) <= availableWidthPx) return s;
  }
  // Nothing fits — take a random one and truncate to fit with an ellipsis.
  const pick = order[0];
  let lo = 1;
  let hi = pick.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const candidate = `${pick.slice(0, mid).trimEnd()}…`;
    if (measure(candidate) <= availableWidthPx) lo = mid;
    else hi = mid - 1;
  }
  return `${pick.slice(0, lo).trimEnd()}…`;
};
