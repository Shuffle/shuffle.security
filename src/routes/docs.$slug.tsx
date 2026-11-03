import { createFileRoute } from "@tanstack/react-router";
import DocsPage from '@/pages/docs/DocsPage';
import { routeMeta } from '@/lib/routeMeta';
import { getDocContent } from '@/lib/docs.functions';
import { getDocGroup } from '@/components/docs/docGroups';

export const Route = createFileRoute("/docs/$slug")({
  loader: async ({ params }) => {
    // On the client, avoid blocking route transitions with server function network requests.
    // Return immediately for an instantaneous swap, allowing DocsPage and MarkdownRenderer
    // to render the loader and stream/fetch content smoothly.
    if (typeof window !== 'undefined') {
      return { doc: null };
    }
    try {
      const doc = await getDocContent({ data: { slug: params.slug } });
      return { doc };
    } catch {
      // Static / self-hosted builds have no server function — the page falls
      // back to the client-side fetch in MarkdownRenderer.
      return { doc: null };
    }
  },
  head: ({ params, loaderData }) => {
    const doc = loaderData?.doc ?? null;
    const fallbackTitle = params.slug === 'index' ? 'Documentation' : params.slug
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const title = doc?.title || fallbackTitle;
    const group = getDocGroup(params.slug);
    const categoryLabel = group ? group.label : '';
    const fullPageTitle =
      params.slug === 'index'
        ? 'Shuffle Security Documentation'
        : categoryLabel
          ? (categoryLabel === 'Security'
              ? `Shuffle Security - ${title}`
              : `Shuffle Security ${categoryLabel} - ${title}`)
          : `Shuffle Security - ${title}`;

    const description =
      doc?.description ||
      `Shuffle Security documentation — ${fallbackTitle}. Learn how to set up and use the platform.`;
    const heroImage = doc?.videos.find((video) => video.thumbnailUrl)?.thumbnailUrl;

    const base = routeMeta({
      title: fullPageTitle,
      rawTitle: true,
      description,
      url: `/docs/${params.slug}`,
      type: 'article',
      image: heroImage,
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Documentation', path: '/docs' },
      ],
    });

    const pageUrl = `https://shuffle.security/docs/${params.slug}`;
    const videoScripts = (doc?.videos ?? []).map((video) => ({
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: video.name,
        description: video.description,
        thumbnailUrl: [video.thumbnailUrl],
        embedUrl: video.embedUrl,
        ...(video.contentUrl ? { contentUrl: video.contentUrl } : {}),
        ...(doc?.uploadDate ? { uploadDate: doc.uploadDate } : {}),
        url: pageUrl,
        publisher: {
          '@type': 'Organization',
          name: 'Shuffle Security',
          url: 'https://shuffle.security',
          logo: {
            '@type': 'ImageObject',
            url: 'https://shuffle.security/images/logos/orange_logo.png',
          },
        },
      }),
    }));

    return { ...base, scripts: [...(base.scripts ?? []), ...videoScripts] };
  },
  component: DocsRouteComponent,
});

function DocsRouteComponent() {
  const { doc } = Route.useLoaderData();
  return <DocsPage initialContent={doc?.markdown ?? null} initialMeta={doc?.meta ?? null} />;
}
