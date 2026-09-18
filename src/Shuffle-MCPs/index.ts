/**
 * Local Singul Library — fully self-contained.
 * No host-app `@/` imports remain inside this folder (assets aside).
 */

// Side-effect import: ensures shadcn-style token fallbacks (--card, --background,
// --border, --foreground, --muted, --primary, etc.) are always defined when any
// lib component is used standalone in a host app that does NOT define those
// CSS custom properties. Host overrides still win (defaults use :where(:root),
// specificity 0).
import './shuffle-mcp.css';
import React from 'react';
import { ShuffleMcpThemeProvider, type ShuffleMcpColorMode } from '@/Shuffle-MCPs/ShuffleMcpThemeProvider';

/**
 * Every exported component accepts an optional `theme` prop:
 *   - `"light"` / `"dark"` — pin the subtree to that scheme
 *   - `"system"` — follow the host page's `.dark` class on `<html>`
 *
 * If `theme` is omitted, defaults to `"dark"` (Shuffle's primary surface).
 * Callers can always override by passing `theme="light"` or `theme="system"`.
 *
 * `colorMode` is preserved as a legacy alias (`"auto"` == `"system"`).
 */
export type ShuffleTheme = 'light' | 'dark' | 'system';
type WithTheme<P> = P & { theme?: ShuffleTheme; colorMode?: ShuffleMcpColorMode };

const resolveMode = (theme?: ShuffleTheme, colorMode?: ShuffleMcpColorMode): ShuffleMcpColorMode => {
  if (theme === 'light' || theme === 'dark') return theme;
  if (theme === 'system') return 'auto';
  if (colorMode) return colorMode;
  return 'auto';
};

const withMcpTheme = <P extends object>(Inner: React.ComponentType<P>, displayName: string) => {
  const Wrapped: React.FC<WithTheme<P>> = ({ theme, colorMode, ...rest }) =>
    React.createElement(
      ShuffleMcpThemeProvider,
      { mode: resolveMode(theme, colorMode) },
      React.createElement(Inner as React.ComponentType<any>, { ...(rest as P), theme, colorMode }),
    );
  Wrapped.displayName = `ShuffleMCPs(${displayName})`;
  return Wrapped as React.ComponentType<WithTheme<P>>;
};

const withMcpThemeRef = <P extends object, R>(Inner: React.ForwardRefExoticComponent<P & React.RefAttributes<R>>, displayName: string) => {
  const Wrapped = React.forwardRef<R, WithTheme<P>>(({ theme, colorMode, ...rest }, ref) =>
    React.createElement(
      ShuffleMcpThemeProvider,
      { mode: resolveMode(theme, colorMode) },
      React.createElement(Inner as React.ComponentType<any>, { ...(rest as P), theme, colorMode, ref }),
    ),
  );
  Wrapped.displayName = `ShuffleMCPs(${displayName})`;
  return Wrapped as React.ForwardRefExoticComponent<WithTheme<P> & React.RefAttributes<R>>;
};

import { ShuffleMCP as ShuffleMCPRaw } from '@/Shuffle-MCPs/views/ShuffleMCP';
import AppDetailDrawerRaw, { checkAppNameMatch } from '@/Shuffle-MCPs/views/AppDetailDrawer';
import AppDetailContentRaw, { type AppDetailContentProps, type AppInfo } from '@/Shuffle-MCPs/views/AppDetailContent';
import AppSearchDrawerRaw from '@/Shuffle-MCPs/views/AppSearchDrawer';
import AiAgentPromptsEditorRaw from '@/Shuffle-MCPs/components/AiAgentPromptsEditor';
import ShufflePipelinesBannerRaw from '@/Shuffle-MCPs/components/ShufflePipelinesBanner';
import AppTitleHeaderRaw from '@/Shuffle-MCPs/components/AppTitleHeader';
import AppAuthSectionRaw from '@/Shuffle-MCPs/components/AppAuthSection';
import TryMcpSectionRaw from '@/Shuffle-MCPs/views/TryMcpSection';
import SingulActionsPreviewRaw from '@/Shuffle-MCPs/components/SingulActionsPreview';
import AgentUIRaw, { VERIFIED_BUILTIN_APPS } from '@/Shuffle-MCPs/components/AgentUI';
import AgentRunDrawerRaw from '@/Shuffle-MCPs/components/AgentRunDrawer';
import AgentActivityListRaw from '@/Shuffle-MCPs/components/AgentActivityList';
import AgentExecutionDrawerRaw from '@/Shuffle-MCPs/components/AgentExecutionDrawer';
import AgentsViewRaw from '@/Shuffle-MCPs/views/AgentsView';
import AgentRunDiagnosisBannerRaw from '@/Shuffle-MCPs/components/AgentRunDiagnosisBanner';
import LocalLLMConfigRaw from '@/Shuffle-MCPs/components/LocalLLMConfig';
import AddAppModalRaw from '@/Shuffle-MCPs/components/AddAppModal';
import AskAiButtonRaw from '@/Shuffle-MCPs/components/AskAiButton';
import AskAiDrawerRaw from '@/Shuffle-MCPs/components/AskAiDrawer';
import AskAiSidePanelRaw, {
  ASK_AI_PANEL_WIDTH_STORAGE_KEY,
  MIN_ASK_AI_PANEL_WIDTH,
  MAX_ASK_AI_PANEL_WIDTH,
} from '@/Shuffle-MCPs/components/AskAiSidePanel';
import AskAiWidgetRaw from '@/Shuffle-MCPs/components/AskAiWidget';

export { ShuffleMcpThemeProvider } from '@/Shuffle-MCPs/ShuffleMcpThemeProvider';
export type { ShuffleMcpColorMode, ShuffleMcpThemeProviderProps } from '@/Shuffle-MCPs/ShuffleMcpThemeProvider';

export type { ShuffleHostProps } from '@/Shuffle-MCPs/host-props';

export const ShuffleMCP = withMcpThemeRef(ShuffleMCPRaw as React.ForwardRefExoticComponent<any>, 'ShuffleMCP');
export default ShuffleMCP;
export type { ShuffleMCPHandle } from '@/Shuffle-MCPs/views/ShuffleMCP';
export const AppDetailDrawer = withMcpTheme(AppDetailDrawerRaw as React.ComponentType<any>, 'AppDetailDrawer');
export const AppDetailContent = withMcpTheme(AppDetailContentRaw as React.ComponentType<any>, 'AppDetailContent');
export type { AppDetailContentProps, AppInfo } from '@/Shuffle-MCPs/views/AppDetailContent';
export { checkAppNameMatch } from '@/Shuffle-MCPs/views/AppDetailDrawer';
export const AppSearchDrawer = withMcpTheme(AppSearchDrawerRaw as React.ComponentType<any>, 'AppSearchDrawer');
export const AiAgentPromptsEditor = withMcpTheme(AiAgentPromptsEditorRaw as React.ComponentType<any>, 'AiAgentPromptsEditor');
export type { AiAgentPromptsEditorProps } from '@/Shuffle-MCPs/components/AiAgentPromptsEditor';
export const ShufflePipelinesBanner = withMcpTheme(ShufflePipelinesBannerRaw as React.ComponentType<any>, 'ShufflePipelinesBanner');
export const AppTitleHeader = withMcpTheme(AppTitleHeaderRaw as React.ComponentType<any>, 'AppTitleHeader');
export type { AppTitleHeaderProps } from '@/Shuffle-MCPs/components/AppTitleHeader';
export const AppAuthSection = withMcpTheme(AppAuthSectionRaw as React.ComponentType<any>, 'AppAuthSection');
export type { AppAuthSectionProps } from '@/Shuffle-MCPs/components/AppAuthSection';
export const TryMcpSection = withMcpTheme(TryMcpSectionRaw as React.ComponentType<any>, 'TryMcpSection');
export type { TryMcpSectionProps } from '@/Shuffle-MCPs/views/TryMcpSection';
export const SingulActionsPreview = withMcpTheme(SingulActionsPreviewRaw as React.ComponentType<any>, 'SingulActionsPreview');
export const AgentUI = withMcpTheme(AgentUIRaw as React.ComponentType<any>, 'AgentUI');
export type { AgentUIProps, AgentUIApp } from '@/Shuffle-MCPs/components/AgentUI';
export { VERIFIED_BUILTIN_APPS } from '@/Shuffle-MCPs/components/AgentUI';
export { AgentPresets, AGENT_PRESETS } from '@/Shuffle-MCPs/components/AgentPresets';
export type { AgentPreset, AgentPresetsProps } from '@/Shuffle-MCPs/components/AgentPresets';
export { AgentPromptPrefixChip } from '@/Shuffle-MCPs/components/AgentPromptPrefixChip';
export type { AgentPromptPrefixChipProps } from '@/Shuffle-MCPs/components/AgentPromptPrefixChip';
export {
  useAgentPromptPrefix,
  AGENT_PROMPT_PREFIX_CATEGORY,
  DEFAULT_AGENT_PROMPT_PREFIX,
} from '@/Shuffle-MCPs/useAgentPromptPrefix';
export type { UseAgentPromptPrefixOptions } from '@/Shuffle-MCPs/useAgentPromptPrefix';
export const AgentRunDrawer = withMcpTheme(AgentRunDrawerRaw as React.ComponentType<any>, 'AgentRunDrawer');
export type { AgentRunDrawerProps, AgentRunDrawerTab } from '@/Shuffle-MCPs/components/AgentRunDrawer';
export const AskAiButton = withMcpTheme(AskAiButtonRaw as React.ComponentType<any>, 'AskAiButton');
export type { AskAiButtonProps } from '@/Shuffle-MCPs/components/AskAiButton';
export const AskAiDrawer = withMcpTheme(AskAiDrawerRaw as React.ComponentType<any>, 'AskAiDrawer');
export type { AskAiDrawerProps } from '@/Shuffle-MCPs/components/AskAiDrawer';
export const AskAiSidePanel = withMcpTheme(AskAiSidePanelRaw as React.ComponentType<any>, 'AskAiSidePanel');
export type { AskAiSidePanelProps } from '@/Shuffle-MCPs/components/AskAiSidePanel';
export {
  ASK_AI_PANEL_WIDTH_STORAGE_KEY,
  MIN_ASK_AI_PANEL_WIDTH,
  MAX_ASK_AI_PANEL_WIDTH,
} from '@/Shuffle-MCPs/components/AskAiSidePanel';
export const AskAiWidget = withMcpTheme(AskAiWidgetRaw as React.ComponentType<any>, 'AskAiWidget');
export type { AskAiWidgetProps } from '@/Shuffle-MCPs/components/AskAiWidget';
export {
  useContextAwareAgent,
  AGENT_DRAWER_OPEN_EVENT,
  AGENT_DRAWER_CLOSE_EVENT,
  AGENT_DRAWER_STATE_EVENT,
} from '@/Shuffle-MCPs/components/AskAiWidget';
export {
  registerAgentContextRule,
  getAgentContextRules,
  resolveAgentContext,
  getPageContextChoice,
  setPageContextChoice,
  clearPageContextChoice,
  DEFAULT_AGENT_CONTEXT_RULES,
  matchRoutePattern,
  isAgentRoute,
  getActivePageEntityName,
} from '@/Shuffle-MCPs/agentContextRegistry';
export type {
  AgentContextRule,
  AgentResolvedContext,
  AgentContextApp,
  PageContextChoice,
} from '@/Shuffle-MCPs/agentContextRegistry';
export const AgentActivityList = withMcpTheme(AgentActivityListRaw as React.ComponentType<any>, 'AgentActivityList');
export type { AgentActivityListProps } from '@/Shuffle-MCPs/components/AgentActivityList';
export const AgentExecutionDrawer = withMcpTheme(AgentExecutionDrawerRaw as React.ComponentType<any>, 'AgentExecutionDrawer');
export type { AgentExecutionDrawerProps } from '@/Shuffle-MCPs/components/AgentExecutionDrawer';
export const AgentsView = withMcpTheme(AgentsViewRaw as React.ComponentType<any>, 'AgentsView');
export type { AgentsViewProps } from '@/Shuffle-MCPs/views/AgentsView';
export const AgentRunDiagnosisBanner = withMcpTheme(AgentRunDiagnosisBannerRaw as React.ComponentType<any>, 'AgentRunDiagnosisBanner');
export const LocalLLMConfig = withMcpTheme(LocalLLMConfigRaw as React.ComponentType<any>, 'LocalLLMConfig');
export type { LocalLLMConfigProps, AgentLocalModel, LocalLLMTestResult } from '@/Shuffle-MCPs/components/LocalLLMConfig';
export const AddAppModal = withMcpTheme(AddAppModalRaw as React.ComponentType<any>, 'AddAppModal');
export type { AddAppModalProps } from '@/Shuffle-MCPs/components/AddAppModal';
export { useAppAuthFlow } from '@/Shuffle-MCPs/useAppAuthFlow';
export {
  parseRunResult,
  getFailureInfo,
  hasOutputWarning,
  diagnoseOutputWarning,
} from '@/Shuffle-MCPs/agentDiagnosis';
export type {
  DiagnosableRun,
  DiagnosisEvidence,
  OutputDiagnosis,
} from '@/Shuffle-MCPs/agentDiagnosis';
export { searchAgentActivity, scheduleAgentRun } from '@/Shuffle-MCPs/agentActivity';
export { DEMO_AGENT_RUNS } from '@/Shuffle-MCPs/demoAgentActivity';
export type {
  AgentRun,
  AgentRunResult,
  AgentDecision,
  AgentActivityResponse,
  AgentActivityParams,
} from '@/Shuffle-MCPs/agentActivity';
export { useAppLookup } from '@/Shuffle-MCPs/useAppLookup';
export type { AppLookupResult } from '@/Shuffle-MCPs/useAppLookup';
export {
  resolveApp,
  resolveApps,
  seedResolvedApp,
  invalidateResolvedApps,
} from '@/Shuffle-MCPs/resolveApp';
export type { ResolvedApp } from '@/Shuffle-MCPs/resolveApp';
export { IntegrationStatus, refreshAllIntegrationStatus } from '@/Shuffle-MCPs/components/IntegrationStatus';
export { useAppAuth } from '@/Shuffle-MCPs/useAppAuth';
export { AppDetailProvider, useAppDetail, useAppDetailOptional } from '@/Shuffle-MCPs/AppDetailContext';
export { API_CONFIG, getApiUrl, getAuthHeader, isCloud, isOnprem, isCloudDomain, isShuffleCloudDomain, isShuffleSecurityBackend, mapCloudRegionUrl, shuffleFetch, setHostBaseUrl, getHostBaseUrl, setRegionUrl, resetRegionUrl, applyRegionFromPayload } from '@/Shuffle-MCPs/api';
export { useSyncHostBaseUrl } from '@/Shuffle-MCPs/useSyncHostBaseUrl';
export { installFetchBreaker, registerProtectedOrigin } from '@/Shuffle-MCPs/fetchBreaker';
export { setToastImpl, toast } from '@/Shuffle-MCPs/toast';
export type {
  AlgoliaSearchApp,
  AppSelectedEvent,
  AppAuthentication,
  CustomStyles,
  ShuffleMCPProps,
} from '@/Shuffle-MCPs/shuffle-mcp.helpers';

// ---------------------------------------------------------------------------
// Re-exports consumed by @shuffleio/shuffle-core (and other downstream apps).
// Keep this block in sync when Shuffle-Core starts importing new symbols.
// ---------------------------------------------------------------------------

// AgentIcon
export { default as AgentIcon } from '@/Shuffle-MCPs/components/AgentIcon';

// Auth configuration UI + types
export { AppAuthConfig, AppAuthCard } from '@/Shuffle-MCPs/components/AppAuthConfig';
export type {
  AuthStatus,
  AppAuthState,
  ApiAuthEntry,
  AppAuthCardProps,
} from '@/Shuffle-MCPs/components/AppAuthConfig';

// Datastore helpers
export {
  setRuntimeOrgId,
  setDatastoreItem,
  setDatastoreItems,
  getDatastoreItem,
  getDatastoreItemPublic,
  getDatastoreByCategory,
  getDatastorePageSize,
  deleteDatastoreItem,
  deleteDatastoreItems,
  DATASTORE_CATEGORIES,
} from '@/Shuffle-MCPs/datastore';
export type {
  DatastoreItem,
  CategoryAutomation,
  CategoryConfig,
  DatastoreResponse,
  DatastoreDiagnostics,
} from '@/Shuffle-MCPs/datastore';

// Ingestion detection
export {
  EMAIL_APP_PATTERNS,
  CASES_PATTERNS,
  EDR_PATTERNS,
  SIEM_PATTERNS,
  THREAT_INTEL_PATTERNS,
  COMMUNICATION_PATTERNS_NAMES,
  VULN_SCANNER_PATTERNS,
  INGEST_TICKETS_WORKFLOW_NAME,
  FORWARD_TICKETS_WORKFLOW_NAME,
  isEmailApp,
  isThreatIntelApp,
  isVulnScannerApp,
  isIngestionApp,
  normalizeAppName,
  getIngestionCategory,
  extractActionAppNames,
  extractWorkflowAppNames,
  extractWorkflowActionAppNames,
  extractValidatedIngestionApps,
  findIngestTicketsWorkflow,
  findForwardTicketsWorkflow,
  isWorkflowScheduleStopped,
} from '@/Shuffle-MCPs/ingestionDetection';
export type {
  IngestionCategory,
  ValidatedIngestionApp,
} from '@/Shuffle-MCPs/ingestionDetection';

// Apps cache
export {
  fetchApps,
  fetchAppsViaApiConfig,
  invalidateAppsCache,
} from '@/Shuffle-MCPs/appsCache';
export type { FetchAppsOptions } from '@/Shuffle-MCPs/appsCache';

// Usage bar — reusable quota indicator for app runs, agent tokens, etc.
export { UsageBar } from '@/Shuffle-MCPs/components/UsageBar';
export type { UsageBarProps } from '@/Shuffle-MCPs/components/UsageBar';

export { ShuffleMarkdown, default as Markdown } from './components/Markdown';
export { VideoEmbed, resolveVideoUrl } from './components/VideoEmbed';
export { MarkdownJsonBlock } from './components/Markdown';

// Connected sources service
export {
  MAX_AUTO_ASSIGNED_TOOLS,
  resolveConnectedTools,
  mergeConnectedTools,
  getCachedConnectedTools,
  setCachedConnectedTools,
  fetchConnectedTools,
} from '@/Shuffle-MCPs/connectedSourcesService';
export type { ConnectedToolApp } from '@/Shuffle-MCPs/connectedSourcesService';

// Support escalation
export {
  buildSupportEscalationUrl,
  openSupportEscalation,
  resolveContactUserInfo,
} from '@/Shuffle-MCPs/supportEscalation';
export type {
  SupportEscalationContext,
  ResolvedContactUserInfo,
} from '@/Shuffle-MCPs/supportEscalation';

