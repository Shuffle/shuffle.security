import ShuffleMarkdown from '@/Shuffle-MCPs/components/Markdown';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  CheckCircle2 as CheckCircleIcon,
  X as CloseIcon,
  Trash2 as DeleteOutlineIcon,
  Pencil as EditIcon,
  ChevronDown as ExpandMoreIcon,
  Lock as LockIcon,
  BookOpen as MenuBookIcon,
  Eye as EyeIcon,
  EyeOff as EyeOffIcon,
} from 'lucide-react';

import { toast } from '@/Shuffle-MCPs/toast';
import { AuthStatusChip } from '@/Shuffle-MCPs/components/AuthStatusChip';
import { getValidatedAuthIds, rememberValidatedAuth, forgetValidatedAuth } from '@/Shuffle-MCPs/validatedAuthMemory';


import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  Collapse,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Link,
  Divider,
  FormControl,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  OutlinedInput,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material';
import { motion } from 'framer-motion';
import type { AlgoliaSearchApp } from '@/Shuffle-MCPs';
import { AppFallbackIcon } from '@/Shuffle-MCPs/components/AppFallbackIcon';
import { API_CONFIG, getApiUrl, getAuthHeader, isDevEnvironment, isCloudDomain } from '@/Shuffle-MCPs/api';
import { useSyncHostBaseUrl } from '@/Shuffle-MCPs/useSyncHostBaseUrl';
import { getIngestionCategory } from '@/Shuffle-MCPs/ingestionDetection';
import type { ShuffleHostProps } from '@/Shuffle-MCPs/host-props';
import { fetchAppConfig as fetchSharedAppConfig } from '@/Shuffle-MCPs/appConfigFetch';
import { invalidateAuthenticatedAppsCache } from '@/Shuffle-MCPs/authenticatedApps';

export type AuthStatus = 'pending' | 'testing' | 'connected' | 'error';

export interface AppAuthState {
  systemId: string;
  status: AuthStatus;
  credentials: Record<string, string>;
  errorMessage?: string;
  successMessage?: string;
  warningMessage?: string;
  workflowId?: string;
  executionId?: string;
  errorCode?: number; // HTTP status code for credential errors (401, 403, etc.)
}

/**
 * Opens the shared workflow-run explorer drawer for a given execution.
 * Host apps listen for `workflow-run:open` and render the full execution.
 */
const openExecutionDrawer = (executionId: string) => {
  window.dispatchEvent(
    new CustomEvent('workflow-run:open', { detail: { executionId }, cancelable: true }),
  );
};

/** "Inspect execution" CTA shown after a connection test (success or failure). */
const ViewExecutionButton = ({
  executionId,
  tone = 'default',
}: {
  executionId: string;
  tone?: 'default' | 'destructive';
}) => {
  const color = tone === 'destructive' ? 'hsl(var(--destructive))' : 'currentColor';
  return (
    <Button
      variant="outlined"
      size="small"
      onClick={() => openExecutionDrawer(executionId)}
      sx={{
        borderColor: tone === 'destructive' ? 'hsl(var(--destructive) / 0.5)' : 'currentColor',
        color,
        opacity: tone === 'destructive' ? 1 : 0.9,
        textTransform: 'none',
        fontSize: '0.75rem',
        py: 0.5,
        px: 1.5,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        '&:hover': {
          borderColor: color,
          backgroundColor: tone === 'destructive' ? 'hsl(var(--destructive) / 0.1)' : 'hsl(var(--muted) / 0.4)',
        },
      }}
    >
      Inspect execution
    </Button>
  );
};



// Helper to check if auth type is OAuth2 (includes oauth2-app variant)
const isOAuth2Type = (type: string | undefined): boolean => {
  if (!type) return false;
  const lowerType = type.toLowerCase();
  return lowerType === 'oauth2' || lowerType === 'oauth2-app';
};

// Helper to check if auth type indicates no authentication required
// Returns true for explicit "no auth" types OR apps with no parameters/OAuth config
export const isNoAuthRequired = (auth: AppAuthentication | undefined): boolean => {
  if (!auth) return false; // No auth object loaded yet = unknown
  const type = auth.type?.toLowerCase() || '';
  // Explicit "no auth" types
  if (type === 'none' || type === 'no_auth' || type === 'no authentication' || type === 'no_key') return true;
  // Check if there's nothing to configure (not OAuth, no parameters)
  const isOAuth = type === 'oauth2' || type === 'oauth2-app';
  const hasParameters = auth.parameters && auth.parameters.length > 0;
  const hasOAuthConfig = auth.client_id || auth.client_secret || auth.token_uri;
  // If no OAuth and no parameters, auth is not required
  if (!isOAuth && !hasParameters && !hasOAuthConfig) return true;
  return false;
};

// URL validation helper
const isValidUrl = (value: string): boolean => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

interface AuthParameter {
  description: string;
  example: string;
  id: string;
  name: string;
  required: boolean;
  schema: {
    type: string;
  };
}

export interface AppAuthentication {
  type: string;
  description?: string;
  redirect_uri?: string;
  token_uri?: string;
  refresh_uri?: string;
  authorization_url?: string;
  // Common alternative field names for the authorization endpoint
  auth_uri?: string;
  authorize_url?: string;
  scope?: string[];
  client_id?: string;
  client_secret?: string;
  parameters?: AuthParameter[];
}

// API authentication entry (from /api/v1/apps/authentication)
export interface ApiAuthEntry {
  id?: string;
  label?: string;
  app: {
    id: string;
    name: string;
    large_image?: string;
  };
  active?: boolean;
  created?: number;
  edited?: number;
  validation?: {
    valid: boolean;
    error?: string;
    last_valid?: number;
  };
}

interface DecodedApp {
  name: string;
  description: string;
  authentication: AppAuthentication;
  large_image?: string;
}

interface AppAuthConfigProps extends ShuffleHostProps {
  apps: AlgoliaSearchApp[];
  authStates: Record<string, AppAuthState>;
  authenticatedApps?: ApiAuthEntry[];
  onAuthChange: (appId: string, credentials: Record<string, string>) => void;
  onTestConnection: (appId: string, authenticationId?: string) => void;
  onSaveAuth: (appId: string, credentials: Record<string, string>) => Promise<boolean>;
  onSelectAuth?: (appId: string, authId: string) => void;
  onRefreshAuth?: () => Promise<void> | void;
}

export interface AppAuthCardProps extends ShuffleHostProps {
  app: AlgoliaSearchApp;
  authState: AppAuthState;
  isExpanded: boolean;
  onToggle: () => void;
  onAuthChange: (appId: string, credentials: Record<string, string>) => void;
  onTestConnection: (appId: string, authenticationId?: string) => void;
  onSaveAuth: (appId: string, credentials: Record<string, string>) => Promise<boolean>;
  apiAuthEntries: ApiAuthEntry[];
  onSelectAuth?: (appId: string, authId: string) => void;
  /** Called to refresh auth entries (e.g. after OAuth popup closes) */
  onRefreshAuth?: () => Promise<void> | void;
  /** When true, do NOT auto-fill URL fields with the param.example value. */
  disableUrlPrefill?: boolean;
  /** Hide the entire card header row (app icon, name, description, chips, docs, expand). Body stays expanded. */
  hideHeader?: boolean;
  /** Hide the "Configured / Not configured" and "Tested / Not tested" chips. */
  hideStatusChips?: boolean;
  /** Hide the documentation (book icon) link. */
  hideDocsLink?: boolean;
  /** Hide URL-like fields (name/id containing "url", "endpoint", or "host").
   *  Use when the URL is supplied externally (e.g. via a provider preset). */
  hideUrlFields?: boolean;
  /** Render without the outer Card border so the component can be embedded
   *  inside another bordered container without the nested "double border" look. */
  borderless?: boolean;
  /** Compact mode for embedded auth setup (e.g. Local LLM). Hides the
   *  "Select authentication" dropdown and the large "Pending Verification"
   *  detail panel with its standalone Test Connection button. The inline
   *  credentials form (with the small "Test Authentication" CTA) is always
   *  visible so users can edit & retest in one place. */
  compactAuthForm?: boolean;
  /** Always render the "Select authentication" dropdown, even when there are no
   *  saved entries yet, so the UI does not switch between two different shapes. */
  alwaysShowAuthSelector?: boolean;

  /** Suppress the "Authentication saved" success toast (embedded flows that
   *  already give their own feedback, e.g. the LLM provider config). */
  suppressSaveToast?: boolean;
  /** Render additional fields inside the expanded body, above the credential
   *  inputs. The slot receives the live `localCredentials` and a `setField`
   *  helper so its values are persisted as part of the auth on Save. */
  extraFieldsSlot?: (api: {
    credentials: Record<string, string>;
    setField: (key: string, value: string) => void;
  }) => React.ReactNode;
  /** Known-ahead-of-time auth schema. When provided the fields render
   *  instantly and no app-config request is made (no "Loading configuration"). */
  initialAuthConfig?: AppAuthentication;
}


const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const ADD_NEW_AUTH = '__add_new__';

/** LocalStorage key prefix for per-app/per-auth connection test results. */
const VERIFIED_STORAGE_KEY = 'shuffle-appauth-verified';

const verifiedStorageKey = (appId: string, authId: string) =>
  `${VERIFIED_STORAGE_KEY}-${appId}-${authId}`;

const readVerifiedFromStorage = (appId: string, authId: string): 'success' | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem(verifiedStorageKey(appId, authId));
    return value === 'success' ? 'success' : null;
  } catch {
    return null;
  }
};

const writeVerifiedToStorage = (appId: string, authId: string, status: 'success' | null) => {
  if (typeof window === 'undefined') return;
  try {
    const key = verifiedStorageKey(appId, authId);
    if (status === 'success') {
      localStorage.setItem(key, 'success');
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore storage errors */
  }
};

const removeVerifiedFromStorage = (appId: string, authId: string) => {
  writeVerifiedToStorage(appId, authId, null);
};

/** Public helper: has this auth been verified locally (200 OK on test)? */
export const isAuthVerifiedLocally = (appId: string, authId: string): boolean =>
  readVerifiedFromStorage(appId, authId) === 'success';

/** Build initial verified map from localStorage for the given auth entries. */
const buildInitialVerifiedMap = (
  appId: string,
  entries: ApiAuthEntry[]
): Record<string, 'success'> => {
  const map: Record<string, 'success'> = {};
  entries.forEach((entry) => {
    const authId = entry.id || entry.label || '';
    if (!authId) return;
    if (readVerifiedFromStorage(appId, authId) === 'success') {
      map[authId] = 'success';
    }
  });
  return map;
};

export const AppAuthCard = ({
  app,
  authState,
  isExpanded,
  onToggle,
  onAuthChange,
  onTestConnection,
  onSaveAuth,
  apiAuthEntries,
  onSelectAuth,
  onRefreshAuth,
  disableUrlPrefill,
  hideHeader,
  hideStatusChips,
  hideDocsLink,
  hideUrlFields,
  borderless,
  compactAuthForm,
  alwaysShowAuthSelector,

  suppressSaveToast,
  extraFieldsSlot,
  initialAuthConfig,

  globalUrl,
  userdata,
  isLoaded,
  isLoggedIn,
  serverside,
}: AppAuthCardProps) => {
  useSyncHostBaseUrl(globalUrl);
  // Helper to get best default auth: prioritize validated, otherwise last entry
  const getBestDefaultAuth = (entries: ApiAuthEntry[]): string => {
    if (entries.length === 0) return ADD_NEW_AUTH;
    
    // First, find a validated entry
    const validatedEntry = entries.find(e => e.validation?.valid === true);
    if (validatedEntry) {
      return validatedEntry.id || validatedEntry.label || '0';
    }
    
    // Otherwise, use the last entry (assuming API returns in chronological order)
    const lastEntry = entries[entries.length - 1];
    return lastEntry.id || lastEntry.label || '0';
  };

  // Track selected auth from dropdown
  const [selectedAuthId, setSelectedAuthId] = useState<string>(() => {
    return getBestDefaultAuth(apiAuthEntries);
  });

  // Track if user has made an explicit selection (to prevent auto-override on refresh)
  const [userHasSelected, setUserHasSelected] = useState(false);
  
  // Track test status PER authentication ID for this session (plus localStorage for verified)
  // This ensures switching between auths shows each one's test result correctly
  type TestStatusValue = 'untested' | 'testing' | 'success' | 'pending_validation' | 'error';
  const [testStatusPerAuth, setTestStatusPerAuth] = useState<Record<string, TestStatusValue>>(() =>
    buildInitialVerifiedMap(app.objectID, apiAuthEntries)
  );
  
  // Track test messages per auth (error message, success message, warning message)
  const [testMessagesPerAuth, setTestMessagesPerAuth] = useState<Record<string, {
    errorMessage?: string;
    successMessage?: string;
    warningMessage?: string;
    workflowId?: string;
    executionId?: string;
    errorCode?: number;
  }>>({});
  
  // Track which auth ID is currently being tested (to avoid updating wrong auth on switch)
  const [testingAuthId, setTestingAuthId] = useState<string | null>(null);
  
  // Delete auth state
  const [deleteConfirmAuthId, setDeleteConfirmAuthId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAuth = async (authId: string) => {
    setDeleting(true);
    try {
      const response = await fetch(getApiUrl(`/api/v1/apps/authentication/${authId}`), {
        method: 'DELETE',
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });
      if (response.ok) {
        // If we deleted the selected auth, reset selection and clear localStorage
        if (selectedAuthId === authId) {
          setSelectedAuthId(ADD_NEW_AUTH);
          setUserHasSelected(false);
        }
        setTestStatusPerAuth(prev => {
          const next = { ...prev };
          delete next[authId];
          return next;
        });
        removeVerifiedFromStorage(app.objectID, authId);
        forgetValidatedAuth(authId);
        invalidateAuthenticatedAppsCache();
        if (onRefreshAuth) await onRefreshAuth();
      }
    } catch (err) {
      console.error('Failed to delete auth:', err);
    } finally {
      setDeleting(false);
      setDeleteConfirmAuthId(null);
    }
  };

  const localTestStatus = testStatusPerAuth[selectedAuthId] || 'untested';
  
  // Track if the selected auth was already validated BEFORE we started testing
  // This is used to determine if we should trust the 200 response as source of truth
  const [wasPreValidatedPerAuth, setWasPreValidatedPerAuth] = useState<Record<string, boolean>>({});

  // Track previous entry count to detect new auths added (e.g. from OAuth popup)
  const prevEntryCountRef = useRef(apiAuthEntries.length);
  // Guard to prevent multiple auto-tests firing
  const autoTestFiredRef = useRef<string | null>(null);

  // Update selection when apiAuthEntries changes
  useEffect(() => {
    if (apiAuthEntries.length > 0) {
      // If a new entry was added (count increased), auto-select the newest one
      if (apiAuthEntries.length > prevEntryCountRef.current) {
        const sorted = [...apiAuthEntries].sort((a, b) => {
          const aTime = a.created || a.edited || 0;
          const bTime = b.created || b.edited || 0;
          return bTime - aTime;
        });
        const newestId = sorted[0]?.id || sorted[0]?.label || '0';
        setSelectedAuthId(newestId);
        
        // Auto-test the new auth if not already validated and not already auto-tested
        const newestEntry = sorted[0];
        // Already-validated entries must never be auto-tested — switching the
        // provider filter can make an existing, known-good auth look "new" to this effect.
        const alreadyValid = newestEntry?.validation?.valid === true;
        if (!alreadyValid && newestId !== autoTestFiredRef.current) {
          autoTestFiredRef.current = newestId;
          // Small delay to let state settle before firing test
          setTimeout(() => {
            setTestingAuthId(newestId);
            onTestConnection(app.objectID, newestId);
          }, 500);
        }
      } else if (
        !userHasSelected ||
        (selectedAuthId !== ADD_NEW_AUTH &&
          !apiAuthEntries.some((a) => (a.id || a.label || '') === selectedAuthId))
      ) {
        // Either nothing picked yet, or the current selection no longer exists
        // in the list (e.g. the provider changed) — fall back to the default.
        setSelectedAuthId(getBestDefaultAuth(apiAuthEntries));
      }
    } else if (selectedAuthId !== ADD_NEW_AUTH) {
      // No auths available for this provider/app — show "Add new authentication"
      // instead of leaving a stale selection that renders as an empty dropdown.
      setSelectedAuthId(ADD_NEW_AUTH);
      setUserHasSelected(false);
    }

    prevEntryCountRef.current = apiAuthEntries.length;
  }, [apiAuthEntries, userHasSelected, selectedAuthId]);

  // Helper to update test status for a specific auth and persist verified state
  const setTestStatusForAuth = useCallback((authId: string, status: TestStatusValue) => {
    setTestStatusPerAuth(prev => ({ ...prev, [authId]: status }));
    if (status === 'success') {
      writeVerifiedToStorage(app.objectID, authId, 'success');
      rememberValidatedAuth(authId);
    }
  }, [app.objectID]);

  // Persist server-side validated entries as verified in localStorage so the
  // green indicator survives reloads without needing a manual re-test.
  useEffect(() => {
    apiAuthEntries.forEach((entry) => {
      const authId = entry.id || entry.label || '';
      if (entry.validation?.valid === true && authId) {
        setTestStatusForAuth(authId, 'success');
      }
    });
  }, [apiAuthEntries, setTestStatusForAuth]);
  
  // Track pre-validation state when auth selection changes (for first-time tests)
  useEffect(() => {
    // Only set pre-validated state if we haven't tracked this auth yet
    if (wasPreValidatedPerAuth[selectedAuthId] === undefined) {
      const currentAuth = apiAuthEntries.find(
        auth => (auth.id || auth.label || '') === selectedAuthId
      );
      setWasPreValidatedPerAuth(prev => ({
        ...prev,
        [selectedAuthId]: currentAuth?.validation?.valid === true
      }));
    }
  }, [selectedAuthId, apiAuthEntries]);
  
  // Get the currently selected auth entry (needed for validation check)
  const selectedAuth = apiAuthEntries.find(
    auth => (auth.id || auth.label || '') === selectedAuthId
  );
  
  
  // Helper to update test messages for a specific auth
  const setTestMessagesForAuth = (authId: string, messages: {
    errorMessage?: string;
    successMessage?: string;
    warningMessage?: string;
    workflowId?: string;
    executionId?: string;
    errorCode?: number;
  }) => {
    setTestMessagesPerAuth(prev => ({ ...prev, [authId]: messages }));
  };
  
  // Get test messages for current auth
  const localTestMessages = testMessagesPerAuth[selectedAuthId] || {};
  const wasPreValidated = wasPreValidatedPerAuth[selectedAuthId] || false;
  
  // Sync test status with authState when test completes, checking backend validation status
  // IMPORTANT: Only update the auth that was being tested, not the currently selected auth
  useEffect(() => {
    // Only process if we have a testingAuthId (a test was initiated)
    if (!testingAuthId) return;
    
    if (authState.status === 'testing') {
      setTestStatusForAuth(testingAuthId, 'testing');
      // Clear previous messages when starting a new test
      setTestMessagesForAuth(testingAuthId, {});
    } else if (authState.status === 'connected') {
      // Get the auth entry that was being tested
      const testedAuth = apiAuthEntries.find(
        auth => (auth.id || auth.label || '') === testingAuthId
      );
      const wasTestedAuthPreValidated = wasPreValidatedPerAuth[testingAuthId] || false;
      
      // If we got a 200 OK back, the test passed. The backend validation flag
      // is not a reliable signal for most app authentications, so we trust the
      // connection test result.
      setTestStatusForAuth(testingAuthId, 'success');
      // Store the success/warning messages for this auth
      setTestMessagesForAuth(testingAuthId, {
        successMessage: authState.successMessage,
        warningMessage: authState.warningMessage,
        workflowId: authState.workflowId,
        executionId: authState.executionId,
      });
      // Clear testingAuthId after processing completed status
      setTestingAuthId(null);
    } else if (authState.status === 'error') {
      setTestStatusForAuth(testingAuthId, 'error');
      // Store the error details for this auth
      setTestMessagesForAuth(testingAuthId, {
        errorMessage: authState.errorMessage,
        workflowId: authState.workflowId,
        executionId: authState.executionId,
        errorCode: authState.errorCode,
      });
      // If this error came from the auto-test that fires right after a brand
      // new auth was saved, keep that auth selected in the list (it was saved
      // successfully) and just surface the failure plus the "Save anyway" CTA.
      if (autoTestFiredRef.current === testingAuthId) {
        setSelectedAuthId(testingAuthId);
        setUserHasSelected(true);
        setPendingFailedAuthId(testingAuthId);
        autoTestFiredRef.current = null;
      }


      // Clear testingAuthId after processing completed status
      setTestingAuthId(null);
    }

  }, [authState.status, authState.errorMessage, authState.successMessage, authState.warningMessage, testingAuthId, apiAuthEntries, wasPreValidatedPerAuth]);
  
  // Track credential errors (401/403) to show warning but don't auto-switch
  // User can manually switch back to other auths or add new one
  const isCredentialError = localTestMessages.errorCode === 401 || localTestMessages.errorCode === 403;

  const showAddNewForm = compactAuthForm ? true : selectedAuthId === ADD_NEW_AUTH;

  // Compute configured/tested status for the SELECTED auth entry only (not any auth)
  // NOTE: switching the active provider (e.g. OpenAI -> Shuffle AI) rewrites the
  // auth entry with masked secrets, which clears `validation.valid` on the backend.
  // The locally remembered validation keeps the "Validated" state intact.
  const isRememberedValid = useMemo(
    () => !!selectedAuth?.id && getValidatedAuthIds().has(selectedAuth.id),
    [selectedAuth?.id, testStatusPerAuth],
  );
  const isConfigured = selectedAuth?.active === true || isRememberedValid;
  const isTested =
    selectedAuth?.validation?.valid === true ||
    testStatusPerAuth[selectedAuthId] === 'success' ||
    isRememberedValid;

  
  // Get last validation timestamp (prefer selected auth, fallback to any validated entry)
  const getLastValidTimestamp = (): number | undefined => {
    if (selectedAuth?.validation?.last_valid) return selectedAuth.validation.last_valid;
    const validEntry = apiAuthEntries.find(a => a.validation?.valid === true && a.validation?.last_valid);
    return validEntry?.validation?.last_valid;
  };
  
  const formatLastValidDate = (): string => {
    const timestamp = getLastValidTimestamp();
    if (!timestamp) return 'Unknown';
    // Detect if timestamp is in seconds or milliseconds
    // If > 10^12, it's likely milliseconds; otherwise seconds
    const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
    const date = new Date(ms);
    return date.toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Local credentials state for the form
  const [localCredentials, setLocalCredentials] = useState<Record<string, string>>(authState.credentials || {});
  // Track which secret fields the user has chosen to reveal (eye toggle).
  const [revealedFields, setRevealedFields] = useState<Record<string, boolean>>({});
  // Auth id of a freshly-saved entry whose auto-test failed — drives the
  // "Save anyway" secondary CTA so the user can accept it despite the failure.
  const [pendingFailedAuthId, setPendingFailedAuthId] = useState<string | null>(null);


  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // App config fetching for dynamic fields
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appConfig, setAppConfig] = useState<DecodedApp | null>(
    initialAuthConfig
      ? ({ authentication: initialAuthConfig } as unknown as DecodedApp)
      : null,
  );

  // Refresh auth entries every time the card is expanded
  useEffect(() => {
    if (isExpanded && onRefreshAuth) {
      onRefreshAuth();
    }
  }, [isExpanded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const loadAppConfig = async () => {
      if (!isExpanded || appConfig) return;

      // Skip synthetic fallback ids (e.g. "name:shuffle_workflows") — these
      // are placeholders for built-in tools that don't exist in the backend
      // app catalog, so the request will always 401 with "App doesn't exist"
      // and would spam the network tab as the drawer re-renders.
      if (!app.objectID || app.objectID.startsWith('name:')) {
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      const result = await fetchSharedAppConfig(app.objectID);

      try {
        if (result.ok && result.data?.name) {
          setAppConfig(result.data as DecodedApp);
        } else {
          setAppConfig({ authentication: undefined } as unknown as DecodedApp);
          const status = result.status;
          setError(
            status === 401 ? 'You are not authorized to load this app configuration.'
            : status === 403 ? 'You do not have permission to view this app configuration.'
            : status === 404 ? 'App configuration not found.'
            : status === 0 ? 'Could not reach the Shuffle API. Check your connection and try again.'
            : `Failed to fetch app configuration (HTTP ${status}).`,
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load configuration');
      } finally {
        setLoading(false);
      }
    };

    loadAppConfig();
  }, [isExpanded, app.objectID, appConfig]);

  const auth = appConfig?.authentication;
  const isOAuth2 = isOAuth2Type(auth?.type);

  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);

  // Update scopes when auth loads
  useEffect(() => {
    if (auth?.scope) {
      setSelectedScopes(auth.scope);
    }
  }, [auth?.scope]);
  
  // Auto-populate URL fields with example values when auth config loads
  useEffect(() => {
    if (disableUrlPrefill) return;
    if (!auth?.parameters || auth.parameters.length === 0) return;
    
    const urlDefaults: Record<string, string> = {};
    auth.parameters.forEach((param, index) => {
      const fieldKey = param.id || param.name || `param_${index}`;
      const nameOrId = (param.name || param.id || '').toLowerCase();
      
      // Check if this is a URL field and has an example that looks like a URL
      const isUrlField = nameOrId.includes('url') || nameOrId.includes('endpoint') || nameOrId.includes('host');
      const hasUrlExample = param.example && (
        param.example.startsWith('http://') || 
        param.example.startsWith('https://')
      );
      
      // Only pre-fill if field is empty and has a URL example
      if (isUrlField && hasUrlExample && !localCredentials[fieldKey]) {
        urlDefaults[fieldKey] = param.example;
      }
    });
    
    // Update credentials with URL defaults if any
    if (Object.keys(urlDefaults).length > 0) {
      setLocalCredentials(prev => ({ ...urlDefaults, ...prev }));
    }
  }, [auth?.parameters, disableUrlPrefill]);

  // Sync externally-driven URL/endpoint/model changes (e.g. provider preset
  // selectors) into the local form state so the field reflects the choice.
  useEffect(() => {
    const incoming = authState.credentials || {};
    // Any url-like value coming from outside (provider preset) — used as a
    // fallback when the schema's URL param key differs from the incoming key
    // (e.g. incoming "url" vs schema "openai_url").
    let incomingUrl = '';
    for (const [k, v] of Object.entries(incoming)) {
      const lk = k.toLowerCase();
      if ((lk.includes('url') || lk.includes('endpoint') || lk.includes('host')) && typeof v === 'string' && v.trim()) {
        incomingUrl = v.trim();
        break;
      }
    }
    setLocalCredentials((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [k, v] of Object.entries(incoming)) {
        const lk = k.toLowerCase();
        const isUrlish = lk.includes('url') || lk.includes('endpoint') || lk.includes('host');
        const isModel = lk === 'model';
        if ((isUrlish || isModel) && typeof v === 'string' && v !== prev[k]) {
          next[k] = v;
          changed = true;
        }
      }
      if (incomingUrl) {
        for (const { key } of urlParams()) {
          if (!(next[key] || '').trim()) {
            next[key] = incomingUrl;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.credentials, auth?.parameters]);


  const [docsOpen, setDocsOpen] = useState(false);
  const [docsContent, setDocsContent] = useState<string>('');
  const [docsLoading, setDocsLoading] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [editLabelValue, setEditLabelValue] = useState('');
  const [savingLabel, setSavingLabel] = useState(false);

  const handleRenameAuth = async () => {
    if (!selectedAuth || !editLabelValue.trim()) return;
    setSavingLabel(true);
    try {
      // Build the auth body with all fields but replaced label
      // Fill any sensitive fields with placeholder
      const placeholder = 'Secret. Replaced during app execution!';
      const authBody: Record<string, any> = {
        ...selectedAuth,
        label: editLabelValue.trim(),
      };
      // Ensure fields array values are placeholders
      if (authBody.fields) {
        const newFields: Record<string, any> = {};
        for (const [key, val] of Object.entries(authBody.fields)) {
          newFields[key] = typeof val === 'string' ? placeholder : val;
        }
        authBody.fields = newFields;
      }

      const response = await fetch(getApiUrl('/api/v1/apps/authentication'), {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(authBody),
      });

      if (response.ok) {
        setEditingLabel(false);
        invalidateAuthenticatedAppsCache();
        if (onRefreshAuth) await onRefreshAuth();
        toast({ title: 'Label updated', description: `Renamed to "${editLabelValue.trim()}"` });
      } else {
        toast({ title: 'Failed to rename', description: 'Could not update the authentication label', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to rename authentication', variant: 'destructive' });
    } finally {
      setSavingLabel(false);
    }
  };

  const fetchDocs = async () => {
    setDocsLoading(true);
    try {
      const encodedName = encodeURIComponent(app.name);
      const response = await fetch(getApiUrl(`/api/v1/docs/${encodedName}?location=openapi`), {
        credentials: 'include',
        headers: {
          ...getAuthHeader(),
        },
      });
      if (response.ok) {
        const data = await response.json();
        setDocsContent(data.reason || data.data || data.content || 'No documentation available.');
      } else {
        setDocsContent('Failed to load documentation.');
      }
    } catch (error) {
      setDocsContent('Error loading documentation.');
    } finally {
      setDocsLoading(false);
    }
  };

  const handleOpenDocs = () => {
    setDocsOpen(true);
    fetchDocs();
  };

  // Render OAuth2 fields - only for OAuth2 apps
  const renderOAuth2Fields = () => {
    if (!auth || !isOAuth2) return null;

    const availableScopes = auth.scope || [];

    const hasManualCredentials = !!localCredentials['client_id']?.trim() && !!localCredentials['client_secret']?.trim();

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Quick Connect Button — always shown for OAuth2 apps. The popup target
         * (https://shuffler.io/appauth) handles the redirect server-side regardless
         * of which host opened it, so there is no reason to gate this on hostname.
         * Previously this was gated on isDevEnvironment() || isCloudDomain(), which
         * meant any consumer of the lib outside the hardcoded ['shuffle.security',
         * 'shutdown.no'] / Lovable preview list never saw a Quick Connect button at all. */}
        {true && (
          <>
            <Collapse in={!hasManualCredentials}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={
                    app.image_url ? (
                      <Box
                        component="img"
                        src={app.image_url}
                        alt={app.name}
                        sx={{ width: 24, height: 24, borderRadius: 1, objectFit: 'contain' }}
                      />
                    ) : <LockIcon />
                  }
                  onClick={() => {
                    const authUrl = `https://shuffler.io/appauth?app_id=${app.objectID}&source=shuffle`;
                    const popup = window.open(authUrl, '_blank', 'width=600,height=700');
                    if (!onRefreshAuth) return;
                    const baselineCount = (apiAuthEntries || []).length;
                    const startedAt = Date.now();
                    const MAX_MS = 5 * 60 * 1000; // 5 minutes
                    let stopped = false;
                    const stop = () => {
                      if (stopped) return;
                      stopped = true;
                      clearInterval(authPollTimer);
                      clearInterval(closePollTimer);
                    };
                    const tick = async () => {
                      try { await onRefreshAuth(); } catch {}
                      if ((apiAuthEntries || []).length > baselineCount) stop();
                      if (Date.now() - startedAt > MAX_MS) stop();
                    };
                    // Fire immediately, then every 2s regardless of popup state
                    tick();
                    const authPollTimer = setInterval(tick, 2000);
                    const closePollTimer = setInterval(() => {
                      // popup may be null if blocked; in that case rely on auth poll + timeout
                      if (popup && popup.closed) {
                        // One last refresh after window closes
                        tick();
                        // Keep polling briefly in case backend writes the auth a moment later
                        setTimeout(() => { tick(); stop(); }, 4000);
                      }
                    }, 500);
                  }}
                  sx={{
                    py: 1.5,
                     borderColor: 'hsl(var(--primary) / 0.4)',
                     color: 'hsl(var(--foreground))',
                    fontWeight: 600,
                    textTransform: 'none',
                    fontSize: '1rem',
                    '&:hover': {
                       borderColor: 'hsl(var(--primary))',
                       backgroundColor: 'hsl(var(--primary) / 0.08)',
                    },
                  }}
                >
                  Quick Connect with {app.name.replace(/_/g, ' ')}
                </Button>

                {/* OR Divider */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Divider sx={{ flex: 1, borderColor: 'hsl(var(--border))' }} />
                  <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>OR configure manually</Typography>
                  <Divider sx={{ flex: 1, borderColor: 'hsl(var(--border))' }} />
                </Box>
              </Box>
            </Collapse>
            {hasManualCredentials && (
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  setLocalCredentials({});
                  onAuthChange(app.objectID, {});
                }}
                sx={{
                  color: 'hsl(var(--muted-foreground))',
                  textTransform: 'none',
                  fontSize: '0.8rem',
                  alignSelf: 'flex-start',
                  p: 0,
                  minWidth: 0,
                  '&:hover': { color: 'hsl(var(--foreground))', backgroundColor: 'transparent' },
                }}
              >
                ← Use Quick Connect instead
              </Button>
            )}
          </>
        )}

        {/* Manual OAuth2 Fields */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
            Redirect URL: <Typography component="span" sx={{ color: 'hsl(var(--primary))', fontWeight: 600 }}>
              {auth.redirect_uri || 'https://shuffler.io/set_authentication'}
            </Typography>
          </Typography>

          <TextField
            label="Client ID"
            placeholder="Enter your Client ID"
            value={localCredentials['client_id'] || ''}
            onChange={(e) => handleCredentialChange('client_id', e.target.value)}
            fullWidth
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'transparent',
                borderRadius: 1,
                '& fieldset': { borderColor: 'hsl(var(--border))' },
                '&:hover fieldset': { borderColor: 'hsl(var(--border) / 0.8)' },
                '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
              },
              '& .MuiInputBase-input': { color: 'hsl(var(--foreground))' },
              '& .MuiInputLabel-root': { color: 'hsl(var(--muted-foreground))' },
            }}
          />

          <TextField
            label="Client Secret"
            type="password"
            placeholder="Enter your Client Secret"
            value={localCredentials['client_secret'] || ''}
            onChange={(e) => handleCredentialChange('client_secret', e.target.value)}
            fullWidth
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'transparent',
                borderRadius: 1,
                '& fieldset': { borderColor: 'hsl(var(--border))' },
                '&:hover fieldset': { borderColor: 'hsl(var(--border) / 0.8)' },
                '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
              },
              '& .MuiInputBase-input': { color: 'hsl(var(--foreground))' },
              '& .MuiInputLabel-root': { color: 'hsl(var(--muted-foreground))' },
            }}
          />

          {/* Scopes */}
          {availableScopes.length > 0 && (
            <FormControl fullWidth size="small">
              <Select
                multiple
                value={selectedScopes}
                onChange={(e) => {
                  const value = e.target.value as string[];
                  setSelectedScopes(value);
                  handleCredentialChange('scopes', value.join(' '));
                }}
                input={<OutlinedInput />}
                renderValue={(selected) => selected.length === 0 ? 'Select Scopes' : `${selected.length} scope(s) selected`}
                displayEmpty
                sx={{
                  backgroundColor: 'action.hover',
                  borderRadius: 1,
                  color: 'text.primary',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'text.disabled' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
                  '& .MuiSvgIcon-root': { color: 'text.secondary' },
                }}
                MenuProps={{
                  sx: { zIndex: 10020 },
                  slotProps: {
                    paper: {
                      sx: {
                      backgroundColor: 'background.paper',
                      border: '1px solid',
                      borderColor: 'divider',
                      maxHeight: 300,
                      },
                    },
                  },
                }}
              >
                {availableScopes.map((scope) => (
                  <MenuItem key={scope} value={scope} sx={{ color: 'hsl(var(--foreground))' }}>
                    <Checkbox 
                      checked={selectedScopes.indexOf(scope) > -1}
                      sx={{ color: 'hsl(var(--muted-foreground))', '&.Mui-checked': { color: 'hsl(var(--primary))' } }}
                    />
                    <ListItemText primary={scope} sx={{ '& .MuiTypography-root': { color: 'hsl(var(--foreground))' } }} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>
      </Box>
    );
  };

  // Render parameter fields - for non-OAuth2 apps with parameters
  const renderParameterFields = () => {
    if (isOAuth2) return null;
    if (!auth?.parameters || auth.parameters.length === 0) return null;

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {auth.parameters
          .filter((param) => {
            if (!hideUrlFields) return true;
            const n = (param.name || param.id || '').toLowerCase();
            return !(n.includes('url') || n.includes('endpoint') || n.includes('host'));
          })
          .map((param, index) => {
          // Use param.id if available, otherwise fallback to name or index
          const fieldKey = param.id || param.name || `param_${index}`;
          const lowerName = (param.name || '').toLowerCase();
          const isSecretField = lowerName.includes('password') || lowerName.includes('secret') || lowerName.includes('key') || lowerName.includes('token');
          const isRevealed = !!revealedFields[fieldKey];
          return (
            <TextField
              key={fieldKey}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {param.name}
                  {param.required && (
                    <Typography component="span" sx={{ color: 'hsl(var(--destructive))', fontSize: '0.8rem' }}>*</Typography>
                  )}
                </Box>
              }
              type="text"
              placeholder={param.example || `Enter ${param.name}`}
              value={localCredentials[fieldKey] || ''}
              onChange={(e) => handleCredentialChange(fieldKey, e.target.value)}
              error={!!fieldErrors[fieldKey]}
              helperText={fieldErrors[fieldKey] || param.description}
              fullWidth
              size="small"
              autoComplete="off"
              slotProps={{
                htmlInput: {
                  autoComplete: 'off',
                  autoCorrect: 'off',
                  autoCapitalize: 'off',
                  'data-1p-ignore': true,
                  'data-lpignore': 'true',
                  'data-bwignore': 'true',
                  'data-form-type': 'other',
                  spellCheck: false,
                  readOnly: true,
                  onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
                    e.target.removeAttribute('readonly');
                  },
                } as any,
                input: isSecretField ? {
                  endAdornment: (
                    <IconButton
                      size="small"
                      onClick={() => setRevealedFields(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }))}
                      aria-label={isRevealed ? `Hide ${param.name}` : `Show ${param.name}`}
                      sx={{ color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--foreground))' } }}
                    >
                      {isRevealed ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                    </IconButton>
                  ),
                } : undefined,
              }}
              name={`auth-${fieldKey}-${app.objectID}-${Math.random().toString(36).slice(2, 8)}`}
              sx={{
                '& .MuiOutlinedInput-root': {
                  backgroundColor: 'transparent',
                  borderRadius: 1,
                  '& fieldset': {
                    borderColor: fieldErrors[fieldKey]
                      ? 'hsl(var(--destructive))'
                      : isSecretField
                      ? 'hsl(var(--primary) / 0.5)'
                      : 'hsl(var(--border))',
                    borderWidth: isSecretField ? 2 : 1,
                  },
                  '&:hover fieldset': {
                    borderColor: fieldErrors[fieldKey]
                      ? 'hsl(var(--destructive))'
                      : isSecretField
                      ? 'hsl(var(--primary) / 0.7)'
                      : 'hsl(var(--border))',
                  },
                  '&.Mui-focused fieldset': { borderColor: fieldErrors[fieldKey] ? 'hsl(var(--destructive))' : 'hsl(var(--primary))' },
                },
                '& .MuiInputBase-input': {
                  color: 'hsl(var(--foreground))',
                  ...(isSecretField && !isRevealed && {
                    WebkitTextSecurity: 'disc',
                    textSecurity: 'disc',
                    fontFamily: 'text-security-disc, monospace',
                  } as React.CSSProperties),
                },
                '& .MuiInputLabel-root': { color: isSecretField ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' },
                '& .MuiFormHelperText-root': { color: fieldErrors[fieldKey] ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))' },
              }}
            />
          );
        })}
      </Box>
    );

  };

  // No longer rendering fallback API key field - apps without parameters don't need auth config

  // Validate a single field
  const validateField = (key: string, value: string): string | null => {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('url') || lowerKey === 'url') {
      if (!value) return 'URL is required';
      if (!isValidUrl(value)) return 'Please enter a valid URL (e.g., https://example.com)';
    }
    return null;
  };

  // Every parameter that looks like a URL/endpoint/host, whether the field is
  // visible in the form or hidden behind a preset selector.
  const urlParams = (): Array<{ key: string; label: string }> => {
    if (!auth?.parameters) return [];
    return auth.parameters
      .map((param, index) => {
        const nameOrId = (param.name || param.id || '').toLowerCase();
        const isUrlField = nameOrId.includes('url') || nameOrId.includes('endpoint') || nameOrId.includes('host');
        if (!isUrlField) return null;
        return {
          key: param.id || param.name || `param_${index}`,
          label: param.name || param.id || 'URL',
        };
      })
      .filter(Boolean) as Array<{ key: string; label: string }>;
  };

  // Check if all required fields are valid for saving
  const isFormValid = (): boolean => {
    // Check for any field errors
    if (Object.values(fieldErrors).some(err => err)) return false;
    
    // Validate all current credentials
    for (const [key, value] of Object.entries(localCredentials)) {
      const error = validateField(key, value);
      if (error) return false;
    }

    // URL fields are mandatory even when hidden — a saved auth without a URL
    // is useless, so never let it slip through.
    for (const { key } of urlParams()) {
      const value = (localCredentials[key] || '').trim();
      if (!value || !isValidUrl(value)) return false;
    }
    
    // Check parameters are filled — every visible (non-URL when hidden) parameter must have a value
    if (auth?.parameters && auth.parameters.length > 0) {
      const visibleParams = auth.parameters.filter((param) => {
        if (!hideUrlFields) return true;
        const n = (param.name || param.id || '').toLowerCase();
        return !(n.includes('url') || n.includes('endpoint') || n.includes('host'));
      });
      for (let i = 0; i < visibleParams.length; i++) {
        const param = visibleParams[i];
        const fieldKey = param.id || param.name || `param_${auth.parameters.indexOf(param)}`;
        if (!localCredentials[fieldKey]?.trim()) return false;
      }
      if (visibleParams.length === 0) return false;
    }
    // Apps without parameters don't need validation - they work without auth
    
    return true;
  };

  const handleSave = async () => {
    // Hard block: never PUT an authentication that is missing its URL.
    const missingUrl = urlParams().filter(({ key }) => {
      const value = (localCredentials[key] || '').trim();
      return !value || !isValidUrl(value);
    });
    if (missingUrl.length > 0) {
      setFieldErrors((prev) => ({
        ...prev,
        ...Object.fromEntries(missingUrl.map(({ key }) => [key, 'A valid URL is required'])),
      }));
      toast.error('URL is required', {
        description: `Set a valid URL for: ${missingUrl.map((m) => m.label).join(', ')}`,
      });
      return;
    }

    setSaving(true);
    setSaveSuccess(null);
    const success = await onSaveAuth(app.objectID, localCredentials);
    setSaving(false);
    setSaveSuccess(success);
    if (success) {
      setUserHasSelected(false); // Allow auto-selection to pick up new auth
      setFieldErrors({}); // Clear errors
      // NOTE: Intentionally keep `localCredentials` populated so that if the
      // auto-test that runs right after a successful PUT fails, the user can
      // edit and retry without re-typing every field.
      if (!suppressSaveToast) {
        toast.success('Authentication saved', {
          description: `Your ${app.name.replace(/_/g, ' ')} credentials have been stored securely.`,
        });
      }
      if (onTestConnection) {
        onTestConnection(app.objectID, selectedAuthId !== ADD_NEW_AUTH ? selectedAuthId : undefined);
      }
    }

  };


  // Helper to update local credentials and notify parent
  const handleCredentialChange = (key: string, value: string) => {
    // Ignore empty keys
    if (!key || key.trim() === '') return;
    
    const updated = { ...localCredentials, [key]: value };
    setLocalCredentials(updated);
    onAuthChange(app.objectID, updated);
    
    // Validate the field
    const error = validateField(key, value);
    setFieldErrors(prev => ({
      ...prev,
      [key]: error || '',
    }));
  };

  return (
    <motion.div variants={itemVariants} style={{ width: '100%', maxWidth: '100%' }}>
      <Card
        sx={{
          background: 'transparent',
          border: borderless ? 'none' : '1px solid',
          borderColor: borderless
            ? 'transparent'
            : isTested
            ? 'hsl(var(--severity-low) / 0.9)'
            : authState.status === 'error'
            ? 'hsl(var(--destructive) / 0.7)'
            : 'hsl(var(--border))',
          borderRadius: borderless ? 0 : 3,
          boxShadow: 'none',
          overflow: 'hidden',
          transition: 'all 0.3s ease',
          width: '100%',
          maxWidth: '100%',
        }}
      >
        {!hideHeader && (
        <CardContent
          onClick={onToggle}
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'flex-start', sm: 'center' },
            gap: { xs: 1.5, sm: 2 },
            cursor: 'pointer',
            p: { xs: 2, sm: 3 },
            '&:last-child': { pb: { xs: 2, sm: 3 } },
            '&:hover': { backgroundColor: 'hsl(var(--muted) / 0.35)' },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, minWidth: 0 }}>
            <Box
              sx={{
                width: { xs: 40, sm: 48 },
                height: { xs: 40, sm: 48 },
                borderRadius: 2,
                backgroundColor: 'hsl(var(--muted) / 0.5)',
                p: 1,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppFallbackIcon
                name={app.name}
                imageUrl={app.image_url}
                size={32}
                style={{ borderRadius: 6 }}
              />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography 
                sx={{ 
                  color: 'hsl(var(--foreground))', 
                  fontWeight: 600, 
                  fontSize: { xs: '0.9rem', sm: '1rem' },
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {app.name.replace(/_/g, ' ')}
              </Typography>
              {app.description && (
                <Typography 
                  variant="caption" 
                  sx={{ 
                    color: 'hsl(var(--muted-foreground))',
                    display: { xs: 'none', md: 'block' },
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '100%',
                  }}
                >
                  {app.description}
                </Typography>
              )}
            </Box>
          </Box>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: { xs: 1, sm: 1.5 }, 
            flexWrap: 'wrap',
            width: { xs: '100%', sm: 'auto' },
            justifyContent: { xs: 'flex-start', sm: 'flex-end' },
          }}>
            {/* Auth status chip - show "Auth not required" for no-auth apps */}
            {!hideStatusChips && (isNoAuthRequired(auth) ? (
              <AuthStatusChip status="no-auth" />
            ) : (
              <>
                {/* Configured status chip */}
                <AuthStatusChip
                  status={isTested ? 'validated' : isConfigured ? 'configured' : 'not-configured'}
                />
                {/* Tested status chip */}
                <AuthStatusChip
                  status={isTested ? 'tested' : 'not-tested'}
                  tooltip={isTested ? `Last validated: ${formatLastValidDate()}` : undefined}
                />

              </>
            ))}
            {!hideDocsLink && (
            <Tooltip title="View documentation">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenDocs();
                }}
                sx={{
                  color: 'hsl(var(--muted-foreground))',
                  '&:hover': { 
                    color: 'hsl(var(--severity-info))',
                    backgroundColor: 'hsl(var(--severity-info) / 0.1)',
                  },
                }}
              >
                <MenuBookIcon size={16} />
              </IconButton>
            </Tooltip>
            )}
            <IconButton
              size="small"
              sx={{
                color: 'hsl(var(--muted-foreground))',
                transform: isExpanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.3s ease',
              }}
            >
              <ExpandMoreIcon />
            </IconButton>
          </Box>
        </CardContent>
        )}

        <Collapse in={isExpanded}>
          <Box
            sx={{
              px: borderless ? 0 : { xs: 2, sm: 3 },
              pb: borderless ? 0 : { xs: 2, sm: 3 },
              pt: borderless ? 0 : 2,
              borderTop: borderless ? 'none' : '1px solid hsl(var(--border))',
            }}
          >
            {/* Auth Selection Dropdown - always at top */}
            {!compactAuthForm && (apiAuthEntries.length > 0 || alwaysShowAuthSelector) && (

              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', mb: 1 }}>
                  Select authentication
                </Typography>
                <FormControl fullWidth size="small">
                  <Select
                    value={selectedAuthId}
                    onChange={(e) => {
                      const value = e.target.value as string;
                      setSelectedAuthId(value);
                      // Track that user has made an explicit selection
                      setUserHasSelected(true);
                      if (value !== ADD_NEW_AUTH && onSelectAuth) {
                        onSelectAuth(app.objectID, value);
                      }
                    }}
                    sx={{
                      backgroundColor: 'transparent',
                      borderRadius: 2,
                      color: 'hsl(var(--foreground))',
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--border))' },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--border) / 0.8)' },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--primary))' },
                      '& .MuiSvgIcon-root': { color: 'hsl(var(--muted-foreground))' },
                    }}
                    MenuProps={{
                      sx: { zIndex: 10020 },
                      slotProps: {
                        paper: {
                        sx: {
                          backgroundColor: 'background.paper',
                          border: '1px solid',
                          borderColor: 'divider',
                          maxWidth: 480,
                          '& .MuiMenuItem-root': { maxWidth: '100%' },
                        },
                        },
                      },
                    }}
                  >
                    {/* Sort by created date - most recent first */}
                    {[...apiAuthEntries]
                      .sort((a, b) => {
                        const aTime = a.created || a.edited || 0;
                        const bTime = b.created || b.edited || 0;
                        return bTime - aTime; // Descending (newest first)
                      })
                      .map((authEntry, index) => {
                      const isLatest = index === 0 && apiAuthEntries.length > 1;
                      const entryId = authEntry.id || authEntry.label || index.toString();
                      const entryLabel = authEntry.label || `Auth ${index + 1}`;
                      const isActive = authEntry.active === true;
                      const isValid =
                        authEntry.validation?.valid === true ||
                        testStatusPerAuth[entryId] === 'success' ||
                        (!!authEntry.id && getValidatedAuthIds().has(authEntry.id));

                      
                      // Format timestamp for tooltips
                      const formatTimestamp = (ts?: number): string => {
                        if (!ts) return 'Unknown';
                        const date = ts > 1e12 ? new Date(ts) : new Date(ts * 1000);
                        return date.toLocaleString();
                      };
                      
                      const configuredDate = authEntry.created || authEntry.edited;
                      const lastValidDate = authEntry.validation?.last_valid;
                      
                      return (
                        <MenuItem key={entryId} value={entryId} sx={{ color: 'hsl(var(--foreground))', py: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', minWidth: 0 }}>
                            <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                              <AuthStatusChip
                                dense
                                status={isValid ? 'validated' : isActive ? 'configured' : 'not-configured'}
                                tooltip={isActive ? `Created: ${formatTimestamp(configuredDate)}` : 'Not configured'}
                              />
                              <AuthStatusChip
                                dense
                                status={isValid ? 'tested' : 'not-tested'}
                                tooltip={lastValidDate ? `Last valid: ${formatTimestamp(lastValidDate)}` : isValid ? 'Connection verified' : 'Never validated'}
                              />

                              {isLatest && (
                                <AuthStatusChip dense status="latest" />
                              )}
                            </Box>

                            <Typography sx={{ 
                              flex: 1, 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis', 
                              whiteSpace: 'nowrap',
                              minWidth: 0,
                            }}>
                              {entryLabel}
                            </Typography>
                            {/* Delete button, available for every entry */}
                            {(

                              <Tooltip title="Delete authentication" arrow placement="top">
                                <IconButton
                                  size="small"
                                  // MUI Select opens on mousedown/touchstart, so the
                                  // click handler alone is not enough when this row is
                                  // rendered as the closed selected value.
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                  }}
                                  onTouchStart={(e) => {
                                    e.stopPropagation();
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setDeleteConfirmAuthId(entryId);
                                  }}

                                  sx={{
                                    color: 'hsl(var(--muted-foreground))',
                                    p: 0.5,
                                    ml: 0.5,
                                    flexShrink: 0,
                                    '&:hover': {
                                      color: 'hsl(var(--destructive))',
                                      backgroundColor: 'hsl(var(--destructive) / 0.1)',
                                    },
                                  }}
                                >
                                  <DeleteOutlineIcon size={16} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </MenuItem>
                      );
                    })}
                    <Divider sx={{ borderColor: 'hsl(var(--border))', my: 1 }} />
                    <MenuItem value={ADD_NEW_AUTH} sx={{ color: 'hsl(var(--primary))', fontWeight: 600 }}>
                      + Add new authentication
                    </MenuItem>
                  </Select>
                </FormControl>

                {/* Delete confirmation dialog */}
                <Dialog
                  open={!!deleteConfirmAuthId}
                  onClose={() => setDeleteConfirmAuthId(null)}
                  sx={{ zIndex: 10010 }}
                  slotProps={{
                    paper: {
                      sx: {
                        backgroundColor: 'background.paper',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 3,
                        minWidth: 360,
                      },
                    },
                  }}
                >
                  <DialogTitle sx={{ color: 'hsl(var(--foreground))', fontWeight: 600, pb: 1 }}>
                    Delete Authentication
                  </DialogTitle>
                  <DialogContent>
                    <Typography sx={{ color: 'hsl(var(--muted-foreground))', mb: 3 }}>
                      Are you sure you want to delete this authentication? This action cannot be undone.
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => setDeleteConfirmAuthId(null)}
                        disabled={deleting}
                        sx={{
                          borderColor: 'hsl(var(--border))',
                          color: 'hsl(var(--muted-foreground))',
                          textTransform: 'none',
                          '&:hover': {
                            borderColor: 'hsl(var(--border) / 0.8)',
                            backgroundColor: 'hsl(var(--muted) / 0.5)',
                          },
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => {
                          if (deleteConfirmAuthId) handleDeleteAuth(deleteConfirmAuthId);
                        }}
                        disabled={deleting}
                        sx={{
                          backgroundColor: 'hsl(var(--destructive))',
                          color: 'hsl(var(--destructive-foreground))',
                          textTransform: 'none',
                          fontWeight: 600,
                          '&:hover': { backgroundColor: 'hsl(var(--destructive) / 0.9)' },
                          '&.Mui-disabled': {
                            backgroundColor: 'hsl(var(--destructive) / 0.3)',
                            color: 'hsl(var(--destructive-foreground) / 0.5)',
                          },
                        }}
                      >
                        {deleting ? 'Deleting...' : 'Delete'}
                      </Button>
                    </Box>
                  </DialogContent>
                </Dialog>

                {/* Show selected auth info if not adding new */}
                {!showAddNewForm && selectedAuth && (
                  <Box sx={{ 
                    mt: 2, 
                    p: 0,
                    backgroundColor: 'transparent',
                    borderRadius: 3,
                    border: '1px solid hsl(var(--border))',
                    overflow: 'hidden',
                  }}>
                    {/* Active authentication header */}
                    <Box sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: { xs: 2, sm: 2.5 },
                      py: 1.5,
                      borderBottom: '1px solid hsl(var(--border))',
                      backgroundColor: 'transparent',
                    }}>
                      <Box sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: localTestStatus === 'success' || localTestStatus === 'pending_validation'
                          ? 'hsl(var(--severity-low))'
                          : localTestStatus === 'error'
                          ? 'hsl(var(--destructive))'
                          : 'hsl(var(--muted-foreground))',
                        boxShadow: localTestStatus === 'success' || localTestStatus === 'pending_validation'
                          ? '0 0 8px hsl(var(--severity-low) / 0.6)'
                          : localTestStatus === 'error'
                          ? '0 0 8px hsl(var(--destructive) / 0.6)'
                          : '0 0 8px hsl(var(--muted-foreground) / 0.4)',
                      }} />
                      <Typography sx={{ 
                        color: 'hsl(var(--muted-foreground))', 
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        {localTestStatus === 'success' || localTestStatus === 'pending_validation'
                          ? 'Verified Authentication'
                          : localTestStatus === 'error'
                          ? 'Test Failed'
                          : 'Pending Verification'}
                      </Typography>
                    </Box>

                    {/* Main content area — always stacked vertically for drawer contexts */}
                    <Box sx={{ 
                      display: 'flex', 
                      flexDirection: 'column',
                      alignItems: 'stretch', 
                      gap: 2,
                      p: { xs: 2, sm: 2.5 },
                    }}>
                      {/* Auth name with icon */}
                      <Box sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 1.5, 
                        minWidth: 0,
                        flex: 1,
                      }}>
                        <Box sx={{
                          width: 36,
                          height: 36,
                          borderRadius: 2,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'transparent',
                          border: `1px solid ${
                            localTestStatus === 'success' || localTestStatus === 'pending_validation'
                              ? 'hsl(var(--severity-low) / 0.3)'
                              : localTestStatus === 'error'
                              ? 'hsl(var(--destructive) / 0.3)'
                              : isTested
                              ? 'hsl(var(--severity-low) / 0.3)'
                              : isConfigured
                              ? 'hsl(var(--severity-medium) / 0.3)' // Yellow for configured but not tested
                              : 'hsl(var(--border))'
                          }`,
                          flexShrink: 0,
                        }}>
                          <CheckCircleIcon size={20} />
                        </Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {editingLabel ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} onClick={e => e.stopPropagation()}>
                                <TextField
                                  value={editLabelValue}
                                  onChange={e => setEditLabelValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleRenameAuth();
                                    if (e.key === 'Escape') setEditingLabel(false);
                                  }}
                                  size="small"
                                  autoFocus
                                  sx={{
                                    '& .MuiOutlinedInput-root': {
                                      height: 28,
                                      fontSize: '0.85rem',
                                      fontWeight: 600,
                                      color: 'hsl(var(--foreground))',
                                      '& fieldset': { borderColor: 'hsl(var(--border))' },
                                      '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
                                    },
                                    '& .MuiOutlinedInput-input': { py: 0.25, px: 1 },
                                  }}
                                />
                                <Button
                                  size="small"
                                  variant="contained"
                                  onClick={handleRenameAuth}
                                  disabled={savingLabel || !editLabelValue.trim()}
                                  sx={{
                                    minWidth: 0,
                                    px: 1.5,
                                    py: 0.25,
                                    fontSize: '0.7rem',
                                    textTransform: 'none',
                                    bgcolor: 'hsl(var(--primary))',
                                    '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
                                  }}
                                >
                                  {savingLabel ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : 'Save'}
                                </Button>
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={() => setEditingLabel(false)}
                                  sx={{
                                    minWidth: 0,
                                    px: 1,
                                    py: 0.25,
                                    fontSize: '0.7rem',
                                    textTransform: 'none',
                                    color: 'hsl(var(--muted-foreground))',
                                  }}
                                >
                                  Cancel
                                </Button>
                              </Box>
                            ) : (
                              <>
                                <Typography sx={{ 
                                  color: 'hsl(var(--foreground))', 
                                  fontWeight: 600, 
                                  fontSize: { xs: '0.9rem', sm: '0.95rem' },
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  lineHeight: 1.3,
                                }}>
                                  {selectedAuth.label || 'Selected authentication'}
                                </Typography>
                                <Tooltip title="Rename authentication" arrow>
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditLabelValue(selectedAuth.label || '');
                                      setEditingLabel(true);
                                    }}
                                    sx={{
                                      p: 0.3,
                                      color: 'hsl(var(--muted-foreground))',
                                      '&:hover': { color: 'hsl(var(--primary))' },
                                    }}
                                  >
                                    <EditIcon size={14} />
                                  </IconButton>
                                </Tooltip>
                              </>
                            )}
                          </Box>
                          <Typography sx={{ 
                            color: localTestStatus === 'success' || localTestStatus === 'pending_validation'
                              ? 'hsl(var(--severity-low))'
                              : localTestStatus === 'error'
                              ? 'hsl(var(--destructive))'
                              : isTested
                              ? 'hsl(var(--severity-low))'
                              : isConfigured
                              ? 'hsl(var(--severity-medium))' // Yellow for configured but not tested
                              : 'hsl(var(--muted-foreground))',
                            fontSize: '0.75rem',
                            mt: 0.25,
                            fontWeight: (localTestStatus !== 'untested' || isTested || isConfigured) ? 500 : 400,
                          }}>
                            {localTestStatus === 'success' || localTestStatus === 'pending_validation'
                              ? 'Connection verified'
                              : localTestStatus === 'error'
                              ? 'Test failed'
                              : localTestStatus === 'testing'
                              ? 'Testing...'
                              : 'Not tested in this session'}
                          </Typography>
                        </Box>
                      </Box>

                      {/* Test Connection button */}
                      <Button
                        variant={authState.status === 'testing' ? 'contained' : 'outlined'}
                        size="medium"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Track which auth is being tested so results go to the right auth
                          setTestingAuthId(selectedAuthId);
                          onTestConnection(app.objectID, selectedAuthId !== ADD_NEW_AUTH ? selectedAuthId : undefined);
                        }}
                        disabled={authState.status === 'testing'}
                        startIcon={
                          authState.status === 'testing' 
                            ? <CircularProgress size={16} sx={{ color: 'inherit' }} />
                            : <CheckCircleIcon size={18} />
                        }
                        sx={{
                          borderColor: authState.status === 'testing' ? 'transparent' : 'hsl(var(--primary) / 0.5)',
                          color: authState.status === 'testing' ? 'hsl(var(--foreground))' : 'hsl(var(--primary))',
                          background: authState.status === 'testing' 
                            ? 'linear-gradient(90deg, hsl(var(--primary) / 0.3) 0%, hsl(var(--primary) / 0.5) 50%, hsl(var(--primary) / 0.3) 100%)'
                            : 'transparent',
                          backgroundSize: authState.status === 'testing' ? '200% 100%' : 'auto',
                          animation: authState.status === 'testing' ? 'shimmer 1.5s infinite linear' : 'none',
                          fontWeight: 600,
                          textTransform: 'none',
                          px: 3,
                          py: 1,
                          borderRadius: 2,
                          flexShrink: 0,
                          minWidth: 160,
                          width: '100%',
                          transition: 'all 0.3s ease',
                          '@keyframes shimmer': {
                            '0%': { backgroundPosition: '200% 0' },
                            '100%': { backgroundPosition: '-200% 0' },
                          },
                          '&:hover': {
                            borderColor: 'hsl(var(--primary))',
                            backgroundColor: authState.status === 'testing' ? undefined : 'hsl(var(--primary) / 0.08)',
                          },
                          '&.Mui-disabled': {
                            color: authState.status === 'testing' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                            borderColor: authState.status === 'testing' ? 'transparent' : 'hsl(var(--border))',
                          },
                        }}
                      >
                        {authState.status === 'testing' ? 'Testing Connection...' : 'Test Connection'}
                      </Button>
                    </Box>

                    {/* Status messages - only show for current test session */}
                    {localTestStatus === 'error' && localTestMessages.errorMessage && (
                      <Box sx={{ 
                        px: { xs: 2, sm: 2.5 }, 
                        pb: { xs: 2, sm: 2.5 },
                      }}>
                        <Alert
                          severity="error"
                          sx={{
                            backgroundColor: 'transparent',
                            color: 'hsl(var(--destructive))',
                            border: '1px solid hsl(var(--destructive) / 0.3)',
                            borderRadius: 2,
                            '& .MuiAlert-icon': { color: 'hsl(var(--destructive))' },
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, width: '100%' }}>
                            <Typography sx={{ fontSize: '0.875rem', flex: 1 }}>
                              {localTestMessages.errorMessage}
                            </Typography>
                            {localTestMessages.executionId && (
                              <ViewExecutionButton executionId={localTestMessages.executionId} tone="destructive" />
                            )}
                          </Box>
                        </Alert>
                      </Box>
                    )}
                    {localTestStatus === 'success' && localTestMessages.warningMessage && (
                      <Box sx={{ 
                        px: { xs: 2, sm: 2.5 }, 
                        pb: { xs: 2, sm: 2.5 },
                      }}>
                        <Alert
                          severity="warning"
                          sx={{
                            backgroundColor: 'transparent',
                            color: 'hsl(var(--severity-medium))',
                            border: '1px solid hsl(var(--severity-medium) / 0.3)',
                            borderRadius: 2,
                            '& .MuiAlert-icon': { 
                              color: 'hsl(var(--severity-medium))',
                            },
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, width: '100%' }}>
                            <Box sx={{ flex: 1 }}>
                              <Typography sx={{ fontWeight: 600, mb: 0.5 }}>
                                {localTestMessages.successMessage || 'Connection probably working'}
                              </Typography>
                              <Typography sx={{ fontSize: '0.85rem', opacity: 0.9 }}>
                                {localTestMessages.warningMessage}
                              </Typography>
                            </Box>
                            {localTestMessages.executionId && (
                              <ViewExecutionButton executionId={localTestMessages.executionId} />
                            )}
                          </Box>
                        </Alert>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            )}

            {/* Show form when no auths exist or "Add new" is selected */}
            {(apiAuthEntries.length === 0 || showAddNewForm) && (
              <Box sx={{ 
                p: 3, 
                backgroundColor: 'transparent', 
                borderRadius: 2,
                border: '1px solid hsl(var(--border))',
              }}>
                {/* Show credential error notice if switched due to 401/403 */}
                {isCredentialError && (
                  <Alert
                    severity="warning"
                    sx={{
                      backgroundColor: 'transparent',
                      color: 'hsl(var(--severity-medium))',
                      border: '1px solid hsl(var(--severity-medium) / 0.3)',
                      borderRadius: 2,
                      mb: 2,
                      '& .MuiAlert-icon': { color: 'hsl(var(--severity-medium))' },
                    }}
                  >
                    <Typography sx={{ fontSize: '0.875rem' }}>
                      {localTestMessages.errorCode === 401 
                        ? 'Previous credentials were invalid or expired. Please enter new credentials.'
                        : 'Access was denied with the previous credentials. Please re-authenticate with valid permissions.'}
                    </Typography>
                  </Alert>
                )}
                <Typography variant="subtitle2" sx={{ color: 'hsl(var(--foreground))', fontWeight: 600, mb: 2 }}>
                  {apiAuthEntries.length === 0 ? `Configure ${app.name.replace(/_/g, ' ')}` : 'Add New Authentication'}
                </Typography>
                
                {loading ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size={32} sx={{ color: 'hsl(var(--primary))' }} />
                    <Typography sx={{ ml: 2, color: 'hsl(var(--muted-foreground))' }}>
                      Loading configuration...
                    </Typography>
                  </Box>
                ) : (saving || authState.status === 'testing') ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size={32} sx={{ color: 'hsl(var(--primary))' }} />
                    <Typography sx={{ ml: 2, color: 'hsl(var(--muted-foreground))' }}>
                      {saving ? 'Saving authentication...' : 'Testing connection...'}
                    </Typography>
                  </Box>
                ) : error ? (
                  <Alert
                    severity="error"
                    sx={{
                      backgroundColor: 'transparent',
                      color: 'hsl(var(--destructive))',
                      border: '1px solid hsl(var(--destructive) / 0.3)',
                      borderRadius: 2,
                    }}
                  >
                    {error}
                  </Alert>
                ) : isNoAuthRequired(auth) ? (
                  <Alert
                    severity="info"
                    sx={{
                      backgroundColor: 'transparent',
                      color: 'hsl(var(--severity-info))',
                      border: '1px solid hsl(var(--severity-info) / 0.3)',
                      borderRadius: 2,
                      '& .MuiAlert-icon': { color: 'hsl(var(--severity-info))' },
                    }}
                  >
                    <Box>
                      <Typography sx={{ fontWeight: 600, mb: 0.5 }}>
                        No authentication required
                      </Typography>
                      <Typography sx={{ fontSize: '0.85rem', opacity: 0.9 }}>
                        This app works without credentials. You can use it directly.
                      </Typography>
                    </Box>
                  </Alert>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {extraFieldsSlot?.({ credentials: localCredentials, setField: handleCredentialChange })}
                    {/* Render dynamic fields based on auth type */}
                    {renderOAuth2Fields()}
                    {renderParameterFields()}

                    {authState.status === 'error' && authState.errorMessage && (
                      <Alert
                        severity="error"
                        sx={{
                          backgroundColor: 'transparent',
                          color: 'hsl(var(--destructive))',
                          border: '1px solid hsl(var(--destructive) / 0.3)',
                          borderRadius: 2,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, width: '100%' }}>
                          <Typography sx={{ fontSize: '0.875rem', flex: 1 }}>
                            {authState.errorMessage}
                          </Typography>
                          {authState.executionId && (
                            <ViewExecutionButton executionId={authState.executionId} tone="destructive" />
                          )}
                        </Box>
                      </Alert>
                    )}

                    {/* Success message removed per user request */}

                    {saveSuccess === false && (
                      <Alert
                        severity="error"
                        sx={{
                          backgroundColor: 'transparent',
                          color: 'hsl(var(--destructive))',
                          border: '1px solid hsl(var(--destructive) / 0.3)',
                          borderRadius: 2,
                        }}
                      >
                        Failed to save authentication. Please try again.
                      </Alert>
                    )}

                    {/* Save button for non-OAuth2 apps */}
                    {!isOAuth2 && (
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1.5, gap: 1, flexWrap: 'wrap' }}>
                        {pendingFailedAuthId && (
                          <Button
                            variant="text"
                            size="medium"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const previousFailedId = pendingFailedAuthId;
                              setPendingFailedAuthId(null);
                              setUserHasSelected(true);
                              setFieldErrors({});
                              // Re-PUT the credentials so URL/model/apikey from
                              // the in-memory form are guaranteed to be on the
                              // accepted entry (the original PUT may have raced
                              // with preset selection and missed the URL).
                              await onSaveAuth(app.objectID, localCredentials);
                              // Refresh to pick up the newest entry.
                              let entries = apiAuthEntries;
                              if (onRefreshAuth) {
                                await onRefreshAuth();
                              }
                              // Best-effort: re-read entries after refresh.
                              entries = (apiAuthEntries || []);
                              // Newest entry = the one we just PUT. Fall back
                              // to the previously-failed id if we cannot tell.
                              const sorted = [...entries].sort((a, b) => (b.created || 0) - (a.created || 0));
                              const acceptId = (sorted[0]?.id as string) || previousFailedId;
                              setSelectedAuthId(acceptId);
                              // Delete every other saved auth for this app so
                              // the accepted one is the only entry left.
                              const stale = entries.filter((e) => e.id && e.id !== acceptId);
                              await Promise.all(stale.map(async (entry) => {
                                try {
                                  await fetch(getApiUrl(`/api/v1/apps/authentication/${entry.id}`), {
                                    method: 'DELETE',
                                    credentials: 'include',
                                    headers: { ...getAuthHeader() },
                                  });
                                } catch (err) {
                                  console.error('[AppAuthCard] Failed to delete stale auth on Save anyway:', err);
                                }
                              }));
                              invalidateAuthenticatedAppsCache();
                              if (onRefreshAuth) await onRefreshAuth();
                              if (onSelectAuth) onSelectAuth(app.objectID, acceptId);
                              // Tell anyone listening (AgentUI's "Choose LLM"
                              // chip, sidebar integration dots, etc.) that
                              // the auth list changed so they re-read it.
                              if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('integrations-changed'));
                                // Close the agent drawer so the user lands
                                // back on the page with the accepted auth.
                                window.dispatchEvent(new CustomEvent('agent-drawer-close'));
                              }
                            }}
                            sx={{
                              color: 'hsl(var(--muted-foreground))',
                              fontWeight: 600,
                              textTransform: 'none',
                              fontSize: '0.85rem',
                              px: 2,
                              py: 1,
                              borderRadius: 2,
                              '&:hover': {
                                color: 'hsl(var(--foreground))',
                                backgroundColor: 'hsl(var(--muted) / 0.5)',
                              },
                            }}
                            title="Our test isn't always authoritative — keep the credentials you saved and dismiss the failure."
                          >
                            Save anyway
                          </Button>
                        )}
                        <Button
                          variant="outlined"
                          size="medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingFailedAuthId(null);
                            handleSave();
                          }}
                          disabled={saving || !isFormValid()}
                          sx={{
                            borderColor: isFormValid() ? 'hsl(var(--primary) / 0.5)' : 'hsl(var(--border))',
                            color: isFormValid() ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                            fontWeight: 600,
                            textTransform: 'none',
                            fontSize: '0.9rem',
                            px: 3,
                            py: 1,
                            borderRadius: 2,
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              borderColor: 'hsl(var(--primary))',
                              backgroundColor: 'hsl(var(--primary) / 0.08)',
                            },
                            '&.Mui-disabled': {
                              borderColor: 'hsl(var(--border))',
                              color: 'hsl(var(--muted-foreground))',
                            },
                          }}
                        >
                          {saving ? 'Testing...' : pendingFailedAuthId ? 'Retry Test' : 'Test Authentication'}
                        </Button>
                      </Box>
                    )}


                    {/* Save & Authenticate button for OAuth2 apps with manual credentials */}
                    {isOAuth2 && (() => {
                      const hasClientId = !!localCredentials['client_id']?.trim();
                      const hasClientSecret = !!localCredentials['client_secret']?.trim();
                      const hasScopes = selectedScopes.length > 0;
                      const hasAuthUrl = !!auth?.authorization_url;
                      const allFilled = hasClientId && hasClientSecret && (!auth?.scope?.length || hasScopes);

                      // Build the direct OAuth2 authorization URL with state
                      const buildOAuth2Url = (): string | null => {
                        if (!localCredentials['client_id']?.trim()) return null;
                        
                        // Resolve authorization URL from multiple possible fields,
                        // or derive from token_uri (common pattern: /token → /authorize)
                        const authorizationUrl = auth?.authorization_url 
                          || auth?.auth_uri 
                          || auth?.authorize_url
                          || (auth?.token_uri ? auth.token_uri.replace(/\/token\b.*$/, '/authorize') : null);
                        
                        if (!authorizationUrl) return null;
                        
                        const redirectUri = auth?.redirect_uri || 'https://shuffler.io/set_authentication';
                        const scopes = selectedScopes.join(' ');
                        const clientId = localCredentials['client_id'].trim();

                        // SECURITY: Do NOT embed client_secret in the OAuth
                        // authorization URL. The `state` parameter is echoed
                        // back through the OAuth provider (Google, GitHub, …)
                        // and would end up in browser history, provider access
                        // logs, and any URL-logging proxy on the return path.
                        // Shuffle's `set_authentication` handler retrieves the
                        // client secret from the saved auth entry server-side
                        // using the app_id / reference_action_id in state.
                        const stateParams = new URLSearchParams({
                          workflow_id: '',
                          reference_action_id: app.objectID,
                          app_name: app.name,
                          app_id: app.objectID,
                          app_version: app.app_version || '1.0.0',
                          authentication_url: auth?.token_uri || '',
                          scope: scopes,
                          client_id: clientId,
                          org_id: 'undefined',
                          oauth_url: auth?.token_uri?.replace(/\/token.*$/, '') || '',
                          refresh_uri: auth?.refresh_uri || auth?.token_uri || '',
                        });

                        const params = new URLSearchParams({
                          client_id: clientId,
                          redirect_uri: redirectUri,
                          response_type: 'code',
                          prompt: 'login',
                          scope: scopes,
                          state: stateParams.toString(),
                          access_type: 'offline',
                        });

                        return `${authorizationUrl}?${params.toString()}`;
                      };

                      return (
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1.5 }}>
                          <Button
                            variant="outlined"
                            size="medium"
                            startIcon={
                              app.image_url ? (
                                <Box
                                  component="img"
                                  src={app.image_url}
                                  alt={app.name}
                                  sx={{ width: 20, height: 20, borderRadius: 0.5, objectFit: 'contain' }}
                                />
                              ) : (
                                <LockIcon size={18} />
                              )
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              // Open OAuth2 popup directly — no save step needed
                              // The OAuth redirect callback handles credential storage
                              const directUrl = buildOAuth2Url();
                              const popupUrl = directUrl || `https://shuffler.io/appauth?app_id=${app.objectID}&source=shuffle`;
                              const popup = window.open(popupUrl, '_blank', 'width=600,height=700');
                              if (popup && onRefreshAuth) {
                                const authPollTimer = setInterval(() => {
                                  onRefreshAuth();
                                }, 3000);
                                const closePollTimer = setInterval(() => {
                                  if (popup.closed) {
                                    clearInterval(closePollTimer);
                                    clearInterval(authPollTimer);
                                    onRefreshAuth();
                                  }
                                }, 500);
                              }
                            }}
                            disabled={!allFilled}
                            sx={{
                              borderColor: allFilled ? 'hsl(var(--primary) / 0.5)' : 'hsl(var(--border))',
                              color: allFilled ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                              fontWeight: 600,
                              textTransform: 'none',
                              fontSize: '0.9rem',
                              px: 3,
                              py: 1,
                              borderRadius: 2,
                              transition: 'all 0.2s ease',
                              '&:hover': {
                                borderColor: 'hsl(var(--primary))',
                                backgroundColor: 'hsl(var(--primary) / 0.08)',
                              },
                              '&.Mui-disabled': {
                                borderColor: 'hsl(var(--border))',
                                color: 'hsl(var(--muted-foreground))',
                              },
                            }}
                          >
                            Authenticate
                          </Button>
                        </Box>
                      );
                    })()}
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </Collapse>
      </Card>

      {/* Documentation Modal */}
      <Dialog
        open={docsOpen}
        onClose={() => setDocsOpen(false)}
        maxWidth="md"
        fullWidth
        sx={{ zIndex: 10010 }}
        slotProps={{
          paper: {
            sx: {
              backgroundColor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 3,
              maxHeight: '80vh',
            },
          },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid hsl(var(--border))',
            color: 'hsl(var(--foreground))',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {app.image_url && (
              <Box
                component="img"
                src={app.image_url}
                alt={app.name}
                sx={{ width: 32, height: 32, borderRadius: 1, objectFit: 'contain' }}
              />
            )}
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {app.name.replace(/_/g, ' ')} Documentation
            </Typography>
          </Box>
          <IconButton onClick={() => setDocsOpen(false)} sx={{ color: 'hsl(var(--muted-foreground))' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {docsLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={32} sx={{ color: 'hsl(var(--primary))' }} />
              <Typography sx={{ ml: 2, color: 'hsl(var(--muted-foreground))' }}>
                Loading documentation...
              </Typography>
            </Box>
          ) : (
            <Box
              sx={{
                color: 'hsl(var(--foreground))',
                '& h1, & h2, & h3, & h4': { color: 'hsl(var(--foreground))', mt: 3, mb: 2 },
                '& p': { mb: 2, lineHeight: 1.7 },
                '& code': {
                  backgroundColor: 'hsl(var(--muted))',
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  fontSize: '0.875rem',
                },
                '& pre': {
                  backgroundColor: 'hsl(var(--background))',
                  p: 2,
                  borderRadius: 2,
                  overflow: 'auto',
                },
                '& a': { color: 'hsl(var(--primary))' },
                '& ul, & ol': { pl: 3, mb: 2 },
                '& li': { mb: 1 },
              }}
            >
              <ShuffleMarkdown>{docsContent}</ShuffleMarkdown>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export const AppAuthConfig = ({
  apps,
  authStates,
  authenticatedApps = [],
  onAuthChange,
  onTestConnection,
  onSaveAuth,
  onSelectAuth,
  onRefreshAuth,
  globalUrl,
  userdata,
  isLoaded,
  isLoggedIn,
  serverside,
}: AppAuthConfigProps) => {
  useSyncHostBaseUrl(globalUrl);
  // Helper to find ALL API auth entries for an app
  const getApiAuthEntries = (app: AlgoliaSearchApp): ApiAuthEntry[] => {
    const normalize = (n: string) => n.toLowerCase().replace(/[\s_\-]+/g, '_');
    return authenticatedApps
      .filter(auth => normalize(auth.app?.name || '') === normalize(app.name))
      .map(auth => ({
        ...auth,
        app: {
          ...auth.app,
          large_image: auth.app?.large_image || app.image_url,
        },
      }));
  };

  // Helper to check if app is configured (has any auth entry)
  const isAppConfigured = (app: AlgoliaSearchApp): boolean => {
    const entries = getApiAuthEntries(app);
    return entries.some(e => e.active === true);
  };

  // Helper to check if app is validated (data is already pre-processed to invalidate old entries)
  const isAppValidated = (app: AlgoliaSearchApp): boolean => {
    const entries = getApiAuthEntries(app);
    return entries.some(e => e.validation?.valid === true);
  };

  // Keep initial sort order stable - only sort once when authenticatedApps is loaded
  const initialSortRef = useRef<AlgoliaSearchApp[] | null>(null);
  const authAppsLoadedRef = useRef<boolean>(false);
  
  // Reset sort ref when authenticatedApps first loads with data
  if (!authAppsLoadedRef.current && authenticatedApps.length > 0) {
    authAppsLoadedRef.current = true;
    initialSortRef.current = null; // Force re-sort
  }
  
  if (initialSortRef.current === null && apps.length > 0 && authenticatedApps.length > 0) {
    // Sort priority: 
    // 1. Category-matched apps (email, siem, edr, cases) first
    // 2. Within each group: Not Configured > Not Tested > Tested
    const getPriority = (app: AlgoliaSearchApp): number => {
      const isSourceCategory = getIngestionCategory(app.name, app.categories) !== null;
      const configured = isAppConfigured(app);
      const validated = isAppValidated(app);
      
      // Category apps get priority 0-2, non-category apps get 3-5
      const base = isSourceCategory ? 0 : 3;
      if (!configured) return base;      // Not Configured - top of group
      if (!validated) return base + 1;    // Configured but Not Tested - middle
      return base + 2;                     // Tested - bottom of group
    };
    
    initialSortRef.current = [...apps].sort((a, b) => {
      return getPriority(a) - getPriority(b);
    });
  }

  // Use the stable initial sort, or fall back to apps if not yet initialized
  const sortedApps = initialSortRef.current || apps;

  // Find first non-validated app for auto-expand (prefer not configured, then not tested)
  const firstNotConfigured = sortedApps.find(app => !isAppConfigured(app));
  const firstNotValidated = sortedApps.find(app => !isAppValidated(app));
  // If every app is already validated, start with all cards collapsed — the
  // user has nothing left to do here, so do not auto-open one for them.
  const defaultExpanded = firstNotConfigured?.objectID || firstNotValidated?.objectID || false;

  const [expanded, setExpanded] = useState<string | false>(defaultExpanded);

  if (apps.length === 0) {
    return (
      <Alert
        severity="info"
        sx={{
          backgroundColor: 'transparent',
          color: 'hsl(var(--primary))',
          border: '1px solid hsl(var(--primary) / 0.3)',
          borderRadius: 2,
        }}
      >
        No integrations selected. Go back and select at least one integration.
      </Alert>
    );
  }

  // Count validated vs total
  const validatedCount = sortedApps.filter(app => isAppValidated(app)).length;
  const totalCount = sortedApps.length;

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
      <Typography
        variant="h5"
        sx={{
          color: 'hsl(var(--foreground))',
          fontWeight: 700,
          mb: 1,
          fontSize: { xs: '1.25rem', sm: '1.5rem' },
        }}
      >
        Configure Authentication
      </Typography>
      <Typography
        variant="body1"
        sx={{ mb: 2, color: 'hsl(var(--muted-foreground))', fontSize: { xs: '0.875rem', sm: '1rem' } }}
      >
        Set up credentials for each integration. Apps with orange borders need configuration.
      </Typography>
      <Chip
        label={`${validatedCount}/${totalCount} validated`}
        size="small"
        sx={{
          mb: 3,
          background: validatedCount === totalCount 
            ? 'hsl(var(--severity-low) / 0.15)' 
            : 'hsl(var(--severity-medium) / 0.15)',
          color: validatedCount === totalCount ? 'hsl(var(--severity-low))' : 'hsl(var(--severity-medium))',
          fontWeight: 600,
        }}
      />

      <motion.div variants={containerVariants} initial="hidden" animate="visible">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', maxWidth: '100%' }}>
          {sortedApps.map((app) => {
            const authState = authStates[app.objectID] || { systemId: app.objectID, status: 'pending' as const, credentials: {} };
            const isExpanded = expanded === app.objectID;
            const apiAuthEntries = getApiAuthEntries(app);

            return (
              <AppAuthCard
                globalUrl={globalUrl}
                userdata={userdata}
                isLoaded={isLoaded}
                isLoggedIn={isLoggedIn}
                serverside={serverside}
                key={app.objectID}
                app={app}
                authState={authState}
                isExpanded={isExpanded}
                onToggle={() => setExpanded(isExpanded ? false : app.objectID)}
                onAuthChange={onAuthChange}
                onTestConnection={onTestConnection}
                onSaveAuth={onSaveAuth}
                apiAuthEntries={apiAuthEntries}
                onSelectAuth={onSelectAuth}
                onRefreshAuth={onRefreshAuth}
              />
            );
          })}
        </Box>
      </motion.div>
    </Box>
  );
};
