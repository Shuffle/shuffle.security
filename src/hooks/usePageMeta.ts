import { useEffect } from 'react';

interface PageMeta {
  title: string;
  description: string;
  image?: string;
  url?: string;
  type?: string;
  rawTitle?: boolean;
  baseTitle?: string;
  noindex?: boolean;
  /** Optional JSON-LD structured data. Accepts a single object or an array of objects. */
  jsonLd?: Record<string, any> | Record<string, any>[];
}

const BASE_TITLE = 'Shuffle Security';
const BASE_URL = 'https://shuffle.security';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;
const MANAGED_JSONLD_ID = 'page-jsonld-managed';

function setMetaTag(property: string, content: string, isOg = false) {
  const attr = isOg ? 'property' : 'name';
  let el = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function usePageMeta({ title, description, image, url, type = 'website', rawTitle, baseTitle, jsonLd, noindex }: PageMeta) {
  useEffect(() => {
    const effectiveBase = baseTitle || BASE_TITLE;
    const fullTitle = rawTitle || title === effectiveBase || title.includes(effectiveBase) ? title : `${title} | ${effectiveBase}`;
    const fullUrl = url ? `${BASE_URL}${url}` : window.location.href;
    const img = image || DEFAULT_IMAGE;

    // Document title
    document.title = fullTitle;

    // Standard meta
    setMetaTag('description', description);
    if (noindex) {
      setMetaTag('robots', 'noindex, nofollow');
    }

    // Open Graph
    setMetaTag('og:title', fullTitle, true);
    setMetaTag('og:description', description, true);
    setMetaTag('og:image', img, true);
    setMetaTag('og:image:alt', title, true);
    setMetaTag('og:url', fullUrl, true);
    setMetaTag('og:type', type, true);
    setMetaTag('og:site_name', BASE_TITLE, true);
    setMetaTag('og:locale', 'en_US', true);

    // Twitter
    setMetaTag('twitter:card', 'summary_large_image');
    setMetaTag('twitter:site', '@shuffleio');
    setMetaTag('twitter:title', fullTitle);
    setMetaTag('twitter:description', description);
    setMetaTag('twitter:image', img);
    setMetaTag('twitter:image:alt', title);

    // Canonical
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', fullUrl);

    // JSON-LD — always include a default WebPage block, plus any custom blocks
    const defaultBlock: Record<string, any> = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: fullTitle,
      description,
      url: fullUrl,
      inLanguage: 'en',
      isPartOf: {
        '@type': 'WebSite',
        name: BASE_TITLE,
        url: BASE_URL,
      },
      image: img,
    };
    const blocks: Record<string, any>[] = [defaultBlock];
    if (jsonLd) {
      if (Array.isArray(jsonLd)) blocks.push(...jsonLd);
      else blocks.push(jsonLd);
    }

    // Remove previous managed JSON-LD scripts
    document
      .querySelectorAll(`script[data-managed="${MANAGED_JSONLD_ID}"]`)
      .forEach((n) => n.remove());

    blocks.forEach((block) => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-managed', MANAGED_JSONLD_ID);
      script.textContent = JSON.stringify(block);
      document.head.appendChild(script);
    });

    return () => {
      // Reset to defaults on unmount
      document.title = `${BASE_TITLE} - Open Source Alert & Case Management`;
      if (noindex) {
        const robotsEl = document.querySelector('meta[name="robots"]');
        if (robotsEl) robotsEl.remove();
      }
      document
        .querySelectorAll(`script[data-managed="${MANAGED_JSONLD_ID}"]`)
        .forEach((n) => n.remove());
    };
  }, [title, description, image, url, type, noindex, JSON.stringify(jsonLd ?? null)]);
}
