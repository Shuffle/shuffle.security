/**
 * AppRelatedUsecases — Displays the usecases from /usecases that the app
 * belongs to, using the exact same canonical UsecaseCard, validation logic,
 * and drawer handoff as the /usecases page.
 *
 * Adheres strictly to Shuffle branding standards:
 * - Plain-text engineering typography
 * - Crisp borders and structured data cards
 * - ABSOLUTE PROHIBITION on emojis and decorative icons
 * - Unified action buttons and sizing harmony
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from '@/lib/router-compat';
import { useWorkflows } from '@/hooks/useWorkflows';
import { useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_USECASES,
  findRelatedUsecasesForApp,
  isUsecaseVisible,
  matchAppToCategoryList,
} from '@/Shuffle-Core/config/usecases';
import {
  UsecaseCard,
  UsecaseDrawer,
  computeEnabledLabels,
  isUsecaseFlowEnabled,
  setPendingAutoEnableFlow,
  useUsecasesLite,
} from '@/Shuffle-Core/views/Usecases';
import {
  getCachedValidatedCategories,
  setCachedValidatedCategories,
  getCachedValidatedAppNames,
  setCachedValidatedAppNames,
  fetchAppsCached,
} from '@/Shuffle-Core/views/appsFetchCache';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { normalizeAppName } from '@/Shuffle-MCPs/ingestionDetection';

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
  onNavigateToAuth: _onNavigateToAuth,
  mode = 'drawer',
}: AppRelatedUsecasesProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: workflows = [], refetch: refetchWorkflows } = useWorkflows();
  const [drawerFlowId, setDrawerFlowId] = useState<string | null>(null);

  // Authenticated state and validated categories cache matching /usecases
  const [validatedCategories, setValidatedCategories] = useState<Set<string>>(
    () => getCachedValidatedCategories() || new Set()
  );
  const [validatedAppNames, setValidatedAppNames] = useState<Set<string>>(
    () => getCachedValidatedAppNames() || new Set()
  );

  useEffect(() => {
    let cancelled = false;
    const fetchValidatedCats = async () => {
      try {
        const res = await fetchAppsCached(getApiUrl('/api/v1/apps/authentication'), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) return;
        const body = await res.json();
        const list = Array.isArray(body) ? body : (body?.data || []);
        const cats = new Set<string>();
        const appNames = new Set<string>();
        for (const entry of Array.isArray(list) ? list : []) {
          if (entry?.validation?.valid !== true) continue;
          const app = entry?.app;
          if (!app?.name) continue;
          appNames.add(normalizeAppName(app.name));
          for (const categoryId of matchAppToCategoryList(app.name, app.categories || [])) {
            cats.add(categoryId);
          }
        }
        if (!cancelled) {
          setCachedValidatedCategories(cats);
          setCachedValidatedAppNames(appNames);
          setValidatedCategories(cats);
          setValidatedAppNames(appNames);
        }
      } catch {
        /* keep previous */
      }
    };

    const cached = getCachedValidatedCategories();
    const cachedNames = getCachedValidatedAppNames();
    if (!cached || cached.size === 0 || !cachedNames) {
      fetchValidatedCats();
    }

    const handleInvalidate = () => {
      fetchValidatedCats();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('shuffle-apps-invalidated', handleInvalidate);
    }
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('shuffle-apps-invalidated', handleInvalidate);
      }
    };
  }, []);

  const { usecases } = useUsecasesLite();

  // Set of automation labels that currently have an active workflow
  const enabledLabels = useMemo(() => {
    return computeEnabledLabels(workflows, usecases);
  }, [workflows, usecases]);

  // Correlate app with usecases (strictly excludes hidden usecases, same as /usecases)
  const relatedUsecases = useMemo(() => {
    return findRelatedUsecasesForApp(appName, categories, usecases);
  }, [appName, categories, usecases]);

  if (relatedUsecases.length === 0) {
    return null;
  }

  const handleWorkflowsChanged = () => {
    queryClient.invalidateQueries({ queryKey: ['workflows'] });
    window.dispatchEvent(new CustomEvent('integrations-changed'));
    refetchWorkflows();
  };

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

      {/* Grid of usecase cards - exact canonical UsecaseCard from /usecases */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: mode === 'page'
            ? { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }
            : '1fr',
          gap: 1.5,
        }}
      >
        {relatedUsecases.map((flow) => {
          if (!isUsecaseVisible(flow)) return null;
          const isEnabled = isUsecaseFlowEnabled(
            flow,
            workflows,
            enabledLabels,
            validatedCategories,
            validatedAppNames
          );
          const hasValidatedSource = validatedCategories.has(flow.source);

          return (
            <UsecaseCard
              key={flow.id}
              flow={flow}
              apiLoaded={true}
              isEnabled={isEnabled}
              canToggle={Boolean(flow.automationLabel)}
              isAuthenticated={hasValidAuth}
              hasValidatedSource={hasValidatedSource}
              workflows={workflows}
              onToggled={handleWorkflowsChanged}
              onClick={() => setDrawerFlowId(flow.id)}
              onEnable={() => {
                setPendingAutoEnableFlow(flow.id);
                setDrawerFlowId(flow.id);
              }}
            />
          );
        })}
      </Box>

      {/* Standalone usecase detail drawer — identical to clicking a usecase on /usecases */}
      <UsecaseDrawer
        open={Boolean(drawerFlowId)}
        onClose={() => setDrawerFlowId(null)}
        flowId={drawerFlowId}
        workflows={workflows}
        onToggled={handleWorkflowsChanged}
      />
    </Box>
  );
}
