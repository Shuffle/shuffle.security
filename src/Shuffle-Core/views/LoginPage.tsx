import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  IconButton,
  InputAdornment,
  Checkbox,
  FormControlLabel,
  Collapse,
  useTheme,
} from '@mui/material';
import {
  Eye,
  EyeOff,
  Server,
  Cloud,
  ArrowRight,
  Lock,
  Mail,
  User,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  ArrowLeft,
  RefreshCw,
  HelpCircle,
  Database,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation, Link } from '@/lib/router-compat';
import {
  getApiUrl,
  setHostBaseUrl,
  getHostBaseUrl,
  isShuffleCloudDomain,
  setRegionUrl,
  API_ENDPOINTS,
} from '../api';
import { setHostBaseUrl as setMcpHostBaseUrl } from '@/Shuffle-MCPs/api';
import { ShuffleCompanyLogo, ShuffleSecurityLogo } from '@/components/common/ShuffleLogo';
import { sanitizeInternalDestination } from '@/lib/safeRedirect';
import { SegmentedControl } from '../components/ui/segmented-control';
const isCapacitorNative = () => {
  if (typeof window === 'undefined') return false;
  const cap = (window as any)?.Capacitor;
  return Boolean(cap?.isNativePlatform && cap.isNativePlatform());
};
import { useAuth } from '@/context/AuthContext';

const SERVER_MODE_STORAGE_KEY = 'shuffle_selected_server_mode';
const CUSTOM_HOST_STORAGE_KEY = 'shuffle_custom_host_url';

export const isCloudHostDomain = (hostname: string): boolean => {
  const host = (hostname || '').toLowerCase();
  return (
    host === 'shuffle.security' ||
    host.endsWith('.shuffle.security') ||
    host === 'shuffler.io' ||
    host.endsWith('.shuffler.io') ||
    host.endsWith('.lovable.app') ||
    host.endsWith('.lovable.dev') ||
    host.includes('lovableproject.com') ||
    host.includes('id-preview--')
  );
};

export const isLocalhostFrontend = (hostname: string): boolean => {
  const host = (hostname || '').toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.localhost')
  );
};

export interface LoginPageProps {
  product?: 'security' | 'automation' | 'core';
  productName?: string;
  productSubtitle?: string;
  logo?: React.ReactNode;
  header?: React.ReactNode;
  mode?: 'login' | 'register' | 'adminsetup';
  defaultDestination?: string;
  adminSetupPath?: string;
  allowSelfHosted?: boolean;
  onLoginSuccess?: (token: string, userInfo?: any) => void | Promise<void>;
  onAdminSetupRedirect?: (path: string) => void;
  theme?: 'light' | 'dark' | 'system';
}

export const LoginPage: React.FC<LoginPageProps> = ({
  product = 'security',
  productName,
  productSubtitle,
  logo,
  header,
  mode = 'login',
  defaultDestination: customDefaultDestination,
  adminSetupPath = '/adminsetup',
  allowSelfHosted = true,
  onLoginSuccess,
  onAdminSetupRedirect,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Host app auth context if available
  let authContext: any = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    authContext = useAuth();
  } catch {
    // AuthProvider not present in outer tree (e.g. standalone usage)
  }
  const { login, isAuthenticated = false, isLoading: authLoading = false } = authContext || {};

  const mfaInputRef = useRef<HTMLInputElement>(null);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const isMobile =
    isCapacitorNative() ||
    (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);

  const hasLoggedInBefore =
    typeof window !== 'undefined' && localStorage.getItem('shuffle_has_logged_in') === 'true';

  const defaultDestination =
    customDefaultDestination ||
    (product === 'security'
      ? isMobile
        ? '/incidents'
        : hasLoggedInBefore
        ? '/dashboard'
        : '/onboarding'
      : '/workflows');

  // Return URL resolution: query params > router state > session storage > default destination
  const from = useMemo(() => {
    const rawSearch =
      (location.search && location.search !== '?' ? location.search : '') ||
      (typeof window !== 'undefined' ? window.location.search : '');

    const cleanSearch = rawSearch.startsWith('??')
      ? rawSearch.slice(1)
      : rawSearch.startsWith('?')
      ? rawSearch
      : rawSearch ? `?${rawSearch}` : '';

    const searchParams = new URLSearchParams(cleanSearch);
    const returnUrl =
      searchParams.get('redirect') ||
      searchParams.get('redirect_to') ||
      searchParams.get('return_to') ||
      searchParams.get('view') ||
      searchParams.get('returnUrl') ||
      searchParams.get('next');

    let stateFrom: string | null = null;
    if (location.state?.from) {
      if (typeof location.state.from === 'string') {
        stateFrom = location.state.from;
      } else if (typeof location.state.from === 'object') {
        const p = location.state.from.pathname || '';
        const s = location.state.from.search || '';
        const h = location.state.from.hash || '';
        stateFrom = `${p}${s}${h}` || null;
      }
    }

    let sessionRedirect: string | null = null;
    if (typeof window !== 'undefined') {
      try {
        sessionRedirect = sessionStorage.getItem('shuffle_redirect_after_login');
      } catch {}
    }

    const candidate = returnUrl || stateFrom || sessionRedirect || defaultDestination;
    return sanitizeInternalDestination(candidate, defaultDestination);
  }, [location.search, location.state, defaultDestination]);

  // Persist redirect target in session storage across pre-login flows
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const rawSearch =
      (location.search && location.search !== '?' ? location.search : '') ||
      window.location.search;
    if (!rawSearch) return;
    const params = new URLSearchParams(rawSearch.startsWith('??') ? rawSearch.slice(1) : rawSearch);
    const explicit =
      params.get('redirect') ||
      params.get('redirect_to') ||
      params.get('return_to') ||
      params.get('view') ||
      params.get('returnUrl') ||
      params.get('next');
    if (!explicit) return;
    const safe = sanitizeInternalDestination(explicit, '');
    if (!safe) return;
    try {
      sessionStorage.setItem('shuffle_redirect_after_login', safe);
    } catch {}
  }, [location.search]);

  // Notice banner extracted from ?message= query param
  const urlMessageNotice = useMemo(() => {
    if (typeof window === 'undefined') return '';
    try {
      const searchParams = new URLSearchParams(window.location.search);
      return searchParams.get('message') || '';
    } catch {
      return '';
    }
  }, []);

  // Detect explicit adminsetup route or query parameter
  const isExplicitAdminSetup = useMemo(() => {
    if (mode === 'adminsetup') return true;
    if (typeof window === 'undefined') return false;
    try {
      const sp = new URLSearchParams(window.location.search);
      return (
        sp.get('mode') === 'adminsetup' ||
        sp.get('setup') === 'admin' ||
        window.location.pathname === '/adminsetup'
      );
    } catch {
      return false;
    }
  }, [mode]);

  const goToRedirectTarget = (target: string) => {
    if (typeof window !== 'undefined' && target.includes('?')) {
      window.location.assign(target);
      return;
    }
    navigate(target, { replace: true });
  };

  // Redirect if already authenticated
  const hasRedirectedRef = useRef(false);
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    if (hasRedirectedRef.current) return;
    const target = (from || defaultDestination).split('?')[0];
    if (target === location.pathname) return;
    hasRedirectedRef.current = true;
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('shuffle_redirect_after_login');
      } catch {}
    }
    goToRedirectTarget(from);
  }, [isAuthenticated, authLoading, navigate, from, location.pathname, defaultDestination]);

  // ---------------------------------------------------------------------------
  // Server Selection & Instance URL Persistence
  // ---------------------------------------------------------------------------
  const [customHostUrl, setCustomHostUrl] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const stored = localStorage.getItem(CUSTOM_HOST_STORAGE_KEY);
      if (stored && stored.trim()) {
        return stored.trim();
      }
    } catch {}

    const hostname = window.location.hostname;
    // On local frontend (e.g. localhost:3002 or localhost:3444), if no URL was saved,
    // automatically input http://localhost:5001
    if (isLocalhostFrontend(hostname)) {
      return 'http://localhost:5001';
    }

    return '';
  });

  const [serverMode, setServerMode] = useState<'cloud' | 'self-hosted'>(() => {
    if (isExplicitAdminSetup) return 'self-hosted';
    if (typeof window === 'undefined' || !allowSelfHosted) return 'cloud';

    const hostname = window.location.hostname;
    const isCloud = isCloudHostDomain(hostname);
    const isLocal = isLocalhostFrontend(hostname);

    let storedMode: string | null = null;
    let storedHostUrl: string | null = null;
    try {
      storedMode = localStorage.getItem(SERVER_MODE_STORAGE_KEY);
      storedHostUrl = localStorage.getItem(CUSTOM_HOST_STORAGE_KEY);
    } catch {}

    // On local frontend (e.g. localhost:3002 or localhost:3444):
    if (isLocal) {
      if (storedMode === 'cloud') return 'cloud';
      // Default to self-hosted for local/onprem frontend
      return 'self-hosted';
    }

    // On Cloud / Lovable domains (shuffle.security, shuffler.io, *.lovable.app, etc.):
    if (isCloud) {
      // If the user previously selected self-hosted AND actually input an instance URL:
      if (storedMode === 'self-hosted' && storedHostUrl && storedHostUrl.trim()) {
        return 'self-hosted';
      }
      // If storedMode is 'self-hosted' but no instance URL was input last time,
      // do NOT default to self-hosted! Default to cloud so the page doesn't break or error.
      if (storedMode === 'self-hosted') {
        try {
          localStorage.setItem(SERVER_MODE_STORAGE_KEY, 'cloud');
        } catch {}
      }
      return 'cloud';
    }

    // Any other onprem host/IP (e.g. shuffle.mycorp.internal)
    if (storedMode === 'cloud') return 'cloud';
    return 'self-hosted';
  });

  // Host ping & setup status (Self-Hosted mode only)
  const [isPingingHost, setIsPingingHost] = useState(false);
  const [hostPingStatus, setHostPingStatus] = useState<'idle' | 'success' | 'needs-admin' | 'error'>('idle');
  const [hostPingMessage, setHostPingMessage] = useState('');
  const [instanceSsoUrl, setInstanceSsoUrl] = useState<string | null>(null);

  // Backend readiness & database waiting state (on-prem / self-hosted)
  const [isWaitingForBackend, setIsWaitingForBackend] = useState(false);
  const [waitingErrorMessage, setWaitingErrorMessage] = useState('');
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  // Auth form states: 'login' | 'register' | 'adminsetup'
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'adminsetup'>(() => {
    if (isExplicitAdminSetup) return 'adminsetup';
    if (serverMode === 'self-hosted' && mode === 'register') return 'login';
    return mode;
  });
  const isRegister = authMode === 'register';
  const isAdminSetup = authMode === 'adminsetup';

  useEffect(() => {
    if (mode === 'adminsetup' || isExplicitAdminSetup) {
      setAuthMode('adminsetup');
      setServerMode('self-hosted');
    } else if (serverMode === 'self-hosted' && mode === 'register') {
      setAuthMode('login');
    } else {
      setAuthMode(mode);
    }
  }, [mode, isExplicitAdminSetup, serverMode]);

  // SSO Login state (Cloud mode: work email only, hides password field)
  const [loginWithSSO, setLoginWithSSO] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const sp = new URLSearchParams(window.location.search);
      return sp.get('sso') === 'true';
    } catch {
      return false;
    }
  });
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoError, setSsoError] = useState('');

  // Password reset mode (Cloud only)
  const [isResetPasswordMode, setIsResetPasswordMode] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [resetEmailSuccessMsg, setResetEmailSuccessMsg] = useState('');

  // Credentials
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [adminSetupSuccess, setAdminSetupSuccess] = useState(false);

  // MFA
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');

  // General feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(urlMessageNotice);

  // Sync host base URL when serverMode or customHostUrl changes
  useEffect(() => {
    if (!hydrated) return;
    if (serverMode === 'self-hosted' && customHostUrl.trim()) {
      let normalized = customHostUrl.trim().replace(/\/+$/, '');
      if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        const isLocal = normalized.startsWith('localhost') || normalized.startsWith('127.0.0.1');
        normalized = (isLocal ? 'http://' : 'https://') + normalized;
      }
      setHostBaseUrl(normalized);
      setMcpHostBaseUrl(normalized);
    } else if (serverMode === 'cloud') {
      setHostBaseUrl(null);
      setMcpHostBaseUrl(null);
    }
  }, [hydrated, serverMode, customHostUrl]);

  // Handle server mode switch with persistence
  const handleServerModeChange = (newMode: 'cloud' | 'self-hosted') => {
    setServerMode(newMode);
    setError('');
    setSsoError('');
    setMfaRequired(false);
    setMfaCode('');
    setLoginWithSSO(false);
    setIsWaitingForBackend(false);
    setWaitingErrorMessage('');
    setHostPingStatus('idle');
    setHostPingMessage('');
    setInstanceSsoUrl(null);

    if (newMode === 'self-hosted') {
      setIsResetPasswordMode(false);
      setResetEmailSent(false);
      setLoginWithSSO(false);
      if (authMode === 'register') {
        setAuthMode('login');
      }

      // Restore previously entered instance URL or auto-fill default for localhost
      let targetUrl = customHostUrl.trim();
      if (!targetUrl) {
        try {
          const saved = localStorage.getItem(CUSTOM_HOST_STORAGE_KEY);
          if (saved && saved.trim()) {
            targetUrl = saved.trim();
            setCustomHostUrl(targetUrl);
          }
        } catch {}
      }
      if (!targetUrl && typeof window !== 'undefined' && isLocalhostFrontend(window.location.hostname)) {
        targetUrl = 'http://localhost:5001';
        setCustomHostUrl(targetUrl);
      }

      try {
        localStorage.setItem(SERVER_MODE_STORAGE_KEY, 'self-hosted');
        if (targetUrl) {
          localStorage.setItem(CUSTOM_HOST_STORAGE_KEY, targetUrl);
        }
      } catch {}

      if (targetUrl) {
        let normalized = targetUrl.replace(/\/+$/, '');
        if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
          const isLocal = normalized.startsWith('localhost') || normalized.startsWith('127.0.0.1');
          normalized = (isLocal ? 'http://' : 'https://') + normalized;
        }
        setHostBaseUrl(normalized);
        setMcpHostBaseUrl(normalized);
      }
    } else {
      if (authMode === 'adminsetup') {
        setAuthMode('login');
      }
      try {
        localStorage.setItem(SERVER_MODE_STORAGE_KEY, 'cloud');
      } catch {}
      setHostBaseUrl(null);
      setMcpHostBaseUrl(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Check Backend Status & Database Readiness (On-Prem / Self-Hosted)
  // ---------------------------------------------------------------------------
  // Check backend server status & discover SSO configuration
  // ---------------------------------------------------------------------------
  const checkBackendStatus = useCallback(
    async (showLoadingIndicator = true, hostOverride?: string) => {
      const rawTarget =
        hostOverride !== undefined
          ? hostOverride
          : (customHostUrl.trim() || getHostBaseUrl() || '');
      const targetHost = rawTarget.trim().replace(/\/+$/, '');

      // If no host is entered and we are not in an explicit adminsetup route, do nothing!
      if (!targetHost && !isExplicitAdminSetup) {
        if (showLoadingIndicator) {
          setIsPingingHost(false);
        }
        return;
      }

      if (showLoadingIndicator) {
        setIsPingingHost(true);
      }

      const probeBase =
        targetHost || (typeof window !== 'undefined' ? window.location.origin : '');

      try {
        // 1. Initial test request must be /api/v1/getinfo. A connection means success.
        const getInfoUrl = `${probeBase}/api/v1/getinfo`;
        const infoController = new AbortController();
        const infoTimeoutId = window.setTimeout(() => infoController.abort(), 6000);

        try {
          const infoRes = await fetch(getInfoUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: infoController.signal,
          });

          // Connection established successfully
          setIsWaitingForBackend(false);
          setWaitingErrorMessage('');
          setHostPingStatus('success');
          setHostPingMessage('Connected to Shuffle server successfully!');

          const infoData = await infoRes.json().catch(() => ({}));
          if (infoData?.sso_url && typeof infoData.sso_url === 'string') {
            setInstanceSsoUrl(infoData.sso_url);
          }

          // Check if backend reports database not ready / initializing
          if (infoData?.success === false) {
            const reason = (infoData.reason || '').toLowerCase();
            if (
              reason.includes('connection refused') ||
              reason.includes('database') ||
              reason.includes('waiting') ||
              reason.includes('error in userdata')
            ) {
              setIsWaitingForBackend(true);
              setWaitingErrorMessage(infoData.reason || 'Backend database initializing');
              setHostPingStatus('error');
              setHostPingMessage(infoData.reason || 'Waiting for database to become available...');
              return;
            }
          }
        } catch (err: any) {
          const isAbort = err instanceof DOMException && err.name === 'AbortError';
          const msg = isAbort
            ? 'Connection timed out while contacting server'
            : err?.message || 'Connection refused or server unreachable';

          // Only lock into waiting/retry state if we are explicitly in adminsetup mode
          if (isExplicitAdminSetup) {
            setIsWaitingForBackend(true);
            setWaitingErrorMessage(msg);
          } else {
            setIsWaitingForBackend(false);
            setWaitingErrorMessage('');
          }
          setHostPingStatus('error');
          setHostPingMessage(msg);
          return;
        } finally {
          window.clearTimeout(infoTimeoutId);
        }

        // 2. AFTER getinfo connection succeeds, run checkusers to discover user state / admin setup
        const checkController = new AbortController();
        const checkTimeoutId = window.setTimeout(() => checkController.abort(), 6000);

        try {
          const checkUrl = `${probeBase}/api/v1/checkusers`;
          const res = await fetch(checkUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: checkController.signal,
          });

          if (res.ok) {
            const data = await res.json().catch(() => ({}));

            if (data?.sso_url && typeof data.sso_url === 'string') {
              setInstanceSsoUrl(data.sso_url);
            }

            // Database not ready / connection refused by backend
            if (data?.success === false) {
              const reason = (data.reason || '').toLowerCase();
              if (
                reason.includes('connection refused') ||
                reason.includes('database') ||
                reason.includes('waiting') ||
                reason.includes('error in userdata')
              ) {
                setIsWaitingForBackend(true);
                setWaitingErrorMessage(data.reason || 'Backend database initializing');
                setHostPingStatus('error');
                setHostPingMessage(data.reason || 'Waiting for database to become available...');
                return;
              }
            }

            if (data?.reason === 'stay') {
              // 0 users exist! Self-hosted administrator setup required
              setAuthMode('adminsetup');
              setHostPingStatus('needs-admin');
              setHostPingMessage('Connected to server. No users configured — administrator setup required.');
            } else if (data?.reason === 'redirect' || data?.success === true) {
              // Administrator/users already configured
              if (authMode === 'adminsetup') {
                setAuthMode('login');
                setNotice('Administrator account is already configured. Please sign in.');
              }
              setHostPingStatus('success');
              setHostPingMessage('Connected to Shuffle server successfully!');
            }
          }
        } catch (checkErr) {
          // Checkusers error does not fail the test since getinfo connection was already successful
          console.warn('checkusers check failed after getinfo connection:', checkErr);
        } finally {
          window.clearTimeout(checkTimeoutId);
        }
      } finally {
        if (showLoadingIndicator) {
          setIsPingingHost(false);
        }
      }
    },
    [customHostUrl, authMode, isExplicitAdminSetup]
  );

  // Automatic Polling (every 3000ms) while waiting for on-prem backend/database
  useEffect(() => {
    if (!isWaitingForBackend || serverMode !== 'self-hosted') return undefined;

    const intervalId = window.setInterval(() => {
      checkBackendStatus(false);
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isWaitingForBackend, serverMode, checkBackendStatus]);

  // Initial check on mount only if there is an explicit admin setup route or an actual configured host
  const initialCheckRanRef = useRef(false);
  useEffect(() => {
    if (initialCheckRanRef.current) return;
    initialCheckRanRef.current = true;
    const hasHost = Boolean((customHostUrl.trim() || getHostBaseUrl() || '').trim());
    if (isExplicitAdminSetup || (serverMode === 'self-hosted' && hasHost)) {
      checkBackendStatus(true);
    }
  }, [serverMode, isExplicitAdminSetup, customHostUrl, checkBackendStatus]);

  // ---------------------------------------------------------------------------
  // Ping Server URL explicitly from input button
  // ---------------------------------------------------------------------------
  const handlePingHost = async (hostToTest?: string) => {
    const rawUrl = (hostToTest !== undefined ? hostToTest : customHostUrl).trim();
    if (!rawUrl) {
      setHostPingStatus('error');
      setHostPingMessage('Please enter a server URL (e.g. https://shuffle.example.com:3443)');
      return;
    }

    let urlToTest = rawUrl.replace(/\/+$/, '');
    if (!urlToTest.startsWith('http://') && !urlToTest.startsWith('https://')) {
      const isLocal = urlToTest.startsWith('localhost') || urlToTest.startsWith('127.0.0.1');
      urlToTest = (isLocal ? 'http://' : 'https://') + urlToTest;
      setCustomHostUrl(urlToTest);
    }

    if (isShuffleCloudDomain(urlToTest)) {
      setCustomHostUrl('');
      setHostPingStatus('idle');
      setHostPingMessage('');
      handleServerModeChange('cloud');
      setNotice('Switched to Shuffle Cloud login');
      return;
    }

    setHostBaseUrl(urlToTest);
    setMcpHostBaseUrl(urlToTest);
    try {
      localStorage.setItem(CUSTOM_HOST_STORAGE_KEY, urlToTest);
      localStorage.setItem(SERVER_MODE_STORAGE_KEY, 'self-hosted');
    } catch {}

    await checkBackendStatus(true, urlToTest);
  };

  // ---------------------------------------------------------------------------
  // SSO Discovery Flow (CLOUD MODE)
  // ---------------------------------------------------------------------------
  const handleSsoDiscoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSsoError('');

    if (!username.trim() || !isValidEmail(username)) {
      setSsoError('Please enter a valid work email address.');
      return;
    }

    setSsoLoading(true);

    try {
      const ssoEndpoint = getApiUrl(API_ENDPOINTS.login);
      const res = await fetch(ssoEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          username: username.trim(),
          sso: true,
        }),
      });

      const data = await res.json().catch(() => ({}));

      const isSsoRedirect =
        data.reason === 'SSO_REDIRECT' ||
        data.message === 'SSO_REDIRECT' ||
        data.sso_redirect === true;

      const targetUrl = data.url || data.redirect_url || data.sso_url;

      if (isSsoRedirect && targetUrl && typeof targetUrl === 'string') {
        if (typeof window !== 'undefined' && from) {
          try {
            sessionStorage.setItem('shuffle_redirect_after_login', from);
          } catch {}
        }
        window.location.assign(targetUrl);
        return;
      }

      if (data.success === false || !res.ok) {
        setSsoError(
          data.reason ||
            data.message ||
            'Single Sign-On is not configured for this account. Please sign in with your password.'
        );
        return;
      }

      setSsoError('Unable to resolve Single Sign-On provider. Please sign in with your password.');
    } catch (err: any) {
      setSsoError(err?.message || 'Network error while looking up Single Sign-On provider.');
    } finally {
      setSsoLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Admin Setup Submit Handler (Single-Page Mode)
  // ---------------------------------------------------------------------------
  const handleAdminSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedUser = username.trim();
    if (!trimmedUser) {
      setError('Please enter a username or email for the administrator.');
      return;
    }
    if (trimmedUser.length < 2) {
      setError('Administrator username must be at least 2 characters.');
      return;
    }
    if (!password) {
      setError('Please enter a password.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const targetHost = (customHostUrl.trim() || getHostBaseUrl() || '').replace(/\/+$/, '');
      const probeBase =
        targetHost || (typeof window !== 'undefined' ? window.location.origin : '');
      const registerUrl = `${probeBase}/api/v1/register`;

      const res = await fetch(registerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          username: trimmedUser,
          password: password,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (data.success === false || (!res.ok && res.status !== 200 && res.status !== 201)) {
        setError(
          data.reason ||
            data.message ||
            `Failed to create administrator account (status ${res.status}).`
        );
        setLoading(false);
        return;
      }

      setAdminSetupSuccess(true);
      setNotice('Administrator account created successfully! Signing you in...');

      // Auto-login with the newly created credentials
      try {
        const loginUrl = `${probeBase}/api/v1/login`;
        const loginRes = await fetch(loginUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            username: trimmedUser,
            password: password,
          }),
        });

        const loginData = await loginRes.json().catch(() => ({}));

        if (loginData.success !== false) {
          const adminSessionToken =
            loginData.session_token ||
            loginData.token ||
            loginData.jwt ||
            loginData.session_id ||
            (Array.isArray(loginData.cookies)
              ? loginData.cookies.find((c: any) => c.key === 'session_token' || c.key === '__session')?.value
              : '') ||
            '';

          if (login) {
            await login(
              adminSessionToken || undefined,
              loginData?.user || { username: trimmedUser }
            );
          }
          if (onLoginSuccess) {
            await onLoginSuccess(adminSessionToken || undefined, loginData?.user);
          }
          goToRedirectTarget(from || defaultDestination);
          return;
        }
      } catch {
        // Fallback: transition to login form
      }

      // If auto-login didn't redirect, transition to standard login
      window.setTimeout(() => {
        setAuthMode('login');
        setAdminSetupSuccess(false);
        setNotice('Administrator created! Please sign in with your credentials.');
        setLoading(false);
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Network error while creating administrator account.');
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Validation & Formatting
  // ---------------------------------------------------------------------------
  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

  const identifierLabel =
    serverMode === 'cloud' ? 'Email' : 'Username or Email';

  const cloudEmailInvalid =
    serverMode === 'cloud' && username.trim().length > 0 && !isValidEmail(username);

  // Auto-login for onprem instance SSO if ?autologin=true (matches classic Shuffle)
  useEffect(() => {
    if (serverMode !== 'self-hosted' || !instanceSsoUrl) return;
    try {
      const sp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      if (sp.get('autologin') === 'true') {
        if (typeof window !== 'undefined') {
          if (from) {
            sessionStorage.setItem('shuffle_redirect_after_login', from);
          }
          window.location.href = instanceSsoUrl;
        }
      }
    } catch {}
  }, [serverMode, instanceSsoUrl, from]);

  // Auto-focus MFA input on prompt
  useEffect(() => {
    if (!mfaRequired) return undefined;
    const timer = setTimeout(() => {
      mfaInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [mfaRequired]);

  // ---------------------------------------------------------------------------
  // Primary Login / Registration Submit Handler
  // ---------------------------------------------------------------------------
  const performLogin = async (codeToUse?: string) => {
    setError('');
    const code = codeToUse !== undefined ? codeToUse : mfaCode;

    if (!mfaRequired) {
      if (!username.trim()) {
        setError(
          serverMode === 'cloud'
            ? 'Please enter your work email address.'
            : 'Please enter your username or email address.'
        );
        return;
      }
      if (serverMode === 'cloud' && !isValidEmail(username)) {
        setError('Please enter a valid work email address.');
        return;
      }
      if (!password) {
        setError('Please enter your password.');
        return;
      }
      if (isRegister && password.length < 10) {
        setError('Password must be at least 10 characters.');
        return;
      }
      if (isRegister && !termsAccepted) {
        setError("Please agree to Shuffle's Terms of Service to continue.");
        return;
      }
    }

    if (serverMode === 'self-hosted') {
      if (isRegister) {
        setError('Self-service registration is not available on self-hosted instances.');
        return;
      }
      if (!customHostUrl.trim()) {
        setError('Please provide your self-hosted Shuffle server URL');
        return;
      }

      let normalized = customHostUrl.trim().replace(/\/+$/, '');
      if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        const isLocal = normalized.startsWith('localhost') || normalized.startsWith('127.0.0.1');
        normalized = (isLocal ? 'http://' : 'https://') + normalized;
        setCustomHostUrl(normalized);
      }

      if (isShuffleCloudDomain(normalized)) {
        setCustomHostUrl('');
        setHostPingStatus('idle');
        setHostPingMessage('');
        handleServerModeChange('cloud');
        setNotice('Switched to Shuffle Cloud login');
        return;
      }

      setHostBaseUrl(normalized);
      setMcpHostBaseUrl(normalized);
      try {
        localStorage.setItem(SERVER_MODE_STORAGE_KEY, 'self-hosted');
        localStorage.setItem(CUSTOM_HOST_STORAGE_KEY, normalized);
      } catch {}
    } else {
      setHostBaseUrl(null);
      setMcpHostBaseUrl(null);
      try {
        localStorage.setItem(SERVER_MODE_STORAGE_KEY, 'cloud');
      } catch {}
    }

    setLoading(true);

    try {
      const body: Record<string, string> = { username: username.trim(), password };
      if ((mfaRequired || code) && code) {
        body.mfa_code = code;
      }

      const loginUrl = getApiUrl(serverMode === 'cloud' && isRegister ? API_ENDPOINTS.register : API_ENDPOINTS.login);
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      // Edgecase 1: SSO Redirect required by backend
      const isSsoRedirect =
        data.reason === 'SSO_REDIRECT' ||
        data.message === 'SSO_REDIRECT' ||
        data.sso_redirect === true;

      if (isSsoRedirect) {
        const ssoUrl = data.url || data.redirect_url || data.sso_url;
        if (ssoUrl && typeof ssoUrl === 'string') {
          if (typeof window !== 'undefined' && from) {
            try {
              sessionStorage.setItem('shuffle_redirect_after_login', from);
            } catch {}
          }
          window.location.assign(ssoUrl);
          return;
        }
        setError('Single Sign-On is required, but no redirect URL was provided by the server.');
        return;
      }

      // Edgecase 2: MFA Setup required by backend (/login/{token}/mfa-setup)
      const isMfaSetup =
        data.reason === 'MFA_SETUP' ||
        data.message === 'MFA_SETUP' ||
        data.mfa_setup === true;

      if (isMfaSetup) {
        const setupToken = data.url || data.token || data.extra;
        if (setupToken && typeof setupToken === 'string') {
          if (typeof window !== 'undefined' && from) {
            try {
              sessionStorage.setItem('shuffle_redirect_after_login', from);
            } catch {}
          }
          const rawSearch =
            (location.search && location.search !== '?' ? location.search : '') ||
            (typeof window !== 'undefined' ? window.location.search : '');
          const cleanSearch = rawSearch.startsWith('?') ? rawSearch : rawSearch ? `?${rawSearch}` : '';
          navigate(`/login/${encodeURIComponent(setupToken)}/mfa-setup${cleanSearch}`);
          return;
        }
        setError('Multi-factor authentication setup is required, but no setup token was provided.');
        return;
      }

      // Edgecase 3: MFA Code prompt (MFA_REDIRECT / 402)
      const isMfaRedirect =
        data.reason === 'MFA_REDIRECT' ||
        data.message === 'MFA_REDIRECT' ||
        response.status === 402;

      if (isMfaRedirect) {
        setMfaRequired(true);
        setNotice('Two-factor authentication code required. Please enter the code from your authenticator app.');
        return;
      }

      // Failure handling
      if (!response.ok || data.success === false) {
        setError(
          data.reason ||
            data.message ||
            (isRegister
              ? 'Registration failed. The username or email may already be in use.'
              : 'Invalid credentials. Please check your username and password.')
        );
        return;
      }

      // Edgecase 4: Multi-region routing via region_url
      if (data.region_url && typeof data.region_url === 'string') {
        try {
          setRegionUrl(data.region_url, data.org_id);
          if (typeof window !== 'undefined') {
            localStorage.setItem('globalUrl', data.region_url);
          }
        } catch {}
      }

      // Extract session token from cookies array, direct fields, or response
      const sessionToken =
        data.session_token ||
        data.token ||
        data.jwt ||
        data.session_id ||
        (Array.isArray(data.cookies)
          ? data.cookies.find((c: any) => c.key === 'session_token' || c.key === '__session')?.value
          : '') ||
        '';

      // Verify the session works before finalizing login.
      // Try standard cookie verification first (credentials: 'include').
      // If cookie verification is not working (e.g. strict cross-site blocking),
      // fall back to Authorization: Bearer <sessionToken> if token exists.
      let verifiedUserInfo: any = null;
      let authMode: 'cookie' | 'bearer' = 'cookie';

      try {
        const cookieResponse = await fetch(getApiUrl('/api/v1/getinfo'), {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (cookieResponse.ok) {
          const info = await cookieResponse.json().catch(() => null);
          if (info?.success === true) {
            verifiedUserInfo = info;
            authMode = 'cookie';
          }
        }
      } catch {}

      if (!verifiedUserInfo && sessionToken) {
        try {
          const bearerResponse = await fetch(getApiUrl('/api/v1/getinfo'), {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionToken}`,
            },
          });

          if (bearerResponse.ok) {
            const info = await bearerResponse.json().catch(() => null);
            if (info?.success === true) {
              verifiedUserInfo = info;
              authMode = 'bearer';
            }
          }
        } catch {}
      }

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('shuffle_auth_mode', authMode);
          localStorage.setItem('shuffle_has_logged_in', 'true');
        } catch {}
      }

      const tokenToPass = authMode === 'bearer' ? sessionToken : (sessionToken || undefined);

      if (login) {
        await login(tokenToPass, verifiedUserInfo || (data.user?.username ? data.user : undefined));
      }
      if (onLoginSuccess) {
        await onLoginSuccess(tokenToPass, verifiedUserInfo || data.user);
      }

      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem('shuffle_redirect_after_login');
        } catch {}
      }

      goToRedirectTarget(from || defaultDestination);
    } catch (err: any) {
      setError(err?.message || 'A network error occurred during sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Cloud Password Reset Mailer
  // ---------------------------------------------------------------------------
  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !isValidEmail(username)) {
      setError('Please enter a valid work email address.');
      return;
    }

    setLoading(true);

    try {
      const resetUrl = getApiUrl(API_ENDPOINTS.passwordResetMail);
      const res = await fetch(resetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email: username.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        setError(data.reason || data.message || 'Unable to send password reset email. Please try again.');
        return;
      }

      setResetEmailSent(true);
      setResetEmailSuccessMsg(
        `If an account exists for ${username.trim()}, a password reset link has been sent to your email.`
      );
    } catch (err: any) {
      setError(err?.message || 'Network error while requesting password reset.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrimaryFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isAdminSetup) {
      handleAdminSetupSubmit(e);
    } else if (isResetPasswordMode) {
      handlePasswordResetSubmit(e);
    } else if (serverMode === 'cloud' && loginWithSSO) {
      handleSsoDiscoverySubmit(e);
    } else {
      performLogin();
    }
  };

  const handleMfaChange = (val: string) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 6);
    setMfaCode(cleaned);
    if (cleaned.length === 6) {
      performLogin(cleaned);
    }
  };

  const theme = useTheme();
  const primaryColor = theme.palette.primary.main;

  const inputSx = {
    height: '43px',
    bgcolor: 'hsl(var(--background))',
    color: 'hsl(var(--foreground))',
    borderRadius: '12px',
    fontSize: '0.875rem',
    boxSizing: 'border-box',
    '& .MuiOutlinedInput-input': {
      height: '43px',
      boxSizing: 'border-box',
      py: 0,
      color: 'hsl(var(--foreground))',
      fontSize: '0.875rem',
    },
    '& input': {
      height: '43px',
      boxSizing: 'border-box',
      color: 'hsl(var(--foreground))',
      fontSize: '0.875rem',
      py: 0,
    },
    '& input::placeholder': {
      color: 'hsl(var(--muted-foreground))',
      opacity: 0.8,
    },
    '& fieldset': {
      borderColor: 'hsl(var(--border))',
      borderRadius: '12px',
    },
    '&:hover fieldset': { borderColor: '#FF6600' },
    '&.Mui-focused fieldset': { borderColor: '#FF6600' },
  };

  // Branding text defaults
  const effectiveTitle =
    productName || (product === 'security' ? 'Shuffle Security' : 'Shuffle');
  const effectiveSubtitle =
    productSubtitle ||
    (product === 'security'
      ? 'Open Source Incident Response & Automation'
      : 'Open Source Security Automation & Orchestration');
  const effectiveLogo =
    logo || <ShuffleCompanyLogo size={56} />;

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'hsl(var(--background))', position: 'relative' }}>
      {!isCapacitorNative() && header && (
        <Box sx={{ display: { xs: 'none', md: 'block' } }}>
          {header}
        </Box>
      )}

      <Box
        sx={{
          minHeight: '100dvh',
          width: '100%',
          maxWidth: '100vw',
          overflowX: 'hidden',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          boxSizing: 'border-box',
          bgcolor: 'hsl(var(--background))',
          color: 'hsl(var(--foreground))',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: 'center',
          px: { xs: 2, sm: 2.5 },
          py: { xs: 2, sm: 4 },
          pt: {
            xs: 'max(5.5rem, calc(2.75rem + env(safe-area-inset-top, 52px)))',
            sm: 5,
            md: 'max(7rem, 96px)',
          },
          pb: {
            xs: 'max(2.5rem, calc(2rem + env(safe-area-inset-bottom, 24px)))',
            sm: 4,
            md: 6,
          },
          pl: 'max(1.25rem, calc(1rem + env(safe-area-inset-left, 0px)))',
          pr: 'max(1.25rem, calc(1rem + env(safe-area-inset-right, 0px)))',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          style={{ width: '100%', maxWidth: 'min(440px, 100%)', boxSizing: 'border-box' }}
        >
          {/* Brand Header */}
          <Box sx={{ textAlign: 'center', mb: { xs: 3, sm: 3.5 }, mt: { xs: 1, sm: 0 } }}>
            <Box
              sx={{
                display: 'inline-flex',
                p: 0.5,
                borderRadius: 3,
                mb: 1.5,
                boxShadow: '0 8px 24px rgba(255, 102, 0, 0.2)',
              }}
            >
              {effectiveLogo}
            </Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                letterSpacing: '-0.5px',
                color: 'hsl(var(--foreground))',
                fontSize: { xs: '1.4rem', sm: '1.5rem' },
              }}
            >
              {effectiveTitle}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'hsl(var(--muted-foreground))',
                fontSize: '0.825rem',
                mt: 0.5,
              }}
            >
              {effectiveSubtitle.toLowerCase().startsWith('open source') ? (
                <>
                  <a
                    href="https://github.com/Shuffle/shuffle.security"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'inherit',
                      textDecoration: 'underline',
                    }}
                  >
                    Open Source
                  </a>{' '}
                  {effectiveSubtitle.replace(/^open source\s*/i, '')}
                </>
              ) : (
                effectiveSubtitle
              )}
            </Typography>
          </Box>

          {/* Server Instance Switcher - above the auth card */}
          {allowSelfHosted && !mfaRequired && !isResetPasswordMode && !isAdminSetup && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2.5 }}>
              <SegmentedControl
                value={serverMode}
                onChange={handleServerModeChange}
                size="md"
                variant="outline"
                ariaLabel="Server instance"
                options={[
                  {
                    value: 'cloud',
                    label: (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Cloud size={14} />
                        Shuffle Cloud
                      </span>
                    ),
                  },
                  {
                    value: 'self-hosted',
                    label: (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Server size={14} />
                        Self-Hosted
                      </span>
                    ),
                  },
                ]}
              />
            </Box>
          )}

          {/* Main Authentication Card */}
          <Card
            sx={{
              bgcolor: 'transparent',
              backgroundImage: 'none',
              borderRadius: 3,
              border: '1px solid hsl(var(--border))',
              boxShadow: 'none',
              overflow: 'hidden',
            }}
          >
            <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
              {/* Self-Hosted Server URL Configuration */}
              <AnimatePresence initial={false}>
                {!mfaRequired && serverMode === 'self-hosted' && !isAdminSetup && !isWaitingForBackend && (
                  <motion.div
                    key="self-hosted-url-config"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <Box sx={{ pb: 2.5 }}>
                      <Typography
                        sx={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: 'hsl(var(--muted-foreground))',
                          mb: 0.75,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        Instance URL
                      </Typography>
                      <TextField
                        placeholder={
                          typeof window !== 'undefined' && isLocalhostFrontend(window.location.hostname)
                            ? 'http://localhost:5001'
                            : 'https://shuffle.myorg.internal:3443'
                        }
                        value={customHostUrl}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomHostUrl(val);
                          setHostPingStatus('idle');
                          setHostPingMessage('');
                          setInstanceSsoUrl(null);
                          try {
                            if (val.trim()) {
                              localStorage.setItem(CUSTOM_HOST_STORAGE_KEY, val.trim());
                            } else {
                              localStorage.removeItem(CUSTOM_HOST_STORAGE_KEY);
                            }
                          } catch {}
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handlePingHost();
                          }
                        }}
                        onBlur={() => {
                          const trimmed = customHostUrl.trim();
                          if (trimmed) {
                            let normalized = trimmed.replace(/\/+$/, '');
                            if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
                              const isLocal = normalized.startsWith('localhost') || normalized.startsWith('127.0.0.1');
                              normalized = (isLocal ? 'http://' : 'https://') + normalized;
                              setCustomHostUrl(normalized);
                            }
                            try {
                              localStorage.setItem(CUSTOM_HOST_STORAGE_KEY, normalized);
                            } catch {}
                            if (isShuffleCloudDomain(normalized)) {
                              handlePingHost();
                            }
                          }
                        }}
                        fullWidth
                        autoCapitalize="none"
                        autoCorrect="off"
                        InputProps={{
                          sx: {
                            height: '43px',
                            bgcolor: 'hsl(var(--card))',
                            color: 'hsl(var(--foreground))',
                            borderRadius: '12px',
                            fontSize: '0.875rem',
                            pr: 0.75,
                            boxSizing: 'border-box',
                            '& .MuiOutlinedInput-input': {
                              height: '43px',
                              boxSizing: 'border-box',
                              py: 0,
                              color: 'hsl(var(--foreground))',
                              fontSize: '0.875rem',
                            },
                            '& input': {
                              height: '43px',
                              boxSizing: 'border-box',
                              color: 'hsl(var(--foreground))',
                              py: 0,
                            },
                            '& fieldset': {
                              borderColor: 'hsl(var(--border))',
                              borderRadius: '12px',
                            },
                            '&:hover fieldset': { borderColor: '#FF6600' },
                            '&.Mui-focused fieldset': { borderColor: '#FF6600' },
                          },
                          endAdornment: (
                            <InputAdornment position="end">
                              <Button
                                onClick={() => handlePingHost()}
                                variant="contained"
                                disabled={isPingingHost}
                                size="small"
                                sx={{
                                  minWidth: 64,
                                  height: 28,
                                  px: 1.5,
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  textTransform: 'none',
                                  borderRadius: 1.5,
                                  bgcolor: hostPingStatus === 'success' ? '#22c55e' : '#FF6600',
                                  color: '#FFFFFF',
                                  border: '1px solid hsl(var(--border))',
                                  boxShadow: 'none',
                                  '&:hover': {
                                    bgcolor: hostPingStatus === 'success' ? '#16a34a' : '#e65c00',
                                    boxShadow: 'none',
                                  },
                                  '&.Mui-disabled': {
                                    bgcolor: 'hsl(var(--muted) / 0.4)',
                                    color: 'hsl(var(--muted-foreground) / 0.5)',
                                    borderColor: 'transparent',
                                  },
                                }}
                              >
                                {isPingingHost ? (
                                  <CircularProgress size={14} sx={{ color: 'inherit' }} />
                                ) : hostPingStatus === 'success' ? (
                                  'Connected'
                                ) : (
                                  'Test'
                                )}
                              </Button>
                            </InputAdornment>
                          ),
                        }}
                      />
                      {hostPingMessage && (
                        <Box sx={{ mt: 1 }}>
                          {hostPingStatus === 'needs-admin' ? (
                            <Alert
                              severity="warning"
                              action={
                                <Button
                                  color="inherit"
                                  size="small"
                                  onClick={() => setAuthMode('adminsetup')}
                                  sx={{ fontWeight: 700, textTransform: 'none' }}
                                >
                                  Set Up Admin
                                </Button>
                              }
                              sx={{
                                borderRadius: 2,
                                fontSize: '0.8rem',
                                bgcolor: 'rgba(234, 179, 8, 0.1)',
                                color: '#eab308',
                                border: '1px solid rgba(234, 179, 8, 0.2)',
                                '& .MuiAlert-icon': { color: '#eab308' },
                              }}
                            >
                              {hostPingMessage}
                            </Alert>
                          ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              {hostPingStatus === 'success' ? (
                                <CheckCircle2 size={14} color="#22c55e" />
                              ) : (
                                <AlertCircle size={14} color="#ef4444" />
                              )}
                              <Typography
                                sx={{
                                  fontSize: '0.75rem',
                                  color: hostPingStatus === 'success' ? '#22c55e' : '#ef4444',
                                }}
                              >
                                {hostPingMessage}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      )}
                      {!hostPingMessage && serverMode === 'self-hosted' && hostPingStatus !== 'success' && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1 }}>
                          <AlertCircle size={14} color="#FF6600" />
                          <Typography
                            sx={{
                              fontSize: '0.75rem',
                              color: 'hsl(var(--muted-foreground))',
                            }}
                          >
                            {customHostUrl.trim()
                              ? 'Click Test to verify the server and enable Sign In.'
                              : 'Enter your server URL, then click Test to enable Sign In.'}
                          </Typography>
                        </Box>
                      )}
                      {instanceSsoUrl && (
                        <Box sx={{ mt: 1.5, pt: 1, borderTop: '1px dashed hsl(var(--border))' }}>
                          <Typography
                            variant="caption"
                            sx={{
                              color: '#22c55e',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.75,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            <CheckCircle2 size={14} />
                            Single Sign-On is enabled on this instance
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Notice / Error alerts */}
              {notice && (
                <Alert
                  severity="info"
                  onClose={() => setNotice('')}
                  sx={{
                    mb: 2.5,
                    borderRadius: 2,
                    fontSize: '0.8rem',
                    py: 0.5,
                    bgcolor: 'rgba(255, 102, 0, 0.1)',
                    color: '#FF6600',
                    border: '1px solid rgba(255, 102, 0, 0.2)',
                    '& .MuiAlert-icon': { color: '#FF6600' },
                  }}
                >
                  {notice}
                </Alert>
              )}

              {error && (
                <Alert
                  severity="error"
                  onClose={() => setError('')}
                  sx={{
                    mb: 2.5,
                    borderRadius: 2,
                    fontSize: '0.8rem',
                    py: 0.5,
                    bgcolor: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    '& .MuiAlert-icon': { color: '#ef4444' },
                  }}
                >
                  {error}
                </Alert>
              )}

              {ssoError && (
                <Alert
                  severity="warning"
                  onClose={() => setSsoError('')}
                  sx={{
                    mb: 2.5,
                    borderRadius: 2,
                    fontSize: '0.8rem',
                    py: 0.5,
                    bgcolor: 'rgba(234, 179, 8, 0.1)',
                    color: '#eab308',
                    border: '1px solid rgba(234, 179, 8, 0.2)',
                    '& .MuiAlert-icon': { color: '#eab308' },
                  }}
                >
                  {ssoError}
                </Alert>
              )}

              {/* Waiting for Backend state */}
              {isWaitingForBackend ? (
                <Box sx={{ textAlign: 'center', py: 2 }}>
                  <Box
                    sx={{
                      display: 'inline-flex',
                      p: 2,
                      borderRadius: '50%',
                      bgcolor: 'rgba(255, 102, 0, 0.1)',
                      mb: 2,
                      color: '#FF6600',
                    }}
                  >
                    <Database size={32} />
                  </Box>

                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1, color: 'hsl(var(--foreground))' }}>
                    Waiting for Shuffle Database
                  </Typography>

                  <Typography
                    variant="body2"
                    sx={{
                      color: 'hsl(var(--muted-foreground))',
                      fontSize: '0.85rem',
                      lineHeight: 1.5,
                      mb: 2.5,
                      px: 1,
                    }}
                  >
                    Waiting for the Shuffle backend and database to become available. This may take up to two minutes on first startup while migrations run.
                  </Typography>

                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                    <CircularProgress size={32} sx={{ color: '#FF6600' }} />
                  </Box>

                  {waitingErrorMessage && (
                    <Box
                      sx={{
                        p: 1.25,
                        mb: 2.5,
                        borderRadius: 1.5,
                        bgcolor: 'rgba(0, 0, 0, 0.2)',
                        border: '1px solid hsl(var(--border))',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        color: 'hsl(var(--muted-foreground))',
                        wordBreak: 'break-all',
                      }}
                    >
                      Backend response: {waitingErrorMessage}
                    </Box>
                  )}

                  <Box
                    sx={{
                      textAlign: 'left',
                      p: 2,
                      mb: 2.5,
                      borderRadius: 1.5,
                      bgcolor: 'rgba(0, 0, 0, 0.2)',
                      border: '1px solid hsl(var(--border))',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                      }}
                      onClick={() => setShowTroubleshooting(!showTroubleshooting)}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <HelpCircle size={16} style={{ color: '#FF6600' }} />
                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                          Is Shuffle installed correctly?
                        </Typography>
                      </Box>
                      <IconButton size="small" sx={{ p: 0.5, color: 'hsl(var(--muted-foreground))' }}>
                        {showTroubleshooting ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </IconButton>
                    </Box>

                    <Collapse in={showTroubleshooting}>
                      <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed hsl(var(--border))' }}>
                        <Typography variant="caption" sx={{ display: 'block', color: 'hsl(var(--muted-foreground))', mb: 1 }}>
                          <b>1.</b> Make sure the database directory has permissions and you have at least <b>4GB RAM</b>:
                        </Typography>
                        <Box
                          sx={{
                            p: 1,
                            mb: 1.5,
                            borderRadius: 1,
                            bgcolor: 'hsl(var(--background))',
                            fontFamily: 'monospace',
                            fontSize: '0.725rem',
                            color: '#FF6600',
                            userSelect: 'all',
                          }}
                        >
                          sudo chown -R 1000:1000 shuffle-database
                        </Box>

                        <Typography variant="caption" sx={{ display: 'block', color: 'hsl(var(--muted-foreground))', mb: 1 }}>
                          <b>2.</b> Check that Docker services are running:
                        </Typography>
                        <Box
                          sx={{
                            p: 1,
                            mb: 1.5,
                            borderRadius: 1,
                            bgcolor: 'hsl(var(--background))',
                            fontFamily: 'monospace',
                            fontSize: '0.725rem',
                            color: '#FF6600',
                            userSelect: 'all',
                          }}
                        >
                          docker compose ps
                        </Box>
                      </Box>
                    </Collapse>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => checkBackendStatus(true)}
                      disabled={isPingingHost}
                      startIcon={<RefreshCw size={15} />}
                      sx={{
                        py: 1.2,
                        bgcolor: '#FF6600',
                        color: '#FFFFFF',
                        fontWeight: 600,
                        textTransform: 'none',
                        borderRadius: 1.5,
                        boxShadow: 'none',
                        '&:hover': { bgcolor: '#e65c00', boxShadow: 'none' },
                      }}
                    >
                      {isPingingHost ? 'Checking...' : 'Check Connection Again'}
                    </Button>

                    <Button
                      fullWidth
                      variant="text"
                      size="small"
                      onClick={() => {
                        setIsWaitingForBackend(false);
                        setWaitingErrorMessage('');
                      }}
                      sx={{
                        textTransform: 'none',
                        color: 'hsl(var(--muted-foreground))',
                        fontSize: '0.85rem',
                        '&:hover': { color: 'hsl(var(--foreground))' },
                      }}
                    >
                      Change Server URL or Mode
                    </Button>
                  </Box>
                </Box>
              ) : (
                /* Primary Forms */
                <Box component="form" onSubmit={handlePrimaryFormSubmit}>
                  <AnimatePresence mode="wait">
                    {mfaRequired ? (
                      /* MFA Code Entry */
                      <motion.div
                        key="mfa-step"
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Box sx={{ textAlign: 'center', mb: 2.5 }}>
                          <Box
                            sx={{
                              display: 'inline-flex',
                              p: 1,
                              borderRadius: 2.5,
                              bgcolor: 'rgba(255, 102, 0, 0.1)',
                              border: '1px solid rgba(255, 102, 0, 0.2)',
                              color: '#FF6600',
                              mb: 1.25,
                            }}
                          >
                            <ShieldCheck size={24} />
                          </Box>
                          <Typography
                            sx={{
                              fontWeight: 700,
                              fontSize: '1.15rem',
                              color: 'hsl(var(--foreground))',
                              mb: 0.5,
                            }}
                          >
                            Two-Factor Authentication
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: '0.8rem',
                              color: 'hsl(var(--muted-foreground))',
                              lineHeight: 1.4,
                            }}
                          >
                            Enter the 6-digit code for <strong>{username}</strong> from your authenticator app.
                          </Typography>
                        </Box>

                        {/* 6 Segmented PIN Boxes */}
                        <Box
                          sx={{
                            position: 'relative',
                            display: 'flex',
                            justifyContent: 'center',
                            gap: { xs: 0.85, sm: 1.25 },
                            my: 2.5,
                            cursor: 'text',
                          }}
                          onClick={() => mfaInputRef.current?.focus()}
                        >
                          <input
                            ref={mfaInputRef}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoComplete="one-time-code"
                            maxLength={6}
                            value={mfaCode}
                            onChange={(e) => handleMfaChange(e.target.value)}
                            disabled={loading}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              opacity: 0,
                              zIndex: 10,
                              cursor: 'text',
                            }}
                          />
                          {[0, 1, 2, 3, 4, 5].map((index) => {
                            const digit = mfaCode[index] || '';
                            const isCurrent = mfaCode.length === index;

                            return (
                              <Box
                                key={index}
                                sx={{
                                  width: { xs: 40, sm: 46 },
                                  height: { xs: 48, sm: 54 },
                                  borderRadius: 2,
                                  border: '2px solid',
                                  borderColor: isCurrent
                                    ? '#FF6600'
                                    : digit
                                    ? 'hsl(var(--foreground))'
                                    : 'hsl(var(--border))',
                                  bgcolor: isCurrent
                                    ? 'rgba(255, 102, 0, 0.08)'
                                    : 'hsl(var(--background))',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '1.35rem',
                                  fontWeight: 700,
                                  color: 'hsl(var(--foreground))',
                                  boxShadow: isCurrent ? '0 0 0 2px rgba(255, 102, 0, 0.25)' : 'none',
                                  transition: 'all 0.15s ease-in-out',
                                }}
                              >
                                {digit}
                              </Box>
                            );
                          })}
                        </Box>

                        <Button
                          type="submit"
                          variant="contained"
                          fullWidth
                          disabled={loading || mfaCode.length < 6}
                          sx={{
                            py: 1.25,
                            borderRadius: 2,
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            textTransform: 'none',
                            bgcolor: '#FF6600',
                            color: '#FFFFFF',
                            boxShadow: '0 4px 14px rgba(255, 102, 0, 0.35)',
                            '&:hover': {
                              bgcolor: '#e65c00',
                            },
                          }}
                        >
                          {loading ? <CircularProgress size={22} sx={{ color: '#ffffff' }} /> : 'Verify Code'}
                        </Button>

                        <Button
                          variant="text"
                          fullWidth
                          onClick={() => {
                            setMfaRequired(false);
                            setMfaCode('');
                            setError('');
                          }}
                          disabled={loading}
                          sx={{
                            mt: 1.5,
                            textTransform: 'none',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'hsl(var(--muted-foreground))',
                            '&:hover': { color: 'hsl(var(--foreground))' },
                          }}
                        >
                          Back to Sign In
                        </Button>
                      </motion.div>
                    ) : isResetPasswordMode ? (
                      /* Password Reset Mode */
                      <motion.div
                        key="reset-step"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Box sx={{ mb: 2 }}>
                          <Typography
                            variant="subtitle2"
                            sx={{
                              fontWeight: 700,
                              color: 'hsl(var(--foreground))',
                              mb: 0.5,
                            }}
                          >
                            Reset Your Password
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: '0.8rem',
                              color: 'hsl(var(--muted-foreground))',
                              lineHeight: 1.4,
                            }}
                          >
                            Enter your email address and we will send you a link to reset your password.
                          </Typography>
                        </Box>

                        {resetEmailSent && (
                          <Alert
                            severity="success"
                            sx={{
                              mb: 2.5,
                              borderRadius: 2,
                              fontSize: '0.8rem',
                              py: 0.5,
                              bgcolor: 'rgba(34, 197, 94, 0.1)',
                              color: '#22c55e',
                              border: '1px solid rgba(34, 197, 94, 0.2)',
                              '& .MuiAlert-icon': { color: '#22c55e' },
                            }}
                          >
                            {resetEmailSuccessMsg}
                          </Alert>
                        )}

                        <Box sx={{ mb: 2.5 }}>
                          <Typography
                            sx={{
                              fontSize: '0.875rem',
                              fontWeight: 500,
                              color: 'hsl(var(--foreground))',
                              mb: 0.75,
                            }}
                          >
                            {serverMode === 'cloud' ? 'Email' : 'Email or Username'}
                          </Typography>
                          <TextField
                            placeholder="analyst@organization.com"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            fullWidth
                            required
                            autoCapitalize="none"
                            autoCorrect="off"
                            autoComplete="email"
                            InputProps={{ sx: inputSx }}
                          />
                        </Box>

                        <Button
                          type="submit"
                          variant="contained"
                          fullWidth
                          disabled={loading || !username.trim()}
                          sx={{
                            py: 1.25,
                            borderRadius: 2,
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            textTransform: 'none',
                            bgcolor: '#FF6600',
                            color: '#FFFFFF',
                            boxShadow: '0 4px 14px rgba(255, 102, 0, 0.35)',
                            '&:hover': {
                              bgcolor: '#e65c00',
                            },
                          }}
                        >
                          {loading ? (
                            <CircularProgress size={22} sx={{ color: '#ffffff' }} />
                          ) : resetEmailSent ? (
                            'Resend Reset Link'
                          ) : (
                            'Send Reset Link'
                          )}
                        </Button>

                        <Box sx={{ textAlign: 'center', mt: 2 }}>
                          <Button
                            onClick={() => {
                              setIsResetPasswordMode(false);
                              setResetEmailSent(false);
                              setError('');
                            }}
                            size="small"
                            startIcon={<ArrowLeft size={14} />}
                            sx={{
                              textTransform: 'none',
                              fontSize: '0.8rem',
                              color: 'hsl(var(--muted-foreground))',
                              '&:hover': { color: 'hsl(var(--foreground))' },
                            }}
                          >
                            Back to Sign In
                          </Button>
                        </Box>
                      </motion.div>
                    ) : isAdminSetup ? (
                      /* Admin Setup Mode */
                      <motion.div
                        key="admin-step"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Box sx={{ mb: 2 }}>
                          <Typography
                            variant="subtitle2"
                            sx={{
                              fontWeight: 700,
                              color: 'hsl(var(--foreground))',
                              mb: 0.5,
                            }}
                          >
                            Administrator Setup
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: '0.8rem',
                              color: 'hsl(var(--muted-foreground))',
                              lineHeight: 1.4,
                            }}
                          >
                            Initialize the root administrator credentials for this server.
                          </Typography>
                        </Box>

                        <Box sx={{ mb: 2 }}>
                          <Typography
                            sx={{
                              fontSize: '0.875rem',
                              fontWeight: 500,
                              color: 'hsl(var(--foreground))',
                              mb: 0.75,
                            }}
                          >
                            Administrator Username or Email
                          </Typography>
                          <TextField
                            placeholder="admin"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            fullWidth
                            required
                            autoCapitalize="none"
                            autoCorrect="off"
                            InputProps={{ sx: inputSx }}
                          />
                        </Box>

                        <Box sx={{ mb: 2 }}>
                          <Typography
                            sx={{
                              fontSize: '0.875rem',
                              fontWeight: 500,
                              color: 'hsl(var(--foreground))',
                              mb: 0.75,
                            }}
                          >
                            Password
                          </Typography>
                          <TextField
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Enter password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            fullWidth
                            required
                            InputProps={{
                              sx: inputSx,
                              endAdornment: (
                                <InputAdornment position="end">
                                  <IconButton
                                    onClick={() => setShowPassword(!showPassword)}
                                    edge="end"
                                    size="small"
                                    sx={{ color: 'hsl(var(--muted-foreground))' }}
                                  >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                  </IconButton>
                                </InputAdornment>
                              ),
                            }}
                          />
                        </Box>

                        <Box sx={{ mb: 2.5 }}>
                          <Typography
                            sx={{
                              fontSize: '0.875rem',
                              fontWeight: 500,
                              color: 'hsl(var(--foreground))',
                              mb: 0.75,
                            }}
                          >
                            Confirm Password
                          </Typography>
                          <TextField
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder="Enter password again"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            fullWidth
                            required
                            InputProps={{
                              sx: inputSx,
                              endAdornment: (
                                <InputAdornment position="end">
                                  <IconButton
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    edge="end"
                                    size="small"
                                    sx={{ color: 'hsl(var(--muted-foreground))' }}
                                  >
                                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                  </IconButton>
                                </InputAdornment>
                              ),
                            }}
                          />
                        </Box>

                        <Button
                          type="submit"
                          variant="contained"
                          fullWidth
                          disabled={loading || !username.trim() || !password || !confirmPassword}
                          sx={{
                            py: 1.25,
                            borderRadius: 2,
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            textTransform: 'none',
                            bgcolor: '#FF6600',
                            color: '#FFFFFF',
                            boxShadow: '0 4px 14px rgba(255, 102, 0, 0.35)',
                            '&:hover': {
                              bgcolor: '#e65c00',
                            },
                          }}
                        >
                          {loading ? (
                            <CircularProgress size={22} sx={{ color: '#ffffff' }} />
                          ) : (
                            'Create Admin Account'
                          )}
                        </Button>

                        <Box sx={{ textAlign: 'center', mt: 2 }}>
                          <Button
                            onClick={() => {
                              setAuthMode('login');
                              setError('');
                            }}
                            size="small"
                            startIcon={<ArrowLeft size={14} />}
                            sx={{
                              textTransform: 'none',
                              fontSize: '0.8rem',
                              color: 'hsl(var(--muted-foreground))',
                              '&:hover': { color: 'hsl(var(--foreground))' },
                            }}
                          >
                            Back to Sign In
                          </Button>
                        </Box>
                      </motion.div>
                    ) : (
                      /* Standard Sign In / Register Mode */
                      <motion.div
                        key="credentials-step"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Box sx={{ mb: 2 }}>
                          <Typography
                            sx={{
                              fontSize: '0.875rem',
                              fontWeight: 500,
                              color: 'hsl(var(--foreground))',
                              mb: 0.75,
                            }}
                          >
                            {serverMode === 'cloud' && loginWithSSO
                              ? 'Work Email'
                              : serverMode === 'cloud' || isRegister
                              ? 'Email'
                              : isResetPasswordMode
                              ? 'Email or Username'
                              : 'Username or Email'}
                          </Typography>
                          <TextField
                            placeholder={
                              serverMode === 'cloud' && loginWithSSO
                                ? 'name@company.com'
                                : 'analyst@organization.com'
                            }
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            fullWidth
                            required
                            autoCapitalize="none"
                            autoCorrect="off"
                            autoComplete={serverMode === 'cloud' || isRegister ? 'email' : 'username'}
                            InputProps={{ sx: inputSx }}
                          />
                        </Box>

                        {!isResetPasswordMode && !loginWithSSO && (
                          <Box sx={{ mb: isRegister ? 2 : 2.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75, minHeight: 24 }}>
                              <Typography
                                sx={{
                                  fontSize: '0.875rem',
                                  fontWeight: 500,
                                  color: 'hsl(var(--foreground))',
                                }}
                              >
                                Password
                              </Typography>
                              {serverMode === 'cloud' && !isRegister && (
                                <Box
                                  component="button"
                                  type="button"
                                  onClick={() => {
                                    setIsResetPasswordMode(true);
                                    setError('');
                                    setResetEmailSent(false);
                                  }}
                                  sx={{
                                    p: 0,
                                    m: 0,
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    fontSize: '10px',
                                    lineHeight: 1,
                                    color: 'hsl(var(--muted-foreground))',
                                    fontWeight: 400,
                                    fontFamily: 'inherit',
                                    '&:hover': {
                                      color: 'hsl(var(--foreground))',
                                      textDecoration: 'underline',
                                    },
                                  }}
                                >
                                  Forgot password?
                                </Box>
                              )}
                            </Box>
                            <TextField
                              type={showPassword ? 'text' : 'password'}
                              placeholder={isRegister ? 'At least 10 characters' : 'Enter password'}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              fullWidth
                              required
                              autoComplete={isRegister ? 'new-password' : 'current-password'}
                              InputProps={{
                                sx: inputSx,
                                endAdornment: (
                                  <InputAdornment position="end">
                                    <IconButton
                                      onClick={() => setShowPassword(!showPassword)}
                                      edge="end"
                                      size="small"
                                      sx={{ color: 'hsl(var(--muted-foreground))' }}
                                    >
                                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </IconButton>
                                  </InputAdornment>
                                ),
                              }}
                            />
                          </Box>
                        )}

                        {isRegister && !isResetPasswordMode && (
                          <Box sx={{ mb: 2 }}>
                            <Typography
                              sx={{
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                color: 'hsl(var(--foreground))',
                                mb: 0.75,
                              }}
                            >
                              Confirm Password
                            </Typography>
                            <TextField
                              type={showConfirmPassword ? 'text' : 'password'}
                              placeholder="Enter password again"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              fullWidth
                              required
                              autoComplete="new-password"
                              InputProps={{
                                sx: inputSx,
                                endAdornment: (
                                  <InputAdornment position="end">
                                    <IconButton
                                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                      edge="end"
                                      size="small"
                                      sx={{ color: 'hsl(var(--muted-foreground))' }}
                                    >
                                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </IconButton>
                                  </InputAdornment>
                                ),
                              }}
                            />
                          </Box>
                        )}

                        {isRegister && (
                          <Box sx={{ mb: 2.5 }}>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  size="small"
                                  checked={termsAccepted}
                                  onChange={(e) => setTermsAccepted(e.target.checked)}
                                  sx={{
                                    color: '#FF6600',
                                    '&.Mui-checked': { color: '#FF6600' },
                                  }}
                                />
                              }
                              label={
                                <Typography sx={{ fontSize: '0.775rem', color: 'hsl(var(--muted-foreground))' }}>
                                  I agree to Shuffle's{' '}
                                  <a
                                    href="https://shuffler.io/docs/terms_of_service"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: '#FF6600', textDecoration: 'underline' }}
                                  >
                                    Terms of Service
                                  </a>
                                </Typography>
                              }
                            />
                          </Box>
                        )}

                        <Box
                          title={
                            !loading &&
                            !isResetPasswordMode &&
                            serverMode === 'self-hosted' &&
                            hostPingStatus !== 'success'
                              ? !customHostUrl.trim()
                                ? 'Enter your self-hosted Shuffle server URL and test the connection before signing in.'
                                : hostPingStatus === 'error'
                                ? 'The connection test failed. Fix the URL and test again before signing in.'
                                : 'Test the server connection before signing in.'
                              : undefined
                          }
                          sx={{ width: '100%' }}
                        >
                          <Button
                            type="submit"
                            variant="contained"
                            fullWidth
                            disabled={
                              serverMode === 'cloud' && loginWithSSO
                                ? ssoLoading || !username.trim() || !isValidEmail(username)
                                : loading ||
                                  (!isResetPasswordMode &&
                                    serverMode === 'self-hosted' &&
                                    hostPingStatus !== 'success') ||
                                  (isRegister && !termsAccepted)
                            }
                            sx={{
                              py: 1.25,
                              borderRadius: 2,
                              fontWeight: 700,
                              fontSize: '0.9rem',
                              textTransform: 'none',
                              bgcolor: '#FF6600',
                              color: '#FFFFFF',
                              boxShadow: '0 4px 14px rgba(255, 102, 0, 0.35)',
                              '&:hover': {
                                bgcolor: '#e65c00',
                              },
                              '&.Mui-disabled': {
                                bgcolor: 'hsl(var(--muted))',
                                color: 'hsl(var(--muted-foreground))',
                                boxShadow: 'none',
                              },
                            }}
                          >
                            {loading || ssoLoading ? (
                              <CircularProgress size={22} sx={{ color: '#ffffff' }} />
                            ) : isResetPasswordMode ? (
                              resetEmailSent ? 'Resend Reset Link' : 'Send Reset Link'
                            ) : serverMode === 'cloud' && loginWithSSO ? (
                              'Continue with SSO'
                            ) : isRegister ? (
                              'Create Account'
                            ) : (
                              'Sign In'
                            )}
                          </Button>
                        </Box>

                        {/* Switch back from Cloud SSO to Password login */}
                        {serverMode === 'cloud' && loginWithSSO && (
                          <Box sx={{ textAlign: 'center', mt: 1.5 }}>
                            <Button
                              variant="text"
                              size="small"
                              onClick={() => {
                                setLoginWithSSO(false);
                                setSsoError('');
                                setError('');
                              }}
                              sx={{
                                textTransform: 'none',
                                color: 'hsl(var(--muted-foreground))',
                                fontSize: '0.8rem',
                                fontWeight: 500,
                                '&:hover': {
                                  color: 'hsl(var(--foreground))',
                                  bgcolor: 'transparent',
                                  textDecoration: 'underline',
                                },
                              }}
                            >
                              Sign in with password instead
                            </Button>
                          </Box>
                        )}

                        {/* Cloud SSO Button */}
                        <AnimatePresence initial={false}>
                          {serverMode === 'cloud' && !isRegister && !loginWithSSO && (
                            <motion.div
                              key="cloud-sso-section"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                              style={{ overflow: 'hidden' }}
                            >
                                <Box sx={{ pt: 1.75 }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.75 }}>
                                    <Box sx={{ flex: 1, height: '1px', bgcolor: 'hsl(var(--border))' }} />
                                    <Typography variant="caption" sx={{ px: 1.5, color: 'hsl(var(--muted-foreground))', fontWeight: 500, fontSize: '0.75rem' }}>
                                      OR
                                    </Typography>
                                    <Box sx={{ flex: 1, height: '1px', bgcolor: 'hsl(var(--border))' }} />
                                  </Box>

                                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      onClick={() => {
                                        setLoginWithSSO(true);
                                        setPassword('');
                                        setError('');
                                        setSsoError('');
                                      }}
                                      sx={{
                                        height: 34,
                                        px: 2.5,
                                        borderRadius: 1.5,
                                        fontSize: '0.8125rem',
                                        fontWeight: 500,
                                        textTransform: 'none',
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))',
                                        bgcolor: 'hsl(var(--card))',
                                        transition: 'all 0.15s ease',
                                        '&:hover': {
                                          borderColor: '#FF6600',
                                          bgcolor: 'rgba(255, 102, 0, 0.05)',
                                        },
                                      }}
                                    >
                                      Sign in with SSO
                                    </Button>
                                  </Box>
                                </Box>
                              </motion.div>
                          )}
                        </AnimatePresence>

                        {/* On-Prem / Self-Hosted SSO Button */}
                        <AnimatePresence initial={false}>
                          {serverMode === 'self-hosted' && !isRegister && Boolean(instanceSsoUrl) && (
                            <motion.div
                              key="self-hosted-sso-section"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                              style={{ overflow: 'hidden' }}
                            >
                              <Box sx={{ pt: 1.75 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.75 }}>
                                  <Box sx={{ flex: 1, height: '1px', bgcolor: 'hsl(var(--border))' }} />
                                  <Typography variant="caption" sx={{ px: 1.5, color: 'hsl(var(--muted-foreground))', fontWeight: 500, fontSize: '0.75rem' }}>
                                    OR
                                  </Typography>
                                  <Box sx={{ flex: 1, height: '1px', bgcolor: 'hsl(var(--border))' }} />
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => {
                                      if (typeof window !== 'undefined') {
                                        if (from) sessionStorage.setItem('shuffle_redirect_after_login', from);
                                        window.location.href = instanceSsoUrl!;
                                      }
                                    }}
                                    sx={{
                                      height: 34,
                                      px: 2.5,
                                      borderRadius: 1.5,
                                      fontSize: '0.8125rem',
                                      fontWeight: 500,
                                      textTransform: 'none',
                                      borderColor: 'hsl(var(--border))',
                                      color: 'hsl(var(--foreground))',
                                      bgcolor: 'hsl(var(--card))',
                                      transition: 'all 0.15s ease',
                                      '&:hover': {
                                        borderColor: '#FF6600',
                                        bgcolor: 'rgba(255, 102, 0, 0.05)',
                                      },
                                    }}
                                  >
                                    Sign in with SSO
                                  </Button>
                                </Box>
                              </Box>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Footer / Login <-> Registration switch (Cloud only) */}
          <AnimatePresence initial={false}>
            {!mfaRequired && !isResetPasswordMode && !isAdminSetup && serverMode === 'cloud' && !loginWithSSO && (
              <motion.div
                key="cloud-footer-section"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                style={{ overflow: 'hidden' }}
              >
                <Box sx={{ textAlign: 'center', pt: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}>
                    {isRegister ? 'Already have an account?' : 'Do not have an account?'}{' '}
                    <Box
                      component="button"
                      type="button"
                      onClick={() => {
                        const next = isRegister ? 'login' : 'register';
                        setAuthMode(next);
                        setError('');
                        setNotice('');
                        setPassword('');
                      }}
                      sx={{
                        background: 'none',
                        border: 'none',
                        p: 0,
                        cursor: 'pointer',
                        font: 'inherit',
                        color: '#FF6600',
                        fontWeight: 600,
                      }}
                    >
                      {isRegister ? 'Sign in' : 'Sign up'}
                    </Box>
                  </Typography>
                </Box>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </Box>
    </Box>
  );
};

export default LoginPage;
