/**
 * AppRelatedUsecases — Displays the usecases from /usecases that the app
 * belongs to, with direct 1-click enable actions and links to the full flow.
 *
 * Adheres strictly to Shuffle branding standards:
 * - Plain-text engineering typography
 * - Crisp borders and structured data cards
 * - ABSOLUTE PROHIBITION on emojis and decorative icons
 * - Sizing harmony matching existing button standards
 */

import React, { useState, useMemo } from 'react';
import { Box, Typography, Button, Chip, Card, Tooltip, CircularProgress } from '@mui/material';
import { toast } from 'sonner';
import { useNavigate } from '@/lib/router-compat';
import { useWorkflows, invalidateWorkflowsCache } from '@/hooks/useWorkflows';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import {
  DEFAULT_USECASES,
  Usecase,
  categoryLabel,
  slugify,
  findRelatedUsecasesForApp,
  findWorkflowsForUsecase,
} from '@/Shuffle-Core/config/usecases';
import { extractWorkflowAppNames, normalizeAppName } from '@/Shuffle-MCPs/ingestionDetection';
import { useQueryClient } from '@tanstack/react-query';
import { UsecaseDrawer } from '@/Shuffle-Core/views/Usecases';

export interface AppRelatedUsecasesProps {
  appName: string;
  displayName: string;
  categories?: string[];
  hasValidAuth?: boolean;
  onNavigateToAuth?: () => void;
  mode?: 'drawer' | 'page';
}

export default function AppRelatedUsecases({
  appName,
  displayName,
  categories = [],
  hasValidAuth = false,
  onNavigateToAuth,
  mode = 'drawer',
}: AppRelatedUsecasesProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: workflows = [], refetch: refetchWorkflows } = useWorkflows();
  const [drawerFlowId, setDrawerFlowId] = useState<string | null>(null);
  const [togglingFlowId, setTogglingFlowId] = useState<string | null>(null);
  const [hoveredFlowId, setHoveredFlowId] = useState<string | null>(null);
  const [optimisticToggles, setOptimisticToggles] = useState<Record<string, boolean>>({});

  // Correlate app with usecases
  const relatedUsecases = useMemo(() => {
    return findRelatedUsecasesForApp(appName, categories, DEFAULT_USECASES);
  }, [appName, categories]);

  // Determine enabled status for a given usecase
  const isUsecaseActive = (flow: Usecase): boolean => {
    if (optimisticToggles[flow.id] !== undefined) {
      return optimisticToggles[flow.id];
    }

    if (!flow.automationLabel) {
      // General flows without automation labels are informational or custom actions
      return false;
    }

    const matchedWfs = findWorkflowsForUsecase(flow, workflows);
    if (!matchedWfs || matchedWfs.length === 0) return false;

    // For ingestion usecases (Ingest Tickets / Ingest Vulnerabilities), check if THIS app is wired in
    if (flow.automationArea === 'automatic_ingestion' || flow.target === 'case_management') {
      const normalizedCurrent = normalizeAppName(appName);
      return matchedWfs.some(wf => {
        const appNames = extractWorkflowAppNames(wf);
        return appNames.has(normalizedCurrent);
      });
    }

    return true;
  };

  const handleToggleUsecase = async (e: React.MouseEvent, flow: Usecase) => {
    e.stopPropagation();
    if (!flow.automationLabel || togglingFlowId) return;

    const currentlyActive = isUsecaseActive(flow);
    const willEnable = !currentlyActive;

    // If app requires authentication and has none, advise the user
    if (willEnable && !hasValidAuth) {
      toast.info(`Authentication recommended for ${displayName}`, {
        description: `Configure credentials in the Authentication section below so ${displayName} can process data for "${flow.label}".`,
      });
    }

    setTogglingFlowId(flow.id);
    setOptimisticToggles(prev => ({ ...prev, [flow.id]: willEnable }));

    try {
      const requestBody: Record<string, string> = {
        label: flow.automationLabel,
      };
      if (flow.automationCategory) {
        requestBody.category = flow.automationCategory;
      }

      if (willEnable) {
        // Find existing apps in matching workflow to append
        const matchedWfs = findWorkflowsForUsecase(flow, workflows);
        const existingNames = new Set<string>();
        for (const wf of matchedWfs) {
          for (const name of extractWorkflowAppNames(wf)) {
            existingNames.add(name);
          }
        }
        existingNames.add(appName);
        requestBody.app_name = Array.from(existingNames).join(',');
      } else {
        // Disabling: remove this app from the workflow or remove workflow
        const matchedWfs = findWorkflowsForUsecase(flow, workflows);
        const remainingNames: string[] = [];
        const normalizedCurrent = normalizeAppName(appName);

        for (const wf of matchedWfs) {
          for (const name of extractWorkflowAppNames(wf)) {
            if (normalizeAppName(name) !== normalizedCurrent) {
              remainingNames.push(name);
            }
          }
        }

        if (remainingNames.length > 0) {
          requestBody.app_name = remainingNames.join(',');
        } else {
          requestBody.action_name = 'remove';
        }
      }

      const res = await fetch(getApiUrl('/api/v2/workflows/generate'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      let resData: any = null;
      try {
        resData = await res.json();
      } catch {
        /* empty */
      }

      if (!res.ok || resData?.success === false) {
        const errorReason = resData?.reason || `Failed to update usecase (${res.status})`;
        throw new Error(errorReason);
      }

      invalidateWorkflowsCache();
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      await refetchWorkflows();

      toast.success(willEnable ? `Enabled ${flow.label} for ${displayName}` : `Disabled ${flow.label}`);
      window.dispatchEvent(new CustomEvent('integrations-changed'));

      // If enabling an ingestion flow, trigger sync
      if (willEnable && (flow.automationArea === 'automatic_ingestion' || flow.target === 'case_management')) {
        try {
          const freshWfs = (await queryClient.fetchQuery({
            queryKey: ['workflows', 'active'],
          })) as any[];
          const targetWf = freshWfs?.find(w => (w.name || '').toLowerCase() === flow.automationLabel?.toLowerCase());
          if (targetWf?.id) {
            fetch(getApiUrl(`/api/v1/workflows/${targetWf.id}/execute`), {
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
      console.error('Failed to toggle usecase:', err);
      setOptimisticToggles(prev => ({ ...prev, [flow.id]: currentlyActive }));
      toast.error(err?.message || `Failed to ${willEnable ? 'enable' : 'disable'} ${flow.label}`);
    } finally {
      setTogglingFlowId(null);
    }
  };

  const handleOpenUsecase = (flow: Usecase) => {
    setDrawerFlowId(flow.id);
  };

  if (relatedUsecases.length === 0) {
    return null;
  }

  return (
    <Box sx={{ mb: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'hsl(var(--foreground))' }}>
            Related Usecases
          </Typography>
          <Button
            size="small"
            variant="text"
            onClick={() => navigate('/usecases')}
            sx={{
              textTransform: 'none',
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'hsl(var(--primary))',
              p: 0,
              minHeight: 0,
              '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
            }}
          >
            Browse all /usecases
          </Button>
        </Box>
        <Typography sx={{ fontSize: '0.76rem', color: 'hsl(var(--muted-foreground))', mt: 0.25 }}>
          Pre-built automations and pipelines that {displayName} connects to across Shuffle Security. Click any card to open its configuration sidebar.
        </Typography>
      </Box>

      {/* Grid of usecase cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: mode === 'page' ? { xs: '1fr', md: '1fr 1fr' } : '1fr',
          gap: 1.5,
        }}
      >
        {relatedUsecases.map(flow => {
          const active = isUsecaseActive(flow);
          const isToggling = togglingFlowId === flow.id;
          const isHovered = hoveredFlowId === flow.id;
          const sourceLabel = categoryLabel(flow.source) || flow.source;
          const targetLabel = categoryLabel(flow.target) || flow.target;

          return (
            <Card
              key={flow.id}
              variant="outlined"
              onClick={() => handleOpenUsecase(flow)}
              sx={{
                p: 2,
                borderRadius: 2,
                cursor: 'pointer',
                bgcolor: active ? 'hsl(var(--severity-low) / 0.04)' : 'hsl(var(--card))',
                borderColor: active ? 'hsl(var(--severity-low) / 0.4)' : 'hsl(var(--border))',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'border-color 0.15s, background-color 0.15s, box-shadow 0.15s',
                '&:hover': {
                  borderColor: 'hsl(var(--primary) / 0.5)',
                  boxShadow: '0 2px 8px hsl(var(--primary) / 0.08)',
                },
              }}
            >
              <Box>
                {/* Meta row: Phase + Direction */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                    <Chip
                      size="small"
                      label={`Phase ${flow.phase}: ${String(flow.phase) === '1' ? 'Ingest' : String(flow.phase) === '2' ? 'Correlation' : 'Response'}`}
                      sx={{
                        height: 20,
                        fontSize: '0.64rem',
                        fontWeight: 600,
                        bgcolor: 'hsl(var(--muted))',
                        color: 'hsl(var(--muted-foreground))',
                        borderRadius: 1,
                      }}
                    />
                    <Chip
                      size="small"
                      label={`${sourceLabel} -> ${targetLabel}`}
                      sx={{
                        height: 20,
                        fontSize: '0.64rem',
                        fontWeight: 500,
                        bgcolor: 'hsl(var(--muted) / 0.6)',
                        color: 'hsl(var(--foreground))',
                        borderRadius: 1,
                      }}
                    />
                  </Box>

                  {/* Status chip */}
                  <Chip
                    size="small"
                    label={active ? 'Enabled' : 'Inactive'}
                    sx={{
                      height: 20,
                      fontSize: '0.64rem',
                      fontWeight: 600,
                      bgcolor: active ? 'hsl(var(--severity-low) / 0.15)' : 'hsl(var(--muted))',
                      color: active ? 'hsl(var(--severity-low))' : 'hsl(var(--muted-foreground))',
                      border: active ? '1px solid hsl(var(--severity-low) / 0.3)' : '1px solid hsl(var(--border))',
                      borderRadius: 1,
                    }}
                  />
                </Box>

                {/* Usecase Title */}
                <Typography sx={{ fontWeight: 600, fontSize: '0.84rem', color: 'hsl(var(--foreground))', mb: 0.5 }}>
                  {flow.label}
                </Typography>

                {/* Usecase Description */}
                <Typography
                  sx={{
                    fontSize: '0.74rem',
                    color: 'hsl(var(--muted-foreground))',
                    lineHeight: 1.45,
                    mb: 2,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {flow.agenticDescription || flow.description}
                </Typography>
              </Box>

              {/* Action row */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1, borderTop: '1px solid hsl(var(--border) / 0.5)' }}>
                <Button
                  size="small"
                  variant="text"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenUsecase(flow);
                  }}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.72rem',
                    color: 'hsl(var(--muted-foreground))',
                    p: 0.5,
                    minHeight: 0,
                    '&:hover': { color: 'hsl(var(--primary))', bgcolor: 'transparent' },
                  }}
                >
                  Configure flow
                </Button>

                {/* Enable / Configure button */}
                {flow.automationLabel ? (
                  <Tooltip
                    title={
                      active
                        ? `Click to disable ${flow.label}`
                        : `Enable ${flow.label} with ${displayName}`
                    }
                  >
                    <span>
                      <Button
                        size="small"
                        disabled={isToggling}
                        onClick={e => handleToggleUsecase(e, flow)}
                        onMouseEnter={() => setHoveredFlowId(flow.id)}
                        onMouseLeave={() => setHoveredFlowId(null)}
                        variant={active ? 'contained' : 'outlined'}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 600,
                          fontSize: '0.72rem',
                          borderRadius: 2,
                          px: 1.5,
                          py: 0.5,
                          minHeight: 0,
                          ...(active
                            ? {
                                bgcolor: isHovered ? 'hsl(var(--destructive))' : 'hsl(var(--severity-low))',
                                color: 'white',
                                '&:hover': {
                                  bgcolor: 'hsl(var(--destructive))',
                                },
                              }
                            : {
                                color: 'hsl(var(--primary))',
                                borderColor: 'hsl(var(--primary) / 0.5)',
                                '&:hover': {
                                  borderColor: 'hsl(var(--primary))',
                                  bgcolor: 'hsl(var(--primary) / 0.08)',
                                },
                              }),
                        }}
                      >
                        {isToggling ? (
                          <CircularProgress size={12} color="inherit" />
                        ) : active ? (
                          isHovered ? 'Disable' : 'Enabled'
                        ) : (
                          'Enable'
                        )}
                      </Button>
                    </span>
                  </Tooltip>
                ) : flow.customAction ? (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      if (flow.customAction?.href) {
                        navigate(flow.customAction.href);
                      }
                    }}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 600,
                      fontSize: '0.72rem',
                      borderRadius: 2,
                      px: 1.5,
                      py: 0.5,
                      minHeight: 0,
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--foreground))',
                      '&:hover': {
                        borderColor: 'hsl(var(--primary))',
                        color: 'hsl(var(--primary))',
                        bgcolor: 'hsl(var(--primary) / 0.08)',
                      },
                    }}
                  >
                    {flow.customAction.label || 'Configure'}
                  </Button>
                ) : null}
              </Box>
            </Card>
          );
        })}
      </Box>

      {/* Standalone usecase detail drawer — identical to clicking a usecase on /usecases */}
      <UsecaseDrawer
        open={Boolean(drawerFlowId)}
        onClose={() => setDrawerFlowId(null)}
        flowId={drawerFlowId}
        workflows={workflows}
        onToggled={() => {
          queryClient.invalidateQueries({ queryKey: ['workflows'] });
          window.dispatchEvent(new CustomEvent('integrations-changed'));
        }}
      />
    </Box>
  );
}
