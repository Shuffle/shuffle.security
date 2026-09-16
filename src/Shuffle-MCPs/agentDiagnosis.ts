/**
 * Shared diagnosis utilities for an agent execution result.
 *
 * Lives in the Shuffle-MCPs lib so every surface that displays an agent run
 * (AgentUI Simple/Detailed view, AgentExecutionDrawer, the incident-side
 * AgentRunResultViewer, the activity feed status pill, ...) uses the EXACT
 * same logic to decide whether the run "needs review" and what to tell the
 * user about it.
 *
 * Pure logic — no React, no MUI, no project-side imports.
 */

/** Minimal run shape the diagnoser needs. Compatible with AgentRun and
 *  AgentUI's internal ExecutionData. */
export interface DiagnosableRun {
  status?: string;
  result?: string;
  results?: Array<{ result?: string } | any> | null;
}

// ---------------------------------------------------------------------------
// JSON parsing helpers
// ---------------------------------------------------------------------------

const deepParseJsonStrings = (obj: any, depth = 0): any => {
  if (depth > 5) return obj;
  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null) {
          return deepParseJsonStrings(parsed, depth + 1);
        }
        return parsed;
      } catch {
        return obj;
      }
    }
    return obj;
  }
  if (Array.isArray(obj)) return obj.map((item) => deepParseJsonStrings(item, depth + 1));
  if (obj && typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepParseJsonStrings(value, depth + 1);
    }
    return result;
  }
  return obj;
};

const pickResultPayload = (run: DiagnosableRun): string | null => {
  const results = Array.isArray(run.results) ? run.results : [];
  const agentResult = results.find((r: any) => {
    const appName = String(r?.action?.app_name || r?.action?.label || '').toLowerCase();
    const appId = String(r?.action?.app_id || '').toLowerCase();
    return appId === 'shuffle_agent' || appName.includes('ai agent');
  });
  const payload = agentResult?.result || results.find((r: any) => typeof r?.result === 'string' && r.result.trim())?.result || (run as any).result;
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object') {
    try { return JSON.stringify(payload); } catch { return null; }
  }
  return null;
};

/** Try to parse the agent result JSON, unwrapping AGENT-type executions. */
export const parseRunResult = (
  run: DiagnosableRun
): { raw: string | null; parsed: any | null } => {
  const firstResult = pickResultPayload(run);
  if (!firstResult) {
    const directPayload = run as any;
    if (
      directPayload &&
      typeof directPayload === 'object' &&
      (Array.isArray(directPayload.decisions) || directPayload.decision_string !== undefined)
    ) {
      const deepParsed = deepParseJsonStrings(directPayload);
      let raw: string | null = null;
      try {
        raw = JSON.stringify(deepParsed);
      } catch {
        raw = '[agent run data]';
      }
      return { raw, parsed: deepParsed };
    }
    return { raw: null, parsed: null };
  }

  try {
    let parsed = JSON.parse(firstResult);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.type === 'AGENT' &&
      Array.isArray(parsed.results) &&
      parsed.results.length > 0
    ) {
      const innerResult = parsed.results[0]?.result;
      if (innerResult) {
        try {
          parsed = JSON.parse(innerResult);
        } catch {
          return { raw: innerResult, parsed: null };
        }
      }
    }
    const deepParsed = deepParseJsonStrings(parsed);
    return { raw: firstResult, parsed: deepParsed };
  } catch {
    return { raw: firstResult, parsed: null };
  }
};

/** Parser failures that are surfaced as `decision_string` in the run result
 *  are now handled by the dedicated debug block below the final answer. They
 *  should not be reported as a generic top-level "Action failed" banner. */
const isDecisionStringParserFailure = (reason: string): boolean => {
  if (!reason) return false;
  const normalized = reason.toLowerCase();
  return (
    normalized.includes('produced decisions') &&
    normalized.includes('none could be executed')
  );
};

/** Extract failure info from a failed/aborted run. */
export const getFailureInfo = (run: DiagnosableRun): { reason: string } | null => {
  const status = run.status?.toUpperCase();
  if (status !== 'FAILED' && status !== 'ABORTED') return null;

  const { parsed } = parseRunResult(run);
  if (parsed && typeof parsed === 'object') {
    if (parsed.success === false && parsed.reason) {
      if (isDecisionStringParserFailure(parsed.reason)) return null;
      return { reason: parsed.reason };
    }
    if (parsed.message) {
      if (isDecisionStringParserFailure(parsed.message)) return null;
      return { reason: parsed.message };
    }
    if (parsed.error) {
      const errorText = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
      if (isDecisionStringParserFailure(errorText)) return null;
      return { reason: errorText };
    }
  }
  return null;
};

/**
 * Restrict the search to the agent's own decision records and final
 * `decision_string`. Walking the full result picks up keywords from the
 * system prompt and produces false-positive "Auth Failure" diagnoses.
 */
const getDiagnosableScope = (parsed: any): unknown => {
  if (!parsed || typeof parsed !== 'object') return null;
  const scope: Record<string, unknown> = {};
  if (Array.isArray(parsed.decisions)) {
    // Keep positional alignment with parsed.decisions[N] so an evidence
    // path like `run_details[N]...` maps directly back to the Nth
    // decision in the agent's timeline. Decisions without run_details
    // are kept as `null` placeholders (the walker skips nulls).
    const runDetails = parsed.decisions.map((d: any) =>
      d && typeof d === 'object' && d.run_details ? d.run_details : null
    );
    if (runDetails.some((rd: unknown) => rd !== null)) scope.run_details = runDetails;
  }
  if (parsed.decision_string !== undefined) scope.decision_string = parsed.decision_string;
  return Object.keys(scope).length > 0 ? scope : null;
};

/** Extract the originating decision index (in parsed.decisions / agentData.decisions)
 *  from a diagnosis evidence path like `run_details[3].result.error`.
 *  Returns null if the path does not start at a decision row. */
export const extractDecisionIndex = (path: string | undefined | null): number | null => {
  if (!path) return null;
  const m = /^(?:run_details|decisions)\[(\d+)\]/.exec(path);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

/** Detect whether a string contains AI/LLM credentials or authentication failure signals. */
export const isAiAuthText = (text: string | null | undefined): boolean => {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  const checkChunk = (chunk: string): boolean => {
    const lower = chunk.toLowerCase();

    const hasAuthSignal =
      /\b(401|unauthori[sz]ed|invalid[_\s-]*(api[_\s-]*key|credentials?|token|auth|key)|incorrect\s+api\s+key|missing[_\s-]*(api[_\s-]*key|authorization|credentials?)|authentication[_\s-]*(failed|required|error)|ai\s+credentials)\b/.test(
        lower
      ) || /check\s+your\s+ai\s+credentials/.test(lower);

    if (!hasAuthSignal) return false;

    const hasAiSignal =
      /\b(failed\s+to\s+start\s+ai\s+agent|failed\s+to\s+run\s+ai(\s+(agent|query))?|failed\s+to\s+run\s+ai|ai\s+agent\s+(failed|error|crash|aborted)|ai\s+query|ai\s+credentials|shuffler\.io\/agents|runactionai|llm\s+request|failed\s+to\s+run\s+llm|no\s+llm|openai|anthropic|mistral|groq|deepseek|together\.ai|together\.xyz|openrouter|gemini|generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com|ollama|lm\s*studio|platform\.openai\.com|api\.openai\.com|local\s*llm)\b/.test(
        lower
      ) ||
      /error\s+from\s+['"][^'"]*(openai|anthropic|mistral|groq|deepseek|together|openrouter|generativelanguage|aiplatform|gemini|ollama|lmstudio)/.test(
        lower
      ) ||
      /incorrect\s+api\s+key\s+provided/.test(lower);

    return Boolean(hasAiSignal);
  };

  // If text is multi-line, require the auth signal and AI provider signal to appear together
  // in the same line/statement rather than matching unrelated paragraphs in a document.
  if (trimmed.includes('\n')) {
    return trimmed.split(/\r?\n/).some((line) => checkChunk(line));
  }
  return checkChunk(trimmed);
};

/** Detect if the output content hints at an error/failure even if the run
 *  status is "finished". Only returns true when `diagnoseOutputWarning`
 *  would produce a concrete, actionable diagnosis — never on vague keyword
 *  matches alone. */
export const hasOutputWarning = (run: DiagnosableRun): boolean => {
  return diagnoseOutputWarning(run) !== null;
};

// ---------------------------------------------------------------------------
// Diagnosis
// ---------------------------------------------------------------------------

export type DiagnosisEvidence = {
  /** Dotted JSON path inside the parsed run result. */
  path: string;
  /** Trimmed snippet of the value at that path. */
  value: string;
};

export type OutputDiagnosis = {
  kind: 'auth' | 'ai_auth' | 'permission' | 'not_found' | 'rate_limit' | 'token_limit' | 'network' | 'validation' | 'generic';
  isAiAuth?: boolean;
  status?: number;
  title: string;
  explanation: string;
  remediation: string;
  snippet?: string;
  evidence: DiagnosisEvidence[];
};

/** Detect whether a diagnosis surfaces user actions / CTAs (e.g. token limits, AI credentials). */
export const diagnosisHasCtas = (
  diagnosis: OutputDiagnosis | null | undefined,
): boolean => diagnosis?.kind === 'token_limit' || diagnosis?.kind === 'ai_auth' || Boolean(diagnosis?.isAiAuth);

type ResultEntry = { path: string; value: string };

const collectEntries = (root: unknown): ResultEntry[] => {
  const out: ResultEntry[] = [];
  const walk = (v: unknown, path: string, depth: number): void => {
    if (depth > 8 || v == null) return;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out.push({ path, value: String(v) });
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${path}[${i}]`, depth + 1));
      return;
    }
    if (typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        const next = path ? `${path}.${k}` : k;
        walk(val, next, depth + 1);
      }
    }
  };
  walk(root, '', 0);
  return out;
};

const trimEvidenceValue = (v: string, max = 180): string => {
  const cleaned = v.replace(/\s+/g, ' ').trim();
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max).trim()}…`;
};

// Only natural-language phrasing counts. Deliberately NO underscore variants:
// JSON KEYS like `token_limit`, `limit_reached`, `context_length` or
// `max_context` appear in almost every healthy agent payload (often with a
// value of `false` or a plain number), and matching them produced a false
// "token limit reached" banner on runs that finished perfectly fine.
const TOKEN_LIMIT_PATTERN = /\b(ai[\s-]*token[\s-]*limit[\s-]*(is[\s-]*)?reach(ed)?|token[\s-]*limit[\s-]*(is[\s-]*)?reach(ed)?|context[\s-]*(window|length|limit)[\s-]*(is[\s-]*)?(reached|exceeded)|maximum[\s-]*context[\s-]*(window|length)?[\s-]*(is[\s-]*)?(reached|exceeded)|too[\s-]*many[\s-]*tokens|exceeds?[\s-]*(the[\s-]*)?(maximum[\s-]*)?(token|context))\b/;

/** Values that are just booleans/numbers can never be an error sentence. */
const isSentenceLike = (v: string) => /[a-z]/i.test(v) && v.trim().split(/\s+/).length > 1;

export const diagnoseOutputWarning = (run: DiagnosableRun): OutputDiagnosis | null => {
  const { parsed, raw } = parseRunResult(run);

  // Token-limit detection runs FIRST and against the FULL payload (raw +
  // parsed), not the narrow decision-only scope — the message can appear in
  // any field. But it is matched against string VALUES only, never against
  // JSON key names, so structural fields do not trigger a false positive.
  const tokenLimitMatch = (() => {
    const candidates: string[] = [];
    if (parsed && typeof parsed === 'object') {
      for (const e of collectEntries(parsed)) {
        if (isSentenceLike(e.value)) candidates.push(e.value);
      }
    } else if (raw) {
      candidates.push(raw);
    }
    return candidates.find((v) => TOKEN_LIMIT_PATTERN.test(v.toLowerCase())) || null;
  })();
  if (tokenLimitMatch) {
    const evidenceValue = trimEvidenceValue(tokenLimitMatch);

    return {
      kind: 'token_limit',
      title: 'AI context window exceeded',
      explanation:
        'This is a per-request limit from the model, not your monthly Agent tokens quota. A single request (prompt, connected context, and generated output) was larger than the context window the model accepts, so the run stopped.',
      remediation:
        'Reduce the input size or connected context and re-run, or connect an API vendor/self-hosted model with a larger context window.',

      snippet: evidenceValue,
      evidence: [{ path: '(root)', value: evidenceValue }],
    };
  }

  // AI Authentication failure detection.
  // Model credential failures prevent the agent from producing decisions or finishing.
  // If the run has finished and completed a finish/finalise step, it is NOT an AI auth failure.
  const isFinished = (run.status || '').toUpperCase() === 'FINISHED';
  const hasSuccessfulFinish = (() => {
    if (!parsed || typeof parsed !== 'object') return false;
    if (parsed.error && String(parsed.error).trim().length > 0) return false;
    if (parsed.success === false) return false;

    if (Array.isArray(parsed.decisions) && parsed.decisions.length > 0) {
      const last = parsed.decisions[parsed.decisions.length - 1];
      if (last && typeof last === 'object') {
        const action = String(last.action || last.details?.action || '').toLowerCase();
        const category = String(last.category || '').toLowerCase();
        if (['finish', 'finalise'].includes(action) || ['finish', 'finalise'].includes(category)) {
          if (last.success === false || last.status === 'FAILED') return false;
          if (isAiAuthText(last.reason)) return false;
          const reasonStr = String(last.reason || '').toLowerCase();
          if (reasonStr.startsWith('failed to') || reasonStr.includes('error,')) return false;
          return true;
        }
      }
    }
    return false;
  })();

  const aiAuthMatch = (() => {
    // If the run reached finished status without an explicit fatal error,
    // the AI model provider credentials were valid and succeeded.
    if (isFinished && (!parsed?.error && parsed?.success !== false)) return null;
    if (isFinished && hasSuccessfulFinish) return null;

    const candidates: string[] = [];
    if (parsed && typeof parsed === 'object') {
      // Check explicit error/failure fields rather than walking the whole payload
      // (which contains system prompts, injected incident datastore context, and output reports).
      if (typeof parsed.error === 'string') candidates.push(parsed.error);
      if (!isFinished && typeof parsed.reason === 'string') candidates.push(parsed.reason);
      if (!isFinished && typeof parsed.message === 'string') candidates.push(parsed.message);

      if (Array.isArray(parsed.decisions) && !isFinished) {
        for (const d of parsed.decisions) {
          if (typeof d?.run_details?.error === 'string') candidates.push(d.run_details.error);
          if (d?.status === 'FAILED' && typeof d?.reason === 'string') candidates.push(d.reason);
        }
      }
    }
    // If raw error output is available on a failed run
    if (raw && !isFinished) {
      candidates.push(raw);
    }
    return candidates.find((v) => isAiAuthText(v)) || null;
  })();
  if (aiAuthMatch) {
    const evidenceValue = trimEvidenceValue(aiAuthMatch);

    return {
      kind: 'ai_auth',
      isAiAuth: true,
      status: 401,
      title: 'AI authentication failed (HTTP 401)',
      explanation:
        'The AI model provider rejected the request due to invalid, unauthorized, or expired credentials.',
      remediation:
        'Open Local LLM settings to update your API key or model configuration, then re-run the agent.',
      snippet: evidenceValue,
      evidence: [{ path: '(root)', value: evidenceValue }],
    };
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const scope = getDiagnosableScope(parsed);
  if (!scope) return null;

  const entries = collectEntries(scope);
  if (raw && entries.length === 0) entries.push({ path: '', value: raw });

  const haystack = entries.map((e) => e.value).join('\n');
  const lower = haystack.toLowerCase();

  // Error-like field paths: error, reason, message, msg, detail, failure,
  // fault, exception, warning, status_text, status_message, status_reason.
  // Match exact path segments only. In particular, `run_details` is just the
  // execution container and must NOT make every nested response body an error
  // field; WHOIS/legal text can contain phrases like "not authorized" while
  // the actual integration response is successful.
  const ERROR_FIELD_NAMES = new Set([
    'error', 'errors', 'err', 'reason', 'message', 'messages', 'msg', 'detail', 'details',
    'failure', 'fault', 'exception', 'exceptions', 'warning', 'warnings',
    'status_text', 'status_message', 'status_reason', 'errormessage', 'error_description',
  ]);
  const getPathSegments = (path: string): string[] =>
    path.split(/[.\[\]]+/).filter(Boolean).map((segment) => segment.toLowerCase());
  const isErrorPath = (path: string): boolean =>
    getPathSegments(path).some((segment) => ERROR_FIELD_NAMES.has(segment));
  const errorEntries = entries.filter((e) => isErrorPath(e.path));
  const errorHaystackLower = errorEntries.map((e) => e.value).join('\n').toLowerCase();

  const findEvidence = (
    test: (lowerVal: string, val: string) => boolean,
    max = 3
  ): DiagnosisEvidence[] => {
    const out: DiagnosisEvidence[] = [];
    for (const e of entries) {
      if (test(e.value.toLowerCase(), e.value)) {
        out.push({ path: e.path || '(root)', value: trimEvidenceValue(e.value) });
        if (out.length >= max) break;
      }
    }
    return out;
  };
  const findEvidenceByRegex = (re: RegExp, max = 3): DiagnosisEvidence[] =>
    findEvidence((l) => re.test(l), max);
  const findEvidenceByKeywords = (needles: string[], max = 3): DiagnosisEvidence[] =>
    findEvidence((l) => needles.some((n) => l.includes(n.toLowerCase())), max);

  let status: number | undefined;
  let statusEvidence: DiagnosisEvidence | null = null;
  // Only match status codes that are explicitly labelled as HTTP / status /
  // status_code / response_code. Bare 3-digit numbers inside body text
  // (CVE-2024-515, port 503, ticket #404, "515" appearing in an error message
  // string) are NOT reliable signals and produced false-positive "Upstream
  // error" banners.
  const statusPatterns = [
    /\bhttp[\s/]?(\d{3})\b/i,
    /\b(?:response[_\s-]?status|status[_\s-]?code|response[_\s-]?code)["'\s:=]+(\d{3})\b/i,
    /\bstatus["'\s:=]+(\d{3})\b/i,
  ];
  const isStatusPath = (path: string): boolean => {
    const segments = getPathSegments(path);
    const last = segments[segments.length - 1];
    return ['status', 'status_code', 'response_status', 'response_code', 'http_status'].includes(last || '');
  };
  const statusFromEntry = (entry: ResultEntry): number | null => {
    if (isStatusPath(entry.path) && /^\d{3}$/.test(entry.value.trim())) {
      return Number(entry.value.trim());
    }
    for (const re of statusPatterns) {
      const m = entry.value.match(re);
      if (m) return Number(m[1]);
    }
    return null;
  };

  // If the result clearly contains a successful HTTP status (2xx) labelled
  // the same way, treat the upstream call as successful and do NOT extract a
  // failure status from incidental digits elsewhere in the payload.
  const hasSuccessStatus = entries.some((e) => {
    const n = statusFromEntry(e);
    return typeof n === 'number' && n >= 200 && n < 300;
  });

  if (!hasSuccessStatus) {
    for (const e of entries) {
      const n = statusFromEntry(e);
      if (typeof n === 'number' && n >= 400 && n < 600) {
        status = n;
        statusEvidence = { path: e.path || '(root)', value: trimEvidenceValue(e.value) };
        break;
      }
    }
  }

  const findSnippet = (needles: string[]): string | undefined => {
    for (const needle of needles) {
      const i = lower.indexOf(needle);
      if (i >= 0) {
        const start = Math.max(0, i - 40);
        const end = Math.min(haystack.length, i + 160);
        return (
          (start > 0 ? '…' : '') +
          haystack.slice(start, end).trim() +
          (end < haystack.length ? '…' : '')
        );
      }
    }
    return undefined;
  };

  const withStatusEvidence = (ev: DiagnosisEvidence[]): DiagnosisEvidence[] => {
    if (!statusEvidence) return ev;
    const dedup = ev.filter((e) => e.path !== statusEvidence!.path);
    return [statusEvidence, ...dedup].slice(0, 3);
  };

  if (!isFinished && (isAiAuthText(errorHaystackLower) || isAiAuthText(raw))) {
    const ev = findEvidenceByRegex(
      /unauthori[sz]ed|invalid[_\s-]*(api[_\s-]*key|token|credentials?)|authentication[_\s-]*(failed|required)|missing[_\s-]*(api[_\s-]*key|token|authorization)|bearer[_\s-]*token|expired[_\s-]*token|failed\s+to\s+start\s+ai\s+agent|incorrect\s+api\s+key\s+provided|\b401\b/
    );
    return {
      kind: 'ai_auth',
      isAiAuth: true,
      status: status || 401,
      title: status === 401 ? 'AI authentication failed (HTTP 401)' : 'AI authentication failed',
      explanation:
        'The AI model provider rejected the request due to invalid, unauthorized, or expired credentials.',
      remediation:
        'Open Local LLM settings to update your API key or model configuration, then re-run the agent.',
      snippet: findSnippet([
        '401',
        'unauthorized',
        'invalid api',
        'invalid token',
        'authentication',
        'api.openai.com',
        'incorrect api key',
        'failed to start',
      ]),
      evidence: withStatusEvidence(ev),
    };
  }

  if (
    status === 401 ||
    /\b(unauthori[sz]ed|invalid[_\s-]*(api[_\s-]*key|token|credentials?)|authentication[_\s-]*(failed|required)|missing[_\s-]*(api[_\s-]*key|token|authorization)|bearer[_\s-]*token|expired[_\s-]*token)\b/.test(errorHaystackLower)
  ) {
    const ev = findEvidenceByRegex(
      /unauthori[sz]ed|invalid[_\s-]*(api[_\s-]*key|token|credentials?)|authentication[_\s-]*(failed|required)|missing[_\s-]*(api[_\s-]*key|token|authorization)|bearer[_\s-]*token|expired[_\s-]*token|\b401\b/
    );
    return {
      kind: 'auth',
      status,
      title: status === 401 ? 'Authentication failed (HTTP 401)' : 'Authentication failed',
      explanation:
        'The upstream service rejected the request because the credentials were missing, invalid, or expired.',
      remediation:
        'Open the integration in Apps → Authentication, reconnect or paste a fresh API key/token, then re-run the action.',
      snippet: findSnippet(['401', 'unauthorized', 'invalid api', 'invalid token', 'authentication']),
      evidence: withStatusEvidence(ev),
    };
  }

  if (
    status === 403 ||
    /\b(forbidden|permission[_\s-]*denied|not[_\s-]*allowed|access[_\s-]*denied|insufficient[_\s-]*(scope|permission|privileges?)|missing[_\s-]*scope)\b/.test(errorHaystackLower)
  ) {
    const ev = findEvidenceByRegex(
      /forbidden|permission[_\s-]*denied|not[_\s-]*allowed|access[_\s-]*denied|insufficient[_\s-]*(scope|permission|privileges?)|missing[_\s-]*scope|\b403\b/
    );
    return {
      kind: 'permission',
      status,
      title: status === 403 ? 'Permission denied (HTTP 403)' : 'Permission denied',
      explanation:
        'The credentials are valid, but the connected account does not have permission (or scope) to perform this action.',
      remediation:
        'Re-authenticate the integration with the missing scope, or grant the connected account permission for this resource in the source app.',
      snippet: findSnippet(['403', 'forbidden', 'permission', 'scope', 'access denied']),
      evidence: withStatusEvidence(ev),
    };
  }

  if (
    status === 429 ||
    /\b(rate[_\s-]*limit|too[_\s-]*many[_\s-]*requests|quota[_\s-]*exceeded|throttled)\b/.test(errorHaystackLower)
  ) {
    const ev = findEvidenceByRegex(
      /rate[_\s-]*limit|too[_\s-]*many[_\s-]*requests|quota[_\s-]*exceeded|throttled|\b429\b/
    );
    return {
      kind: 'rate_limit',
      status,
      title: status === 429 ? 'Rate limited (HTTP 429)' : 'Rate limited',
      explanation: 'The upstream service is throttling requests from this integration.',
      remediation:
        "Wait a minute and re-run, or reduce how often this action fires. Check the integration's rate-limit settings if the problem keeps happening.",
      snippet: findSnippet(['429', 'rate limit', 'too many', 'quota', 'throttled']),
      evidence: withStatusEvidence(ev),
    };
  }

  // Token-limit is detected at the top of this function (full-payload scan).

  if (
    status === 404 ||
    /\b(not[_\s-]*found|no such|does not exist|unknown[_\s-]*(id|resource))\b/.test(errorHaystackLower)
  ) {
    const ev = findEvidenceByRegex(
      /not[_\s-]*found|no such|does not exist|unknown[_\s-]*(id|resource)|\b404\b/
    );
    return {
      kind: 'not_found',
      status,
      title: status === 404 ? 'Resource not found (HTTP 404)' : 'Resource not found',
      explanation:
        'The action ran, but the target resource (record, ticket, channel, file) could not be located.',
      remediation:
        'Verify the ID or path the agent used is correct, and that the connected account can see that resource.',
      snippet: findSnippet(['404', 'not found', 'no such', 'does not exist']),
      evidence: withStatusEvidence(ev),
    };
  }

  if (
    status === 400 ||
    status === 422 ||
    /\b(bad[_\s-]*request|validation[_\s-]*(error|failed)|invalid[_\s-]*(parameter|field|argument|body|payload))\b/.test(errorHaystackLower)
  ) {
    const ev = findEvidenceByRegex(
      /bad[_\s-]*request|validation[_\s-]*(error|failed)|invalid[_\s-]*(parameter|field|argument|body|payload)|\b400\b|\b422\b/
    );
    return {
      kind: 'validation',
      status,
      title: status ? `Invalid request (HTTP ${status})` : 'Invalid request',
      explanation:
        'The upstream service rejected the request because the parameters were missing or malformed.',
      remediation:
        "Check the action's required fields and the values the agent sent. The Debug section below shows the exact payload.",
      snippet: findSnippet(['400', '422', 'bad request', 'validation', 'invalid']),
      evidence: withStatusEvidence(ev),
    };
  }

  if (
    (typeof status === 'number' && status >= 500) ||
    /\b(timeout|timed[_\s-]*out|econnrefused|enotfound|network[_\s-]*error|connection[_\s-]*(refused|reset|closed)|service[_\s-]*unavailable|bad[_\s-]*gateway|gateway[_\s-]*timeout)\b/.test(errorHaystackLower)
  ) {
    const ev = findEvidenceByRegex(
      /timeout|timed[_\s-]*out|econnrefused|enotfound|network[_\s-]*error|connection[_\s-]*(refused|reset|closed)|service[_\s-]*unavailable|bad[_\s-]*gateway|gateway[_\s-]*timeout|\b5\d{2}\b/
    );
    return {
      kind: 'network',
      status,
      title: status ? `Upstream error (HTTP ${status})` : 'Network or upstream error',
      explanation:
        'The integration could not reach the upstream service, or the service returned a server error.',
      remediation:
        "Re-run the action shortly. If it keeps failing, check the upstream service's status page and the integration's base URL.",
      snippet: findSnippet(['500', '502', '503', '504', 'timeout', 'timed out', 'unavailable']),
      evidence: withStatusEvidence(ev),
    };
  }

  const namedFields: Array<keyof typeof parsed & string> = ['reason', 'error', 'message'];
  let namedReason: string | undefined;
  let namedEvidence: DiagnosisEvidence | null = null;
  for (const k of namedFields) {
    const v = (parsed as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.trim()) {
      namedReason = v;
      namedEvidence = { path: k, value: trimEvidenceValue(v) };
      break;
    }
  }

  if ((parsed as { success?: unknown }).success === false || namedReason) {
    // Decision-parser failures are handled by the dedicated decision_string
    // debug block below the final answer, not by this banner.
    if (namedReason && isDecisionStringParserFailure(namedReason)) return null;
    const ev: DiagnosisEvidence[] = [];
    if (namedEvidence) ev.push(namedEvidence);
    if ((parsed as { success?: unknown }).success === false) {
      ev.push({ path: 'success', value: 'false' });
    }
    return {
      kind: 'generic',
      status,
      title: status ? `Action failed (HTTP ${status})` : 'Action failed',
      explanation:
        namedReason || 'The action returned a failure but did not include a recognizable error code.',
      remediation: 'Open the Debug section below to see the full response from the integration.',
      snippet: namedReason,
      evidence: withStatusEvidence(ev).slice(0, 3),
    };
  }

  // No specific signal found — do NOT surface a generic "may need review"
  // banner. It is too vague to be actionable and just adds noise.
  return null;
};

/**
 * Detect whether an agent execution or output failed due to AI/LLM credentials.
 * Inspects parsed diagnosis, failure info, decisions, raw output payloads, or extra text.
 */
export const isAiAuthFailure = (
  run?: DiagnosableRun | null,
  extraText?: string | null,
): boolean => {
  if (isAiAuthText(extraText)) return true;
  if (!run) return false;

  const status = (run.status || '').toUpperCase();
  const isFinished = status === 'FINISHED' || status === 'SUCCESS';

  // If the run reached terminal finished status, model provider credentials were
  // valid and succeeded. Model auth failures abort/fail the run before completion.
  if (isFinished) {
    const anyRun = run as any;
    if (typeof anyRun.error === 'string' && isAiAuthText(anyRun.error)) return true;
    return false;
  }

  // 1. Direct diagnosis (which checks token limits, auth failures, etc.)
  const diagnosis = diagnoseOutputWarning(run);
  if (diagnosis?.kind === 'ai_auth' || diagnosis?.isAiAuth) return true;

  // 2. Failure info for FAILED/ABORTED runs
  const fail = getFailureInfo(run);
  if (fail && isAiAuthText(fail.reason)) return true;

  // 3. Top-level error
  const anyRun = run as any;
  if (typeof anyRun.error === 'string' && isAiAuthText(anyRun.error)) return true;

  // 4. Results array (only error fields)
  if (Array.isArray(run.results)) {
    for (const r of run.results) {
      if (typeof r?.error === 'string' && isAiAuthText(r.error)) return true;
    }
  }

  // 5. Decisions list (only error fields on failed decisions)
  const decisions = anyRun?.decisions;
  if (Array.isArray(decisions)) {
    for (const d of decisions) {
      if (typeof d?.run_details?.error === 'string' && isAiAuthText(d.run_details.error)) return true;
      if (d?.status === 'FAILED' && typeof d?.reason === 'string' && isAiAuthText(d.reason)) return true;
    }
  }

  return false;
};

