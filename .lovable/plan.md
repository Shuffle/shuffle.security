# Fix OpenID (Keycloak) sign-in to Shuffle Security

## What is going wrong today

1. `https://shuffle.security/api/v1/login_openid` returns our 404 page. This app only has a return page at `/login_openid` (no `/api/` prefix). That page forwards the `code` and `state` to the backend.
2. `https://shuffle.security/incidents?code=...` shows "Checking login details" and then the login page. Nothing on that page reads the `code`, so it is thrown away.
3. Before login, the return page sends the code to the default UK backend. A Canada tenant (`ca.shuffler.io`) needs to finish on its own region. The org ID is inside `state` (`org=723f6302-...`), so we can find out which region it belongs to.
4. `ca.shuffle.security/api/v1/orgs/sso/link` returns 404. That host is not a full API alias. The link has to come from `ca.shuffler.io`.

## Changes in this app

- Add a catch-all `/api/*` redirect on shuffle.security. Any request to `shuffle.security/api/...` gets a temporary redirect (307, which keeps the method and body) to the same path and query on the Shuffle backend. That covers `/api/v1/login_openid`, `/api/v1/login_sso`, `/api/v1/orgs/sso/link` and anything else.
  - Which backend: if the request carries an `Org-Id` header, or a `state` with `org=<id>`, use that tenant's region. Otherwise use a `region` hint in the request, then the default host.
  - Limits: browsers follow the redirect for page visits and simple calls. Scripts and `curl` need to follow redirects (`curl -L`). Cross-site calls from a browser still need the backend's own CORS rules.
- `/api/v1/login_openid` and `/api/v1/login_sso` still get special handling: they go through the same return page as `/login_openid`, so the code reaches the right region.
- On the return page, decode `state`, read `org=<id>`, and send the code to that tenant's region. First check the saved tenant-to-region list. If the tenant is not in it, use the region from the `redirect=` value inside `state`. Only fall back to the default host if neither gives an answer.
- Any page that gets `?code=...&state=...` (for example `/incidents`) passes it to the return page instead of dropping it. That covers redirect URIs pointed at the root or `/incidents`.
- After the backend finishes, send the user to `/incidents`. If the session did not stick, show a clear message instead of a silent loop back to login.

## Needs a Shuffle backend change (outside this app)

- The backend swaps the code with the `redirect_uri` stored in `state` (`redirect=https://shuffler.io/api/v1/login_openid`). Keycloak refuses the swap if that value differs from the URI used in the browser. So editing only `redirect_uri` in the link will always fail. `/api/v1/orgs/sso/link` needs to accept a redirect target (for example `https://shuffle.security/login_openid`) and put the same value in both places.
- After login, the backend sets its session cookie and redirects to its own frontend. It needs to send the user back to shuffle.security with a session this app can use.

## What to tell the customer now

- Register `https://shuffle.security/login_openid` in Keycloak, not `/api/v1/login_openid`.
- Keep generating the link from `ca.shuffler.io`. Full sign-in through shuffle.security will only work once the backend change above ships.

## Technical details

- Files: `src/components/auth/OpenIdCallbackView.tsx`, `src/Shuffle-Core/views/LoginPage.tsx`, new `src/routes/api.v1.login_openid.tsx` and `src/routes/api.v1.login_sso.tsx`, and a small `?code`/`state` catch in the root route.
- Region lookup uses `getTenantRegionBase(orgId)` from `src/lib/tenantApiUrl.ts`, with a fallback that maps the host from `state.redirect` (`shuffler.io` to the default host, `ca.shuffler.io` to the CA region).
