import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  Stack,
  CircularProgress,
  TextField,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
  IconButton,
  Tooltip,
  Alert,
} from '@mui/material';
import {
  Users,
  Calendar,
  Smartphone,
  Phone,
  Volume2,
  Plus,
  ArrowRight,
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertCircle,
  Laptop,
  Radio,
  Play,
  Bell,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { useUsers, User, invalidateUsersCache } from '@/hooks/useUsers';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/lib/toast';
import {
  OnCallScheduleManager,
  OnCallUser,
} from '@/Shuffle-Core/components/users/OnCallScheduleManager';
import { AddUserDialog } from '@/Shuffle-Core/components/users/AddUserDialog';
import {
  fetchNotificationDevices,
  saveNotificationDevice,
  getLocalDeviceId,
  getLocalDeviceName,
  getLocalDevicePlatform,
  resolveDevicePreferences,
  NotificationDevice,
} from '@/Shuffle-Core/services/notificationDevices';
import {
  testPagerCall,
  playTestSiren,
  requestNotificationPermissions,
  getPagerSettings,
  dispatchCriticalPage,
} from '@/Shuffle-Core/services/pagerNotificationService';

interface PhoneNotificationSetupWizardProps {
  onWorkflowNavigate?: (workflowId: string) => void;
}

interface StepItem {
  id: number;
  label: string;
  icon: any;
  desc: string;
  disabled?: boolean;
}

const STEP_ITEMS: StepItem[] = [
  { id: 0, label: '1. Responders & Users', icon: Users, desc: 'Add & verify team members', disabled: false },
  { id: 1, label: '2. Team Schedule', icon: Calendar, desc: 'Shifts & escalation tiers', disabled: true },
  { id: 2, label: '3. Connected Devices', icon: Smartphone, desc: 'Mobile phones & paging', disabled: true },
];

export const PhoneNotificationSetupWizard: React.FC<PhoneNotificationSetupWizardProps> = ({
  onWorkflowNavigate,
}) => {
  const { userInfo } = useAuth();
  const { users, loading: usersLoading, error: usersError } = useUsers();

  const [activeStep, setActiveStep] = useState<number>(0);
  const [addUserOpen, setAddUserOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [devices, setDevices] = useState<NotificationDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState<boolean>(false);
  const [registeringDevice, setRegisteringDevice] = useState<boolean>(false);
  const [playingSiren, setPlayingSiren] = useState<boolean>(false);

  // Load registered notification devices
  const loadDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const devList = await fetchNotificationDevices();
      setDevices(devList);
    } catch (err) {
      console.warn('Failed to fetch devices', err);
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const handleRefreshUsers = useCallback(async () => {
    invalidateUsersCache();
    await loadDevices();
  }, [loadDevices]);

  // Convert User[] to OnCallUser[] for OnCallScheduleManager
  const onCallUsers: OnCallUser[] = useMemo(() => {
    if (!users || !Array.isArray(users)) return [];
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      active: u.active !== false,
    }));
  }, [users]);

  // Filtered users for Step 1
  const filteredUsers = useMemo(() => {
    if (!users || !Array.isArray(users)) return [];
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.username?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q) ||
        u.id?.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  // Handle local push registration
  const handleRegisterCurrentDevice = async () => {
    setRegisteringDevice(true);
    try {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        toast.error('Notification permission denied', {
          description: 'Please enable notifications in your browser or mobile OS settings.',
        });
        return;
      }
      const localDev: NotificationDevice = {
        id: getLocalDeviceId(),
        device_name: getLocalDeviceName(),
        platform: getLocalDevicePlatform(),
        token: getPagerSettings().pushToken || '',
        preferences: resolveDevicePreferences(),
      };
      const currentUserId = userInfo?.id || (users && users[0]?.id);
      if (typeof currentUserId === 'string' && currentUserId) {
        const res = await saveNotificationDevice(currentUserId, localDev);
        if (res.success) {
          toast.success('Device registered successfully', {
            description: `${localDev.device_name} is now connected for incident paging.`,
          });
          await loadDevices();
        } else {
          toast.error('Failed to register device', { description: res.reason });
        }
      } else {
        toast.success('Notification permissions granted on this device');
      }
    } catch (err) {
      toast.error('Registration error', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setRegisteringDevice(false);
    }
  };

  const handlePlaySiren = () => {
    setPlayingSiren(true);
    playTestSiren(2200);
    setTimeout(() => setPlayingSiren(false), 2300);
  };

  const handleSimulateCall = () => {
    testPagerCall();
    toast.info('Simulated emergency pager call triggered');
  };

  // Combine devices from /api/v1/getsettings and any embedded inside user objects
  const allUserDevices = useMemo(() => {
    const map = new Map<string, { device: NotificationDevice; username: string }>();
    devices.forEach((d, idx) => {
      const key = d.id || d.device_name || `dev-${idx}`;
      map.set(key, { device: d, username: userInfo?.username || 'Current User' });
    });

    if (Array.isArray(users)) {
      users.forEach((u: any) => {
        if (Array.isArray(u.devices)) {
          u.devices.forEach((d: NotificationDevice, dIdx: number) => {
            const key = d.id || `${u.username}-${d.device_name || dIdx}`;
            if (!map.has(key)) {
              map.set(key, { device: d, username: u.username });
            }
          });
        }
      });
    }
    return Array.from(map.values());
  }, [devices, users, userInfo]);

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Top Banner / Introduction */}
      <Box
        sx={{
          p: 2.5,
          borderRadius: 2,
          border: '1px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--card))',
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2,
              bgcolor: 'hsl(var(--primary) / 0.12)',
              color: 'hsl(var(--primary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Phone size={22} />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              Schedules & Phone Notifications Setup
            </Typography>
            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.85rem' }}>
              Connect Shuffle Security to on-call responders with automatic mobile notifications, siren paging, and multi-tier escalations.
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* 3-Step Wizard Navigation Stepper */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 1.5,
        }}
      >
        {STEP_ITEMS.map((step) => {
          const StepIcon = step.icon;
          const isCurrent = activeStep === step.id;
          const isDone = activeStep > step.id;
          const isDisabled = !!step.disabled;
          const stepCard = (
            <Paper
              key={step.id}
              onClick={isDisabled ? undefined : () => setActiveStep(step.id)}
              elevation={0}
              sx={{
                p: 2,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                borderRadius: 2,
                border: '1px solid',
                borderColor: isDisabled
                  ? 'hsl(var(--border))'
                  : isCurrent
                  ? 'hsl(var(--primary))'
                  : isDone
                  ? 'hsl(var(--primary) / 0.4)'
                  : 'hsl(var(--border))',
                bgcolor: isDisabled
                  ? 'hsl(var(--card))'
                  : isCurrent
                  ? 'hsl(var(--primary) / 0.06)'
                  : 'hsl(var(--card))',
                opacity: isDisabled ? 0.6 : 1,
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                width: '100%',
                ...(!isDisabled && {
                  '&:hover': {
                    borderColor: 'hsl(var(--primary) / 0.8)',
                    bgcolor: 'hsl(var(--primary) / 0.04)',
                  },
                }),
              }}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: isDisabled
                    ? 'hsl(var(--muted))'
                    : isCurrent
                    ? 'hsl(var(--primary))'
                    : isDone
                    ? 'hsl(var(--primary) / 0.2)'
                    : 'hsl(var(--muted))',
                  color: isDisabled
                    ? 'hsl(var(--muted-foreground))'
                    : isCurrent
                    ? 'hsl(var(--primary-foreground))'
                    : isDone
                    ? 'hsl(var(--primary))'
                    : 'hsl(var(--muted-foreground))',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  flexShrink: 0,
                }}
              >
                {isDone && !isDisabled ? <CheckCircle2 size={16} /> : <StepIcon size={16} />}
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: isCurrent ? 600 : 500,
                      color: isDisabled
                        ? 'hsl(var(--muted-foreground))'
                        : isCurrent
                        ? 'hsl(var(--primary))'
                        : 'hsl(var(--foreground))',
                      fontSize: '0.875rem',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {step.label}
                  </Typography>
                  {isDisabled && (
                    <Box
                      component="span"
                      sx={{
                        px: 0.75,
                        py: 0.15,
                        borderRadius: 1,
                        bgcolor: 'hsl(var(--muted))',
                        color: 'hsl(var(--muted-foreground))',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        letterSpacing: '0.02em',
                        lineHeight: 1.2,
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Coming soon
                    </Box>
                  )}
                </Box>
                <Typography
                  variant="caption"
                  sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem' }}
                >
                  {step.desc}
                </Typography>
              </Box>
            </Paper>
          );

          if (isDisabled) {
            return (
              <Tooltip key={step.id} title="Coming soon" placement="top" arrow>
                <Box sx={{ display: 'flex', width: '100%', height: '100%' }}>
                  {stepCard}
                </Box>
              </Tooltip>
            );
          }

          return stepCard;
        })}
      </Box>

      {/* STEP 1: New User / Responders */}
      {activeStep === 0 && (
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 2,
            border: '1px solid hsl(var(--border))',
            bgcolor: 'hsl(var(--card))',
            display: 'flex',
            flexDirection: 'column',
            gap: 2.5,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { xs: 'flex-start', sm: 'center' },
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                Step 1: Responders & Team Members
              </Typography>
              <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.85rem' }}>
                Verify organization users who can respond to critical security incidents.
              </Typography>
            </Box>

            <Stack direction="row" spacing={1.5} alignItems="center">
              <TextField
                size="small"
                placeholder="Search responders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  width: { xs: '100%', sm: 220 },
                  '& .MuiOutlinedInput-root': { height: 38, fontSize: '0.85rem' },
                }}
              />
              <Button
                variant="contained"
                size="small"
                startIcon={<Plus size={16} />}
                onClick={() => setAddUserOpen(true)}
                sx={{
                  bgcolor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  textTransform: 'none',
                  fontWeight: 600,
                  height: 38,
                  whiteSpace: 'nowrap',
                  '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
                }}
              >
                Add User
              </Button>
            </Stack>
          </Box>

          {usersLoading ? (
            <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={32} />
            </Box>
          ) : usersError ? (
            <Alert severity="error">{usersError}</Alert>
          ) : filteredUsers.length === 0 ? (
            <Box
              sx={{
                p: 4,
                textAlign: 'center',
                borderRadius: 2,
                border: '1px dashed hsl(var(--border))',
                bgcolor: 'hsl(var(--muted) / 0.3)',
              }}
            >
              <Users size={36} style={{ color: 'hsl(var(--muted-foreground))', marginBottom: 8 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                No responders found
              </Typography>
              <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', mb: 2 }}>
                Add your first team member to receive on-call assignments and mobile pages.
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Plus size={16} />}
                onClick={() => setAddUserOpen(true)}
              >
                Add User
              </Button>
            </Box>
          ) : (
            <TableContainer sx={{ border: '1px solid hsl(var(--border))', borderRadius: 1.5 }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: 'hsl(var(--muted) / 0.5)' }}>
                  <TableRow>
                    <TableCell sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>User</TableCell>
                    <TableCell sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>Role</TableCell>
                    <TableCell sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>Devices</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredUsers.map((user) => {
                    const userDevCount = (user as any).devices?.length || (user.id === userInfo?.id ? devices.length : 0);
                    return (
                      <TableRow key={user.id} hover>
                        <TableCell>
                          <Stack direction="row" spacing={1.5} alignItems="center">
                            <Avatar
                              sx={{
                                width: 28,
                                height: 28,
                                fontSize: '0.8rem',
                                bgcolor: 'hsl(var(--primary) / 0.15)',
                                color: 'hsl(var(--primary))',
                              }}
                            >
                              {(user.username || 'U')[0].toUpperCase()}
                            </Avatar>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                                {user.username}
                              </Typography>
                              <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                                {user.id}
                              </Typography>
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={user.role || 'Member'}
                            sx={{
                              fontSize: '0.75rem',
                              height: 22,
                              bgcolor: 'hsl(var(--muted))',
                              color: 'hsl(var(--foreground))',
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={user.active !== false ? 'Active' : 'Inactive'}
                            sx={{
                              fontSize: '0.75rem',
                              height: 22,
                              bgcolor:
                                user.active !== false
                                  ? 'hsl(142 76% 36% / 0.15)'
                                  : 'hsl(var(--muted))',
                              color:
                                user.active !== false
                                  ? 'hsl(142 76% 36%)'
                                  : 'hsl(var(--muted-foreground))',
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Smartphone size={14} style={{ color: userDevCount > 0 ? 'hsl(142 76% 36%)' : 'hsl(var(--muted-foreground))' }} />
                            <Typography variant="caption" sx={{ color: 'hsl(var(--foreground))' }}>
                              {userDevCount > 0 ? `${userDevCount} connected` : 'None registered'}
                            </Typography>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
            <Tooltip title="Coming soon" placement="top" arrow>
              <span>
                <Button
                  variant="contained"
                  disabled
                  endIcon={<ArrowRight size={16} />}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                  }}
                >
                  Continue to Team Schedule
                </Button>
              </span>
            </Tooltip>
          </Box>
        </Paper>
      )}

      {/* STEP 2: Set Up Team Schedule */}
      {activeStep === 1 && (
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 2,
            border: '1px solid hsl(var(--border))',
            bgcolor: 'hsl(var(--card))',
            display: 'flex',
            flexDirection: 'column',
            gap: 2.5,
          }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              Step 2: Team Schedule & Escalation Tiers
            </Typography>
            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.85rem' }}>
              Configure shift hours, weekly rotations, and escalation tiers (Tier 1 → Tier 2 → Tier 3 → Manager).
            </Typography>
          </Box>

          <Box sx={{ border: '1px solid hsl(var(--border))', borderRadius: 2, p: 2, bgcolor: 'hsl(var(--background))' }}>
            <OnCallScheduleManager
              users={onCallUsers}
              compact={true}
              onRefreshUsers={handleRefreshUsers}
            />
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
            <Button
              variant="outlined"
              onClick={() => setActiveStep(0)}
              startIcon={<ArrowLeft size={16} />}
              sx={{ textTransform: 'none' }}
            >
              Back to Users
            </Button>
            <Button
              variant="contained"
              onClick={() => setActiveStep(2)}
              endIcon={<ArrowRight size={16} />}
              sx={{
                bgcolor: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                textTransform: 'none',
                fontWeight: 600,
                '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
              }}
            >
              Continue to Connected Devices
            </Button>
          </Box>
        </Paper>
      )}

      {/* STEP 3: Connected Devices & Paging */}
      {activeStep === 2 && (
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 2,
            border: '1px solid hsl(var(--border))',
            bgcolor: 'hsl(var(--card))',
            display: 'flex',
            flexDirection: 'column',
            gap: 2.5,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { xs: 'flex-start', sm: 'center' },
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                Step 3: Connected Devices & Phone Paging
              </Typography>
              <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.85rem' }}>
                See which responders have connected devices, enable push on this device, and test siren alerts.
              </Typography>
            </Box>

            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshCw size={14} />}
              onClick={loadDevices}
              disabled={loadingDevices}
              sx={{ textTransform: 'none' }}
            >
              Refresh Devices
            </Button>
          </Box>

          {/* Interactive Testing & Registration Banner */}
          <Box
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: '1px solid hsl(var(--primary) / 0.3)',
              bgcolor: 'hsl(var(--primary) / 0.04)',
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              alignItems: { xs: 'flex-start', md: 'center' },
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 1.5,
                  bgcolor: 'hsl(var(--primary) / 0.15)',
                  color: 'hsl(var(--primary))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Radio size={20} />
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                  Enable & Test Emergency Alerts
                </Typography>
                <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                  Verify that sirens, audio chimes, and push notifications ring successfully on active responder devices.
                </Typography>
              </Box>
            </Box>

            <Stack direction="row" spacing={1.5} flexWrap="wrap">
              <Button
                variant="outlined"
                size="small"
                startIcon={<Smartphone size={16} />}
                onClick={handleRegisterCurrentDevice}
                disabled={registeringDevice}
                sx={{
                  textTransform: 'none',
                  borderColor: 'hsl(var(--primary) / 0.5)',
                  color: 'hsl(var(--primary))',
                }}
              >
                {registeringDevice ? 'Registering...' : 'Register this device'}
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Volume2 size={16} />}
                onClick={handlePlaySiren}
                disabled={playingSiren}
                sx={{ textTransform: 'none' }}
              >
                {playingSiren ? 'Playing...' : 'Test Siren Audio'}
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<Play size={16} />}
                onClick={handleSimulateCall}
                sx={{
                  bgcolor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  textTransform: 'none',
                  fontWeight: 600,
                  '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
                }}
              >
                Simulate Pager Call
              </Button>
            </Stack>
          </Box>

          {/* Connected Devices Table */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5, color: 'hsl(var(--foreground))' }}>
              Connected Responder Devices ({allUserDevices.length})
            </Typography>

            {loadingDevices ? (
              <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={28} />
              </Box>
            ) : allUserDevices.length === 0 ? (
              <Box
                sx={{
                  p: 3,
                  textAlign: 'center',
                  borderRadius: 2,
                  border: '1px dashed hsl(var(--border))',
                  bgcolor: 'hsl(var(--muted) / 0.2)',
                }}
              >
                <Smartphone size={32} style={{ color: 'hsl(var(--muted-foreground))', marginBottom: 8 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                  No devices connected yet
                </Typography>
                <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block', mb: 1.5 }}>
                  Click &ldquo;Register this device&rdquo; above or log into the Shuffle Mobile App on iOS / Android to register devices.
                </Typography>
              </Box>
            ) : (
              <TableContainer sx={{ border: '1px solid hsl(var(--border))', borderRadius: 1.5 }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'hsl(var(--muted) / 0.5)' }}>
                    <TableRow>
                      <TableCell sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>Device</TableCell>
                      <TableCell sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>User</TableCell>
                      <TableCell sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>Platform</TableCell>
                      <TableCell sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>Push Token</TableCell>
                      <TableCell sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>Preferences</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {allUserDevices.map(({ device, username }, idx) => {
                      const platform = (device.platform || 'web').toLowerCase();
                      const isMobile = platform === 'ios' || platform === 'android';
                      return (
                        <TableRow key={device.id || idx} hover>
                          <TableCell>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              {isMobile ? (
                                <Smartphone size={18} style={{ color: 'hsl(var(--primary))' }} />
                              ) : (
                                <Laptop size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
                              )}
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                                  {device.device_name || 'Generic Device'}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                                  ID: {device.id ? device.id.slice(0, 16) + '...' : 'local'}
                                </Typography>
                              </Box>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))' }}>
                              {username}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={platform.toUpperCase()}
                              sx={{
                                fontSize: '0.7rem',
                                height: 20,
                                bgcolor: isMobile ? 'hsl(var(--primary) / 0.12)' : 'hsl(var(--muted))',
                                color: isMobile ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
                                fontWeight: 600,
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            {device.token ? (
                              <Chip
                                size="small"
                                icon={<CheckCircle2 size={12} />}
                                label="Active Push"
                                sx={{
                                  fontSize: '0.7rem',
                                  height: 20,
                                  bgcolor: 'hsl(142 76% 36% / 0.15)',
                                  color: 'hsl(142 76% 36%)',
                                }}
                              />
                            ) : (
                              <Chip
                                size="small"
                                icon={<AlertCircle size={12} />}
                                label="No Token"
                                sx={{
                                  fontSize: '0.7rem',
                                  height: 20,
                                  bgcolor: 'hsl(var(--muted))',
                                  color: 'hsl(var(--muted-foreground))',
                                }}
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5}>
                              {device.preferences?.critical_pager !== false && (
                                <Chip size="small" label="Pager" sx={{ fontSize: '0.65rem', height: 18 }} />
                              )}
                              {device.preferences?.agent_requests !== false && (
                                <Chip size="small" label="AI" sx={{ fontSize: '0.65rem', height: 18 }} />
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>

          {/* Mobile App Information Card */}
          <Box
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: '1px solid hsl(var(--border))',
              bgcolor: 'hsl(var(--card))',
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { xs: 'flex-start', sm: 'center' },
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: 2,
                  bgcolor: 'hsl(142 76% 36% / 0.15)',
                  color: 'hsl(142 76% 36%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Smartphone size={22} />
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                  Shuffle Mobile App for iOS & Android
                </Typography>
                <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem' }}>
                  Install the native app for lock-screen emergency sirens, volume bypass, critical notification channels, and one-tap incident escalations.
                </Typography>
              </Box>
            </Box>

            <Stack direction="row" spacing={1}>
              <Chip
                label="iOS App Store"
                component="a"
                href="https://apps.apple.com"
                target="_blank"
                clickable
                sx={{ fontSize: '0.75rem', bgcolor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))' }}
              />
              <Chip
                label="Google Play"
                component="a"
                href="https://play.google.com"
                target="_blank"
                clickable
                sx={{ fontSize: '0.75rem', bgcolor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))' }}
              />
            </Stack>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'flex-start', mt: 1 }}>
            <Button
              variant="outlined"
              onClick={() => setActiveStep(1)}
              startIcon={<ArrowLeft size={16} />}
              sx={{ textTransform: 'none' }}
            >
              Back to Schedule
            </Button>
          </Box>
        </Paper>
      )}

      {/* Add User Dialog */}
      <AddUserDialog
        open={addUserOpen}
        onClose={() => setAddUserOpen(false)}
        onUserAdded={handleRefreshUsers}
      />
    </Box>
  );
};

export default PhoneNotificationSetupWizard;
