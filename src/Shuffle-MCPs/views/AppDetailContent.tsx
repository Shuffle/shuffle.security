/**
 * AppDetailContent — Single source of truth for app details, authentication,
 * MCP testing, and action execution.
 *
 * Used by:
 * 1. AppDetailDrawer — in drawer mode (slide-out drawer with close button & incident stats).
 * 2. AppDetailPage — in page mode (full page with guest locking, quick info, and SEO reporting).
 */

import ShuffleMarkdown from '@/Shuffle-MCPs/components/Markdown';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { toast } from '@/Shuffle-MCPs/toast';
import {
  Download,
  Forward,
  X as CloseIcon,
  AlertCircle as ErrorOutlineIcon,
  Lock as LockOutlinedIcon,
  ArrowRight as ArrowForwardIcon,
} from 'lucide-react';
import { Link } from '@/lib/router-compat';
import { getDatastoreByCategory, DATASTORE_CATEGORIES } from '@/Shuffle-MCPs/datastore';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Skeleton,
  Button,
  Divider,
  Alert,
} from '@mui/material';
import { motion } from 'framer-motion';
import { isNoAuthRequired, type AppAuthentication } from '@/Shuffle-MCPs/components/AppAuthConfig';
import {
  appRequiresAuthentication,
  isNoAuthApp,
  getBuiltInAppMetadata,
  getBuiltInAppImage,
} from '@/Shuffle-MCPs/noAuthApps';
import type { AlgoliaSearchApp } from '@/Shuffle-MCPs/shuffle-mcp.helpers';
import { useAppAuth } from '@/Shuffle-MCPs/useAppAuth';
import { API_CONFIG, getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { fetchAppsViaApiConfig } from '@/Shuffle-MCPs/appsCache';
import { fetchAppConfig } from '@/Shuffle-MCPs/appConfigFetch';
import AppTitleHeader from '@/Shuffle-MCPs/components/AppTitleHeader';
import AppAuthSection from '@/Shuffle-MCPs/components/AppAuthSection';
import TryMcpSection from '@/Shuffle-MCPs/views/TryMcpSection';
import SingulActionsPreview from '@/Shuffle-MCPs/components/SingulActionsPreview';
import ApiCallViewer from '@/Shuffle-MCPs/components/ApiCallViewer';
import AppRelatedUsecases from '@/Shuffle-MCPs/components/AppRelatedUsecases';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkflows, fetchWorkflows, invalidateWorkflowsCache } from '@/hooks/useWorkflows';
import { isVulnScannerApp, normalizeAppName, extractWorkflowAppNames } from '@/Shuffle-MCPs/ingestionDetection';
import type { ShuffleHostProps } from '@/Shuffle-MCPs/host-props';

export interface AppInfo {
  name: string;
  description: string;
  large_image?: string;
  categories?: string[];
  actions?: unknown[];
  authentication?: AppAuthentication;
  algoliaId?: string;
  [key: string]: unknown;
}

export interface AppDetailContentProps extends ShuffleHostProps {
  /** Display mode */
  mode?: 'drawer' | 'page';
  /** Whether the parent container is open/mounted (used in drawer mode to defer network requests) */
  open?: boolean;
  /** App name to load */
  appName: string | null;
  /** Pre-resolved Algolia objectID (optional fast path) */
  appId?: string | null;
  /** Pre-resolved app icon/image (optional fast path from chip/picker) */
  appImage?: string | null;
  /** Callback to close the view (drawer mode) */
  onClose?: () => void;
  /** Callback when data is refreshed */
  onRefresh?: () => void;
  /** Action when adding to canvas (builder mode) */
  onAddToCanvas?: (app: { name: string; icon: string; algoliaId?: string | null }) => void;
  /** Whether the user is authenticated. In page mode, false enables guest locked sections */
  isAuthenticated?: boolean;
  /** Active organization ID for multi-tenant scoping */
  activeOrgId?: string | null;
  /** Automatically fire Activate action once app is loaded */
  autoActivate?: boolean;
  /** Show incident ingestion/forwarding stats */
  showIncidentStats?: boolean;
  /** Show quick info summary cards (Auth Type, Configurations, Status) */
  showQuickInfo?: boolean;
  /** Show the live MCP ApiCallViewer */
  showApiCallViewer?: boolean;
  /** When true and isAuthenticated is false, renders GuestLockedSection */
  allowGuestLocked?: boolean;
  /** Notifies parent when app info is resolved (useful for page SEO / usePageMeta) */
  onAppInfoLoaded?: (info: AppInfo | null) => void;
}

/** Collapsible markdown description */
export const CollapsibleDescription = ({ description }: { description: string }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <Box
      onClick={() => setExpanded(prev => !prev)}
      sx={{
        cursor: 'pointer',
        position: 'relative',
        ...(!expanded && {
          maxHeight: '5em',
          overflow: 'hidden',
          '&::after': {
            content: '""',
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 32,
            background: 'linear-gradient(transparent, hsl(var(--card)))',
            pointerEvents: 'none',
          },
        }),
        '& p': { fontSize: '0.78rem', lineHeight: 1.5, color: 'hsl(var(--muted-foreground))', m: 0, '&:not(:last-child)': { mb: 1 } },
        '& a': { color: 'hsl(var(--primary))', textDecoration: 'underline' },
        '& code': { fontSize: '0.7rem', fontFamily: "'JetBrains Mono', monospace", bgcolor: 'hsl(var(--muted))', px: 0.5, borderRadius: 0.5 },
        '& ul, & ol': { pl: 2, fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))' },
      }}
    >
      <ShuffleMarkdown>{description}</ShuffleMarkdown>
      {!expanded && (
        <Typography sx={{ fontSize: '0.68rem', color: 'hsl(var(--primary))', mt: 0.5, fontWeight: 500 }}>
          Show more…
        </Typography>
      )}
    </Box>
  );
};

/** Locked section placeholder for guests */
export const GuestLockedSection = ({ title, description, appname }: { title: string; description: string; appname: string }) => (
  <Box
    sx={{
      p: 4,
      borderRadius: 3,
      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%)',
      border: '1px solid hsl(var(--border))',
      textAlign: 'center',
    }}
  >
    <LockOutlinedIcon size={36} style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '16px', opacity: 0.5 }} />
    <Typography variant="h6" sx={{ color: 'hsl(var(--foreground))', fontWeight: 600, mb: 1 }}>
      {title}
    </Typography>
    <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', mb: 3, maxWidth: 400, mx: 'auto', lineHeight: 1.6 }}>
      {description}
    </Typography>
    <Button
      component={Link}
      to={`/register?app=${encodeURIComponent(appname)}`}
      variant="contained"
      endIcon={<ArrowForwardIcon size={16} />}
      sx={{
        px: 4,
        py: 1.25,
        borderRadius: 2,
        textTransform: 'none',
        fontWeight: 600,
        backgroundColor: '#FF6600',
        '&:hover': { backgroundColor: '#e55c00' },
      }}
    >
      Sign up to configure
    </Button>
  </Box>
);

/**
 * Compares a requested app name against a resolved app name to determine if they match,
 * close-match, or mismatch.
 */
export function checkAppNameMatch(
  requested?: string | null,
  resolved?: string | null
): {
  isMatch: boolean;
  isCloseMatch: boolean;
  mismatch: boolean;
} {
  if (!requested || !resolved) return { isMatch: true, isCloseMatch: true, mismatch: false };
  const norm = (s: string) => s.toLowerCase().trim().replace(/[\s_\-]+/g, '');
  const req = norm(requested);
  const res = norm(resolved);
  if (req === res) return { isMatch: true, isCloseMatch: true, mismatch: false };

  // Strip prefixes like "shuffle" or "shuffles"
  const stripPrefix = (s: string) => s.replace(/^shuffles?/, '');
  const reqCore = stripPrefix(req);
  const resCore = stripPrefix(res);

  if (reqCore && resCore) {
    if (reqCore === resCore) return { isMatch: true, isCloseMatch: true, mismatch: false };
    if (reqCore.includes(resCore) || resCore.includes(reqCore)) {
      return { isMatch: false, isCloseMatch: true, mismatch: false };
    }
  }

  return { isMatch: false, isCloseMatch: false, mismatch: true };
}

export default function AppDetailContent({
  mode = 'drawer',
  open = true,
  appName,
  appId,
  appImage,
  onClose,
  onRefresh,
  onAddToCanvas,
  isAuthenticated = true,
  activeOrgId,
  autoActivate = false,
  showIncidentStats = mode === 'drawer',
  showQuickInfo = mode === 'page',
  showApiCallViewer = mode === 'page',
  allowGuestLocked = false,
  onAppInfoLoaded,
  globalUrl,
  userdata,
  isLoaded,
  isLoggedIn,
  serverside,
  theme,
  colorMode,
}: AppDetailContentProps) {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [appLoading, setAppLoading] = useState(true);
  const [isActivated, setIsActivated] = useState<boolean | null>(null);
  const [activatedAppId, setActivatedAppId] = useState<string | null>(null);
  const [activateLoading, setActivateLoading] = useState(false);
  const [resolvedAlgoliaId, setResolvedAlgoliaId] = useState<string | null>(appId || null);
  const [authExpanded, setAuthExpanded] = useState(true);
  const lastValidAuthRef = useRef<boolean | null>(null);
  const lastNoAuthRequiredRef = useRef<boolean | null>(null);
  const [incidentStats, setIncidentStats] = useState<{ ingested: number; forwarded: number } | null>(null);
  const [appNotFound, setAppNotFound] = useState(false);
  const [isNameMismatch, setIsNameMismatch] = useState(false);
  const [configError, setConfigError] = useState<{ status: number; message: string } | null>(null);
  const queryClient = useQueryClient();
  const { data: workflows = [], refetch: refetchWorkflows } = useWorkflows();
  const [ingestLoading, setIngestLoading] = useState(false);

  const {
    authStates,
    authenticatedApps,
    loading: appAuthLoading,
    handleAuthChange,
    handleTestConnection,
    handleSaveAuth,
    refreshAuth,
  } = useAppAuth();

  // Notify parent of loaded info
  useEffect(() => {
    onAppInfoLoaded?.(appInfo);
  }, [appInfo, onAppInfoLoaded]);

  // Fetch app info and refresh auth when opened with a new app
  useEffect(() => {
    if (!open || !appName) return;
    setAppLoading(true);
    setAppInfo(null);
    setIsActivated(null);
    setAppNotFound(false);
    setConfigError(null);
    setResolvedAlgoliaId(appId || null);
    if (isAuthenticated) {
      refreshAuth();
    }

    const normalizedName = appName.toLowerCase().replace(/[\s_\-]+/g, '_');
    const searchName = appName.replace(/_/g, ' ');

    let cancelled = false;

    // Fast path: pre-resolved Algolia ID
    const configPromise = (API_CONFIG.apiKey && appId)
      ? fetchAppConfig(appId)
      : Promise.resolve(null);

    const algoliaPromise = (async () => {
      try {
        const { algoliasearch } = await import('algoliasearch');
        const client = algoliasearch('JNSS5CFDZZ', '33e4e3564f4f060e96e0531957bed552');
        let hits: any[] = [];
        try {
          const res = await (client as any).searchSingleIndex({
            indexName: 'appsearch',
            searchParams: { query: searchName, hitsPerPage: 10 },
          });
          hits = (res?.hits as any[]) || [];
        } catch {
          const res = await client.search({
            requests: [{ indexName: 'appsearch', query: searchName, hitsPerPage: 10 }],
          });
          hits = (res as any)?.results?.[0]?.hits || [];
        }
        const exact =
          (appId && hits.find((h: any) => h.objectID === appId)) ||
          hits.find((h: any) =>
            h.name?.toLowerCase().replace(/[\s_\-]+/g, '_') === normalizedName
          );
        if (exact) return { hit: exact, isFallback: false };

        const close = hits.find((h: any) => checkAppNameMatch(appName, h.name).isCloseMatch);
        if (close) return { hit: close, isFallback: false };

        return hits.length > 0 ? { hit: hits[0], isFallback: true } : null;
      } catch {
        return null;
      }
    })();

    const appsListPromise = API_CONFIG.apiKey
      ? fetchAppsViaApiConfig().catch(() => null)
      : Promise.resolve(null);

    (async () => {
      let algoliaId: string | null = appId || null;
      let foundMatch = false;

      const isBuiltIn = isNoAuthApp(appName);
      const builtInMeta = isBuiltIn ? getBuiltInAppMetadata(appName) : null;
      if (isBuiltIn) {
        foundMatch = true;
      }

      const configResult = await configPromise;
      if (cancelled) return;
      const configData = configResult?.ok ? configResult.data : null;
      if (configResult && !configResult.ok) {
        const status = configResult.status;
        const message =
          status === 401 ? 'You are not authorized to load this app configuration. Please sign in again.'
          : status === 403 ? 'You do not have permission to view this app configuration.'
          : status === 404 ? 'This app configuration was not found.'
          : status === 0 ? 'Could not reach the Shuffle API. Check your connection and try again.'
          : `Failed to load app configuration (HTTP ${status}).`;
        setConfigError({ status, message });
      }
      if (configData?.name) {
        foundMatch = true;
        const matchCheck = checkAppNameMatch(appName, configData.name);
        if (!isBuiltIn && matchCheck.mismatch) {
          setIsNameMismatch(true);
        }
        setAppInfo(prev => ({
          ...(prev || {}),
          ...configData,
          large_image: configData.large_image || prev?.large_image || '',
        }));
        setAppLoading(false);
      }

      const algoliaResult = await algoliaPromise;
      if (cancelled) return;
      const match = algoliaResult?.hit || null;
      const isFallback = Boolean(algoliaResult?.isFallback);
      if (match) {
        foundMatch = true;
        if (!algoliaId) {
          algoliaId = match.objectID;
          setResolvedAlgoliaId(match.objectID);
        }
        const matchCheck = checkAppNameMatch(appName, match.name);
        if (!isBuiltIn && (isFallback || matchCheck.mismatch)) {
          setIsNameMismatch(true);
        }
        setAppInfo(prev => ({
          name: prev?.name || match.name || searchName,
          description: prev?.description || match.description || '',
          large_image: prev?.large_image || match.image_url || '',
          categories: prev?.categories?.length ? prev.categories : (match.categories || []),
          actions: prev?.actions,
          authentication: prev?.authentication,
          algoliaId: algoliaId || match.objectID,
        }));
        setAppLoading(false);
      }

      const appsList = await appsListPromise;
      if (cancelled) return;

      if (!algoliaId && Array.isArray(appsList)) {
        const localMatch = appsList.find((a: any) =>
          (a.name || '').toLowerCase().replace(/[\s_\-]+/g, '_') === normalizedName
        );
        if (localMatch?.id) {
          foundMatch = true;
          algoliaId = localMatch.id;
          setResolvedAlgoliaId(localMatch.id);
          setAppInfo(prev => prev ?? {
            name: localMatch.name || searchName,
            description: localMatch.description || '',
            large_image: localMatch.large_image || '',
            categories: localMatch.categories || [],
            authentication: localMatch.authentication,
            algoliaId: localMatch.id,
          });
        }
      }

      if (API_CONFIG.apiKey && algoliaId && !configData) {
        const late = await fetchAppConfig(algoliaId);
        if (cancelled) return;
        if (late.ok && late.data?.name) {
          setAppInfo(prev => ({
            ...prev,
            ...late.data,
            large_image: late.data.large_image || prev?.large_image || '',
            algoliaId: algoliaId || prev?.algoliaId,
          }));
        } else if (!late.ok && !configError) {
          const status = late.status;
          const message =
            status === 401 ? 'You are not authorized to load this app configuration. Please sign in again.'
            : status === 403 ? 'You do not have permission to view this app configuration.'
            : status === 404 ? 'This app configuration was not found.'
            : status === 0 ? 'Could not reach the Shuffle API. Check your connection and try again.'
            : `Failed to load app configuration (HTTP ${status}).`;
          setConfigError({ status, message });
        }
      }

      if (cancelled) return;

      if (isBuiltIn) {
        setIsActivated(null);
        setActivatedAppId(null);
      } else if (Array.isArray(appsList)) {
        const activeMatch = appsList.find((a: any) =>
          (a.name || '').toLowerCase().replace(/[\s_\-]+/g, '_') === normalizedName && a.activated
        );
        setIsActivated(!!activeMatch);
        setActivatedAppId(activeMatch?.id || null);
      } else {
        setIsActivated(false);
      }

      setAppInfo(prev => {
        const next = prev ?? {
          name: builtInMeta?.displayName || searchName,
          description: builtInMeta?.description || '',
          large_image: builtInMeta?.image || appImage || '',
          categories: builtInMeta?.categories || ['Built-in'],
        };
        if (!isBuiltIn) {
          const finalCheck = checkAppNameMatch(appName, next.name);
          if (finalCheck.mismatch) {
            setIsNameMismatch(true);
          }
        }
        return {
          ...next,
          name: next.name || builtInMeta?.displayName || searchName,
          description: next.description || builtInMeta?.description || '',
          large_image: next.large_image || builtInMeta?.image || appImage || '',
          categories: next.categories?.length ? next.categories : (builtInMeta?.categories || ['Built-in']),
        };
      });

      if (isBuiltIn) {
        setIsNameMismatch(false);
        setAppNotFound(false);
      } else {
        setAppNotFound(!foundMatch);
      }
      setAppLoading(false);
    })();

    return () => { cancelled = true; };
  }, [open, appName, appId, isAuthenticated]);

  // Fetch incident stats
  useEffect(() => {
    if (!open || !appName || !isAuthenticated || !showIncidentStats) {
      setIncidentStats(null);
      return;
    }

    (async () => {
      try {
        const result = await getDatastoreByCategory(DATASTORE_CATEGORIES.INCIDENTS);
        if (!result.success || !result.data) {
          setIncidentStats({ ingested: 0, forwarded: 0 });
          return;
        }

        const normalizedAppName = appName.toLowerCase().replace(/[\s_\-]+/g, '');
        let ingested = 0;
        let forwarded = 0;

        for (const item of result.data) {
          try {
            const parsed = JSON.parse(item.value);
            const productName = (parsed.metadata?.product?.name || '').toLowerCase().replace(/[\s_\-]+/g, '');
            if (productName && productName === normalizedAppName) {
              ingested++;
            }
            const forwardDest = (parsed.metadata?.product?.forward_name || parsed.forward_target || '').toLowerCase().replace(/[\s_\-]+/g, '');
            if (forwardDest && forwardDest === normalizedAppName) {
              forwarded++;
            }
          } catch {}
        }

        setIncidentStats({ ingested, forwarded });
      } catch {
        setIncidentStats({ ingested: 0, forwarded: 0 });
      }
    })();
  }, [open, appName, isAuthenticated, showIncidentStats]);

  // Matching auth entries (matches by target Algolia ID or normalized name)
  const matchingEntries = useMemo(() => {
    if (!appName && !appInfo?.name) return [];
    if (!isAuthenticated) return [];
    const norm = (s: string) => (s || '').toLowerCase().trim().replace(/[\s_\-]+/g, '_');
    const targetNormName = norm(appInfo?.name || appName || '');
    const altNormName = norm(appName || '');
    const targetId = resolvedAlgoliaId || (appInfo as any)?.id || null;

    return authenticatedApps.filter(auth => {
      const authAppName = norm(auth.app?.name || '');
      const authAppId = auth.app?.id || auth.id;
      if (targetId && authAppId === targetId) return true;
      if (targetNormName && authAppName === targetNormName) return true;
      if (altNormName && authAppName === altNormName) return true;
      return false;
    });
  }, [appName, appInfo, isAuthenticated, authenticatedApps, resolvedAlgoliaId]);

  const isBuiltIn = isNoAuthApp(appInfo?.name || appName || '');

  const resolvedImage = useMemo(() => {
    if (appImage) return appImage;
    if (appInfo?.large_image) return appInfo.large_image;
    for (const entry of matchingEntries) {
      const img = (entry as any).app?.large_image || (entry as any).large_image;
      if (img) return img;
    }
    if (isBuiltIn) {
      return getBuiltInAppImage(appInfo?.name || appName) || '';
    }
    return '';
  }, [appImage, appInfo, matchingEntries, isBuiltIn, appName]);

  const displayName = useMemo(() => {
    if (isBuiltIn) {
      const meta = getBuiltInAppMetadata(appInfo?.name || appName);
      if (meta?.displayName) return meta.displayName;
    }
    return (appInfo?.name || appName || '').replace(/_/g, ' ');
  }, [isBuiltIn, appInfo?.name, appName]);

  const algoliaApp: AlgoliaSearchApp | null = useMemo(() => {
    if (!appName && !appInfo?.name) return null;
    return {
      objectID: resolvedAlgoliaId || (appInfo as any)?.id || appName || '',
      name: displayName,
      image_url: resolvedImage,
      description: appInfo?.description || '',
      categories: appInfo?.categories || [],
    } as AlgoliaSearchApp;
  }, [appName, appInfo, displayName, resolvedImage, resolvedAlgoliaId]);

  const authStateKey = appInfo?.name || appName || '';
  const authState = authStates[authStateKey] || authStates[appName || ''] || {
    systemId: authStateKey,
    status: 'pending' as const,
    credentials: {},
  };

  const skipAuthentication = !appRequiresAuthentication(appInfo?.name || appName || '');
  const hasValidAuth = matchingEntries.some(e => e.validation?.valid === true);
  const hasAnyAuth = matchingEntries.length > 0 && !skipAuthentication;
  const effectiveActivated = isBuiltIn
    ? null
    : isActivated === null
      ? (hasAnyAuth ? true : null)
      : (isActivated || hasAnyAuth);
  const authCount = matchingEntries.length;

  // Auto-collapse / expand auth card
  useEffect(() => {
    if (lastValidAuthRef.current === hasValidAuth) return;
    lastValidAuthRef.current = hasValidAuth;
    setAuthExpanded(!hasValidAuth);
  }, [hasValidAuth]);

  useEffect(() => {
    if (appLoading) return;
    const noAuth = isNoAuthRequired(appInfo?.authentication);
    if (lastNoAuthRequiredRef.current === noAuth) return;
    lastNoAuthRequiredRef.current = noAuth;
    if (noAuth) setAuthExpanded(false);
  }, [appLoading, appInfo?.authentication]);

  useEffect(() => {
    lastValidAuthRef.current = null;
    lastNoAuthRequiredRef.current = null;
  }, [appName]);

  // Activate / Deactivate handler
  const handleActivateToggle = async (opts?: { silent?: boolean }) => {
    if (!appName || activateLoading) return;
    const silent = !!opts?.silent;
    const wasActivated = isActivated;
    const prevAppId = activatedAppId;
    setIsActivated(!wasActivated);
    setActivateLoading(true);
    try {
      if (wasActivated && prevAppId) {
        const res = await fetch(getApiUrl(`/api/v1/apps/${prevAppId}/deactivate`), {
          method: 'POST', credentials: 'include', headers: { ...getAuthHeader() },
        });
        if (!res.ok) throw new Error('Deactivate failed');
        setActivatedAppId(null);
        if (!silent) toast.success(`${displayName} deactivated`);
      } else {
        const appIdToActivate = resolvedAlgoliaId || (appInfo as any)?.id;
        if (!appIdToActivate) throw new Error('App ID not resolved yet');
        const activateRes = await fetch(getApiUrl(`/api/v1/apps/${appIdToActivate}/activate`), {
          method: 'GET', credentials: 'include', headers: { ...getAuthHeader() },
        });
        if (!activateRes.ok) throw new Error(`Activate failed (${activateRes.status})`);
        setActivatedAppId(appIdToActivate);
        if (!silent) toast.success(`${displayName} activated`);
      }
    } catch (err: any) {
      console.error('[Activate] Error:', err);
      if (!silent) toast.error(err?.message || 'Activation failed');
      setIsActivated(wasActivated);
      setActivatedAppId(prevAppId);
    } finally {
      setActivateLoading(false);
    }
  };

  // Auto-activate logic
  const autoActivateFiredRef = useRef<string | null>(null);
  const [autoActivatePulse, setAutoActivatePulse] = useState(false);
  useEffect(() => {
    if (!open || !autoActivate || !appName || isBuiltIn) return;
    const key = `${appName}`;
    if (autoActivateFiredRef.current === key) return;
    if (isActivated !== false) return;
    if (!resolvedAlgoliaId) return;
    if (activateLoading) return;
    autoActivateFiredRef.current = key;
    setAutoActivatePulse(true);
    handleActivateToggle({ silent: true }).finally(() => {
      setTimeout(() => setAutoActivatePulse(false), 1200);
    });
  }, [open, autoActivate, appName, isActivated, resolvedAlgoliaId, activateLoading, isBuiltIn]);

  useEffect(() => {
    if (!open) {
      autoActivateFiredRef.current = null;
      setAutoActivatePulse(false);
    }
  }, [open, appName]);

  // Ingestion workflow calculation and toggle handler
  const isVuln = useMemo(() => isVulnScannerApp(appName || ''), [appName]);
  const targetWorkflowName = isVuln ? 'Ingest Vulnerabilities' : 'Ingest Tickets';
  const targetCategory = isVuln ? 'vulnerabilities' : 'cases';

  const ingestWorkflow = useMemo(() => {
    return workflows?.find(w => (w.name || '').toLowerCase() === targetWorkflowName.toLowerCase());
  }, [workflows, targetWorkflowName]);

  const isIngestEnabled = useMemo(() => {
    if (!appName || !ingestWorkflow) return false;
    const names = extractWorkflowAppNames(ingestWorkflow);
    return names.has(normalizeAppName(appName));
  }, [appName, ingestWorkflow]);

  const handleToggleIngest = async () => {
    if (!appName || ingestLoading) return;
    setIngestLoading(true);
    const willEnable = !isIngestEnabled;
    try {
      const canonicalName = appInfo?.name || appName;
      const normalizedTarget = normalizeAppName(canonicalName);

      const freshWfs = await fetchWorkflows(undefined, true);
      const currentIngestWf = freshWfs.find(w => (w.name || '').toLowerCase() === targetWorkflowName.toLowerCase());
      const existingNames = currentIngestWf ? Array.from(extractWorkflowAppNames(currentIngestWf)) : [];

      let nextAppNames: string[];
      if (willEnable) {
        const alreadyIn = existingNames.some(n => normalizeAppName(n) === normalizedTarget);
        nextAppNames = alreadyIn ? existingNames : [...existingNames, canonicalName];
      } else {
        nextAppNames = existingNames.filter(n => normalizeAppName(n) !== normalizedTarget);
      }

      const body: Record<string, string> = {
        label: targetWorkflowName,
        category: targetCategory,
      };

      if (nextAppNames.length > 0) {
        body.app_name = nextAppNames.join(',');
      } else {
        body.action_name = 'remove';
      }

      const resp = await fetch(getApiUrl('/api/v2/workflows/generate'), {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      let payload: any = null;
      try {
        payload = await resp.json();
      } catch {
        /* empty */
      }
      if (!resp.ok || (payload && payload.success === false)) {
        const reason = payload?.reason || `Failed to update ingestion sources (${resp.status})`;
        toast.error(reason);
        return;
      }

      invalidateWorkflowsCache();
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      await refetchWorkflows();

      if (willEnable) {
        if (!hasValidAuth) {
          toast.success(`Ingest enabled for ${displayName}`, {
            description: `Please configure authentication below so alerts from ${displayName} can be ingested.`,
          });
        } else {
          toast.success(`Ingest enabled for ${displayName}`);
        }
      } else {
        toast.success(`Ingest disabled for ${displayName}`);
      }

      window.dispatchEvent(new CustomEvent('integrations-changed'));

      if (willEnable) {
        try {
          const updatedWfs = await fetchWorkflows(undefined, true);
          const updatedIngest = updatedWfs.find(w => (w.name || '').toLowerCase() === targetWorkflowName.toLowerCase());
          if (updatedIngest?.id) {
            fetch(getApiUrl(`/api/v1/workflows/${updatedIngest.id}/execute`), {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
              body: JSON.stringify({ execution_source: 'manual', start: '' }),
            }).catch(() => {});
          }
        } catch {
          /* best effort */
        }
      }
    } catch (err: any) {
      console.error('[Ingest Toggle] Error:', err);
      toast.error(err?.message || 'Failed to update ingest');
    } finally {
      setIngestLoading(false);
    }
  };

  // UNIFIED AUTH TESTING & SAVING
  const handleTestConnectionUnified = useCallback((_appId: string, authId?: string) => {
    // Tests connection with canonical system identifier
    const targetSystemId = appInfo?.name || appName || _appId;
    return handleTestConnection(targetSystemId, authId);
  }, [handleTestConnection, appInfo?.name, appName]);

  const handleSaveAuthUnified = useCallback(async (targetAppId: string, creds: Record<string, string>) => {
    // targetAppId from AppAuthCard is app.objectID (the true catalog UUID!)
    // appName is the display/catalog name
    const canonicalAppId = targetAppId || resolvedAlgoliaId || (appInfo as any)?.id || appName || '';
    const canonicalAppName = appInfo?.name || appName || undefined;
    return handleSaveAuth(canonicalAppId, creds, canonicalAppName);
  }, [handleSaveAuth, resolvedAlgoliaId, appInfo, appName]);

  const isLoadingAll = appLoading || (isAuthenticated && appAuthLoading) || !appInfo?.name;

  // Resolved values for MCP and individual action execution
  const canonicalExecutionAppName = isNameMismatch ? displayName : (appInfo?.name || appName || '');
  const canonicalExecutionAppId = isNameMismatch
    ? (resolvedAlgoliaId || (appInfo as any)?.id || '')
    : (matchingEntries[0]?.app?.id || matchingEntries[0]?.id || resolvedAlgoliaId || (appInfo as any)?.id || appName || '');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: mode === 'drawer' ? '100%' : 'auto' }}>
      {/* Drawer Header Bar (only rendered in drawer mode) */}
      {mode === 'drawer' && (
        <Box
          sx={{
            px: 3,
            py: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            borderBottom: '1px solid hsl(var(--border))',
            flexShrink: 0,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ color: 'hsl(var(--foreground))', fontWeight: 700, fontSize: '1rem', lineHeight: 1.2, textTransform: 'capitalize' }}>
                {appLoading ? <Skeleton width={140} /> : displayName}
              </Typography>
              {!appLoading && isNameMismatch && (
                <Chip
                  size="small"
                  label="Mismatch"
                  sx={{
                    height: 20,
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    bgcolor: 'hsl(var(--severity-medium) / 0.15)',
                    color: 'hsl(var(--severity-medium))',
                    border: '1px solid hsl(var(--severity-medium) / 0.4)',
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
              )}
              {!appLoading && !isNameMismatch && typeof appInfo?.actions?.length === 'number' && appInfo.actions.length > 0 && (
                <Chip
                  size="small"
                  label={`${appInfo.actions.length} action${appInfo.actions.length === 1 ? '' : 's'}`}
                  sx={{
                    height: 20,
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    bgcolor: 'hsl(var(--primary) / 0.12)',
                    color: 'hsl(var(--primary))',
                    border: '1px solid hsl(var(--primary) / 0.3)',
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
              )}
            </Box>
            <Typography sx={{ color: (configError || (!isBuiltIn && isNameMismatch)) ? 'hsl(var(--severity-medium))' : 'hsl(var(--muted-foreground))', fontSize: '0.75rem' }}>
              {appLoading ? <Skeleton width={100} /> : (configError ? `Error ${configError.status || ''}`.trim() : (isBuiltIn ? 'Built-in app' : (isNameMismatch ? `Unavailable — showing closest catalog match (${displayName})` : (appNotFound ? 'App not found in catalog' : 'App configuration'))))}
            </Typography>
          </Box>
          {onClose && (
            <IconButton
              size="small"
              onClick={() => {
                onRefresh?.();
                onClose();
              }}
              sx={{ color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--foreground))' } }}
            >
              <CloseIcon size={16} />
            </IconButton>
          )}
        </Box>
      )}

      {/* Main Content Area */}
      <Box sx={{ flex: 1, ...(mode === 'drawer' ? { overflowY: 'auto', p: 3 } : { p: 0 }) }}>
        {isLoadingAll ? (
          <Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
              <Skeleton variant="rounded" width={56} height={56} sx={{ borderRadius: 2 }} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="60%" height={24} />
                <Box sx={{ display: 'flex', gap: 0.75, mt: 0.75 }}>
                  <Skeleton variant="rounded" width={64} height={18} />
                  <Skeleton variant="rounded" width={48} height={18} />
                </Box>
              </Box>
              <Skeleton variant="rounded" width={90} height={32} sx={{ borderRadius: 1 }} />
            </Box>

            <Skeleton width="100%" height={14} sx={{ mb: 0.5 }} />
            <Skeleton width="90%" height={14} sx={{ mb: 0.5 }} />
            <Skeleton width="70%" height={14} sx={{ mb: 3 }} />

            <Skeleton variant="rectangular" height={64} sx={{ borderRadius: 2, mb: 2 }} />

            <Skeleton width={160} height={20} sx={{ mb: 1.5 }} />
            <Box sx={{ display: 'flex', gap: 0.75, mb: 2, flexWrap: 'wrap' }}>
              {[92, 76, 108, 84, 96].map((w, i) => (
                <Skeleton key={i} variant="rounded" width={w} height={28} sx={{ borderRadius: 999 }} />
              ))}
            </Box>
            <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 2 }} />
          </Box>
        ) : (
          <>
            {configError && (
              <Box
                sx={{
                  mb: 2,
                  p: 1.5,
                  borderRadius: 2,
                  border: '1px solid hsl(var(--destructive) / 0.4)',
                  bgcolor: 'hsl(var(--destructive) / 0.08)',
                  display: 'flex',
                  gap: 1,
                  alignItems: 'flex-start',
                }}
              >
                <ErrorOutlineIcon size={16} style={{ color: 'hsl(var(--destructive))', marginTop: 2, flexShrink: 0 }} />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: 'hsl(var(--destructive))', fontSize: '0.78rem', fontWeight: 600 }}>
                    {configError.status === 401 ? 'Unauthorized' : configError.status === 403 ? 'Forbidden' : configError.status === 404 ? 'Not found' : 'Failed to load configuration'}
                  </Typography>
                  <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.72rem', mt: 0.25 }}>
                    {configError.message}
                  </Typography>
                </Box>
              </Box>
            )}

            {!isBuiltIn && isNameMismatch && (
              <Alert
                severity="warning"
                icon={<ErrorOutlineIcon size={18} style={{ color: 'hsl(var(--severity-medium))' }} />}
                sx={{
                  mb: 2.5,
                  borderRadius: 2,
                  border: '1px solid hsl(var(--severity-medium) / 0.4)',
                  bgcolor: 'hsl(var(--severity-medium) / 0.08)',
                  color: 'hsl(var(--foreground))',
                  '& .MuiAlert-message': { width: '100%' },
                }}
              >
                <Typography sx={{ fontWeight: 600, fontSize: '0.82rem', mb: 0.25, color: 'hsl(var(--foreground))' }}>
                  App Name Mismatch — Unavailable in Catalog
                </Typography>
                <Typography sx={{ fontSize: '0.76rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.45 }}>
                  You requested <strong>&ldquo;{(appName || '').replace(/_/g, ' ')}&rdquo;</strong>, but it is not available in the catalog. 
                  Showing the closest match <strong>&ldquo;{displayName}&rdquo;</strong>. Actions and authentication configured here will apply to <strong>{displayName}</strong>.
                </Typography>
              </Alert>
            )}

            {/* App Title Header */}
            <AppTitleHeader
              name={displayName}
              image={resolvedImage}
              hasValidAuth={hasValidAuth}
              hasAnyAuth={hasAnyAuth}
              isAuthenticated={isAuthenticated}
              categories={appInfo?.categories}
              isActivated={onAddToCanvas || isBuiltIn ? null : effectiveActivated}
              activateLoading={activateLoading}
              onActivateToggle={onAddToCanvas || isBuiltIn ? undefined : () => handleActivateToggle()}
              isIngestEnabled={isIngestEnabled}
              ingestLoading={ingestLoading}
              onIngestToggle={handleToggleIngest}
              highlightActivate={autoActivatePulse}
              onAdd={onAddToCanvas && appName ? () => {
                onAddToCanvas({ name: appName, icon: resolvedImage || '', algoliaId: resolvedAlgoliaId });
                onClose?.();
              } : undefined}
              onAuthClick={() => {
                setAuthExpanded(true);
                document.getElementById('app-auth-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
              globalUrl={globalUrl}
              userdata={userdata}
              isLoaded={isLoaded}
              isLoggedIn={isLoggedIn}
              serverside={serverside}
              theme={theme}
              colorMode={colorMode}
            />

            {/* Description (collapsible) */}
            {appInfo?.description && (
              <Box sx={{ mb: 3 }}>
                <CollapsibleDescription description={appInfo.description} />
              </Box>
            )}

            {/* Ingestion & Incident Stats */}
            {isAuthenticated && (isIngestEnabled || (incidentStats && incidentStats.ingested > 0)) && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.08 }}>
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  mb: 3,
                  p: 2,
                  borderRadius: 2,
                  border: isIngestEnabled ? '1px solid hsl(var(--severity-low) / 0.4)' : '1px solid hsl(var(--border))',
                  bgcolor: isIngestEnabled ? 'hsl(var(--severity-low) / 0.04)' : 'hsl(var(--muted) / 0.3)',
                  flexWrap: 'wrap',
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      size="small"
                      label={isIngestEnabled ? 'Ingest Active' : 'Ingest Inactive'}
                      sx={{
                        height: 20,
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        bgcolor: isIngestEnabled ? 'hsl(var(--severity-low) / 0.15)' : 'hsl(var(--muted))',
                        color: isIngestEnabled ? 'hsl(var(--severity-low))' : 'hsl(var(--muted-foreground))',
                        border: isIngestEnabled ? '1px solid hsl(var(--severity-low) / 0.3)' : '1px solid hsl(var(--border))',
                        borderRadius: 1,
                      }}
                    />
                    <Typography sx={{ fontSize: '0.74rem', color: 'hsl(var(--muted-foreground))' }}>
                      Target workflow: <strong>{targetWorkflowName}</strong>
                    </Typography>
                  </Box>

                  {incidentStats && incidentStats.ingested > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: { xs: 0, sm: 'auto' }, pl: { sm: 2 }, borderLeft: { sm: '1px solid hsl(var(--border))' } }}>
                      <Download size={14} style={{ color: 'hsl(var(--primary))' }} />
                      <Box>
                        <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: 'hsl(var(--foreground))', lineHeight: 1 }}>
                          {incidentStats.ingested}
                        </Typography>
                        <Typography sx={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>
                          Incidents ingested
                        </Typography>
                      </Box>
                    </Box>
                  )}

                  {incidentStats && incidentStats.forwarded > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 2, borderLeft: '1px solid hsl(var(--border))' }}>
                      <Forward size={14} style={{ color: 'hsl(var(--severity-low))' }} />
                      <Box>
                        <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: 'hsl(var(--foreground))', lineHeight: 1 }}>
                          {incidentStats.forwarded}
                        </Typography>
                        <Typography sx={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>
                          Forwarded
                        </Typography>
                      </Box>
                    </Box>
                  )}
                </Box>
              </motion.div>
            )}

            {/* Authentication Section */}
            {!skipAuthentication && (
              isAuthenticated ? (
                <Box id="app-auth-section">
                  <AppAuthSection
                    displayName={displayName}
                    algoliaApp={algoliaApp}
                    resolvedAlgoliaId={resolvedAlgoliaId || (appInfo as any)?.id}
                    authState={authState}
                    expanded={authExpanded}
                    onToggle={() => setAuthExpanded(prev => !prev)}
                    authCount={authCount}
                    isAuthenticated={isAuthenticated}
                    matchingEntries={matchingEntries}
                    onAuthChange={handleAuthChange}
                    onTestConnection={handleTestConnectionUnified}
                    onSaveAuth={handleSaveAuthUnified}
                    onRefreshAuth={refreshAuth}
                    globalUrl={globalUrl}
                    userdata={userdata}
                    isLoaded={isLoaded}
                    isLoggedIn={isLoggedIn}
                    serverside={serverside}
                    theme={theme}
                    colorMode={colorMode}
                  />
                </Box>
              ) : allowGuestLocked ? (
                <Box sx={{ mb: 4 }} id="app-auth-section">
                  <GuestLockedSection
                    title="Authentication Required"
                    description={`Sign up to connect your ${displayName} credentials and start automating workflows.`}
                    appname={appName || ''}
                  />
                </Box>
              ) : null
            )}

            {/* Related Usecases */}
            {appName && (
              <AppRelatedUsecases
                appName={appName}
                displayName={displayName}
                categories={appInfo?.categories}
                hasValidAuth={hasValidAuth}
                onNavigateToAuth={() => {
                  setAuthExpanded(true);
                  document.getElementById('app-auth-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
                mode={mode}
              />
            )}

            {/* MCP Chat + Individual Actions Testing */}
            {isAuthenticated ? (
              <>
                <TryMcpSection
                  appName={canonicalExecutionAppName}
                  appIcon={resolvedImage}
                  appId={canonicalExecutionAppId}
                  categories={appInfo?.categories}
                  globalUrl={globalUrl}
                  userdata={userdata}
                  isLoaded={isLoaded}
                  isLoggedIn={isLoggedIn}
                  serverside={serverside}
                  theme={theme}
                  colorMode={colorMode}
                />

                {showApiCallViewer && (
                  <Box sx={{ mb: 4 }}>
                    <ApiCallViewer
                      config={{
                        method: 'POST',
                        url: `${(API_CONFIG.baseUrl || '').replace(/\/+$/, '')}/api/v1/apps/${encodeURIComponent(canonicalExecutionAppName)}/mcp`,
                        headers: {
                          'Authorization': `Bearer ${API_CONFIG.apiKey || '<your-api-key>'}`,
                          ...(activeOrgId ? { 'Org-Id': activeOrgId } : {}),
                        },
                        body: {
                          jsonrpc: '2.0',
                          id: 'test-mcp-request',
                          method: 'tools/call',
                          params: {
                            tool_name: canonicalExecutionAppName,
                            tool_id: canonicalExecutionAppId,
                            input: { text: '<your-prompt>' },
                          },
                        },
                      }}
                      globalUrl={globalUrl}
                      userdata={userdata}
                      isLoaded={isLoaded}
                      isLoggedIn={isLoggedIn}
                      serverside={serverside}
                      theme={theme}
                      colorMode={colorMode}
                    />
                  </Box>
                )}

                <SingulActionsPreview
                  appName={canonicalExecutionAppName}
                  appIcon={resolvedImage}
                  categories={appInfo?.categories}
                  activeOrgId={activeOrgId || undefined}
                  globalUrl={globalUrl}
                  userdata={userdata}
                  isLoaded={isLoaded}
                  isLoggedIn={isLoggedIn}
                  serverside={serverside}
                  theme={theme}
                  colorMode={colorMode}
                />
              </>
            ) : allowGuestLocked ? (
              <Box sx={{ mb: 4 }}>
                <GuestLockedSection
                  title="AI-Powered Actions"
                  description={`Run automated actions with ${displayName} using natural language. Sign up to try it.`}
                  appname={appName || ''}
                />
              </Box>
            ) : null}

            {/* Quick Info Summary Cards (Page Mode) */}
            {showQuickInfo && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.25 }}
              >
                <Divider sx={{ borderColor: 'hsl(var(--border))', my: 3 }} />
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 200,
                      p: 2.5,
                      borderRadius: 2,
                      backgroundColor: 'hsl(var(--muted) / 0.5)',
                      border: '1px solid hsl(var(--border))',
                    }}
                  >
                    <Typography variant="overline" sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600, letterSpacing: 1 }}>
                      Auth Type
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'hsl(var(--foreground))', fontWeight: 500, mt: 0.5, textTransform: 'capitalize' }}>
                      {appInfo?.authentication?.type?.replace(/_/g, ' ') || 'API Key'}
                    </Typography>
                  </Box>

                  {isAuthenticated && (
                    <Box
                      sx={{
                        flex: 1,
                        minWidth: 200,
                        p: 2.5,
                        borderRadius: 2,
                        backgroundColor: 'hsl(var(--muted) / 0.5)',
                        border: '1px solid hsl(var(--border))',
                      }}
                    >
                      <Typography variant="overline" sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600, letterSpacing: 1 }}>
                        Configurations
                      </Typography>
                      <Typography variant="body1" sx={{ color: 'hsl(var(--foreground))', fontWeight: 500, mt: 0.5 }}>
                        {authCount} active
                      </Typography>
                    </Box>
                  )}

                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 200,
                      p: 2.5,
                      borderRadius: 2,
                      backgroundColor: hasValidAuth
                        ? 'hsla(142, 76%, 36%, 0.08)'
                        : 'hsl(var(--muted) / 0.5)',
                      border: '1px solid',
                      borderColor: hasValidAuth
                        ? 'hsla(142, 76%, 36%, 0.2)'
                        : 'hsl(var(--border))',
                    }}
                  >
                    <Typography variant="overline" sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600, letterSpacing: 1 }}>
                      Status
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{
                        color: hasValidAuth ? 'hsl(var(--severity-low))' : 'hsl(var(--muted-foreground))',
                        fontWeight: 500,
                        mt: 0.5,
                      }}
                    >
                      {isAuthenticated
                        ? hasValidAuth ? 'Connected' : hasAnyAuth ? 'Pending Validation' : 'Not Configured'
                        : 'Sign up to connect'}
                    </Typography>
                  </Box>
                </Box>
              </motion.div>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
