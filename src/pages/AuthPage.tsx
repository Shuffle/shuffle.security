import { Eye as VisibilityIcon, EyeOff as VisibilityOffIcon, ArrowLeft as ArrowLeftIcon } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation, Link } from '@/lib/router-compat';
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
  useTheme,
} from '@mui/material';
import { motion } from 'framer-motion';
import { getApiUrl, API_ENDPOINTS, getHostBaseUrl, isDevEnvironment, isCapacitorNative, shuffleFetch, isCloud } from '@/Shuffle-MCPs/api';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { useAuth } from '@/context/AuthContext';
import { trackPredefinedEvent, GA_EVENTS } from '@/lib/analytics';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useIsMobile } from '@/hooks/use-mobile';
import { ShuffleLogo } from '@/components/common/ShuffleLogo';
import { sanitizeInternalDestination } from '@/lib/safeRedirect';

interface AuthPageProps {
  mode: 'login' | 'register';
}

const AuthPage = ({ mode }: AuthPageProps) => {
  const theme = useTheme();
  const primaryColor = theme.palette.primary.main;

  usePageMeta({
    title: mode === 'register' ? 'Create your account' : 'Sign in',
    description: mode === 'register'
      ? 'Create your Shuffle Security account and start automating incident response across 3,000+ integrations.'
      : 'Sign in to Shuffle Security to manage incidents, alerts, and security automation.',
    url: mode === 'register' ? '/register' : '/login',
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [success, setSuccess] = useState(false);
  const [isResetPasswordMode, setIsResetPasswordMode] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [resetEmailSuccessMsg, setResetEmailSuccessMsg] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();

  const isLogin = mode === 'login';
  const isMobile = useIsMobile();

  // First login detection: if no explicit returnUrl and user has never logged in, go to onboarding
  const hasLoggedInBefore = localStorage.getItem('shuffle_has_logged_in') === 'true';
  // On mobile, successful logins should always land on the incident list.
  const defaultDestination = isLogin && isMobile
    ? '/incidents'
    : (hasLoggedInBefore ? '/dashboard' : '/onboarding');

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
    const returnUrlParam =
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

    const candidate = returnUrlParam || stateFrom || sessionRedirect || defaultDestination;
    return sanitizeInternalDestination(candidate, defaultDestination);
  }, [location.search, location.state, defaultDestination]);

  // Redirect if already authenticated (e.g., via API key).
  // Guarded with a ref: without it, a redirect target that bounces back to
  // /login re-triggers this effect on every render and blows the update depth.
  const hasRedirectedRef = useRef(false);
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    if (hasRedirectedRef.current) return;
    const target = (from || '/dashboard').split('?')[0];
    if (target === location.pathname) return;
    hasRedirectedRef.current = true;
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('shuffle_redirect_after_login');
      } catch {}
    }
    navigate(from, { replace: true });
  }, [isAuthenticated, authLoading, navigate, from, location.pathname]);

  // Clear form when switching modes
  useEffect(() => {
    setError('');
    setPassword('');
    setConfirmPassword('');
    setMfaRequired(false);
    setMfaCode('');
  }, [mode]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <Box 
        sx={{ 
          minHeight: '100vh', 
          bgcolor: 'background.default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress sx={{ color: 'primary.main' }} />
      </Box>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (isResetPasswordMode) {
      if (!username.trim()) {
        setError('Please enter your email or username.');
        return;
      }
      setLoading(true);
      setResetEmailSent(false);

      try {
        const res = await fetch(getApiUrl('/api/v1/users/passwordresetmail'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ username: username.trim() }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.reason || data.message || `Password reset request failed (status: ${res.status})`);
        }

        setResetEmailSent(true);
        setResetEmailSuccessMsg(
          data.reason ||
            `If an account exists for "${username.trim()}", a password reset link has been sent to your email.`
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error requesting password reset.';
        setError(msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Track auth attempt
    trackPredefinedEvent(isLogin ? GA_EVENTS.LOGIN_START : GA_EVENTS.REGISTER_START);

    if (!isLogin && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!isLogin && password.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }

    setLoading(true);

    try {
      const endpoint = isLogin ? API_ENDPOINTS.login : API_ENDPOINTS.register;
      const body: Record<string, string> = { username, password };
      
      if (mfaRequired && mfaCode) {
        body.mfa_code = mfaCode;
      }

      let response: Response;
      const apiUrl = getApiUrl(endpoint);
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      } catch (fetchError) {
        // fetch() throws TypeError on network/CORS errors — distinguish them
        const backendOrigin = new URL(apiUrl).origin;
        const isCrossOrigin = backendOrigin !== window.location.origin;
        if (isCrossOrigin) {
          throw new Error(
            `CORS error: The browser blocked the request to ${backendOrigin}. ` +
            `The backend must allow requests from ${window.location.origin}. ` +
            `Check that the server's CORS configuration includes this origin.`
          );
        }
        throw new Error(
          'Network error: Unable to reach the server. Please check your connection and that the backend is running.'
        );
      }

      let data: any;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error(`Server returned invalid response (status: ${response.status})`);
      }

      // 1. Handle SSO redirect (requires following to a separate website)
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
        throw new Error('Single Sign-On (SSO) is required, but no redirect URL was provided by the server.');
      }

      // 2. Handle MFA setup (/login/{url}/mfa-setup)
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
        throw new Error('Multi-factor authentication setup is required, but no setup token was provided.');
      }

      // 3. Handle standard MFA redirect (already set up)
      if (data.reason === 'MFA_REDIRECT' || data.message === 'MFA_REDIRECT' || data.mfa_required === true) {
        setMfaRequired(true);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data.reason || data.message || `${isLogin ? 'Login' : 'Registration'} failed (status: ${response.status})`);
      }

      // Extract session token from cookies array or direct field
      const sessionToken = data.session_token || 
        data.token ||
        data.cookies?.find((c: { key: string; value: string }) => c.key === 'session_token')?.value;

      if (sessionToken) {
        // Verify the session works before showing success.
        // Try standard cookie verification first (credentials: 'include').
        // If cookie is not working (e.g. strict cross-site blocking or native webview),
        // fall back to Authorization: Bearer <sessionToken>.
        let verifiedUserInfo: any = null;
        let authMode: 'cookie' | 'bearer' = 'cookie';

        try {
          // 1. First attempt: standard cookie verification
          const cookieResponse = await fetch(getApiUrl('/api/v1/getinfo'), {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (cookieResponse.ok) {
            const data = await cookieResponse.json().catch(() => null);
            if (data?.success === true) {
              verifiedUserInfo = data;
              authMode = 'cookie';
            }
          }
        } catch {
          // Cookie verification network error, try fallback
        }

        // 2. If cookie verification didn't succeed, fallback to Bearer token
        if (!verifiedUserInfo) {
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
              const data = await bearerResponse.json().catch(() => null);
              if (data?.success === true) {
                verifiedUserInfo = data;
                authMode = 'bearer';
              }
            }
          } catch {
            // Bearer fallback failed
          }
        }

        if (!verifiedUserInfo) {
          throw new Error('Login succeeded but session verification failed. Please try again.');
        }

        localStorage.setItem('shuffle_auth_mode', authMode);
        setSuccess(true);
        setLoading(false);
        trackPredefinedEvent(GA_EVENTS.LOGIN_SUCCESS);
        const wasFirstLogin = !hasLoggedInBefore;
        localStorage.setItem('shuffle_has_logged_in', 'true');
        // Persist session token as fallback and complete login
        const accepted = await login(sessionToken, verifiedUserInfo);
        if (!accepted) {
          throw new Error('Login succeeded but session verification failed. Please try again.');
        }


        // Determine post-login destination: honor explicit returnUrl if set.
        // Otherwise, if no incidents exist for this org, send to /dashboard.
        let destination = from;
        const hasExplicitReturn = Boolean(from && from !== defaultDestination);
        if (!isMobile && !hasExplicitReturn && !wasFirstLogin) {
          try {
            // Reuse the verified session info — no extra getinfo request.
            const orgId = verifiedUserInfo?.active_org?.id;
            if (orgId) {
              const incRes = await shuffleFetch(
                getApiUrl(`/api/v1/orgs/${orgId}/list_cache?category=shuffle-security_incidents&top=1`),
                { method: 'GET', headers: { 'Content-Type': 'application/json' } },
              );

              if (incRes.ok) {
                const incData = await incRes.json();
                const items = incData?.keys || incData?.list || incData?.items || [];
                if (!Array.isArray(items) || items.length === 0) {
                  destination = '/dashboard';
                }
              }
            }
          } catch (err) {
            console.warn('Post-login incident check failed, using default destination', err);
          }
        }

        if (typeof window !== 'undefined') {
          try {
            sessionStorage.removeItem('shuffle_redirect_after_login');
          } catch {}
        }

        setTimeout(() => {
          navigate(destination, { replace: true });
        }, 1500);
        return;
      } else if (!isLogin) {
        // Registration successful, redirect to login (preserve returnUrl so post-login lands the user back)
        trackPredefinedEvent(GA_EVENTS.REGISTER_SUCCESS);
        const loginPath = from && from !== defaultDestination
          ? `/login?view=${encodeURIComponent(from)}`
          : '/login';
        navigate(loginPath, { state: { message: 'Registration successful. Please log in.' } });
      } else {
        throw new Error('Login failed: No session token received');
      }
    } catch (err) {
      trackPredefinedEvent(isLogin ? GA_EVENTS.LOGIN_FAILURE : GA_EVENTS.LOGIN_FAILURE, 
        err instanceof Error ? err.message : 'unknown_error');
      setError(err instanceof Error ? err.message : `An error occurred during ${isLogin ? 'login' : 'registration'}`);
      if (mfaRequired) {
        setMfaCode('');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: 'background.paper',
      '& fieldset': {
        borderColor: 'divider',
      },
      '&:hover fieldset': {
        borderColor: 'primary.main',
      },
      '&.Mui-focused fieldset': {
        borderColor: 'primary.main',
      },
    },
    '& .MuiInputBase-input': {
      color: 'text.primary',
      '&::placeholder': {
        color: 'text.disabled',
        opacity: 1,
      },
    },
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <LandingNavbar />
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'center',
          p: { xs: 2, sm: 3 },
          pt: { xs: 'max(6rem, calc(4.5rem + env(safe-area-inset-top, 20px)))', sm: 3 },
          pb: { xs: 'calc(2rem + env(safe-area-inset-bottom, 0px))', sm: 3 },
          mt: { xs: 0, sm: -6 },
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          key={mode}
          style={{ width: '100%', maxWidth: 440 }}
        >
          <Card
            sx={{
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
            }}
          >
            <CardContent sx={{ p: { xs: 3, sm: 5 } }}>
              {/* Logo */}
              <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    mx: 'auto',
                    mb: 3,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ShuffleLogo size={56} color={primaryColor} />
                </Box>
                <Typography
                  variant="h5"
                  component="h1"

                  sx={{
                    fontWeight: 600,
                    color: 'text.primary',
                    mb: 1,
                  }}
                >
                  {isLogin ? 'Welcome Back!' : 'Create Account'}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    lineHeight: 1.6,
                  }}
                >
                  {isLogin 
                    ? 'Sign in to manage your cases and alerts' 
                    : 'Get started with your security operations'
                  }
                </Typography>
              </Box>

              {success && (
                <Alert
                  severity="success"
                  sx={{
                    mb: 3,
                    bgcolor: 'success.main',
                    color: 'success.contrastText',
                    opacity: 0.9,
                    '& .MuiAlert-icon': { color: 'inherit' },
                  }}
                >
                  Login successful! Redirecting...
                </Alert>
              )}

              {mfaRequired && !success && (
                <Alert
                  severity="info"
                  sx={{
                    mb: 3,
                    bgcolor: (t) => `${t.palette.primary.main}14`,
                    color: 'primary.main',
                    border: '1px solid',
                    borderColor: (t) => `${t.palette.primary.main}4D`,
                    '& .MuiAlert-icon': { color: 'primary.main' },
                  }}
                >
                  Two-factor authentication required
                </Alert>
              )}

              {error && (
                <Alert
                  severity="error"
                  sx={{
                    mb: 3,
                    bgcolor: (t) => `${t.palette.error.main}14`,
                    color: 'error.main',
                    border: '1px solid',
                    borderColor: (t) => `${t.palette.error.main}4D`,
                    '& .MuiAlert-icon': { color: 'error.main' },
                  }}
                >
                  {error}
                </Alert>
              )}

              {resetEmailSent && (
                <Alert
                  severity="success"
                  sx={{
                    mb: 3,
                    bgcolor: 'rgba(34, 197, 94, 0.1)',
                    color: '#22c55e',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                    '& .MuiAlert-icon': { color: '#22c55e' },
                  }}
                >
                  {resetEmailSuccessMsg}
                </Alert>
              )}

              <Box component="form" onSubmit={handleSubmit}>
                {isResetPasswordMode && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                      Enter the email address or username associated with your account, and we will send you a password reset link.
                    </Typography>
                  </Box>
                )}

                <Box sx={{ mb: 2.5 }}>
                  <Typography
                    component="label"
                    sx={{
                      display: 'block',
                      mb: 1,
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: 'text.primary',
                    }}
                  >
                    {isResetPasswordMode ? 'Email or Username' : 'Email'}
                  </Typography>
                  <TextField
                    type="text"
                    placeholder="username@example.com"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    fullWidth
                    required
                    disabled={loading}
                    autoComplete="email"
                    inputProps={{ inputMode: 'email', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }}
                    sx={inputSx}
                  />
                </Box>

                {!isResetPasswordMode && (
                  <Box sx={{ mb: isLogin ? 4 : 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Typography
                        component="label"
                        sx={{
                          display: 'block',
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          color: 'text.primary',
                        }}
                      >
                        Password
                      </Typography>
                      {isLogin && isCloud() && (
                        <Button
                          onClick={() => {
                            setIsResetPasswordMode(true);
                            setError('');
                            setResetEmailSent(false);
                          }}
                          size="small"
                          sx={{
                            p: 0,
                            minWidth: 0,
                            fontSize: '0.75rem',
                            textTransform: 'none',
                            color: 'primary.main',
                            fontWeight: 500,
                            '&:hover': {
                              bgcolor: 'transparent',
                              textDecoration: 'underline',
                            },
                          }}
                        >
                          Forgot password?
                        </Button>
                      )}
                    </Box>
                    <TextField
                      type={showPassword ? 'text' : 'password'}
                      placeholder="at least 10 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      fullWidth
                      required
                      disabled={loading}
                      autoComplete={isLogin ? 'current-password' : 'new-password'}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowPassword(!showPassword)}
                              edge="end"
                              aria-label={showPassword ? 'Hide password' : 'Show password'}
                              sx={{ color: 'text.secondary' }}
                            >
                              {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                      sx={inputSx}
                    />
                  </Box>
                )}

                {!isLogin && !isResetPasswordMode && (
                  <Box sx={{ mb: 4 }}>
                    <Typography
                      component="label"
                      sx={{
                        display: 'block',
                        mb: 1,
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        color: 'text.primary',
                      }}
                    >
                      Confirm Password
                    </Typography>
                    <TextField
                      type={showPassword ? 'text' : 'password'}
                      placeholder="re-enter your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      fullWidth
                      required
                      disabled={loading}
                      autoComplete="new-password"
                      sx={inputSx}
                    />
                  </Box>
                )}

                {mfaRequired && !isResetPasswordMode && (
                  <Box sx={{ mb: 4 }}>
                    <Typography
                      component="label"
                      sx={{
                        display: 'block',
                        mb: 1,
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        color: 'text.primary',
                      }}
                    >
                      MFA Code
                    </Typography>
                    <TextField
                      type="text"
                      placeholder="Enter your MFA code"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      fullWidth
                      required
                      autoFocus
                      disabled={loading}
                      inputProps={{ 
                        maxLength: 6,
                        inputMode: 'numeric',
                        pattern: '[0-9]*'
                      }}
                      sx={inputSx}
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        mt: 1,
                        color: 'text.secondary',
                      }}
                    >
                      Enter the code from your authenticator app
                    </Typography>
                  </Box>
                )}

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  fullWidth
                  disabled={loading}
                  sx={{
                    py: 1.5,
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    fontWeight: 600,
                    textTransform: 'none',
                    fontSize: '1rem',
                    '&:hover': {
                      bgcolor: 'primary.dark',
                    },
                    '&.Mui-disabled': {
                      bgcolor: 'action.disabledBackground',
                      color: 'text.disabled',
                    },
                  }}
                >
                  {loading ? (
                    <CircularProgress size={24} color="inherit" />
                  ) : isResetPasswordMode ? (
                    resetEmailSent ? 'Resend Reset Link' : 'Send Reset Link'
                  ) : isLogin ? (
                    'Continue'
                  ) : (
                    'Create Account'
                  )}
                </Button>

                {isResetPasswordMode && (
                  <Box sx={{ textAlign: 'center', mt: 2 }}>
                    <Button
                      onClick={() => {
                        setIsResetPasswordMode(false);
                        setResetEmailSent(false);
                        setError('');
                      }}
                      size="small"
                      startIcon={<ArrowLeftIcon size={14} />}
                      sx={{
                        textTransform: 'none',
                        fontSize: '0.875rem',
                        color: 'text.secondary',
                        '&:hover': { color: 'text.primary' },
                      }}
                    >
                      Back to Sign In
                    </Button>
                  </Box>
                )}
              </Box>

              {!isResetPasswordMode && (
                <Typography
                  variant="body2"
                  sx={{
                    textAlign: 'center',
                    mt: 4,
                    color: 'text.secondary',
                  }}
                >
                  {isLogin ? 'Do not have an account yet? ' : 'Already have an account? '}
                  <Link
                    to={isLogin ? '/register' : '/login'}
                    style={{
                      color: 'hsl(var(--primary))',
                      textDecoration: 'none',
                      fontWeight: 500,
                    }}
                  >
                    {isLogin ? 'Register here' : 'Sign in'}
                  </Link>
                </Typography>
              )}

            </CardContent>
          </Card>
        </motion.div>
      </Box>
    </Box>
  );
};

export default AuthPage;
