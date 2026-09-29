import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { CategoryConfig, DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';

/**
 * Default config helpers for the incidents category.
 *
 * "Default config" seeds IOC types + threat feeds, and makes sure the
 * "Security Rules" automation is enabled with the standard rule so bad writes
 * are rejected before they land.
 */
export const DEFAULT_SECURITY_RULES = 'merge if always; deny if has_deleted_field';

const SECURITY_RULES_NAME = 'Security Rules';
const SECURITY_RULES_DESCRIPTION =
  'Describes security rules that are validated BEFORE an update occurs. This is in order for bad writes to be avoided. Control: allow, deny, merge, overwrite. Logic: if, or, and. Functions: same_shape, is_superset, has_deleted_field';

export const getActiveOrgId = (): string | null => {
  try {
    const info = localStorage.getItem('shuffle_user_info');
    return info ? JSON.parse(info)?.active_org?.id ?? null : null;
  } catch {
    return null;
  }
};

export const fetchIncidentsCategoryConfig = async (): Promise<CategoryConfig | null> => {
  const orgId = getActiveOrgId();
  if (!orgId) return null;
  const url = getApiUrl(
    `/api/v1/orgs/${orgId}/list_cache?category=${encodeURIComponent(DATASTORE_CATEGORIES.INCIDENTS)}&top=1`,
  );
  const res = await fetch(url, { credentials: 'include', headers: { ...getAuthHeader() } });
  if (!res.ok) throw new Error(`list_cache responded with ${res.status}`);
  const data = await res.json();
  return (data?.category_config as CategoryConfig | undefined) || null;
};

/** True when the Security Rules automation is enabled and carries a rule value. */
export const hasSecurityRulesEnabled = (cfg: CategoryConfig | null): boolean => {
  const automations = cfg?.automations || [];
  const rule = automations.find(
    (a) => a.type === 'security_rules' || a.name === SECURITY_RULES_NAME,
  );
  if (!rule?.enabled) return false;
  const value = (rule.options || []).find((o) => o.key === 'rule')?.value;
  return !!value && value.trim().length > 0;
};

/**
 * Enable the Security Rules automation with the default rule, preserving every
 * other automation already configured on the category.
 */
export const enableIncidentSecurityRules = async (): Promise<void> => {
  let cfg: CategoryConfig | null = null;
  try {
    cfg = await fetchIncidentsCategoryConfig();
  } catch {
    cfg = null;
  }

  const existing = (cfg?.automations || []).map((a) => ({ ...a }));
  const idx = existing.findIndex(
    (a) => a.type === 'security_rules' || a.name === SECURITY_RULES_NAME,
  );

  const securityRules = {
    name: SECURITY_RULES_NAME,
    description: SECURITY_RULES_DESCRIPTION,
    options: [{ key: 'rule', value: DEFAULT_SECURITY_RULES }],
    icon: '',
    enabled: true,
  };

  if (idx >= 0) {
    const current = existing[idx];
    const currentRule = (current.options || []).find((o) => o.key === 'rule')?.value;
    existing[idx] = {
      ...current,
      enabled: true,
      options: [{ key: 'rule', value: currentRule?.trim() || DEFAULT_SECURITY_RULES }],
    } as typeof current;
  } else {
    existing.push(securityRules as never);
  }

  const payload: Record<string, unknown> = {
    category: DATASTORE_CATEGORIES.INCIDENTS,
    automations: existing,
  };
  if (cfg?.settings) payload.settings = cfg.settings;

  const res = await fetch(getApiUrl('/api/v2/datastore/automate'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to enable Security Rules');
};
