import { RegionFlagImage } from '@/components/shared/RegionFlagImage';
import { getRegionFlag } from '@/lib/regionFlag';
import { useState, useEffect, useCallback, ReactNode } from 'react';
import {
  Box,
  Typography,
  Paper,
  Switch,
  Button,
  Checkbox,
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
  TextField,
  InputAdornment,
} from '@mui/material';
import { ChevronDown, Smartphone, Monitor, MoreVertical, Bell, BellOff, CalendarClock, PhoneCall, Trash2, Copy, RotateCw, BarChart3 } from 'lucide-react';
import { toast } from '@/Shuffle-Core/lib/toast';
import { StatsSeriesDialog, deviceStatKey } from '@/Shuffle-Core/components/stats/StatsSeriesDialog';
import ApiCallViewer from '@/Shuffle-Core/components/ApiCallViewer';
import { AppStoreBadges } from '@/Shuffle-Core/components/AppStoreBadges';
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
  findLocalDevice,
  adoptLocalDeviceId,
  saveNotificationDevice,
  deleteNotificationDevice,
  setDeviceWebhook,
  resolveDevicePreferences,
  getSelectedOrgIdsForDeviceType,
  buildUpdatedOrgPreferences,
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
  disabledTooltip?: string;
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
  disabledTooltip,
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
          <Tooltip
            title={disabled && disabledTooltip ? disabledTooltip : ''}
            placement="top"
            arrow
          >
            <span>
              <Typography
                sx={{
                  fontWeight: 600,
                  fontSize: '0.92rem',
                  color: disabled ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
                  lineHeight: 1.3,
                }}
              >
                {title}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  color: 'hsl(var(--muted-foreground))',
                  opacity: disabled ? 0.7 : 1,
                  lineHeight: 1.35,
                }}
              >
                {description}
              </Typography>
            </span>
          </Tooltip>
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

export interface PagerTenantOption {
  id: string;
  name: string;
}

export interface PagerUserInfo {
  id?: string;
  username?: string;
  active_org?: { id?: string; name?: string };
  orgs?: Array<{ id?: string; name?: string }>;
}

export interface PagerNotificationSettingsProps {
  /** Current user. Optional — when omitted the component loads it from /api/v1/getinfo. */
  userInfo?: PagerUserInfo | null;
}

export const PagerNotificationSettings = ({ userInfo: userInfoProp }: PagerNotificationSettingsProps = {}) => {
  const [loadedUser, setLoadedUser] = useState<PagerUserInfo | null>(null);
  const userInfo = userInfoProp ?? loadedUser;

  useEffect(() => {
    if (userInfoProp && Array.isArray(userInfoProp.orgs) && userInfoProp.orgs.length > 0) return;
    let cancelled = false;
    fetch(getApiUrl('/api/v1/getinfo'), { credentials: 'include', headers: { ...getAuthHeader() } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setLoadedUser({
            id: data.id,
            username: data.username,
            active_org: data.active_org,
            orgs: Array.isArray(data.orgs) ? data.orgs : undefined,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userInfoProp]);

  const activeOrgId = userInfo?.active_org?.id || loadedUser?.active_org?.id || '';
  const userTenants: PagerTenantOption[] = (() => {
    const map = new Map<string, string>();
    const rawOrgs = [
      ...(Array.isArray(userInfo?.orgs) ? userInfo!.orgs! : []),
      ...(Array.isArray(loadedUser?.orgs) ? loadedUser!.orgs! : []),
      ...(userInfo?.active_org ? [userInfo.active_org] : []),
      ...(loadedUser?.active_org ? [loadedUser.active_org] : []),
    ];
    for (const org of rawOrgs) {
      const id = String(org?.id || '').trim();
      if (!id) continue;
      const name = String(org?.name || id).trim();
      if (!map.has(id)) {
        map.set(id, name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  })();
  const allTenantIds = userTenants.map((t) => t.id);

  const [settings, setSettings] = useState<PagerSettings>(getPagerSettings());
  const [isPlayingTestSiren, setIsPlayingTestSiren] = useState(false);
  const [sendingType, setSendingType] = useState<NotificationType | null>(null);
  const [permissionMsg, setPermissionMsg] = useState<string | null>(null);
  const [showAllowAction, setShowAllowAction] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [expanded, setExpanded] = useState<NotificationType | null>(null);
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [webhookExampleOpen, setWebhookExampleOpen] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [devices, setDevices] = useState<NotificationDevice[]>([]);
  const [localDeviceId, setLocalDeviceId] = useState('');
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsDeviceId, setStatsDeviceId] = useState<string>('');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [savingDevice, setSavingDevice] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NotificationDevice | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deletingDevice, setDeletingDevice] = useState(false);
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


  // Recognize this browser among registered devices by its push token when the
  // stored id was lost (cleared storage, other domain), and select it on load.
  useEffect(() => {
    if (!localDeviceId || devices.length === 0) return;
    const match = findLocalDevice(devices, localDeviceId, settings.pushToken || undefined);
    if (match && match.id !== localDeviceId) {
      adoptLocalDeviceId(match.id);
      setSelectedDeviceId((current) => (current === localDeviceId || !current ? match.id : current));
      setLocalDeviceId(match.id);
    }
  }, [devices, localDeviceId, settings.pushToken]);

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

  const deviceRegistered = Boolean(selectedDevice && devices.some((d) => d.id === selectedDevice.id));
  const localDeviceRow = localDeviceId ? devices.find((d) => d.id === localDeviceId) || null : null;
  const isNativeApp = typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.());
  // The mobile app registers its own push token, so a device the server already
  // knows about counts as registered even when this browser never granted web
  // notification permission. A failed save keeps the register button for retry.
  const localDeviceRegistered =
    Boolean(localDeviceRow && (localDeviceRow.token || localDeviceRow.has_token || localDeviceRow.push_registered)) ||
    Boolean(isNativeApp && settings.pushToken && localDeviceRow);
  const pushAvailable = isLocalSelected
    ? localDeviceRegistered || (settings.permissionStatus === 'granted' && Boolean(settings.pushToken))
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
    return remotePreferences[PREFERENCE_KEY[type]] === true;
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
          ? 'This device is not registered for notifications yet.'
          : `${selectedDevice.device_name || 'This device'} has no push token registered, so its preferences cannot be saved.`,
      );
      if (isLocalSelected) setShowAllowAction(true);
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


  const webhookAvailable = isMobileDevice && Boolean(selectedDevice && devices.some((d) => d.id === selectedDevice.id));
  const updateWebhook = async (enabled: boolean, regenerate = false) => {
    if (!selectedDevice) return;
    setWebhookBusy(true);
    const result = await setDeviceWebhook(selectedDevice.id, enabled, regenerate);
    setWebhookBusy(false);
    if (!result.success) {
      toast.error(`Could not update the webhook for ${selectedDevice.device_name || 'this device'}: ${result.reason}`);
      return;
    }
    const id = selectedDevice.id;
    setDevices((current) =>
      current.map((d) =>
        d.id === id
          ? {
              ...d,
              webhook_enabled: result.webhook_enabled,
              webhook_token: result.webhook_enabled ? result.webhook_token || d.webhook_token : undefined,
              webhook_url: result.webhook_enabled ? result.webhook_url || d.webhook_url : undefined,
            }
          : d,
      ),
    );
    toast.success(regenerate ? 'Webhook URL rotated. The old URL no longer works.' : enabled ? 'Webhook notifications enabled.' : 'Webhook notifications disabled.');
  };
  const copyWebhookUrl = async () => {
    if (!selectedDevice?.webhook_url) return;
    try {
      await navigator.clipboard.writeText(selectedDevice.webhook_url);
      toast.success('Webhook URL copied.');
    } catch {
      toast.error('Could not copy the webhook URL.');
    }
  };

  const selectedDeviceSaved = Boolean(selectedDevice && devices.some((d) => d.id === selectedDevice.id));

  const handleDeleteDevice = async () => {
    if (!deleteTarget) return;
    setDeletingDevice(true);
    setDeleteError('');
    const result = await deleteNotificationDevice(userInfo?.id || '', deleteTarget.id);
    setDeletingDevice(false);
    if (!result.success) {
      const message = `Failed to delete the device: ${result.reason || 'unknown error'}`;
      setDeleteError(message);
      toast.error(message);
      return;
    }
    setDevices((current) => current.filter((d) => d.id !== deleteTarget.id));
    if (selectedDeviceId === deleteTarget.id) {
      setSelectedDeviceId(localDeviceId);
    }
    setDeleteTarget(null);
    toast.success(`${deleteTarget.device_name || 'The device'} was removed from notifications.`);
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

  const setSectionTenants = (type: NotificationType, selectedOrgIds: string[]) => {
    const nextPrefs = buildUpdatedOrgPreferences(
      remotePreferences,
      type,
      selectedOrgIds,
      allTenantIds,
    );
    void persistDevicePreferences(nextPrefs);
  };

  const renderTenantRoutingRow = (type: NotificationType) => {
    const selectedTenantIds = getSelectedOrgIdsForDeviceType(remotePreferences, type, allTenantIds);
    const allSelected = allTenantIds.length === 0 || selectedTenantIds.length === allTenantIds.length;
    const deviceLabel = selectedDevice?.device_name || 'this device';

    return (
      <SettingRow
        label="Allowed tenants"
        hint={
          allTenantIds.length > 0 && selectedTenantIds.length === 0
            ? `No tenants are selected, so this device will not receive this page type until you select at least one. The setting stays enabled so you can change this at any time.`
            : `Choose which organizations can send this page type to ${deviceLabel}. All tenants are selected by default.`
        }
        control={
          <FormControl size="small" sx={{ minWidth: 190, maxWidth: 260 }}>
            <Select
              multiple
              displayEmpty
              value={selectedTenantIds}
              disabled={savingDevice || !controlsAvailable || allTenantIds.length === 0}
              onChange={(e) => {
                const rawVal = e.target.value;
                const valArray = Array.isArray(rawVal) ? rawVal.map(String) : String(rawVal).split(',');
                setSectionTenants(
                  type,
                  valArray.filter((v) => v),
                );
              }}
              renderValue={() => {
                if (allTenantIds.length === 0) return 'All tenants';
                if (selectedTenantIds.length === allTenantIds.length) {
                  return allTenantIds.length > 1 ? `All tenants (${allTenantIds.length})` : (userTenants[0]?.name || 'All tenants');
                }
                if (selectedTenantIds.length === 0) return 'No tenants';
                if (selectedTenantIds.length === 1) {
                  return userTenants.find((t) => t.id === selectedTenantIds[0])?.name || selectedTenantIds[0];
                }
                return `${selectedTenantIds.length} of ${allTenantIds.length} tenants`;
              }}
              sx={{
                height: 36,
                fontSize: '0.85rem',
                color: 'hsl(var(--foreground))',
                '& fieldset': { borderColor: 'hsl(var(--border))' },
              }}
            >
              <Box
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                sx={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 1,
                  py: 0.25,
                }}
              >
                <Button
                  size="small"
                  disabled={allSelected}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSectionTenants(type, allTenantIds);
                  }}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    minWidth: 0,
                    px: 1,
                    color: 'hsl(var(--primary))',
                  }}
                >
                  Select all
                </Button>
                <Button
                  size="small"
                  disabled={selectedTenantIds.length === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSectionTenants(type, []);
                  }}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    minWidth: 0,
                    px: 1,
                    color: 'hsl(var(--muted-foreground))',
                  }}
                >
                  Unselect all
                </Button>
              </Box>
              {userTenants.length > 0 && <Divider sx={{ my: 0.5, borderColor: 'hsl(var(--border))' }} />}
              {userTenants.map((tenant) => {
                const checked = selectedTenantIds.includes(tenant.id);
                const isCurrent = tenant.id === activeOrgId;
                return (
                  <MenuItem
                    key={tenant.id}
                    value={tenant.id}
                    sx={{
                      fontSize: '0.82rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 1.5,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: '0.82rem',
                        color: 'hsl(var(--foreground))',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tenant.name}
                      {isCurrent ? ' (current)' : ''}
                    </Typography>
                    <Checkbox size="small" checked={checked} color="primary" sx={{ pointerEvents: 'none', p: 0.25 }} />
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        }
      />
    );
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
          'Could not register this device. Try again.',
        );
        setShowAllowAction(true);
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
    setShowAllowAction(false);
    setSavingDevice(true);
    try {
      const pushSupported =
        typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
      if (pushSupported && Notification.permission === 'default') {
        await requestNotificationPermissions();
      }
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
      // The native app registers its own push token, so web push support does
      // not matter there. If this device already has a token, it worked.
      const freshDevices = await fetchNotificationDevices();
      setDevices(freshDevices);
      const nativeApp = typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.());
      if (findLocalDevice(freshDevices, localDeviceId, settings.pushToken || undefined)?.token || (nativeApp && settings.pushToken)) {
        setPermissionMsg('This device is registered for push notifications.');
        return;
      }
      if (typeof window !== 'undefined' && window.top !== window.self) {
        setPermissionMsg(
          'Push token registration is blocked inside the preview iframe. Open this page in its own browser tab and click Register this device.',
        );
      } else if (!pushSupported) {
        const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
        setPermissionMsg(
          /iPad|iPhone|iPod/.test(ua)
            ? 'On iPhone, push only works from the Home Screen. Tap Share, then Add to Home Screen, and open Shuffle from there.'
            : 'This browser does not support push notifications. Try Chrome, Edge or Safari.',
        );
      } else if (Notification.permission === 'denied') {
        setPermissionMsg('Notifications are denied for this site.');
      } else if (Notification.permission === 'default') {
        setPermissionMsg('Notifications are not allowed yet.');
        setShowAllowAction(true);
      } else {
        setPermissionMsg('Could not register this device. Try again.');
        setShowAllowAction(true);
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
          `Notifications are not allowed yet on ${selectedDevice?.device_name || 'this device'}.`,
        );
        if (isLocalSelected) setShowAllowAction(true);
      } else if (typeof window !== 'undefined' && window.top !== window.self) {
        setPermissionMsg(
          'Notification permission is granted, but push registration does not work inside the preview iframe. Open the app in its own browser tab and reload to register a push token.',
        );
      } else {
        setPermissionMsg(
          `${selectedDevice?.device_name || 'This device'} is not registered for push yet.`,
        );
        if (isLocalSelected) setShowAllowAction(true);
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
      elevation={0}
      sx={{
        bgcolor: 'transparent',
        backgroundImage: 'none',
        border: 'none',
        boxShadow: 'none',
        py: 1.25,
        display: 'flex',
        flexDirection: 'column',
        gap: 2.5,
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
            flexWrap: { xs: 'wrap', sm: 'nowrap' },
            minWidth: 0,
            width: { xs: '100%', sm: 'auto' },
            justifyContent: { xs: 'flex-start', sm: 'flex-end' },
            '& > *': { minWidth: 0 },
          }}
        >

        {isLocalSelected && !localDeviceRegistered && (
          <Tooltip
            title={
              isGranted
                ? inIframe
                  ? 'Permission granted, but the preview iframe blocks token registration. Open this page in its own browser tab to register this device.'
                  : settings.pushToken
                  ? 'This device could not be saved to your account. Click to try again.'
                  : 'Permission granted, but no push token is registered for this device yet.'
                : 'Notifications are not registered on this device yet.'
            }
          >
            <Box component="span" sx={{ flexBasis: { xs: '100%', sm: 'auto' } }}>
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
                  width: { xs: '100%', sm: 'auto' },
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
            </Box>
          </Tooltip>
        )}

        {deviceList.length > 0 && (
          <FormControl size="small" sx={{ flex: { xs: '1 1 0', sm: '1 1 auto' }, minWidth: 0, maxWidth: { xs: 'none', sm: 160 } }}>
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
                    {device?.region && <RegionFlagImage code={getRegionFlag(device.region).code} />}
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
                    {device.region && <RegionFlagImage code={getRegionFlag(device.region).code} />}
                    {(device.device_name || device.id) +
                      (device.id === localDeviceId ? ' (this device)' : '')}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        )}

        {deviceList.length > 0 && selectedDeviceSaved && (
          <Tooltip title={`Delete ${selectedDevice?.device_name || 'this device'} from notifications`}>
            <span>
              <IconButton
                size="small"
                onClick={() => setDeleteTarget(selectedDevice)}
                disabled={savingDevice || deletingDevice}
                aria-label="Delete device"
                sx={{ color: 'hsl(var(--muted-foreground))' }}
              >
                <Trash2 size={16} />
              </IconButton>
            </span>
          </Tooltip>
        )}

        <Tooltip title="Notification statistics">
          <IconButton
            size="small"
            onClick={() => setStatsOpen(true)}
            aria-label="Notification statistics"
            sx={{ color: 'hsl(var(--muted-foreground))', display: { xs: 'none', sm: 'inline-flex' } }}
          >
            <BarChart3 size={16} />
          </IconButton>
        </Tooltip>
        <StatsSeriesDialog
          open={statsOpen}
          onClose={() => setStatsOpen(false)}
          title="Notification statistics"
          toolbar={
            devices.length > 0 ? (
              <Select
                size="small"
                value={statsDeviceId}
                onChange={(e) => setStatsDeviceId(e.target.value)}
                displayEmpty
                aria-label="Choose device"
                sx={{ fontSize: '0.75rem', height: 28, minWidth: 130 }}
              >
                <MenuItem value="" sx={{ fontSize: '0.78rem' }}>All devices</MenuItem>
                {devices.map((d) => (
                  <MenuItem key={d.id} value={d.id} sx={{ fontSize: '0.78rem' }}>
                    {d.device_name || d.id}
                  </MenuItem>
                ))}
              </Select>
            ) : undefined
          }
          series={
            statsDeviceId
              ? (['general', 'critical', 'webhook'] as const).map((t) => ({
                  key: deviceStatKey(statsDeviceId, t),
                  label: t === 'critical' ? 'Critical Pager' : t === 'general' ? 'General' : 'Webhook',
                }))
              : [
                  { key: 'device_notifications', label: 'All notifications' },
                  { key: 'device_notifications_general', label: 'General' },
                  { key: 'device_notifications_critical', label: 'Critical Pager' },
                  { key: 'device_notifications_agent_request', label: 'Agent requests' },
                  { key: 'device_notifications_webhook', label: 'Webhook' },
                ]
          }
        />

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
            disabled={!testToken || !controlsAvailable}
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
          onClose={() => { setPermissionMsg(null); setShowAllowAction(false); }}
          sx={{ fontSize: '0.85rem' }}
        >
          {permissionMsg}

          {showAllowAction && (
            <Box sx={{ mt: 1.5 }}>
              <Button
                variant="contained"
                size="small"
                disableElevation
                disabled={savingDevice}
                onClick={() => void handleRegisterLocalPush()}
                sx={{ height: 32, width: { xs: '100%', sm: 'auto' }, textTransform: 'none', bgcolor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
              >
                {typeof Notification !== 'undefined' && Notification.permission === 'default' ? 'Allow notifications' : 'Try again'}
              </Button>
            </Box>
          )}

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

      {/* On phones, hide the sections until the selected device can get notifications. */}
      <Box sx={{ display: { xs: controlsAvailable ? 'flex' : 'none', sm: 'flex' }, flexDirection: 'column', gap: 2 }}>
        {/* General Notifications */}
        <NotificationSection
          title="General Notifications"
          description="Completed workflows, rotations, and reports."
          enabled={sectionEnabled('general')}
          disabled={!controlsAvailable}
          onToggle={(value) => setSectionEnabled('general', value)}
          expanded={expanded === 'general'}
          onExpandToggle={() => toggleExpanded('general')}
          expandDisabled={!controlsAvailable}
          onTest={testToken ? () => handleTestRemotePush('general') : undefined}
          testing={sendingType === 'general'}
          testTooltip={`Send a real general push to ${testTargetName} right now, exactly as a routine update would arrive.`}
        >
          {renderTenantRoutingRow('general')}

          <SettingRow
            label="Sound"
            hint="Plays a short chime for informational updates."
            control={
              <Switch
                checked={settings.generalSoundEnabled}
                onChange={(e) => update({ generalSoundEnabled: e.target.checked })}
                disabled={!controlsAvailable}
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
                    <Button variant="outlined" size="small" onClick={handleSimulateGeneral} disabled={!testToken || !controlsAvailable} sx={outlinedButtonSx}>
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
                        disabled={sendingType === 'general' || !controlsAvailable}
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
          disabledTooltip="Critical Pager is only available in the mobile app. Browsers cannot deliver critical alerts."
          onToggle={(value) => {
            if (value) {
              setConfirmCritical(true);
              return;
            }
            setSectionEnabled('critical', false);
          }}
          expanded={expanded === 'critical'}
          onExpandToggle={() => toggleExpanded('critical')}
          onTest={testToken ? () => requestCriticalTest('push') : undefined}
          testing={sendingType === 'critical'}
          testDisabled={!criticalAvailable}
          testTooltip={
            criticalAvailable
              ? `Send a real critical pager push to ${testTargetName} right now, exactly as a live escalation would arrive.`
              : `Critical Pager is not available on ${testTargetName}, so it cannot be tested. It requires the mobile app.`
          }
        >
          {!criticalAvailable && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', lineHeight: 1.4 }}>
                Critical Pager requires the Shuffle mobile app. Install it on your phone to receive
                full-screen critical alerts that override silent mode.
              </Typography>
              <AppStoreBadges height={36} iosComingSoon />
            </Box>
          )}
          {criticalAvailable && (
            <>
          {renderTenantRoutingRow('critical')}

          <SettingRow
            label="Emergency siren"
            hint="Plays escalating siren audio while ringing."
            control={
              <>
                <Tooltip title="Play the siren audio in this browser tab only. No notification is sent." placement="left" arrow>
                  <span>
                    <Button variant="outlined" size="small" onClick={handleTestAudio} disabled={isPlayingTestSiren || !criticalAvailable} sx={outlinedButtonSx}>
                      {isPlayingTestSiren ? 'Playing' : 'Test'}
                    </Button>
                  </span>
                </Tooltip>
                <Switch
                  checked={settings.sirenSoundEnabled}
                  onChange={(e) => update({ sirenSoundEnabled: e.target.checked })}
                  disabled={!criticalAvailable}
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
                disabled={!criticalAvailable}
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
                  disabled={!criticalAvailable}
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
                    <Button variant="outlined" size="small" onClick={() => requestCriticalTest('simulate')} disabled={!criticalAvailable || !controlsAvailable} sx={outlinedButtonSx}>
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
                        disabled={sendingType === 'critical' || !criticalAvailable || !controlsAvailable}
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
            </>
          )}
        </NotificationSection>

        {/* Webhook notifications: URL field with copy and enable/disable inside it */}
        <Box
          sx={{
            borderRadius: 2,
            bgcolor: 'hsl(var(--muted) / 0.15)',
            p: 2,
          }}
        >
          <TextField
            value={selectedDevice?.webhook_url || ''}
            placeholder="No webhook URL yet"
            size="small"
            fullWidth
            disabled={!selectedDevice?.webhook_url}
            aria-label="Webhook URL"
            InputProps={{
              readOnly: true,
              sx: { fontFamily: 'monospace', fontSize: '0.8rem' },
              endAdornment: (
                <InputAdornment position="end" sx={{ pointerEvents: 'auto' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Tooltip title="Copy the webhook URL" arrow>
                      <span>
                        <IconButton
                          size="small"
                          onClick={copyWebhookUrl}
                          disabled={!selectedDevice?.webhook_url}
                          aria-label="Copy webhook URL"
                        >
                          <Copy size={16} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Rotate the webhook URL. The old URL stops working." arrow>
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => setConfirmRotate(true)}
                          disabled={!webhookAvailable || webhookBusy || !selectedDevice?.webhook_url}
                          aria-label="Rotate webhook URL"
                        >
                          <RotateCw size={16} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip
                      title={selectedDevice?.webhook_url ? 'How to send to this webhook' : 'A webhook URL is needed first.'}
                      arrow
                    >
                      <span>
                        <Button size="small" variant="outlined" onClick={() => setWebhookExampleOpen(true)}
                          disabled={!selectedDevice?.webhook_url}
                          sx={{ height: 26, minWidth: 0, px: 1.25, fontSize: '0.72rem', textTransform: 'none', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                          Example
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip
                      title={
                        !webhookAvailable
                          ? 'Only devices running the mobile app can use a webhook.'
                          : selectedDevice?.webhook_enabled
                            ? 'Turns the webhook URL off.'
                            : 'Turns the webhook URL on.'
                      }
                      arrow
                    >
                      <span>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => updateWebhook(!selectedDevice?.webhook_enabled)}
                          disabled={!webhookAvailable || webhookBusy}
                          sx={{
                            height: 26,
                            minWidth: 0,
                            px: 1.25,
                            fontSize: '0.72rem',
                            textTransform: 'none',
                            borderColor: 'hsl(var(--border))',
                            color: 'hsl(var(--foreground))',
                          }}
                        >
                          {webhookBusy ? 'Saving' : selectedDevice?.webhook_enabled ? 'Disable' : 'Enable'}
                        </Button>
                      </span>
                    </Tooltip>
                  </Box>
                </InputAdornment>
              ),
            }}
          />
        </Box>

      </Box>



      <Dialog open={webhookExampleOpen} onClose={() => setWebhookExampleOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>Webhook example</DialogTitle>
        <DialogContent>
          <ApiCallViewer
            title="Webhook example"
            maskAuth={false}
            rawCurl={`curl -X POST '${selectedDevice?.webhook_url || '<webhook_url>'}' -H 'Content-Type: application/json' -d '{"title": "Ransomware behavior detected on FIN-LAPTOP-042", "body": "EDR flagged mass file encryption by svchost.exe (PID 4412). Host isolation recommended.", "type": "critical", "severity": "critical", "source": "EDR", "reference_url": "https://shuffle.security/incidents"}'`}
          />
          <Typography sx={{ mt: 1.5, fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}>
            type: general | critical | agent_request
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button size="small" onClick={() => setWebhookExampleOpen(false)} sx={outlinedButtonSx}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmRotate} onClose={() => setConfirmRotate(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>Rotate webhook URL?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: '0.88rem' }}>
            A new webhook URL will be created for this device and the current one will stop working
            immediately. Anything still sending to the old URL will fail until it is updated.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button size="small" onClick={() => setConfirmRotate(false)} sx={outlinedButtonSx}>
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            color="warning"
            onClick={() => {
              setConfirmRotate(false);
              updateWebhook(true, true);
            }}
            sx={{ height: 36, textTransform: 'none' }}
          >
            Rotate URL
          </Button>
        </DialogActions>
      </Dialog>

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

      <Dialog open={Boolean(deleteTarget)} onClose={() => { if (!deletingDevice) { setDeleteTarget(null); setDeleteError(''); } }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>Delete device?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: '0.88rem' }}>
            <strong>{deleteTarget?.device_name || 'This device'}</strong> will no longer receive
            notifications. You can register it again later from that device.
          </DialogContentText>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2, fontSize: '0.82rem' }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button size="small" onClick={() => { setDeleteTarget(null); setDeleteError(''); }} disabled={deletingDevice} sx={outlinedButtonSx}>
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={() => void handleDeleteDevice()}
            disabled={deletingDevice}
            sx={{ height: 36, textTransform: 'none' }}
          >
            {deletingDevice ? <CircularProgress size={16} color="inherit" /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>


  );
};
