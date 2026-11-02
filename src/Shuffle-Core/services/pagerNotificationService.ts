import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics } from '@capacitor/haptics';
import { isCapacitorNative, getApiUrl, shuffleFetch } from '@/Shuffle-Core/api';
import {
  registerFirebaseWebPush,
  subscribeToWebForegroundMessages,
  getStoredVapidKey,
  saveStoredVapidKey,
} from '@/Shuffle-Core/config/firebaseWebConfig';

export { getStoredVapidKey, saveStoredVapidKey, registerFirebaseWebPush };

export interface PagerIncident {
  id: string;
  notificationId?: string;
  orgId?: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | string;
  source?: string;
  orgName?: string;
  timestamp?: number;
  tier?: string;
  description?: string;
}

export interface PagerSettings {
  pagerCallingEnabled: boolean;
  sirenSoundEnabled: boolean;
  vibrationEnabled: boolean;
  autoEscalateTimeoutSeconds: number;
  agentRequestEnabled: boolean;
  agentRequestSoundEnabled: boolean;
  generalNotificationsEnabled: boolean;
  generalSoundEnabled: boolean;
  pushToken?: string | null;
  permissionStatus?: 'granted' | 'denied' | 'prompt' | 'unknown';
}

const STORAGE_KEY = 'shuffle_pager_settings';
const INCOMING_CALL_EVENT = 'shuffle:incoming-pager-call';
const CALL_DISMISSED_EVENT = 'shuffle:pager-call-dismissed';

const DEFAULT_SETTINGS: PagerSettings = {
  pagerCallingEnabled: false,
  sirenSoundEnabled: true,
  vibrationEnabled: true,
  autoEscalateTimeoutSeconds: 60,
  agentRequestEnabled: false,
  agentRequestSoundEnabled: true,
  generalNotificationsEnabled: false,
  generalSoundEnabled: false,
  pushToken: null,
  permissionStatus: 'unknown',
};


// ── Settings Manager ─────────────────────────────────────────────────────────

export const getPagerSettings = (): PagerSettings => {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const savePagerSettings = (settings: Partial<PagerSettings>): PagerSettings => {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const current = getPagerSettings();
    const next = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('shuffle:pager-settings-changed', { detail: next }));
    return next;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

// ── Web Audio Emergency Siren Synthesizer ────────────────────────────────────

let audioCtx: AudioContext | null = null;
let sirenOscillator1: OscillatorNode | null = null;
let sirenOscillator2: OscillatorNode | null = null;
let sirenGainNode: GainNode | null = null;
let sirenLfoNode: OscillatorNode | null = null;
let sirenLfoGain: GainNode | null = null;
let sirenInterval: number | null = null;
let vibrationInterval: number | null = null;
let autoEscalateTimer: number | null = null;
let activeCallIncident: PagerIncident | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
};

export const startEmergencySiren = () => {
  const settings = getPagerSettings();
  if (!settings.sirenSoundEnabled) return;

  stopEmergencySiren();

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Dual-tone urgent pulsing siren (880 Hz warbling to 1320 Hz at 4 Hz)
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.01, ctx.currentTime);
    masterGain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.1);
    masterGain.connect(ctx.destination);
    sirenGainNode = masterGain;

    // Carrier Oscillator 1 (Square wave for sharp penetration)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(880, ctx.currentTime);

    // Carrier Oscillator 2 (Higher harmonic)
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, ctx.currentTime);

    // LFO frequency modulator for the alternating pager siren
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.setValueAtTime(3.5, ctx.currentTime);

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(350, ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    osc1.connect(masterGain);
    osc2.connect(masterGain);

    osc1.start();
    osc2.start();
    lfo.start();

    sirenOscillator1 = osc1;
    sirenOscillator2 = osc2;
    sirenLfoNode = lfo;
    sirenLfoGain = lfoGain;
  } catch {
    // Web Audio fallback silence
  }
};

export const stopEmergencySiren = () => {
  if (sirenInterval) {
    window.clearInterval(sirenInterval);
    sirenInterval = null;
  }

  try {
    if (sirenGainNode && audioCtx) {
      sirenGainNode.gain.setValueAtTime(sirenGainNode.gain.value, audioCtx.currentTime);
      sirenGainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    }
  } catch {
    // Ignore
  }

  setTimeout(() => {
    try {
      if (sirenOscillator1) {
        sirenOscillator1.stop();
        sirenOscillator1.disconnect();
        sirenOscillator1 = null;
      }
      if (sirenOscillator2) {
        sirenOscillator2.stop();
        sirenOscillator2.disconnect();
        sirenOscillator2 = null;
      }
      if (sirenLfoNode) {
        sirenLfoNode.stop();
        sirenLfoNode.disconnect();
        sirenLfoNode = null;
      }
      if (sirenLfoGain) {
        sirenLfoGain.disconnect();
        sirenLfoGain = null;
      }
      if (sirenGainNode) {
        sirenGainNode.disconnect();
        sirenGainNode = null;
      }
    } catch {
      // Ignore
    }
  }, 60);
};

// ── Vibration & Haptics Engine ───────────────────────────────────────────────

export const startPagerVibration = () => {
  const settings = getPagerSettings();
  if (!settings.vibrationEnabled) return;

  stopPagerVibration();

  const pulse = () => {
    try {
      if (isCapacitorNative()) {
        Haptics.vibrate({ duration: 800 }).catch(() => {});
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([600, 200, 600, 200]);
      }
    } catch {
      // Ignore vibration error
    }
  };

  pulse();
  vibrationInterval = window.setInterval(pulse, 1600);
};

export const stopPagerVibration = () => {
  if (vibrationInterval) {
    window.clearInterval(vibrationInterval);
    vibrationInterval = null;
  }
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(0);
    }
  } catch {
    // Ignore
  }
};

// ── Push & Local Notifications ───────────────────────────────────────────────

export const initializeNotificationChannels = async () => {
  if (!isCapacitorNative()) return;

  try {
    await LocalNotifications.createChannel({
      id: 'critical_pager',
      name: 'Critical Incident Pager Alerts',
      description: 'High-urgency alerts and incoming escalation calls for on-call personnel',
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: 'res://raw/alert',
      lights: true,
      lightColor: '#FF6600',
    });
  } catch {
    // Channel initialization ignored if already exists
  }
};

export const requestNotificationPermissions = async (): Promise<boolean> => {
  if (!isCapacitorNative()) {
    if (typeof Notification !== 'undefined') {
      try {
        const res = await Notification.requestPermission();
        const granted = res === 'granted';
        savePagerSettings({ permissionStatus: granted ? 'granted' : 'denied' });

        if (granted) {
          // Attempt Firebase Web Push registration with VAPID key
          const webToken = await registerFirebaseWebPush();
          if (webToken) {
            savePagerSettings({ pushToken: webToken, permissionStatus: 'granted' });
          }
        }
        return granted;
      } catch {
        return false;
      }
    }
    return false;
  }

  try {
    const pushPerm = await PushNotifications.requestPermissions();
    const localPerm = await LocalNotifications.requestPermissions();
    const granted = pushPerm.receive === 'granted' && localPerm.display === 'granted';

    savePagerSettings({ permissionStatus: granted ? 'granted' : 'denied' });

    if (granted) {
      await initializeNotificationChannels();
      await PushNotifications.register();
    }
    return granted;
  } catch {
    return false;
  }
};

export const setupPushNotificationListeners = () => {
  if (!isCapacitorNative()) {
    // Web browser foreground listener
    subscribeToWebForegroundMessages((payload) => {
      const data = payload.data || {};
      if (data.type === 'pager_alert' || data.incidentId) {
        triggerIncomingPagerCall({
          id: data.incidentId || data.notificationId || String(Date.now()),
          notificationId: data.notificationId,
          orgId: data.orgId,
          title: payload.title || data.title || 'Critical Security Incident',
          severity: data.severity || 'critical',
          source: data.source || 'Shuffle SOC',
          orgName: data.orgName,
          tier: data.tier,
          description: payload.body || data.description,
        });
      } else if (data.type === 'agent_request') {
        triggerAgentRequestLocalAlert({
          title: payload.title || data.title || 'AI Agent Input Required',
          body: payload.body || data.body,
          executionId: data.executionId,
          workflowId: data.workflowId,
          action: data.action,
        });
      } else if (data.type === 'general_notification') {
        triggerGeneralLocalAlert({
          title: payload.title || data.title || 'Shuffle Security Update',
          body: payload.body || data.body,
          description: data.description,
          referenceUrl: data.referenceUrl,
        });
      }
    });
    return;
  }

  try {
    PushNotifications.addListener('registration', (token) => {
      savePagerSettings({ pushToken: token.value });
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.warn('Push registration error:', error);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const data = notification.data || {};
      if (data.type === 'pager_alert' || data.incidentId) {
        triggerIncomingPagerCall({
          id: data.incidentId || data.notificationId || String(Date.now()),
          notificationId: data.notificationId,
          orgId: data.orgId,
          title: notification.title || data.title || 'Critical Security Incident',
          severity: data.severity || 'critical',
          source: data.source || 'Shuffle SOC',
          orgName: data.orgName,
          tier: data.tier,
          description: notification.body || data.description,
        });
      } else if (data.type === 'agent_request') {
        triggerAgentRequestLocalAlert({
          title: notification.title || data.title || 'AI Agent Input Required',
          body: notification.body || data.body,
          executionId: data.executionId,
          workflowId: data.workflowId,
          action: data.action,
        });
      } else if (data.type === 'general_notification') {
        triggerGeneralLocalAlert({
          title: notification.title || data.title || 'Shuffle Security Update',
          body: notification.body || data.body,
          description: data.description,
          referenceUrl: data.referenceUrl,
        });
      }
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification.data || {};
      if (data.incidentId && typeof window !== 'undefined') {
        window.location.href = `/incidents/${data.incidentId}`;
      }
    });
  } catch {
    // Ignore listener setup errors
  }
};

// ── Call Lifecycle Management ────────────────────────────────────────────────

export const triggerIncomingPagerCall = (incident: PagerIncident) => {
  const settings = getPagerSettings();
  if (!settings.pagerCallingEnabled) return;

  activeCallIncident = incident;

  // 1. Audio siren & vibration
  startEmergencySiren();
  startPagerVibration();

  // 2. Dispatch event for full-screen incoming call overlay
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(INCOMING_CALL_EVENT, {
        detail: { incident },
      }),
    );
  }

  // 3. Local notification on device (Native Mobile or Desktop Browser)
  if (isCapacitorNative()) {
    LocalNotifications.schedule({
      notifications: [
        {
          title: `CRITICAL ALERT: ${incident.title}`,
          body: `Incoming escalation call from ${incident.source || 'Shuffle Security'}. Tap to acknowledge.`,
          id: Math.floor(Math.random() * 100000),
          channelId: 'critical_pager',
          extra: { incidentId: incident.id },
          actionTypeId: 'PAGER_ALERT_ACTIONS',
        },
      ],
    }).catch(() => {});
  } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const notif = new Notification(`CRITICAL ALERT: ${incident.title}`, {
        body: `Incoming emergency call from ${incident.source || 'Shuffle Security'}. Tap to acknowledge.`,
        icon: '/favicon.ico',
        requireInteraction: true,
        tag: incident.id,
      });
      notif.onclick = () => {
        if (typeof window !== 'undefined') window.focus();
        notif.close();
      };
    } catch {
      // Ignore desktop notification error
    }
  }

  // 4. Auto-escalate timer
  if (autoEscalateTimer) {
    window.clearTimeout(autoEscalateTimer);
  }
  const timeoutMs = (settings.autoEscalateTimeoutSeconds || 60) * 1000;
  autoEscalateTimer = window.setTimeout(() => {
    handleAutoEscalate(incident);
  }, timeoutMs);
};

export const dismissPagerCall = (incidentId?: string, notificationId?: string) => {
  const resolvedNotifId = notificationId || activeCallIncident?.notificationId;
  stopEmergencySiren();
  stopPagerVibration();
  if (autoEscalateTimer) {
    window.clearTimeout(autoEscalateTimer);
    autoEscalateTimer = null;
  }
  activeCallIncident = null;

  if (resolvedNotifId && resolvedNotifId.length === 36) {
    shuffleFetch(getApiUrl(`/api/v1/notifications/${resolvedNotifId}/markasread`)).catch(() => {});
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(CALL_DISMISSED_EVENT, {
        detail: { incidentId, notificationId: resolvedNotifId },
      }),
    );
  }
};

const handleAutoEscalate = (incident: PagerIncident) => {
  dismissPagerCall(incident.id);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('shuffle:pager-call-escalated', {
        detail: { incident, reason: 'timeout' },
      }),
    );
  }
};

export const playNotificationChime = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  } catch {
    // Ignore audio error
  }
};

export const triggerAgentRequestLocalAlert = (params: {
  title: string;
  body?: string;
  executionId?: string;
  workflowId?: string;
  action?: string;
}) => {
  const settings = getPagerSettings();
  if (!settings.agentRequestEnabled) return;
  if (settings.agentRequestSoundEnabled) playNotificationChime();


  if (isCapacitorNative()) {
    LocalNotifications.schedule({
      notifications: [
        {
          title: params.title,
          body: params.body || 'AI Agent requires your review or input to proceed.',
          id: Math.floor(Math.random() * 100000),
          channelId: 'agent_notifications',
          extra: { executionId: params.executionId, workflowId: params.workflowId },
        },
      ],
    }).catch(() => {});
  } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const notif = new Notification(params.title, {
        body: params.body || 'AI Agent requires your review or input to proceed.',
        icon: '/favicon.ico',
      });
      notif.onclick = () => {
        if (typeof window !== 'undefined') window.focus();
        notif.close();
      };
    } catch {
      // Ignore
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('shuffle:agent-request-received', {
        detail: params,
      }),
    );
  }
};

export const triggerGeneralLocalAlert = (params: {
  title: string;
  body?: string;
  description?: string;
  referenceUrl?: string;
}) => {
  const settings = getPagerSettings();
  if (!settings.generalNotificationsEnabled) return;
  if (settings.generalSoundEnabled) playNotificationChime();


  const bodyText = params.body || params.description || 'You have a new update from Shuffle Security.';

  if (isCapacitorNative()) {
    LocalNotifications.schedule({
      notifications: [
        {
          title: params.title,
          body: bodyText,
          id: Math.floor(Math.random() * 100000),
          channelId: 'general_notifications',
          extra: { referenceUrl: params.referenceUrl },
        },
      ],
    }).catch(() => {});
  } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const notif = new Notification(params.title, {
        body: bodyText,
        icon: '/favicon.ico',
      });
      notif.onclick = () => {
        if (typeof window !== 'undefined') window.focus();
        notif.close();
      };
    } catch {
      // Ignore
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('shuffle:general-notification-received', {
        detail: params,
      }),
    );
  }
};

export const testPagerCall = () => {
  triggerIncomingPagerCall({
    id: `test-incident-${Date.now()}`,
    title: 'Unauthorized Privilege Escalation Detected (Test Alert)',
    severity: 'critical',
    source: 'Wazuh EDR',
    orgName: 'Production SOC',
    tier: 'Tier 1 Response',
    description: 'Simulated on-call pager verification call. Verify audio siren, vibration, and call response controls.',
    timestamp: Date.now(),
  });
};

export const playTestSiren = (durationMs = 2000) => {
  startEmergencySiren();
  setTimeout(() => {
    stopEmergencySiren();
  }, durationMs);
};

export const getActiveCallIncident = (): PagerIncident | null => activeCallIncident;

// ── Remote Pager & Notification API Dispatcher ──────────────────────────────

export type NotificationType = 'critical' | 'agent_request' | 'general';

export interface PagerNotificationPayload {
  type?: NotificationType;
  title: string;
  body?: string;
  description?: string;
  source?: string;
  target_tokens?: string[];
  target_token?: string;
  incident_id?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low' | string;
  tier?: number;
  auto_escalate_seconds?: number;
  execution_id?: string;
  workflow_id?: string;
  action?: string;
  reference_url?: string;
}

export interface PagerNotificationResponse {
  success: boolean;
  type?: string;
  dispatched_to?: number;
  total_targets?: number;
  incident_id?: string;
  error?: string;
}

/**
 * Dispatches an emergency critical page, agent request, or general notification
 * via the backend Shuffle API endpoint: POST /api/v1/functions/pager
 */
export const dispatchPagerNotification = async (
  payload: PagerNotificationPayload,
): Promise<PagerNotificationResponse> => {
  try {
    const res = await shuffleFetch(getApiUrl('/api/v1/functions/pager'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data: PagerNotificationResponse = await res.json();
    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during pager dispatch';
    return {
      success: false,
      error: message,
    };
  }
};

/**
 * Convenience helper to dispatch a critical on-call incident page
 */
export const dispatchCriticalPage = async (params: {
  incidentId: string;
  title: string;
  targetTokens?: string[];
  targetToken?: string;
  severity?: string;
  source?: string;
  tier?: number;
  autoEscalateSeconds?: number;
  body?: string;
}): Promise<PagerNotificationResponse> => {
  return dispatchPagerNotification({
    type: 'critical',
    incident_id: params.incidentId,
    title: params.title,
    body: params.body,
    source: params.source || 'Shuffle SOC',
    severity: params.severity || 'critical',
    tier: params.tier || 1,
    auto_escalate_seconds: params.autoEscalateSeconds || 60,
    target_tokens: params.targetTokens,
    target_token: params.targetToken,
  });
};

/**
 * Convenience helper to dispatch an AI agent question or approval request
 */
export const dispatchAgentRequestNotification = async (params: {
  title: string;
  executionId?: string;
  workflowId?: string;
  action?: string;
  body?: string;
  targetTokens?: string[];
  targetToken?: string;
}): Promise<PagerNotificationResponse> => {
  return dispatchPagerNotification({
    type: 'agent_request',
    title: params.title,
    body: params.body || 'AI Agent requires your review or input to proceed.',
    execution_id: params.executionId,
    workflow_id: params.workflowId,
    action: params.action,
    target_tokens: params.targetTokens,
    target_token: params.targetToken,
  });
};

/**
 * Convenience helper to dispatch an informational FYI notification
 */
export const dispatchGeneralNotification = async (params: {
  title: string;
  body?: string;
  description?: string;
  referenceUrl?: string;
  targetTokens?: string[];
  targetToken?: string;
}): Promise<PagerNotificationResponse> => {
  return dispatchPagerNotification({
    type: 'general',
    title: params.title,
    body: params.body,
    description: params.description,
    reference_url: params.referenceUrl,
    target_tokens: params.targetTokens,
    target_token: params.targetToken,
  });
};
