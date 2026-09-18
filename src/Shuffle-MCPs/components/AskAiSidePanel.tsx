/**
 * AskAiSidePanel — Persistent, sideshifting right-docked AI assistant panel.
 *
 * Replaces the modal drawer with a persistent panel that slides out from the
 * right and sideshifts the main UI horizontally without blocking page clicks.
 *
 * Key features:
 *  - Sideshifts layout: sets CSS variable `--ask-ai-panel-width: {width}px` on
 *    document.documentElement, smoothly shrinking DashboardLayout margin.
 *  - Compact horizontal width (~380px default).
 *  - Task-focused: minimal fluff, contextual question header (e.g. "How can we
 *    help handle incidents?"), prompt input with active skill chip -> tools chips.
 *  - Support user visibility: shows an explicit missing-config notice when no
 *    dedicated MCP app or skill is mapped for the current page.
 *  - Disabled & auto-closing on `/agents` and `/agent` routes.
 *  - Choice persistence: remembers tool and skill modifications per page.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  IconButton,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import {
  AlertTriangle,
  ArrowLeft,
  Play,
  Server,
  ShieldCheck,
  X as CloseIcon,
} from 'lucide-react';

import AgentIcon from '@/Shuffle-MCPs/components/AgentIcon';
import AgentUI, { type AgentUIProps } from '@/Shuffle-MCPs/components/AgentUI';
import { type AgentRunDrawerTab } from '@/Shuffle-MCPs/components/AgentRunDrawer';
import LocalLLMConfig from '@/Shuffle-MCPs/components/LocalLLMConfig';
import { openSupportEscalation } from '@/Shuffle-MCPs/supportEscalation';
import { type ShuffleHostProps } from '@/Shuffle-MCPs/host-props';
import { useSyncHostBaseUrl } from '@/Shuffle-MCPs/useSyncHostBaseUrl';
import {
  isAgentRoute,
  resolveAgentContext,
  getActivePageEntityName,
  getPageContextChoice,
  setPageContextChoice,
  clearPageContextChoice,
  type AgentContextRule,
  type AgentResolvedContext,
} from '@/Shuffle-MCPs/agentContextRegistry';
import { useShuffleMcpTheme } from '@/Shuffle-MCPs/ShuffleMcpThemeProvider';

export const AGENT_DRAWER_OPEN_EVENT = 'agent-drawer-open';
export interface AgentDrawerOpenDetail {
  tab?: AgentRunDrawerTab;
  source?: string;
  defaultInput?: string;
  autoSubmit?: boolean;
  taskId?: string;
  incidentId?: string;
  incidentContext?: Record<string, any>;
  executionId?: string | null;
  resetExecution?: boolean;
}

export const ASK_AI_PANEL_WIDTH_STORAGE_KEY = 'shuffle:ask_ai_panel_width';
export const MIN_ASK_AI_PANEL_WIDTH = 340;
export const MAX_ASK_AI_PANEL_WIDTH = 960;

export interface AskAiSidePanelProps extends ShuffleHostProps {
  /** Target incident ID */
  incidentId?: string;
  /** Structured incident context */
  incidentContext?: Record<string, any>;
  /** Whether the side panel is open */
  open: boolean;
  /** Callback to close the side panel */
  onClose: () => void;
  /** Initial tab or active tab to display. Default: 'run' */
  initialTab?: AgentRunDrawerTab;
  /** Controlled active tab */
  activeTab?: AgentRunDrawerTab;
  /** Tab change callback */
  onTabChange?: (tab: AgentRunDrawerTab) => void;
  /** Optional pre-filled default input prompt */
  defaultInput?: string;
  /** Render content for the Permissions tab. Tab is hidden when omitted. */
  permissionsSlot?: React.ReactNode;
  /** Render content for the Local LLM tab. Defaults to bundled Local LLM configuration UI. */
  localLLMSlot?: React.ReactNode;
  /** Custom badge node next to the Local LLM tab label. */
  localLLMTabBadge?: React.ReactNode;
  /** Tooltip shown when the Permissions tab is rendered but disabled. */
  permissionsDisabled?: boolean;
  permissionsDisabledTooltip?: string;
  /** Current URL pathname. Falls back to window.location.pathname when omitted. */
  pathname?: string;
  /** Current URL search params string. */
  search?: string;
  /** Optional custom rules to evaluate ahead of built-ins */
  rules?: AgentContextRule[];
  /** Authoritative support user flag */
  isSupport?: boolean;
  /** Panel width in pixels. Default: 380 */
  width?: number;
  /** Theme override forwarded to AgentUI */
  theme?: 'light' | 'dark' | 'system';
  /** Backend base URL */
  globalUrl?: string;
  /** Extra props forwarded directly to AgentUI */
  agentUIProps?: Partial<AgentUIProps>;
  /** Notified when context is resolved or updated */
  onContextResolved?: (context: AgentResolvedContext) => void;
  /**
   * Whether opening the side panel should sideshift the page layout by setting
   * `--ask-ai-panel-width` on the root HTML element.
   *
   * When `true` (default), pages consuming `var(--ask-ai-panel-width, 0px)`
   * (e.g. `DashboardLayout`, `DocsPage`) will smoothly shrink or shift their
   * main content container to avoid being covered by the panel.
   *
   * When `false`, the panel acts as an overlay without adjusting page layout margins.
   *
   * If omitted, falls back to the matched route's context rule `sideshift` setting,
   * which defaults to `true`.
   *
   * Default: true
   */
  sideshift?: boolean;
  /** Style overrides for the root panel container */
  sx?: SxProps<Theme>;
}

export const AskAiSidePanel: React.FC<AskAiSidePanelProps> = ({
  open,
  onClose,
  initialTab = 'run',
  activeTab: propActiveTab,
  onTabChange,
  permissionsSlot,
  localLLMSlot,
  localLLMTabBadge,
  permissionsDisabled = false,
  permissionsDisabledTooltip,
  pathname,
  search,
  rules,
  isSupport,
  width = 380,
  theme,
  globalUrl,
  agentUIProps,
  onContextResolved,
  sideshift,
  userdata,
  isLoaded,
  isLoggedIn,
  defaultInput,
  serverside,
  colorMode,
  incidentId: propIncidentId,
  incidentContext: propIncidentContext,
  sx,
}) => {
  const themeScope = useShuffleMcpTheme();
  const effectiveTheme = theme || (themeScope?.isDark ? 'dark' : 'light');

  const [currentPathname, setCurrentPathname] = useState<string>(pathname ?? '/');
  const [currentSearch, setCurrentSearch] = useState<string>(search ?? '');

  // Keep path synced
  useEffect(() => {
    if (pathname !== undefined) {
      setCurrentPathname(pathname);
      return;
    }
    if (typeof window !== 'undefined') {
      const handleLocationChange = () => {
        setCurrentPathname(window.location.pathname);
        setCurrentSearch(window.location.search);
      };
      handleLocationChange();
      window.addEventListener('popstate', handleLocationChange);
      return () => window.removeEventListener('popstate', handleLocationChange);
    }
    return;
  }, [pathname]);

  useEffect(() => {
    if (search !== undefined) {
      setCurrentSearch(search);
    }
  }, [search]);

  // Check if current route is an excluded Agent route (/agents or /agent)
  const isAgentDisabled = isAgentRoute(currentPathname);
  const isVisible = open && !isAgentDisabled;

  // Auto-close if currently open when user navigates to an agent route
  useEffect(() => {
    if (isAgentDisabled && open) {
      onClose();
    }
  }, [isAgentDisabled, open, onClose]);

  // Resolve context awareness for the active page
  const context = React.useMemo<AgentResolvedContext>(
    () => resolveAgentContext(currentPathname, currentSearch, rules),
    [currentPathname, currentSearch, rules],
  );

  // Dynamic entity title detection for pages that load data asynchronously
  const [entityTitle, setEntityTitle] = useState<string | undefined>(() => getActivePageEntityName());

  useEffect(() => {
    if (!open) return;

    // Immediate check
    const current = getActivePageEntityName();
    if (current) setEntityTitle(current);

    // Staggered polls to catch async fetches on initial mount
    const t1 = setTimeout(() => {
      const e = getActivePageEntityName();
      if (e) setEntityTitle(e);
    }, 150);

    const t2 = setTimeout(() => {
      const e = getActivePageEntityName();
      if (e) setEntityTitle(e);
    }, 500);

    const t3 = setTimeout(() => {
      const e = getActivePageEntityName();
      if (e) setEntityTitle(e);
    }, 1200);

    // DOM observer for title changes / user edits while panel is open
    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      observer = new MutationObserver(() => {
        const e = getActivePageEntityName();
        if (e) {
          setEntityTitle((prev) => (prev !== e ? e : prev));
        }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-entity-title', 'value'],
      });
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      observer?.disconnect();
    };
  }, [open, currentPathname]);

  const displayTitle = React.useMemo(() => {
    if (context.titleFn) {
      return context.titleFn(entityTitle);
    }
    return context.title || 'How can we help on this page?';
  }, [context, entityTitle]);

  useEffect(() => {
    onContextResolved?.(context);
  }, [context, onContextResolved]);

  useSyncHostBaseUrl(globalUrl);

  const [internalTab, setInternalTab] = useState<AgentRunDrawerTab>(initialTab);
  const currentTab = propActiveTab !== undefined ? propActiveTab : internalTab;

  const [controlledDefaultInput, setControlledDefaultInput] = useState<string | undefined>(defaultInput);
  const [controlledAutoSubmit, setControlledAutoSubmit] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (defaultInput !== undefined) {
      setControlledDefaultInput(defaultInput);
    }
  }, [defaultInput]);

  const effectiveDefaultInput = controlledDefaultInput ?? defaultInput ?? agentUIProps?.defaultInput;
  const effectiveAutoSubmit = controlledAutoSubmit ?? agentUIProps?.autoSubmit;

  const isBetaRoute =
    context.isBeta === true ||
    currentPathname.startsWith('/incidents') ||
    currentPathname.startsWith('/incidents-simple') ||
    currentPathname.startsWith('/cases') ||
    currentPathname.startsWith('/alerts') ||
    currentPathname.startsWith('/tickets') ||
    currentPathname.startsWith('/docs');

  const handleTabChange = useCallback(
    (nextTab: AgentRunDrawerTab) => {
      setInternalTab(nextTab);
      onTabChange?.(nextTab);
    },
    [onTabChange],
  );

  // Sync initialTab prop changes
  useEffect(() => {
    if (initialTab) {
      setInternalTab(initialTab);
    }
  }, [initialTab]);

  // Reset tab whenever the side panel transitions from closed -> open
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current && initialTab) {
      setInternalTab(initialTab);
      onTabChange?.(initialTab);
    }
    prevOpenRef.current = open;
  }, [open, initialTab, onTabChange]);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  const [activeIncidentContext, setActiveIncidentContext] = useState<Record<string, any> | null>(null);
  const [runResetKey, setRunResetKey] = useState<number>(0);
  const [lastRunInfo, setLastRunInfo] = useState<{
    input?: string;
    executionId?: string;
    error?: string;
    success?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setActiveTaskId(null);
      setActiveExecutionId(null);
      setActiveIncidentId(null);
      setActiveIncidentContext(null);
    }
  }, [open]);

  // Broadcast mounted status so AgentUI knows a drawer/panel is present
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).__shuffleAgentDrawerMounted =
      ((window as any).__shuffleAgentDrawerMounted || 0) + 1;
    return () => {
      (window as any).__shuffleAgentDrawerMounted = Math.max(
        0,
        ((window as any).__shuffleAgentDrawerMounted || 1) - 1,
      );
    };
  }, []);

  // Listen for global open events requesting specific tabs
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<AgentDrawerOpenDetail>).detail;
      const tab = detail?.tab;
      if (tab) {
        handleTabChange(tab as AgentRunDrawerTab);
      }
      if (detail?.defaultInput !== undefined) {
        setControlledDefaultInput(detail.defaultInput);
      }
      if (detail?.autoSubmit !== undefined) {
        setControlledAutoSubmit(detail.autoSubmit);
      }
      if (detail?.taskId !== undefined) {
        setActiveTaskId(detail.taskId || null);
      } else if (!detail?.tab) {
        setActiveTaskId(null);
      }
      if (detail?.incidentId !== undefined) {
        setActiveIncidentId(detail.incidentId || null);
      }
      if (detail?.incidentContext !== undefined) {
        setActiveIncidentContext(detail.incidentContext || null);
      }
      if (detail?.resetExecution) {
        setActiveExecutionId(null);
        setLastRunInfo(null);
        setRunResetKey((k) => k + 1);
      } else if (detail?.executionId !== undefined) {
        setActiveExecutionId(detail.executionId || null);
      } else if (detail?.taskId) {
        setActiveExecutionId(null);
      }
    };
    window.addEventListener(AGENT_DRAWER_OPEN_EVENT, onOpen as EventListener);
    return () => {
      window.removeEventListener(AGENT_DRAWER_OPEN_EVENT, onOpen as EventListener);
    };
  }, [handleTabChange]);

  const handleAgentRun = useCallback(
    (event: { input: string; success: boolean; executionId?: string; error?: string }) => {
      setLastRunInfo({
        input: event.input,
        executionId: event.executionId,
        error: event.error,
        success: event.success,
      });
      if (event.executionId) {
        setActiveExecutionId(event.executionId);
      }
      if (event.executionId && activeTaskId) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('shuffle:task_ai_execution', {
              detail: {
                taskId: activeTaskId,
                executionId: event.executionId,
                status: event.success ? 'running' : 'failed',
              },
            }),
          );
        }
      }
    },
    [activeTaskId],
  );

  const effectiveStorageKey = activeTaskId
    ? `${context.storageKey}:task:${activeTaskId}`
    : context.storageKey;

  const urlExecutionId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const s = search ?? window.location.search;
    return new URLSearchParams(s).get('execution_id');
  }, [search]);

  const hasAgentRun = Boolean(
    lastRunInfo?.executionId ||
    lastRunInfo?.input ||
    activeExecutionId ||
    urlExecutionId ||
    (runResetKey === 0 && effectiveStorageKey && getPageContextChoice(effectiveStorageKey)?.executionId)
  );

  const handleEscalateToSupport = useCallback(() => {
    const savedChoice = effectiveStorageKey ? getPageContextChoice(effectiveStorageKey) : null;
    const execId = lastRunInfo?.executionId || activeExecutionId || urlExecutionId || savedChoice?.executionId;
    const execStatus =
      lastRunInfo?.success !== undefined
        ? (lastRunInfo.success ? 'FINISHED' : 'FAILED')
        : (savedChoice?.executionStatus || (execId ? 'EXECUTING' : undefined));
    const question = lastRunInfo?.input || effectiveDefaultInput || savedChoice?.draftPrompt;

    openSupportEscalation({
      userdata,
      pathname: currentPathname,
      search: currentSearch,
      entityTitle,
      initialQuestion: question,
      executionId: execId || undefined,
      executionStatus: execStatus,
      error: lastRunInfo?.error,
    });
  }, [
    userdata,
    currentPathname,
    currentSearch,
    entityTitle,
    lastRunInfo,
    activeExecutionId,
    urlExecutionId,
    effectiveDefaultInput,
    effectiveStorageKey,
  ]);

  const agentUiKey = activeTaskId
    ? `${context.storageKey}:task:${activeTaskId}:${activeExecutionId || 'fresh'}:${runResetKey}`
    : `${context.storageKey}:${runResetKey}`;

  const effectiveLocalLLMSlot =
    localLLMSlot ?? (
      <LocalLLMConfig
        open={open}
        globalUrl={globalUrl}
        userdata={userdata}
        isLoaded={isLoaded}
        isLoggedIn={isLoggedIn}
        serverside={serverside}
        theme={effectiveTheme}
        colorMode={colorMode}
      />
    );

  // The Ask AI sidebar is dedicated to page help, so we don't display a persistent
  // tab strip. Permissions tab is hidden in this helper view. If the user invokes
  // "Configure LLM", the panel temporarily switches to the 'localLLM' view.
  const TAB_ORDER: AgentRunDrawerTab[] = ['run', 'localLLM'];
  const visibleTabs = TAB_ORDER.filter((t) => {
    if (t === 'run') return true;
    if (t === 'localLLM') return !!effectiveLocalLLMSlot;
    return false;
  });

  const safeActiveTab: AgentRunDrawerTab = visibleTabs.includes(currentTab)
    ? currentTab
    : 'run';

  const panelRef = useRef<HTMLElement | null>(null);

  // Automatically focus prompt input when panel opens or switches to 'run' tab
  useEffect(() => {
    if (!isVisible || safeActiveTab !== 'run') return;

    const focusInput = () => {
      if (!panelRef.current) return false;
      const target = panelRef.current.querySelector<HTMLTextAreaElement | HTMLInputElement>(
        'textarea, input[type="text"]:not([readonly]), input:not([type]):not([readonly])'
      );
      if (target) {
        target.focus();
        return true;
      }
      return false;
    };

    if (focusInput()) return;
    const t1 = setTimeout(focusInput, 40);
    const t2 = setTimeout(focusInput, 120);
    const t3 = setTimeout(focusInput, 240);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isVisible, safeActiveTab]);

  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return width || 380;
    try {
      const stored = localStorage.getItem(ASK_AI_PANEL_WIDTH_STORAGE_KEY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= MIN_ASK_AI_PANEL_WIDTH && parsed <= MAX_ASK_AI_PANEL_WIDTH) {
          return parsed;
        }
      }
    } catch {}
    return width || 380;
  });

  const [isResizing, setIsResizing] = useState(false);

  // Sync prop changes if caller passes an explicit width prop different from current default
  const prevWidthPropRef = useRef(width);
  useEffect(() => {
    if (width !== prevWidthPropRef.current) {
      prevWidthPropRef.current = width;
      setPanelWidth(width);
    }
  }, [width]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startX = e.clientX;
    const startW = panelWidth;

    let rafId: number | null = null;
    let currentNextWidth = startW;

    if (typeof document !== 'undefined') {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const maxAllowed = Math.min(MAX_ASK_AI_PANEL_WIDTH, (window.innerWidth || 1200) - 40);
      const nextWidth = Math.round(
        Math.max(MIN_ASK_AI_PANEL_WIDTH, Math.min(maxAllowed, startW + deltaX))
      );
      currentNextWidth = nextWidth;

      if (!rafId) {
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          if (panelRef.current) {
            panelRef.current.style.width = `${currentNextWidth}px`;
          }
          if (typeof document !== 'undefined') {
            document.documentElement.style.setProperty('--ask-ai-panel-width', `${currentNextWidth}px`);
          }
        });
      }
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      setIsResizing(false);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (typeof document !== 'undefined') {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      const deltaX = startX - upEvent.clientX;
      const maxAllowed = Math.min(MAX_ASK_AI_PANEL_WIDTH, (window.innerWidth || 1200) - 40);
      const finalWidth = Math.round(
        Math.max(MIN_ASK_AI_PANEL_WIDTH, Math.min(maxAllowed, startW + deltaX))
      );
      setPanelWidth(finalWidth);
      if (panelRef.current) {
        panelRef.current.style.width = '';
      }
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--ask-ai-panel-width', `${finalWidth}px`);
        try {
          localStorage.setItem(ASK_AI_PANEL_WIDTH_STORAGE_KEY, String(finalWidth));
        } catch {}
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [panelWidth]);

  const handleTouchResizeStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    setIsResizing(true);
    const startX = e.touches[0].clientX;
    const startW = panelWidth;

    let rafId: number | null = null;
    let currentNextWidth = startW;

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length !== 1) return;
      const deltaX = startX - moveEvent.touches[0].clientX;
      const maxAllowed = Math.min(MAX_ASK_AI_PANEL_WIDTH, (window.innerWidth || 1200) - 40);
      const nextWidth = Math.round(
        Math.max(MIN_ASK_AI_PANEL_WIDTH, Math.min(maxAllowed, startW + deltaX))
      );
      currentNextWidth = nextWidth;

      if (!rafId) {
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          if (panelRef.current) {
            panelRef.current.style.width = `${currentNextWidth}px`;
          }
          if (typeof document !== 'undefined') {
            document.documentElement.style.setProperty('--ask-ai-panel-width', `${currentNextWidth}px`);
          }
        });
      }
    };

    const handleTouchEnd = (endEvent: TouchEvent) => {
      setIsResizing(false);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      const clientX = endEvent.changedTouches[0]?.clientX ?? startX;
      const deltaX = startX - clientX;
      const maxAllowed = Math.min(MAX_ASK_AI_PANEL_WIDTH, (window.innerWidth || 1200) - 40);
      const finalWidth = Math.round(
        Math.max(MIN_ASK_AI_PANEL_WIDTH, Math.min(maxAllowed, startW + deltaX))
      );
      setPanelWidth(finalWidth);
      if (panelRef.current) {
        panelRef.current.style.width = '';
      }
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--ask-ai-panel-width', `${finalWidth}px`);
        try {
          localStorage.setItem(ASK_AI_PANEL_WIDTH_STORAGE_KEY, String(finalWidth));
        } catch {}
      }
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
  }, [panelWidth]);

  const effectiveWidth =
    safeActiveTab === 'localLLM'
      ? Math.max(panelWidth, 520)
      : panelWidth;

  const effectiveSideshift = sideshift !== undefined ? sideshift : (context.sideshift ?? true);

  // Manage UI sideshifting via CSS variable `--ask-ai-panel-width`
  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (open && !isAgentDisabled && effectiveSideshift) {
      document.documentElement.style.setProperty(
        '--ask-ai-panel-width',
        `${effectiveWidth}px`,
      );
    } else {
      document.documentElement.style.setProperty('--ask-ai-panel-width', '0px');
    }

    return () => {
      document.documentElement.style.setProperty('--ask-ai-panel-width', '0px');
    };
  }, [open, isAgentDisabled, effectiveWidth, effectiveSideshift]);

  const handleAppsChange = useCallback<NonNullable<AgentUIProps['onAppsChange']>>(
    (nextApps) => {
      setPageContextChoice(context.storageKey, {
        apps: nextApps.map((a) => ({ name: a.name, id: a.id, icon: a.icon })),
      });
      agentUIProps?.onAppsChange?.(nextApps);
    },
    [context.storageKey, agentUIProps],
  );

  const handleSelectPreset = useCallback(
    (preset: any) => {
      setPageContextChoice(context.storageKey, {
        presetId: preset?.id ?? null,
      });
    },
    [context.storageKey],
  );

  if (isAgentDisabled) {
    return null;
  }

  return (
    <>
      {/* Full-screen drag overlay to prevent pointer events / iframe hijacking during resize */}
      {isResizing && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            cursor: 'col-resize',
            userSelect: 'none',
          }}
        />
      )}

      {/* Mobile-only backdrop overlay to close easily on small screens */}
      <Box
        onClick={onClose}
        aria-hidden="true"
        sx={{
          position: 'fixed',
          inset: 0,
          bgcolor: 'rgba(0, 0, 0, 0.45)',
          zIndex: 1199,
          display: { xs: isVisible ? 'block' : 'none', sm: 'none' },
          backdropFilter: 'blur(2px)',
          transition: 'opacity 0.2s ease',
        }}
      />

      {/* Persistent Docked Side Panel */}
      <Box
        ref={panelRef}
        component="aside"
        aria-label="Ask Shuffle"
        aria-hidden={!isVisible}
        className={themeScope?.scopeClassName}
        sx={[
          {
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: { xs: '100%', sm: effectiveWidth },
            minWidth: { xs: '100%', sm: MIN_ASK_AI_PANEL_WIDTH },
            maxWidth: { xs: '100vw', sm: MAX_ASK_AI_PANEL_WIDTH },
            height: '100dvh',
            bgcolor: 'hsl(var(--card))',
            borderLeft: '1px solid hsl(var(--border))',
            boxShadow: isVisible ? '-6px 0 24px rgba(0, 0, 0, 0.16)' : 'none',
            zIndex: 1200,
            display: 'flex',
            flexDirection: 'column',
            transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
            transition: isResizing
              ? 'none'
              : 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), width 0.2s ease',
            pointerEvents: isVisible ? 'auto' : 'none',
            visibility: isVisible ? 'visible' : 'hidden',
            boxSizing: 'border-box',
            overflow: 'hidden',
            userSelect: isResizing ? 'none' : 'auto',
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        {/* Left-edge Resize Handle */}
        <Box
          onMouseDown={handleResizeStart}
          onTouchStart={handleTouchResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Ask Shuffle panel"
          sx={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: -6,
            width: 14,
            cursor: 'col-resize',
            zIndex: 1300,
            transition: 'background-color 0.15s ease',
            userSelect: 'none',
            display: { xs: 'none', sm: 'flex' },
            alignItems: 'center',
            justifyContent: 'center',
            '&:hover, &:active': {
              bgcolor: 'hsl(var(--primary) / 0.15)',
              '& .resize-grip': {
                bgcolor: 'hsl(var(--primary))',
                opacity: 1,
              },
            },
            ...(isResizing ? {
              bgcolor: 'hsl(var(--primary) / 0.2)',
              '& .resize-grip': {
                bgcolor: 'hsl(var(--primary))',
                opacity: 1,
              },
            } : {}),
          }}
        >
          {/* Subtle vertical grip affordance bar */}
          <Box
            className="resize-grip"
            sx={{
              width: 3,
              height: 36,
              borderRadius: 1.5,
              bgcolor: 'hsl(var(--muted-foreground))',
              opacity: 0.35,
              transition: 'opacity 0.15s ease, background-color 0.15s ease',
            }}
          />
        </Box>

        {/* Top Header Bar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            pt: 1.5,
            pb: 1,
            borderBottom: '1px solid hsl(var(--border) / 0.6)',
            flexShrink: 0,
          }}
        >
          {/* Logo & Tab/Panel Title */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: '6px',
                bgcolor: 'hsl(var(--primary) / 0.12)',
                border: '1px solid hsl(var(--primary) / 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'hsl(var(--primary))',
                flexShrink: 0,
              }}
            >
              {safeActiveTab === 'permissions' ? (
                <ShieldCheck size={14} />
              ) : safeActiveTab === 'localLLM' ? (
                <Server size={14} />
              ) : (
                <AgentIcon size={14} />
              )}
            </Box>
            <Typography
              noWrap
              sx={{
                fontWeight: 700,
                fontSize: '0.86rem',
                color: 'hsl(var(--foreground))',
                letterSpacing: '-0.01em',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {safeActiveTab === 'permissions'
                ? 'Agent Permissions'
                : safeActiveTab === 'localLLM'
                  ? 'Local LLM Settings'
                  : (context.headerTitleFn ? context.headerTitleFn(entityTitle) : context.headerTitle) ||
                    (context.buttonLabelFn ? context.buttonLabelFn(entityTitle) : context.buttonLabel) ||
                    'Ask Shuffle'}
            </Typography>
            <Box
              sx={{
                fontSize: '0.66rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                px: 0.75,
                py: 0.2,
                borderRadius: '4px',
                bgcolor: isBetaRoute ? 'hsla(var(--primary) / 0.12)' : 'hsl(var(--muted))',
                color: isBetaRoute ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                border: isBetaRoute ? '1px solid hsla(var(--primary) / 0.26)' : '1px solid hsl(var(--border))',
                flexShrink: 0,
              }}
            >
              {isBetaRoute ? 'Beta' : (isLoggedIn ? (isSupport ? 'Support' : 'Agent') : 'Guest')}
            </Box>
          </Box>

          {/* Header Action Controls */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
            <Tooltip
              title={
                hasAgentRun
                  ? 'Talk to support'
                  : 'Run an agent first to provide context for support'
              }
              arrow
              placement="bottom"
            >
              <span style={{ display: 'inline-flex', cursor: hasAgentRun ? 'pointer' : 'not-allowed' }}>
                <Button
                  onClick={handleEscalateToSupport}
                  disabled={!hasAgentRun}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 24,
                    minHeight: 24,
                    px: 1,
                    py: 0,
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    textTransform: 'none',
                    whiteSpace: 'nowrap',
                    borderRadius: '6px',
                    borderColor: 'hsl(var(--border))',
                    color: hasAgentRun ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                    bgcolor: 'transparent',
                    '&:hover': {
                      borderColor: 'hsl(var(--primary))',
                      bgcolor: 'hsl(var(--muted))',
                      color: 'hsl(var(--primary))',
                    },
                    '&.Mui-disabled': {
                      borderColor: 'hsl(var(--border) / 0.5)',
                      color: 'hsl(var(--muted-foreground) / 0.6)',
                      opacity: 0.6,
                    },
                  }}
                >
                  Talk to support
                </Button>
              </span>
            </Tooltip>
            <IconButton
              onClick={onClose}
              size="small"
              aria-label="Close Ask Shuffle panel"
              sx={{
                color: 'hsl(var(--muted-foreground))',
                p: 0.75,
                borderRadius: '8px',
                '&:hover': {
                  color: 'hsl(var(--foreground))',
                  bgcolor: 'hsl(var(--muted))',
                },
              }}
            >
              <CloseIcon size={16} />
            </IconButton>
          </Box>
        </Box>

        {/* Tab Panel: Local LLM (shown when user clicks "Configure LLM") */}
        {safeActiveTab === 'localLLM' && effectiveLocalLLMSlot && (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {/* Top Navigation Bar: Back to Chat + Local LLM title */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                py: 1.25,
                borderBottom: '1px solid hsl(var(--border) / 0.6)',
                bgcolor: 'hsl(var(--card))',
                flexShrink: 0,
              }}
            >
              <ButtonBase
                onClick={() => handleTabChange('run')}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'hsl(var(--primary))',
                  py: 0.5,
                  px: 1,
                  borderRadius: 1,
                  transition: 'background-color 120ms ease',
                  '&:hover': {
                    bgcolor: 'hsl(var(--muted))',
                  },
                }}
              >
                <ArrowLeft size={14} />
                Back to chat
              </ButtonBase>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  fontSize: '0.78rem',
                  color: 'hsl(var(--muted-foreground))',
                  fontWeight: 500,
                }}
              >
                <Server size={13} />
                Local LLM
                {localLLMTabBadge}
              </Box>
            </Box>

            <Box
              sx={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                p: 2,
                minHeight: 0,
              }}
            >
              {effectiveLocalLLMSlot}
            </Box>
          </Box>
        )}

        {/* Tab Panel: Run (AgentUI) */}
        {safeActiveTab === 'run' && (
          <>
            {/* Missing Config Banner for Support Users */}
            {context.missingConfig && (
              <Box
                sx={{
                  mx: 2,
                  mt: 1.5,
                  mb: 0.5,
                  p: 1.25,
                  borderRadius: 1.5,
                  bgcolor: 'hsl(var(--warning) / 0.1)',
                  border: '1px solid hsl(var(--warning) / 0.3)',
                  color: 'hsl(var(--warning))',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.5,
                  flexShrink: 0,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    fontWeight: 600,
                    fontSize: '0.78rem',
                  }}
                >
                  <AlertTriangle size={14} />
                  Missing page configuration
                </Box>
                <Typography
                  sx={{
                    fontSize: '0.72rem',
                    color: 'hsl(var(--muted-foreground))',
                    lineHeight: 1.35,
                  }}
                >
                  No specific MCP apps or skills mapped for{' '}
                  <code>{currentPathname}</code>. Using default platform tools.
                  Support users: add a route mapping in{' '}
                  <code>agentContextRegistry.ts</code> or manually choose tools
                  below.
                </Typography>
              </Box>
            )}

            {/* Unauthenticated Visitor Notice */}
            {!isLoggedIn && (
              <Box
                sx={{
                  mx: 2,
                  mt: 1.5,
                  mb: 0.5,
                  p: 1.25,
                  borderRadius: 1.5,
                  bgcolor: 'hsl(var(--muted) / 0.5)',
                  border: '1px solid hsl(var(--border))',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.75,
                  flexShrink: 0,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                  }}
                >
                  <Typography
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.78rem',
                      color: 'hsl(var(--foreground))',
                    }}
                  >
                    Not Logged In
                  </Typography>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        const returnUrl = window.location.pathname + window.location.search;
                        window.location.href = `/login?view=${encodeURIComponent(returnUrl)}`;
                      }
                    }}
                    sx={{
                      textTransform: 'none',
                      fontSize: '0.7rem',
                      py: 0.2,
                      px: 1,
                      minHeight: 0,
                      borderRadius: 1,
                    }}
                  >
                    Log In
                  </Button>
                </Box>
                <Typography
                  sx={{
                    fontSize: '0.72rem',
                    color: 'hsl(var(--muted-foreground))',
                    lineHeight: 1.4,
                  }}
                >
                  Log in to interact with AI agents and test prompts.
                </Typography>
              </Box>
            )}

            {/* Scrollable Agent Run Body */}
            <Box
              sx={{
                flex: 1,
                overflow: 'hidden',
                px: 0,
                pb: 0,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <AgentUI
                {...agentUIProps}
                key={agentUiKey}
                sidebarLayout={true}
                compact={true}
                mobileView={true}
                hideHeroIcon={true}
                title={activeTaskId ? 'Task AI Agent' : displayTitle}
                subtitle={null}
                hideChooseLLM={!isLoggedIn}
                isLoggedIn={isLoggedIn}
                disableSchedule={true}
                hideAttach={false}
                maxWidth={effectiveWidth}
                defaultApps={context.apps}
                initialPresetId={context.presetId}
                placeholder={context.placeholder}
                contextCategory={context.sourceCategory}
                contextStorageKey={effectiveStorageKey}
                contextParams={context.params}
                composeSubmitInput={context.composeInput}
                defaultInput={effectiveDefaultInput}
                autoSubmit={effectiveAutoSubmit}
                executionId={activeExecutionId || undefined}
                initialExecution={activeExecutionId ? { execution_id: activeExecutionId } : undefined}
                onRun={handleAgentRun}
                onAppsChange={handleAppsChange}
                onSelectPreset={handleSelectPreset}
                onChooseLLM={() => handleTabChange('localLLM')}
                incidentId={activeIncidentId || propIncidentId || agentUIProps?.incidentId}
                incidentContext={activeIncidentContext || propIncidentContext || agentUIProps?.incidentContext}
                apiBaseUrl={globalUrl || agentUIProps?.apiBaseUrl}
                theme={effectiveTheme}
                sx={{
                  flex: 1,
                  height: '100%',
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  pt: 0,
                  pb: 0,
                  ...(agentUIProps?.sx
                    ? Array.isArray(agentUIProps.sx)
                      ? {}
                      : agentUIProps.sx
                    : {}),
                }}
              />
            </Box>
          </>
        )}
      </Box>
    </>
  );
};

export default AskAiSidePanel;
