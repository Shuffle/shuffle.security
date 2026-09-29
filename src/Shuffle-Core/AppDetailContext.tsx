import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface AppDetailContextType {
  openApp: (appName: string) => void;
  closeApp: () => void;
  currentAppName: string | null;
  isOpen: boolean;
}

const fallbackContext: AppDetailContextType = {
  openApp: (appName: string) => {
    if (typeof window !== 'undefined' && appName) {
      window.location.href = `/apps/${encodeURIComponent(appName)}`;
    }
  },
  closeApp: () => {},
  currentAppName: null,
  isOpen: false,
};

const AppDetailContext = createContext<AppDetailContextType>(fallbackContext);

export const AppDetailProvider = ({ children }: { children: ReactNode }) => {
  const [currentAppName, setCurrentAppName] = useState<string | null>(null);

  const openApp = useCallback((appName: string) => {
    setCurrentAppName(appName);
  }, []);

  const closeApp = useCallback(() => {
    setCurrentAppName(null);
  }, []);

  return (
    <AppDetailContext.Provider value={{ openApp, closeApp, currentAppName, isOpen: currentAppName !== null }}>
      {children}
    </AppDetailContext.Provider>
  );
};

/** Safe hook: returns context if inside AppDetailProvider, or a graceful fallback (navigating to /apps/:name on openApp) if outside. Never throws. */
export const useAppDetail = (): AppDetailContextType => {
  return useContext(AppDetailContext);
};

/** Safe variant: returns null if no provider is mounted. Useful for components used both inside and outside the dashboard. */
export const useAppDetailOptional = (): AppDetailContextType | null => {
  const ctx = useContext(AppDetailContext);
  return ctx === fallbackContext ? null : ctx;
};

