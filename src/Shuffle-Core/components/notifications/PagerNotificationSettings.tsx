import { useState, useEffect, useCallback, ReactNode } from 'react';
import {
  Box,
  Typography,
  Paper,
  Switch,
  Button,
  FormControl,
  Select,
  MenuItem,
  Menu,
  Divider,
  Alert,
  Collapse,
  IconButton,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Tooltip,
  Chip,
} from '@mui/material';
import { ChevronDown, Smartphone, Monitor, MoreVertical, Bell, BellOff, CalendarClock, PhoneCall } from 'lucide-react';
import { toast } from '@/Shuffle-Core/lib/toast';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { getDatastoreItem, setDatastoreItem, DATASTORE_CATEGORIES } from '@shuffleio/shuffle-mcps';
import {
  OnCallScheduleManager,
  computeDefaultPolicy,
  type OnCallUser,
  type AssignmentConfig,
  type UserSchedule,
} from '@/Shuffle-Core/components/users/OnCallScheduleManager';


import {
  getPagerSettings,
  savePagerSettings,
  registerFirebaseWebPush,

  PagerSettings,
  requestNotificationPermissions,
  playTestSiren,
  testPagerCall,
  triggerAgentRequestLocalAlert,
  triggerGeneralLocalAlert,
  dispatchCriticalPage,
  dispatchAgentRequestNotification,
  dispatchGeneralNotification,
  NotificationType,
} from '@/Shuffle-Core/services/pagerNotificationService';
import {
  NotificationDevice,
  DevicePreferences,
  fetchNotificationDevices,
  saveNotificationDevice,
  resolveDevicePreferences,
  getLocalDeviceId,
  getLocalDeviceName,
  getLocalDevicePlatform,
} from '@/Shuffle-Core/services/notificationDevices';

const PREFERENCE_KEY: Record<NotificationType, keyof DevicePreferences> = {
  critical: 'critical_pager',
  agent_request: 'agent_requests',
  general: 'general_alerts',
};

const rowSx = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  justifyContent: 'space-between',
  alignItems: 'center',
  columnGap: 1.5,
  rowGap: 1,
};


const outlinedButtonSx = {
  height: 36,
  textTransform: 'none' as const,
  fontSize: '0.8rem',
  borderColor: 'hsl(var(--border))',
  color: 'hsl(var(--foreground))',
  '&:hover': { borderColor: 'hsl(var(--primary))', bgcolor: 'hsl(var(--primary) / 0.06)' },
};

interface SectionProps {
  title: string;
  description: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle: (value: boolean) => void;
  expanded: boolean;
  onExpandToggle: () => void;
  expandDisabled?: boolean;
  onTest?: () => void;
  testing?: boolean;
  testTooltip?: string;
  testDisabled?: boolean;
  children: ReactNode;
}

const NotificationSection = ({
  title,
  description,
  enabled,
  disabled,
  onToggle,
  expanded,
  onExpandToggle,
  expandDisabled,
  onTest,
  testing,
  testTooltip,
  testDisabled,
  children,
}: SectionProps) => (
  <Box
    sx={{
      border: '1px solid hsl(var(--border))',
      borderRadius: 2,
      bgcolor: 'hsl(var(--muted) / 0.15)',
    }}
  >
    <Box
      sx={{ ...rowSx, p: 2, cursor: expandDisabled ? 'default' : 'pointer' }}
      onClick={expandDisabled ? undefined : onExpandToggle}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
        <IconButton
          size="small"
          disabled={expandDisabled}
          onClick={(e) => {
            e.stopPropagation();
            if (expandDisabled) return;
            onExpandToggle();
          }}
          sx={{
            flexShrink: 0,
            color: 'hsl(var(--muted-foreground))',
            transform: expanded && !expandDisabled ? 'rotate(180deg)' : 'none',
            transition: 'transform 150ms ease',
          }}
        >
          <ChevronDown size={16} />
        </IconButton>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.92rem', color: 'hsl(var(--foreground))', lineHeight: 1.3 }}>
            {title}
          </Typography>
          <Typography
            variant="caption"
            sx={{ display: 'block', color: 'hsl(var(--muted-foreground))', lineHeight: 1.35 }}
          >
            {description}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5, flexShrink: 0 }}>
        <Switch
          checked={enabled}
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onToggle(e.target.checked)}
          color="primary"
          size="small"
        />
        {enabled && onTest && (
          <Tooltip title={testTooltip || ''} placement="left" arrow>
            <span onClick={(e) => e.stopPropagation()}>
              <Button
                variant="outlined"
                size="small"
                disabled={testing || testDisabled}
                onClick={(e) => {
                  e.stopPropagation();
                  onTest();
                }}
                sx={outlinedButtonSx}
              >
                {testing ? 'Sending' : 'Test'}
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>
    </Box>


    <Collapse in={expanded && !expandDisabled} unmountOnExit>
      <Divider sx={{ borderColor: 'hsl(var(--border))' }} />
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</Box>
    </Collapse>
  </Box>
);


const SettingRow = ({
  label,
  hint,
  control,
}: {
  label: string;
  hint?: string;
  control: ReactNode;
}) => (
  <Box sx={rowSx}>
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))', lineHeight: 1.35 }}>{label}</Typography>
      {hint && (
        <Typography variant="caption" sx={{ display: 'block', color: 'hsl(var(--muted-foreground))', lineHeight: 1.35 }}>
          {hint}
        </Typography>
      )}
    </Box>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>{control}</Box>

  </Box>
);

interface PermissionHelp {
  device: string;
  steps: string;
  siteLabel: string;
  internalUrl?: string;
  docsUrl?: string;
}

const getPermissionHelp = (): PermissionHelp => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const siteLabel = typeof window !== 'undefined' ? window.location.hostname : 'Shuffle Security';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
  const isAndroid = /Android/.test(ua);
  const isEdge = /Edg\//.test(ua);
  const isFirefox = /Firefox\//.test(ua);
  const isChromium = /Chrome\/|Chromium\//.test(ua) && !isEdge;
  const isSafari = /Safari\//.test(ua) && !/Chrome\/|Chromium\//.test(ua);

  if (isIOS) {
    return {
      device: 'iOS',
      siteLabel,
      steps: 'Open Settings, then Notifications, select the browser or the Shuffle app and turn on Allow Notifications. In Safari also check Settings, Apps, Safari, Advanced, Website Data permissions.',
      docsUrl: 'https://support.apple.com/en-us/HT201925',
    };
  }
  if (isAndroid) {
    return {
      device: 'Android',
      siteLabel,
      steps: 'Open Settings, then Notifications, select the browser or the Shuffle app and allow notifications. In Chrome you can also tap the lock icon in the address bar and set Notifications to Allow.',
      docsUrl: 'https://support.google.com/chrome/answer/3220216?hl=en&co=GENIE.Platform%3DAndroid',
    };
  }
  if (isEdge) {
    return {
      device: 'Microsoft Edge',
      siteLabel,
      steps: 'Open the Edge notification settings page and set this site to Allow.',
      internalUrl: 'edge://settings/content/notifications',
      docsUrl: 'https://support.microsoft.com/en-us/microsoft-edge/manage-website-notifications-in-microsoft-edge-0c555609-5bf2-479d-a59d-fb30a0b80b2b',
    };
  }
  if (isFirefox) {
    return {
      device: 'Firefox',
      siteLabel,
      steps: 'Open the Firefox permissions settings and remove the block for this site.',
      internalUrl: 'about:preferences#privacy',
      docsUrl: 'https://support.mozilla.org/en-US/kb/push-notifications-firefox',
    };
  }
  if (isSafari) {
    return {
      device: 'Safari on macOS',
      siteLabel,
      steps: 'Open Safari, then Settings, Websites, Notifications, and set this site to Allow.',
      docsUrl: 'https://support.apple.com/guide/safari/customize-website-notifications-sfri40734/mac',
    };
  }
  if (isChromium) {
    return {
      device: 'Chrome',
      siteLabel,
      steps: 'Open the Chrome notification settings page and set this site to Allow, or click the icon left of the address bar and allow notifications.',
      internalUrl: 'chrome://settings/content/notifications',
      docsUrl: 'https://support.google.com/chrome/answer/3220216?hl=en&co=GENIE.Platform%3DDesktop',
    };
  }
  return {
    device: 'this device',
    siteLabel,
    steps: 'Open your browser or system notification settings and allow notifications for this site.',
  };
};

export interface PagerNotificationSettingsProps {
  /** Current user. Optional — when omitted the component loads it from /api/v1/getinfo. */
  userInfo?: { id?: string; username?: string } | null;
}

export const PagerNotificationSettings = ({ userInfo: userInfoProp }: PagerNotificationSettingsProps = {}) => {
  const [loadedUser, setLoadedUser] = useState<{ id?: string; username?: string } | null>(null);
  const userInfo = userInfoProp ?? loadedUser;

  useEffect(() => {
    if (userInfoProp) return;
    let cancelled = false;
    fetch(getApiUrl('/api/v1/getinfo'), { credentials: 'include', headers: { ...getAuthHeader() } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setLoadedUser({ id: data.id, username: data.username });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userInfoProp]);

  const [settings, setSettings] = useState<PagerSettings>(getPagerSettings());
  const [isPlayingTestSiren, setIsPlayingTestSiren] = useState(false);
  const [sendingType, setSendingType] = useState<NotificationType | null>(null);
  const [permissionMsg, setPermissionMsg] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const [expanded, setExpanded] = useState<NotificationType | null>(null);
  const [devices, setDevices] = useState<NotificationDevice[]>([]);
  const [localDeviceId, setLocalDeviceId] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [savingDevice, setSavingDevice] = useState(false);
  const [inIframe, setInIframe] = useState(false);
  const [confirmCritical, setConfirmCritical] = useState(false);
  const [pendingCriticalTest, setPendingCriticalTest] = useState<'push' | 'simulate' | null>(null);


  useEffect(() => {
    setInIframe(typeof window !== 'undefined' && window.top !== window.self);
  }, []);

  useEffect(() => {
    const id = getLocalDeviceId();
    setLocalDeviceId(id);
    setSelectedDeviceId((current) => current || id);

    let cancelled = false;
    fetchNotificationDevices().then((remote) => {
      if (!cancelled) setDevices(remote);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSettings(getPagerSettings());

    const handleSettingsChange = (e: Event) => {
      const customEvent = e as CustomEvent<PagerSettings>;
      if (customEvent.detail) {
        setSettings(customEvent.detail);
      }
    };

    window.addEventListener('shuffle:pager-settings-changed', handleSettingsChange);
    return () => window.removeEventListener('shuffle:pager-settings-changed', handleSettingsChange);
  }, []);

  const update = (patch: Partial<PagerSettings>) => {
    setSettings(savePagerSettings(patch));
  };

  const toggleExpanded = (type: NotificationType) => {
    setExpanded((current) => (current === type ? null : type));
  };

  // ---- On-call duty & team scheduling (moved here from the old On-Call card) ----
  const currentUserId = userInfo?.id;
  const currentUsername = userInfo?.username || 'You';
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [onCallConfig, setOnCallConfig] = useState<AssignmentConfig | null>(null);
  const [savingOnCall, setSavingOnCall] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleUsers, setScheduleUsers] = useState<OnCallUser[]>([]);
  const [loadingScheduleUsers, setLoadingScheduleUsers] = useState(false);

  const loadOnCallConfig = useCallback(async () => {
    try {
      const response = await getDatastoreItem('assignment_schedules', DATASTORE_CATEGORIES.CONFIGURATION);
      if (response.success && response.item?.value) {
        const data: AssignmentConfig =
          typeof response.item.value === 'string'
            ? JSON.parse(response.item.value)
            : response.item.value;
        setOnCallConfig(data);
        return;
      }
    } catch {
      /* fall through to empty config */
    }
    setOnCallConfig({
      userSchedules: [],
      updatedAt: new Date().toISOString(),
      defaultPolicy: computeDefaultPolicy([]),
    });
  }, []);

  useEffect(() => {
    void loadOnCallConfig();
  }, [loadOnCallConfig]);

  const isMine = (s: UserSchedule) =>
    s.userId === currentUserId ||
    (currentUserId ? s.userId.startsWith(`${currentUserId}::`) : false) ||
    s.userName === currentUsername ||
    s.userEmail === currentUsername;

  const mySchedules = (onCallConfig?.userSchedules || []).filter(isMine);
  const isOnCallEnabled = mySchedules.some((s) => s.enabled);
  const hasValidDevice = devices.some((d) => Boolean(d.token || d.has_token || d.push_registered));

  const handleToggleOnCall = async (enabled: boolean) => {
    if (!onCallConfig) return;
    if (enabled && !hasValidDevice) {
      toast.error('You need at least one device with notifications enabled before going on-call.');
      return;
    }
    setSavingOnCall(true);
    try {
      let updatedSchedules: UserSchedule[];
      if (mySchedules.length > 0) {
        updatedSchedules = onCallConfig.userSchedules.map((s) => (isMine(s) ? { ...s, enabled } : s));
      } else if (enabled && currentUserId) {
        const newEntry: UserSchedule = {
          userId: currentUserId,
          userName: currentUsername,
          userEmail: currentUsername,
          escalationLevel: 'tier1',
          schedules: [
            {
              id: Math.random().toString(36).substring(2, 12),
              startDate: new Date().toISOString().split('T')[0],
              endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              startTime: '00:00',
              endTime: '23:59',
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            },
          ],
          enabled: true,
        };
        updatedSchedules = [...onCallConfig.userSchedules, newEntry];
      } else {
        updatedSchedules = onCallConfig.userSchedules;
      }

      const updatedConfig: AssignmentConfig = {
        ...onCallConfig,
        userSchedules: updatedSchedules,
        updatedAt: new Date().toISOString(),
        defaultPolicy: computeDefaultPolicy(updatedSchedules),
      };

      const res = await setDatastoreItem(
        'assignment_schedules',
        updatedConfig,
        DATASTORE_CATEGORIES.CONFIGURATION,
      );
      if (!res.success) throw new Error(res.error || 'Failed to update schedule');
      setOnCallConfig(updatedConfig);
      toast.success(enabled ? 'You are now on-call' : 'You are now off-call');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update schedule');
    } finally {
      setSavingOnCall(false);
    }
  };

  const openTeamScheduling = async () => {
    setMenuAnchor(null);
    setScheduleOpen(true);
    if (scheduleUsers.length > 0) return;
    setLoadingScheduleUsers(true);
    try {
      const response = await fetch(getApiUrl('/api/v1/getusers'), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });
      const data = await response.json();
      setScheduleUsers(Array.isArray(data) ? data : data.users || []);
    } catch {
      setScheduleUsers([]);
    } finally {
      setLoadingScheduleUsers(false);
    }
  };


  const deviceList: NotificationDevice[] = localDeviceId
    ? [
        devices.find((d) => d.id === localDeviceId) || {
          id: localDeviceId,
          device_name: getLocalDeviceName(),
          platform: getLocalDevicePlatform(),
          token: settings.pushToken || undefined,
        },
        ...devices.filter((d) => d.id !== localDeviceId),
      ]
    : devices;

  const isLocalSelected = selectedDeviceId === localDeviceId;
  const selectedDevice = deviceList.find((d) => d.id === selectedDeviceId) || null;
  const remotePreferences = resolveDevicePreferences(selectedDevice);

  const deviceRegistered = isLocalSelected
    ? Boolean(selectedDevice)
    : Boolean(selectedDevice && devices.some((d) => d.id === selectedDevice.id));
  const pushAvailable = isLocalSelected
    ? settings.permissionStatus === 'granted' && Boolean(settings.pushToken)
    : Boolean(selectedDevice?.token || selectedDevice?.has_token || selectedDevice?.push_registered);
  const controlsAvailable = deviceRegistered && pushAvailable;

  const selectedPlatform = (selectedDevice?.platform || '').toLowerCase();
  const isMobileDevice = selectedPlatform === 'ios' || selectedPlatform === 'android';
  const criticalAvailable = controlsAvailable && isMobileDevice;

  const sectionEnabled = (type: NotificationType): boolean => {
    if (!controlsAvailable) return false;
    if (type === 'critical' && !criticalAvailable) return false;
    if (isLocalSelected) {
      if (type === 'critical') return settings.pagerCallingEnabled;
      if (type === 'agent_request') return settings.agentRequestEnabled;
      return settings.generalNotificationsEnabled;
    }
    return remotePreferences[PREFERENCE_KEY[type]];
  };

  /** Makes sure we have an FCM token for the local device before saving it. */
  const ensureLocalPushToken = useCallback(async (): Promise<string> => {
    const current = getPagerSettings();
    if (current.pushToken) return current.pushToken;
    if (current.permissionStatus !== 'granted') return '';
    try {
      const token = await registerFirebaseWebPush();
      if (token) {
        const next = savePagerSettings({ pushToken: token });
        setSettings(next);
        return token;
      }
    } catch {
      // Fall through to empty token handling below
    }
    return '';
  }, []);

  const persistDevicePreferences = async (preferences: DevicePreferences) => {
    if (!selectedDevice) return;
    setSavingDevice(true);
    let token = selectedDevice.token || settings.pushToken || '';
    if (!token && isLocalSelected) {
      token = await ensureLocalPushToken();
    }
    if (!token) {
      setSavingDevice(false);
      setPermissionMsg(
        isLocalSelected
          ? 'This device has no push token yet, so the preferences cannot be saved. Notification permission must be granted and the page opened in its own browser tab (not the preview iframe) for a token to be issued.'
          : `${selectedDevice.device_name || 'This device'} has no push token registered, so its preferences cannot be saved.`,
      );
      return;
    }
    const next: NotificationDevice = {
      id: selectedDevice.id,
      token,
      platform: selectedDevice.platform || getLocalDevicePlatform(),
      device_name: selectedDevice.device_name || getLocalDeviceName(),
      preferences,
    };
    setDevices((current) => {
      const others = current.filter((d) => d.id !== next.id);
      return [...others, next];
    });
    const result = await saveNotificationDevice(userInfo?.id || '', next);
    setSavingDevice(false);
    if (!result.success) {
      setPermissionMsg(`Failed to save the device notification preferences: ${result.reason || 'unknown error'}`);
    }
  };


  const setSectionEnabled = (type: NotificationType, value: boolean) => {
    if (isLocalSelected) {
      if (type === 'critical') update({ pagerCallingEnabled: value });
      else if (type === 'agent_request') update({ agentRequestEnabled: value });
      else update({ generalNotificationsEnabled: value });
    }
    void persistDevicePreferences({
      ...remotePreferences,
      [PREFERENCE_KEY[type]]: value,
    });
  };

  const handleRequestPermissions = async () => {
    setPermissionMsg(null);
    const granted = await requestNotificationPermissions();
    setPermissionMsg(
      granted
        ? 'Notification permissions granted.'
        : 'Notification permission was denied. Please enable notifications in your device settings.',
    );
    const next = getPagerSettings();
    setSettings(next);

    if (granted && localDeviceId && userInfo?.id) {
      const existing = devices.find((d) => d.id === localDeviceId);
      const token = next.pushToken || existing?.token || (await ensureLocalPushToken());
      if (!token) {
        setPermissionMsg(
          'Notification permission is granted, but no push token could be issued for this device. Open the app in its own browser tab (not the preview iframe) and reload to register it.',
        );
        return;
      }
      void saveNotificationDevice(userInfo.id, {
        id: localDeviceId,
        token,
        platform: getLocalDevicePlatform(),
        device_name: existing?.device_name || getLocalDeviceName(),
        preferences: resolveDevicePreferences(existing),
      }).then((result) => {
        if (!result.success) {
          setPermissionMsg(`Failed to save the device notification preferences: ${result.reason || 'unknown error'}`);
        }
        fetchNotificationDevices().then(setDevices);
      });

    }
  };

  const handleRegisterLocalPush = async () => {
    setPermissionMsg(null);
    setSavingDevice(true);
    try {
      const token = await registerFirebaseWebPush();
      if (token) {
        const next = savePagerSettings({ pushToken: token });
        setSettings(next);
        setPermissionMsg('This device is now registered for push notifications.');
        if (userInfo?.id && localDeviceId) {
          const existing = devices.find((d) => d.id === localDeviceId);
          const result = await saveNotificationDevice(userInfo.id, {
            id: localDeviceId,
            token,
            platform: getLocalDevicePlatform(),
            device_name: existing?.device_name || getLocalDeviceName(),
            preferences: resolveDevicePreferences(existing),
          });
          if (!result.success) {
            setPermissionMsg(`Failed to save the device notification preferences: ${result.reason || 'unknown error'}`);
          }
          fetchNotificationDevices().then(setDevices);
        }
        return;
      }
      if (typeof window !== 'undefined' && window.top !== window.self) {
        setPermissionMsg(
          'Push token registration is blocked inside the preview iframe. Open this page in its own browser tab and click Register this device.',
        );
      } else {
        setPermissionMsg(
          'Could not register a push token for this device. Make sure notification permissions are granted and that the browser supports push notifications.',
        );
      }
    } catch (err) {
      setPermissionMsg(`Registration error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSavingDevice(false);
    }
  };

  const permissionHelp = getPermissionHelp();

  const handleCopySettingsPath = async () => {
    if (!permissionHelp.internalUrl) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(permissionHelp.internalUrl);
      }
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch {
      setCopiedPath(false);
    }
  };


  const handleTestAudio = () => {
    setIsPlayingTestSiren(true);
    playTestSiren(2200);
    setTimeout(() => setIsPlayingTestSiren(false), 2300);
  };

  // Always target the token of the device selected above, so a test lands on
  // that device only. The local browser token is used solely when this device
  // is the selected one (or nothing is selected yet).
  const testToken = selectedDevice
    ? selectedDevice.token || (isLocalSelected ? settings.pushToken || '' : '')
    : settings.pushToken || '';
  const testTargetName = selectedDevice?.device_name || 'this device';

  const requestCriticalTest = (mode: 'push' | 'simulate') => {
    if (!criticalAvailable) return;
    setPendingCriticalTest(mode);
  };

  const handleTestRemotePush = async (type: NotificationType) => {

    if (type === 'critical' && !criticalAvailable) {
      setPermissionMsg(
        `Critical Pager is not available on ${testTargetName}. It requires the mobile app, so it cannot be tested here.`,
      );
      return;
    }
    if (!testToken) {
      if (settings.permissionStatus !== 'granted') {
        setPermissionMsg(
          `Cannot send a test to ${selectedDevice?.device_name || 'this device'}: notification permission has not been granted yet. Use "Request permissions" below first.`,
        );
      } else if (typeof window !== 'undefined' && window.top !== window.self) {
        setPermissionMsg(
          'Notification permission is granted, but push registration does not work inside the preview iframe. Open the app in its own browser tab and reload to register a push token.',
        );
      } else {
        setPermissionMsg(
          `Notification permission is granted, but ${selectedDevice?.device_name || 'this device'} has no push token registered yet. Reload the page to register it, or select a device that has push enabled.`,
        );
      }
      return;
    }


    setSendingType(type);
    setPermissionMsg(null);
    try {
      let res;
      if (type === 'critical') {
        res = await dispatchCriticalPage({
          incidentId: `test-${Date.now()}`,
          title: 'Remote Pager API Verification Test',
          source: 'Shuffle API (/api/v1/functions/pager)',
          targetToken: testToken,
          severity: 'critical',
          tier: 1,
          autoEscalateSeconds: settings.autoEscalateTimeoutSeconds || 60,
        });
      } else if (type === 'agent_request') {
        res = await dispatchAgentRequestNotification({
          title: 'AI Agent - Input Required: Confirm IP Block',
          executionId: `exec-${Date.now()}`,
          workflowId: 'wf-isolate-host',
          action: 'approve_containment',
          targetToken: testToken,
          body: 'Subagent detected suspicious brute-force activity. Confirmation needed to isolate host.',
        });
      } else {
        res = await dispatchGeneralNotification({
          title: 'Weekly SOC Report Available',
          body: 'The automated weekly security posture report has been compiled.',
          referenceUrl: '/reports/weekly',
          targetToken: testToken,
        });
      }

      if (res.success) {
        setPermissionMsg(`Push notification sent to ${testTargetName}.`);
      } else {
        setPermissionMsg(`Dispatch error: ${res.error || 'Failed to dispatch via API'}`);
      }
    } catch (err) {
      setPermissionMsg(`Dispatch error: ${err instanceof Error ? err.message : 'Network error'}`);
    } finally {
      setSendingType(null);
    }
  };

  const handleSimulateAgentRequest = () => {
    triggerAgentRequestLocalAlert({
      title: 'AI Agent - Input Required: Confirm IP Block',
      body: 'Subagent detected suspicious brute-force activity. Confirmation needed to isolate host.',
      executionId: `exec-${Date.now()}`,
      workflowId: 'wf-isolate-host',
      action: 'approve_containment',
    });
  };

  const handleSimulateGeneral = () => {
    triggerGeneralLocalAlert({
      title: 'Workflow Completed: Daily SOC Backup',
      description: 'The automated nightly backup snapshot completed with 0 errors.',
      referenceUrl: '/workflows/backup',
    });
  };

  const isGranted = settings.permissionStatus === 'granted';

  return (
    <Paper
      sx={{
        p: { xs: 2.5, sm: 3.5 },
        bgcolor: 'transparent', backgroundImage: 'none', backdropFilter: 'blur(12px)',
        border: '1px solid hsl(var(--border))',
        borderRadius: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Box sx={{ minWidth: 0, flex: '1 1 220px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'hsl(var(--foreground))', fontSize: '1.1rem' }}>
              Paging & Notifications
            </Typography>
            <Tooltip title="This feature is made for the mobile app (coming soon)." arrow placement="top">
              <Chip
                label="Beta"
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  bgcolor: 'hsl(var(--primary) / 0.1)',
                  color: 'hsl(var(--primary))',
                  border: '1px solid hsl(var(--primary) / 0.25)',
                  borderRadius: 1,
                  cursor: 'help',
                  '& .MuiChip-label': {
                    px: 0.75,
                  },
                }}
              />
            </Tooltip>
          </Box>
          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
            Control how and when Shuffle reaches out to you.
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            flexWrap: 'nowrap',
            minWidth: 0,
            width: { xs: '100%', sm: 'auto' },
            justifyContent: { xs: 'flex-start', sm: 'flex-end' },
            '& > *': { minWidth: 0 },
          }}
        >

        {isLocalSelected && (!isGranted || !settings.pushToken) && (
          <Tooltip
            title={
              isGranted
                ? inIframe
                  ? 'Permission granted, but the preview iframe blocks token registration. Open this page in its own browser tab to register this device.'
                  : 'Permission granted, but no push token is registered for this device yet.'
                : 'Notifications are not registered on this device yet.'
            }
          >
            <span>
              <Button
                variant="contained"
                size="small"
                disableElevation
                disabled={savingDevice}
                onClick={
                  isGranted
                    ? inIframe
                      ? () => window.open(window.location.href, '_blank')
                      : handleRegisterLocalPush
                    : handleRequestPermissions
                }
                sx={{
                  height: 28,
                  px: 1.5,
                  fontSize: '0.75rem',
                  textTransform: 'none',
                  whiteSpace: 'nowrap',
                  bgcolor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
                }}
              >
                {savingDevice ? (
                  <CircularProgress size={12} sx={{ color: 'hsl(var(--primary-foreground))' }} />
                ) : isGranted ? (
                  inIframe ? (
                    'Open in new tab'
                  ) : (
                    'Register this device'
                  )
                ) : (
                  <>
                    <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                      Enable notifications
                    </Box>
                    <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                      Enable
                    </Box>
                  </>

                )}
              </Button>
            </span>
          </Tooltip>
        )}

        {deviceList.length > 0 && (
          <FormControl size="small" sx={{ flex: '1 1 auto', minWidth: 0, maxWidth: 160 }}>
            <Select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(String(e.target.value))}
              disabled={savingDevice}
              IconComponent={ChevronDown}
              renderValue={(value) => {
                const device = deviceList.find((d) => d.id === value);
                const label = (device?.device_name || device?.id || String(value)) +
                  (device?.id === localDeviceId ? ' (this device)' : '');
                const isMobile = /^(ios|android)$/i.test(device?.platform || '');
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, width: '100%' }}>
                    {isMobile ? (
                      <Smartphone size={14} color="hsl(var(--muted-foreground))" />
                    ) : (
                      <Monitor size={14} color="hsl(var(--muted-foreground))" />
                    )}
                    <Typography
                      sx={{
                        fontSize: '0.75rem',
                        color: 'hsl(var(--foreground))',
                        lineHeight: 1,
                        flex: '1 1 auto',
                        minWidth: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {label}
                    </Typography>
                  </Box>
                );
              }}
              sx={{
                height: 28,
                fontSize: '0.75rem',
                color: 'hsl(var(--foreground))',
                '& fieldset': { borderColor: 'hsl(var(--border))' },
                '& .MuiSelect-select': {
                  py: 0.5,
                  pl: 1.25,
                  pr: 3.5,
                  display: 'flex',
                  alignItems: 'center',
                },
                '& .MuiSelect-icon': {
                  color: 'hsl(var(--muted-foreground))',
                  width: 14,
                  height: 14,
                  position: 'absolute',
                  right: 7,
                  top: 'calc(50% - 7px)',
                  pointerEvents: 'none',
                },
              }}
            >
              {deviceList.map((device) => {
                const isMobile = /^(ios|android)$/i.test(device.platform || '');
                return (
                  <MenuItem key={device.id} value={device.id} sx={{ fontSize: '0.75rem', py: 0.75, gap: 0.75 }}>
                    {isMobile ? (
                      <Smartphone size={14} color="hsl(var(--muted-foreground))" />
                    ) : (
                      <Monitor size={14} color="hsl(var(--muted-foreground))" />
                    )}
                    {(device.device_name || device.id) +
                      (device.id === localDeviceId ? ' (this device)' : '')}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        )}

        <IconButton
          size="small"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          aria-label="On-call options"
          sx={{ color: 'hsl(var(--muted-foreground))' }}
        >
          <MoreVertical size={16} />
        </IconButton>

        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Tooltip
            title={
              !isOnCallEnabled && !hasValidDevice
                ? 'Connect at least one device with notifications enabled before going on-call.'
                : ''
            }
            placement="left"
          >
            <span>
          <MenuItem
            onClick={() => {
              void handleToggleOnCall(!isOnCallEnabled);
              setMenuAnchor(null);
            }}
            disabled={savingOnCall || !onCallConfig || (!isOnCallEnabled && !hasValidDevice)}
            sx={{ fontSize: '0.82rem', gap: 1 }}
          >
            {savingOnCall ? (
              <CircularProgress size={12} sx={{ color: 'hsl(var(--primary))' }} />
            ) : isOnCallEnabled ? (
              <BellOff size={14} color="hsl(var(--muted-foreground))" />
            ) : (
              <Bell size={14} color="hsl(var(--muted-foreground))" />
            )}
            {isOnCallEnabled ? 'Disable on-call duty' : 'Enable on-call duty'}
          </MenuItem>
            </span>
          </Tooltip>
          <MenuItem onClick={() => void openTeamScheduling()} sx={{ fontSize: '0.82rem', gap: 1 }}>
            <CalendarClock size={14} color="hsl(var(--muted-foreground))" />
            Team scheduling
          </MenuItem>
          <MenuItem
            disabled={!testToken}
            onClick={() => {
              testPagerCall();
              setMenuAnchor(null);
            }}
            sx={{ fontSize: '0.82rem', gap: 1 }}
          >
            <PhoneCall size={14} color="hsl(var(--muted-foreground))" />
            Simulate call
          </MenuItem>
        </Menu>
        </Box>
      </Box>

      <Dialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 3,
          },
        }}
      >
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700, color: 'hsl(var(--foreground))' }}>
          Team scheduling
        </DialogTitle>
        <DialogContent dividers sx={{ borderColor: 'hsl(var(--border))' }}>
          {loadingScheduleUsers ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress sx={{ color: 'hsl(var(--primary))' }} />
            </Box>
          ) : (
            <OnCallScheduleManager users={scheduleUsers} loading={loadingScheduleUsers} compact />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScheduleOpen(false)} sx={{ textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>



      {permissionMsg && (
        <Alert
          severity={
            permissionMsg.toLowerCase().includes('error') ||
            permissionMsg.toLowerCase().includes('fail') ||
            permissionMsg.toLowerCase().includes('denied')
              ? 'error'
              : 'info'
          }
          onClose={() => setPermissionMsg(null)}
          sx={{ fontSize: '0.85rem' }}
        >
          {permissionMsg}

          {permissionMsg.toLowerCase().includes('denied') && (
            <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography sx={{ fontSize: '0.82rem', color: 'inherit' }}>
                {permissionHelp.device}: {permissionHelp.steps}
              </Typography>
              <Box
                component="code"
                sx={{
                  alignSelf: 'flex-start',
                  mt: 0.25,
                  px: 1.25,
                  py: 0.5,
                  borderRadius: 1,
                  bgcolor: 'hsl(var(--primary) / 0.12)',
                  color: 'hsl(var(--primary))',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  border: '1px solid hsl(var(--primary) / 0.25)',
                }}
              >
                {permissionHelp.siteLabel}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                {permissionHelp.internalUrl && (
                  <Button variant="outlined" size="small" onClick={handleCopySettingsPath} sx={outlinedButtonSx}>
                    {copiedPath ? 'Copied' : 'Copy settings URL'}
                  </Button>
                )}
                {permissionHelp.docsUrl && (
                  <Button
                    variant="outlined"
                    size="small"
                    component="a"
                    href={permissionHelp.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={outlinedButtonSx}
                  >
                    How to enable
                  </Button>
                )}
              </Box>
            </Box>
          )}
        </Alert>

      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {/* Critical Pager */}
        <NotificationSection
          title="Critical Pager"
          description={
            isMobileDevice
              ? 'Full-screen blaring alert for critical incidents and downtime.'
              : 'Only available in the mobile app. Browsers cannot deliver critical alerts.'
          }
          enabled={sectionEnabled('critical')}
          disabled={!criticalAvailable}
          onToggle={(value) => {
            if (value) {
              setConfirmCritical(true);
              return;
            }
            setSectionEnabled('critical', false);
          }}
          expanded={expanded === 'critical'}
          onExpandToggle={() => toggleExpanded('critical')}
          expandDisabled={!isGranted}
          onTest={testToken ? () => requestCriticalTest('push') : undefined}
          testing={sendingType === 'critical'}
          testDisabled={!criticalAvailable}
          testTooltip={
            criticalAvailable
              ? `Send a real critical pager push to ${testTargetName} right now, exactly as a live escalation would arrive.`
              : `Critical Pager is not available on ${testTargetName}, so it cannot be tested. It requires the mobile app.`
          }
        >
          <SettingRow
            label="Emergency siren"
            hint="Plays escalating siren audio while ringing."
            control={
              <>
                <Tooltip title="Play the siren audio in this browser tab only. No notification is sent." placement="left" arrow>
                  <span>
                    <Button variant="outlined" size="small" onClick={handleTestAudio} disabled={isPlayingTestSiren} sx={outlinedButtonSx}>
                      {isPlayingTestSiren ? 'Playing' : 'Test'}
                    </Button>
                  </span>
                </Tooltip>
                <Switch
                  checked={settings.sirenSoundEnabled}
                  onChange={(e) => update({ sirenSoundEnabled: e.target.checked })}
                  color="primary"
                  size="small"
                />
              </>
            }
          />

          <SettingRow
            label="Vibration"
            hint="Continuous haptic pulse while the device is ringing."
            control={
              <Switch
                checked={settings.vibrationEnabled}
                onChange={(e) => update({ vibrationEnabled: e.target.checked })}
                color="primary"
                size="small"
              />
            }
          />

          <SettingRow
            label="Ring duration before escalation"
            hint="Unacknowledged alerts pass to the next on-call tier."
            control={
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <Select
                  value={settings.autoEscalateTimeoutSeconds || 60}
                  onChange={(e) => update({ autoEscalateTimeoutSeconds: Number(e.target.value) })}
                  sx={{
                    height: 36,
                    fontSize: '0.85rem',
                    color: 'hsl(var(--foreground))',
                    '& fieldset': { borderColor: 'hsl(var(--border))' },
                  }}
                >
                  <MenuItem value={30}>30 seconds</MenuItem>
                  <MenuItem value={60}>60 seconds</MenuItem>
                  <MenuItem value={120}>2 minutes</MenuItem>
                  <MenuItem value={300}>5 minutes</MenuItem>
                </Select>
              </FormControl>
            }
          />

          <SettingRow
            label="Test delivery"
            control={
              <>
                <Tooltip title="Preview the incoming pager call screen locally in this tab. Nothing is sent to any device." placement="left" arrow>
                  <span>
                    <Button variant="outlined" size="small" onClick={() => requestCriticalTest('simulate')} disabled={!criticalAvailable} sx={outlinedButtonSx}>
                      Simulate call
                    </Button>
                  </span>
                </Tooltip>
                {Boolean(testToken) && (
                  <Tooltip title={`Send a real critical pager push through the Shuffle API to ${testTargetName}.`} placement="left" arrow>
                    <span>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => requestCriticalTest('push')}
                        disabled={sendingType === 'critical' || !criticalAvailable}
                        sx={outlinedButtonSx}
                      >
                        {sendingType === 'critical' ? 'Sending' : 'Send push'}
                      </Button>
                    </span>
                  </Tooltip>
                )}
              </>
            }
          />
        </NotificationSection>

        {/* Agent Request */}
        <NotificationSection
          title="Agent Request"
          description="Alerts when an AI agent needs your review or approval."
          enabled={sectionEnabled('agent_request')}
          disabled={!controlsAvailable}
          onToggle={(value) => setSectionEnabled('agent_request', value)}
          expanded={expanded === 'agent_request'}
          onExpandToggle={() => toggleExpanded('agent_request')}
          expandDisabled={!isGranted}
          onTest={testToken ? () => handleTestRemotePush('agent_request') : undefined}
          testing={sendingType === 'agent_request'}
          testTooltip={`Send a real agent-request push to ${testTargetName} right now, exactly as an agent approval would arrive.`}
        >
          <SettingRow
            label="Sound"
            hint="Plays a short chime when an agent asks for input."
            control={
              <Switch
                checked={settings.agentRequestSoundEnabled}
                onChange={(e) => update({ agentRequestSoundEnabled: e.target.checked })}
                color="primary"
                size="small"
              />
            }
          />

          <SettingRow
            label="Test delivery"
            control={
              <>
                <Tooltip title="Show an agent-request alert locally in this tab. Nothing is sent to any device." placement="left" arrow>
                  <span>
                    <Button variant="outlined" size="small" onClick={handleSimulateAgentRequest} disabled={!testToken} sx={outlinedButtonSx}>
                      Simulate
                    </Button>
                  </span>
                </Tooltip>
                {Boolean(testToken) && (
                  <Tooltip title={`Send a real agent-request push through the Shuffle API to ${testTargetName}.`} placement="left" arrow>
                    <span>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => handleTestRemotePush('agent_request')}
                        disabled={sendingType === 'agent_request'}
                        sx={outlinedButtonSx}
                      >
                        {sendingType === 'agent_request' ? 'Sending' : 'Send push'}
                      </Button>
                    </span>
                  </Tooltip>
                )}
              </>
            }
          />
        </NotificationSection>

        {/* General Notifications */}
        <NotificationSection
          title="General Notifications"
          description="Completed workflows, rotations, and reports."
          enabled={sectionEnabled('general')}
          disabled={!controlsAvailable}
          onToggle={(value) => setSectionEnabled('general', value)}
          expanded={expanded === 'general'}
          onExpandToggle={() => toggleExpanded('general')}
          expandDisabled={!isGranted}
          onTest={testToken ? () => handleTestRemotePush('general') : undefined}
          testing={sendingType === 'general'}
          testTooltip={`Send a real general push to ${testTargetName} right now, exactly as a routine update would arrive.`}
        >
          <SettingRow
            label="Sound"
            hint="Plays a short chime for informational updates."
            control={
              <Switch
                checked={settings.generalSoundEnabled}
                onChange={(e) => update({ generalSoundEnabled: e.target.checked })}
                color="primary"
                size="small"
              />
            }
          />

          <SettingRow
            label="Test delivery"
            control={
              <>
                <Tooltip title="Show a general notification locally in this tab. Nothing is sent to any device." placement="left" arrow>
                  <span>
                    <Button variant="outlined" size="small" onClick={handleSimulateGeneral} disabled={!testToken} sx={outlinedButtonSx}>
                      Simulate
                    </Button>
                  </span>
                </Tooltip>
                {Boolean(testToken) && (
                  <Tooltip title={`Send a real general push through the Shuffle API to ${testTargetName}.`} placement="left" arrow>
                    <span>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => handleTestRemotePush('general')}
                        disabled={sendingType === 'general'}
                        sx={outlinedButtonSx}
                      >
                        {sendingType === 'general' ? 'Sending' : 'Send push'}
                      </Button>
                    </span>
                  </Tooltip>
                )}
              </>
            }
          />
        </NotificationSection>
      </Box>



      <Dialog open={confirmCritical} onClose={() => setConfirmCritical(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>Enable Critical Pager?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: '0.88rem' }}>
            Critical Pager is not a normal notification. On the mobile app it triggers a full-screen,
            blaring alert that overrides silent mode for critical incidents. Are you sure you want to
            enable it for this device?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button size="small" onClick={() => setConfirmCritical(false)} sx={outlinedButtonSx}>
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={() => {
              setConfirmCritical(false);
              setSectionEnabled('critical', true);
            }}
            sx={{ height: 36, textTransform: 'none' }}
          >
            Enable
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(pendingCriticalTest)} onClose={() => setPendingCriticalTest(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>Test Critical Pager?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: '0.88rem' }}>
            You are about to trigger a full-screen, blaring critical pager alert on{' '}
            <strong>{testTargetName}</strong>.
            {pendingCriticalTest === 'push'
              ? ' A real push will be sent through the Shuffle API, exactly like a live escalation.'
              : ' This preview will open locally in this browser tab.'}{' '}
            Make sure you are ready before continuing.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button size="small" onClick={() => setPendingCriticalTest(null)} sx={outlinedButtonSx}>
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            color={pendingCriticalTest === 'push' ? 'error' : 'primary'}
            onClick={() => {
              const mode = pendingCriticalTest;
              setPendingCriticalTest(null);
              if (mode === 'push') {
                void handleTestRemotePush('critical');
              } else if (mode === 'simulate') {
                testPagerCall();
              }
            }}
            sx={{ height: 36, textTransform: 'none' }}
          >
            {pendingCriticalTest === 'push' ? 'Send push' : 'Simulate'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>


  );
};
