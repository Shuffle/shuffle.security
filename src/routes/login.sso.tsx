import { createFileRoute } from '@tanstack/react-router';
import { routeMeta } from '@/lib/routeMeta';
import { OpenIdCallbackView } from '@/components/auth/OpenIdCallbackView';

export const Route = createFileRoute('/login/sso')({
  head: () =>
    routeMeta({
      title: 'SSO Sign In',
      description: 'Single Sign-On authentication for Shuffle Security.',
      url: '/login/sso',
      noindex: true,
    }),
  component: () => <OpenIdCallbackView mode="sso" />,
});
