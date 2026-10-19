import { createFileRoute } from "@tanstack/react-router";
import { routeMeta } from '@/lib/routeMeta';
import { getPublicAppMeta } from '@/lib/appCatalog.functions';
import { appSlug } from '@/lib/appCatalog.server';
import AppDetailPage from '@/pages/dashboard/AppDetailPage';

const trimDescription = (text: string, max = 155): string => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ')).trimEnd()}...`;
};

export const Route = createFileRoute("/_cond/apps/$appname")({
  loader: async ({ params }) => {
    // Client navigations never block on the catalog lookup; SSR (crawlers) does.
    if (typeof window !== 'undefined') return { app: null, ssr: false };
    try {
      return { app: await getPublicAppMeta({ data: { slug: params.appname } }), ssr: true };
    } catch {
      return { app: null, ssr: true };
    }
  },
  head: ({ params, loaderData }) => {
    const app = loaderData?.app ?? null;
    if (!app) {
      // Unknown app (or client navigation): keep it out of search results.
      return routeMeta({
        title: "Integration details",
        description: "Configure authentication, actions and automation for a security integration in Shuffle Security.",
        url: `/apps/${params.appname}`,
        noindex: true,
      });
    }
    const displayName = app.name.replace(/_/g, ' ');
    const slug = appSlug(app.name);
    const summary = app.description?.trim()
      ? `${displayName}: ${app.description.trim().replace(/\.$/, '')}. Automate it with Shuffle Security incident response and 3,000+ integrations.`
      : `Connect ${displayName} to Shuffle Security. Automate incident response with ${displayName} actions, AI agents and 3,000+ integrations.`;
    const base = routeMeta({
      title: `${displayName} Integration`,
      description: trimDescription(summary),
      url: `/apps/${slug}`,
      type: 'product',
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Apps', path: '/apps' },
      ],
    });
    return {
      ...base,
      scripts: [
        ...(base.scripts ?? []),
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: `${displayName} Integration`,
            applicationCategory: 'SecurityApplication',
            description: trimDescription(summary),
            url: `https://shuffle.security/apps/${slug}`,
            ...(app.image_url && /^https:\/\//.test(app.image_url) ? { image: app.image_url } : {}),
          }),
        },
      ],
    };
  },
  component: AppDetailPage,
});
