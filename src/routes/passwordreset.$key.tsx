import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
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
} from '@mui/material';
import {
  Eye as VisibilityIcon,
  EyeOff as VisibilityOffIcon,
  KeyRound,
  ShieldCheck,
  ArrowLeft,
} from 'lucide-react';
import { routeMeta } from '@/lib/routeMeta';
import { useNavigate, Link } from '@/lib/router-compat';
import { getApiUrl } from '@/Shuffle-Core/api';
import { ShuffleCompanyLogo } from '@/components/common/ShuffleLogo';
import { LandingNavbar } from '@/components/landing/LandingNavbar';

export const Route = createFileRoute('/passwordreset/$key')({
  head: () =>
    routeMeta({
      title: 'Reset Password',
      description: 'Reset your Shuffle Security account password.',
      url: '/passwordreset/$key',
      noindex: true,
    }),
  component: PasswordResetPage,
});

function PasswordResetPage() {
  const { key } = Route.useParams();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const referenceKey = key || (typeof window !== 'undefined' ? window.location.pathname.split('/')[2] : '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!referenceKey) {
      setError('Invalid or missing password reset token.');
      return;
    }

    if (newPassword.length < 10) {
      setError('Password must be at least 10 characters.');
      return;
    }

    if (newPassword !== newPassword2) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        newpassword: newPassword,
        newpassword2: newPassword2,
        reference: referenceKey,
      };

      let res = await fetch(getApiUrl('/api/v1/users/passwordreset'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      // Typo fallback if backend uses /apiv1 instead of /api/v1
      if (res.status === 404) {
        const altRes = await fetch(getApiUrl('/apiv1/users/passwordreset'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(payload),
        }).catch(() => null);

        if (altRes && altRes.status !== 404) {
          res = altRes;
        }
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.reason || data.message || `Password reset failed (status: ${res.status})`);
      }

      setSuccess('Your password has been reset successfully! Redirecting to sign in...');
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while resetting your password.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'hsl(var(--background))', position: 'relative' }}>
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <LandingNavbar />
      </Box>
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'hsl(var(--background))',
          p: { xs: 2, sm: 3 },
          pt: { xs: 2, sm: 3, md: 'max(6rem, 80px)' },
          pb: { xs: 2, sm: 3, md: 5 },
        }}
      >
        <Box style={{ width: '100%', maxWidth: 'min(440px, 100%)', boxSizing: 'border-box' }}>
        {/* Brand Header */}
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Box
            sx={{
              display: 'inline-flex',
              p: 0.5,
              borderRadius: 3,
              mb: 1.5,
              boxShadow: '0 8px 24px rgba(255, 102, 0, 0.2)',
            }}
          >
            <ShuffleCompanyLogo size={56} />
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
            Set New Password
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'hsl(var(--muted-foreground))',
              fontSize: '0.825rem',
              mt: 0.5,
            }}
          >
            Enter a strong new password for your Shuffle account.
          </Typography>
        </Box>

        {/* Card */}
        <Card
          sx={{
            bgcolor: 'hsl(var(--card))',
            borderRadius: 3,
            border: '1px solid hsl(var(--border))',
            boxShadow: '0 12px 36px rgba(0,0,0,0.15)',
            overflow: 'hidden',
          }}
        >
          <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
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

            {success && (
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
                {success}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit}>
              <Box sx={{ mb: 2 }}>
                <Typography
                  sx={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'hsl(var(--foreground))',
                    mb: 0.75,
                  }}
                >
                  New Password
                </Typography>
                <TextField
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 10 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  fullWidth
                  required
                  size="small"
                  autoComplete="new-password"
                  disabled={loading || !!success}
                  InputProps={{
                    sx: {
                      bgcolor: 'hsl(var(--background))',
                      color: 'hsl(var(--foreground))',
                      borderRadius: 2,
                      fontSize: '0.875rem',
                      '& input': { color: 'hsl(var(--foreground))' },
                      '& input::placeholder': { color: 'hsl(var(--muted-foreground))', opacity: 0.8 },
                      '& fieldset': { borderColor: 'hsl(var(--border))' },
                      '&:hover fieldset': { borderColor: '#FF6600' },
                      '&.Mui-focused fieldset': { borderColor: '#FF6600' },
                    },
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          size="small"
                          sx={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                          {showPassword ? <VisibilityOffIcon size={18} /> : <VisibilityIcon size={18} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>

              <Box sx={{ mb: 2.5 }}>
                <Typography
                  sx={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'hsl(var(--foreground))',
                    mb: 0.75,
                  }}
                >
                  Confirm New Password
                </Typography>
                <TextField
                  type={showPassword2 ? 'text' : 'password'}
                  placeholder="Repeat new password"
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  fullWidth
                  required
                  size="small"
                  autoComplete="new-password"
                  disabled={loading || !!success}
                  InputProps={{
                    sx: {
                      bgcolor: 'hsl(var(--background))',
                      color: 'hsl(var(--foreground))',
                      borderRadius: 2,
                      fontSize: '0.875rem',
                      '& input': { color: 'hsl(var(--foreground))' },
                      '& input::placeholder': { color: 'hsl(var(--muted-foreground))', opacity: 0.8 },
                      '& fieldset': { borderColor: 'hsl(var(--border))' },
                      '&:hover fieldset': { borderColor: '#FF6600' },
                      '&.Mui-focused fieldset': { borderColor: '#FF6600' },
                    },
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword2(!showPassword2)}
                          edge="end"
                          size="small"
                          sx={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                          {showPassword2 ? <VisibilityOffIcon size={18} /> : <VisibilityIcon size={18} />}
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
                disabled={loading || !newPassword || !newPassword2 || !!success}
                startIcon={<ShieldCheck size={18} />}
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
                {loading ? <CircularProgress size={22} sx={{ color: '#ffffff' }} /> : 'Update Password'}
              </Button>
            </Box>

            <Box sx={{ textAlign: 'center', pt: 2, mt: 2, borderTop: '1px solid hsl(var(--border))' }}>
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
          </CardContent>
        </Card>
      </Box>
    </Box>
  </Box>
  );
}

export default PasswordResetPage;
