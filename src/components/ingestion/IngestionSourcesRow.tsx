import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Typography, IconButton, Tooltip, CircularProgress } from '@mui/material';
import { Plus as AddIcon, Play as PlayArrowIcon } from 'lucide-react';
import { toast } from '@/lib/toast';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { fetchAuthenticatedApps } from '@/Shuffle-MCPs/authenticatedApps';
import {
  extractValidatedIngestionApps,
  extractWorkflowAppNames,
  isWorkflowScheduleStopped,
  normalizeAppName,
  ValidatedIngestionApp,
} from '@/Shuffle-MCPs/ingestionDetection';
import { IngestionSourceButton } from '@/components/incidents/IngestionSourceButton';
import { WebhookIngestionButton, WebhookIngestionInfo } from '@/components/incidents/WebhookIngestionButton';
import { AppSearchDrawer } from '@/Shuffle-MCPs';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useWorkflowHealth } from '@/hooks/useWorkflowHealth';

interface IngestionSourcesRowProps {
  /** Workflow label used with /api/v2/workflows/generate.
   *  Also the exact `name` used to locate the workflow in /api/v1/workflows.
   *  Examples: 'Ingest Tickets', 'Ingest Vulnerabilities'. */
  workflowLabel: string;
  /** Category passed to /api/v2/workflows/generate.
   *  Examples: 'cases', 'vulnerabilities'. */
  category: string;
  /** Webhook workflow label used with /api/v2/workflows/generate to enable
   *  the push endpoint. Must be unique per feature so both webhooks can
   *  coexist server-side. Examples: 'Ingest Tickets_webhook',
   *  'Ingest Vulnerabilities_webhook'. */
  webhookLabel: string;
  /** Exact `name` of the webhook workflow in /api/v1/workflows once the
   *  backend has generated it. Examples: 'Ingestion Webhook',
   *  'Vulnerability Ingestion Webhook'. */
  webhookWorkflowName: string;
  /** Small chip label above the row (default: 'Ingest'). */
  title?: string;
  /** Tooltip shown on the chip title. */
  titleTooltip?: string;
  /** Copy shown in the "Add Ingestion Source" drawer subtitle. */
  addSubtitle?: string;
  /** Optional callback fired after the source list is refetched, so parents
   *  can react to enable/disable events (e.g. refresh a downstream list). */
  onSourcesChanged?: () => void;
  /** Optional silent Algolia query used to bias the app-search drawer to a
   *  set of categories (e.g. "asset management cloud iam" for the
   *  vulnerabilities page). Does not fill the visible search input. */
  searchPriorityQuery?: string;
  /** Optional extra content rendered inside the pill row, right after the
   *  webhook button (e.g. an "Add Host Monitor" CTA). */
  afterWebhook?: React.ReactNode;
}

/**
 * Reusable ingestion sources row extracted from IncidentsPage. Renders the
 * pill row (webhook button + source buttons + overflow + add + sync) that
 * lets users enable/disable which authenticated apps feed a given ingest
 * workflow. Powers both /incidents (label='Ingest Tickets', category='cases')
 * and /vulnerabilities (label='Ingest Vulnerabilities',
 * category='vulnerabilities').
 */
export const IngestionSourcesRow = ({
  workflowLabel,
  category,
  webhookLabel,
  webhookWorkflowName,
  title = 'Ingest',
  titleTooltip,
  addSubtitle,
  onSourcesChanged,
  searchPriorityQuery,
  afterWebhook,
}: IngestionSourcesRowProps) => {
  const { resolvedTheme } = useTheme();
  const { userInfo } = useAuth();
  const currentOrgId: string | undefined = (userInfo as any)?.active_org?.id;

  const [ingestionApps, setIngestionApps] = useState<ValidatedIngestionApp[]>([]);
  const [ingestionLoading, setIngestionLoading] = useState(true);
  const loadedOnceRef = useRef(false);
  const [ingestWorkflowId, setIngestWorkflowId] = useState<string | null>(null);
  const [scheduleStopped, setScheduleStopped] = useState(false);
  const [webhook, setWebhook] = useState<WebhookIngestionInfo>({ url: null, exists: false, enabled: false, workflowId: null });
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUpdatingApps, setIsUpdatingApps] = useState(false);
  const [appSearchOpen, setAppSearchOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { workflows: allWorkflows, getWorkflowHealth } = useWorkflowHealth();

  const parentWorkflow = allWorkflows.find(
    (w) => (w.name || '').toLowerCase() === workflowLabel.toLowerCase()
  );
  const webhookWorkflow = allWorkflows.find(
    (w) => (w.name || '').toLowerCase() === webhookWorkflowName.toLowerCase()
  );

  const parentHealth = parentWorkflow ? getWorkflowHealth(parentWorkflow) : null;
  const webhookHealth = webhookWorkflow ? getWorkflowHealth(webhookWorkflow) : null;

  const isWebhookBlocked = Boolean(webhook.enabled && webhookHealth?.hasProblem);
  const isParentBlocked = Boolean(parentHealth?.hasProblem);

  const pendingTogglesRef = useRef<Map<string, boolean>>(new Map());
  // Reactive mirror of pending toggles so the multi-select picker reflects
  // clicks instantly (the ref alone does not trigger a re-render).
  const [optimisticToggles, setOptimisticToggles] = useState<Record<string, boolean>>({});
  // Sources added from the picker that have no authentication yet — shown in
  // yellow (not validated) so auth can be completed later.
  const [pendingApps, setPendingApps] = useState<ValidatedIngestionApp[]>([]);
  // Latest selection made inside the picker; committed once the drawer closes.
  const drawerSelectionRef = useRef<string[] | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchIngestionApps = useCallback(async () => {
    if (!loadedOnceRef.current) setIngestionLoading(true);
    let loadFailed = false;
    try {

      const [authApps, workflowsResponse] = await Promise.all([
        fetchAuthenticatedApps(currentOrgId).catch(() => []),
        fetch(getApiUrl('/api/v1/workflows'), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        }).catch(() => null),
      ]);

      if (!Array.isArray(authApps)) return;

      // Connectivity loss: never overwrite what is already on screen with an
      // empty list, and allow the next attempt to load normally again.
      if (!workflowsResponse || !workflowsResponse.ok) {
        loadFailed = true;
        return;
      }


      let workflowAppNames: Set<string> | undefined;
      if (workflowsResponse.ok) {

        const workflows = await workflowsResponse.json();
        const workflowList = Array.isArray(workflows) ? workflows : (workflows.workflows || []);

        // Match the ingest workflow by exact name (== workflowLabel).
        const ingestWorkflow = workflowList.find((w: any) => w.name === workflowLabel) || null;
        if (ingestWorkflow) {
          const stopped = isWorkflowScheduleStopped(ingestWorkflow);
          setScheduleStopped(stopped);
          if (!stopped) workflowAppNames = extractWorkflowAppNames(ingestWorkflow);
          const wfOrgId = ingestWorkflow.org_id || ingestWorkflow.org || ingestWorkflow.execution_org;
          const ownedByActiveOrg = !wfOrgId || !currentOrgId || wfOrgId === currentOrgId;
          setIngestWorkflowId(ownedByActiveOrg ? ingestWorkflow.id : null);
        } else {
          setScheduleStopped(false);
          setIngestWorkflowId(null);
        }

        // Detect the webhook workflow for this feature.
        const webhookWorkflow = workflowList.find((w: any) => {
          const name = (w.name || '').toLowerCase().trim();
          const target = (webhookWorkflowName || '').toLowerCase().trim();
          if (name === target) return true;
          if (target.includes('vulnerab') && (name.includes('vulnerab') && name.includes('webhook'))) return true;
          if (target.includes('ingest') && target.includes('webhook') && (name.includes('ingest') && name.includes('webhook'))) return true;
          return false;
        });
        if (webhookWorkflow) {
          const trigger = (webhookWorkflow.triggers || []).find(
            (t: any) => t.trigger_type === 'WEBHOOK' || t.app_name === 'Webhook'
          );
          let webhookUrl: string | null = null;
          if (trigger) {
            const webhookId = trigger.id || trigger.trigger_id;
            if (webhookId) webhookUrl = getApiUrl(`/api/v1/hooks/webhook_${webhookId}`);
          }
          const triggerStopped = !trigger || (trigger.status || '').toLowerCase() === 'stopped';
          setWebhook({
            url: webhookUrl,
            exists: true,
            enabled: !triggerStopped,
            workflowId: webhookWorkflow.id,
          });
        } else {
          setWebhook({ url: null, exists: false, enabled: false, workflowId: null });
        }
      }

      const results = extractValidatedIngestionApps(authApps, workflowAppNames);
      // Backfill missing images the same way IncidentsPage does.
      try {
        const { backfillAppImages, deduplicateAuthApps } = await import('@/lib/utils');
        const deduped = deduplicateAuthApps(authApps.filter((a: any) => a.active || a.validation?.valid) as any);
        await backfillAppImages(deduped);
        const imgMap = new Map<string, string>();
        deduped.forEach((d: any) => { if (d.bestImage) imgMap.set(normalizeAppName(d.app.name), d.bestImage); });
        results.forEach(app => { if (!app.image) app.image = imgMap.get(normalizeAppName(app.name)) || ''; });
      } catch { /* image backfill is best-effort */ }

      setIngestionApps(results);
    } catch (error) {
      console.error('Failed to fetch ingestion apps:', error);
    } finally {
      setIngestionLoading(false);
      loadedOnceRef.current = true;
    }
  }, [workflowLabel, webhookWorkflowName, currentOrgId]);

  useEffect(() => {
    fetchIngestionApps();
    const handleIntegrationsChanged = () => {
      fetchIngestionApps();
    };
    window.addEventListener('integrations-changed', handleIntegrationsChanged);
    return () => {
      window.removeEventListener('integrations-changed', handleIntegrationsChanged);
    };
  }, [fetchIngestionApps]);

  const triggerSync = useCallback(async (overrideWorkflowId?: string) => {
    const wfId = overrideWorkflowId || ingestWorkflowId;
    if (!wfId || isSyncing) return;
    setIsSyncing(true);
    try {
      const resp = await fetch(getApiUrl(`/api/v1/workflows/${wfId}/execute`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ execution_source: 'manual', start: '' }),
      });
      if (resp.ok) {
        toast.success('Sync started');
        setTimeout(() => setIsSyncing(false), 8000);
      } else {
        let errorMsg = 'Failed to trigger sync';
        try { const err = await resp.json(); if (err?.reason) errorMsg = err.reason; } catch { /* ignore */ }
        toast.error(errorMsg);
        setIsSyncing(false);
      }
    } catch {
      toast.error('Failed to trigger sync');
      setIsSyncing(false);
    }
  }, [ingestWorkflowId, isSyncing]);

  const commitSources = useCallback(async (activeNames: string[]) => {
    setIsUpdatingApps(true);
    try {
      const body: Record<string, string> = { label: workflowLabel, category };
      if (activeNames.length > 0) body.app_name = activeNames.join(',');
      else body.action_name = 'remove';
      const resp = await fetch(getApiUrl('/api/v2/workflows/generate'), {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      let payload: any = null;
      try { payload = await resp.json(); } catch { /* ignore */ }
      if (!resp.ok || (payload && payload.success === false)) {
        const reason = payload?.reason || `Failed to update ingestion sources (${resp.status})`;
        toast.error(reason);
        await fetchIngestionApps();
        return;
      }
      toast.success('Ingestion sources updated');
      await fetchIngestionApps();
      onSourcesChanged?.();
      if (activeNames.length > 0) {
        try {
          const wfResp = await fetch(getApiUrl('/api/v1/workflows'), {
            credentials: 'include',
            headers: getAuthHeader(),
          });
          const wfs = await wfResp.json();
          const list = Array.isArray(wfs) ? wfs : (wfs.workflows || []);
          const ingestWf = list.find((w: any) => w.name === workflowLabel);
          if (ingestWf?.id) triggerSync(ingestWf.id);
        } catch { /* ignore */ }
      }
    } catch (error) {
      console.error('Failed to update ingestion sources:', error);
      toast.error('Failed to update ingestion sources');
      fetchIngestionApps();
    } finally {
      setIsUpdatingApps(false);
    }
  }, [fetchIngestionApps, workflowLabel, category, triggerSync, onSourcesChanged]);

  const handleToggleApp = useCallback((appName: string, enabled: boolean) => {
    pendingTogglesRef.current.set(appName, enabled);
    setIsUpdatingApps(true);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      const toggles = new Map(pendingTogglesRef.current);
      pendingTogglesRef.current.clear();
      const activeNames = [...ingestionApps, ...pendingApps]
        .filter(a => toggles.has(a.name) ? toggles.get(a.name) : a.enabled)
        .map(a => a.name);
      await commitSources(activeNames);
    }, 3000);
  }, [ingestionApps, pendingApps, commitSources]);


  const handleEnter = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(true);
  }, []);
  const handleLeave = useCallback(() => {
    hoverTimer.current = setTimeout(() => setHovered(false), 300);
  }, []);

  if (ingestionLoading) {
    return (
      <Box
        sx={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          bgcolor: 'hsl(var(--muted) / 0.4)',
          border: '1px solid hsl(var(--border))',
          borderRadius: 1.5,
          px: 0.75,
          py: 0.5,
          height: 38,
        }}
      >
        <Typography
          className="automation-section-title"
          sx={{
            position: 'absolute',
            top: -10,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '0.55rem',
            fontWeight: 600,
            color: 'hsl(var(--muted-foreground))',
            bgcolor: 'hsl(var(--muted))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 10,
            px: 1,
            py: 0.15,
            lineHeight: 1.3,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </Typography>
        <Box sx={{ width: 28, height: 28, borderRadius: 1, bgcolor: 'hsl(var(--muted) / 0.6)', animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
        <Box sx={{ width: 28, height: 28, borderRadius: 1, bgcolor: 'hsl(var(--muted) / 0.6)', animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite', animationDelay: '0.2s' }} />
        <Box sx={{ width: 28, height: 28, borderRadius: 1, bgcolor: 'hsl(var(--muted) / 0.6)', animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite', animationDelay: '0.4s' }} />
      </Box>
    );
  }

  const allApps = [
    ...ingestionApps,
    ...pendingApps.filter(p => !ingestionApps.some(a => normalizeAppName(a.name) === normalizeAppName(p.name))),
  ];
  const visibleApps = allApps.slice(0, 3);
  const overflowApps = allApps.slice(3);
  const incidentCountsBySource = new Map<string, number>(); // reserved — count not tracked here

  const hasEnabledApps = allApps.some(a => a.enabled);
  const hasIngestionProblem = isWebhookBlocked || (hasEnabledApps && isParentBlocked);

  return (
    <>
      <Box
        className={`ingest-row${hovered ? ' is-hovered' : ''}`}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        sx={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          bgcolor: 'hsl(var(--muted) / 0.4)',
          border: hasIngestionProblem
            ? '1px solid hsla(var(--destructive) / 0.5)'
            : '1px solid hsl(var(--border))',
          borderRadius: 1.5,
          px: 0.75,
          py: 0.5,
          '& .automation-overflow': {
            display: 'flex',
            alignItems: 'center',
            flexDirection: 'row-reverse',
            gap: 0.5,
            position: 'absolute',
            right: 'calc(100% - 6px)',
            top: -1,
            bottom: -1,
            opacity: 0,
            pl: 0.75,
            pr: 1.5,
            bgcolor: 'hsl(var(--muted))',
            borderRadius: '6px 0 0 6px',
            border: '1px solid hsl(var(--border))',
            borderRight: 'none',
            transition: 'opacity 0.3s ease',
            pointerEvents: 'none',
          },
          '& .automation-overflow-count': {
            maxWidth: 36,
            opacity: 1,
            overflow: 'hidden',
            transition: 'max-width 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease',
          },
          '&:hover .automation-overflow, &.is-hovered .automation-overflow': {
            opacity: 1,
            pointerEvents: 'auto',
            transitionDelay: '0.25s',
          },
          '&:hover, &.is-hovered': {
            borderRadius: '0 6px 6px 0',
          },
          '&:hover .automation-overflow-count, &.is-hovered .automation-overflow-count': {
            maxWidth: 0,
            opacity: 0,
          },
        }}
      >
        <Typography sx={{
          position: 'absolute',
          top: -10,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '0.55rem',
          fontWeight: 600,
          color: hasIngestionProblem ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))',
          bgcolor: hasIngestionProblem ? 'hsla(var(--destructive) / 0.12)' : 'hsl(var(--muted))',
          border: hasIngestionProblem ? '1px solid hsla(var(--destructive) / 0.5)' : '1px solid hsl(var(--border))',
          borderRadius: 10,
          px: 1,
          py: 0.15,
          lineHeight: 1.3,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
        }}>
          {hasIngestionProblem && (
            <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: 'hsl(var(--destructive))', flexShrink: 0 }} />
          )}
          {titleTooltip ? (
            <Tooltip title={hasIngestionProblem ? `${title} (Offline runtime location)` : titleTooltip} placement="top" arrow>
              <span style={{ cursor: 'help' }}>{title}</span>
            </Tooltip>
          ) : (
            <span>{title}</span>
          )}
        </Typography>

        <WebhookIngestionButton
          webhook={webhook}
          onToggled={fetchIngestionApps}
          workflowLabel={webhookLabel}
          isBlocked={isWebhookBlocked}
          health={webhookHealth}
        />

        {afterWebhook}

        {visibleApps.map(app => (
          <IngestionSourceButton
            key={app.name}
            app={app}
            onToggle={handleToggleApp}
            incidentCount={incidentCountsBySource.get(normalizeAppName(app.name)) || 0}
            isBlocked={Boolean(app.enabled && isParentBlocked)}
            health={parentHealth}
          />
        ))}

        {overflowApps.length > 0 && (
          <>
            <Typography className="automation-overflow-count" sx={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))', fontWeight: 600, px: 0.25 }}>
              +{overflowApps.length}
            </Typography>
            <Box className="automation-overflow" sx={{ px: 0.75, py: 0.5 }}>
              {overflowApps.map(app => (
                <IngestionSourceButton
                  key={app.name}
                  app={app}
                  onToggle={handleToggleApp}
                  incidentCount={incidentCountsBySource.get(normalizeAppName(app.name)) || 0}
                  isBlocked={Boolean(app.enabled && isParentBlocked)}
                  health={parentHealth}
                />
              ))}
            </Box>
          </>
        )}

        <Tooltip title="Add ingestion source">
          <IconButton
            onClick={() => setAppSearchOpen(true)}
            size="small"
            sx={{
              width: 28,
              height: 28,
              color: 'hsl(var(--muted-foreground))',
              border: '1px dashed hsl(var(--border))',
              borderRadius: 1,
              '&:hover': {
                bgcolor: 'hsl(var(--muted))',
                borderStyle: 'solid',
                color: 'hsl(var(--primary))',
              },
            }}
          >
            <AddIcon size={16} />
          </IconButton>
        </Tooltip>

        {ingestWorkflowId && (
          <Tooltip title={isUpdatingApps ? 'Updating sources…' : isSyncing ? 'Syncing…' : 'Sync now'}>
            <span>
              <IconButton
                size="small"
                disabled={isSyncing || isUpdatingApps}
                onClick={() => triggerSync()}
                sx={{
                  width: 28,
                  height: 28,
                  color: isSyncing ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 1,
                  '&:hover': {
                    bgcolor: 'hsl(var(--muted))',
                    color: 'hsl(var(--primary))',
                  },
                }}
              >
                {(isSyncing || isUpdatingApps) ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon size={16} />}
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>

      {scheduleStopped && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'hsl(var(--severity-medium))' }}>
          Automatic ingestion is paused — the "{workflowLabel}" workflow schedule has been stopped. Sources are shown as disabled until the schedule is re-enabled.
        </Typography>
      )}

      <AppSearchDrawer
        theme={resolvedTheme}
        open={appSearchOpen}
        onClose={() => {
          setAppSearchOpen(false);
          const names = drawerSelectionRef.current;
          drawerSelectionRef.current = null;
          setOptimisticToggles({});
          if (names) {
            // Generate/update the ingest workflow once, right after closing.
            commitSources(names);
          } else {
            fetchIngestionApps();
          }
        }}
        title="Add Ingestion Source"
        subtitle={addSubtitle ?? 'Search and select tools to ingest from'}
        initialFilterQuery={searchPriorityQuery}
        hideAuthStatus
        multiSelect
        selectedApps={allApps
          .filter(a => (a.name in optimisticToggles ? optimisticToggles[a.name] : a.enabled))
          .map(a => ({ name: a.name, icon: a.image || '' }))}
        onSelectionChange={(next: Array<{ name: string; id: string | null; icon: string; categories: string[] }>) => {
          const chosen = new Set(next.map(a => normalizeAppName(a.name)));

          // Any picked app we do not know yet becomes a pending (unauthenticated)
          // source — added right away and rendered yellow in the Ingest row.
          const newcomers = next.filter(
            (n: Array<{ name: string; id: string | null; icon: string; categories: string[] }>[number]) => !allApps.some((a: ValidatedIngestionApp) => normalizeAppName(a.name) === normalizeAppName(n.name))
          );
          if (newcomers.length) {
            setPendingApps(prev => [
              ...prev,
              ...newcomers.map(n => ({
                id: n.id || n.name,
                name: n.name,
                image: n.icon || '',
                validated: false,
                enabled: true,
                category,
              } as ValidatedIngestionApp)),
            ]);
          }

          const updates: Record<string, boolean> = {};
          allApps.forEach((a: ValidatedIngestionApp) => {
            const current = a.name in optimisticToggles ? optimisticToggles[a.name] : a.enabled;
            const desired = chosen.has(normalizeAppName(a.name));
            if (desired !== current) updates[a.name] = desired;
          });
          if (Object.keys(updates).length) setOptimisticToggles(prev => ({ ...prev, ...updates }));

          // Defer the workflow generation until the drawer is closed.
          const activeNames = [
            ...allApps.filter((a: ValidatedIngestionApp) => chosen.has(normalizeAppName(a.name))).map((a: ValidatedIngestionApp) => a.name),
            ...newcomers.map((n: Array<{ name: string; id: string | null; icon: string; categories: string[] }>[number]) => n.name),
          ];
          drawerSelectionRef.current = Array.from(new Set(activeNames));
        }}
      />


    </>
  );
};

export default IngestionSourcesRow;
