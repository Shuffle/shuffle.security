/**
 * Utilities for canonical incident IDs, composite sub-tenant keys, and URL formatting.
 *
 * Incident IDs in multi-tenant environments may follow the format:
 *   `${orgId}::${incidentId}` (e.g. "b::1a0a8c10c56f63c8")
 *
 * Colons (:) are valid path characters (RFC 3986 section 3.3) and do not need
 * percent-encoding in route path segments. Calling `encodeURIComponent` on composite
 * IDs turns "::" into "%3A%3A", breaking route segment parsing and datastore lookups.
 */

/**
 * Decodes any percent-encoded colons or characters in an incident ID,
 * returning the canonical form (e.g. "b::1a0a8c10c56f63c8").
 */
export const toCanonicalIncidentId = (rawId: unknown): string => {
  if (typeof rawId !== 'string') return '';
  const trimmed = rawId.trim();
  if (!trimmed) return '';
  if (!trimmed.includes('%')) return trimmed;
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed.replace(/%3a/gi, ':');
  }
};

/**
 * Formats an incident ID for a URL path segment.
 * Preserves "::" delimiters for sub-tenant incidents while safely encoding other characters.
 */
export const formatIncidentRouteId = (rawId: unknown): string => {
  const canonical = toCanonicalIncidentId(rawId);
  if (!canonical) return '';
  if (canonical.includes('::')) {
    return canonical
      .split('::')
      .map(part => encodeURIComponent(part))
      .join('::');
  }
  return encodeURIComponent(canonical);
};

/**
 * Returns the full web application route for an incident (e.g. "/incidents/b::1a0a8c10c56f63c8").
 */
export const getIncidentUrl = (rawId: unknown): string => {
  const routeId = formatIncidentRouteId(rawId);
  return routeId ? `/incidents/${routeId}` : '/incidents';
};

/**
 * Parses a composite incident ID into its org ID (if present) and raw incident ID.
 * Handles both canonical ("org::id") and percent-encoded ("org%3A%3Aid") inputs.
 */
export const parseCompositeIncidentId = (
  rawId: unknown,
): { orgId: string | null; incidentId: string } => {
  const canonical = toCanonicalIncidentId(rawId);
  if (!canonical) {
    return { orgId: null, incidentId: '' };
  }
  if (!canonical.includes('::')) {
    return { orgId: null, incidentId: canonical };
  }
  const parts = canonical.split('::').filter(Boolean);
  if (parts.length <= 1) {
    return { orgId: null, incidentId: parts[0] || canonical };
  }
  const orgId = parts[0];
  const incidentId = parts[parts.length - 1];
  return { orgId, incidentId };
};
