/**
 * AskAiDrawer — Context-aware wrapper around AgentRunDrawer.
 *
 * Automatically inspects the current URL/route, resolves the matching MCP apps and
 * agent skills/presets, and persists user customizations per page.
 *
 * Self-contained: No host-app `@/` imports.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import AgentRunDrawer, { AgentRunDrawerProps } from '@/Shuffle-MCPs/components/AgentRunDrawer';
import type { AgentUIApp } from '@/Shuffle-MCPs/components/AgentUI';
import type { AgentPreset } from '@/Shuffle-Core/components/AgentPresets';
import {
  AgentContextRule,
  AgentResolvedContext,
  clearPageContextChoice,
  resolveAgentContext,
  setPageContextChoice,
} from '@/Shuffle-MCPs/agentContextRegistry';

export interface AskAiDrawerProps extends Omit<AgentRunDrawerProps, 'title' | 'subtitle'> {
  /** Override drawer title. When omitted, uses the context-aware title. */
  title?: React.ReactNode;
  /** Override drawer subtitle. When omitted, uses the context-aware subtitle. */
  subtitle?: React.ReactNode;
  /**
   * Current pathname. When omitted, automatically tracks `window.location.pathname`.
   * Can be provided directly by host routers (e.g. TanStack Router `useLocation().pathname`).
   */
  pathname?: string;
  /** Current search string (e.g. `?query=abc`). When omitted, uses `window.location.search`. */
  search?: string;
  /** Custom rules extending or overriding built-in context rules. */
  rules?: AgentContextRule[];
  /** Callback fired whenever the active context is resolved or changes. */
  onContextResolved?: (context: AgentResolvedContext) => void;
  /** When true, hides the "Reset to defaults" prompt when page tools have been customized. */
  hideResetAction?: boolean;
}

export const AskAiDrawer: React.FC<AskAiDrawerProps> = ({
  open,
  onClose,
  title,
  subtitle,
  pathname: propPathname,
  search: propSearch,
  rules,
  onContextResolved,
  hideResetAction = true,
  agentUIProps,
  ...drawerProps
}) => {
  // Track location if not passed via props
  const [internalPathname, setInternalPathname] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/',
  );
  const [internalSearch, setInternalSearch] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.search : '',
  );

  useEffect(() => {
    if (propPathname !== undefined) return;
    const updateLoc = () => {
      setInternalPathname(window.location.pathname);
      setInternalSearch(window.location.search);
    };
    window.addEventListener('popstate', updateLoc);
    return () => window.removeEventListener('popstate', updateLoc);
  }, [propPathname]);

  const activePathname = propPathname !== undefined ? propPathname : internalPathname;
  const activeSearch = propSearch !== undefined ? propSearch : internalSearch;

  // Key to force AgentUI to re-mount when page context changes or user clicks "Reset"
  const [resetKey, setResetKey] = useState<number>(0);

  // Resolve context for current location
  const resolvedContext = useMemo(
    () => resolveAgentContext(activePathname, activeSearch, rules),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePathname, activeSearch, rules, resetKey],
  );

  // Notify listener of resolved context
  useEffect(() => {
    onContextResolved?.(resolvedContext);
  }, [resolvedContext, onContextResolved]);

  // Track if user customized choices for this page
  const [isOverridden, setIsOverridden] = useState<boolean>(resolvedContext.isOverridden);

  useEffect(() => {
    setIsOverridden(resolvedContext.isOverridden);
  }, [resolvedContext.isOverridden, resolvedContext.storageKey]);

  // Handle user changing apps
  const handleAppsChange = useCallback(
    (apps: AgentUIApp[]) => {
      setPageContextChoice(resolvedContext.storageKey, {
        apps: apps.map((a) => ({ name: a.name, id: a.id, icon: a.icon })),
      });
      setIsOverridden(true);
    },
    [resolvedContext.storageKey],
  );

  // Handle user changing preset
  const handleSelectPreset = useCallback(
    (preset: AgentPreset) => {
      setPageContextChoice(resolvedContext.storageKey, {
        presetId: preset.id,
      });
      setIsOverridden(true);
    },
    [resolvedContext.storageKey],
  );

  // Handle resetting back to page defaults
  const handleResetToDefaults = useCallback(() => {
    clearPageContextChoice(resolvedContext.storageKey);
    setIsOverridden(false);
    setResetKey((k) => k + 1);
  }, [resolvedContext.storageKey]);

  // Header Title
  const effectiveTitle =
    title !== undefined
      ? title
      : (resolvedContext.headerTitleFn ? resolvedContext.headerTitleFn() : resolvedContext.headerTitle) ||
        resolvedContext.title;

  // Header Subtitle with context info & optional reset button
  const effectiveSubtitle =
    subtitle !== undefined ? (
      subtitle
    ) : (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.25 }}>
        <Typography component="span" sx={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))' }}>
          {resolvedContext.subtitle}
        </Typography>
        {isOverridden && !hideResetAction && (
          <ButtonBase
            onClick={handleResetToDefaults}
            sx={{
              fontSize: '0.68rem',
              fontWeight: 600,
              color: 'hsl(var(--primary))',
              textDecoration: 'underline',
              cursor: 'pointer',
              py: 0.1,
              px: 0.4,
              borderRadius: 0.5,
              transition: 'opacity 120ms ease',
              '&:hover': { opacity: 0.75 },
            }}
          >
            Reset to defaults
          </ButtonBase>
        )}
      </Box>
    );

  return (
    <AgentRunDrawer
      {...drawerProps}
      open={open}
      onClose={onClose}
      title={effectiveTitle}
      subtitle={effectiveSubtitle}
      agentUIProps={{
        ...agentUIProps,
        key: `ask_ai_${resolvedContext.storageKey}_${resetKey}`,
        defaultApps: resolvedContext.apps,
        initialPresetId: resolvedContext.presetId,
        defaultInput: agentUIProps?.defaultInput ?? resolvedContext.defaultPrompt,
        placeholder: agentUIProps?.placeholder ?? resolvedContext.placeholder,
        contextCategory: resolvedContext.sourceCategory,
        contextStorageKey: resolvedContext.storageKey,
        contextParams: resolvedContext.params,
        composeSubmitInput: resolvedContext.composeInput,
        onAppsChange: (apps) => {
          handleAppsChange(apps);
          agentUIProps?.onAppsChange?.(apps);
        },
        onSelectPreset: (preset) => {
          handleSelectPreset(preset);
          agentUIProps?.onSelectPreset?.(preset);
        },
      }}
    />
  );
};

export default AskAiDrawer;
