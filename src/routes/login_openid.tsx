import { createFileRoute } from '@tanstack/react-router';
import { routeMeta } from '@/lib/routeMeta';
import { OpenIdCallbackView } from '@/components/auth/OpenIdCallbackView';

export const Route = createFileRoute('/login_openid')({
  head: () =>
    routeMeta({
      title: 'OpenID Sign In',
      description: 'Single Sign-On authentication for Shuffle Security.',
      url: '/login_openid',
      noindex: true,
    }),
  component: () => <OpenIdCallbackView mode="openid" />,
});
