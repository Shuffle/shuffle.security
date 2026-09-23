import React, { useEffect, useState, useMemo } from 'react';
import {
  Paper,
  Typography,
  Box,
  CircularProgress,
  TextField,
  Button,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import { Copy, Check, ShieldCheck, ArrowLeft, KeyRound } from 'lucide-react';
import { useNavigate, useLocation, Link } from '@/lib/router-compat';
import { getHostBaseUrl } from '@/Shuffle-MCPs/api';
import { ShuffleCompanyLogo } from '@/components/common/ShuffleLogo';
import { sanitizeInternalDestination } from '@/lib/safeRedirect';

export interface MFASetupProps {
  isLoaded?: boolean;
  globalUrl?: string;
  token?: string;
  setCookie?: (key: string, value: string, options?: Record<string, unknown>) => void;
}

export const MFASetUP: React.FC<MFASetupProps> = ({
  isLoaded = true,
  globalUrl: globalUrlProp,
  token: tokenProp,
  setCookie,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [image2FA, setImage2FA] = useState('');
  const [secret2FA, setSecret2FA] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Determine base API URL
  const resolvedBaseUrl = useMemo(() => {
    if (globalUrlProp && globalUrlProp.trim()) {
      return globalUrlProp.trim().replace(/\/+$/, '');
    }
    const host = getHostBaseUrl();
    if (host && host.trim()) {
      return host.trim().replace(/\/+$/, '');
    }
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return '';
  }, [globalUrlProp]);

  // Extract token from prop, route params, or pathname: /login/:url/mfa-setup
  const mfaToken = useMemo(() => {
    if (tokenProp && tokenProp.trim()) {
      return tokenProp.trim();
    }
    if (typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/').filter(Boolean);
      // Expected pathname structure: ["login", "<token>", "mfa-setup"]
      if (parts.length >= 3 && parts[0] === 'login' && parts[2] === 'mfa-setup') {
        return parts[1];
      }
      if (parts.length >= 2 && parts[0] === 'login') {
        return parts[1];
      }
    }
    return '';
  }, [tokenProp, location.pathname]);

  // Read view parameter, strictly staying within the platform
  const destination = useMemo(() => {
    const rawSearch = location.search || (typeof window !== 'undefined' ? window.location.search : '');
    const cleanSearch = rawSearch.startsWith('?') ? rawSearch : rawSearch ? `?${rawSearch}` : '';
    const params = new URLSearchParams(cleanSearch);
    const viewParam = params.get('view') || params.get('redirect') || params.get('redirect_to');
    return sanitizeInternalDestination(viewParam, '/dashboard');
  }, [location.search]);

  // Fetch the 2FA secret and QR code from backend
  const handleGet2FACode = async () => {
    if (!mfaToken) {
      setError('MFA setup token is missing or invalid.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${resolvedBaseUrl}/api/v1/users/${encodeURIComponent(mfaToken)}/get2fa`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
      });

      if (res.status === 404) {
        setError('MFA setup session expired or user not found. Redirecting to login...');
        setTimeout(() => {
          navigate('/login', { replace: true });
        }, 2500);
        return;
      }

      if (!res.ok) {
        throw new Error(`Failed to retrieve MFA details (status: ${res.status})`);
      }

      const data = await res.json();
      if (data.success === true) {
        setImage2FA(data.reason || '');
        setSecret2FA(data.extra || '');
      } else {
        setError(data.reason || data.message || 'Failed to generate 2FA secret.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error loading MFA secret.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoaded && mfaToken) {
      handleGet2FACode();
    }
  }, [isLoaded, mfaToken]);

  const handleCopySecret = () => {
    if (!secret2FA) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(secret2FA).catch(() => {});
      }
    } catch {}
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  // Verify entered 6-digit code
  const handleVerify2FA = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!mfaToken) return;

    const trimmedCode = code.trim();
    if (trimmedCode.length !== 6) {
      setError('Please enter a valid 6-digit verification code.');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      const payload = {
        code: trimmedCode,
        changeMFAActive: true,
      };

      const res = await fetch(`${resolvedBaseUrl}/api/v1/users/${encodeURIComponent(mfaToken)}/set2fa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (res.status === 500 || res.status === 400 || res.status === 401) {
        setError('Invalid verification code. Please check your authenticator app and try again.');
        return;
      }

      const responseJson = await res.json().catch(() => ({}));

      if (responseJson.success === true) {
        setSuccess('Multi-factor authentication successfully configured! Signing in...');

        // Save session cookies
        if (Array.isArray(responseJson.cookies)) {
          for (const item of responseJson.cookies) {
            if (setCookie) {
              setCookie(item.key, item.value, { path: '/' });
            } else if (typeof document !== 'undefined') {
              document.cookie = `${item.key}=${encodeURIComponent(item.value)}; path=/; SameSite=Lax`;
            }
          }
        }

        // Save session token if returned
        const sessionToken =
          responseJson.session_token ||
          responseJson.cookies?.find((c: { key: string; value: string }) => c.key === 'session_token')?.value;

        if (sessionToken && typeof window !== 'undefined') {
          try {
            localStorage.setItem('session_token', sessionToken);
          } catch {}
        }

        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('shuffle_has_logged_in', 'true');
            sessionStorage.removeItem('shuffle_redirect_after_login');
          } catch {}
        }

        // Redirect safely within the platform
        setTimeout(() => {
          navigate(destination, { replace: true });
        }, 1500);
      } else {
        setError(responseJson.reason || responseJson.message || 'Failed to verify code. Please try again.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error verifying 2FA code.';
      setError(msg);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
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
          p: { xs: 3, sm: 4 },
          borderRadius: 4,
          border: '1px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--card))',
          boxShadow: '0 20px 40px -15px rgba(0,0,0,0.3)',
        }}
      >
        {/* Brand Header */}
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 2,
            }}
          >
            <ShuffleCompanyLogo size={44} />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}>
            <KeyRound size={20} color="hsl(var(--primary))" />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'hsl(var(--foreground))' }}>
              Set Up Multi-Factor Auth
            </Typography>
          </Box>

          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>
            Scan the QR code with your authenticator app to secure your Shuffle account.
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2, fontSize: '0.85rem' }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2.5, borderRadius: 2, fontSize: '0.85rem' }}>
            {success}
          </Alert>
        )}

        {/* QR Code and Secret Key Section */}
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 5 }}>
            <CircularProgress size={36} sx={{ color: 'hsl(var(--primary))', mb: 2 }} />
            <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              Generating secure authenticator key...
            </Typography>
          </Box>
        ) : (
          <>
            {image2FA ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  p: 2,
                  mb: 2.5,
                  borderRadius: 2.5,
                  bgcolor: 'hsl(var(--muted) / 0.3)',
                  border: '1px solid hsl(var(--border))',
                }}
              >
                <Box
                  component="img"
                  src={image2FA}
                  alt="MFA QR Code"
                  sx={{
                    width: 190,
                    height: 190,
                    borderRadius: 2,
                    bgcolor: '#FFFFFF',
                    p: 1.5,
                    border: '1px solid hsl(var(--border))',
                    objectFit: 'contain',
                    mb: 1.5,
                  }}
                />

                {secret2FA && (
                  <Box
                    sx={{
                      width: '100%',
                      p: 1.25,
                      borderRadius: 1.5,
                      bgcolor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                    }}
                  >
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block', fontSize: '0.7rem' }}>
                        Can't scan? Enter this code manually:
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          wordBreak: 'break-all',
                          color: 'hsl(var(--foreground))',
                        }}
                      >
                        {secret2FA}
                      </Typography>
                    </Box>

                    <Tooltip title={copiedSecret ? 'Copied key!' : 'Copy key'}>
                      <IconButton size="small" onClick={handleCopySecret} sx={{ color: 'hsl(var(--foreground))' }}>
                        {copiedSecret ? <Check size={16} color="#22C55E" /> : <Copy size={16} />}
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </Box>
            ) : null}

            {/* Verification Form */}
            <Box component="form" onSubmit={handleVerify2FA} sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))', mb: 0.75 }}>
                Verification Code
              </Typography>
              <TextField
                fullWidth
                size="small"
                placeholder="6-digit code (e.g. 123456)"
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setCode(val);
                  if (val.length === 6) {
                    // Auto-submit when 6 digits are typed
                    handleVerify2FA();
                  }
                }}
                disabled={verifying}
                autoFocus
                inputProps={{
                  maxLength: 6,
                  inputMode: 'numeric',
                  pattern: '[0-9]*',
                  style: {
                    textAlign: 'center',
                    fontSize: '1.25rem',
                    letterSpacing: '0.3em',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                  },
                }}
                sx={{
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    bgcolor: 'hsl(var(--background))',
                    borderRadius: 2,
                  },
                }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={code.length !== 6 || verifying}
                startIcon={<ShieldCheck size={18} />}
                sx={{
                  py: 1.2,
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  borderRadius: 2,
                  bgcolor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
                }}
              >
                {verifying ? (
                  <CircularProgress size={20} sx={{ color: 'hsl(var(--primary-foreground))' }} />
                ) : (
                  'Verify & Enable 2FA'
                )}
              </Button>
            </Box>
          </>
        )}

        {/* Back to Login Link */}
        <Box sx={{ textAlign: 'center', pt: 1, borderTop: '1px solid hsl(var(--border))' }}>
          <Button
            component={Link}
            to="/login"
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
      </Paper>
    </Box>
  );
};

export default MFASetUP;
