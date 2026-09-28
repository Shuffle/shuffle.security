/**
 * Global Agent Drawer event bus.
 *
 * The Agent (Run / Permissions / Local LLM) drawer is mounted globally in
 * DashboardLayout so it can be opened from anywhere — incident pages,
 * workflow pages, dashboards, etc. Anything that wants to open it just
 * fires `openAgentDrawer(tab)` instead of navigating to /agent.
 */

import { useEffect, useState } from 'react';
import { isAgentRoute } from '@/Shuffle-MCPs/agentContextRegistry';

export type AgentDrawerTab = 'run' | 'permissions' | 'localLLM';

export const AGENT_DRAWER_OPEN_EVENT = 'agent-drawer-open';
export const AGENT_DRAWER_CLOSE_EVENT = 'agent-drawer-close';
export const AGENT_DRAWER_STATE_EVENT = 'agent-drawer-state';

export interface AgentDrawerOpenDetail {
  tab?: AgentDrawerTab;
  source?: string;
  defaultInput?: string;
  autoSubmit?: boolean;
  taskId?: string;
  incidentId?: string;
  incidentContext?: Record<string, any>;
  executionId?: string | null;
  resetExecution?: boolean;
}

export interface AgentDrawerStateDetail {
  open: boolean;
}

/**
 * Fired to auto-open the "Add tool" picker inside the Permissions tab's
 * Assigned tools section.
 */
export const AGENT_TOOL_PICKER_OPEN_EVENT = 'agent-tool-picker-open';

export const openAgentToolPicker = () => {
  window.dispatchEvent(new CustomEvent(AGENT_TOOL_PICKER_OPEN_EVENT));
};

export const openAgentDrawer = (
  tab: AgentDrawerTab = 'run',
  options?: {
    openToolPicker?: boolean;
    defaultInput?: string;
    source?: string;
    autoSubmit?: boolean;
    taskId?: string;
    incidentId?: string;
    incidentContext?: Record<string, any>;
    executionId?: string | null;
    resetExecution?: boolean;
  },
) => {
  window.dispatchEvent(
    new CustomEvent<AgentDrawerOpenDetail>(AGENT_DRAWER_OPEN_EVENT, {
      detail: {
        tab,
        defaultInput: options?.defaultInput,
        source: options?.source,
        autoSubmit: options?.autoSubmit,
        taskId: options?.taskId,
        incidentId: options?.incidentId,
        incidentContext: options?.incidentContext,
        executionId: options?.executionId,
        resetExecution: options?.resetExecution,
      },
    }),
  );
  if (options?.openToolPicker) {
    // Let the drawer mount the Permissions tab before the picker opens.
    window.setTimeout(openAgentToolPicker, 250);
  }
};

export const closeAgentDrawer = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AGENT_DRAWER_CLOSE_EVENT));
  }
};

export const isAgentDrawerOpen = (pathname?: string): boolean => {
  if (typeof window === 'undefined') return false;
  const targetPath = pathname ?? window.location.pathname;
  if (isAgentRoute(targetPath)) return false;
  if (typeof (window as any).__shuffleAskAiOpen === 'boolean') {
    return Boolean((window as any).__shuffleAskAiOpen);
  }
  try {
    return localStorage.getItem('shuffle_agent_drawer_open') === 'true';
  } catch {
    return false;
  }
};

/**
 * Hook to reactively observe whether the Ask AI / Agent drawer is currently open.
 * Can be passed an optional route pathname to react immediately on client routing.
 */
export const useAskAiOpen = (pathname?: string): boolean => {
  const [isOpen, setIsOpen] = useState(() => isAgentDrawerOpen(pathname));

  useEffect(() => {
    setIsOpen(isAgentDrawerOpen(pathname));
  }, [pathname]);

  useEffect(() => {
    const syncState = () => setIsOpen(isAgentDrawerOpen(pathname));
    const handleState = (e: Event) => {
      const detail = (e as CustomEvent<AgentDrawerStateDetail>).detail;
      if (detail && typeof detail.open === 'boolean') {
        const targetPath = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
        setIsOpen(!isAgentRoute(targetPath) && detail.open);
      } else {
        syncState();
      }
    };
    const handleOpen = () => {
      const targetPath = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
      if (!isAgentRoute(targetPath)) {
        setIsOpen(true);
      }
    };
    const handleClose = () => setIsOpen(false);

    window.addEventListener(AGENT_DRAWER_STATE_EVENT, handleState as EventListener);
    window.addEventListener(AGENT_DRAWER_OPEN_EVENT, handleOpen as EventListener);
    window.addEventListener(AGENT_DRAWER_CLOSE_EVENT, handleClose as EventListener);
    window.addEventListener('storage', syncState);
    window.addEventListener('popstate', syncState);

    return () => {
      window.removeEventListener(AGENT_DRAWER_STATE_EVENT, handleState as EventListener);
      window.removeEventListener(AGENT_DRAWER_OPEN_EVENT, handleOpen as EventListener);
      window.removeEventListener(AGENT_DRAWER_CLOSE_EVENT, handleClose as EventListener);
      window.removeEventListener('storage', syncState);
      window.removeEventListener('popstate', syncState);
    };
  }, [pathname]);

  return isOpen;
};
