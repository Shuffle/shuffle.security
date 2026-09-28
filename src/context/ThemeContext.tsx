import { createContext, useContext, useState, useEffect, useLayoutEffect, useRef, useCallback, ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
  brandColor: string | null;
  brandName: string | null;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const THEME_STORAGE_KEY = 'shuffle-theme';
export const THEME_GLOBAL_KEY = 'shuffle-theme:global';
export const USER_EXPLICIT_KEY = 'shuffle-theme-explicit';
export const BRAND_COLOR_KEY = 'shuffle-brand-color';

export const getOrgThemeKey = (orgId: string) => `shuffle-theme:${orgId}`;
export const getOrgExplicitKey = (orgId: string) => `shuffle-theme-explicit:${orgId}`;
export const getOrgBrandColorKey = (orgId: string) => `shuffle-brand-color:${orgId}`;

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
};

export const resolveTheme = (mode: ThemeMode): 'light' | 'dark' => {
  if (mode === 'system') return getSystemTheme();
  return mode;
};

export const applyDomTheme = (resolved: 'light' | 'dark') => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const body = document.body;
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
  root.setAttribute('data-theme', resolved);
  if (body) {
    body.classList.remove('light', 'dark');
    body.classList.add(resolved);
    body.style.colorScheme = resolved;
    body.setAttribute('data-theme', resolved);
  }
};

const persistThemeToBackend = async (theme: ThemeMode) => {
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('session_token') : null;
    const base = typeof window !== 'undefined' ? (window as any).__SHUFFLE_API_BASE__ || '' : '';
    // Fire-and-forget; ignore status or errors so frontend changes happen immediately
    await fetch(`${base}/api/v1/updateuser`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ theme }),
    });
  } catch {
    // Non-blocking: optimistic frontend changes must never depend on backend success
  }
};

export const hexToHSL = (hex: string): string => {
  try {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  } catch {
    return '24 100% 50%';
  }
};

export const updateCSSVariables = (brandColor: string | null) => {
  if (typeof document === 'undefined') return;
  const color = brandColor || '#FF6600';
  const hsl = hexToHSL(color);
  const root = document.documentElement;

  root.style.setProperty('--primary', hsl);
  root.style.setProperty('--ring', hsl);
  root.style.setProperty('--sidebar-primary', hsl);
  root.style.setProperty('--sidebar-ring', hsl);
  root.style.setProperty('--status-open', hsl);

  const [h, s, l] = hsl.split(/\s+/);
  const lightness = parseInt(l, 10) || 50;
  const glowLightness = Math.min(lightness + 10, 100);
  root.style.setProperty('--primary-glow', `${h} ${s} ${glowLightness}%`);

  // Contrast-aware primary foreground: dark text for very light brand colors (>60% lightness), white for others
  const foregroundHsl = lightness > 60 ? '0 0% 9%' : '0 0% 100%';
  root.style.setProperty('--primary-foreground', foregroundHsl);
  root.style.setProperty('--sidebar-primary-foreground', foregroundHsl);
};

export const getCachedOrgId = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('shuffle_user_info');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.active_org?.id || null;
  } catch {
    return null;
  }
};

export const getCachedBrandColor = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const cachedColor = localStorage.getItem(BRAND_COLOR_KEY);
    if (cachedColor) return cachedColor;
    const raw = localStorage.getItem('shuffle_user_info');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.active_org?.branding?.brand_color || null;
  } catch {
    return null;
  }
};

export const getCachedBrandName = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('shuffle_user_info');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.active_org?.branding?.brand_name || null;
  } catch {
    return null;
  }
};

const getInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system';
  try {
    const orgId = getCachedOrgId();
    if (orgId) {
      // 1. Did the user explicitly choose a theme in this tenant?
      const isExplicit = localStorage.getItem(getOrgExplicitKey(orgId)) === 'true';
      if (isExplicit) {
        const orgSaved = localStorage.getItem(getOrgThemeKey(orgId)) as ThemeMode | null;
        if (orgSaved === 'light' || orgSaved === 'dark' || orgSaved === 'system') {
          return orgSaved;
        }
      }

      // 2. Otherwise check if this tenant has a branding theme
      const raw = localStorage.getItem('shuffle_user_info');
      if (raw) {
        const parsed = JSON.parse(raw);
        const brandingTheme = parsed?.active_org?.branding?.theme;
        if (brandingTheme === 'light' || brandingTheme === 'dark' || brandingTheme === 'system') {
          return brandingTheme;
        }
      }

      // 3. Check if there was a saved theme for this org
      const orgSaved = localStorage.getItem(getOrgThemeKey(orgId)) as ThemeMode | null;
      if (orgSaved === 'light' || orgSaved === 'dark' || orgSaved === 'system') {
        return orgSaved;
      }
    }

    // Fall back to active mirror or global
    const saved = (localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem(THEME_GLOBAL_KEY)) as ThemeMode | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    return 'system';
  } catch {
    return 'system';
  }
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeMode>(getInitialTheme);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);
  const [brandColor, setBrandColor] = useState<string | null>(getCachedBrandColor);
  const [brandName, setBrandName] = useState<string | null>(getCachedBrandName);

  const themeRef = useRef(theme);
  themeRef.current = theme;

  const activeOrgIdRef = useRef<string | null>(getCachedOrgId());

  // Keep systemTheme reactive to OS prefers-color-scheme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const nextSys = e.matches ? 'dark' : 'light';
      setSystemTheme(nextSys);
      if (themeRef.current === 'system') {
        applyDomTheme(nextSys);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Cross-tab synchronization via storage event
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && e.newValue) {
        const next = e.newValue as ThemeMode;
        if (next === 'light' || next === 'dark' || next === 'system') {
          const nextResolved = resolveTheme(next);
          applyDomTheme(nextResolved);
          setThemeState(next);
        }
      } else if (e.key === BRAND_COLOR_KEY) {
        setBrandColor(e.newValue);
        updateCSSVariables(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const resolvedTheme: 'light' | 'dark' = theme === 'system' ? systemTheme : theme;

  useIsomorphicLayoutEffect(() => {
    updateCSSVariables(brandColor);
    applyDomTheme(resolvedTheme);
  }, [brandColor, resolvedTheme]);

  // Synchronize with tenant info whenever /api/v1/getinfo fires
  useEffect(() => {
    const onGetInfo = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (data && data.success) {
        const activeOrg = data.active_org;
        const orgId = activeOrg?.id;
        if (orgId) {
          activeOrgIdRef.current = orgId;
        }

        const orgBrandColor = activeOrg?.branding?.brand_color;
        const orgBrandName = activeOrg?.branding?.brand_name || null;
        setBrandName(orgBrandName);

        if (orgBrandColor && typeof orgBrandColor === 'string') {
          setBrandColor(orgBrandColor);
          updateCSSVariables(orgBrandColor);
          try {
            localStorage.setItem(BRAND_COLOR_KEY, orgBrandColor);
            if (orgId) localStorage.setItem(getOrgBrandColorKey(orgId), orgBrandColor);
          } catch {}
        } else {
          setBrandColor(null);
          updateCSSVariables(null);
          try {
            localStorage.removeItem(BRAND_COLOR_KEY);
            if (orgId) localStorage.removeItem(getOrgBrandColorKey(orgId));
          } catch {}
        }

        const isValidTheme = (val: unknown): val is ThemeMode =>
          val === 'light' || val === 'dark' || val === 'system';

        const brandingTheme = activeOrg?.branding?.theme;
        const dataTheme = data.theme;

        // Check if user has an explicit preference for THIS specific tenant, or globally
        const isOrgExplicit = orgId
          ? (typeof localStorage !== 'undefined' && localStorage.getItem(getOrgExplicitKey(orgId)) === 'true')
          : false;
        const isGlobalExplicit = typeof localStorage !== 'undefined' && localStorage.getItem(USER_EXPLICIT_KEY) === 'true';

        if (isOrgExplicit && orgId) {
          // Frontend user choice in this tenant takes precedence!
          const savedOrgTheme = localStorage.getItem(getOrgThemeKey(orgId)) as ThemeMode | null;
          if (isValidTheme(savedOrgTheme)) {
            setThemeState(savedOrgTheme);
            applyDomTheme(resolveTheme(savedOrgTheme));
            try {
              localStorage.setItem(THEME_STORAGE_KEY, savedOrgTheme);
            } catch {}
          }
        } else if (isValidTheme(brandingTheme)) {
          // Priority: Tenant branding theme overrides theme for this tenant when user hasn't explicitly set one for this org
          setThemeState(brandingTheme);
          applyDomTheme(resolveTheme(brandingTheme));
          try {
            localStorage.setItem(THEME_STORAGE_KEY, brandingTheme);
            if (orgId) localStorage.setItem(getOrgThemeKey(orgId), brandingTheme);
          } catch {}
        } else {
          // No tenant branding theme (unbranded / missing per-org config):
          // Check if there was a per-org saved theme, or global explicit user choice, or fallback to user's account theme (data.theme)
          const savedOrgTheme = orgId ? (localStorage.getItem(getOrgThemeKey(orgId)) as ThemeMode | null) : null;
          const globalTheme = (typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_GLOBAL_KEY) : null) as ThemeMode | null;
          const activeStoredTheme = (typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_STORAGE_KEY) : null) as ThemeMode | null;

          if (isValidTheme(savedOrgTheme)) {
            setThemeState(savedOrgTheme);
            applyDomTheme(resolveTheme(savedOrgTheme));
            try {
              localStorage.setItem(THEME_STORAGE_KEY, savedOrgTheme);
            } catch {}
          } else if (isGlobalExplicit && isValidTheme(globalTheme)) {
            // User explicitly chose a global theme (Light / Dark / System) - DO NOT CLOBBER WITH SERVER DEFAULT "dark"!
            setThemeState(globalTheme);
            applyDomTheme(resolveTheme(globalTheme));
            try {
              localStorage.setItem(THEME_STORAGE_KEY, globalTheme);
              if (orgId) localStorage.setItem(getOrgThemeKey(orgId), globalTheme);
            } catch {}
          } else if (isGlobalExplicit && isValidTheme(activeStoredTheme)) {
            setThemeState(activeStoredTheme);
            applyDomTheme(resolveTheme(activeStoredTheme));
            try {
              if (orgId) localStorage.setItem(getOrgThemeKey(orgId), activeStoredTheme);
            } catch {}
          } else if (isValidTheme(dataTheme)) {
            // Only fallback to dataTheme if the user never explicitly picked a theme
            setThemeState(dataTheme);
            applyDomTheme(resolveTheme(dataTheme));
            try {
              localStorage.setItem(THEME_STORAGE_KEY, dataTheme);
              if (orgId) localStorage.setItem(getOrgThemeKey(orgId), dataTheme);
            } catch {}
          }
        }
      }
    };

    // Instant optimistic org switch handler
    const onOrgChange = (e: Event) => {
      const targetOrg = (e as CustomEvent).detail?.org;
      if (!targetOrg) return;
      const orgId = targetOrg.id;
      if (orgId) activeOrgIdRef.current = orgId;

      const newBrandColor = targetOrg.branding?.brand_color || null;
      const newBrandName = targetOrg.branding?.brand_name || null;
      setBrandColor(newBrandColor);
      setBrandName(newBrandName);
      updateCSSVariables(newBrandColor);

      if (newBrandColor) {
        try {
          localStorage.setItem(BRAND_COLOR_KEY, newBrandColor);
          if (orgId) localStorage.setItem(getOrgBrandColorKey(orgId), newBrandColor);
        } catch {}
      } else {
        try {
          localStorage.removeItem(BRAND_COLOR_KEY);
          if (orgId) localStorage.removeItem(getOrgBrandColorKey(orgId));
        } catch {}
      }

      // Resolve theme for target org
      const isOrgExplicit = orgId && typeof localStorage !== 'undefined'
        ? localStorage.getItem(getOrgExplicitKey(orgId)) === 'true'
        : false;

      let nextTheme: ThemeMode | null = null;
      if (isOrgExplicit && orgId) {
        const saved = localStorage.getItem(getOrgThemeKey(orgId)) as ThemeMode | null;
        if (saved === 'light' || saved === 'dark' || saved === 'system') nextTheme = saved;
      } else if (targetOrg.branding?.theme) {
        const bt = targetOrg.branding.theme;
        if (bt === 'light' || bt === 'dark' || bt === 'system') nextTheme = bt;
      } else if (orgId) {
        const saved = localStorage.getItem(getOrgThemeKey(orgId)) as ThemeMode | null;
        if (saved === 'light' || saved === 'dark' || saved === 'system') nextTheme = saved;
      }

      if (!nextTheme) {
        const globalSaved = typeof localStorage !== 'undefined'
          ? ((localStorage.getItem(THEME_GLOBAL_KEY) || localStorage.getItem(THEME_STORAGE_KEY)) as ThemeMode | null)
          : null;
        nextTheme = (globalSaved === 'light' || globalSaved === 'dark' || globalSaved === 'system') ? globalSaved : 'system';
      }

      setThemeState(nextTheme);
      applyDomTheme(resolveTheme(nextTheme));
      try {
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        if (orgId) localStorage.setItem(getOrgThemeKey(orgId), nextTheme);
      } catch {}
    };

    window.addEventListener('shuffle:getinfo', onGetInfo as EventListener);
    window.addEventListener('shuffle:org-change', onOrgChange as EventListener);
    return () => {
      window.removeEventListener('shuffle:getinfo', onGetInfo as EventListener);
      window.removeEventListener('shuffle:org-change', onOrgChange as EventListener);
    };
  }, []);

  const setTheme = useCallback((newTheme: ThemeMode) => {
    const nextResolved = resolveTheme(newTheme);

    // 1. Immediately and synchronously apply DOM class changes
    applyDomTheme(nextResolved);

    // 2. Mark explicit user selection for current org and globally
    const currentOrgId = activeOrgIdRef.current || getCachedOrgId();
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      localStorage.setItem(THEME_GLOBAL_KEY, newTheme);
      localStorage.setItem(USER_EXPLICIT_KEY, 'true');
      if (currentOrgId) {
        localStorage.setItem(getOrgThemeKey(currentOrgId), newTheme);
        localStorage.setItem(getOrgExplicitKey(currentOrgId), 'true');
      }
    } catch {}

    // 3. Immediately update React state
    setThemeState(newTheme);

    // 4. Dispatch instant change event for any custom listeners
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('shuffle:theme-change', {
          detail: { theme: newTheme, resolvedTheme: nextResolved },
        })
      );
    }

    // 5. Fire-and-forget optimistic persist to backend
    persistThemeToBackend(newTheme).catch(() => {});
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, brandColor, brandName }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
