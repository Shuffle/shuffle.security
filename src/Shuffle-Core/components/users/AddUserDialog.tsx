import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  CircularProgress,
  Alert,
  IconButton,
  Stack,
  Tabs,
  Tab,
  InputAdornment,
} from '@mui/material';
import { X as CloseIcon, UserPlus, Mail, Lock, Shield } from 'lucide-react';
import { getApiUrl, getAuthHeader, isCloud } from '@/Shuffle-Core/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/lib/toast';
import { invalidateUsersCache } from '@/hooks/useUsers';

export interface AddUserDialogProps {
  open: boolean;
  onClose: () => void;
  onUserAdded?: () => void | Promise<void>;
}

type RegistrationMode = 'cloud' | 'onprem';

export const AddUserDialog = ({ open, onClose, onUserAdded }: AddUserDialogProps) => {
  const { userInfo } = useAuth();
  const orgId = userInfo?.active_org?.id || (userInfo as unknown as Record<string, any>)?.org_id || '';

  const runningInCloud = isCloud();
  const [mode, setMode] = useState<RegistrationMode>(runningInCloud ? 'cloud' : 'onprem');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode(isCloud() ? 'cloud' : 'onprem');
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      setError(null);
    }
  }, [open]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError(mode === 'cloud' ? 'Please enter a valid email address.' : 'Please enter a username.');
      return;
    }

    if (mode === 'cloud') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedUsername)) {
        setError('Please enter a valid email address for cloud invitation.');
        return;
      }
    } else {
      if (!password) {
        setError('Password is required for on-premise user registration.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === 'cloud') {
        const payload = {
          username: trimmedUsername,
          type: 'invite',
          org_id: orgId,
        };

        const res = await fetch(getApiUrl('/api/v1/users/register_org'), {
          method: 'POST',
          credentials: 'include',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.reason || data.error || `Failed to invite user (${res.status})`);
        }

        toast.success(`Invitation sent to ${trimmedUsername}`);
      } else {
        const payload = {
          username: trimmedUsername,
          password: password,
        };

        const res = await fetch(getApiUrl('/api/v1/users/register'), {
          method: 'POST',
          credentials: 'include',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.reason || data.error || `Failed to register user (${res.status})`);
        }

        toast.success(`User ${trimmedUsername} registered successfully`);
      }

      invalidateUsersCache();
      if (onUserAdded) {
        await onUserAdded();
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while creating user');
    } finally {
      setLoading(false);
    }
  }, [username, password, confirmPassword, mode, orgId, onUserAdded, onClose]);

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'hsl(var(--card))',
          color: 'hsl(var(--foreground))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
        },
      }}
    >
      <DialogTitle
        sx={{
          m: 0,
          p: 2.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid hsl(var(--border))',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 1.5,
              bgcolor: 'hsl(var(--primary) / 0.1)',
              color: 'hsl(var(--primary))',
            }}
          >
            <UserPlus size={20} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem', color: 'hsl(var(--foreground))' }}>
              Add User
            </Typography>
            <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block' }}>
              {mode === 'cloud' ? 'Invite a team member to your organization' : 'Create a new local user account'}
            </Typography>
          </Box>
        </Box>
        <IconButton
          aria-label="close"
          onClick={onClose}
          disabled={loading}
          size="small"
          sx={{ color: 'hsl(var(--muted-foreground))' }}
        >
          <CloseIcon size={18} />
        </IconButton>
      </DialogTitle>

      <Box
        component="form"
        onSubmit={handleSubmit}
        noValidate
        sx={{ display: 'flex', flexDirection: 'column' }}
      >
        <DialogContent sx={{ p: 2.5 }}>
          <Stack spacing={2.5}>
            <Box sx={{ borderBottom: '1px solid hsl(var(--border))', pb: 1 }}>
              <Tabs
                value={mode}
                onChange={(_, val: RegistrationMode) => {
                  setMode(val);
                  setError(null);
                }}
                sx={{
                  minHeight: 36,
                  '& .MuiTabs-indicator': { bgcolor: 'hsl(var(--primary))' },
                  '& .MuiTab-root': {
                    minHeight: 36,
                    py: 0.5,
                    px: 2,
                    fontSize: '0.85rem',
                    textTransform: 'none',
                    fontWeight: 500,
                    color: 'hsl(var(--muted-foreground))',
                    '&.Mui-selected': { color: 'hsl(var(--foreground))', fontWeight: 600 },
                  },
                }}
              >
                <Tab label="Cloud Invite" value="cloud" />
                <Tab label="On-Premises" value="onprem" />
              </Tabs>
            </Box>

            {error && (
              <Alert severity="error" sx={{ borderRadius: 1.5, fontSize: '0.85rem' }}>
                {error}
              </Alert>
            )}

            {mode === 'cloud' ? (
              <>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: 1, color: 'hsl(var(--foreground))' }}>
                    Email Address
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="colleague@company.com"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loading}
                    autoFocus
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Mail size={16} color="hsl(var(--muted-foreground))" />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        bgcolor: 'hsl(var(--background))',
                        color: 'hsl(var(--foreground))',
                        borderRadius: 1.5,
                        '& fieldset': { borderColor: 'hsl(var(--border))' },
                        '&:hover fieldset': { borderColor: 'hsl(var(--primary))' },
                      },
                    }}
                  />
                  <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', mt: 0.75, display: 'block' }}>
                    An invite email will be sent with instructions to join this organization.
                  </Typography>
                </Box>

                {orgId && (
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 1.5,
                      bgcolor: 'hsl(var(--muted) / 0.4)',
                      border: '1px solid hsl(var(--border))',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                    }}
                  >
                    <Shield size={16} color="hsl(var(--muted-foreground))" />
                    <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                      Target Org ID: <Box component="span" sx={{ fontFamily: 'monospace', color: 'hsl(var(--foreground))' }}>{orgId}</Box>
                    </Typography>
                  </Box>
                )}
              </>
            ) : (
              <>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: 1, color: 'hsl(var(--foreground))' }}>
                    Username
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="analyst1"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loading}
                    autoFocus
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <UserPlus size={16} color="hsl(var(--muted-foreground))" />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        bgcolor: 'hsl(var(--background))',
                        color: 'hsl(var(--foreground))',
                        borderRadius: 1.5,
                        '& fieldset': { borderColor: 'hsl(var(--border))' },
                        '&:hover fieldset': { borderColor: 'hsl(var(--primary))' },
                      },
                    }}
                  />
                </Box>

                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: 1, color: 'hsl(var(--foreground))' }}>
                    Password
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Lock size={16} color="hsl(var(--muted-foreground))" />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        bgcolor: 'hsl(var(--background))',
                        color: 'hsl(var(--foreground))',
                        borderRadius: 1.5,
                        '& fieldset': { borderColor: 'hsl(var(--border))' },
                        '&:hover fieldset': { borderColor: 'hsl(var(--primary))' },
                      },
                    }}
                  />
                </Box>

                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: 1, color: 'hsl(var(--foreground))' }}>
                    Confirm Password
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Lock size={16} color="hsl(var(--muted-foreground))" />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        bgcolor: 'hsl(var(--background))',
                        color: 'hsl(var(--foreground))',
                        borderRadius: 1.5,
                        '& fieldset': { borderColor: 'hsl(var(--border))' },
                        '&:hover fieldset': { borderColor: 'hsl(var(--primary))' },
                      },
                    }}
                  />
                </Box>
              </>
            )}
          </Stack>
        </DialogContent>

        <DialogActions
          sx={{
            px: 2.5,
            py: 2,
            borderTop: '1px solid hsl(var(--border))',
            gap: 1,
          }}
        >
          <Button
            onClick={onClose}
            disabled={loading}
            sx={{
              color: 'hsl(var(--muted-foreground))',
              textTransform: 'none',
              fontWeight: 500,
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <UserPlus size={16} />}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              bgcolor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              '&:hover': {
                bgcolor: 'hsl(var(--primary) / 0.9)',
              },
            }}
          >
            {loading
              ? (mode === 'cloud' ? 'Sending Invite…' : 'Creating User…')
              : (mode === 'cloud' ? 'Send Invite' : 'Create User')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
};

export default AddUserDialog;
