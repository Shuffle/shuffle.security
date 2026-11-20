import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { isCapacitorNative } from '@/Shuffle-Core/api';

export interface FirebaseWebCredentials {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  vapidKey?: string;
}

const STORAGE_VAPID_KEY = 'shuffle_firebase_vapid_key';

const viteEnv: Record<string, string | undefined> =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

export const getStoredVapidKey = (): string => {
  if (typeof window === 'undefined') return '';
  const stored = localStorage.getItem(STORAGE_VAPID_KEY);
  if (stored) return stored.trim();
  return (viteEnv.VITE_FIREBASE_VAPID_KEY || '').trim();
};

export const saveStoredVapidKey = (key: string) => {
  if (typeof window === 'undefined') return;
  if (key.trim()) {
    localStorage.setItem(STORAGE_VAPID_KEY, key.trim());
  } else {
    localStorage.removeItem(STORAGE_VAPID_KEY);
  }
};

const getFirebaseConfig = () => {
  const projectId = viteEnv.VITE_FIREBASE_PROJECT_ID || 'shuffle-security';
  const senderId = viteEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || '1035252817088';
  return {
    apiKey: viteEnv.VITE_FIREBASE_API_KEY || 'AIzaSyDummyKeyForWebPushInit000000',
    authDomain: viteEnv.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: viteEnv.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
    messagingSenderId: senderId,
    appId: viteEnv.VITE_FIREBASE_APP_ID || `1:${senderId}:web:00000000000000`,
  };
};


let webApp: FirebaseApp | null = null;
let webMessaging: Messaging | null = null;

export const getFirebaseWebApp = (): FirebaseApp | null => {
  if (typeof window === 'undefined') return null;
  if (webApp) return webApp;

  try {
    if (getApps().length > 0) {
      webApp = getApp();
    } else {
      webApp = initializeApp(getFirebaseConfig());
    }
    return webApp;
  } catch (err) {
    console.warn('[Firebase] Failed to initialize web app:', err);
    return null;
  }
};

export const getFirebaseWebMessaging = (): Messaging | null => {
  if (typeof window === 'undefined' || isCapacitorNative()) return null;
  if (webMessaging) return webMessaging;

  try {
    const app = getFirebaseWebApp();
    if (!app) return null;
    webMessaging = getMessaging(app);
    return webMessaging;
  } catch (err) {
    console.warn('[Firebase] Web Messaging not supported in this browser environment:', err);
    return null;
  }
};

export const registerFirebaseWebPush = async (customVapidKey?: string): Promise<string | null> => {
  if (typeof window === 'undefined' || isCapacitorNative()) return null;

  const vapidKey = customVapidKey || getStoredVapidKey();
  if (!vapidKey) {
    console.warn('[Firebase] No VAPID Key available for Web Push registration.');
    return null;
  }

  try {
    if (!('serviceWorker' in navigator)) {
      console.warn('[Firebase] Service Workers not supported in this browser.');
      return null;
    }

    // Register or retrieve the firebase-messaging-sw.js service worker
    const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;

    const messaging = getFirebaseWebMessaging();
    if (!messaging) return null;

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swRegistration,
    });

    if (token) {
      console.log('[Firebase] Successfully registered Web Push FCM token:', token);
      return token;
    }
    return null;
  } catch (err) {
    console.warn('[Firebase] Failed to retrieve Web Push token:', err);
    return null;
  }
};

export const subscribeToWebForegroundMessages = (
  onPayload: (payload: { title?: string; body?: string; data?: Record<string, string> }) => void,
) => {
  const messaging = getFirebaseWebMessaging();
  if (!messaging) return () => {};

  try {
    const unsubscribe = onMessage(messaging, (payload) => {
      onPayload({
        title: payload.notification?.title || payload.data?.title,
        body: payload.notification?.body || payload.data?.body,
        data: payload.data as Record<string, string> | undefined,
      });
    });
    return unsubscribe;
  } catch (err) {
    console.warn('[Firebase] Failed to attach onMessage listener:', err);
    return () => {};
  }
};
