import { createFileRoute } from "@tanstack/react-router";
import MobileAppPage from '@/pages/MobileAppPage';
import { routeMeta } from '@/lib/routeMeta';

export const Route = createFileRoute("/mobile")({
  head: () =>
    routeMeta({
      title: 'Mobile App',
      description:
        'The Shuffle Security mobile app: critical incident paging, AI agent approvals and multi-tenant notifications on Android, with iOS coming soon.',
      url: '/mobile',
      breadcrumbs: [{ name: 'Home', path: '/' }],
    }),
  component: MobileAppPage,
});
