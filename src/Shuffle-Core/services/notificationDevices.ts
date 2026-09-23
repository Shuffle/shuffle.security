import {
  getApiUrl,
  getAuthHeader,
  isCapacitorNative,
  isAndroid,
  isIos,
  isAndroidWebView,
  isIosWebView,
} from '@/Shuffle-Core/api';
import { safeRandomUUID } from '@/utils/uuid';

export interface DevicePreferences {
  critical_pager: boolean;
  agent_requests: boolean;
  general_alerts: boolean;
}

export interface NotificationDevice {
  id: string;
  token?: string;
  has_token?: boolean;
  push_registered?: boolean;
  platform?: string;
  device_name?: string;
  preferences?: Partial<DevicePreferences>;
}

const DEVICE_ID_KEY = 'shuffle_notification_device_id';

export const DEFAULT_DEVICE_PREFERENCES: DevicePreferences = {
  critical_pager: false,
  agent_requests: false,
  general_alerts: false,
};

/** Stable per-browser/device identifier, generated once and persisted. */
export const getLocalDeviceId = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const generated = safeRandomUUID();
    localStorage.setItem(DEVICE_ID_KEY, generated);
    return generated;
  } catch {
    return '';
  }
};

export const getLocalDevicePlatform = (): string => {
  if (typeof window === 'undefined') return 'browser';
  if (isIos()) return 'ios';
  if (isAndroid()) return 'android';
  return 'browser';
};

export const getLocalDeviceName = (): string => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isNative = isCapacitorNative();
  const isAndroidApp = isNative ? isAndroid() : isAndroidWebView();
  const isIosApp = isNative ? isIos() : isIosWebView();

  // Extract Android phone model if present in User-Agent
  let androidModel = '';
  const androidMatch = ua.match(/Android\s+[\d.]+;\s*([^;)]+?)(?:\s+Build|\)|\s+wv)/i);
  if (androidMatch && androidMatch[1]) {
    const raw = androidMatch[1].trim();
    if (raw && raw !== 'K' && !/^mobile$/i.test(raw)) {
      androidModel = raw;
    }
  }

  if (isAndroidApp) {
    return androidModel ? `Android App (${androidModel})` : 'Android App';
  }

  if (isIosApp) {
    if (/iPad/.test(ua)) return 'iOS App (iPad)';
    if (/iPhone/.test(ua)) return 'iOS App (iPhone)';
    return 'iOS App';
  }

  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\/|Chromium\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';

  if (/Android/.test(ua)) {
    return androidModel ? `${browser} on Android (${androidModel})` : `${browser} on Android`;
  }

  if (/iPad/.test(ua)) return `${browser} on iPad`;
  if (/iPhone|iPod/.test(ua)) return `${browser} on iPhone`;

  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Macintosh|Mac OS X/.test(ua)
      ? 'macOS'
      : /Linux/.test(ua)
        ? 'Linux'
        : 'Unknown';

  return `${browser} on ${os}`;
};

const extractDevices = (payload: unknown): NotificationDevice[] => {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const raw =
    (record.devices as unknown) ??
    ((record.user as Record<string, unknown> | undefined)?.devices as unknown) ??
    ((record.settings as Record<string, unknown> | undefined)?.devices as unknown);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is NotificationDevice => Boolean(item) && typeof item === 'object')
    .filter((item) => Boolean(item.id || item.device_name));
};

/** Loads the registered notification devices from the current user via /api/v1/getsettings or /api/v1/getinfo. */
export const fetchNotificationDevices = async (): Promise<NotificationDevice[]> => {
  try {
    // 1. Check /api/v1/getsettings first
    const settingsRes = await fetch(getApiUrl('/api/v1/getsettings'), {
      credentials: 'include',
      headers: { ...getAuthHeader() },
    });
    if (settingsRes.ok) {
      const settingsData = await settingsRes.json();
      const extracted = extractDevices(settingsData);
      if (extracted.length > 0) return extracted;
    }

    // 2. Fallback to /api/v1/getinfo
    const infoRes = await fetch(getApiUrl('/api/v1/getinfo'), {
      credentials: 'include',
      headers: { ...getAuthHeader() },
    });
    if (infoRes.ok) {
      const infoData = await infoRes.json();
      return extractDevices(infoData);
    }
    return [];
  } catch {
    return [];
  }
};

export interface SaveDeviceResult {
  success: boolean;
  reason?: string;
}

/** Registers or updates a device on the current user. */
export const saveNotificationDevice = async (
  userId: string,
  device: NotificationDevice,
): Promise<SaveDeviceResult> => {
  try {
    const response = await fetch(getApiUrl('/api/v1/updateuser'), {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ user_id: userId, device }),
    });
    if (response.ok) {
      return { success: true };
    }
    const data = await response.json().catch(() => ({}));
    return { success: false, reason: data?.reason || `HTTP ${response.status}` };
  } catch (error) {
    return { success: false, reason: error instanceof Error ? error.message : 'Network error' };
  }
};

export const resolveDevicePreferences = (device?: NotificationDevice | null): DevicePreferences => ({
  ...DEFAULT_DEVICE_PREFERENCES,
  ...(device?.preferences || {}),
});
