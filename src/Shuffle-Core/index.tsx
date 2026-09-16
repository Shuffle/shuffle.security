/**
 * Shuffle-Core — standalone React surfaces extracted from the Shuffle
 * Security host app.
 *
 * Layout:
 *   views/        Page-level surfaces (FormInput, Usecases, UsecaseAlluvialDiagram)
 *   components/   Reusable building blocks (EditWorkflow, RecentWorkflow, stubs)
 *   api.ts        Standalone API helpers — KEEP IN SYNC with src/Shuffle-MCPs/api.ts
 *
 * Every exported view/component is wrapped in `ShuffleCoreThemeProvider`
 * ensuring unified theming and token styles matching Shuffle Security.
 */

import "./shuffle-core.css";
import React from "react";
import {
  ShuffleCoreThemeProvider,
  type ShuffleColorMode,
} from "./components/ShuffleCoreThemeProvider";
import {
  QueryClient,
  QueryClientProvider,
  QueryClientContext,
} from "@tanstack/react-query";

import UsecasesRaw, {
  UsecaseDrawer as UsecaseDrawerRaw,
  type UsecaseDrawerProps,
  type UsecasesPageProps,
} from "./views/Usecases";
import UsecaseAlluvialDiagramRaw from "./views/UsecaseAlluvialDiagram";
import FormInputRaw from "./views/FormInput";
import EditWorkflowRaw from "./components/EditWorkflow";
import RecentWorkflowRaw from "./components/RecentWorkflow";
import AutomationDashboardRaw from "./components/dashboard/AutomationDashboard";
import DashboardOverviewRaw from "./components/dashboard/DashboardOverview";
import AgentsDashboardRaw from "./components/dashboard/AgentsDashboard";
import VulnerabilitiesDashboardRaw from "./components/dashboard/VulnerabilitiesDashboard";
import CombinedDashboardRaw from "./components/dashboard/CombinedDashboard";
import BillingRaw from "./views/Billing";
import TenantManagementRaw from "./views/TenantManagement";
import LoginPageRaw, { type LoginPageProps } from "./views/LoginPage";
import AdminSetupRaw, { type AdminSetupProps } from "./views/AdminSetup";

/**
 * Wrap a Shuffle-Core surface in the theme provider. Every exported
 * component accepts an optional `theme` prop:
 *   - `"light"` / `"dark"` — pin the subtree to that scheme
 *   - `"system"` — follow the host page's `.dark` class on `<html>`
 *
 * If `theme` is omitted, defaults to `"dark"` (Shuffle's primary surface).
 * Callers can always override by passing `theme="light"` or `theme="system"`.
 *
 * `colorMode` is kept as a legacy alias (`"auto"` == `"system"`). We avoid
 * the name `mode` so we don't collide with component-specific props
 * (e.g. AutomationDashboard's `mode: 'apps' | 'workflows'`).
 */
export type ShuffleTheme = "light" | "dark" | "system";
type WithTheme<P> = P & { theme?: ShuffleTheme; colorMode?: ShuffleColorMode };

const resolveMode = (
  theme?: ShuffleTheme,
  colorMode?: ShuffleColorMode,
): ShuffleColorMode => {
  if (theme === "light" || theme === "dark") return theme;
  if (theme === "system") return "auto";
  if (colorMode) return colorMode;
  return "auto";
};

/**
 * Lazily-created fallback QueryClient. Shuffle-Core hooks use
 * @tanstack/react-query, so standalone consumers (host apps that don't ship
 * their own QueryClientProvider) need one provided by the library itself.
 * We create exactly one and reuse it across all wrapped surfaces.
 */
let fallbackQueryClient: QueryClient | null = null;
const getFallbackQueryClient = (): QueryClient => {
  if (!fallbackQueryClient) {
    fallbackQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
    });
  }
  return fallbackQueryClient;
};

const EnsureQueryClient: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // If a host QueryClientProvider already exists, reuse it; otherwise install
  // our own fallback so hooks like useQuery don't blow up.
  const hostClient = React.useContext(QueryClientContext);
  if (hostClient) return <>{children}</>;
  return (
    <QueryClientProvider client={getFallbackQueryClient()}>
      {children}
    </QueryClientProvider>
  );
};

const withTheme = <P extends object>(
  Inner: React.ComponentType<P>,
  displayName: string,
) => {
  const Wrapped: React.FC<WithTheme<P>> = ({ theme, colorMode, ...rest }) => (
    <EnsureQueryClient>
      <ShuffleCoreThemeProvider mode={resolveMode(theme, colorMode)}>
        {/* Forward `theme` to the inner component too — internal scoped
         *  surfaces (e.g. Usecases, UsecaseDrawer) need it for their own
         *  `.dark` / `.light` class on the scope wrapper, AND composed
         *  surfaces (CombinedDashboard → UsecaseDrawer) need to pass it
         *  through. Stripping it broke that chain. */}
        <Inner {...(rest as P)} theme={theme} colorMode={colorMode} />
      </ShuffleCoreThemeProvider>
    </EnsureQueryClient>
  );
  Wrapped.displayName = `ShuffleCore(${displayName})`;
  return Wrapped;
};

export const Usecases = withTheme<UsecasesPageProps>(UsecasesRaw, "Usecases");
export const UsecaseDrawer = withTheme(UsecaseDrawerRaw, "UsecaseDrawer");
export type { UsecaseDrawerProps };
export const UsecaseAlluvialDiagram = withTheme(
  UsecaseAlluvialDiagramRaw,
  "UsecaseAlluvialDiagram",
);
export const FormInput = withTheme(FormInputRaw, "FormInput");
export const EditWorkflow = withTheme(EditWorkflowRaw, "EditWorkflow");
export const RecentWorkflow = withTheme(RecentWorkflowRaw, "RecentWorkflow");
export const AutomationDashboard = withTheme(
  AutomationDashboardRaw,
  "AutomationDashboard",
);
export const DashboardOverview = withTheme(
  DashboardOverviewRaw,
  "DashboardOverview",
);
export const AgentsDashboard = withTheme(AgentsDashboardRaw, "AgentsDashboard");
export const VulnerabilitiesDashboard = withTheme(
  VulnerabilitiesDashboardRaw,
  "VulnerabilitiesDashboard",
);
export const CombinedDashboard = withTheme(
  CombinedDashboardRaw,
  "CombinedDashboard",
);
export const Billing = withTheme(BillingRaw as any, "Billing");
export const TenantManagement = withTheme(
  TenantManagementRaw as any,
  "TenantManagement",
);
export const LoginPage = withTheme<LoginPageProps>(LoginPageRaw, "LoginPage");
export const AdminSetup = withTheme<AdminSetupProps>(
  AdminSetupRaw,
  "AdminSetup",
);
export type { LoginPageProps, AdminSetupProps };
export type { TenantManagementProps } from "./views/TenantManagement";
export type { AutomationDashboardProps } from "./components/dashboard/AutomationDashboard";
export type { AgentsDashboardProps } from "./components/dashboard/AgentsDashboard";
export type { VulnerabilitiesDashboardProps } from "./components/dashboard/VulnerabilitiesDashboard";
export type {
  CombinedDashboardProps,
  DashboardTab,
} from "./components/dashboard/CombinedDashboard";
export {
  DASHBOARD_TABS,
  TAB_LABELS,
} from "./components/dashboard/CombinedDashboard";
export { AUTOMATION_RANGE_OPTIONS } from "./components/dashboard/AutomationDashboard";
export type { ShuffleCoreHostProps } from "./types/host-props";

export default Usecases;

export { ShuffleCoreThemeProvider };
export type { ShuffleColorMode };
export { usePageMeta } from "./usePageMeta";
export { toast, setToastImpl } from "./toast";
export {
  API_CONFIG,
  API_ENDPOINTS,
  getApiUrl,
  getAuthHeader,
  isCloudDomain,
  isShuffleCloudDomain,
  mapCloudRegionUrl,
  shuffleFetch,
  setRegionUrl,
  resetRegionUrl,
  applyRegionFromPayload,
  setHostBaseUrl,
  getHostBaseUrl,
  getShuffleCoreBaseUrl,
  getShuffleCoreUrl,
  getShuffleCoreWorkflowUrl,
  getShuffleSecurityBaseUrl,
  getShuffleSecurityUrl,
  SHUFFLE_AUTOMATION_URL,
} from "./api";
export { useSyncHostBaseUrl } from "./useSyncHostBaseUrl";
export { installFetchBreaker, registerProtectedOrigin } from "./fetchBreaker";

// Onboarding flow — shared between Shuffle Core and Shuffle Security.
import {
  OnboardingFlow as OnboardingFlowRaw,
  ProductChoiceStep as ProductChoiceStepRaw,
} from "./onboarding";
export const OnboardingFlow = withTheme(OnboardingFlowRaw, "OnboardingFlow");
export const ProductChoiceStep = withTheme(
  ProductChoiceStepRaw,
  "ProductChoiceStep",
);
export type { OnboardingFlowProps, OnboardingProduct } from "./onboarding";

// Add-app modal — shared between Shuffle Core and Shuffle Security.
import {
  AddAppDialog as AddAppDialogRaw,
  AddAppButton as AddAppButtonRaw,
} from "./components/AddAppDialog";
export const AddAppDialog = withTheme(AddAppDialogRaw, "AddAppDialog");
export const AddAppButton = withTheme(AddAppButtonRaw, "AddAppButton");
export type {
  AddAppDialogProps,
  AddAppButtonProps,
} from "./components/AddAppDialog";

// Workflow run explorer — shared between Shuffle Automation and Shuffle Security.
import {
  WorkflowRunExplorer as WorkflowRunExplorerRaw,
  WorkflowRunExplorerDrawer as WorkflowRunExplorerDrawerRaw,
} from "./components/WorkflowRunExplorer";
export const WorkflowRunExplorer = withTheme(
  WorkflowRunExplorerRaw,
  "WorkflowRunExplorer",
);
export const WorkflowRunExplorerDrawer = withTheme(
  WorkflowRunExplorerDrawerRaw,
  "WorkflowRunExplorerDrawer",
);
export type {
  WorkflowRunExplorerProps,
  WorkflowRunExplorerDrawerProps,
  WorkflowExecution,
} from "./components/WorkflowRunExplorer";

// Category automations dialog — shared between Shuffle Core and Shuffle Security.
import { CategoryAutomationsDialog as CategoryAutomationsDialogRaw } from "./components/CategoryAutomationsDialog";
export const CategoryAutomationsDialog = withTheme(
  CategoryAutomationsDialogRaw,
  "CategoryAutomationsDialog",
);
export type { CategoryAutomationsDialogProps } from "./components/CategoryAutomationsDialog";

// Notifications drawer — usable anywhere in the platform.
import NotificationsDrawerRaw from "./components/NotificationsDrawer";
export const NotificationsDrawer = withTheme(
  NotificationsDrawerRaw,
  "NotificationsDrawer",
);
export { NOTIFICATIONS_OPEN_EVENT } from "./components/NotificationsDrawer";
export type {
  NotificationsDrawerProps,
  ExecutionNotification,
} from "./components/NotificationsDrawer";

// Unified Search Dialog (Command Palette) — shared between Shuffle Core and Shuffle Security
import SearchDialogRaw from "./components/SearchDialog";
export const SearchDialog = withTheme(
  SearchDialogRaw,
  "SearchDialog",
);
export {
  SEARCH_OPEN_EVENT,
  BASE_NAV_ITEMS,
  SYNONYM_MAP,
  getSynonymsForQuery,
  algoliaDocToItem,
} from "./components/SearchDialog";
export type {
  SearchDialogProps,
  SearchResult,
  NavResult,
  OrgWorkflowResult,
  PublicWorkflowResult,
  AppResult,
  DocResult,
  CorrelationResult,
  AlgoliaDocHit,
  AlgoliaSearchApp,
  DocItem,
  CorrelationItem,
} from "./components/SearchDialog";

// Notification settings (device push, critical pager, agent requests, general
// alerts) + on-call duty menu — usable anywhere in the platform.
import {
  PagerNotificationSettings as PagerNotificationSettingsRaw,
  type PagerNotificationSettingsProps,
} from "./components/notifications/PagerNotificationSettings";
export const NotificationSettings = withTheme<PagerNotificationSettingsProps>(
  PagerNotificationSettingsRaw,
  "NotificationSettings",
);
export type { PagerNotificationSettingsProps as NotificationSettingsProps } from "./components/notifications/PagerNotificationSettings";

// On-call scheduling — the schedule manager rendered inside NotificationSettings.
import { OnCallScheduleManager as OnCallScheduleManagerRaw } from "./components/users/OnCallScheduleManager";
export const OnCallScheduleManager = withTheme(
  OnCallScheduleManagerRaw as any,
  "OnCallScheduleManager",
);
export { computeDefaultPolicy } from "./components/users/OnCallScheduleManager";
export type {
  OnCallUser,
  AssignmentConfig,
  UserSchedule,
  EscalationLevel,
} from "./components/users/OnCallScheduleManager";

// Notification services powering the surfaces above.
export {
  getPagerSettings,
  savePagerSettings,
  requestNotificationPermissions,
  testPagerCall,
  dispatchCriticalPage,
  dispatchAgentRequestNotification,
  dispatchGeneralNotification,
} from "./services/pagerNotificationService";
export type {
  PagerSettings,
  PagerIncident,
  NotificationType,
} from "./services/pagerNotificationService";
export {
  fetchNotificationDevices,
  saveNotificationDevice,
  resolveDevicePreferences,
  getLocalDeviceId,
  getLocalDeviceName,
  getLocalDevicePlatform,
} from "./services/notificationDevices";
export type {
  NotificationDevice,
  DevicePreferences,
} from "./services/notificationDevices";

// OAuth 2.1 authorization consent surface for MCPs and integrations
import {
  OAuthAuthorizeView as OAuthAuthorizeViewRaw,
  type OAuthAuthorizeViewProps,
  type OAuthScopeDetail,
  type OrganizationLike,
  type UserInfoLike,
} from "./components/oauth/OAuthAuthorizeView";
export const OAuthAuthorizeView = withTheme<OAuthAuthorizeViewProps>(
  OAuthAuthorizeViewRaw,
  "OAuthAuthorizeView",
);
export type {
  OAuthAuthorizeViewProps,
  OAuthScopeDetail,
  OrganizationLike,
  UserInfoLike,
};

// Cross-domain authentication handoff between Shuffle Security and Shuffle Core
export {
  navigateToShuffleCore,
  navigateToShuffleSecurity,
  directNavigate,
  hasActiveSession,
  isShuffleCoreUrl,
  isShuffleSecurityUrl,
  resolveShuffleCoreTargetUrl,
  resolveShuffleSecurityTargetUrl,
  UK_SHUFFLE_SECURITY_BASE,
  UK_SHUFFLE_CORE_BASE,
  UK_AUTH_HANDOFF_ENDPOINT,
  UK_AUTH_EXCHANGE_ENDPOINT,
  UK_SHUFFLE_SECURITY_AUTH_HANDOFF_ENDPOINT,
  UK_SHUFFLE_SECURITY_AUTH_EXCHANGE_ENDPOINT,
  UK_SHUFFLE_CORE_AUTH_HANDOFF_ENDPOINT,
  UK_SHUFFLE_CORE_AUTH_EXCHANGE_ENDPOINT,
} from "./lib/authHandoff";
export type { HandoffOptions } from "./lib/authHandoff";

// Host monitor control and deployment — shared between Shuffle Security and Shuffle Automation
import {
  MonitorHostTable as MonitorHostTableRaw,
  type MonitorHostTableProps,
} from "./views/monitors/MonitorHostTable";
export const MonitorHostTable = withTheme<MonitorHostTableProps>(
  MonitorHostTableRaw,
  "MonitorHostTable",
);
export type { MonitorHostTableProps } from "./views/monitors/MonitorHostTable";

import {
  AddHostDialog as AddHostDialogRaw,
  type AddHostDialogProps,
  type MonitoringGroupLike,
} from "./views/monitors/AddHostDialog";
export const AddHostDialog = withTheme<AddHostDialogProps>(
  AddHostDialogRaw,
  "AddHostDialog",
);
export type { AddHostDialogProps, MonitoringGroupLike };

// Workflow run debugger — shared between Shuffle Security and Shuffle Automation
import {
  WorkflowRunDebugger as WorkflowRunDebuggerRaw,
  type WorkflowRunDebuggerProps,
} from "./views/WorkflowRunDebugger";
export const WorkflowRunDebugger = withTheme<WorkflowRunDebuggerProps>(
  WorkflowRunDebuggerRaw,
  "WorkflowRunDebugger",
);
export type { WorkflowRunDebuggerProps };

// Date & Time pickers — shared zero-dependency date pickers replacing @mui/x-date-pickers
export {
  DateTimePicker,
  DatePicker,
  TimePicker,
  DateRangePicker,
  LocalizationProvider,
  AdapterDayjs,
} from "./components/DateTimePicker";
export type {
  DateTimePickerProps,
  DateTimePickerMode,
  DateTimePreset,
  DateRangePickerProps,
} from "./components/DateTimePicker";


