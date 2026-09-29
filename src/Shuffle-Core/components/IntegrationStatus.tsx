import { useState, useEffect, useCallback } from 'react';
import {
  Plus as AddIcon
} from 'lucide-react';
import {
  Box,
  Typography,
  Tooltip,
  IconButton,
  Avatar,
  CircularProgress,
} from '@mui/material';
import { Link as RouterLink } from '@/lib/router-compat';
import { API_CONFIG, getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { fetchAuthenticatedApps } from '@/Shuffle-MCPs/authenticatedApps';
import { fetchAppsViaApiConfig as fetchApps } from '@/Shuffle-MCPs/appsCache';
import { getDatastoreItem } from '@/Shuffle-MCPs/datastore';

// Onboarding datastore (must stay in sync with OnboardingPage)
const ONBOARDING_CONFIG_CATEGORY = 'shuffle-security_onboarding';
const SELECTED_TOOLS_KEY = 'selected_tools';
import { deduplicateAuthApps, backfillAppImages, type AuthAppEntry } from '@/Shuffle-MCPs/auth-utils';
import { useAppDetailOptional } from '@/Shuffle-MCPs/AppDetailContext';
import { SIEM_PATTERNS, CASES_PATTERNS, EDR_PATTERNS, EMAIL_APP_PATTERNS } from '@/Shuffle-MCPs/ingestionDetection';
import type { ShuffleHostProps } from '@/Shuffle-MCPs/host-props';

interface Integration {
  id: string;
  name: string;
  icon: string;
  category: string;
  hasValidAuth: boolean;
  authInstances: { label: string; isValidated: boolean }[];
  isActiveOnly?: boolean;
}

interface IntegrationStatusProps extends ShuffleHostProps {
  collapsed: boolean;
  /** When provided, only show integrations whose name is in this list */
  filterApps?: string[];
  /** When provided, the Add button calls this instead of navigating to /onboarding */
  onAddClick?: () => void;
  /** Icon size override (default: 26) */
  iconSize?: number;
  /** When provided, hovering an icon shows a cross-out button that calls this with the app name */
  onDisable?: (name: string) => void;
  /** Set of app names that are currently disabled */
  disabledApps?: Set<string>;
  /** Show all integrations without truncation */
  showAll?: boolean;
  /** Hide the Add Integration button */
  hideAddButton?: boolean;
  /** Hide the "Integrations" section header */
  hideHeader?: boolean;
  /** When set, apps matching this category are sorted to the top */
  priorityCategory?: string;
  /** Extra apps to merge in (e.g. apps selected in onboarding but not yet activated). Merged by name (case-insensitive) — not duplicated if already present. */
  extraApps?: { id: string; name: string; icon?: string }[];
}

const PRIORITY_CATEGORY_PATTERNS: Record<string, string[]> = {
  siem: SIEM_PATTERNS,
  case_management: CASES_PATTERNS,
  edr: EDR_PATTERNS,
  email: EMAIL_APP_PATTERNS,
};

function matchesPriorityCategory(appName: string, categoryId: string): boolean {
  const patterns = PRIORITY_CATEGORY_PATTERNS[categoryId];
  if (!patterns) return false;
  const lower = appName.toLowerCase();
  return patterns.some(p => lower.includes(p));
}

/** Fire this event from anywhere to make all IntegrationStatus instances re-fetch. */
export const refreshAllIntegrationStatus = () => {
  window.dispatchEvent(new CustomEvent('integrations-changed'));
};

export const IntegrationStatus = ({ collapsed, filterApps, onAddClick, iconSize = 26, onDisable, disabledApps, showAll, hideAddButton, hideHeader, priorityCategory, extraApps }: IntegrationStatusProps) => {
  const [allIntegrations, setAllIntegrations] = useState<Integration[]>([]);
  const [onboardingApps, setOnboardingApps] = useState<{ id: string; name: string; icon?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const appDetail = useAppDetailOptional();

  // Merge in any extra (pending/selected) apps not already present.
  // Combines explicit `extraApps` prop (live in-memory selections from the
  // onboarding wizard) with apps persisted in the shuffle-security_onboarding
  // datastore so every IntegrationStatus instance — regardless of where it is
  // mounted — shows the same set of enabled / pending apps.
  const mergedIntegrations = (() => {
    const pending = [...(extraApps || []), ...onboardingApps];
    if (pending.length === 0) return allIntegrations;
    const existing = new Set(allIntegrations.map(i => i.name.toLowerCase()));
    const seenExtra = new Set<string>();
    const extras: Integration[] = [];
    for (const e of pending) {
      const key = (e.name || '').toLowerCase();
      if (!key || existing.has(key) || seenExtra.has(key)) continue;
      seenExtra.add(key);
      extras.push({
        id: e.id || e.name,
        name: e.name,
        icon: e.icon || '',
        category: 'Integration',
        hasValidAuth: false,
        authInstances: [],
        isActiveOnly: true,
      });
    }
    return [...allIntegrations, ...extras];
  })();

  // Apply filter if provided (case-insensitive name match)
  const integrations = filterApps
    ? mergedIntegrations.filter(i => filterApps.some(f => f.toLowerCase() === i.name.toLowerCase()))
    : mergedIntegrations;

  const defaultLimit = showAll ? integrations.length : (collapsed ? 3 : 7);
  const displayLimit = showAll ? integrations.length : (expanded ? integrations.length : defaultLimit);
  const hasMore = !showAll && integrations.length > defaultLimit;

  // Fetch enabled integrations from API
  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    try {
      // Use the coalesced shared fetcher so we share a single in-flight
      // request with other consumers (e.g. the incident header source-app
      // logo). Without this, every detail-page navigation triggered 3+
      // identical /apps/authentication requests.
      const authData = (await fetchAuthenticatedApps().catch(() => [])) as unknown as AuthAppEntry[];

      let dedupedIntegrations: Integration[] = [];
      const authNameSet = new Set<string>();

      if (Array.isArray(authData) && authData.length > 0) {
        const dedupedApps = deduplicateAuthApps(authData);
        await backfillAppImages(dedupedApps);

        dedupedIntegrations = dedupedApps
          .map(({ app, instances, hasValidAuth, bestImage }) => {
            authNameSet.add(app.name.toLowerCase());
            return {
              id: app.id,
              name: app.name,
              icon: bestImage || app.large_image || '',
              category: app.categories?.[0] || 'Integration',
              hasValidAuth,
              authInstances: instances,
              isActiveOnly: false,
            };
          });
      }

      if (dedupedIntegrations.length < 10) {
        try {
          const appsData = await fetchApps();
          if (Array.isArray(appsData)) {
              const activatedApps = appsData.filter((app: any) => app.activated);
              const slotsRemaining = 10 - dedupedIntegrations.length;
              let added = 0;
              for (const app of activatedApps) {
                if (added >= slotsRemaining) break;
                if (!authNameSet.has((app.name || '').toLowerCase())) {
                  authNameSet.add((app.name || '').toLowerCase());
                  dedupedIntegrations.push({
                    id: app.id || app.name,
                    name: app.name,
                    icon: app.large_image || '',
                    category: app.categories?.[0] || 'Integration',
                    hasValidAuth: false,
                    authInstances: [],
                    isActiveOnly: true,
                  });
                  added++;
                }
              }
          }
        } catch (_) {
          // Non-critical, ignore
        }
      }

      dedupedIntegrations.sort((a, b) => {
        // Priority category apps first
        if (priorityCategory) {
          const aMatch = matchesPriorityCategory(a.name, priorityCategory);
          const bMatch = matchesPriorityCategory(b.name, priorityCategory);
          if (aMatch && !bMatch) return -1;
          if (!aMatch && bMatch) return 1;
        }
        if (a.hasValidAuth && !b.hasValidAuth) return -1;
        if (!a.hasValidAuth && b.hasValidAuth) return 1;
        if (!a.isActiveOnly && b.isActiveOnly) return -1;
        if (a.isActiveOnly && !b.isActiveOnly) return 1;
        return a.name.localeCompare(b.name);
      });
          
      setAllIntegrations(dedupedIntegrations);
    } catch (error) {
      console.error('Failed to fetch integrations:', error);
    } finally {
      setLoading(false);
    }
  }, [priorityCategory]);

  // Load apps selected in the onboarding wizard (persisted to datastore).
  // This keeps every IntegrationStatus instance in sync with /onboarding/sources
  // without each parent having to plumb extraApps down manually.
  const fetchOnboardingApps = useCallback(async () => {
    try {
      const resp = await getDatastoreItem(SELECTED_TOOLS_KEY, ONBOARDING_CONFIG_CATEGORY);
      if (!resp?.success || !resp.item?.value) {
        setOnboardingApps([]);
        return;
      }
      const raw = typeof resp.item.value === 'string' ? JSON.parse(resp.item.value) : resp.item.value;
      if (!Array.isArray(raw)) {
        setOnboardingApps([]);
        return;
      }
      setOnboardingApps(
        raw
          .map((a: any) => ({
            id: a?.objectID || a?.id || a?.name,
            name: a?.name,
            icon: a?.image_url || a?.large_image || '',
          }))
          .filter((a: any) => a.name)
      );
    } catch (_) {
      setOnboardingApps([]);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchIntegrations();
    fetchOnboardingApps();
  }, [fetchIntegrations, fetchOnboardingApps]);

  // Re-fetch whenever any integration auth changes globally
  useEffect(() => {
    const handler = () => {
      fetchIntegrations();
      fetchOnboardingApps();
    };
    window.addEventListener('integrations-changed', handler);
    return () => window.removeEventListener('integrations-changed', handler);
  }, [fetchIntegrations, fetchOnboardingApps]);

  const getStatusColor = (integration: Integration) => {
    if (integration.isActiveOnly) return 'hsl(var(--destructive))';
    return integration.hasValidAuth ? 'hsl(var(--severity-low))' : 'hsl(var(--severity-medium))';
  };

  // Icon-only view for both collapsed and expanded states
  const sz = iconSize;
  return (
    <Box sx={{ px: collapsed ? 0 : 1, py: 1 }}>
      {/* Header - only show when expanded */}
      {!collapsed && !hideHeader && (
        <Typography 
          sx={{ 
            color: 'hsl(var(--muted-foreground))', 
            fontSize: '0.7rem', 
            fontWeight: 600, 
            textTransform: 'uppercase', 
            letterSpacing: '0.05em',
            px: 1.5,
            mb: 1,
          }}
        >
          Integrations
        </Typography>
      )}
      
      {/* Icon grid */}
      <Box sx={{ 
        display: 'flex', 
        flexWrap: 'wrap',
        gap: 0.5,
        justifyContent: collapsed ? 'center' : 'flex-start',
        px: collapsed ? 0 : 1,
        maxHeight: expanded ? 'none' : 80,
        overflow: 'hidden',
      }}>
        {loading ? (
          <CircularProgress size={20} sx={{ color: 'hsl(var(--muted-foreground))' }} />
        ) : (
          <>
            {integrations.slice(0, displayLimit).map((integration) => {
              const isDisabled = disabledApps?.has(integration.name) ?? false;
              const isHovered = hoveredId === integration.id;
              return (
              <Tooltip 
                key={integration.id} 
                title={onDisable && isHovered ? '' : (
                  <Box sx={{ textAlign: 'left', minWidth: 160, maxWidth: 320, p: 0.5 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: 'hsl(var(--foreground))', textTransform: 'capitalize' }}>
                      {integration.name.replace(/_/g, ' ')}
                      {isDisabled && <Typography component="span" sx={{ ml: 1, fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>(disabled)</Typography>}
                    </Typography>
                    <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', mb: 1, textTransform: 'capitalize' }}>
                      {integration.category}
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      {integration.authInstances.map((instance, idx) => (
                        <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                          <Box 
                            sx={{ 
                              width: 7, 
                              height: 7, 
                              borderRadius: '50%', 
                              backgroundColor: instance.isValidated 
                                ? 'hsl(var(--severity-low))' 
                                : 'hsl(var(--severity-medium))',
                              flexShrink: 0,
                            }} 
                          />
                          <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--foreground))', opacity: 0.9, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {instance.label}
                          </Typography>
                          <Typography sx={{ fontSize: '0.65rem', color: instance.isValidated ? 'hsl(var(--severity-low))' : 'hsl(var(--muted-foreground))', flexShrink: 0 }}>
                            {instance.isValidated ? 'Valid' : 'Pending'}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}
                placement="bottom"
                arrow
              >
              <Box
                  onMouseEnter={() => onDisable && setHoveredId(integration.id)}
                  onMouseLeave={() => onDisable && setHoveredId(null)}
                  sx={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: onDisable ? 'default' : 'pointer',
                    textDecoration: 'none',
                    opacity: isDisabled ? 0.35 : 1,
                    transition: 'opacity 0.15s ease',
                    '&:hover': onDisable ? {} : {
                      transform: 'scale(1.1)',
                      transition: 'transform 0.15s ease',
                    },
                  }}
                >
                  {/* Icon — rendered as link only when not in disable mode */}
                  <Box
                    onClick={!onDisable && appDetail ? () => appDetail.openApp(integration.name) : undefined}
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', cursor: !onDisable && appDetail ? 'pointer' : 'default' }}
                  >
                    {integration.icon && !failedImages.has(integration.id) ? (
                      <Box
                        component="img"
                        src={integration.icon}
                        alt={integration.name}
                        sx={{
                          width: sz,
                          height: sz,
                          borderRadius: '50%',
                          objectFit: 'contain',
                          backgroundColor: 'hsl(var(--muted))',
                          p: 0.25,
                          filter: isDisabled ? 'grayscale(1)' : 'none',
                          transition: 'filter 0.15s ease',
                        }}
                        onError={() => {
                          setFailedImages(prev => new Set(prev).add(integration.id));
                        }}
                      />
                    ) : (
                      <Avatar
                        sx={{
                          width: sz,
                          height: sz,
                          backgroundColor: 'hsl(var(--muted))',
                          fontSize: sz * 0.4 + 'px',
                          color: 'hsl(var(--foreground))',
                          filter: isDisabled ? 'grayscale(1)' : 'none',
                        }}
                      >
                        {integration.name.charAt(0).toUpperCase()}
                      </Avatar>
                    )}
                  </Box>

                  {/* Status dot */}
                  {!isDisabled && (
                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: -1,
                        right: -1,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: getStatusColor(integration),
                        border: '1.5px solid hsl(var(--card))',
                        pointerEvents: 'none',
                      }}
                    />
                  )}

                  {/* Hover cross-out overlay */}
                  {onDisable && isHovered && (
                    <Box
                      onClick={() => onDisable(integration.name)}
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isDisabled
                          ? 'hsla(var(--severity-low) / 0.25)'
                          : 'hsla(var(--destructive) / 0.75)',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      {isDisabled ? (
                        /* Re-enable: checkmark */
                        <svg width={sz * 0.45} height={sz * 0.45} viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="hsl(var(--severity-low))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        /* Disable: X */
                        <svg width={sz * 0.45} height={sz * 0.45} viewBox="0 0 12 12" fill="none">
                          <path d="M2 2l8 8M10 2l-8 8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                      )}
                    </Box>
                  )}
                </Box>
              </Tooltip>
              );
            })}
            
            {hasMore && !expanded && (
              <Tooltip title={`Show all ${integrations.length} integrations`} placement="bottom">
                <Avatar
                  onClick={() => setExpanded(true)}
                  sx={{
                    width: 26,
                    height: 26,
                    backgroundColor: 'hsl(var(--muted))',
                    fontSize: '0.65rem',
                    color: 'hsl(var(--muted-foreground))',
                    cursor: 'pointer',
                    '&:hover': {
                      backgroundColor: 'hsl(var(--muted))',
                    },
                  }}
                >
                  +{integrations.length - defaultLimit}
                </Avatar>
              </Tooltip>
            )}
            
            {expanded && hasMore && (
              <Tooltip title="Show less" placement="bottom">
                <Avatar
                  onClick={() => setExpanded(false)}
                  sx={{
                    width: 26,
                    height: 26,
                    backgroundColor: 'hsl(var(--muted))',
                    fontSize: '0.65rem',
                    color: 'hsl(var(--muted-foreground))',
                    cursor: 'pointer',
                    '&:hover': {
                      backgroundColor: 'hsl(var(--muted))',
                    },
                  }}
                >
                  −
                </Avatar>
              </Tooltip>
            )}
            
            {/* Add button */}
            {!hideAddButton && (
            <Tooltip title="Add Integration" placement="bottom">
              {onAddClick ? (
                <IconButton
                  size="small"
                  onClick={onAddClick}
                  sx={{ 
                    width: 26,
                    height: 26,
                    color: 'hsl(var(--muted-foreground))',
                    border: '1px dashed hsl(var(--border))',
                    borderRadius: '50%',
                    '&:hover': {
                      backgroundColor: 'hsl(var(--muted))',
                      borderStyle: 'solid',
                    },
                  }}
                >
                  <AddIcon size={14} />
                </IconButton>
              ) : (
                <IconButton
                  size="small"
                  component={RouterLink}
                  to="/onboarding"
                  sx={{ 
                    width: 26,
                    height: 26,
                    color: 'hsl(var(--muted-foreground))',
                    border: '1px dashed hsl(var(--border))',
                    borderRadius: '50%',
                    '&:hover': {
                      backgroundColor: 'hsl(var(--muted))',
                      borderStyle: 'solid',
                    },
                  }}
                >
                  <AddIcon size={14} />
                </IconButton>
              )}
            </Tooltip>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};
