// Google Analytics tracking via react-ga4
// All events are funneled through a single isCloud()-gated wrapper:
// GA only fires on Shuffle Cloud (*.shuffler.io / shutdown.no). On Lovable
// preview and self-hosted (onprem) deployments, every call is a safe no-op.

import ReactGA from 'react-ga4';
import { isCloud } from '@/Shuffle-Core/api';

const GA_MEASUREMENT_ID = 'G-YSYM9JDVEE';

let _initialized = false;

/**
 * Initialize ReactGA. Safe to call multiple times — only the first call
 * on a cloud deployment actually initializes the library.
 */
export function initAnalytics(): void {
  if (_initialized) return;
  if (!isCloud()) return;
  if (typeof window === 'undefined') return;

  ReactGA.initialize(GA_MEASUREMENT_ID);
  _initialized = true;
}

/** True when ReactGA is initialized AND we're on a cloud deployment. */
const canTrack = (): boolean => isCloud() && _initialized;

// Event categories for organization
export type EventCategory =
  | 'auth'
  | 'onboarding'
  | 'navigation'
  | 'engagement'
  | 'conversion'
  | 'incidents'
  | 'detection'
  | 'demo'
  | 'monitors';

// Predefined events for type safety
export const GA_EVENTS = {
  // Auth events
  LOGIN_START: { category: 'auth', action: 'login_start' },
  LOGIN_SUCCESS: { category: 'auth', action: 'login_success' },
  LOGIN_FAILURE: { category: 'auth', action: 'login_failure' },
  REGISTER_START: { category: 'auth', action: 'register_start' },
  REGISTER_SUCCESS: { category: 'auth', action: 'register_success' },
  LOGOUT: { category: 'auth', action: 'logout' },

  // Onboarding events
  ONBOARDING_START: { category: 'onboarding', action: 'onboarding_start' },
  ONBOARDING_STEP: { category: 'onboarding', action: 'onboarding_step' },
  ONBOARDING_COMPLETE: { category: 'onboarding', action: 'onboarding_complete' },
  CHALLENGE_SELECTED: { category: 'onboarding', action: 'challenge_selected' },
  TOOL_SELECTED: { category: 'onboarding', action: 'tool_selected' },
  ONBOARDING_APP_CLICK: { category: 'onboarding', action: 'app_click' },
  ONBOARDING_AUTH_TEST_SUCCESS: { category: 'onboarding', action: 'auth_test_success' },
  ONBOARDING_AUTH_TEST_FAILURE: { category: 'onboarding', action: 'auth_test_failure' },
  ONBOARDING_AUTOMATION_TOGGLE: { category: 'onboarding', action: 'automation_toggle' },
  ONBOARDING_PRODUCT_CHOICE: { category: 'onboarding', action: 'product_choice' },

  // Navigation events
  CTA_CLICK: { category: 'navigation', action: 'cta_click' },
  NAV_CLICK: { category: 'navigation', action: 'nav_click' },
  EXTERNAL_LINK: { category: 'navigation', action: 'external_link' },

  // Engagement events
  SEARCH_USED: { category: 'engagement', action: 'search_used' },
  CATEGORY_FILTER: { category: 'engagement', action: 'category_filter' },
  APP_VIEWED: { category: 'engagement', action: 'app_viewed' },

  // Conversion events
  FREE_TRIAL_START: { category: 'conversion', action: 'free_trial_start' },
  INTEGRATION_CONNECTED: { category: 'conversion', action: 'integration_connected' },

  // Incident events
  INCIDENT_AUTOMATION_CHANGE: { category: 'incidents', action: 'automation_change' },
  INCIDENT_CREATE: { category: 'incidents', action: 'create' },
  INCIDENT_RESOLVE: { category: 'incidents', action: 'resolve' },
  INCIDENT_BULK_RESOLVE: { category: 'incidents', action: 'bulk_resolve' },
  INCIDENT_SYNC: { category: 'incidents', action: 'sync' },
  INCIDENT_INGESTION_TOGGLE: { category: 'incidents', action: 'ingestion_toggle' },
  INCIDENT_MERGE: { category: 'incidents', action: 'merge' },

  // Detection events
  DETECTION_SENSOR_SELECT: { category: 'detection', action: 'sensor_select' },
  DETECTION_SENSOR_CHECK: { category: 'detection', action: 'sensor_check' },
  DETECTION_RULES_LOAD: { category: 'detection', action: 'rules_load' },
  DETECTION_DEPLOY_CLICK: { category: 'detection', action: 'deploy_click' },
  DETECTION_TEST_RUN: { category: 'detection', action: 'test_run' },
  DETECTION_STEP_EXPAND: { category: 'detection', action: 'step_expand' },
  DETECTION_ENV_CREATE: { category: 'detection', action: 'env_create' },

  // Demo tour funnel events.
  // Each fires with `label = stepId` and `value = stepIndex` so GA can build
  // a step-ordinal funnel (e.g. how many users reach step 5 of the demo).
  //
  // Funnel layers:
  //   DEMO_START          — user clicked "Start demo tour"
  //   DEMO_LIVE_ENV_*     — environment bootstrap (workflows + feeds + IOCs) result
  //   DEMO_STEP_VIEW      — user landed on a step (once per session per step)
  //   DEMO_STEP_ADVANCE   — user clicked Next from a step (counts as "successful
  //                         at this step" for steps without an explicit gate)
  //   DEMO_STEP_COMPLETE  — gated step's requirement was satisfied (e.g. webhook on)
  //   DEMO_FORCE_CREATE_INCIDENTS — manual rescue button on the incidents step
  //   DEMO_FINISH         — user reached the final wrap step
  //   DEMO_ABANDON        — user closed/exited the tour before finishing
  //   DEMO_CLEANUP        — user clicked "Clean up demo data"
  //   DEMO_MINIMIZE/RESTORE — drawer pill state
  DEMO_START: { category: 'demo', action: 'demo_start' },
  DEMO_LIVE_ENV_SUCCESS: { category: 'demo', action: 'demo_live_env_success' },
  DEMO_LIVE_ENV_FAILURE: { category: 'demo', action: 'demo_live_env_failure' },
  DEMO_STEP_VIEW: { category: 'demo', action: 'demo_step_view' },
  DEMO_STEP_ADVANCE: { category: 'demo', action: 'demo_step_advance' },
  DEMO_STEP_COMPLETE: { category: 'demo', action: 'demo_step_complete' },
  DEMO_FORCE_CREATE_INCIDENTS: { category: 'demo', action: 'demo_force_create_incidents' },
  DEMO_FINISH: { category: 'demo', action: 'demo_finish' },
  DEMO_ABANDON: { category: 'demo', action: 'demo_abandon' },
  DEMO_CLEANUP: { category: 'demo', action: 'demo_cleanup' },
  DEMO_MINIMIZE: { category: 'demo', action: 'demo_minimize' },
  DEMO_RESTORE: { category: 'demo', action: 'demo_restore' },

  // Host monitor (Add Host) funnel events.
  //   OPEN     — user opened the Add Host dialog
  //   DEPLOY   — advanced from "checks" to "deploy" step (saw the install command)
  //   DETECTED — sensor actually checked in while the dialog was open (success)
  //   DISMISS  — dialog closed (or page unmounted) without a successful detection (abandonment)
  // Together these form a 4-step funnel: OPEN → DEPLOY → DETECTED, with DISMISS as the abandonment counter.
  MONITOR_ADD_HOST_OPEN: { category: 'monitors', action: 'add_host_open' },
  MONITOR_ADD_HOST_DEPLOY: { category: 'monitors', action: 'add_host_deploy' },
  MONITOR_ADD_HOST_DETECTED: { category: 'monitors', action: 'add_host_detected' },
  MONITOR_ADD_HOST_DISMISS: { category: 'monitors', action: 'add_host_dismiss' },
} as const;

interface TrackEventParams {
  category: EventCategory;
  action: string;
  label?: string;
  value?: number;
  custom?: Record<string, unknown>;
}

/**
 * Track a custom event in Google Analytics via ReactGA.
 * No-op unless we're on a Shuffle Cloud deployment (isCloud()).
 */
export function trackEvent({ category, action, label, value, custom }: TrackEventParams): void {
  if (!canTrack()) return;

  ReactGA.event(action, {
    event_category: category,
    event_label: label,
    value,
    ...custom,
  });
}

/**
 * Track a predefined event from GA_EVENTS.
 */
export function trackPredefinedEvent(
  event: typeof GA_EVENTS[keyof typeof GA_EVENTS],
  label?: string,
  value?: number,
  custom?: Record<string, unknown>
): void {
  trackEvent({
    category: event.category as EventCategory,
    action: event.action,
    label,
    value,
    custom,
  });
}

/**
 * Track page views (useful for SPA navigation).
 */
export function trackPageView(path: string, title?: string): void {
  if (!canTrack()) return;

  ReactGA.send({
    hitType: 'pageview',
    page: path,
    title: title || (typeof document !== 'undefined' ? document.title : undefined),
  });
}

/**
 * Track CTA button clicks with common pattern.
 */
export function trackCTA(ctaName: string, location?: string): void {
  trackPredefinedEvent(GA_EVENTS.CTA_CLICK, ctaName, undefined, {
    cta_location: location,
  });
}

/**
 * Track onboarding step progression.
 */
export function trackOnboardingStep(stepNumber: number, stepName: string): void {
  trackPredefinedEvent(GA_EVENTS.ONBOARDING_STEP, stepName, stepNumber);
}

/**
 * Track utm_content and shuffle_ref query params as GA events.
 * Call once on app init.
 */
export function trackReferralParams(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const utmContent = params.get('utm_content');
  const shuffleRef = params.get('shuffle_ref');

  if (utmContent) {
    trackEvent({ category: 'navigation', action: 'utm_content', label: utmContent });
  }
  if (shuffleRef) {
    trackEvent({ category: 'navigation', action: 'shuffle_ref', label: shuffleRef });
  }
}
