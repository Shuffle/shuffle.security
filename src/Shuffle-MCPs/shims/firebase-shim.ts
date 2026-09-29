/**
 * Safe runtime fallback for Firebase web push messaging.
 * When running in environments where Firebase is available on window, delegates to it.
 * Otherwise provides safe no-ops without requiring the heavy firebase package as an external dependency.
 */
export const initializeApp = (...args: any[]): any => {
  if (typeof window !== 'undefined' && (window as any).firebase?.initializeApp) {
    return (window as any).firebase.initializeApp(...args);
  }
  return {};
};

export const getApps = (): any[] => {
  if (typeof window !== 'undefined' && (window as any).firebase?.apps) {
    return (window as any).firebase.apps;
  }
  return [];
};

export const getApp = (...args: any[]): any => {
  if (typeof window !== 'undefined' && (window as any).firebase?.app) {
    return (window as any).firebase.app(...args);
  }
  return {};
};

export const getMessaging = (...args: any[]): any => {
  if (typeof window !== 'undefined' && (window as any).firebase?.messaging) {
    return (window as any).firebase.messaging(...args);
  }
  return null;
};

export const getToken = async (..._args: any[]): Promise<string> => {
  return '';
};

export const onMessage = (..._args: any[]) => {
  return () => {};
};

export type FirebaseApp = any;
export type Messaging = any;
