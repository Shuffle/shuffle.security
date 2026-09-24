/**
 * Local Singul Library - Helpers
 * This is a local copy for development. Changes here should be merged back to:
 * https://github.com/Shuffle/singul.js
 */

import type { ShuffleHostProps } from '@/Shuffle-MCPs/host-props';

export interface AlgoliaSearchApp {
  name: string;
  description: string;
  objectID: string;
  creator: string;
  app_version: string;
  image_url: string;
  time_edited: number;
  generated: boolean;
  invalid: boolean;
  priority: number;
  actions: number;
  tags: string[];
  accessible_by: string[];
  categories: string[];
  action_labels: string[];
  triggers: string[];
  verified: boolean;
  /**
   * Where this app came from in the merged search results.
   * - 'public'  — Algolia public catalog
   * - 'private' — your own /api/v1/apps (requires apiKey)
   */
  source?: 'public' | 'private';
}

export interface AppSelectedEvent {
  app: AlgoliaSearchApp;
  authUrl: string;
}

export interface CustomStyles {
  // Container & Input
  container?: React.CSSProperties;
  inputWrapper?: React.CSSProperties;
  input?: React.CSSProperties;
  searchIcon?: React.CSSProperties;
  loadingSpinner?: React.CSSProperties;
  spinner?: React.CSSProperties;
  
  // Dropdown
  dropdown?: React.CSSProperties;
  dropdownItem?: React.CSSProperties;
  dropdownItemHover?: React.CSSProperties;
  selectedItem?: React.CSSProperties;
  
  // App Info
  appInfo?: React.CSSProperties;
  appIcon?: React.CSSProperties;
  appDetails?: React.CSSProperties;
  appName?: React.CSSProperties;
  appDescription?: React.CSSProperties;
  appCategory?: React.CSSProperties;
  appTags?: React.CSSProperties;
  
  // Grid Layout
  gridContainer?: React.CSSProperties;
  gridItem?: React.CSSProperties;
  gridItemHover?: React.CSSProperties;
  
  // States
  emptyState?: React.CSSProperties;
  loadingState?: React.CSSProperties;
  errorState?: React.CSSProperties;
  resultsContainer?: React.CSSProperties;
  
  // Selection
  checkbox?: React.CSSProperties;
  checkboxChecked?: React.CSSProperties;
}

export interface AppAuthentication {
  app: {
    id: string;
    name: string;
    large_image: string;
    categories?: string[];
    description?: string;
  };
  fields: Array<{ key: string; value: string }>;
  id: string;
  label: string;
  /** Whether this authentication entry is active */
  active?: boolean;
  validation: {
    /** Whether the authentication has been validated (tests ran successfully) */
    valid: boolean;
    error?: string;
    last_valid?: number;
  };
}

export interface ShuffleMCPProps extends ShuffleHostProps {
  /**
   * Shuffle API key. Used as the `Authorization: Bearer` header on every
   * request the component makes (`/api/v1/apps/authentication`,
   * `/api/v1/apps`) AND forwarded into the OAuth handoff URL as `&auth=`.
   * This is the canonical credential — pass it once.
   */
  apiKey?: string;

  /**
   * @deprecated Use `apiKey` instead. Kept for backwards compatibility — if
   * `apiKey` is set, it is used for the redirect handoff too. If you only
   * provide `authToken` it is still forwarded into the auth URL but no API
   * calls will be made.
   */
  authToken?: string;

  /**
   * Optional Shuffle organization ID. When provided, every API call this
   * component makes (Shuffle backend + Singul gateway) will include an
   * `Org-Id: <orgId>` header so the request is scoped to that org.
   */
  orgId?: string;

  // Search Input
  placeholder?: string;
  
  // Layout
  layout?: 'list' | 'grid';
  gridColumns?: number | { xs?: number; sm?: number; md?: number; lg?: number };
  
  // Display Options
  showDescription?: boolean;
  showCategories?: boolean;
  showTags?: boolean;
  showCheckbox?: boolean;
  
  // Selection
  multiSelect?: boolean;
  selectedApps?: AlgoliaSearchApp[];
  /** Disable automatic selection of already validated apps. Useful for explicit user pickers. */
  disableAutoSelectValidatedApps?: boolean;
  preventDefault?: boolean;
  
  // Display Mode
  /** When true, results show inline on the page instead of as a dropdown */
  inline?: boolean;
  /** Initial search query to run on mount */
  initialQuery?: string;
  /** Search query to run on mount without filling the input (placeholder-style filter) */
  initialFilterQuery?: string;
  /** Number of results per search (default: 15) */
  hitsPerPage?: number;
  
  // Authentication
  /** Base URL for backend API calls (default: https://shuffler.io) */
  apiBaseUrl?: string;
  /** Path appended to apiBaseUrl to fetch authenticated apps (default: /api/v1/apps/authentication) */
  authPath?: string;
  /** Path appended to apiBaseUrl when redirecting to start OAuth/auth (default: /appauth) */
  appAuthPath?: string;
  /** Path appended to apiBaseUrl to fetch the user's private apps (default: /api/v1/apps). Requires apiKey. */
  privateAppsPath?: string;
  /** Disable fetching private apps even when apiKey is set (default: false) */
  disablePrivateApps?: boolean;
  /** Show the All / Public / Private source filter when private apps are available (default: true) */
  showSourceFilter?: boolean;
  /** Base URL for Singul API calls (default: https://singul.io) */
  singulBaseUrl?: string;
  /** Manually provided authenticated apps (used when apiKey is not provided) */
  authenticatedApps?: AppAuthentication[];
  /** Hide the auth status chips (Configured/Not configured, Tested/Not tested) */
  hideAuthStatus?: boolean;
  /** Apps to pin at the top of the results (prepended, deduped by name). */
  pinnedApps?: AlgoliaSearchApp[];

  // Algolia (override defaults to point at your own index)
  /** Algolia application ID (default: Shuffle's public index) */
  algoliaAppId?: string;
  /** Algolia search-only API key (default: Shuffle's public key) */
  algoliaApiKey?: string;
  /** Algolia index name (default: appsearch) */
  algoliaIndexName?: string;

  // Styling
  customStyles?: CustomStyles;
  className?: string;
  
  // Custom Rendering
  renderItem?: (app: AlgoliaSearchApp, isSelected: boolean, onSelect: () => void, authState: { configured: boolean; validated: boolean }) => React.ReactNode;
  renderEmptyState?: (query: string) => React.ReactNode;
  renderLoadingState?: () => React.ReactNode;
  /** Custom footer shown when the user has scrolled through all results */
  renderEndOfResults?: () => React.ReactNode;
  /** Optional element rendered inside the search field, on its right edge.
   *  Useful for injecting context-aware CTAs (e.g. a "New App" chip that
   *  seeds the AddAppDialog with the current category). */
  renderInputEndAdornment?: () => React.ReactNode;

  // Events
  onAppSelected?: (detail: AppSelectedEvent) => void;
  onSelectionChange?: (apps: AlgoliaSearchApp[]) => void;
  onSearchChange?: (query: string) => void;
  /** Called when the user clicks the "New app" CTA at the end of results. */
  onCreateNewApp?: () => void;
}
