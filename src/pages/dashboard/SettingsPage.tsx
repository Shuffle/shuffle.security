import { useState, useEffect } from 'react';
import { useNavigate } from '@/lib/router-compat';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Alert,
  Avatar,
  Divider,
  TextField,
  IconButton,
  InputAdornment,
} from '@mui/material';
import { LogOut, Eye, EyeOff, Sun, Moon, Monitor } from 'lucide-react';
import { getApiUrl, getAuthHeader, API_CONFIG } from '@/Shuffle-Core/api';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useIsSupport } from '@/hooks/useIsSupport';
import { trackPredefinedEvent, GA_EVENTS } from '@/lib/analytics';
import { usePageMeta } from '@/hooks/usePageMeta';
import { PagerNotificationSettings } from '@/components/settings/PagerNotificationSettings';
import { DiagnosticsLogsCard } from '@/components/settings/DiagnosticsLogsCard';

// Settings types

interface Settings {
  username?: string;
  id?: string;
  active_org?: {
    name: string;
    id: string;
  };
  apikey?: string;
}

const SettingsPage = () => {
  usePageMeta({
    title: 'Settings',
    description: 'User, account, and on-call pager notification settings.',
    url: '/settings',
  });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const { sessionToken, logout, userInfo } = useAuth();
  const { theme: currentTheme, setTheme } = useTheme();
  const isSupport = useIsSupport();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch(getApiUrl('/api/v1/getsettings'), {
          credentials: 'include',
          headers: {
            ...getAuthHeader(),
          },
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.reason || 'Failed to fetch settings');
        }

        const data = await response.json();
        setSettings(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch settings');
        if (userInfo) {
          setSettings({
            username: userInfo.username,
            id: userInfo.id,
            active_org: userInfo.active_org,
          });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [sessionToken, userInfo]);

  const handleLogout = async () => {
    trackPredefinedEvent(GA_EVENTS.LOGOUT);
    await logout();
    API_CONFIG.setApiKey(null);
    navigate('/login', { replace: true });
  };

  const passwordValid = newPw.length > 10 && confirmPw.length > 10 && newPw === confirmPw;

  const handleChangePassword = async () => {
    if (!passwordValid || !currentPw) return;
    setPwMsg('');
    setPwLoading(true);
    try {
      const username = settings?.username || userInfo?.username || '';
      const response = await fetch(getApiUrl('/api/v1/passwordchange'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          currentpassword: currentPw,
          newpassword: newPw,
          newpassword2: confirmPw,
          username,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.reason || data.message || 'Failed to change password');
      }
      setPwMsg('Password updated successfully.');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      setPwMsg(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  const getUserInitial = () => {
    const name = settings?.username || userInfo?.username;
    if (name) {
      return name.charAt(0).toUpperCase();
    }
    return 'U';
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 4 }, maxWidth: 1100, width: '100%', mx: 'auto' }}>
      <Typography
        variant="h4"
        sx={{
          fontWeight: 700,
          mb: 0.5,
          color: 'hsl(var(--foreground))',
          fontSize: { xs: '1.4rem', sm: '2.125rem' },
        }}
      >
        Settings
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: 'hsl(var(--muted-foreground))',
          mb: { xs: 2.5, sm: 4 },
        }}
      >
        Manage your user profile, on-call pager calling preferences, and security credentials.
      </Typography>

      {error && (
        <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress sx={{ color: 'hsl(var(--primary))' }} />
        </Box>
      ) : (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            alignItems: 'stretch',
          }}
        >
          {/* Left Column: Account Profile & Actions */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Paper
              sx={{
                p: 3,
                bgcolor: 'transparent', backgroundImage: 'none', backdropFilter: 'blur(12px)',
                border: '1px solid hsl(var(--border))',
                borderRadius: 3,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, mb: 3 }}>
                <Avatar
                  sx={{
                    width: 52,
                    height: 52,
                    bgcolor: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary-foreground))',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                  }}
                >
                  {getUserInitial()}
                </Avatar>
                <Box>
                  <Typography
                    variant="subtitle1"
                    sx={{ color: 'hsl(var(--foreground))', fontWeight: 700 }}
                  >
                    {settings?.username || userInfo?.username || 'User'}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem' }}
                  >
                    {settings?.active_org?.name || userInfo?.active_org?.name || 'No organization'}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ borderColor: 'hsl(var(--border))', mb: 3 }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Button
                  variant="outlined"
                  onClick={handleLogout}
                  startIcon={<LogOut size={16} />}
                  sx={{
                    height: 40,
                    fontSize: '0.825rem',
                    textTransform: 'none',
                    borderColor: 'rgba(239, 68, 68, 0.4)',
                    color: '#EF4444',
                    bgcolor: 'rgba(239, 68, 68, 0.05)',
                    '&:hover': {
                      borderColor: '#EF4444',
                      bgcolor: 'rgba(239, 68, 68, 0.15)',
                    },
                  }}
                >
                  Sign Out
                </Button>
              </Box>
            </Paper>

          </Box>

          {/* Right Column: Appearance, Notifications, Password & Diagnostics */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Paper
              sx={{
                p: 3,
                bgcolor: 'transparent', backgroundImage: 'none', backdropFilter: 'blur(12px)',
                border: '1px solid hsl(var(--border))',
                borderRadius: 3,
              }}
            >
              <Typography
                variant="subtitle1"
                sx={{ color: 'hsl(var(--foreground))', fontWeight: 700, mb: 0.5 }}
              >
                Appearance
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem', mb: 2 }}
              >
                Choose your preferred interface theme.
              </Typography>

              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
                {([
                  { value: 'dark' as const, label: 'Dark', icon: <Moon size={16} /> },
                  { value: 'light' as const, label: 'Light', icon: <Sun size={16} /> },
                  { value: 'system' as const, label: 'System', icon: <Monitor size={16} /> },
                ]).map(({ value, label, icon }) => {
                  const isSelected = currentTheme === value;
                  return (
                    <Button
                      key={value}
                      onClick={() => setTheme(value)}
                      variant={isSelected ? 'contained' : 'outlined'}
                      startIcon={icon}
                      sx={{
                        py: 1,
                        textTransform: 'none',
                        fontSize: '0.85rem',
                        fontWeight: isSelected ? 600 : 400,
                        borderRadius: 2,
                        borderColor: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                        bgcolor: isSelected ? 'hsl(var(--primary))' : 'transparent',
                        color: isSelected ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
                        '&:hover': {
                          bgcolor: isSelected ? 'hsl(var(--primary) / 0.9)' : 'hsl(var(--muted))',
                          borderColor: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                        },
                      }}
                    >
                      {label}
                    </Button>
                  );
                })}
              </Box>
            </Paper>

            <PagerNotificationSettings />

            <Paper
              sx={{
                p: 3,
                bgcolor: 'transparent', backgroundImage: 'none', backdropFilter: 'blur(12px)',
                border: '1px solid hsl(var(--border))',
                borderRadius: 3,
              }}
            >
              <Typography
                variant="subtitle1"
                sx={{ color: 'hsl(var(--foreground))', fontWeight: 700, mb: 0.5 }}
              >
                Change Password
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem', mb: 2 }}
              >
                Update the password for your Shuffle account.
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
                <TextField
                  label="Current password"
                  type={showCurrentPw ? 'text' : 'password'}
                  size="small"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  fullWidth
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            edge="end"
                            size="small"
                            aria-label={showCurrentPw ? 'Hide current password' : 'Show current password'}
                            onClick={() => setShowCurrentPw((s) => !s)}
                            sx={{ color: 'hsl(var(--muted-foreground))' }}
                          >
                            {showCurrentPw ? <EyeOff size={18} /> : <Eye size={18} />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                  sx={{
                    '& .MuiInputBase-input': { fontSize: '0.85rem' },
                    '& .MuiInputLabel-root': { fontSize: '0.85rem' },
                  }}
                />
                <TextField
                  label="New password"
                  type={showNewPw ? 'text' : 'password'}
                  size="small"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  fullWidth
                  helperText="More than 10 characters"
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            edge="end"
                            size="small"
                            aria-label={showNewPw ? 'Hide new password' : 'Show new password'}
                            onClick={() => setShowNewPw((s) => !s)}
                            sx={{ color: 'hsl(var(--muted-foreground))' }}
                          >
                            {showNewPw ? <EyeOff size={18} /> : <Eye size={18} />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                  sx={{
                    '& .MuiInputBase-input': { fontSize: '0.85rem' },
                    '& .MuiInputLabel-root': { fontSize: '0.85rem' },
                  }}
                />
                <TextField
                  label="Repeat new password"
                  type={showConfirmPw ? 'text' : 'password'}
                  size="small"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  fullWidth
                  error={confirmPw.length > 0 && newPw !== confirmPw}
                  helperText={
                    confirmPw.length > 0 && newPw !== confirmPw
                      ? 'Passwords do not match'
                      : ''
                  }
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            edge="end"
                            size="small"
                            aria-label={showConfirmPw ? 'Hide repeated password' : 'Show repeated password'}
                            onClick={() => setShowConfirmPw((s) => !s)}
                            sx={{ color: 'hsl(var(--muted-foreground))' }}
                          >
                            {showConfirmPw ? <EyeOff size={18} /> : <Eye size={18} />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                  sx={{
                    '& .MuiInputBase-input': { fontSize: '0.85rem' },
                    '& .MuiInputLabel-root': { fontSize: '0.85rem' },
                  }}
                />
              </Box>

              {pwMsg && (
                <Alert
                  severity={
                    pwMsg.toLowerCase().includes('success')
                      ? 'success'
                      : 'error'
                  }
                  sx={{ mb: 2, borderRadius: 2, fontSize: '0.85rem' }}
                >
                  {pwMsg}
                </Alert>
              )}

              <Button
                variant="contained"
                onClick={handleChangePassword}
                disabled={!passwordValid || !currentPw || pwLoading}
                sx={{
                  height: 36,
                  textTransform: 'none',
                  fontSize: '0.85rem',
                  bgcolor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
                  '&.Mui-disabled': { opacity: 0.5 },
                }}
              >
                {pwLoading ? 'Updating...' : 'Update Password'}
              </Button>
            </Paper>

            {isSupport && <DiagnosticsLogsCard />}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default SettingsPage;

