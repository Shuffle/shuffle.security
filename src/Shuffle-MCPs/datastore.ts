/**
 * Shuffle Datastore Service
 * 
 * Provides reusable functions for interacting with the Shuffle datastore API.
 * Uses the correct Shuffle cache API endpoints.
 */

import { acquireDatastoreSlot } from './requestScheduler';
import { API_CONFIG, getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { isCircuitBreakerResponse } from '@/Shuffle-Core/fetchBreaker';

export interface DatastoreItem {
  key: string;
  value: string;
  category: string;
  created?: number;
  edited?: number;
  public_authorization?: string;
  // Backend may serialize the public token under alternative casings depending
  // on which Go handler responds — keep both fallbacks so callers can read
  // whichever variant arrives without lying to the user that the token is
  // missing.
  publicAuthorization?: string;
  PublicAuthorization?: string;
  enrichments?: Array<{ type: string; value?: string; data?: string }>;
  rbac?: RBACConfig;
}

export interface PermissionRule {
  roles?: string[];
  users?: string[];
  groups?: string[];
  scopes?: string[];
}

export interface RBACConfig {
  inherit?: boolean;
  public?: boolean;
  read?: PermissionRule;
  write?: PermissionRule;
  execute?: PermissionRule;
  admin?: PermissionRule;
}

export interface CategoryAutomation {
  id?: string;
  name: string;
  type?: 'workflow' | 'webhook' | 'ai_agent' | 'enrich' | 'send_message' | 'security_rules';
  trigger?: 'on_create' | 'on_edit' | 'on_delete';
  workflow_id?: string;
  webhook_url?: string;
  enabled: boolean;
  description?: string;
  options?: { key: string; value: string }[];
}

export interface CategoryConfig {
  id: string;
  org_id: string;
  category: string;
  automations: CategoryAutomation[] | null;
  settings: {
    timeout: number;
    public: boolean;
    rbac?: RBACConfig;
  };
}

export interface DatastoreKeyExisted {
  key: string;
  existed: boolean;
  changed: boolean;
}

export interface DatastoreResponse {
  success: boolean;
  data?: DatastoreItem[];
  categoryConfig?: CategoryConfig;
  cursor?: string;
  totalAmount?: number;
  error?: string;
  diagnostics?: DatastoreDiagnostics;
  /** Per-key write result reported by the backend (v2 datastore writes). */
  keysExisted?: DatastoreKeyExisted[];
  /** True when the backend reports the stored value actually changed. */
  changed?: boolean;
}


export interface DatastoreDiagnostics {
  operation: string;
  category?: string;
  orgId?: string | null;
  url?: string;
  cursor?: string;
  status?: number;
  statusText?: string;
  contentType?: string | null;
  responseShape?: 'array' | 'keys' | 'data' | 'object' | 'unknown';
  itemCount?: number;
  totalAmount?: number | null;
  bodyPreview?: string;
  errorStage?: 'request' | 'response' | 'parse' | 'unknown';
  timestamp: string;
}

/**
 * Runtime-injected active org ID. AuthContext sets this synchronously when
 * /api/v1/getinfo resolves, so callers don't need to wait for the
 * `shuffle_user_info` localStorage write to land. Falls back to localStorage
 * for cases where the service is imported before AuthContext mounts.
 */
let _runtimeOrgId: string | null = null;

export const setRuntimeOrgId = (orgId: string | null) => {
  _runtimeOrgId = orgId || null;
};

/**
 * Get current org ID. Prefers the runtime value set by AuthContext, then
 * falls back to localStorage so legacy callers keep working.
 */
const getOrgId = (): string | null => {
  if (_runtimeOrgId) return _runtimeOrgId;
  try {
    const userInfo =
      localStorage.getItem('shuffle_user_info') ||
      localStorage.getItem('userinfo') ||
      localStorage.getItem('user_info');
    if (userInfo) {
      const parsed = JSON.parse(userInfo);
      return (
        parsed.active_org?.id ||
        parsed.org_id ||
        parsed.active_org_id ||
        (parsed.orgs && parsed.orgs[0]?.id) ||
        null
      );
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
};

/**
 * Resolve the org id, waiting briefly for it to appear.
 *
 * Right after login the app renders (and pages start fetching) before
 * /api/v1/getinfo has resolved, so the runtime org id and the
 * `shuffle_user_info` localStorage entry are both still empty. Failing
 * immediately with "No organization ID found" surfaced that race to the user.
 * Poll for a short window instead — normal boots resolve in well under a
 * second.
 */
const ORG_ID_WAIT_MS = 8000;
const ORG_ID_POLL_MS = 100;

const waitForOrgId = async (): Promise<string | null> => {
  const immediate = getOrgId();
  if (immediate) return immediate;
  if (typeof window === 'undefined') return null;

  const deadline = Date.now() + ORG_ID_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, ORG_ID_POLL_MS));
    const orgId = getOrgId();
    if (orgId) return orgId;
  }
  return null;
};


const normalizeDatastoreKey = (key: string): string => {
  if (!key?.includes('::')) return key;
  const parts = key.split('::').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : key;
};

const truncateResponsePreview = (value: string | null | undefined, maxLength = 280): string | undefined => {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientDatastoreStatus = (status: number): boolean => {
  return status === 408 || status === 425 || status === 429 || status >= 500;
};

const isSameDatastoreKey = (a: string | undefined, b: string): boolean => {
  if (!a) return false;
  return normalizeDatastoreKey(a) === normalizeDatastoreKey(b);
};

/**
 * Serialize a datastore value to a string for the API.
 * Validates JSON-shaped strings (parse+restringify) so we always send valid JSON.
 */
const serializeDatastoreValue = (value: unknown): string => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(JSON.parse(trimmed));
      } catch {
        return value;
      }
    }
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

// Datastore payload size ceiling. The backend rejects large values with a
// generic 500 whose body mentions "Value" / size. Keep some headroom below the
// hard limit so we can retry with a slimmed payload before the backend errors.
const DATASTORE_VALUE_SOFT_LIMIT_BYTES = 900_000; // ~900 KB
const DATASTORE_VALUE_HARD_LIMIT_BYTES = 1_400_000; // ~1.4 MB — abort past this

const byteLength = (s: string): number => {
  try { return new Blob([s]).size; } catch { return s.length; }
};

const looksLikeValueTooBig = (status: number, body: string): boolean => {
  if (status < 500) return false;
  const b = (body || '').toLowerCase();
  return b.includes('value') && (b.includes('too big') || b.includes('too large') || b.includes('size') || b.includes('limit'));
};

/**
 * Trim heavy fields from an incident payload so it fits under the datastore
 * value ceiling. Removes cross-loaded activity, embedded base64 attachments,
 * raw MIME dumps, and huge HTML bodies — anything the UI can recompute or
 * re-fetch on demand. Returns the modified value (as a JSON string) and a
 * short list of what was dropped for logging.
 */
const slimIncidentValueForWrite = (
  raw: string,
): { value: string; dropped: string[] } | null => {
  let obj: any;
  try { obj = JSON.parse(raw); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  const dropped: string[] = [];

  const stripBase64Attachments = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.attachments)) {
      for (const a of node.attachments) {
        if (a && typeof a === 'object' && typeof a.data === 'string' && a.data.length > 4000) {
          a.data = '';
          a._truncated = true;
        }
      }
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === 'object') stripBase64Attachments(v);
    }
  };

  // 1. Drop base64 attachment bodies anywhere in the payload.
  stripBase64Attachments(obj);
  dropped.push('attachments.data');

  // 2. Cap oversized HTML/body strings inside email messages.
  const capString = (s: string, cap = 200_000) =>
    typeof s === 'string' && s.length > cap ? s.slice(0, cap) + '…[truncated]' : s;
  if (obj.email && typeof obj.email === 'object') {
    if (typeof obj.email.body_html === 'string') obj.email.body_html = capString(obj.email.body_html);
    if (typeof obj.email.body === 'string') obj.email.body = capString(obj.email.body);
    if (Array.isArray(obj.email.messages)) {
      for (const m of obj.email.messages) {
        if (m && typeof m === 'object') {
          if (typeof m.body_html === 'string') m.body_html = capString(m.body_html);
          if (typeof m.body === 'string') m.body = capString(m.body);
        }
      }
    }
    dropped.push('email.body_html');
  }

  // 3. Drop the raw OCSF unmapped original — it's recoverable from the source.
  if (obj.rawOCSF?.unmapped_original) {
    obj.rawOCSF = { ...obj.rawOCSF };
    delete obj.rawOCSF.unmapped_original;
    dropped.push('rawOCSF.unmapped_original');
  }

  // 4. Trim activity/timeline history to the most recent entries.
  if (Array.isArray(obj.activity) && obj.activity.length > 200) {
    obj.activity = obj.activity.slice(-200);
    dropped.push('activity[older]');
  }
  if (Array.isArray(obj.timeline) && obj.timeline.length > 200) {
    obj.timeline = obj.timeline.slice(-200);
    dropped.push('timeline[older]');
  }

  return { value: JSON.stringify(obj), dropped };
};

/**
 * Parse the v2 datastore write response body.
 * Backend format: {"success":bool,"keys_existed":[{"key":..,"existed":bool,"changed":bool}]}
 * A single-key write that did not change anything returns HTTP 400 + success:false,
 * which is a no-op rather than a real failure.
 */
const parseWriteResponseBody = (
  bodyText: string,
): { success?: boolean; keysExisted?: DatastoreKeyExisted[] } => {
  if (!bodyText) return {};
  try {
    const parsed = JSON.parse(bodyText);
    if (!parsed || typeof parsed !== 'object') return {};
    const rawKeys = Array.isArray(parsed.keys_existed) ? parsed.keys_existed : undefined;
    return {
      success: typeof parsed.success === 'boolean' ? parsed.success : undefined,
      keysExisted: rawKeys?.map((k: any) => ({
        key: String(k?.key ?? ''),
        existed: !!k?.existed,
        changed: !!k?.changed,
      })),
    };
  } catch {
    return {};
  }
};

/** True when the backend explicitly told us nothing changed (value identical). */
const isUnchangedWrite = (keysExisted?: DatastoreKeyExisted[]) =>
  !!keysExisted && keysExisted.length > 0 && keysExisted.every(k => k.existed && !k.changed);


/**
 * Build a datastore endpoint URL. When `regionUrl` is provided (an absolute
 * region base such as https://ca.shuffle.security) the request is addressed
 * directly to that region instead of the region the session is logged into.
 * Cross-region tenants are only reachable this way — an Org-Id header alone
 * does not cross regions.
 */
const datastoreUrl = (path: string, regionUrl?: string): string =>
  regionUrl ? `${regionUrl.replace(/\/+$/, '')}${path}` : getApiUrl(path);

/**
 * Set a single item in the datastore
 */
export const setDatastoreItem = async (
  key: string,
  value: string | object,
  category: string,
  overrideOrgId?: string,
  options?: { regionUrl?: string }
): Promise<DatastoreResponse> => {
  const orgId = overrideOrgId || (await waitForOrgId());
  if (!orgId) {
    return { success: false, error: 'No organization ID found' };
  }

  const rawKey = normalizeDatastoreKey(key);
  let serialized = serializeDatastoreValue(value);

  // Pre-flight size guard: if the value is already over the soft limit and
  // this is an incident write, slim it before hitting the backend at all.
  if (
    category === 'shuffle-security_incidents' &&
    byteLength(serialized) > DATASTORE_VALUE_SOFT_LIMIT_BYTES
  ) {
    const slim = slimIncidentValueForWrite(serialized);
    if (slim) {
      console.warn(
        `[datastore.set] pre-slim incident ${rawKey} bytes=${byteLength(serialized)} -> ${byteLength(slim.value)} dropped=${slim.dropped.join(',')}`,
      );
      serialized = slim.value;
    }
  }

  if (byteLength(serialized) > DATASTORE_VALUE_HARD_LIMIT_BYTES) {
    return {
      success: false,
      error: `Datastore value too large (${byteLength(serialized)} bytes) after slimming; write aborted for ${rawKey}`,
    };
  }

  const buildPayload = (v: string) => ([{
    key: rawKey,
    value: v,
    category,
    org_id: orgId,
    ...(category === 'shuffle-security_incidents' ? { ignore_security_rules: true } : {}),
  }]);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeader(orgId),
  };

  console.log(`[datastore.set] key=${rawKey} category=${category} orgId=${orgId} bytes=${byteLength(serialized)}${overrideOrgId ? ' (override)' : ''}`);

  const send = (v: string) => fetch(datastoreUrl('/api/v2/datastore', options?.regionUrl), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(buildPayload(v)),
  });

  let response = await send(serialized);
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    const parsed = parseWriteResponseBody(bodyText);

    // Single-key write where the backend says the key exists but nothing
    // changed: it responds 400 + success:false. The stored value already
    // matches what we sent, so treat it as a successful no-op.
    if (isUnchangedWrite(parsed.keysExisted)) {
      console.log(`[datastore.set] key=${rawKey} unchanged (value identical) — treated as no-op`);
      return { success: true, changed: false, keysExisted: parsed.keysExisted };
    }

    // Backend rejected because the value is too big — try one slimming pass
    // and retry. Only meaningful for incidents (structured object with the
    // heavy optional fields we know how to drop).
    if (
      category === 'shuffle-security_incidents' &&
      looksLikeValueTooBig(response.status, bodyText)
    ) {
      const slim = slimIncidentValueForWrite(serialized);
      if (slim && slim.value.length < serialized.length) {
        console.warn(
          `[datastore.set] backend rejected large value for ${rawKey}; retrying slimmed bytes=${byteLength(slim.value)} dropped=${slim.dropped.join(',')}`,
        );
        response = await send(slim.value);
        if (response.ok) {
          const retryOk = parseWriteResponseBody(await response.text().catch(() => ''));
          return {
            success: true,
            keysExisted: retryOk.keysExisted,
            changed: retryOk.keysExisted ? retryOk.keysExisted.some(k => k.changed) : undefined,
          };
        }
        const retryBody = await response.text().catch(() => '');
        const retryParsed = parseWriteResponseBody(retryBody);
        if (isUnchangedWrite(retryParsed.keysExisted)) {
          return { success: true, changed: false, keysExisted: retryParsed.keysExisted };
        }
        return {
          success: false,
          error: `Datastore value too large for ${rawKey} even after slimming: ${response.status} ${truncateResponsePreview(retryBody) || response.statusText}`,
          keysExisted: retryParsed.keysExisted,
        };
      }
      return {
        success: false,
        error: `Datastore value too large for ${rawKey}: ${response.status} ${truncateResponsePreview(bodyText) || response.statusText}`,
        keysExisted: parsed.keysExisted,
      };
    }
    return {
      success: false,
      error: `Failed to set datastore item: ${response.status} ${truncateResponsePreview(bodyText) || response.statusText}`,
      keysExisted: parsed.keysExisted,
    };
  }

  const okParsed = parseWriteResponseBody(await response.text().catch(() => ''));
  if (okParsed.success === false && !isUnchangedWrite(okParsed.keysExisted)) {
    return {
      success: false,
      error: `Failed to set datastore item ${rawKey}: backend reported success=false`,
      keysExisted: okParsed.keysExisted,
    };
  }
  return {
    success: true,
    keysExisted: okParsed.keysExisted,
    changed: okParsed.keysExisted ? okParsed.keysExisted.some(k => k.changed) : undefined,
  };
};




/**
 * Set multiple items in the datastore (bulk create) using v2 API
 */
export const setDatastoreItems = async (
  items: { key: string; value: string | object }[],
  category: string
): Promise<DatastoreResponse> => {
  const orgId = await waitForOrgId();
  if (!orgId) {
    return { success: false, error: 'No organization ID found' };
  }

  // Use v2 API for bulk operations - send as array
  const payload = items.map(item => ({
    key: item.key,
    value: serializeDatastoreValue(item.value),
    category,
    ...(category === 'shuffle-security_incidents' ? { ignore_security_rules: true } : {}),
  }));

  const response = await fetch(getApiUrl('/api/v2/datastore'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(orgId),
    },

    body: JSON.stringify(payload),
  });

   if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    const parsed = parseWriteResponseBody(bodyText);
    if (isUnchangedWrite(parsed.keysExisted)) {
      return { success: true, changed: false, keysExisted: parsed.keysExisted };
    }
    const fallbackResults = await Promise.all(items.map(item =>
      setDatastoreItem(item.key, item.value, category)
    ));
    const failedWrites = fallbackResults.filter(result => !result.success);
    if (failedWrites.length > 0) {
      return {
        success: false,
        error: failedWrites[0]?.error || `Failed to set datastore items: ${response.statusText}`,
        keysExisted: fallbackResults.flatMap(r => r.keysExisted || []),
      };
    }
    const fallbackKeys = fallbackResults.flatMap(r => r.keysExisted || []);
    return {
      success: true,
      keysExisted: fallbackKeys.length ? fallbackKeys : undefined,
      changed: fallbackKeys.length ? fallbackKeys.some(k => k.changed) : undefined,
    };
  }

  // Multi-key writes always return success:true; "changed" is per key.
  const okParsed = parseWriteResponseBody(await response.text().catch(() => ''));
  if (okParsed.keysExisted?.some(k => !k.changed)) {
    console.warn(
      `[datastore.setMany] category=${category} unchanged keys: ${okParsed.keysExisted.filter(k => !k.changed).map(k => k.key).join(', ')}`,
    );
  }
  return {
    success: okParsed.success !== false,
    keysExisted: okParsed.keysExisted,
    changed: okParsed.keysExisted ? okParsed.keysExisted.some(k => k.changed) : undefined,
    ...(okParsed.success === false ? { error: 'Backend reported success=false for bulk datastore write' } : {}),
  };
};


/**
 * Get a single item from the datastore
 */
export const getDatastoreItem = async (
  key: string,
  category: string,
  overrideOrgId?: string,
  options?: { priority?: boolean; regionUrl?: string }
): Promise<DatastoreResponse & { item?: DatastoreItem }> => {
  const orgId = overrideOrgId || (await waitForOrgId());
  if (!orgId) {
    return { success: false, error: 'No organization ID found' };
  }

  const rawKey = normalizeDatastoreKey(key);
  const payload: Record<string, string> = {
    key: rawKey,
    org_id: orgId,
  };
  
  if (category) {
    payload.category = category;
  }

  const isVulnsCategory = category === 'shuffle-security_vulns' || category === 'shuffle-security_vulnerabilities' || category === 'vulns';
  const requestUrl = isVulnsCategory
    ? datastoreUrl(`/api/v2/vulns/${encodeURIComponent(rawKey)}`, options?.regionUrl)
    : datastoreUrl(`/api/v1/orgs/${orgId}/get_cache`, options?.regionUrl);
  const baseDiagnostics: DatastoreDiagnostics = {
    operation: 'get',
    category,
    orgId,
    url: requestUrl,
    timestamp: new Date().toISOString(),
  };

  // Always pin Org-Id header so the backend routes the read to the exact
  // tenant we asked for — do NOT rely on session default even when there is
  // no explicit override, because the URL path already carries this orgId.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeader(orgId),
  };


  console.log(`[datastore.get] key=${rawKey} category=${category} orgId=${orgId}${overrideOrgId ? ' (override)' : ''}`);

  let response: Response | null = null;
  let rawBody = '';
  const maxAttempts = category === 'shuffle-security_incidents' ? 3 : 2;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // Bounded globally so background cross-loads cannot burst the client-side
    // fetch breaker and starve user-initiated reads. Foreground reads are
    // scheduled ahead of background work.
    const release = await acquireDatastoreSlot(options?.priority === true);
    try {
      response = await fetch(requestUrl, {
        method: isVulnsCategory ? 'GET' : 'POST',
        credentials: 'include',
        headers,
        body: isVulnsCategory ? undefined : JSON.stringify(payload),
      });
      rawBody = await response.text();
      if (response.ok || response.status === 404 || !isTransientDatastoreStatus(response.status) || attempt === maxAttempts - 1) {
        break;
      }
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        release();
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get datastore item',
          diagnostics: {
            ...baseDiagnostics,
            errorStage: 'request',
            timestamp: new Date().toISOString(),
          },
        };
      }
    } finally {
      release();
    }

    await wait(400 * (attempt + 1));
  }

  if (!response) {
    return {
      success: false,
      error: 'Failed to get datastore item',
      diagnostics: {
        ...baseDiagnostics,
        errorStage: 'request',
        timestamp: new Date().toISOString(),
      },
    };
  }

  if (!response.ok) {
    // 404 means key doesn't exist - not an error, just empty
    if (response.status === 404) {
      return {
        success: true,
        item: undefined,
        diagnostics: {
          ...baseDiagnostics,
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type'),
          bodyPreview: truncateResponsePreview(rawBody),
          errorStage: 'response',
          timestamp: new Date().toISOString(),
        },
      };
    }

    if (category === 'shuffle-security_incidents' && isTransientDatastoreStatus(response.status) && !isCircuitBreakerResponse(response)) {
      const fallbackItem = await findDatastoreItemInCategoryPages(rawKey, category, orgId);
      if (fallbackItem) {
        return {
          success: true,
          item: fallbackItem,
          diagnostics: {
            ...baseDiagnostics,
            status: response.status,
            statusText: `${response.statusText || 'transient'}; recovered via list_cache`,
            contentType: response.headers.get('content-type'),
            bodyPreview: truncateResponsePreview(rawBody),
            errorStage: 'response',
            timestamp: new Date().toISOString(),
          },
        };
      }
    }

    // Client-side circuit breaker: this never touched the network. Treat as a
    // soft "try again shortly" rather than a hard error so callers can leave
    // existing UI state intact instead of flashing a red failure screen.
    if (isCircuitBreakerResponse(response)) {
      return {
        success: false,
        error: 'circuit_breaker_open',
        diagnostics: {
          ...baseDiagnostics,
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type'),
          bodyPreview: truncateResponsePreview(rawBody),
          errorStage: 'response',
          timestamp: new Date().toISOString(),
        },
      };
    }

    return {
      success: false,
      error: `Failed to get datastore item: ${response.status} ${response.statusText}`.trim(),
      diagnostics: {
        ...baseDiagnostics,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
        bodyPreview: truncateResponsePreview(rawBody),
        errorStage: 'response',
        timestamp: new Date().toISOString(),
      },
    };
  }


  let data: any;
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? `Failed to parse datastore item response: ${error.message}` : 'Failed to parse datastore item response',
      diagnostics: {
        ...baseDiagnostics,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
        bodyPreview: truncateResponsePreview(rawBody),
        errorStage: 'parse',
        timestamp: new Date().toISOString(),
      },
    };
  }
  
  // API returns success: false if key not found
  if (data.success === false && !data.value) {
    // NOTE: do NOT trigger list_cache pagination here. A `success:false` with
    // no value is the normal "key does not exist" response, and paginating the
    // whole category for every miss makes the /incidents list crawl because
    // background hooks legitimately probe many missing keys. The list_cache
    // fallback is only for real transient HTTP failures (handled above).


    return {
      success: true,
      item: undefined,
      diagnostics: {
        ...baseDiagnostics,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
        bodyPreview: truncateResponsePreview(rawBody),
        responseShape: 'unknown',
        itemCount: 0,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Some cache handlers answer a missing key with HTTP 200 and an otherwise
  // empty success envelope. Do not expose that envelope as a datastore item:
  // callers would treat the searched key itself as a real incident even
  // though no stored value exists.
  if (typeof data.value !== 'string') {
    if (data && typeof data === 'object' && (data.id || data.title || data.cve_id || data.affected)) {
      return {
        success: true,
        item: {
          key: data.id || rawKey,
          value: JSON.stringify(data),
          category: category || 'shuffle-security_vulns',
          org_id: orgId,
          ...data,
        },
        diagnostics: {
          ...baseDiagnostics,
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type'),
          bodyPreview: truncateResponsePreview(rawBody),
          responseShape: 'object',
          itemCount: 1,
          timestamp: new Date().toISOString(),
        },
      };
    }

    return {
      success: true,
      item: undefined,
      diagnostics: {
        ...baseDiagnostics,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
        bodyPreview: truncateResponsePreview(rawBody),
        responseShape: 'unknown',
        itemCount: 0,
        timestamp: new Date().toISOString(),
      },
    };
  }
  
  return {
    success: true,
    item: data,
    diagnostics: {
      ...baseDiagnostics,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      responseShape: 'unknown',
      itemCount: data?.key ? 1 : 0,
      timestamp: new Date().toISOString(),
    },
  };
};

async function findDatastoreItemInCategoryPages(
  rawKey: string,
  category: string,
  orgId: string,
): Promise<DatastoreItem | null> {
  let cursor: string | undefined;
  for (let page = 0; page < 12; page += 1) {
    const response = await getDatastoreByCategory(category, cursor, 100, orgId);
    if (!response.success) return null;
    const found = (response.data || []).find((item) => isSameDatastoreKey(item.key, rawKey));
    if (found) return found;
    if (!response.cursor) return null;
    cursor = response.cursor;
  }
  return null;
}

/**
 * Get a single item from the datastore using public authorization (no login required)
 */
export const getDatastoreItemPublic = async (
  key: string,
  orgId: string,
  authorization: string,
): Promise<DatastoreResponse & { item?: DatastoreItem }> => {
  const response = await fetch(
    getApiUrl(`/api/v1/orgs/${orgId}/cache/${key}?authorization=${authorization}`),
    { method: 'GET' },
  );

  if (!response.ok) {
    if (response.status === 404) {
      return { success: true, item: undefined };
    }
    return { success: false, error: `Failed to get public datastore item: ${response.statusText}` };
  }

  const data = await response.json();
  if (data.success === false && !data.value) {
    return { success: true, item: undefined };
  }
  return { success: true, item: data };
};

/**
 * Try to extract valid datastore items from a response body string,
 * even if the HTTP status was non-2xx (some backend servers return 400 with valid data).
 */
const tryExtractItemsFromBody = (rawBody: string): { items: DatastoreItem[]; categoryConfig?: CategoryConfig; cursor?: string; totalAmount?: number; shape: DatastoreDiagnostics['responseShape'] } | null => {
  try {
    const data = rawBody ? JSON.parse(rawBody) : null;
    if (!data || typeof data !== 'object') return null;

    const items = Array.isArray(data) ? data : data.keys || data.data || [];
    if (!Array.isArray(items) || items.length === 0) return null;

    // Basic validation: at least one item should have a key
    if (!items.some((i: any) => i && typeof i === 'object' && typeof i.key === 'string')) return null;

    const shape: DatastoreDiagnostics['responseShape'] = Array.isArray(data)
      ? 'array'
      : Array.isArray(data?.keys) ? 'keys'
      : Array.isArray(data?.data) ? 'data'
      : 'unknown';

    return {
      items,
      categoryConfig: data.category_config,
      cursor: data.cursor,
      totalAmount: data.total_amount,
      shape,
    };
  } catch {
    return null;
  }
};

/**
 * Previously this dropped items whose `org_id` did not match the requested org.
 * That hid legitimate data (backends echo parent/shared org ids on entries the
 * child org is meant to see), so it now only logs the mismatch and returns
 * everything the backend gave us.
 */
const scopeItemsToOrg = <T,>(items: T[], orgId: string): T[] => {
  if (!Array.isArray(items)) return items;
  const mismatched = items.filter((item) => {
    const owner = (item as any)?.org_id || (item as any)?.orgId;
    return typeof owner === 'string' && owner && owner !== orgId;
  }).length;
  if (mismatched > 0) {
    console.debug(`[Datastore] ${mismatched}/${items.length} items have a different org_id than ${orgId} — showing them anyway`);
  }
  return items;
};


/**
/**
 * Page size used for a category. Exported so callers that follow cursors can
 * tell a full page (more data may exist) from a short page (definitively the
 * last one) — the backend returns a cursor even on the final page.
 */
export const getDatastorePageSize = (category: string, limit?: number): number =>
  limit ?? (category === DATASTORE_CATEGORIES.INCIDENTS ? 50 : 100);

/**
 * Get all items in a category with optional cursor-based pagination
 */
export const getDatastoreByCategory = async (
  category: string,
  cursor?: string,
  limit?: number,
  overrideOrgId?: string
): Promise<DatastoreResponse> => {
  const orgId = overrideOrgId || (await waitForOrgId());
  if (!orgId) {
    return {
      success: false,
      error: 'No organization ID found',
      diagnostics: {
        operation: 'list',
        category,
        orgId: null,
        cursor,
        errorStage: 'request',
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Default page size is 100. Incidents specifically cap at 50 because their
  // payloads are far larger than other categories — pagination via cursor
  // handles the rest.
  const effectiveLimit = getDatastorePageSize(category, limit);
  const isVulnsCategory = category === 'shuffle-security_vulns' || category === 'shuffle-security_vulnerabilities' || category === 'vulns';
  let url = isVulnsCategory
    ? `/api/v2/vulns?skip_fields=false&top=${effectiveLimit}`
    : `/api/v1/orgs/${orgId}/list_cache?category=${encodeURIComponent(category)}&top=${effectiveLimit}`;
  if (cursor) {
    url += `&cursor=${encodeURIComponent(cursor)}`;
  }

  const requestUrl = getApiUrl(url);
  const baseDiagnostics: DatastoreDiagnostics = {
    operation: 'list',
    category,
    orgId,
    url: requestUrl,
    cursor,
    timestamp: new Date().toISOString(),
  };

  let response: Response;

  try {
    response = await fetch(
      requestUrl,
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(orgId),
        },
      }
    );
  } catch (error) {
    // Network error — retry once
    try {
      response = await fetch(
        requestUrl,
        {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(orgId),
          },
        }
      );
    } catch (retryError) {
      return {
        success: false,
        error: retryError instanceof Error ? retryError.message : 'Failed to request datastore items',
        diagnostics: {
          ...baseDiagnostics,
          errorStage: 'request',
        },
      };
    }
  }

  const contentType = response.headers.get('content-type');
  const rawBody = await response.text();

  if (!response.ok) {
    // Some backend servers return 400 but still include valid data in the body.
    // Try to extract items before treating as a hard failure.
    const extracted = tryExtractItemsFromBody(rawBody);
    if (extracted && extracted.items.length > 0) {
      console.warn(`[Datastore] ${response.status} response for category=${category} but body contained ${extracted.items.length} valid items — treating as success`);
      return {
        success: true,
        data: scopeItemsToOrg(extracted.items, orgId),
        categoryConfig: extracted.categoryConfig,
        cursor: extracted.cursor,
        totalAmount: extracted.totalAmount,
        diagnostics: {
          ...baseDiagnostics,
          status: response.status,
          statusText: response.statusText,
          contentType,
          responseShape: extracted.shape,
          itemCount: extracted.items.length,
          totalAmount: extracted.totalAmount ?? null,
        },
      };
    }

    // No valid data in body — retry once for transient server errors
    if (response.status >= 400 && response.status < 500) {
      try {
        const retryResponse = await fetch(
          requestUrl,
          {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeader(orgId),
            },
          }
        );
        const retryBody = await retryResponse.text();
        const retryExtracted = tryExtractItemsFromBody(retryBody);
        if (retryResponse.ok || (retryExtracted && retryExtracted.items.length > 0)) {
          const items = scopeItemsToOrg(retryExtracted?.items || [], orgId);
          console.warn(`[Datastore] Retry succeeded for category=${category} (status=${retryResponse.status}, items=${items.length})`);
          return {
            success: true,
            data: items,
            categoryConfig: retryExtracted?.categoryConfig,
            cursor: retryExtracted?.cursor,
            totalAmount: retryExtracted?.totalAmount,
            diagnostics: {
              ...baseDiagnostics,
              status: retryResponse.status,
              statusText: retryResponse.statusText,
              contentType: retryResponse.headers.get('content-type'),
              responseShape: retryExtracted?.shape || 'unknown',
              itemCount: items.length,
              totalAmount: retryExtracted?.totalAmount ?? null,
            },
          };
        }
      } catch { /* retry failed, fall through to error */ }
    }

    return {
      success: false,
      error: isCircuitBreakerResponse(response)
        ? 'circuit_breaker_open'
        : `Failed to get datastore items: ${response.status} ${response.statusText}`.trim(),
      diagnostics: {
        ...baseDiagnostics,
        status: response.status,
        statusText: response.statusText,
        contentType,
        bodyPreview: truncateResponsePreview(rawBody),
        errorStage: 'response',
      },
    };
  }

  try {
    const data = rawBody ? JSON.parse(rawBody) : {};
    const responseShape: DatastoreDiagnostics['responseShape'] = Array.isArray(data)
      ? 'array'
      : Array.isArray(data?.keys)
        ? 'keys'
        : Array.isArray(data?.data)
          ? 'data'
          : 'unknown';
    const items = Array.isArray(data) ? data : data.keys || data.data || [];
    const totalAmount = data.total_amount ?? data.total ?? data.amount;

    return {
      success: true,
      data: scopeItemsToOrg(items, orgId),
      categoryConfig: data.category_config,
      cursor: data.cursor,
      totalAmount,
      diagnostics: {
        ...baseDiagnostics,
        status: response.status,
        statusText: response.statusText,
        contentType,
        responseShape,
        itemCount: Array.isArray(items) ? items.length : 0,
        totalAmount: totalAmount ?? null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? `Failed to parse datastore response: ${error.message}` : 'Failed to parse datastore response',
      diagnostics: {
        ...baseDiagnostics,
        status: response.status,
        statusText: response.statusText,
        contentType,
        bodyPreview: truncateResponsePreview(rawBody),
        errorStage: 'parse',
      },
    };
  }
};

/**
 * Delete a single item from the datastore
 */
export const deleteDatastoreItem = async (
  key: string,
  category: string,
  overrideOrgId?: string,
  options?: { regionUrl?: string }
): Promise<DatastoreResponse> => {
  const orgId = overrideOrgId || (await waitForOrgId());
  if (!orgId) {
    return { success: false, error: 'No organization ID found' };
  }

  const rawKey = normalizeDatastoreKey(key);
  const payload: Record<string, string> = {
    key: rawKey,
    org_id: orgId,
  };
  
  if (category) {
    payload.category = category;
  }

  // Always pin Org-Id header — the URL path already carries this orgId,
  // never let the backend fall back to the session's active org for a
  // destructive operation.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeader(orgId),
  };


  console.log(`[datastore.delete] key=${rawKey} category=${category} orgId=${orgId}${overrideOrgId ? ' (override)' : ''}`);

  const response = await fetch(datastoreUrl(`/api/v1/orgs/${orgId}/delete_cache`, options?.regionUrl), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { success: false, error: `Failed to delete datastore item: ${response.statusText}` };
  }

  return { success: true };
};

/**
 * Delete multiple items from the datastore (bulk delete)
 */
export const deleteDatastoreItems = async (
  keys: string[],
  category: string
): Promise<{ success: boolean; deleted: number; failed: string[]; error?: string }> => {
  const orgId = await waitForOrgId();
  if (!orgId) {
    return { success: false, deleted: 0, failed: keys, error: 'No organization ID found' };
  }

  const results = await Promise.allSettled(
    keys.map(key => deleteDatastoreItem(key, category))
  );

  const failed: string[] = [];
  let deleted = 0;

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.success) {
      deleted++;
    } else {
      failed.push(keys[index]);
    }
  });

  return {
    success: failed.length === 0,
    deleted,
    failed,
  };
};

// Category constants for consistency
export const DATASTORE_CATEGORIES = {
  INCIDENTS: 'shuffle-security_incidents',
  VULNERABILITIES: 'shuffle-security_vulns',
  VULNS: 'shuffle-security_vulns',
  ASSETS: 'shuffle-security_assets',
  PACKAGES: 'shuffle-security_packages',
  SOFTWARE: 'shuffle-security_software',
  TEMPLATES: 'shuffle-security_templates',
  CONFIGURATION: 'shuffle-security_configuration',
  IOCS: 'shuffle-security_ioc-config',
  CUSTOM_FIELDS: 'shuffle-security_custom-fields',
  THREAT_FEEDS: 'shuffle-security_threat-feeds',
  INFRASTRUCTURE: 'shuffle-security_infrastructure',
  USERS: 'shuffle-security_users',
  REPORTS: 'shuffle-security_reports',
  // Legacy - for migration purposes
  LEGACY_ALERTS: 'shuffle-security_alerts',
  LEGACY_CASES: 'shuffle-security_cases',
} as const;

