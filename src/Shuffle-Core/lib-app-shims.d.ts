/**
 * Type-only shims for app-level modules imported by Shuffle-Core library files.
 * These are resolved at runtime by the host app; this file satisfies tsc during
 * the library DTS build without pulling in the full app dependency graph.
 */

/// <reference types="node" />

interface ImportMetaEnv {
  [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '@/hooks/useEntityLabel' {
  export function useEntityPreference(...args: any[]): any;
}

declare module '@/hooks/useHostMonitorCount' {
  export function useHostMonitorCount(...args: any[]): any;
}

declare module '@/hooks/useIOCTypes' {
  export function seedDefaultIOCTypes(...args: any[]): any;
}

declare module '@/hooks/useWorkflowHealth' {
  export interface WorkflowHealthHookResult {
    environments?: any[];
    workflows?: any[];
    isLoading?: boolean;
    refetch?: () => Promise<void>;
    getWorkflowHealth?: (workflow: any) => any;
    getUsecaseHealth?: (usecaseWorkflows: any[]) => any;
    getWebhookHealth?: (mode?: "tickets" | "vulnerabilities") => any;
    getSourceHealth?: (sourceKey: string, mode?: "tickets" | "vulnerabilities") => any;
    [key: string]: any;
  }
  export function useWorkflowHealth(...args: any[]): WorkflowHealthHookResult;
}

declare module '@/services/workflowHealth' {
  export function diagnoseWorkflow(...args: any[]): any;
  export function diagnoseUsecase(...args: any[]): any;
  export function diagnoseWebhookIngestion(...args: any[]): any;
  export function diagnoseIngestionSource(...args: any[]): any;
  export function getWorkflowRuntimeLocation(...args: any[]): any;
  export interface EntityProblem {
    id: string;
    type: any;
    severity: any;
    title: string;
    description: string;
    actionUrl?: string;
    actionLabel?: string;
    [key: string]: any;
  }
  export interface EntityHealth {
    status?: any;
    hasProblem?: boolean;
    primaryProblem?: EntityProblem;
    problems?: EntityProblem[];
    activeCount?: number;
    blockedCount?: number;
    [key: string]: any;
  }
  export type WorkflowLike = any;
  export type ProblemSeverity = any;
  export type ProblemType = any;
}

declare module '@/components/threat-intel/ThreatIntelReadinessBanner' {
  import * as React from 'react';
  export function ThreatIntelReadinessBanner(props: any): React.ReactElement | null;
}

declare module '@/components/common/ShuffleLogo' {
  import * as React from 'react';
  export function ShuffleCompanyLogo(props: any): React.ReactElement | null;
  export function ShuffleLogo(props: any): React.ReactElement | null;
  export function ShuffleSecurityLogo(props: any): React.ReactElement | null;
}

declare module '@/context/AuthContext' {
  export function useAuth(...args: any[]): any;
  export function useOptionalAuth(...args: any[]): any;
  export function AuthFallbackProvider(props: any): any;
}

declare module '@/context/ThemeContext' {
  export function useTheme(...args: any[]): any;
}

declare module '@/hooks/useUsers' {
  export function invalidateUsersCache(...args: any[]): any;
  export function useUsers(...args: any[]): any;
}

declare module '@/hooks/useAgentPermissions' {
  export const DEFAULT_AGENT_PERMISSIONS: any;
}

declare module '@/hooks/useHostActions' {
  export type ActionDebugEntry = any;
  export type PendingDisableRce = any;
  export function useHostActions(...args: any[]): any;
  export function isOutputTruncated(...args: any[]): boolean;
}

declare module '@/hooks/useSubOrgs' {
  export function useSubOrgs(...args: any[]): any;
}

declare module '@/hooks/useVulnerabilities' {
  export type Vulnerability = any;
  export type VulnSeverity = any;
  export function useVulnerabilities(...args: any[]): any;
}

declare module '@/services/demoLiveEnvironment' {
  export const DEMO_HOST_HOSTNAME: string;
  export function restoreOriginalIngestTicketsApps(...args: any[]): any;
}

declare module '@/services/demoMode' {
  export function isDemoActive(...args: any[]): boolean;
}

declare module '@/utils/hostUrlSegment' {
  export function hostUrlSegment(host: any): string;
}

declare module '@/utils/terminalStorageKey' {
  export function terminalStorageKey(...args: any[]): string;
  export function readStoredSession(...args: any[]): any;
  export function registerHostIdentity(...args: any[]): any;
}

declare module '@/components/common/ShareAccessModal' {
  import * as React from 'react';
  export const ShareAccessModal: React.FC<any>;
}

declare module '@/components/monitors/HostNameDisplay' {
  import * as React from 'react';
  export const HostNameDisplay: React.FC<any>;
  export function machineIdFromHostname(hostname: string): string;
}

declare module '@/components/vulnerabilities/VulnerabilityAutomationBanner' {
  import * as React from 'react';
  export const VulnerabilityAutomationBanner: React.FC<any>;
}

declare module '@/components/ui/alert-dialog' {
  import * as React from 'react';
  export const AlertDialog: React.FC<any>;
  export const AlertDialogTrigger: React.FC<any>;
  export const AlertDialogContent: React.FC<any>;
  export const AlertDialogHeader: React.FC<any>;
  export const AlertDialogFooter: React.FC<any>;
  export const AlertDialogTitle: React.FC<any>;
  export const AlertDialogDescription: React.FC<any>;
  export const AlertDialogAction: React.FC<any>;
  export const AlertDialogCancel: React.FC<any>;
}

declare module '@/components/ui/button' {
  import * as React from 'react';
  export const Button: React.ForwardRefExoticComponent<any>;
  export const buttonVariants: any;
  export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: any;
    size?: any;
    asChild?: boolean;
    [key: string]: any;
  }
}

declare module '@/components/ui/checkbox' {
  import * as React from 'react';
  export const Checkbox: React.ForwardRefExoticComponent<any>;
}

declare module '@/components/ui/collapsible' {
  import * as React from 'react';
  export const Collapsible: React.FC<any>;
  export const CollapsibleTrigger: React.FC<any>;
  export const CollapsibleContent: React.FC<any>;
}

declare module '@/components/ui/dialog' {
  import * as React from 'react';
  export const Dialog: React.FC<any>;
  export const DialogTrigger: React.FC<any>;
  export const DialogContent: React.FC<any>;
  export const DialogHeader: React.FC<any>;
  export const DialogFooter: React.FC<any>;
  export const DialogTitle: React.FC<any>;
  export const DialogDescription: React.FC<any>;
  export const DialogClose: React.FC<any>;
  export const DialogOverlay: React.FC<any>;
}

declare module '@/components/ui/input' {
  import * as React from 'react';
  export const Input: React.ForwardRefExoticComponent<any>;
}

declare module '@/components/ui/label' {
  import * as React from 'react';
  export const Label: React.ForwardRefExoticComponent<any>;
}

declare module '@/components/ui/popover' {
  import * as React from 'react';
  export const Popover: React.FC<any>;
  export const PopoverTrigger: React.FC<any>;
  export const PopoverContent: React.FC<any>;
}

declare module '@/components/ui/segmented-control' {
  import * as React from 'react';
  export const SegmentedControl: React.FC<any>;
  export type SegmentedItem<V extends string = string> = any;
}

declare module '@/components/ui/select' {
  import * as React from 'react';
  export const Select: React.FC<any>;
  export const SelectTrigger: React.FC<any>;
  export const SelectValue: React.FC<any>;
  export const SelectContent: React.FC<any>;
  export const SelectItem: React.FC<any>;
  export const SelectGroup: React.FC<any>;
}

declare module '@/components/ui/switch' {
  import * as React from 'react';
  export const Switch: React.ForwardRefExoticComponent<any>;
}

declare module '@/components/ui/tooltip' {
  import * as React from 'react';
  export const TooltipProvider: React.FC<any>;
  export const Tooltip: React.FC<any>;
  export const TooltipTrigger: React.FC<any>;
  export const TooltipContent: React.FC<any>;
}

declare module '@/lib/capacitor' {
  export function isCapacitorNative(): boolean;
}

declare module '@/lib/safeRedirect' {
  export function sanitizeInternalDestination(rawCandidate: string | null | undefined, fallback?: string): string;
}

declare module '@shuffleio/shuffle-mcps' {
  import * as React from 'react';

  export interface ShuffleHostProps {
    globalUrl?: string;
    theme?: any;
    colorMode?: any;
    userdata?: any;
    isLoaded?: boolean;
    isLoggedIn?: boolean;
    serverside?: boolean;
    [key: string]: any;
  }

  export interface ShuffleMCPHandle {
    [key: string]: any;
  }

  export interface AlgoliaSearchApp {
    objectID: string;
    id?: string;
    name: string;
    [key: string]: any;
  }

  export interface AppAuthState {
    [key: string]: any;
  }

  export type IngestionCategory = string;

  export interface ApiAuthEntry {
    [key: string]: any;
  }

  export interface CategoryAutomation {
    [key: string]: any;
  }

  export interface CategoryConfig {
    [key: string]: any;
  }

  export interface AgentRun {
    [key: string]: any;
  }

  export interface IntegrationItem {
    [key: string]: any;
  }

  export type DatastoreItem = any;
  export type DatastoreDiagnostics = any;

  export const IntegrationStatus: React.FC<any> & {
    ACTIVE: string;
    INACTIVE: string;
    PENDING: string;
    ERROR: string;
    CONFIGURING: string;
  };
  export type IntegrationStatus = any;

  export type SearchApp = any;
  export type AgentPreset = any;
  export type AppDetail = any;

  export const AgentIcon: React.FC<any>;
  export const AgentPresets: any;
  export const AiAgentPromptsEditor: React.FC<any>;
  export const AppFallbackIcon: React.FC<any>;
  export const AppSearchDrawer: React.FC<any>;
  export const AppAuthConfig: React.FC<any>;
  export const AppAuthCard: React.FC<any>;
  export const ShuffleMCP: React.FC<any>;
  export const DATASTORE_CATEGORIES: any;
  export const getDatastoreByCategory: any;
  export const getDatastoreItem: any;
  export const setDatastoreItem: any;
  export const setDatastoreItems: any;
  export const getDatastorePageSize: any;
  export const filterItemsByCategory: any;
  export const deleteDatastoreItem: any;
  export const searchAgentActivity: any;
  export const findIngestTicketsWorkflow: any;
  export const findForwardTicketsWorkflow: any;
  export const extractWorkflowAppNames: any;
  export const extractActionAppNames: any;
  export const refreshAllIntegrationStatus: any;
  export const useSyncHostBaseUrl: any;
  export const normalizeAppName: any;
  export const getIngestionCategory: any;
  export const resolveApp: any;
  export const setHostBaseUrl: any;
  export const getHostBaseUrl: any;
  export const safeHandler: any;
  export const isCloud: boolean | any;
  export const getApiUrl: any;
  export const getAuthHeader: any;
  export const shuffleFetch: any;
  export const API_CONFIG: any;
  export const useAppDetailOptional: any;
  export const fetchAppsViaApiConfig: any;
  export const EMAIL_APP_PATTERNS: any;
  export const CASES_PATTERNS: any;
  export const EDR_PATTERNS: any;
  export const SIEM_PATTERNS: any;
  export const THREAT_INTEL_PATTERNS: any;
  export const COMMUNICATION_PATTERNS_NAMES: any;
  export const isEmailApp: any;
  export const isThreatIntelApp: any;
  export const isIngestionApp: any;
  export const extractValidatedIngestionApps: any;
  export const invalidateAppsCache: any;
}

declare module '@shuffleio/shuffle-mcps/*';

declare module '@mui/x-data-grid' {
  import * as React from 'react';
  export const DataGrid: React.FC<any>;
  export type GridColDef = any;
  export type GridRowsProp = any;
  export type GridRowId = any;
  export type GridCellParams = any;
  export type GridRowParams = any;
  export type GridRenderCellParams = any;
}

declare module '@mui/icons-material' {
  import * as React from 'react';
  export const OpenInNew: React.FC<any>;
  export const PlayArrow: React.FC<any>;
  export const Insights: React.FC<any>;
  export const Replay: React.FC<any>;
  export const EditNote: React.FC<any>;
  export const AccountTree: React.FC<any>;
  export const FilterAltOff: React.FC<any>;
  export const Send: React.FC<any>;
  export const Visibility: React.FC<any>;
  export const Search: React.FC<any>;
  export const Clear: React.FC<any>;
  export const Add: React.FC<any>;
  export const Delete: React.FC<any>;
  export const Check: React.FC<any>;
  export const Close: React.FC<any>;
  export const ArrowForward: React.FC<any>;
  export const ArrowBack: React.FC<any>;
  export const ArrowLeft: React.FC<any>;
  export const Stop: React.FC<any>;
  export const ContentCopy: React.FC<any>;
  export const Link: React.FC<any>;
  export const Block: React.FC<any>;
  export const CheckCircleOutline: React.FC<any>;
  export const WarningAmber: React.FC<any>;
  export const Draw: React.FC<any>;
  export const Done: React.FC<any>;
  export const RestaurantRounded: React.FC<any>;
  export const Cloud: React.FC<any>;
  export const CheckCircle: React.FC<any>;
  export const Padding: React.FC<any>;
  export const Edit: React.FC<any>;
  export const Cancel: React.FC<any>;
  export const Shield: React.FC<any>;
  export const LockOutlined: React.FC<any>;
  export const FlashOn: React.FC<any>;
  export const People: React.FC<any>;
  export const FmdGoodOutlined: React.FC<any>;
  export const Palette: React.FC<any>;
  export const Info: React.FC<any>;
  export const Email: React.FC<any>;
  export const Receipt: React.FC<any>;
  export const Security: React.FC<any>;
  export const Speed: React.FC<any>;
  export const Group: React.FC<any>;
  export const CreditCard: React.FC<any>;
  export const TrendingUp: React.FC<any>;
  export const Description: React.FC<any>;
  export const Launch: React.FC<any>;
  export const Error: React.FC<any>;
  export const Schedule: React.FC<any>;
  export const Refresh: React.FC<any>;
  export const Warning: React.FC<any>;
  export const VpnKey: React.FC<any>;
  export const Notifications: React.FC<any>;
  export const NotificationsActive: React.FC<any>;
  export const NotificationsOff: React.FC<any>;
}

declare module '@mui/icons-material/*';

declare module 'firebase/app' {
  export interface FirebaseApp {
    [key: string]: any;
  }
  export function initializeApp(...args: any[]): FirebaseApp;
  export function getApps(): FirebaseApp[];
  export function getApp(...args: any[]): FirebaseApp;
}

declare module 'firebase/messaging' {
  export interface Messaging {
    [key: string]: any;
  }
  export function getMessaging(...args: any[]): Messaging;
  export function getToken(...args: any[]): Promise<string>;
  export function onMessage(...args: any[]): any;
}

declare module 'sonner' {
  export const toast: any;
}

declare module '@capacitor/push-notifications' {
  export const PushNotifications: any;
}

declare module '@capacitor/local-notifications' {
  export const LocalNotifications: any;
}

declare module '@capacitor/haptics' {
  export const Haptics: any;
}


