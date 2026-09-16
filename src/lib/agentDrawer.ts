/**
 * Global Agent Drawer event bus.
 *
 * The Agent (Run / Permissions / Local LLM) drawer is mounted globally in
 * DashboardLayout so it can be opened from anywhere — incident pages,
 * workflow pages, dashboards, etc. Anything that wants to open it just
 * fires `openAgentDrawer(tab)` instead of navigating to /agent.
 */

export type AgentDrawerTab = 'run' | 'permissions' | 'localLLM';

export const AGENT_DRAWER_OPEN_EVENT = 'agent-drawer-open';

export interface AgentDrawerOpenDetail {
  tab?: AgentDrawerTab;
  source?: string;
  defaultInput?: string;
  autoSubmit?: boolean;
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
  options?: { openToolPicker?: boolean; defaultInput?: string; source?: string; autoSubmit?: boolean },
) => {
  window.dispatchEvent(
    new CustomEvent<AgentDrawerOpenDetail>(AGENT_DRAWER_OPEN_EVENT, {
      detail: {
        tab,
        defaultInput: options?.defaultInput,
        source: options?.source,
        autoSubmit: options?.autoSubmit,
      },
    }),
  );
  if (options?.openToolPicker) {
    // Let the drawer mount the Permissions tab before the picker opens.
    window.setTimeout(openAgentToolPicker, 250);
  }
};

