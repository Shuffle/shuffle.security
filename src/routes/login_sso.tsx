import { createFileRoute } from '@tanstack/react-router';
import { routeMeta } from '@/lib/routeMeta';
import { OpenIdCallbackView } from '@/components/auth/OpenIdCallbackView';

export const Route = createFileRoute('/login_sso')({
  head: () =>
    routeMeta({
      title: 'SSO Sign In',
      description: 'Single Sign-On authentication for Shuffle Security.',
      url: '/login_sso',
      noindex: true,
    }),
  component: () => <OpenIdCallbackView mode="sso" />,
});
