import { createFileRoute } from '@tanstack/react-router';
import DocsIndexPage from '@/pages/docs/DocsIndexPage';
import { routeMeta } from '@/lib/routeMeta';

export const Route = createFileRoute('/docs/')({
  head: () => {
    const metadata = routeMeta({
      title: 'Shuffle Security Documentation',
      rawTitle: true,
      description: 'Find Shuffle Security documentation by topic: getting started, integrations, incident response, automation, API reference, and infrastructure.',
      url: '/docs',
      breadcrumbs: [{ name: 'Home', path: '/' }],
    });
    return {
      ...metadata,
      meta: metadata.meta.filter((entry) => !('property' in entry && (entry.property === 'og:image' || entry.property === 'og:image:alt')) && !('name' in entry && (entry.name === 'twitter:image' || entry.name === 'twitter:image:alt'))),
    };
  },
  component: DocsIndexPage,
});
