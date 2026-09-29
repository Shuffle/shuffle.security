/**
 * Standard host-injected props passed to every top-level Shuffle-MCPs
 * component the consumer mounts directly. Mirrors `ShuffleCoreHostProps` so a
 * single context object can be threaded through any Shuffle surface.
 *
 * All fields are optional so components remain usable standalone; concrete
 * components decide which ones they actually read.
 *
 * Conventional usage inside a component:
 *   - Skip auth-dependent fetches while `isLoaded === false`.
 *   - Skip authenticated-only fetches when `isLoggedIn === false`.
 *   - Prefer `globalUrl` over the bundled `API_CONFIG.baseUrl` when set.
 *   - Read org / role / support flags from `userdata` when available
 *     (e.g. `userdata?.active_org?.id`).
 */
export interface ShuffleHostProps {
  /** True when rendered during SSR (skip window/document access). */
  serverside?: boolean;
  /** True once the host has finished hydrating auth + org info (/getinfo done). */
  isLoaded?: boolean;
  /** True when the active user session is authenticated. Only meaningful once `isLoaded` is true. */
  isLoggedIn?: boolean;
  /** Backend API base URL. Overrides `API_CONFIG.baseUrl` defaults when provided. */
  globalUrl?: string;
  /** Userdata returned by `GET /api/v1/getinfo` (active_org, support, etc.). */
  userdata?: any;
  /** Optional theme mode forwarded through composed Shuffle surfaces. */
  theme?: 'light' | 'dark' | 'system';
  /** Legacy theme alias forwarded through composed Shuffle surfaces. */
  colorMode?: 'light' | 'dark' | 'auto';
}
