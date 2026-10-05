import { createFileRoute } from '@tanstack/react-router';
import { REGION_COOKIE, backendForRegion, decodeOpenIdState, regionFromHost, regionFromUrl } from '@/lib/regionRouting';

// Redirects /api/v*/... on this site to the tenant's regional Shuffle backend.
const resolveRegion = (request: Request, url: URL): string | null => {
  const fromHost = regionFromHost(url.hostname);
  if (fromHost) return fromHost;

  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${REGION_COOKIE}=([a-z0-9]+)`));
  if (m) return m[1];

  const state = decodeOpenIdState(url.searchParams.get('state'));
  const fromState = regionFromUrl(state.region_url ? decodeURIComponent(state.region_url) : null)
    || regionFromUrl(state.redirect ? decodeURIComponent(state.redirect) : null);
  return fromState;
};

const handle = async ({ request, params }: { request: Request; params: { version: string; _splat?: string } }) => {
  if (!/^v\d+$/.test(params.version)) {
    return new Response('404 page not found', { status: 404 });
  }
  const url = new URL(request.url);
  const rest = params._splat || '';

  // Sign-in returns go through the app's own return page, which picks the tenant region.
  if (request.method === 'GET' && params.version === 'v1' && (rest === 'login_openid' || rest === 'login_sso')) {
    return new Response(null, { status: 302, headers: { Location: `/${rest}${url.search}` } });
  }

  const target = `${backendForRegion(resolveRegion(request, url))}/api/${params.version}/${rest}${url.search}`;
  return new Response(null, { status: 307, headers: { Location: target, 'Cache-Control': 'no-store' } });
};

export const Route = createFileRoute('/api/$version/$')({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
      OPTIONS: handle,
    },
  },
});
