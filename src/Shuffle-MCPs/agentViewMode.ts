/**
 * Which run view AgentUI opens with.
 *
 * The user's own tab choices always beat a host's mount preference, so the tab
 * they last picked stays the tab they get next time. The removed Simple view
 * maps to Chat everywhere, including in values saved before it was removed.
 */
export type AgentRunViewMode = 'detailed' | 'chat';

const asRunView = (value?: string | null): AgentRunViewMode | null => {
  if (value === 'detailed') return 'detailed';
  if (value === 'chat' || value === 'simple') return 'chat';
  return null;
};

export const resolveAgentRunView = (input: {
  /** `?agentView=` on the current URL. */
  urlView?: string | null;
  /** `viewMode` saved for this page's context (per incident, task, route...). */
  contextView?: string | null;
  /** `shuffle-agents-view-mode`: the tab last chosen anywhere in the browser. */
  storedView?: string | null;
  /** The host's `initialView` prop. */
  initialView?: string | null;
}): AgentRunViewMode =>
  asRunView(input.urlView) ??
  asRunView(input.contextView) ??
  asRunView(input.storedView) ??
  asRunView(input.initialView) ??
  'detailed';
