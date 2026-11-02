import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Divider,
  Chip,
  CircularProgress,
  LinearProgress,
  Avatar,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  IconButton,
  Tooltip,
  Collapse,
  Checkbox,
  Autocomplete,
  TextField,
} from '@mui/material';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Bot,
  Terminal,
  Cpu,
  Layers,
  Lock,
  Zap,
  Building2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Bug,
  Key,
  RefreshCw,
  Globe,
  HelpCircle,
  LogIn,
  Sliders,
  Code2,
  UserCheck,
} from 'lucide-react';
import { ensureShuffleSecurityApiUrl, getApiUrl, getAuthHeader } from '../../api';
import { toast } from '../../toast';
import { safeRandomUUID } from '@/utils/uuid';
import { ShuffleCompanyLogo } from '@/components/common/ShuffleLogo';
import { useOptionalAuth } from '@/context/AuthContext';
import { AppFallbackIcon } from '../AppFallbackIcon';
import {
  evaluateOAuthVendorIdentity,
  findOAuthVendorSpec,
  getVerificationStatusMeta,
  type OAuthRawSource,
  type OAuthVerificationStatus,
} from './oauthVendors';

export interface OrganizationLike {
  id: string;
  name: string;
  image?: string;
  role?: string;
  creator_org?: string;
  region_url?: string;
  [key: string]: unknown;
}

export interface UserInfoLike {
  id?: string;
  username?: string;
  email?: string;
  support?: boolean;
  role?: string;
  active_org?: OrganizationLike;
  orgs?: OrganizationLike[];
  [key: string]: unknown;
}

export interface OAuthAuthorizeViewProps {
  userInfo?: UserInfoLike | null;
  activeOrg?: OrganizationLike | null;
  isSupport?: boolean;
  onAuthSuccess?: (code: string, redirectUrl?: string) => void;
  onAuthDeny?: (redirectUrl?: string) => void;
  onOrgChange?: (orgId: string) => Promise<void> | void;
  globalUrl?: string;
  className?: string;
  style?: React.CSSProperties;
}

export interface OAuthScopeDetail {
  id: string;
  category: 'general' | 'app' | 'workflow' | 'incident' | 'mcp' | 'system';
  title: string;
  description: string;
  badge?: string;
}

// Predefined catalog of OAuth 2.0 / 2.1 scopes for Shuffle Applications and Integrations
const PREDEFINED_SCOPES: Record<string, OAuthScopeDetail> = {
  // Identity & Account Scopes
  'openid': {
    id: 'openid',
    category: 'general',
    title: 'Verify Identity (OpenID)',
    description: 'Verify your identity and unique user identifier in Shuffle.',
    badge: 'OpenID',
  },
  'profile': {
    id: 'profile',
    category: 'general',
    title: 'Access Basic Profile',
    description: 'Read your username, name, and active tenant membership.',
    badge: 'Profile',
  },
  'email': {
    id: 'email',
    category: 'general',
    title: 'Read Email Address',
    description: 'Access the primary email address associated with your Shuffle user account.',
    badge: 'Email',
  },
  'offline_access': {
    id: 'offline_access',
    category: 'general',
    title: 'Maintain Offline Access',
    description: 'Maintain persistent access via refresh tokens while you are offline.',
    badge: 'Offline',
  },
  'read': {
    id: 'read',
    category: 'general',
    title: 'Read Platform Resources',
    description: 'Read configurations, assets, and platform resources in your tenant.',
    badge: 'Read',
  },
  'write': {
    id: 'write',
    category: 'general',
    title: 'Modify Platform Resources',
    description: 'Create and update configurations, assets, and settings in your tenant.',
    badge: 'Write',
  },
  'api:read': {
    id: 'api:read',
    category: 'general',
    title: 'API Read Access',
    description: 'Query Shuffle REST API endpoints and data stores on your behalf.',
    badge: 'API Read',
  },
  'api:write': {
    id: 'api:write',
    category: 'general',
    title: 'API Write Access',
    description: 'Perform mutations and submit data through Shuffle REST API endpoints.',
    badge: 'API Write',
  },

  // App & Integration Scopes
  'apps:read': {
    id: 'apps:read',
    category: 'app',
    title: 'Read App Integrations & Schemas',
    description: 'View connected third-party apps, OpenAPI specifications, and available action definitions.',
    badge: 'Apps Read',
  },
  'app:read': {
    id: 'app:read',
    category: 'app',
    title: 'Read App Integrations & Schemas',
    description: 'View connected third-party apps, OpenAPI specifications, and available action definitions.',
    badge: 'Apps Read',
  },
  'apps:execute': {
    id: 'apps:execute',
    category: 'app',
    title: 'Run Third-Party App Actions',
    description: 'Trigger authenticated actions across connected services (e.g., Jira, Slack, GitHub, Splunk, CrowdStrike).',
    badge: 'Apps Execute',
  },
  'apps:run': {
    id: 'apps:run',
    category: 'app',
    title: 'Run Third-Party App Actions',
    description: 'Trigger authenticated actions across connected services (e.g., Jira, Slack, GitHub, Splunk, CrowdStrike).',
    badge: 'Apps Run',
  },
  'app:run': {
    id: 'app:run',
    category: 'app',
    title: 'Run Third-Party App Actions',
    description: 'Trigger authenticated actions across connected services (e.g., Jira, Slack, GitHub, Splunk, CrowdStrike).',
    badge: 'Apps Run',
  },
  'app:execute': {
    id: 'app:execute',
    category: 'app',
    title: 'Run Third-Party App Actions',
    description: 'Trigger authenticated actions across connected services (e.g., Jira, Slack, GitHub, Splunk, CrowdStrike).',
    badge: 'Apps Execute',
  },
  'actions:run': {
    id: 'actions:run',
    category: 'app',
    title: 'Execute Integration Actions',
    description: 'Perform real-time actions and data queries against authorized third-party APIs.',
    badge: 'Actions Run',
  },

  // Workflow Scopes
  'workflows:read': {
    id: 'workflows:read',
    category: 'workflow',
    title: 'View Workflows & Automations',
    description: 'Access workflow structures, active triggers, and historical execution results.',
    badge: 'Workflows Read',
  },
  'workflow:read': {
    id: 'workflow:read',
    category: 'workflow',
    title: 'View Workflows & Automations',
    description: 'Access workflow structures, active triggers, and historical execution results.',
    badge: 'Workflows Read',
  },
  'workflows:run': {
    id: 'workflows:run',
    category: 'workflow',
    title: 'Trigger Autonomous Workflows',
    description: 'Execute and pass runtime arguments to Shuffle security workflows and playbooks.',
    badge: 'Workflows Run',
  },
  'workflow:run': {
    id: 'workflow:run',
    category: 'workflow',
    title: 'Run Workflows',
    description: 'Trigger autonomous execution and pass runtime arguments to workflows.',
    badge: 'Workflows Run',
  },
  'workflow:edit': {
    id: 'workflow:edit',
    category: 'workflow',
    title: 'Edit Workflows & Automations',
    description: 'Create, update, and modify workflows, triggers, and configurations in your organization.',
    badge: 'Workflows Edit',
  },
  'workflows:edit': {
    id: 'workflows:edit',
    category: 'workflow',
    title: 'Edit Workflows & Automations',
    description: 'Create, update, and modify workflows, triggers, and configurations in your organization.',
    badge: 'Workflows Edit',
  },
  'workflows:execute': {
    id: 'workflows:execute',
    category: 'workflow',
    title: 'Trigger Autonomous Workflows',
    description: 'Execute and pass runtime arguments to Shuffle security workflows and playbooks.',
    badge: 'Workflows Run',
  },

  // Security Incident Scopes
  'incidents:read': {
    id: 'incidents:read',
    category: 'incident',
    title: 'Read Alerts & Incidents',
    description: 'Query security alerts, cases, observables, and threat intelligence context.',
    badge: 'Incidents Read',
  },
  'alerts:read': {
    id: 'alerts:read',
    category: 'incident',
    title: 'Read Security Alerts',
    description: 'View incoming security notifications, alert queues, and threat triage status.',
    badge: 'Alerts Read',
  },
  'incidents:write': {
    id: 'incidents:write',
    category: 'incident',
    title: 'Manage Incidents & Cases',
    description: 'Update case statuses, add analyst investigation notes, and attach IOC observables.',
    badge: 'Incidents Write',
  },

  // Model Context Protocol (MCP) Scopes
  'mcps:read': {
    id: 'mcps:read',
    category: 'mcp',
    title: 'Inspect MCP Tools & Prompts',
    description: 'Discover and inspect available Model Context Protocol (MCP) servers, tool definitions, and prompts.',
    badge: 'MCP Read',
  },
  'mcp:read': {
    id: 'mcp:read',
    category: 'mcp',
    title: 'Inspect MCP Tools & Prompts',
    description: 'Discover and inspect available Model Context Protocol (MCP) servers, tool definitions, and prompts.',
    badge: 'MCP Read',
  },
  'mcps:execute': {
    id: 'mcps:execute',
    category: 'mcp',
    title: 'Execute MCP Tools & Functions',
    description: 'Call and execute MCP tools, autonomous actions, and model context queries on your behalf.',
    badge: 'MCP Execute',
  },
  'mcp:execute': {
    id: 'mcp:execute',
    category: 'mcp',
    title: 'Execute MCP Tools & Functions',
    description: 'Call and execute MCP tools, autonomous actions, and model context queries on your behalf.',
    badge: 'MCP Execute',
  },
  'tools:call': {
    id: 'tools:call',
    category: 'mcp',
    title: 'Invoke Connected Tools',
    description: 'Run tool calls and function executions triggered by connected client applications.',
    badge: 'Tools Call',
  },
  'mcps:manage': {
    id: 'mcps:manage',
    category: 'mcp',
    title: 'Manage MCP Servers',
    description: 'Register, edit, or remove MCP server endpoints and configurations in your tenant.',
    badge: 'MCP Admin',
  },
};

const DEFAULT_SCOPES = ['mcp:execute', 'apps:read'];

// Dynamic scope parser for custom per-server/per-app tokens
const parseDynamicScope = (rawScope: string): OAuthScopeDetail => {
  const normalized = rawScope.trim().toLowerCase();
  if (PREDEFINED_SCOPES[normalized]) {
    return PREDEFINED_SCOPES[normalized];
  }

  if (normalized.startsWith('mcp:')) {
    const parts = normalized.split(':');
    const target = parts[1] ? parts[1].toUpperCase() : 'Custom';
    const action = parts[2] ? ` (${parts[2]})` : '';
    return {
      id: rawScope,
      category: 'mcp',
      title: `Access MCP: ${target}${action}`,
      description: `Use and execute tools provided by the ${target} MCP server connection.`,
      badge: `MCP: ${target}`,
    };
  }

  if (normalized.startsWith('app:')) {
    const parts = normalized.split(':');
    const target = parts[1] ? parts[1].toUpperCase() : 'App';
    const action = parts[2] ? parts[2] : 'execute';
    return {
      id: rawScope,
      category: 'app',
      title: `${action.toUpperCase()} on App: ${target}`,
      description: `Perform ${action} actions and API calls for the connected ${target} integration.`,
      badge: `App: ${target}`,
    };
  }

  if (normalized.startsWith('workflow:') || normalized.startsWith('workflows:')) {
    const parts = normalized.split(':');
    const action = parts[1] || 'access';
    const actionCap = action.charAt(0).toUpperCase() + action.slice(1);
    return {
      id: rawScope,
      category: 'workflow',
      title: `${actionCap} Workflows`,
      description: `Allows the application to ${action} workflows and automations in your tenant.`,
      badge: `Workflow: ${actionCap}`,
    };
  }

  const cleanTitle = rawScope
    .replace(/[:_\-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    id: rawScope,
    category: 'system',
    title: cleanTitle,
    description: `Grants the requesting application permission to "${rawScope}".`,
    badge: rawScope,
  };
};

export interface ClientProfile {
  name: string;
  vendor: string;
  vendorId?: string;
  iconBg: string;
  iconColor: string;
  description: string;
  logoUrl?: string;
  iconLookupName?: string;
  vendorVerified?: boolean;
  verificationStatus?: OAuthVerificationStatus | string;
  verificationReason?: string;
  verifiedDomain?: string;
  claimedVendorId?: string;
  claimedVendorName?: string;
  vendorSpoofWarning?: string;
  rawSource?: OAuthRawSource;
}

export interface OAuthToolPermission {
  name: string;
  title?: string;
  description?: string;
  app_id?: string;
  app_name?: string;
  read_only?: boolean;
  destructive?: boolean;
}

export interface OAuthAppPermission {
  id: string;
  name: string;
  image?: string;
  description?: string;
  tools?: OAuthToolPermission[];
}

interface BackendConsentScope {
  scope: string;
  name?: string;
  description?: string;
  category?: string;
}

interface BackendConsentInfo {
  client_id?: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  issuer?: string;
  scopes?: BackendConsentScope[];
  app_permissions?: OAuthAppPermission[];
  available_orgs?: OrganizationLike[];
  selected_org_id?: string;
  vendor_id?: string;
  vendor_name?: string;
  image_id?: string;
  vendor_verified?: boolean;
  verification_status?: OAuthVerificationStatus | string;
  verification_reason?: string;
  verified_domain?: string;
  claimed_vendor_id?: string;
  claimed_vendor_name?: string;
  vendor_spoof_warning?: string;
  raw_source?: OAuthRawSource;
}

export interface ClientProfileOptions {
  rawClientName?: string;
  vendorId?: string;
  vendorName?: string;
  imageId?: string;
  vendorVerified?: boolean;
  verificationStatus?: OAuthVerificationStatus | string;
  verificationReason?: string;
  verifiedDomain?: string;
  claimedVendorId?: string;
  claimedVendorName?: string;
  vendorSpoofWarning?: string;
  rawSource?: OAuthRawSource;
}

export const getClientProfile = (
  clientId?: string,
  clientName?: string,
  redirectUri?: string,
  logoUri?: string,
  clientUri?: string,
  options?: ClientProfileOptions,
): ClientProfile => {
  const rawSource = options?.rawSource;
  const effectiveRedirectUri = redirectUri || rawSource?.raw_redirect_uri || '';
  const effectiveRawName = options?.rawClientName || rawSource?.raw_client_name || clientName || '';
  const effectiveClientUri = clientUri || rawSource?.raw_client_uri || '';
  const effectiveLogoUri = logoUri || rawSource?.raw_logo_uri || '';

  const evaluated = evaluateOAuthVendorIdentity({
    clientId,
    rawClientName: effectiveRawName,
    redirectUri: effectiveRedirectUri,
    clientUri: effectiveClientUri,
    logoUri: effectiveLogoUri,
    softwareId: rawSource?.software_id,
    userAgent: rawSource?.mcp_user_agent || rawSource?.token_user_agent || rawSource?.user_agent,
    mcpClientName: rawSource?.mcp_client_name,
  });

  const explicitSpec =
    findOAuthVendorSpec(options?.vendorId) ||
    findOAuthVendorSpec(evaluated.vendorId) ||
    findOAuthVendorSpec(options?.imageId) ||
    findOAuthVendorSpec(clientName);

  const resolvedName =
    clientName &&
    clientName.trim() &&
    clientName.toLowerCase() !== 'shuffle agent' &&
    clientName.toLowerCase() !== 'mcp client' &&
    clientName.toLowerCase() !== 'application'
      ? clientName.trim()
      : evaluated.name;

  const resolvedVendor =
    options?.vendorName ||
    explicitSpec?.vendorName ||
    evaluated.vendor;

  const resolvedImageId =
    options?.imageId ||
    explicitSpec?.imageId ||
    evaluated.imageId ||
    resolvedName;

  const resolvedLogoUrl =
    logoUri ||
    explicitSpec?.logoUrl ||
    evaluated.logoUrl ||
    undefined;

  const resolvedStatus = (options?.verificationStatus || evaluated.verificationStatus || 'unverified') as OAuthVerificationStatus;
  const resolvedVerified =
    options?.vendorVerified !== undefined ? options.vendorVerified : evaluated.vendorVerified;
  const resolvedSpoofWarning = options?.vendorSpoofWarning || evaluated.vendorSpoofWarning;

  return {
    name: resolvedName,
    vendor: resolvedVendor,
    vendorId: options?.vendorId || explicitSpec?.id || evaluated.vendorId,
    iconBg: explicitSpec?.iconBg || evaluated.iconBg,
    iconColor: explicitSpec?.iconColor || evaluated.iconColor,
    description: explicitSpec?.description || evaluated.description,
    logoUrl: resolvedLogoUrl,
    iconLookupName: resolvedImageId,
    vendorVerified: resolvedVerified,
    verificationStatus: resolvedStatus,
    verificationReason: options?.verificationReason || evaluated.verificationReason,
    verifiedDomain: options?.verifiedDomain || evaluated.verifiedDomain,
    claimedVendorId: options?.claimedVendorId || evaluated.claimedVendorId,
    claimedVendorName: options?.claimedVendorName || evaluated.claimedVendorName,
    vendorSpoofWarning: resolvedSpoofWarning,
    rawSource,
  };
};

/** Region code from a region URL (mirrors the sidebar tenant selector). Clean text, no emojis. */
const getRegionFlag = (regionUrl?: string): { flag: string; code: string } => {
  if (!regionUrl) return { flag: 'UK', code: 'UK' };
  const url = regionUrl.toLowerCase();
  if (url.includes('california') || url.includes('us.') || url.includes('us-')) return { flag: 'US', code: 'US' };
  if (url.includes('frankfurt') || url.includes('de.') || url.includes('de-')) return { flag: 'EU', code: 'EU' };
  if (url.includes('eu-2') || url.includes('eu2')) return { flag: 'EU-2', code: 'EU-2' };
  if (url.includes('eu.') || url.includes('eu-')) return { flag: 'EU', code: 'EU' };
  if (url.includes('ca.') || url.includes('canada')) return { flag: 'CA', code: 'CA' };
  if (url.includes('au.') || url.includes('aus') || url.includes('australia')) return { flag: 'AUS', code: 'AUS' };
  if (url.includes('uk.') || url.includes('uk-') || url.includes('london')) return { flag: 'UK', code: 'UK' };
  return { flag: 'UK', code: 'UK' };
};

/** Sort organizations into a parent → child hierarchy (mirrors the sidebar). */
const sortOrgsWithHierarchy = (orgs: OrganizationLike[]): Array<{ org: OrganizationLike; level: number }> => {
  const orgMap = new Map(orgs.map((org) => [org.id, org]));
  const result: Array<{ org: OrganizationLike; level: number }> = [];
  const processed = new Set<string>();

  const addOrgWithChildren = (org: OrganizationLike, level: number) => {
    if (processed.has(org.id)) return;
    processed.add(org.id);
    result.push({ org, level });
    const children = orgs.filter((o) => o.creator_org === org.id);
    children.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    children.forEach((child) => addOrgWithChildren(child, level + 1));
  };

  const rootOrgs = orgs.filter((org) => !org.creator_org || !orgMap.has(org.creator_org));
  rootOrgs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  rootOrgs.forEach((org) => addOrgWithChildren(org, 0));

  orgs.forEach((org) => {
    if (!processed.has(org.id)) result.push({ org, level: 1 });
  });

  return result;
};

export const OAuthAuthorizeView: React.FC<OAuthAuthorizeViewProps> = ({
  userInfo: propUserInfo,
  activeOrg: propActiveOrg,
  isSupport: propIsSupport,
  onAuthSuccess,
  onAuthDeny,
  onOrgChange,
  className,
  style,
}) => {
  // Auth state (optional: the view can also be used standalone with props)
  const auth = useOptionalAuth();
  // While the initial /api/v1/getinfo verification is still running we must not
  // decide that the user is signed out - cookies/headers may still authenticate.
  const isAuthChecking = propUserInfo === undefined && !!auth && auth.isLoading;

  // Resolve local user info from localStorage if not provided via props
  const resolvedUserInfo = useMemo<UserInfoLike | null>(() => {
    if (propUserInfo !== undefined) return propUserInfo;
    if (auth?.userInfo) return auth.userInfo as UserInfoLike;
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem('shuffle_user_info');
      if (stored) return JSON.parse(stored);
    } catch {}
    return null;
  }, [propUserInfo, auth?.userInfo]);

  // Read query parameters
  const queryParams = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const clientId = queryParams.get('client_id') || 'external-app';
  const clientNameParam =
    queryParams.get('client_name') ||
    queryParams.get('app_name') ||
    queryParams.get('name') ||
    '';
  const rawClientNameParam = queryParams.get('raw_client_name') || '';
  const vendorIdParam = queryParams.get('vendor_id') || '';
  const clientUriParam = queryParams.get('client_uri') || '';
  const logoUriParam = queryParams.get('logo_uri') || '';
  const issuerParam =
    queryParams.get('issuer') ||
    queryParams.get('backend_url') ||
    queryParams.get('iss') ||
    '';
  const redirectUri = queryParams.get('redirect_uri') || '';
  const scopeParam = queryParams.get('scope') || queryParams.get('scopes') || '';
  const state = queryParams.get('state') || '';
  const responseType = queryParams.get('response_type') || 'code';
  const codeChallenge = queryParams.get('code_challenge') || '';
  const codeChallengeMethod = queryParams.get('code_challenge_method') || 'S256';
  const prompt = queryParams.get('prompt') || '';
  const requestedOrgId = queryParams.get('org_id') || queryParams.get('org') || '';

  const [backendConsentInfo, setBackendConsentInfo] = useState<BackendConsentInfo | null>(null);

  // Resolve target backend authorize endpoint(s): if an explicit issuer/tunnel URL was passed,
  // normalize Shuffle Cloud shuffler.io hosts to *.shuffle.security so session cookies apply,
  // try it first, and fall back to the default regional backend getApiUrl('/api/v1/oauth2/authorize').
  const authorizeEndpoints = useMemo<string[]>(() => {
    const defaultEndpoint = getApiUrl('/api/v1/oauth2/authorize');
    if (issuerParam) {
      try {
        const parsedIssuer = new URL(issuerParam);
        if (parsedIssuer.protocol === 'https:' || parsedIssuer.protocol === 'http:') {
          const rawIssuerEndpoint = `${parsedIssuer.origin}/api/v1/oauth2/authorize`;
          const mappedIssuerEndpoint = ensureShuffleSecurityApiUrl(rawIssuerEndpoint);
          const candidates = [mappedIssuerEndpoint];
          if (rawIssuerEndpoint !== mappedIssuerEndpoint) {
            candidates.push(rawIssuerEndpoint);
          }
          if (!candidates.includes(defaultEndpoint)) {
            candidates.push(defaultEndpoint);
          }
          return candidates;
        }
      } catch {
        // Ignore invalid issuer URL
      }
    }
    return [defaultEndpoint];
  }, [issuerParam]);

  // Fetch registered OAuth client metadata and consent details from the backend
  useEffect(() => {
    if (!clientId || clientId === 'external-app') return;
    let cancelled = false;

    const fetchConsentMetadata = async () => {
      const search = new URLSearchParams();
      search.set('client_id', clientId);
      if (redirectUri) search.set('redirect_uri', redirectUri);
      if (responseType) search.set('response_type', responseType);
      if (scopeParam) search.set('scope', scopeParam);
      if (state) search.set('state', state);
      if (codeChallenge) search.set('code_challenge', codeChallenge);
      if (codeChallengeMethod) search.set('code_challenge_method', codeChallengeMethod);
      if (clientNameParam) search.set('client_name', clientNameParam);
      if (rawClientNameParam) search.set('raw_client_name', rawClientNameParam);
      if (clientUriParam) search.set('client_uri', clientUriParam);
      if (logoUriParam) search.set('logo_uri', logoUriParam);

      for (const endpoint of authorizeEndpoints) {
        try {
          const res = await fetch(`${endpoint}?${search.toString()}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
              Accept: 'application/json',
              ...getAuthHeader(requestedOrgId || undefined, endpoint),
            },
          });
          // Both 200 OK (authenticated) and 401 Unauthorized return public client metadata (client_name, logo_uri, scopes)
          if (res.ok || res.status === 401) {
            const data = (await res.json()) as BackendConsentInfo;
            if (!cancelled && data && (data.client_name || data.logo_uri || data.scopes || data.available_orgs)) {
              setBackendConsentInfo(data);
              return;
            }
          }
        } catch {
          // Try next endpoint fallback
        }
      }
    };

    fetchConsentMetadata();
    return () => {
      cancelled = true;
    };
  }, [
    authorizeEndpoints,
    clientId,
    clientNameParam,
    clientUriParam,
    codeChallenge,
    codeChallengeMethod,
    logoUriParam,
    redirectUri,
    requestedOrgId,
    responseType,
    scopeParam,
    state,
  ]);

  const effectiveClientName = backendConsentInfo?.client_name || clientNameParam || '';
  const effectiveLogoUri = backendConsentInfo?.logo_uri || logoUriParam || '';
  const effectiveClientUri = backendConsentInfo?.client_uri || clientUriParam || '';
  const effectiveIssuer = useMemo(() => {
    const raw = (issuerParam || backendConsentInfo?.issuer || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.origin;
      }
    } catch {}
    return raw.replace(/\/+$/, '');
  }, [issuerParam, backendConsentInfo?.issuer]);

  const clientProfile = useMemo(
    () =>
      getClientProfile(clientId, effectiveClientName, redirectUri, effectiveLogoUri, effectiveClientUri, {
        rawClientName:
          backendConsentInfo?.raw_source?.raw_client_name ||
          rawClientNameParam ||
          clientNameParam ||
          undefined,
        vendorId: backendConsentInfo?.vendor_id || vendorIdParam || undefined,
        vendorName: backendConsentInfo?.vendor_name || undefined,
        imageId: backendConsentInfo?.image_id || undefined,
        vendorVerified: backendConsentInfo?.vendor_verified,
        verificationStatus: backendConsentInfo?.verification_status,
        verificationReason: backendConsentInfo?.verification_reason,
        verifiedDomain: backendConsentInfo?.verified_domain,
        claimedVendorId: backendConsentInfo?.claimed_vendor_id,
        claimedVendorName: backendConsentInfo?.claimed_vendor_name,
        vendorSpoofWarning: backendConsentInfo?.vendor_spoof_warning,
        rawSource: backendConsentInfo?.raw_source,
      }),
    [
      backendConsentInfo,
      clientId,
      clientNameParam,
      effectiveClientName,
      effectiveClientUri,
      effectiveLogoUri,
      rawClientNameParam,
      redirectUri,
      vendorIdParam,
    ],
  );

  const verificationMeta = useMemo(
    () => getVerificationStatusMeta(clientProfile.verificationStatus, clientProfile.verifiedDomain),
    [clientProfile.verificationStatus, clientProfile.verifiedDomain],
  );
  const [showSourceDetails, setShowSourceDetails] = useState<boolean>(false);

  // Parse scopes dynamically, enriching with backend scope metadata when available
  const scopes = useMemo<OAuthScopeDetail[]>(() => {
    const backendScopes = backendConsentInfo?.scopes || [];
    const rawTokens = scopeParam
      ? scopeParam.split(/[\s,+]+/).map((s) => s.trim()).filter(Boolean)
      : backendScopes.length > 0
        ? backendScopes.map((s) => s.scope).filter(Boolean)
        : DEFAULT_SCOPES;
    const uniqueTokens = Array.from(new Set(rawTokens));
    return uniqueTokens.map((token) => {
      const parsed = parseDynamicScope(token);
      const fromBackend = backendScopes.find((bs) => bs.scope === token);
      if (fromBackend && (parsed.category === 'system' || parsed.category === 'app')) {
        return {
          ...parsed,
          title: fromBackend.name || parsed.title,
          description: fromBackend.description || parsed.description,
        };
      }
      return parsed;
    });
  }, [scopeParam, backendConsentInfo?.scopes]);

  const appPermissions = useMemo<OAuthAppPermission[]>(
    () => backendConsentInfo?.app_permissions || [],
    [backendConsentInfo?.app_permissions],
  );

  const allAvailableToolNames = useMemo<string[]>(() => {
    const names: string[] = [];
    for (const app of appPermissions) {
      for (const tool of app.tools || []) {
        if (tool.name && !names.includes(tool.name)) {
          names.push(tool.name);
        }
      }
    }
    return names;
  }, [appPermissions]);

  const [selectedToolNames, setSelectedToolNames] = useState<Set<string>>(() => new Set());
  const [expandedAppIds, setExpandedAppIds] = useState<Set<string>>(() => new Set());
  const [appFilterQuery, setAppFilterQuery] = useState<string>('');

  useEffect(() => {
    setSelectedToolNames(new Set(allAvailableToolNames));
    setExpandedAppIds(new Set());
  }, [allAvailableToolNames, appPermissions]);

  const filteredAppPermissions = useMemo<OAuthAppPermission[]>(() => {
    const q = appFilterQuery.trim().toLowerCase();
    if (!q) return appPermissions;
    return appPermissions.filter((app) => {
      if ((app.name || '').toLowerCase().includes(q) || (app.id || '').toLowerCase().includes(q)) {
        return true;
      }
      return (app.tools || []).some(
        (t) =>
          (t.name || '').toLowerCase().includes(q) ||
          (t.title || '').toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q),
      );
    });
  }, [appPermissions, appFilterQuery]);

  const handleToggleTool = useCallback((toolName: string) => {
    setSelectedToolNames((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      return next;
    });
  }, []);

  const handleToggleAppTools = useCallback((tools: OAuthToolPermission[]) => {
    setSelectedToolNames((prev) => {
      const next = new Set(prev);
      const toolNames = tools.map((t) => t.name).filter(Boolean);
      const allSelected = toolNames.every((n) => next.has(n));
      if (allSelected) {
        toolNames.forEach((n) => next.delete(n));
      } else {
        toolNames.forEach((n) => next.add(n));
      }
      return next;
    });
  }, []);

  const handleToggleExpandApp = useCallback((appId: string) => {
    setExpandedAppIds((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) {
        next.delete(appId);
      } else {
        next.add(appId);
      }
      return next;
    });
  }, []);

  // Tenant resolution (merge local orgs with available_orgs from backend consent metadata)
  const activeOrg = propActiveOrg || resolvedUserInfo?.active_org;
  const userOrgs = useMemo(() => {
    const list = [...(resolvedUserInfo?.orgs || [])];
    if (backendConsentInfo?.available_orgs) {
      for (const bOrg of backendConsentInfo.available_orgs) {
        if (bOrg?.id && !list.some((o) => o.id === bOrg.id)) {
          list.push(bOrg);
        }
      }
    }
    if (activeOrg && !list.some((o) => o.id === activeOrg.id)) {
      list.unshift(activeOrg);
    }
    return list.length > 0 ? list : (activeOrg ? [activeOrg] : []);
  }, [resolvedUserInfo?.orgs, backendConsentInfo?.available_orgs, activeOrg]);

  const sortedUserOrgs = useMemo(() => sortOrgsWithHierarchy(userOrgs), [userOrgs]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>(
    requestedOrgId || backendConsentInfo?.selected_org_id || activeOrg?.id || userOrgs[0]?.id || '',
  );

  const currentSelectedOrg = useMemo(() => {
    return (
      userOrgs.find((o) => o.id === selectedOrgId) ||
      (activeOrg?.id === selectedOrgId ? activeOrg : null) ||
      activeOrg ||
      userOrgs[0] ||
      null
    );
  }, [userOrgs, selectedOrgId, activeOrg]);

  useEffect(() => {
    if (requestedOrgId && userOrgs.some((o) => o.id === requestedOrgId)) {
      setSelectedOrgId(requestedOrgId);
    } else if (backendConsentInfo?.selected_org_id && userOrgs.some((o) => o.id === backendConsentInfo.selected_org_id)) {
      setSelectedOrgId(backendConsentInfo.selected_org_id);
    } else if (activeOrg?.id) {
      setSelectedOrgId(activeOrg.id);
    } else if (userOrgs[0]?.id) {
      setSelectedOrgId(userOrgs[0].id);
    }
  }, [activeOrg?.id, backendConsentInfo?.selected_org_id, requestedOrgId, userOrgs]);

  // Support Mode detection
  const isSupportUser = Boolean(
    propIsSupport ||
    resolvedUserInfo?.support === true ||
    resolvedUserInfo?.role === 'admin' ||
    queryParams.get('debug') === 'true'
  );

  // Permissions selection state: All requested permissions are selected by default.
  // The user can hook off (uncheck) any permissions they do not wish to grant.
  const [selectedScopeIds, setSelectedScopeIds] = useState<Set<string>>(
    () => new Set(scopes.map((s) => s.id)),
  );

  // Re-sync default selection if scopes change
  useEffect(() => {
    setSelectedScopeIds(new Set(scopes.map((s) => s.id)));
  }, [scopes]);

  const handleToggleScope = useCallback((scopeId: string) => {
    setSelectedScopeIds((prev) => {
      const next = new Set(prev);
      if (next.has(scopeId)) {
        next.delete(scopeId);
      } else {
        next.add(scopeId);
      }
      return next;
    });
  }, []);

  const handleToggleAllScopes = useCallback(() => {
    setSelectedScopeIds((prev) => {
      if (prev.size === scopes.length) {
        return new Set();
      }
      return new Set(scopes.map((s) => s.id));
    });
  }, [scopes]);

  // States
  const [showDebug, setShowDebug] = useState<boolean>(queryParams.get('debug') === 'true');
  const [authorizingStep, setAuthorizingStep] = useState<'idle' | 'authorizing' | 'redirecting'>('idle');
  const authorizing = authorizingStep !== 'idle';
  const [denying, setDenying] = useState(false);
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedDebug, setCopiedDebug] = useState(false);
  const [copiedSimulatedUrl, setCopiedSimulatedUrl] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Group scopes (hide duplicate 'app:' scope rows when appPermissions already renders Chosen Apps & MCP Tools)
  const visibleScopes = useMemo(() => {
    if (appPermissions.length === 0) return scopes;
    return scopes.filter((scope) => scope.category !== 'app');
  }, [scopes, appPermissions.length]);

  const groupedScopes = useMemo(() => {
    const groups: Record<string, { label: string; icon: React.ReactNode; items: OAuthScopeDetail[] }> = {
      general: { label: 'Account & Identity', icon: <UserCheck size={16} />, items: [] },
      app: { label: 'Applications & Integrations', icon: <Layers size={16} />, items: [] },
      workflow: { label: 'Workflows & Automation', icon: <Cpu size={16} />, items: [] },
      incident: { label: 'Security & Incidents', icon: <ShieldCheck size={16} />, items: [] },
      mcp: { label: 'Model Context Protocol (MCP)', icon: <Bot size={16} />, items: [] },
      system: { label: 'General Permissions', icon: <Lock size={16} />, items: [] },
    };

    visibleScopes.forEach((scope) => {
      const cat = groups[scope.category] ? scope.category : 'system';
      groups[cat].items.push(scope);
    });

    return Object.values(groups).filter((g) => g.items.length > 0);
  }, [visibleScopes]);

  // Extract redirect host
  const redirectHost = useMemo(() => {
    if (!redirectUri) return null;
    try {
      const parsed = new URL(redirectUri);
      return parsed.host || parsed.hostname;
    } catch {
      return redirectUri;
    }
  }, [redirectUri]);

  // In-place Tenant Switch Handler with URL sync
  const handleOrgSwitch = useCallback(
    async (newOrgId: string) => {
      // Selecting a tenant here only scopes THIS authorization: the
      // choice is sent as the `Org-Id` header (and org_id body field) on the
      // authorize call. It intentionally does not switch the active tenant,
      // which would reload the page and drop the OAuth request.
      setSelectedOrgId(newOrgId);

      // Update URL query parameter org_id while preserving all OAuth params
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('org_id', newOrgId);
        window.history.replaceState({}, '', url.toString());
      }
    },
    [],
  );

  // Save return target for unauthenticated users
  useEffect(() => {
    if (!resolvedUserInfo && typeof window !== 'undefined') {
      try {
        const currentPathAndQuery = window.location.pathname + window.location.search;
        sessionStorage.setItem('shuffle_redirect_after_login', currentPathAndQuery);
      } catch {}
    }
  }, [resolvedUserInfo]);

  // Unauthenticated Sign-in redirect
  const handleSignInRedirect = useCallback(() => {
    if (typeof window === 'undefined') return;
    const currentPathAndQuery = window.location.pathname + window.location.search;
    try {
      sessionStorage.setItem('shuffle_redirect_after_login', currentPathAndQuery);
    } catch {}
    window.location.href = `/login?redirect=${encodeURIComponent(currentPathAndQuery)}`;
  }, []);

  // Handle Approve Action
  const handleAuthorize = async () => {
    setErrorMsg(null);

    if (selectedScopeIds.size === 0) {
      setErrorMsg('Please select at least one permission to authorize.');
      return;
    }

    setAuthorizingStep('authorizing');

    try {
      const generatedCode = `shf_auth_${safeRandomUUID().replace(/-/g, '')}`;
      const approvedApps = appPermissions
        .filter((app) => {
          const appTools = app.tools || [];
          if (appTools.length > 0) {
            return appTools.some((t) => selectedToolNames.has(t.name));
          }
          const appScopeToken = scopes.find(
            (s) =>
              s.id.toLowerCase() === `app:${(app.id || '').toLowerCase()}` ||
              s.id.toLowerCase() === `app:${(app.name || '').toLowerCase()}` ||
              s.id.toLowerCase() === `app:${(app.name || '').toLowerCase().replace(/\s+/g, '_')}`,
          );
          return appScopeToken ? selectedScopeIds.has(appScopeToken.id) : true;
        })
        .map((app) => app.id || app.name)
        .filter(Boolean);
      const approvedAppsLower = new Set(approvedApps.map((a) => a.toLowerCase()));
      const approvedScopeString = Array.from(selectedScopeIds)
        .filter((scopeId) => {
          if (appPermissions.length > 0 && scopeId.toLowerCase().startsWith('app:')) {
            const rawApp = scopeId.slice(4).split(':')[0].toLowerCase();
            return (
              approvedAppsLower.has(rawApp) ||
              appPermissions.some(
                (ap) =>
                  (ap.id?.toLowerCase() === rawApp ||
                    ap.name?.toLowerCase() === rawApp ||
                    ap.name?.toLowerCase().replace(/\s+/g, '_') === rawApp) &&
                  approvedApps.includes(ap.id || ap.name),
              )
            );
          }
          return true;
        })
        .join(' ');
      const approvedTools =
        allAvailableToolNames.length > 0 ? Array.from(selectedToolNames) : undefined;

      // Backend authorization sync (try issuer endpoint first if specified, with fallback to regional backend)
      let response: Response | null = null;
      let lastNetworkErr: unknown = null;
      const requestBody = JSON.stringify({
        client_id: clientId,
        client_name: clientProfile.name,
        client_uri: effectiveClientUri || undefined,
        logo_uri: clientProfile.logoUrl || undefined,
        issuer: effectiveIssuer || undefined,
        redirect_uri: redirectUri,
        scope: approvedScopeString,
        allowed_apps: approvedApps.length > 0 ? approvedApps : undefined,
        allowed_tools: approvedTools,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        org_id: selectedOrgId,
        decision: 'approved',
        auth_code: generatedCode,
      });

      for (let i = 0; i < authorizeEndpoints.length; i++) {
        const endpoint = authorizeEndpoints[i];
        try {
          const candidateResp = await fetch(endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeader(selectedOrgId, endpoint),
            },
            body: requestBody,
          });
          response = candidateResp;
          // Fall back to next candidate endpoint if the primary returned 401/404 (e.g. session cookie scoped to regional shuffle.security host)
          if ((candidateResp.status === 401 || candidateResp.status === 404) && i < authorizeEndpoints.length - 1) {
            continue;
          }
          break;
        } catch (networkErr: unknown) {
          lastNetworkErr = networkErr;
        }
      }

      if (!response) {
        const msg = lastNetworkErr instanceof Error ? lastNetworkErr.message : 'Server could not be reached';
        setErrorMsg(`Authorization failed: ${msg}. The backend authorization server could not be reached.`);
        setAuthorizingStep('idle');
        return;
      }

      if (!response.ok) {
        let errMessage = '';
        try {
          const errData = await response.json();
          errMessage =
            errData?.error_description ||
            errData?.message ||
            errData?.error ||
            errData?.reason ||
            '';
        } catch {}

        if (!errMessage) {
          if (response.status === 404) {
            errMessage = 'OAuth authorization backend endpoint is not yet available (HTTP 404). Authorization cannot be completed.';
          } else if (response.status === 401 || response.status === 403) {
            errMessage = 'Authorization denied: Your current session does not have permission to approve this request.';
          } else {
            errMessage = `Authorization failed with status ${response.status} (${response.statusText || 'Server Error'}).`;
          }
        }

        setErrorMsg(errMessage);
        setAuthorizingStep('idle');
        return;
      }

      let backendCode = '';
      let redirectUrlFromBackend = '';
      try {
        const resData = await response.json();
        if (resData?.code || resData?.auth_code) {
          backendCode = resData.code || resData.auth_code;
        }
        if (resData?.redirect_url) {
          redirectUrlFromBackend = resData.redirect_url;
        }
      } catch {}

      if (!backendCode && !redirectUrlFromBackend) {
        setErrorMsg('Authorization failed: The authorization server did not return a valid authorization code.');
        setAuthorizingStep('idle');
        return;
      }

      if (onAuthSuccess) {
        onAuthSuccess(backendCode, redirectUri);
      }

      if (redirectUrlFromBackend) {
        setAuthorizingStep('redirecting');
        let finalRedirectUrl = redirectUrlFromBackend;
        if (effectiveIssuer) {
          try {
            const parsedRedirect = new URL(redirectUrlFromBackend);
            parsedRedirect.searchParams.set('iss', effectiveIssuer);
            finalRedirectUrl = parsedRedirect.toString();
          } catch {}
        }
        window.location.href = finalRedirectUrl;
        return;
      }

      if (redirectUri && backendCode) {
        setAuthorizingStep('redirecting');
        const callbackUrl = new URL(redirectUri);
        callbackUrl.searchParams.set('code', backendCode);
        if (state) {
          callbackUrl.searchParams.set('state', state);
        }
        if (effectiveIssuer) {
          callbackUrl.searchParams.set('iss', effectiveIssuer);
        }
        window.location.href = callbackUrl.toString();
        return;
      }

      setAuthCode(backendCode);
      setAuthorizingStep('idle');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'An error occurred during authorization');
      setAuthorizingStep('idle');
    }
  };

  // Handle Deny / Cancel Action
  const handleDeny = () => {
    setDenying(true);
    if (onAuthDeny) {
      onAuthDeny(redirectUri);
    }

    if (redirectUri) {
      try {
        const callbackUrl = new URL(redirectUri);
        callbackUrl.searchParams.set('error', 'access_denied');
        callbackUrl.searchParams.set(
          'error_description',
          'The user denied the authorization request',
        );
        if (state) {
          callbackUrl.searchParams.set('state', state);
        }
        if (effectiveIssuer) {
          callbackUrl.searchParams.set('iss', effectiveIssuer);
        }
        window.location.href = callbackUrl.toString();
        return;
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/dashboard';
    }
  };

  // Debug payload export
  const debugPayload = useMemo(() => {
    return {
      timestamp: new Date().toISOString(),
      oauth_protocol: 'OAuth 2.0 / 2.1',
      client: {
        id: clientId,
        name: clientProfile.name,
        vendor: clientProfile.vendor,
      },
      redirect_uri: redirectUri,
      parsed_redirect: redirectHost,
      response_type: responseType,
      state: state || '(none)',
      pkce: {
        code_challenge: codeChallenge || '(none - OAuth 2.1 recommended)',
        code_challenge_method: codeChallengeMethod,
        is_pkce_present: Boolean(codeChallenge),
      },
      prompt: prompt || '(default)',
      requested_org_id: requestedOrgId || '(none)',
      active_org_id: selectedOrgId,
      user: {
        username: resolvedUserInfo?.username,
        id: resolvedUserInfo?.id,
        role: resolvedUserInfo?.role,
        is_support: isSupportUser,
      },
      scopes: scopes.map((s) => ({
        scope: s.id,
        category: s.category,
        title: s.title,
      })),
      approved_scopes: Array.from(selectedScopeIds),
      raw_query_string: typeof window !== 'undefined' ? window.location.search : '',
    };
  }, [
    clientId,
    clientProfile,
    redirectUri,
    redirectHost,
    responseType,
    state,
    codeChallenge,
    codeChallengeMethod,
    prompt,
    requestedOrgId,
    selectedOrgId,
    resolvedUserInfo,
    isSupportUser,
    scopes,
    selectedScopeIds,
  ]);

  const simulatedCallbackUrl = useMemo(() => {
    if (!redirectUri) return '';
    try {
      const url = new URL(redirectUri);
      url.searchParams.set('code', 'shf_auth_simulated_debug_code_123');
      if (state) url.searchParams.set('state', state);
      return url.toString();
    } catch {
      return '';
    }
  }, [redirectUri, state]);

  const handleCopySimulatedUrl = useCallback(() => {
    if (!simulatedCallbackUrl) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(simulatedCallbackUrl).catch(() => {});
      }
    } catch {}
    setCopiedSimulatedUrl(true);
    setTimeout(() => setCopiedSimulatedUrl(false), 2000);
  }, [simulatedCallbackUrl]);

  const handleSimulateOAuthFlow = useCallback(() => {
    if (!simulatedCallbackUrl) return;
    window.open(simulatedCallbackUrl, '_blank', 'noopener,noreferrer');
  }, [simulatedCallbackUrl]);

  // Once approval has been submitted, the authorization request owns the
  // screen until it settles. A concurrent getinfo refresh must not replace
  // this state with the unauthenticated view while the backend is working.
  if (authorizing) {
    return (
      <Box
        className={className}
        style={style}
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          bgcolor: 'hsl(var(--background))',
          p: { xs: 2, sm: 3 },
        }}
      >
        <CircularProgress size={28} sx={{ color: 'hsl(var(--primary))' }} />
        <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
          {authorizingStep === 'redirecting' ? 'Redirecting...' : 'Authorizing...'}
        </Typography>
      </Box>
    );
  }

  // 0. Verifying session (getinfo in flight) - never claim signed out yet
  if (isAuthChecking && !resolvedUserInfo) {
    return (
      <Box
        className={className}
        style={style}
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          bgcolor: 'hsl(var(--background))',
          p: { xs: 2, sm: 3 },
        }}
      >
        <CircularProgress size={28} sx={{ color: 'hsl(var(--primary))' }} />
        <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
          Verifying your session...
        </Typography>
      </Box>
    );
  }

  // 1. Unauthenticated State
  if (!resolvedUserInfo) {
    return (
      <Box
        className={className}
        style={style}
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'hsl(var(--background))',
          p: { xs: 2, sm: 3 },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: '100%',
            maxWidth: 480,
            p: 4,
            borderRadius: 4,
            border: '1px solid hsl(var(--border))',
            bgcolor: 'hsl(var(--card))',
            textAlign: 'center',
            boxShadow: '0 20px 40px -15px rgba(0,0,0,0.3)',
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              bgcolor: clientProfile.iconBg,
              border: '2px solid hsl(var(--border))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 2,
              overflow: 'hidden',
            }}
          >
            {clientProfile.vendor === 'Shuffle' ? (
              <ShuffleCompanyLogo size={38} alt={clientProfile.name} style={{ borderRadius: 0 }} />
            ) : clientProfile.logoUrl || clientProfile.iconLookupName ? (
              <AppFallbackIcon
                name={clientProfile.iconLookupName || clientProfile.name}
                imageUrl={clientProfile.logoUrl}
                size={56}
                alt={clientProfile.name}
                style={{ borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <ShuffleCompanyLogo size={38} alt="Shuffle AS" style={{ borderRadius: 0 }} />
            )}
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 700, color: 'hsl(var(--foreground))', mb: 1 }}>
            Sign In Required
          </Typography>

          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', mb: 3 }}>
            {clientProfile.name === 'Application' ? (
              <>An external application is requesting permission to access your Shuffle tenant and resources. Please sign in to review and authorize.</>
            ) : (
              <>
                <strong>{clientProfile.name}</strong> is requesting permission to access your Shuffle tenant and resources. Please sign in to review and authorize.
              </>
            )}
          </Typography>

          <Button
            variant="contained"
            fullWidth
            startIcon={<LogIn size={18} />}
            onClick={handleSignInRedirect}
            sx={{
              py: 1.25,
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              bgcolor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
            }}
          >
            Sign In to Continue
          </Button>
        </Paper>
      </Box>
    );
  }

  // 2. Success / Manual Code Display (if no redirect URI)
  if (authCode) {
    return (
      <Box
        className={className}
        style={style}
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'hsl(var(--background))',
          p: 2,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: '100%',
            maxWidth: 520,
            p: 4,
            borderRadius: 4,
            border: '1px solid hsl(var(--border))',
            bgcolor: 'hsl(var(--card))',
            textAlign: 'center',
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              bgcolor: 'rgba(34, 197, 94, 0.12)',
              color: '#22C55E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 2,
            }}
          >
            <CheckCircle2 size={32} />
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 700, color: 'hsl(var(--foreground))', mb: 1 }}>
            Authorization Granted
          </Typography>

          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', mb: 3 }}>
            <strong>{clientProfile.name}</strong> has been authorized to access your requested Shuffle resources.
          </Typography>

          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: 'hsl(var(--muted))',
              border: '1px solid hsl(var(--border))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 3,
              textAlign: 'left',
            }}
          >
            <Box sx={{ overflow: 'hidden', mr: 1 }}>
              <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block' }}>
                OAuth 2.1 Authorization Code
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  color: 'hsl(var(--foreground))',
                  wordBreak: 'break-all',
                }}
              >
                {authCode}
              </Typography>
            </Box>
            <IconButton
              onClick={() => {
                try {
                  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(authCode).catch(() => {});
                  }
                } catch {}
                setCopiedCode(true);
                setTimeout(() => setCopiedCode(false), 2000);
              }}
              size="small"
              sx={{ color: 'hsl(var(--foreground))' }}
            >
              {copiedCode ? <Check size={18} color="#22C55E" /> : <Copy size={18} />}
            </IconButton>
          </Box>

          <Button
            variant="contained"
            fullWidth
            onClick={() => {
              if (typeof window !== 'undefined') window.location.href = '/dashboard';
            }}
            sx={{
              py: 1.25,
              textTransform: 'none',
              fontWeight: 600,
              bgcolor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
            }}
          >
            Return to Dashboard
          </Button>
        </Paper>
      </Box>
    );
  }

  // 3. Main GitHub-Style Authorization Consent Screen
  return (
    <Box
      className={className}
      style={style}
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'hsl(var(--background))',
        p: { xs: 2, sm: 3 },
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 560,
          borderRadius: 4,
          border: '1px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--card))',
          overflow: 'hidden',
          boxShadow: '0 20px 40px -15px rgba(0,0,0,0.3)',
        }}
      >
        {authorizing && (
          <LinearProgress
            sx={{
              height: 3,
              bgcolor: 'transparent',
              '& .MuiLinearProgress-bar': {
                bgcolor: 'hsl(var(--primary))',
              },
            }}
          />
        )}

        {/* Top Visual Header: Client <-> Shuffle */}
        <Box
          sx={{
            p: 3,
            pb: 2.5,
            borderBottom: '1px solid hsl(var(--border))',
            bgcolor: 'hsl(var(--muted) / 0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            position: 'relative',
          }}
        >
          {/* Support / Debug Toggle Pill */}
          {isSupportUser && (
            <Button
              size="small"
              variant={showDebug ? 'contained' : 'outlined'}
              startIcon={<Bug size={14} />}
              onClick={() => setShowDebug((prev) => !prev)}
              sx={{
                position: 'absolute',
                top: 12,
                right: 12,
                fontSize: '0.75rem',
                textTransform: 'none',
                height: 26,
                px: 1.5,
                borderRadius: 999,
                ...(showDebug
                  ? { bgcolor: '#8B5CF6', color: '#FFFFFF', '&:hover': { bgcolor: '#7C3AED' } }
                  : { borderColor: '#8B5CF6', color: '#8B5CF6', '&:hover': { bgcolor: 'rgba(139, 92, 246, 0.1)' } }),
              }}
            >
              Support Debug
            </Button>
          )}

          {/* Identity Bridge / Avatars */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, mb: 2 }}>
            <Avatar
              sx={{
                width: 52,
                height: 52,
                bgcolor: clientProfile.iconBg,
                color: clientProfile.iconColor,
                fontWeight: 700,
                fontSize: '1.2rem',
                border: '2px solid hsl(var(--border))',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                overflow: 'hidden',
              }}
            >
              {clientProfile.vendor === 'Shuffle' ? (
                <ShuffleCompanyLogo size={32} alt={clientProfile.name} />
              ) : clientProfile.logoUrl || clientProfile.iconLookupName ? (
                <AppFallbackIcon
                  name={clientProfile.iconLookupName || clientProfile.name}
                  imageUrl={clientProfile.logoUrl}
                  size={48}
                  alt={clientProfile.name}
                  style={{ borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                clientProfile.name.charAt(0).toUpperCase()
              )}
            </Avatar>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                color: 'hsl(var(--muted-foreground))',
              }}
            >
              <Box sx={{ width: 16, height: 2, bgcolor: 'hsl(var(--border))' }} />
              <Box
                sx={{
                  p: 0.75,
                  borderRadius: '50%',
                  bgcolor: 'hsl(var(--muted))',
                  color: 'hsl(var(--muted-foreground))',
                  border: '1px solid hsl(var(--border))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Zap size={14} />
              </Box>
              <Box sx={{ width: 16, height: 2, bgcolor: 'hsl(var(--border))' }} />
            </Box>

            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                bgcolor: 'hsl(var(--background))',
                border: '2px solid hsl(var(--border))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                overflow: 'hidden',
              }}
            >
              <ShuffleCompanyLogo size={34} alt="Shuffle AS" style={{ borderRadius: 0 }} />
            </Box>
          </Box>

          <Typography variant="h6" sx={{ fontWeight: 700, color: 'hsl(var(--foreground))', mb: 0.5 }}>
            Authorize {clientProfile.name}
          </Typography>

          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.85rem', mb: 1.25 }}>
            {clientProfile.name === 'Application' ? (
              <>An external application wants to access your Shuffle tools.</>
            ) : (
              <>
                <strong>{clientProfile.name}</strong>
                {clientProfile.vendor && clientProfile.vendor !== 'Third-Party Developer' ? (
                  <> by <em>{clientProfile.vendor}</em></>
                ) : null}{' '}
                wants to access your Shuffle tools.
              </>
            )}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Tooltip title={clientProfile.verificationReason || verificationMeta.label}>
              <Box
                component="span"
                sx={{
                  px: 1,
                  py: 0.25,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  borderRadius: 1,
                  bgcolor: verificationMeta.bgColor,
                  color: verificationMeta.color,
                  border: `1px solid ${verificationMeta.borderColor}`,
                }}
              >
                {verificationMeta.label}
              </Box>
            </Tooltip>
            <Button
              size="small"
              variant="text"
              onClick={() => setShowSourceDetails((prev) => !prev)}
              sx={{
                fontSize: '0.72rem',
                textTransform: 'none',
                py: 0.15,
                px: 0.75,
                minWidth: 'auto',
                color: 'hsl(var(--muted-foreground))',
                fontWeight: 600,
                '&:hover': { color: 'hsl(var(--foreground))', bgcolor: 'hsl(var(--muted) / 0.5)' },
              }}
            >
              {showSourceDetails ? 'Hide Source Details' : 'Verify Source Details'}
            </Button>
          </Box>
        </Box>

        {/* Support Inspector Panel */}
        {isSupportUser && (
          <Collapse in={showDebug}>
            <Box
              sx={{
                p: 2.5,
                bgcolor: 'rgba(139, 92, 246, 0.05)',
                borderBottom: '1px solid rgba(139, 92, 246, 0.2)',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Terminal size={16} color="#8B5CF6" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#8B5CF6' }}>
                    OAuth 2.0 / 2.1 Inspector (Support Mode)
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={copiedDebug ? <Check size={12} color="#22C55E" /> : <Copy size={12} />}
                    onClick={() => {
                      try {
                        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                          navigator.clipboard.writeText(JSON.stringify(debugPayload, null, 2)).catch(() => {});
                        }
                      } catch {}
                      setCopiedDebug(true);
                      setTimeout(() => setCopiedDebug(false), 2000);
                    }}
                    sx={{
                      fontSize: '0.7rem',
                      height: 24,
                      textTransform: 'none',
                      borderColor: 'rgba(139, 92, 246, 0.4)',
                      color: '#8B5CF6',
                    }}
                  >
                    Copy JSON
                  </Button>
                  {simulatedCallbackUrl && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={copiedSimulatedUrl ? <Check size={12} color="#22C55E" /> : <ExternalLink size={12} />}
                      onClick={() => {
                        navigator.clipboard.writeText(simulatedCallbackUrl);
                        setCopiedSimulatedUrl(true);
                        setTimeout(() => setCopiedSimulatedUrl(false), 2000);
                      }}
                      sx={{
                        fontSize: '0.7rem',
                        height: 24,
                        textTransform: 'none',
                        borderColor: 'rgba(139, 92, 246, 0.4)',
                        color: '#8B5CF6',
                      }}
                    >
                      Copy Callback URL
                    </Button>
                  )}
                </Box>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mb: 2 }}>
                <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}>
                  <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block' }}>
                    Client ID / Name
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {clientId} ({clientProfile.name})
                  </Typography>
                </Box>

                <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}>
                  <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block' }}>
                    Response Type
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {responseType}
                  </Typography>
                </Box>

                <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}>
                  <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block' }}>
                    Redirect URI
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      wordBreak: 'break-all',
                      color: redirectUri ? 'hsl(var(--foreground))' : '#EF4444',
                    }}
                  >
                    {redirectUri || '(None provided - code will be displayed on screen)'}
                  </Typography>
                </Box>

                <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}>
                  <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block' }}>
                    PKCE Code Challenge
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      wordBreak: 'break-all',
                      color: codeChallenge ? '#22C55E' : 'hsl(var(--muted-foreground))',
                    }}
                  >
                    {codeChallenge ? `${codeChallengeMethod}: ${codeChallenge.substring(0, 16)}...` : 'Not provided (Optional for web)'}
                  </Typography>
                </Box>
              </Box>

              {redirectUri && (
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 1.5,
                    bgcolor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    mb: 1.5,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>
                      Simulated Authorization Redirect URL
                    </Typography>
                    <Tooltip title={copiedSimulatedUrl ? 'Copied URL!' : 'Copy simulated redirect'}>
                      <IconButton size="small" onClick={handleCopySimulatedUrl}>
                        {copiedSimulatedUrl ? <Check size={14} color="#22C55E" /> : <Copy size={14} />}
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                      display: 'block',
                      color: 'hsl(var(--muted-foreground))',
                      fontSize: '0.7rem',
                    }}
                  >
                    {simulatedCallbackUrl}
                  </Typography>
                </Box>
              )}

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleSimulateOAuthFlow}
                  startIcon={<ExternalLink size={14} />}
                  sx={{
                    fontSize: '0.75rem',
                    textTransform: 'none',
                    borderColor: '#8B5CF6',
                    color: '#8B5CF6',
                    '&:hover': { borderColor: '#7C3AED', bgcolor: 'rgba(139, 92, 246, 0.08)' },
                  }}
                >
                  Simulate Grant Flow
                </Button>
              </Box>
            </Box>
          </Collapse>
        )}

        {/* Content Body */}
        <Box sx={{ p: 3 }}>
          {/* User Account & Tenant Selection (Compact single row) */}
          <Box
            sx={{
              p: 1.5,
              px: 2,
              borderRadius: 2.5,
              bgcolor: 'hsl(var(--muted) / 0.4)',
              border: '1px solid hsl(var(--border))',
              mb: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: { xs: 'wrap', sm: 'nowrap' },
              gap: 2,
            }}
          >
            {/* Left: Avatar + Username + Active Account */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flexShrink: 1 }}>
              <Avatar
                sx={{
                  width: 34,
                  height: 34,
                  fontSize: '0.85rem',
                  bgcolor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  flexShrink: 0,
                }}
              >
                {resolvedUserInfo?.username?.charAt(0).toUpperCase() || 'U'}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600, color: 'hsl(var(--foreground))', lineHeight: 1.2 }}>
                  {resolvedUserInfo?.username || 'Signed In User'}
                </Typography>
                <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                  {resolvedUserInfo?.email || 'Active Account'}
                </Typography>
              </Box>
            </Box>

            {/* Right: Tenant Dropdown (Defaulting to current selected tenant) */}
            <Box sx={{ minWidth: { xs: '100%', sm: 220 }, maxWidth: { sm: 300 }, flexShrink: 0, ml: { sm: 'auto' } }}>
              {userOrgs.length > 1 ? (
                <Autocomplete
                  value={currentSelectedOrg}
                  onChange={(_, newValue) => {
                    if (newValue) handleOrgSwitch(newValue.id);
                  }}
                  options={sortedUserOrgs.map((item) => item.org)}
                  getOptionLabel={(option) => option?.name || ''}
                  isOptionEqualToValue={(option, value) => option?.id === value?.id}
                  size="small"
                  disableClearable
                  renderInput={(params) => {
                    const region = getRegionFlag(currentSelectedOrg?.region_url);
                    return (
                      <TextField
                        {...params}
                        placeholder="Select tenant"
                        InputProps={{
                          ...params.InputProps,
                          startAdornment: currentSelectedOrg ? (
                            <Tooltip title={currentSelectedOrg.region_url ? `Region URL: ${currentSelectedOrg.region_url}` : region.code} placement="bottom">
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5, mr: 0.5, flexShrink: 0 }}>
                                <Box
                                  component="span"
                                  sx={{
                                    fontSize: '0.6875rem',
                                    fontWeight: 700,
                                    color: 'hsl(var(--muted-foreground))',
                                    bgcolor: 'hsl(var(--muted))',
                                    px: 0.6,
                                    py: 0.2,
                                    borderRadius: 0.75,
                                    border: '1px solid hsl(var(--border))',
                                  }}
                                >
                                  {region.code || 'UK'}
                                </Box>
                              </Box>
                            </Tooltip>
                          ) : null,
                        }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            backgroundColor: 'hsl(var(--card))',
                            borderRadius: 1.5,
                            fontSize: '0.8125rem',
                            py: 0.25,
                            '& fieldset': { borderColor: 'hsl(var(--border))' },
                            '&:hover fieldset': { borderColor: 'hsl(var(--primary))' },
                            '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
                          },
                          '& .MuiInputBase-input': {
                            color: 'hsl(var(--foreground))',
                            fontWeight: 500,
                            fontSize: '0.8125rem',
                          },
                        }}
                      />
                    );
                  }}
                  componentsProps={{
                    paper: {
                      sx: {
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 1.5,
                        mt: 0.5,
                        minWidth: 260,
                        maxHeight: 280,
                        overflow: 'auto',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                        '& .MuiAutocomplete-listbox': { padding: 0, maxHeight: 'none' },
                      },
                    },
                  }}
                  renderOption={(props, option) => {
                    const level = sortedUserOrgs.find((item) => item.org.id === option.id)?.level || 0;
                    const region = getRegionFlag(option.region_url);
                    const { key, ...restProps } = props;
                    const isCurrentTenant = option.id === selectedOrgId;
                    return (
                      <Box
                        component="li"
                        key={option.id}
                        {...restProps}
                        sx={{
                          fontSize: '0.8125rem',
                          color: isCurrentTenant ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
                          backgroundColor: isCurrentTenant ? 'rgba(255, 102, 0, 0.1)' : 'hsl(var(--card))',
                          pl: `${12 + level * 14}px !important`,
                          py: 0.75,
                          borderLeft: isCurrentTenant ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                          '&:hover': { backgroundColor: isCurrentTenant ? 'rgba(255, 102, 0, 0.15) !important' : 'hsl(var(--muted)) !important' },
                          '&.Mui-focused': { backgroundColor: isCurrentTenant ? 'rgba(255, 102, 0, 0.15) !important' : 'hsl(var(--muted)) !important' },
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Tooltip title={option.region_url ? `Region URL: ${option.region_url}` : ''} placement="left">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Box
                                component="span"
                                sx={{
                                  fontSize: '0.6875rem',
                                  fontWeight: 700,
                                  color: 'hsl(var(--muted-foreground))',
                                  bgcolor: 'hsl(var(--muted))',
                                  px: 0.6,
                                  py: 0.2,
                                  borderRadius: 0.75,
                                  border: '1px solid hsl(var(--border))',
                                }}
                              >
                                {region.code || 'UK'}
                              </Box>
                            </Box>
                          </Tooltip>
                          <Typography sx={{ fontSize: '0.8125rem', fontWeight: isCurrentTenant ? 600 : 400, color: isCurrentTenant ? 'hsl(var(--primary))' : 'inherit' }}>
                            {option.name}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  }}
                />
              ) : (
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.5,
                    py: 0.75,
                    borderRadius: 1.5,
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                  }}
                >
                  <Building2 size={14} style={{ color: 'hsl(var(--primary))' }} />
                  <span>{currentSelectedOrg?.name || 'Current Tenant'}</span>
                </Box>
              )}
            </Box>
          </Box>

          {/* Chosen Apps & MCP Tools */}
          {appPermissions.length > 0 && (
            <Box sx={{ mb: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography
                  variant="caption"
                  sx={{
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 700,
                    color: 'hsl(var(--muted-foreground))',
                  }}
                >
                  Chosen Apps & Tools ({appPermissions.length} {appPermissions.length === 1 ? 'app' : 'apps'}
                  {allAvailableToolNames.length > 0 ? ` · ${selectedToolNames.size}/${allAvailableToolNames.length} tools` : ''})
                </Typography>
                {allAvailableToolNames.length > 0 && (
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => {
                      if (selectedToolNames.size === allAvailableToolNames.length) {
                        setSelectedToolNames(new Set());
                      } else {
                        setSelectedToolNames(new Set(allAvailableToolNames));
                      }
                    }}
                    sx={{
                      fontSize: '0.75rem',
                      textTransform: 'none',
                      p: 0,
                      minWidth: 'auto',
                      color: 'hsl(var(--primary))',
                      fontWeight: 600,
                      '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
                    }}
                  >
                    {selectedToolNames.size === allAvailableToolNames.length ? 'Deselect All' : 'Select All'}
                  </Button>
                )}
              </Box>

              {appPermissions.length > 4 && (
                <TextField
                  size="small"
                  fullWidth
                  value={appFilterQuery}
                  onChange={(e) => setAppFilterQuery(e.target.value)}
                  placeholder={`Filter ${appPermissions.length} apps or tools...`}
                  sx={{
                    mb: 1,
                    '& .MuiOutlinedInput-root': {
                      height: 32,
                      fontSize: '0.78rem',
                      borderRadius: 1.5,
                      bgcolor: 'hsl(var(--background))',
                      '& fieldset': { borderColor: 'hsl(var(--border))' },
                    },
                  }}
                />
              )}

              <Box
                sx={{
                  borderRadius: 2,
                  border: '1px solid hsl(var(--border))',
                  bgcolor: 'hsl(var(--background))',
                  maxHeight: 280,
                  overflowY: 'auto',
                }}
              >
                {filteredAppPermissions.map((app, appIdx) => {
                  const tools = app.tools || [];
                  const appKey = app.id || app.name;
                  const isExpanded = expandedAppIds.has(appKey);
                  const selectedInApp = tools.filter((t) => selectedToolNames.has(t.name)).length;
                  const readCount = tools.filter((t) => t.read_only).length;
                  const writeCount = tools.filter((t) => !t.read_only && !t.destructive).length;
                  const destructiveCount = tools.filter((t) => t.destructive).length;

                  return (
                    <Box
                      key={appKey}
                      sx={{
                        borderBottom:
                          appIdx < filteredAppPermissions.length - 1 ? '1px solid hsl(var(--border))' : 'none',
                      }}
                    >
                      <Box
                        onClick={() => tools.length > 0 && handleToggleExpandApp(appKey)}
                        sx={{
                          px: 1.5,
                          py: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1,
                          cursor: tools.length > 0 ? 'pointer' : 'default',
                          '&:hover': tools.length > 0 ? { bgcolor: 'hsl(var(--muted) / 0.25)' } : undefined,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flexGrow: 1 }}>
                          {tools.length > 0 && (
                            <Checkbox
                              size="small"
                              checked={tools.length > 0 && selectedInApp === tools.length}
                              indeterminate={selectedInApp > 0 && selectedInApp < tools.length}
                              onChange={() => handleToggleAppTools(tools)}
                              onClick={(e) => e.stopPropagation()}
                              sx={{
                                p: 0,
                                color: 'hsl(var(--muted-foreground))',
                                '&.Mui-checked, &.MuiCheckbox-indeterminate': {
                                  color: 'hsl(var(--primary))',
                                },
                              }}
                            />
                          )}
                          <Typography
                            variant="body2"
                            noWrap
                            sx={{ fontWeight: 600, fontSize: '0.82rem', color: 'hsl(var(--foreground))' }}
                          >
                            {app.name}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              px: 0.65,
                              py: 0.1,
                              borderRadius: 0.75,
                              fontSize: '0.66rem',
                              fontWeight: 600,
                              bgcolor: 'hsl(var(--muted))',
                              color: 'hsl(var(--muted-foreground))',
                              border: '1px solid hsl(var(--border))',
                              flexShrink: 0,
                            }}
                          >
                            {tools.length > 0 ? `${selectedInApp}/${tools.length}` : 'App'}
                          </Typography>
                          {readCount > 0 && (
                            <Typography
                              variant="caption"
                              sx={{
                                px: 0.55,
                                py: 0.05,
                                borderRadius: 0.75,
                                fontSize: '0.63rem',
                                fontWeight: 600,
                                bgcolor: 'rgba(34, 197, 94, 0.1)',
                                color: '#22C55E',
                                flexShrink: 0,
                              }}
                            >
                              {readCount}R
                            </Typography>
                          )}
                          {writeCount > 0 && (
                            <Typography
                              variant="caption"
                              sx={{
                                px: 0.55,
                                py: 0.05,
                                borderRadius: 0.75,
                                fontSize: '0.63rem',
                                fontWeight: 600,
                                bgcolor: 'rgba(59, 130, 246, 0.1)',
                                color: '#3B82F6',
                                flexShrink: 0,
                              }}
                            >
                              {writeCount}W
                            </Typography>
                          )}
                          {destructiveCount > 0 && (
                            <Typography
                              variant="caption"
                              sx={{
                                px: 0.55,
                                py: 0.05,
                                borderRadius: 0.75,
                                fontSize: '0.63rem',
                                fontWeight: 600,
                                bgcolor: 'rgba(245, 158, 11, 0.12)',
                                color: '#F59E0B',
                                flexShrink: 0,
                              }}
                            >
                              {destructiveCount}D
                            </Typography>
                          )}
                        </Box>

                        {tools.length > 0 && (
                          <Button
                            size="small"
                            variant="text"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleExpandApp(appKey);
                            }}
                            sx={{
                              fontSize: '0.7rem',
                              textTransform: 'none',
                              minWidth: 'auto',
                              px: 0.75,
                              py: 0.15,
                              color: 'hsl(var(--muted-foreground))',
                              fontWeight: 600,
                              flexShrink: 0,
                              '&:hover': { color: 'hsl(var(--primary))', bgcolor: 'transparent' },
                            }}
                          >
                            {isExpanded ? 'Hide' : 'Tools'}
                          </Button>
                        )}
                      </Box>

                      {tools.length > 0 && (
                        <Collapse in={isExpanded}>
                          <Box
                            sx={{
                              borderTop: '1px solid hsl(var(--border) / 0.6)',
                              maxHeight: 200,
                              overflowY: 'auto',
                              bgcolor: 'hsl(var(--muted) / 0.12)',
                            }}
                          >
                            {tools.map((tool, tIdx) => {
                              const toolChecked = selectedToolNames.has(tool.name);
                              const modeLabel = tool.destructive
                                ? 'Destructive'
                                : tool.read_only
                                  ? 'Read'
                                  : 'Write';
                              const modeColor = tool.destructive
                                ? '#F59E0B'
                                : tool.read_only
                                  ? '#22C55E'
                                  : '#3B82F6';
                              const modeBg = tool.destructive
                                ? 'rgba(245, 158, 11, 0.12)'
                                : tool.read_only
                                  ? 'rgba(34, 197, 94, 0.1)'
                                  : 'rgba(59, 130, 246, 0.1)';

                              return (
                                <Box
                                  key={tool.name}
                                  onClick={() => handleToggleTool(tool.name)}
                                  sx={{
                                    px: 2,
                                    py: 0.75,
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 1,
                                    cursor: 'pointer',
                                    borderBottom:
                                      tIdx < tools.length - 1 ? '1px solid hsl(var(--border) / 0.5)' : 'none',
                                    opacity: toolChecked ? 1 : 0.55,
                                    '&:hover': { bgcolor: 'hsl(var(--muted) / 0.3)' },
                                  }}
                                >
                                  <Checkbox
                                    size="small"
                                    checked={toolChecked}
                                    onChange={() => handleToggleTool(tool.name)}
                                    onClick={(e) => e.stopPropagation()}
                                    sx={{
                                      p: 0,
                                      mt: 0.15,
                                      color: 'hsl(var(--muted-foreground))',
                                      '&.Mui-checked': { color: 'hsl(var(--primary))' },
                                    }}
                                  />
                                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                    <Box
                                      sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 1,
                                      }}
                                    >
                                      <Typography
                                        variant="caption"
                                        noWrap
                                        sx={{
                                          fontWeight: 600,
                                          color: 'hsl(var(--foreground))',
                                          fontSize: '0.75rem',
                                        }}
                                      >
                                        {tool.title || tool.name}
                                      </Typography>
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          px: 0.55,
                                          py: 0.05,
                                          borderRadius: 0.75,
                                          fontSize: '0.62rem',
                                          fontWeight: 600,
                                          bgcolor: modeBg,
                                          color: modeColor,
                                          flexShrink: 0,
                                        }}
                                      >
                                        {modeLabel}
                                      </Typography>
                                    </Box>
                                    {tool.description && (
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          color: 'hsl(var(--muted-foreground))',
                                          display: '-webkit-box',
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: 'vertical',
                                          overflow: 'hidden',
                                          fontSize: '0.68rem',
                                          lineHeight: 1.3,
                                          mt: 0.15,
                                        }}
                                      >
                                        {tool.description}
                                      </Typography>
                                    )}
                                  </Box>
                                </Box>
                              );
                            })}
                          </Box>
                        </Collapse>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}

          {/* Requested Permissions (Interactive Scope Selection) */}
          {groupedScopes.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography
                variant="caption"
                sx={{
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 700,
                  color: 'hsl(var(--muted-foreground))',
                }}
              >
                Requested Permissions ({visibleScopes.filter((s) => selectedScopeIds.has(s.id)).length} of {visibleScopes.length} selected)
              </Typography>
              <Button
                size="small"
                variant="text"
                onClick={handleToggleAllScopes}
                sx={{
                  fontSize: '0.75rem',
                  textTransform: 'none',
                  p: 0,
                  minWidth: 'auto',
                  color: 'hsl(var(--primary))',
                  fontWeight: 600,
                  '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
                }}
              >
                {selectedScopeIds.size === scopes.length ? 'Deselect All' : 'Select All'}
              </Button>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {groupedScopes.map((group) => (
                <Box key={group.label}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: 'hsl(var(--muted-foreground))' }}>
                    {group.icon}
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                      {group.label}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      borderRadius: 2,
                      border: '1px solid hsl(var(--border))',
                      bgcolor: 'hsl(var(--background))',
                      overflow: 'hidden',
                    }}
                  >
                    {group.items.map((item, idx) => {
                      const isSelected = selectedScopeIds.has(item.id);
                      return (
                        <Box
                          key={item.id}
                          onClick={() => handleToggleScope(item.id)}
                          sx={{
                            p: 1.5,
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 1.5,
                            cursor: 'pointer',
                            userSelect: 'none',
                            transition: 'background-color 0.15s ease, opacity 0.15s ease',
                            borderBottom:
                              idx < group.items.length - 1 ? '1px solid hsl(var(--border))' : 'none',
                            bgcolor: isSelected ? 'transparent' : 'hsl(var(--muted) / 0.15)',
                            '&:hover': {
                              bgcolor: 'hsl(var(--muted) / 0.35)',
                            },
                          }}
                        >
                          <Checkbox
                            checked={isSelected}
                            onChange={() => handleToggleScope(item.id)}
                            onClick={(e) => e.stopPropagation()}
                            size="small"
                            sx={{
                              p: 0,
                              mt: 0.25,
                              color: 'hsl(var(--muted-foreground))',
                              '&.Mui-checked': {
                                color: 'hsl(var(--primary))',
                              },
                            }}
                          />
                          <Box sx={{ flexGrow: 1, minWidth: 0, opacity: isSelected ? 1 : 0.6 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.25 }}>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 600,
                                  color: isSelected ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                                  textDecoration: isSelected ? 'none' : 'line-through',
                                }}
                              >
                                {item.title}
                              </Typography>
                              {item.badge && (
                                <Chip
                                  size="small"
                                  label={item.badge}
                                  sx={{
                                    height: 20,
                                    fontSize: '0.65rem',
                                    fontWeight: 600,
                                    bgcolor: isSelected ? 'hsl(var(--muted))' : 'hsl(var(--muted) / 0.5)',
                                    color: 'hsl(var(--muted-foreground))',
                                  }}
                                />
                              )}
                            </Box>
                            <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block', lineHeight: 1.35 }}>
                              {item.description}
                            </Typography>
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Security & Redirect Notice + Spoof Warning + Raw Source Verification */}
          {clientProfile.vendorSpoofWarning && (
            <Box
              sx={{
                p: 1.75,
                borderRadius: 2,
                bgcolor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                mb: 2,
              }}
            >
              <Typography
                variant="caption"
                sx={{ color: '#EF4444', fontWeight: 700, display: 'block', mb: 0.5, fontSize: '0.78rem' }}
              >
                Identity Cross-Reference Warning
              </Typography>
              <Typography variant="caption" sx={{ color: 'hsl(var(--foreground))', display: 'block', lineHeight: 1.45 }}>
                {clientProfile.vendorSpoofWarning}
              </Typography>
            </Box>
          )}

          <Collapse in={showSourceDetails || Boolean(clientProfile.vendorSpoofWarning)}>
            <Box
              sx={{
                p: 1.75,
                borderRadius: 2,
                bgcolor: 'hsl(var(--muted) / 0.25)',
                border: '1px solid hsl(var(--border))',
                mb: 2,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1.25,
              }}
            >
              <Box sx={{ gridColumn: { xs: '1', sm: '1 / -1' } }}>
                <Typography
                  variant="caption"
                  sx={{
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 700,
                    color: 'hsl(var(--muted-foreground))',
                    fontSize: '0.68rem',
                  }}
                >
                  Cross-Referenced Request Source
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block', fontSize: '0.7rem' }}>
                  Claimed Client Name (Raw)
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.76rem', wordBreak: 'break-all' }}>
                  {clientProfile.rawSource?.raw_client_name || rawClientNameParam || clientNameParam || '(not provided)'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block', fontSize: '0.7rem' }}>
                  Verification Status
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, fontSize: '0.76rem', color: verificationMeta.color }}
                >
                  {verificationMeta.label}
                </Typography>
              </Box>

              <Box sx={{ gridColumn: { xs: '1', sm: '1 / -1' } }}>
                <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block', fontSize: '0.7rem' }}>
                  Callback / Redirect URI (Actual Token Destination)
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                  {redirectUri || clientProfile.rawSource?.raw_redirect_uri || '(none)'}
                </Typography>
              </Box>

              {clientProfile.verificationReason && (
                <Box sx={{ gridColumn: { xs: '1', sm: '1 / -1' } }}>
                  <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block', fontSize: '0.7rem' }}>
                    Cross-Reference Check
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'hsl(var(--foreground))' }}>
                    {clientProfile.verificationReason}
                  </Typography>
                </Box>
              )}

              {clientProfile.rawSource?.raw_client_uri && (
                <Box>
                  <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block', fontSize: '0.7rem' }}>
                    Client URI
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.74rem', wordBreak: 'break-all' }}>
                    {clientProfile.rawSource.raw_client_uri}
                  </Typography>
                </Box>
              )}

              {clientProfile.rawSource?.software_id && (
                <Box>
                  <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block', fontSize: '0.7rem' }}>
                    Software ID
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.74rem', wordBreak: 'break-all' }}>
                    {clientProfile.rawSource.software_id}
                    {clientProfile.rawSource.software_version ? ` (${clientProfile.rawSource.software_version})` : ''}
                  </Typography>
                </Box>
              )}

              {clientProfile.rawSource?.remote_addr && (
                <Box>
                  <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block', fontSize: '0.7rem' }}>
                    Registration Source IP
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.74rem', wordBreak: 'break-all' }}>
                    {clientProfile.rawSource.remote_addr}
                  </Typography>
                </Box>
              )}

              {clientProfile.rawSource?.user_agent && (
                <Box sx={{ gridColumn: { xs: '1', sm: '1 / -1' } }}>
                  <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block', fontSize: '0.7rem' }}>
                    Registration User-Agent
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.72rem', wordBreak: 'break-all' }}>
                    {clientProfile.rawSource.user_agent}
                  </Typography>
                </Box>
              )}
            </Box>
          </Collapse>

          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: 'hsl(var(--muted) / 0.3)',
              border: '1px solid hsl(var(--border))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              mb: 3,
            }}
          >
            <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', flexGrow: 1 }}>
              {redirectHost ? (
                <>
                  Authorizing will redirect to <strong>{redirectHost}</strong>.
                </>
              ) : (
                'Standard OAuth 2.0 / 2.1 authorization request.'
              )}
            </Typography>
          </Box>

          {errorMsg && (
            <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2, fontSize: '0.85rem' }}>
              {errorMsg}
            </Alert>
          )}

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              variant="outlined"
              fullWidth
              onClick={handleDeny}
              disabled={authorizing || denying}
              sx={{
                py: 1.25,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                borderRadius: 2,
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--muted-foreground))',
                '&:hover': {
                  borderColor: '#EF4444',
                  color: '#EF4444',
                  bgcolor: 'rgba(239, 68, 68, 0.06)',
                },
              }}
            >
              {denying ? 'Canceling...' : 'Cancel'}
            </Button>

            <Button
              variant="contained"
              fullWidth
              onClick={handleAuthorize}
              disabled={authorizing || denying || selectedScopeIds.size === 0}
              sx={{
                py: 1.25,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                borderRadius: 2,
                bgcolor: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
                '&.Mui-disabled': {
                  bgcolor: selectedScopeIds.size === 0 && !authorizing ? undefined : 'hsl(var(--primary))',
                  color: selectedScopeIds.size === 0 && !authorizing ? undefined : 'hsl(var(--primary-foreground))',
                  opacity: selectedScopeIds.size === 0 && !authorizing ? undefined : 0.85,
                  cursor: authorizing ? 'wait' : 'not-allowed',
                },
              }}
            >
              {authorizing ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.25 }}>
                  <CircularProgress size={18} sx={{ color: 'inherit' }} />
                  <span>
                    {authorizingStep === 'redirecting'
                      ? `Redirecting to ${clientProfile.name}...`
                      : 'Authorizing...'}
                  </span>
                </Box>
              ) : selectedScopeIds.size === 0 ? (
                'Select permissions to authorize'
              ) : (
                'Authorize'
              )}
            </Button>
          </Box>
        </Box>

        {/* Footer */}
        <Box
          sx={{
            py: 1.5,
            px: 3,
            bgcolor: 'hsl(var(--muted) / 0.2)',
            borderTop: '1px solid hsl(var(--border))',
            textAlign: 'center',
          }}
        >
          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem' }}>
            You can revoke access to this application at any time in your{' '}
            <strong>Shuffle Security Settings</strong>.
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default OAuthAuthorizeView;
