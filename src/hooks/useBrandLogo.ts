import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

/**
 * Tenant logo to use instead of the Shuffle marks when branding is enabled
 * (a brand name is set) and the tenant has an image. Null otherwise.
 */
export function useBrandLogo(): string | null {
  const { userInfo } = useAuth();
  const { brandName } = useTheme();
  const image = userInfo?.active_org?.image;
  return brandName && typeof image === 'string' && image.trim() ? image : null;
}

const DEFAULT_FAVICON = '/favicon.ico';

/** Swaps the browser tab icon to the tenant logo while branding is active. */
export function useBrandFavicon(logo: string | null) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
    const target = logo || DEFAULT_FAVICON;
    links.forEach((link) => {
      link.href = target;
      if (logo) link.removeAttribute('type');
      else link.type = 'image/x-icon';
    });
  }, [logo]);
}
