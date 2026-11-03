import { createFileRoute } from "@tanstack/react-router";
import DocsPage from '@/pages/docs/DocsPage';
import { routeMeta } from '@/lib/routeMeta';
import { getDocContent } from '@/lib/docs.functions';

export const Route = createFileRoute("/legal/$slug")({
  loader: async ({ params }) => {
    if (typeof window !== 'undefined') {
      return { doc: null };
    }
    try {
      const doc = await getDocContent({ data: { slug: params.slug, folder: 'legal' } });
      return { doc };
    } catch {
      // Static / self-hosted builds have no server function — the page falls
      // back to the client-side fetch in MarkdownRenderer.
      return { doc: null };
    }
  },
  head: ({ params, loaderData }) => {
    const doc = loaderData?.doc ?? null;
    const fallbackTitle = params.slug === 'index' ? 'Legal' : params.slug
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const title = doc?.title || fallbackTitle;
    const description =
      doc?.description || `Shuffle Security legal — ${fallbackTitle}.`;

    return routeMeta({
      title,
      description,
      url: `/legal/${params.slug}`,
      type: 'article',
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Legal', path: '/legal' },
      ],
    });
  },
  component: LegalRouteComponent,
});

function LegalRouteComponent() {
  const { doc } = Route.useLoaderData();
  return (
    <DocsPage
      folder="legal"
      basePath="/legal"
      sectionTitle="Legal"
      initialContent={doc?.markdown ?? null}
      initialMeta={doc?.meta ?? null}
    />
  );
}
