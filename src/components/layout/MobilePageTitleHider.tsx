import { useEffect } from 'react';
import { useLocation } from '@/lib/router-compat';

const HIDDEN_ATTR = 'data-mobile-title-hidden';

/**
 * On mobile the page name is already shown in the top navigation header, so
 * the in-page heading with the same text is a duplicate. This hides that
 * secondary heading on small screens for every page, without each page
 * needing to know about the mobile header.
 */
export const MobilePageTitleHider = () => {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mq = window.matchMedia('(max-width: 599.95px)');

    const restore = () => {
      document.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}]`).forEach((el) => {
        el.style.display = '';
        el.removeAttribute(HIDDEN_ATTR);
      });
    };

    const apply = () => {
      restore();
      if (!mq.matches) return;
      const main = document.querySelector('main');
      if (!main) return;
      // The page's main heading is the first large heading in the content.
      // The top navigation already names the page, so hide it and the short
      // description right after it on small screens.
      const heading = main.querySelector<HTMLElement>('h1, .MuiTypography-h4');
      if (!heading || !(heading.textContent || '').trim()) return;
      const hide = (el: HTMLElement) => {
        el.style.display = 'none';
        el.setAttribute(HIDDEN_ATTR, 'true');
      };
      hide(heading);
      const isDescription = (el: Element | null): el is HTMLElement =>
        !!el && el instanceof HTMLElement &&
        (el.matches('p, .MuiTypography-body1, .MuiTypography-body2, .MuiTypography-subtitle1') );
      const next = heading.nextElementSibling;
      if (isDescription(next)) {
        hide(next);
      } else if (!next || next.matches('.MuiChip-root')) {
        const parentNext = heading.parentElement?.nextElementSibling ?? null;
        if (isDescription(parentNext)) hide(parentNext);
      }
    };

    apply();
    const timers = [50, 200, 600, 1200].map((ms) => window.setTimeout(apply, ms));
    const observer = new MutationObserver(() => apply());
    const main = document.querySelector('main');
    if (main) observer.observe(main, { childList: true, subtree: true });
    mq.addEventListener('change', apply);

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      observer.disconnect();
      mq.removeEventListener('change', apply);
      restore();
    };
  }, [location.pathname]);

  return null;
};

export default MobilePageTitleHider;
