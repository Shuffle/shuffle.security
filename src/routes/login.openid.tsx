import { createFileRoute } from '@tanstack/react-router';
import { routeMeta } from '@/lib/routeMeta';
import { OpenIdCallbackView } from '@/components/auth/OpenIdCallbackView';

export const Route = createFileRoute('/login/openid')({
  head: () =>
    routeMeta({
      title: 'OpenID Sign In',
      description: 'Single Sign-On authentication for Shuffle Security.',
      url: '/login/openid',
      noindex: true,
    }),
  component: () => <OpenIdCallbackView mode="openid" />,
});
