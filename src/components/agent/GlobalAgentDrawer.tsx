/**
 * GlobalAgentDrawer — single instance of the Agent drawer mounted in the
 * dashboard layout so any page can open it via `openAgentDrawer(tab)`.
 *
 * Also handles the legacy `?openPermissions=1` query param for backwards
 * compatibility with existing deep links.
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from '@/lib/router-compat';
import {
  AskAiWidget,
  API_CONFIG,
  isAgentRoute,
  type AgentRunDrawerTab,
  type AgentUIProps,
} from '@/Shuffle-MCPs';
import PermissionsPanel from '@/components/agent/PermissionsPanel';
import LocalLLMConfig from '@/Shuffle-MCPs/components/LocalLLMConfig';
import { useTheme } from '@/context/ThemeContext';
import {
  AGENT_DRAWER_OPEN_EVENT,
  AGENT_DRAWER_CLOSE_EVENT,
  AGENT_DRAWER_STATE_EVENT,
  type AgentDrawerOpenDetail,
} from '@/lib/agentDrawer';
import { useScheduleAgentRun } from '@/hooks/useScheduleAgentRun';
import { useIsSupport } from '@/hooks/useIsSupport';
import { useAuth } from '@/context/AuthContext';

export interface GlobalAgentDrawerProps {
  /** Override sideshift behavior globally (defaults to route rule or true) */
  sideshift?: boolean;
}

const GlobalAgentDrawer = ({ sideshift }: GlobalAgentDrawerProps = {}) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [open, setOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<AgentRunDrawerTab>('run');
  const [defaultInput, setDefaultInput] = useState<string>('');
  const [autoSubmit, setAutoSubmit] = useState<boolean>(false);

  useEffect(() => {
    try {
      if (isAgentRoute(window.location.pathname)) return;
      if (localStorage.getItem('shuffle_agent_drawer_open') === 'true') {
        setOpen(true);
      }
      const savedTab = localStorage.getItem('shuffle_agent_drawer_tab');
      if (savedTab === 'run' || savedTab === 'permissions' || savedTab === 'localLLM') {
        setInitialTab(savedTab);
      }
    } catch { /* ignore */ }
  }, []);
  const location = useLocation();
  const navigate = useNavigate();
  const scheduleAgentRun = useScheduleAgentRun();
  const isSupport = useIsSupport();
  const { isAuthenticated } = useAuth();
  // Pass the already-resolved theme ('light' | 'dark') rather than 'system'.
  // The MCP library's 'auto' mode re-detects via DOM ancestors and can pick
  // up an unrelated scope, which made the Choose LLM drawer render light.
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme;

  const handleSchedule = useCallback<NonNullable<AgentUIProps['onSchedule']>>(
    async (info) => {
      await scheduleAgentRun(info);
    },
    [scheduleAgentRun],
  );

  const [incidentId, setIncidentId] = useState<string | undefined>();
  const [incidentContext, setIncidentContext] = useState<Record<string, any> | undefined>();

  const isAgentDisabled = isAgentRoute(location.pathname);

  useEffect(() => {
    const handler = (e: Event) => {
      if (isAgentDisabled) return;
      const detail = (e as CustomEvent<AgentDrawerOpenDetail>).detail;
      const nextTab = (detail?.tab ?? 'run') as AgentRunDrawerTab;
      if (detail?.defaultInput !== undefined) {
        setDefaultInput(detail.defaultInput);
      }
      if (detail?.autoSubmit !== undefined) {
        setAutoSubmit(detail.autoSubmit);
      }
      if (detail?.incidentId !== undefined) {
        setIncidentId(detail.incidentId);
      }
      if (detail?.incidentContext !== undefined) {
        setIncidentContext(detail.incidentContext);
      }
      setInitialTab(nextTab);
      setOpen(true);
      try {
        localStorage.setItem('shuffle_agent_drawer_open', 'true');
        localStorage.setItem('shuffle_agent_drawer_tab', nextTab);
      } catch { /* ignore */ }
    };
    window.addEventListener(AGENT_DRAWER_OPEN_EVENT, handler);
    return () => window.removeEventListener(AGENT_DRAWER_OPEN_EVENT, handler);
  }, [isAgentDisabled]);

  // Auto-close if user navigates to /agents or /agent
  useEffect(() => {
    if (isAgentDisabled && open) {
      setOpen(false);
      try {
        localStorage.setItem('shuffle_agent_drawer_open', 'false');
      } catch { /* ignore */ }
    }
  }, [isAgentDisabled, open]);

  // Broadcast Ask AI drawer open state so other UI elements (like DemoResumePill) reactively hide/show
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).__shuffleAskAiOpen = open;
    try {
      if (open) {
        document.documentElement.dataset.askAiOpen = 'true';
      } else {
        delete document.documentElement.dataset.askAiOpen;
      }
      window.dispatchEvent(
        new CustomEvent(AGENT_DRAWER_STATE_EVENT, { detail: { open } }),
      );
    } catch { /* ignore */ }
  }, [open]);

  // Listen for closeAgentDrawer events
  useEffect(() => {
    const handleClose = () => {
      setOpen(false);
      try {
        localStorage.setItem('shuffle_agent_drawer_open', 'false');
      } catch { /* ignore */ }
    };
    window.addEventListener(AGENT_DRAWER_CLOSE_EVENT, handleClose);
    return () => window.removeEventListener(AGENT_DRAWER_CLOSE_EVENT, handleClose);
  }, []);

  // Legacy: ?openPermissions=1 still works from any non-agent page.
  useEffect(() => {
    if (isAgentDisabled) return;
    const params = new URLSearchParams(location.search);
    if (params.get('openPermissions') === '1') {
      setInitialTab('permissions');
      setOpen(true);
      try {
        localStorage.setItem('shuffle_agent_drawer_open', 'true');
        localStorage.setItem('shuffle_agent_drawer_tab', 'permissions');
      } catch { /* ignore */ }
      params.delete('openPermissions');
      navigate(
        { pathname: location.pathname, search: params.toString() ? `?${params}` : '' },
        { replace: true },
      );
    }
  }, [isAgentDisabled, location.search, location.pathname, navigate]);

  if (!mounted) {
    return null;
  }

  return (
    <AskAiWidget
      open={open}
      sideshift={sideshift}
      onOpenChange={(nextOpen: boolean) => {
        setOpen(nextOpen);
        try {
          localStorage.setItem('shuffle_agent_drawer_open', String(nextOpen));
        } catch { /* ignore */ }
        if (!nextOpen) {
          setInitialTab('run');
          setDefaultInput('');
          setAutoSubmit(false);
          setIncidentId(undefined);
          setIncidentContext(undefined);
          try {
            localStorage.setItem('shuffle_agent_drawer_tab', 'run');
          } catch { /* ignore */ }
        }
      }}
      isSupport={isSupport}
      isLoggedIn={isAuthenticated}
      defaultInput={defaultInput}
      requireSupport={true}
      initialTab={initialTab}
      pathname={location.pathname}
      search={location.search}
      globalUrl={API_CONFIG.baseUrl}
      theme={theme}
      permissionsSlot={<PermissionsPanel compact />}
      localLLMSlot={<LocalLLMConfig globalUrl={API_CONFIG.baseUrl} />}
      agentUIProps={{
        onSchedule: handleSchedule,
        apiBaseUrl: API_CONFIG.baseUrl,
        theme,
        isSupport,
        defaultInput,
        autoSubmit,
        incidentId,
        incidentContext,
      }}
    />
  );
};

export default GlobalAgentDrawer;
