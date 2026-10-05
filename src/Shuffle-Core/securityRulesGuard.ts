import { toast } from 'sonner';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';

/**
 * Makes sure the "Security Rules" automation is enabled (with a rule) on the
 * category being written to, for the tenant that owns the write. Runs before
 * manual incident / vulnerability modifications. Results are cached per
 * tenant + category for a few minutes so regular saves are not slowed down.
 * Never blocks the write: on failure a warning is shown and the save proceeds.
 */

export const GUARDED_CATEGORIES = new Set([
  'shuffle-security_incidents',
  'shuffle-security_vulns',
]);

const DEFAULT_RULE = 'merge if always; deny if has_deleted_field';
const NAME = 'Security Rules';
const DESCRIPTION =
  'Describes security rules that are validated BEFORE an update occurs. This is in order for bad writes to be avoided. Control: allow, deny, merge, overwrite. Logic: if, or, and. Functions: same_shape, is_superset, has_deleted_field';
const TTL_MS = 5 * 60 * 1000;

const verifiedAt = new Map<string, number>();
const inFlight = new Map<string, Promise<void>>();
const warned = new Set<string>();

const buildUrl = (path: string, regionUrl?: string) =>
  regionUrl ? `${regionUrl.replace(/\/+$/, '')}${path}` : getApiUrl(path);

type Automation = {
  name?: string;
  type?: string;
  enabled?: boolean;
  options?: { key: string; value: string }[];
  [k: string]: unknown;
};

const run = async (orgId: string, category: string, regionUrl?: string) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeader(orgId),
    'Org-Id': orgId,
  };
  const res = await fetch(
    buildUrl(`/api/v1/orgs/${orgId}/list_cache?category=${encodeURIComponent(category)}&top=1`, regionUrl),
    { credentials: 'include', headers },
  );
  if (!res.ok) throw new Error(`list_cache responded with ${res.status}`);
  const data = await res.json().catch(() => ({}));
  const cfg = data?.category_config || {};
  const automations: Automation[] = Array.isArray(cfg.automations)
    ? cfg.automations.map((a: Automation) => ({ ...a }))
    : [];

  const idx = automations.findIndex((a) => a.type === 'security_rules' || a.name === NAME);
  const current = idx >= 0 ? automations[idx] : null;
  const currentRule = (current?.options || []).find((o) => o.key === 'rule')?.value?.trim();
  if (current?.enabled && currentRule) return;

  if (current) {
    automations[idx] = {
      ...current,
      enabled: true,
      options: [{ key: 'rule', value: currentRule || DEFAULT_RULE }],
    };
  } else {
    automations.push({
      name: NAME,
      description: DESCRIPTION,
      options: [{ key: 'rule', value: DEFAULT_RULE }],
      icon: '',
      enabled: true,
    });
  }

  const payload: Record<string, unknown> = { category, automations };
  if (cfg.settings) payload.settings = cfg.settings;
  const save = await fetch(buildUrl('/api/v2/datastore/automate', regionUrl), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  });
  if (!save.ok) throw new Error(`automate responded with ${save.status}`);
  console.log(`[securityRules] enabled Security Rules for ${category} on org ${orgId}`);
};

export const ensureSecurityRulesForWrite = async (
  orgId: string,
  category: string,
  regionUrl?: string,
): Promise<void> => {
  if (!orgId || !GUARDED_CATEGORIES.has(category)) return;
  const key = `${orgId}|${category}`;
  const last = verifiedAt.get(key);
  if (last && Date.now() - last < TTL_MS) return;

  let pending = inFlight.get(key);
  if (!pending) {
    pending = run(orgId, category, regionUrl)
      .then(() => {
        verifiedAt.set(key, Date.now());
        warned.delete(key);
      })
      .catch((err) => {
        console.warn('[securityRules] could not verify Security Rules', err);
        if (!warned.has(key)) {
          warned.add(key);
          toast.warning('Security Rules are not turned on for this category. The change was saved without them.');
        }
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  await pending;
};
