/**
 * AskAiWidget — Complete drop-in context-aware "Ask AI" solution for Shuffle-MCPs.
 *
 * Combines the ChatGPT docs-styled floating button in the bottom-right corner with
 * the context-aware AskAiDrawer. Supports both controlled and uncontrolled states,
 * and responds to legacy `openAgentDrawer` events.
 *
 * Self-contained: No host-app `@/` imports.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AskAiButton, AskAiButtonProps } from '@/Shuffle-MCPs/components/AskAiButton';
import { AskAiSidePanel, AskAiSidePanelProps } from '@/Shuffle-MCPs/components/AskAiSidePanel';
import { AskAiDrawer, AskAiDrawerProps } from '@/Shuffle-MCPs/components/AskAiDrawer';
import { AgentRunDrawerTab } from '@/Shuffle-MCPs/components/AgentRunDrawer';
import {
  AgentResolvedContext,
  isAgentRoute,
  resolveAgentContext,
} from '@/Shuffle-MCPs/agentContextRegistry';

export const AGENT_DRAWER_OPEN_EVENT = 'agent-drawer-open';

export interface AgentDrawerOpenDetail {
  tab?: 'run' | 'permissions' | 'localLLM';
  source?: string;
  defaultInput?: string;
  autoSubmit?: boolean;
  taskId?: string;
  incidentId?: string;
  incidentContext?: Record<string, any>;
  executionId?: string | null;
  resetExecution?: boolean;
}

export interface AskAiWidgetProps extends Omit<AskAiSidePanelProps, 'open' | 'onClose'> {
  /** Controlled open state. When omitted, the widget manages its own open state. */
  open?: boolean;
  /** Controlled open state change handler. */
  onOpenChange?: (open: boolean) => void;
  /** Presentation mode: 'panel' (sideshifting persistent side panel, default) or 'drawer' (modal slide-over) */
  mode?: 'panel' | 'drawer';
  /** Authoritative support user flag. When omitted, checks localStorage. */
  isSupport?: boolean;
  /** Whether to require support status to show the floating button. Default: true. */
  requireSupport?: boolean;
  /** Props forwarded to the floating AskAiButton */
  buttonProps?: Partial<AskAiButtonProps>;
  /** Hide the floating button completely (e.g. if controlled only by external triggers) */
  hideButton?: boolean;
  /** Legacy drawer tab support */
  initialTab?: AgentRunDrawerTab;
  /** Legacy drawer slot */
  permissionsSlot?: React.ReactNode;
  /** Legacy drawer slot */
  localLLMSlot?: React.ReactNode;
  /**
   * Whether opening the side panel should sideshift the page layout.
   * Default: true (or controlled per route rule). Set false for pure overlay mode.
   */
  sideshift?: boolean;
}

export const AskAiWidget: React.FC<AskAiWidgetProps> = ({
  open: controlledOpen,
  onOpenChange,
  mode = 'panel',
  isSupport,
  requireSupport = true,
  buttonProps,
  hideButton = false,
  pathname,
  search,
  rules,
  initialTab: propInitialTab = 'run',
  onContextResolved,
  permissionsSlot,
  localLLMSlot,
  ...panelProps
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AgentRunDrawerTab>(propInitialTab);
  const isDrawerOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const [browserLocation, setBrowserLocation] = useState({ path: '', search: '' });

  useEffect(() => {
    if (pathname !== undefined && search !== undefined) return;
    const syncLocation = () => setBrowserLocation({
      path: window.location.pathname,
      search: window.location.search,
    });
    syncLocation();
    window.addEventListener('popstate', syncLocation);
    return () => window.removeEventListener('popstate', syncLocation);
  }, [pathname, search]);

  const currentPath = pathname ?? browserLocation.path;

  const isAgentDisabled = isAgentRoute(currentPath);

  const setDrawerOpen = useCallback(
    (nextOpen: boolean) => {
      if (isAgentDisabled && nextOpen) return;
      if (controlledOpen === undefined) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, isAgentDisabled, onOpenChange],
  );

  // Auto-close if user navigates to an excluded Agent route
  useEffect(() => {
    if (isAgentDisabled && isDrawerOpen) {
      setDrawerOpen(false);
    }
  }, [isAgentDisabled, isDrawerOpen, setDrawerOpen]);

  // Synchronously compute resolved context for immediate label & hints
  const currentSearch = search ?? browserLocation.search;

  const resolvedContext = useMemo(() => {
    return resolveAgentContext(currentPath, currentSearch, rules);
  }, [currentPath, currentSearch, rules]);

  // Track resolved context reported from side panel / drawer with its associated route
  const [reportedContext, setReportedContext] = useState<{ path: string; search: string; ctx: AgentResolvedContext } | null>(null);

  const activeContext =
    reportedContext && reportedContext.path === currentPath && reportedContext.search === currentSearch
      ? reportedContext.ctx
      : resolvedContext;

  const handleContextResolved = useCallback(
    (ctx: AgentResolvedContext) => {
      setReportedContext({ path: currentPath, search: currentSearch, ctx });
      onContextResolved?.(ctx);
    },
    [currentPath, currentSearch, onContextResolved],
  );

  // Listen to global openAgentDrawer events so existing UI triggers continue to work seamlessly
  useEffect(() => {
    const handleDrawerOpenEvent = (e: Event) => {
      if (isAgentDisabled) return;
      const detail = (e as CustomEvent<AgentDrawerOpenDetail>).detail;
      if (detail?.tab) {
        setActiveTab(detail.tab);
      }
      setDrawerOpen(true);
    };

    window.addEventListener(AGENT_DRAWER_OPEN_EVENT, handleDrawerOpenEvent);
    return () => window.removeEventListener(AGENT_DRAWER_OPEN_EVENT, handleDrawerOpenEvent);
  }, [isAgentDisabled, setDrawerOpen]);

  // Sync activeTab whenever propInitialTab changes
  useEffect(() => {
    if (propInitialTab) {
      setActiveTab(propInitialTab);
    }
  }, [propInitialTab]);

  // Dynamic button label (e.g. "Ask about Workflows")
  const effectiveButtonLabel =
    buttonProps?.label ||
    (activeContext.buttonLabelFn ? activeContext.buttonLabelFn() : activeContext.buttonLabel) ||
    'Ask AI';

  const isIncidentOrDocsRoute =
    currentPath.startsWith('/incidents') ||
    currentPath.startsWith('/incidents-simple') ||
    currentPath.startsWith('/cases') ||
    currentPath.startsWith('/alerts') ||
    currentPath.startsWith('/tickets') ||
    currentPath.startsWith('/docs');

  const isBeta = activeContext.isBeta === true || isIncidentOrDocsRoute;
  const effectiveRequireSupport = isBeta ? false : requireSupport;
  const defaultTag = isBeta ? 'Beta' : 'Support';
  const effectiveTagLabel = buttonProps?.tagLabel !== undefined ? buttonProps.tagLabel : defaultTag;

  // Auto-close if a non-support user navigates away from an enabled beta page to a support-only page
  useEffect(() => {
    if (effectiveRequireSupport && !isSupport && isDrawerOpen) {
      setDrawerOpen(false);
    }
  }, [effectiveRequireSupport, isSupport, isDrawerOpen, setDrawerOpen]);

  // Context hint for floating button (e.g. "Shuffle Incidents MCP")
  const contextHint =
    activeContext?.apps && activeContext.apps.length > 0
      ? activeContext.apps.map((a) => a.name.replace(/^shuffle_/, '').replace(/_/g, ' ')).join(', ')
      : undefined;

  if (isAgentDisabled) {
    return null;
  }

  return (
    <>
      {/* Floating ChatGPT docs-style button in bottom-right corner */}
      {!hideButton && (
        <AskAiButton
          onClick={() => setDrawerOpen(!isDrawerOpen)}
          isOpen={isDrawerOpen}
          isSupport={isSupport}
          requireSupport={effectiveRequireSupport}
          isBeta={isBeta}
          pathname={pathname}
          contextHint={contextHint}
          label={effectiveButtonLabel}
          tagLabel={effectiveTagLabel}
          {...buttonProps}
        />
      )}

      {/* Render persistent sideshifting panel by default, or modal drawer if requested */}
      {mode === 'drawer' ? (
        <AskAiDrawer
          open={isDrawerOpen}
          onClose={() => setDrawerOpen(false)}
          initialTab={activeTab}
          pathname={pathname}
          search={search}
          rules={rules}
          permissionsSlot={permissionsSlot}
          localLLMSlot={localLLMSlot}
          onContextResolved={handleContextResolved}
          {...panelProps}
        />
      ) : (
        <AskAiSidePanel
          open={isDrawerOpen}
          onClose={() => setDrawerOpen(false)}
          initialTab={activeTab}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          permissionsSlot={permissionsSlot}
          localLLMSlot={localLLMSlot}
          pathname={pathname}
          search={search}
          rules={rules}
          isSupport={isSupport}
          onContextResolved={handleContextResolved}
          {...panelProps}
        />
      )}
    </>
  );
};

/**
 * Convenience hook to get the active agent context for a given route.
 */
export const useContextAwareAgent = (pathname?: string, search?: string) => {
  const [activeContext, setActiveContext] = useState<AgentResolvedContext>(() =>
    resolveAgentContext(pathname ?? '/', search ?? ''),
  );

  useEffect(() => {
    const p = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
    const s = search ?? (typeof window !== 'undefined' ? window.location.search : '');
    setActiveContext(resolveAgentContext(p, s));
  }, [pathname, search]);

  return activeContext;
};

export default AskAiWidget;
