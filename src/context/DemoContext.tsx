/**
 * Demo Mode global state — drives both the dashboard CTA and the floating
 * tour drawer. Mounted once in App.tsx so it survives route changes.
 *
 * Some steps have a `requirement`: a real action the user must perform on the
 * page before the tour will let them advance. The drawer's Next button is
 * disabled until `completedSteps[stepId]` flips true, and a spotlight points
 * at the element identified by `targetSelector`.
 */

import { useCallback, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useNavigate, useLocation } from '@/lib/router-compat';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { seedForStep, cleanupDemoData, isDemoActive, getDemoStats, forceRecreateDemoIncidents, forceCreateSingleDemoIncident, countDemoIncidents, countDemoFocusIncidents, seedDemoWazuhImplantIncident, setPendingIndicatorReady } from '@/services/demoMode';
import { enableLiveDemoEnvironment } from '@/services/demoLiveEnvironment';
import { trackPredefinedEvent, GA_EVENTS } from '@/lib/analytics';
import { applyEntityTerminology } from '@/lib/entityTerminology';
import { getEntityTerminology } from '@/hooks/useEntityLabel';
import { safeLocalStorage } from '@/lib/ssr-storage';

const tDemo = (s: string) => {
  const { singular, plural } = getEntityTerminology();
  return applyEntityTerminology(s, singular, plural);
};

export interface TourStepRequirement {
  /** Short human label shown in the drawer (e.g. "Enable the ingestion webhook"). */
  label: string;
  /** CSS selector for the element the spotlight should point at. Use a stable `[data-tour="..."]` attr. */
  targetSelector: string;
}

/**
 * A sub-goal is one of several discrete things the user must complete inside
 * a single tour step. Each sub-goal tracks completion under its own id (which
 * is stored in the same `completedSteps` map). The step is unlocked only when
 * every sub-goal id is marked complete.
 */
export interface TourStepSubGoal {
  /** Stable id used as the key in `completedSteps`. */
  id: string;
  /** Short human label shown in the drawer. */
  label: string;
  /** When true, this sub-goal does NOT block the step from advancing. It is
   *  shown as an "Optional" suggestion and gets its own (secondary) spotlight
   *  once all required sub-goals are done. */
  optional?: boolean;
  /** Optional CSS selector for a per-sub-goal spotlight target. Used when
   *  the spotlight should move to a different element after a previous
   *  sub-goal is completed (e.g. point at the Automation button after the
   *  webhook is enabled). */
  targetSelector?: string;
}

export interface TourStep {
  id: string;
  title: string;
  /** Short lead sentence — keep it to one line if possible. */
  body: string;
  /** Optional scannable bullet points shown under the body. */
  bullets?: string[];
  route?: string;
  /** If set, Next is disabled until completedSteps[id] is true. */
  requirement?: TourStepRequirement;
  /** If set, Next is disabled until every sub-goal id is in completedSteps. */
  subGoals?: TourStepSubGoal[];
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to your demo',
    body: 'We will walk you through incident management, enrichment, automation, and cross-incident correlation. Just follow the highlighted prompts at each step — open "Detailed steps" any time you want the full picture.',
    bullets: [
      '1. Connect ingestion sources',
      '2. Enable webhook and triage automation',
      '3. Triage incoming security incidents',
      '4. Investigate timeline with the AI agent',
      '5. Pivot across correlated indicators',
      '6. Clean up demo data in one click',
    ],
    route: '/dashboard',
    requirement: {
      label: 'Click "Incidents" in the left sidebar',
      targetSelector: '[data-tour="sidebar-incidents-link"]',
    },
  },
  {
    id: 'add-outlook',
    title: 'Add an email source',
    body: 'Pull alerts in from the email tools you already use. Pick either Outlook Office365 or Gmail — we will pretend-authenticate it for the demo.',
    bullets: [
      'Click the highlighted "+" button',
      'Add Outlook Office365 OR Gmail — we will pretend-authenticate it',
    ],
    // No `route` here on purpose — the previous welcome step required the
    // user to navigate to /incidents themselves, so we should not yank them
    // away if they happen to be elsewhere. The spotlight + sidebar
    // highlight will guide them back if needed.
    requirement: {
      label: 'Add Outlook Office365 or Gmail',
      targetSelector: '[data-tour="add-ingestion-source-button"]',
    },
    subGoals: [
      // 1) Open the picker by clicking the highlighted "+" button. Completed
      //    by IncidentsPage when `appSearchOpen` flips true.
      { id: 'add-outlook:open-picker', label: 'Click "Add ingestion source"', targetSelector: '[data-tour="add-ingestion-source-button"]' },
      // 2) Pick the email tool. Selector is a sentinel — IncidentsPage listens
      //    for it and pulses the pinned Outlook / Gmail cards inside
      //    AppSearchDrawer in real time when the user hovers this row.
      { id: 'add-outlook:outlook', label: 'Add Outlook Office365 or Gmail', targetSelector: '[data-tour="demo-email-apps"]' },
    ],
  },
  {
    id: 'ingest-webhook',
    title: 'Turn on the ingestion webhook',
    body: 'A webhook URL where tools can post incidents — and the AI Agent automation that triages every new one.',
    bullets: [
      'Click the highlighted Webhook button and enable it',
      'Open "Automation for Incidents" and make sure the AI Agent automation is enabled',
    ],
    route: '/incidents',
    requirement: {
      label: 'Enable the ingestion webhook and the AI Agent automation',
      targetSelector: '[data-tour="webhook-ingestion-button"]',
    },
    subGoals: [
      {
        id: 'ingest-webhook',
        label: 'Enable the ingestion webhook',
        targetSelector: '[data-tour="webhook-ingestion-button"]',
      },
      {
        id: 'ingest-webhook:automation',
        label: 'Enable the AI Agent automation',
        targetSelector: '[data-tour="incidents-automation-button"]',
      },
    ],
  },
  {
    id: 'incidents-list',
    title: 'Incidents arriving',
    body: 'The phishing email reported by Diego Ruiz just landed. Open it to start investigating — the rest of the related alerts will arrive while you dig in.',
    bullets: [
      'Severity, source tool, assignee, status',
      'Filter, sort, bulk-resolve',
    ],
    route: '/incidents',
    requirement: {
      label: 'The "Phishing email" incident must be present',
      targetSelector: '[data-tour="demo-force-create-incidents"]',
    },
    subGoals: [
      { id: 'incidents-list:present', label: 'The "Phishing email" incident must be present' },
      { id: 'incidents-list:open', label: 'Click the "Phishing email reported by Diego Ruiz" row to open it', targetSelector: '[data-tour="demo-incident-row"]' },
    ],
  },
  {
    id: 'incident-detail',
    title: 'Read the timeline',
    body: 'Background automation is enriching this incident in real time. Find the attacker IP on the timeline, ask the agent a question, and watch a correlated detection arrive.',
    bullets: [
      'Open the Timeline and click the IP observable that was extracted',
      'Ask the agent a question in the Timeline (e.g. "@agent what should I do next?")',
      'A correlated Sliver C2 detection will then arrive on its own',
    ],
    requirement: {
      label: 'Find the IP on the timeline, ask the agent, see the correlation',
      targetSelector: '[data-tour="incident-activity-feed"]',
    },
    subGoals: [
      {
        id: 'incident-detail:open-email-thread',
        label: 'Click the Email Thread header to expand the full message',
        targetSelector: '[data-tour="incident-email-thread"]',
      },
      {
        id: 'incident-detail:timeline-ip',
        label: 'Click the Known IOC pill on the Timeline',
        targetSelector: '[data-tour="timeline-ioc-pill"]',
        optional: true,
      },
      {
        id: 'incident-detail:ask-agent',
        label: 'Ask the agent a question in the Timeline',
        targetSelector: '[data-tour="incident-comment-input"]',
      },
      {
        id: 'incident-detail:wazuh',
        label: 'A correlated Sliver C2 detection arrives',
        targetSelector: '[data-tour="demo-force-create-incidents"]',
      },
    ],
  },
  {
    id: 'correlations',
    title: 'Critical: same URL, two incidents',
    body: 'The exact lure URL Sarah Chen clicked in the phishing email is the same URL the Sliver C2 implant on FIN-LAPTOP-04 is now beaconing to. That is not a coincidence — it is a confirmed compromise. Open Correlations and pivot through the URL to the Wazuh incident.',
    bullets: [
      'Open Correlations',
      'Find the red "Known IOC" row keyed by the lure URL',
      'Click the linked Sliver C2 incident chip to pivot',
    ],
    requirement: {
      label: 'Pivot through the shared URL to the Sliver C2 incident',
      targetSelector: '[data-tour="incident-tab-correlations"]',
    },
    subGoals: [
      {
        id: 'correlations:open-tab',
        label: 'Open Correlations',
        targetSelector: '[data-tour="incident-tab-correlations"]',
      },
      {
        id: 'correlations:pivot',
        label: 'Click the URL correlation linking to the Sliver C2 incident',
        targetSelector: '[data-corr-key^="http"]',
      },
    ],
  },
  {
    id: 'wrap',
    title: 'Demo complete',
    body: 'You have walked through email and webhook ingestion, automated AI triage, timeline investigation, and cross-incident correlation on shared indicators.',
    bullets: [
      'Ingestion: Email sources and live webhook ingestion configured',
      'Automation: AI agent triage and background enrichment running',
      'Correlation: Lure URL linked phishing report to Sliver C2 detection',
      'Cleanup: Remove all demo entities with one click whenever you are ready',
    ],
  },
];

export type DemoDock = 'right' | 'bottom';

export interface DemoContextValue {
  active: boolean;
  isSeeding: boolean;
  isCleaning: boolean;
  drawerOpen: boolean;
  /** When true, the drawer collapses into a small pill in the bottom-right. */
  minimized: boolean;
  /** Where the expanded drawer is docked. */
  dock: DemoDock;
  step: number;
  stats: { incidents: number; assets: number; users: number };
  /** Map of step id → completed (only relevant for steps with a requirement). */
  completedSteps: Record<string, boolean>;
  /** Whether the current step's gate (if any) is satisfied. */
  currentStepUnlocked: boolean;
  startDemo: () => Promise<void>;
  openTour: () => void;
  closeTour: () => void;
  minimizeTour: () => void;
  restoreTour: () => void;
  toggleDock: () => void;
  setDock: (d: DemoDock) => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (i: number) => void;
  cleanup: () => Promise<void>;
  /** Imperatively mark a step as done (used by completion watchers). */
  markStepCompleted: (stepId: string) => void;
  /** Set a step's completion explicitly — supports reverting (e.g. webhook
   *  re-stopped after being started). */
  setStepCompleted: (stepId: string, done: boolean) => void;
  /** Force delete + recreate the demo incidents (manual rescue button). */
  forceCreateIncidents: () => Promise<void>;
  /** True while a force-create is running. */
  isForceCreatingIncidents: boolean;
  /** Force-generate a single "focus" demo incident (Wazuh / Sliver C2).
   *  Other incidents arrive later for cross-correlation. */
  forceGenerateSingleIncident: () => Promise<void>;
  /** True while the single-incident force-generate is running. */
  isForceGeneratingSingle: boolean;
  /** Force-generate the Wazuh / Sliver C2 follow-up incident immediately
   *  (used by the step-5 sub-goal "force generate" button). */
  forceGenerateWazuhIncident: () => Promise<void>;
  /** True while the Wazuh force-generate is running. */
  isForceGeneratingWazuh: boolean;
  /** True when at least one demo incident is present in the datastore. */
  hasDemoIncidents: boolean;
  /** True when the user is currently on an incident-detail route. Live. */
  isOnIncidentDetail: boolean;
  /** Increments every time openTour/restoreTour is called — drawer uses this
   *  to flash an attention pulse so repeated clicks of "Continue demo mode"
   *  visibly do something even when the drawer is already open. */
  attentionPulse: number;
  /** When set (via hovering a goal row in the drawer), the spotlight should
   *  override its target and point at this selector with stronger emphasis.
   *  This lets the user "preview" where each goal lives on the page without
   *  losing focus on the drawer. Cleared on mouse-leave. */
  hoveredGoalSelector: string | null;
  setHoveredGoalSelector: (selector: string | null) => void;
  /** True when a demo run was previously started but never finished or
   *  cleaned up. Drives the floating "Continue demo" pill. */
  wasStarted: boolean;
  /** True when the user explicitly dismissed the resume pill (X icon). */
  resumeDismissed: boolean;
  /** Re-open the tour from the last step the user was on. */
  resumeTour: () => void;
  /** Hide the resume pill until the next demo run is started. */
  dismissResumePrompt: () => void;
}

// DemoContext + useDemo are defined in ./demoContextObject so HMR cannot
// desync the context identity between provider and consumers. Re-exported
// here so existing `import { useDemo } from '@/context/DemoContext'` calls
// keep working without touching every call site.
import { DemoContext, useDemo } from './demoContextObject';
export { useDemo };

export const DemoProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  // Real-time route check: are we currently on an incident-detail page?
  // Used to gate the `incidents-list:open` sub-goal so the gate flips back
  // off if the user navigates away from the detail page.
  const isOnIncidentDetail = /^\/(?:incidents|cases|alerts|tickets|jobs)\/[^/]+/.test(location.pathname);
  const queryClient = useQueryClient();
  // Keep the server and first client render deterministic. Demo state is a
  // browser preference and must not be read while React is rendering on the
  // server (or depend on a global storage shim being installed first).
  const [active, setActive] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [minimized, setMinimized] = useState<boolean>(() => {
    try { return safeLocalStorage.getItem('shuffle_demo_minimized') === 'true'; } catch { return false; }
  });
  const [dock, setDockState] = useState<DemoDock>(() => {
    try {
      const v = safeLocalStorage.getItem('shuffle_demo_dock');
      // Default to bottom-right ("right") so the drawer hugs the corner
      // instead of stretching full-width across the bottom of the screen.
      return v === 'bottom' ? 'bottom' : 'right';
    } catch { return 'right'; }
  });
  const [step, setStep] = useState(0);
  const [stats, setStats] = useState(() => getDemoStats());
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
  const [isForceCreatingIncidents, setIsForceCreatingIncidents] = useState(false);
  const [isForceGeneratingSingle, setIsForceGeneratingSingle] = useState(false);
  const [isForceGeneratingWazuh, setIsForceGeneratingWazuh] = useState(false);
  const [hasDemoIncidents, setHasDemoIncidents] = useState(false);
  const [attentionPulse, setAttentionPulse] = useState(0);
  const [hoveredGoalSelector, setHoveredGoalSelector] = useState<string | null>(null);
  const [wasStarted, setWasStarted] = useState<boolean>(() => {
    try { return safeLocalStorage.getItem('shuffle_demo_started') === 'true'; } catch { return false; }
  });
  const [resumeDismissed, setResumeDismissed] = useState<boolean>(() => {
    try { return safeLocalStorage.getItem('shuffle_demo_resume_dismissed') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    setActive(isDemoActive());
  }, []);

  // GA dedupe: each step view fires at most once per session, each completion
  // fires at most once per step. Refs survive re-renders without retriggering.
  const viewedStepsRef = useRef<Set<string>>(new Set());
  const completedStepsGARef = useRef<Set<string>>(new Set());

  /** Fire a GA funnel event for a tour step. Safe no-op outside cloud. */
  const trackDemoStep = useCallback((
    event: typeof GA_EVENTS.DEMO_STEP_VIEW | typeof GA_EVENTS.DEMO_STEP_COMPLETE | typeof GA_EVENTS.DEMO_FINISH,
    index: number,
  ) => {
    const def = TOUR_STEPS[index];
    if (!def) return;
    trackPredefinedEvent(event, def.id, index, { step_index: index, step_id: def.id });
  }, []);

  const minimizeTour = useCallback(() => {
    setMinimized(true);
    try { safeLocalStorage.setItem('shuffle_demo_minimized', 'true'); } catch { /* ignore */ }
    trackPredefinedEvent(GA_EVENTS.DEMO_MINIMIZE, TOUR_STEPS[step]?.id, step);
  }, [step]);
  const restoreTour = useCallback(() => {
    setMinimized(false);
    setDrawerOpen(true);
    setAttentionPulse(p => p + 1);
    try { safeLocalStorage.setItem('shuffle_demo_minimized', 'false'); } catch { /* ignore */ }
    trackPredefinedEvent(GA_EVENTS.DEMO_RESTORE, TOUR_STEPS[step]?.id, step);
  }, [step]);
  const setDock = useCallback((d: DemoDock) => {
    setDockState(d);
    try { safeLocalStorage.setItem('shuffle_demo_dock', d); } catch { /* ignore */ }
  }, []);
  const toggleDock = useCallback(() => {
    setDockState(prev => {
      const next: DemoDock = prev === 'right' ? 'bottom' : 'right';
      try { safeLocalStorage.setItem('shuffle_demo_dock', next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const refreshStats = useCallback(() => setStats(getDemoStats()), []);

  const setStepCompleted = useCallback((stepId: string, done: boolean) => {
    setCompletedSteps(prev => {
      const cur = !!prev[stepId];
      if (cur === done) return prev;
      const next = { ...prev };
      if (done) next[stepId] = true; else delete next[stepId];
      return next;
    });
    // Fire DEMO_STEP_COMPLETE once per step on the first true-flip only.
    if (done && !completedStepsGARef.current.has(stepId)) {
      completedStepsGARef.current.add(stepId);
      const idx = TOUR_STEPS.findIndex(s => s.id === stepId);
      if (idx >= 0) trackDemoStep(GA_EVENTS.DEMO_STEP_COMPLETE, idx);
    }
  }, [trackDemoStep]);

  const markStepCompleted = useCallback((stepId: string) => {
    setStepCompleted(stepId, true);
  }, [setStepCompleted]);

  const navigateForStep = useCallback((i: number) => {
    const route = TOUR_STEPS[i]?.route;
    if (route && typeof window !== 'undefined' && window.location.pathname !== route) {
      navigate(route);
    }
  }, [navigate]);

  // Run the seeder for the given step (idempotent — no-op if already seeded).
  const runStepSeed = useCallback(async (i: number) => {
    const stepDef = TOUR_STEPS[i];
    if (!stepDef) return;
    try {
      const added = await seedForStep(stepDef.id);
      if (added > 0) {
        refreshStats();
        if (stepDef.id === 'incidents-list') setHasDemoIncidents(true);
      }
    } catch {
      toast.error('Failed to add sample data for this step.');
    }
  }, [refreshStats]);

  const startDemo = useCallback(async () => {
    setIsSeeding(true);
    try {
      // Mark active immediately so the dashboard CTA flips state, even before any data lands.
      safeLocalStorage.setItem('shuffle_demo_active', 'true');
      // Persistent "started but not finished" flag — drives the floating
      // resume pill if the user closes the drawer without finishing.
      try { safeLocalStorage.setItem('shuffle_demo_started', 'true'); } catch { /* ignore */ }
      try { safeLocalStorage.removeItem('shuffle_demo_resume_dismissed'); } catch { /* ignore */ }
      setWasStarted(true);
      setResumeDismissed(false);
      setActive(true);
      setStep(0);
      setDrawerOpen(true);
      // Always force the tour open in its full size when starting — never inherit
      // a stale "minimized" state from a previous session.
      setMinimized(false);
      try { safeLocalStorage.setItem('shuffle_demo_minimized', 'false'); } catch { /* ignore */ }
      // Always start docked to the right — never inherit a stale "bottom"
      // dock from a previous session. Users can still toggle after.
      setDockState('right');
      try { safeLocalStorage.setItem('shuffle_demo_dock', 'right'); } catch { /* ignore */ }
      // Reset the floating drawer's drag offset so a previously-dragged
      // (possibly off-screen) position never carries over into a new run.
      try {
        safeLocalStorage.removeItem('shuffle:demo-drawer-offset');
        window.dispatchEvent(new CustomEvent('demo-offset-changed', { detail: { x: 0, y: 0 } }));
      } catch { /* ignore */ }
      // Auto-collapse the sidebar to give the tour drawer + main content
      // more room. The DashboardLayout listens for this event.
      try {
        safeLocalStorage.setItem('shuffle-security-sidebar-collapsed', 'true');
        window.dispatchEvent(new Event('shuffle:sidebar-collapse'));
      } catch { /* ignore */ }
      // Reset GA dedupes for a fresh funnel run
      viewedStepsRef.current = new Set();
      completedStepsGARef.current = new Set();
      trackPredefinedEvent(GA_EVENTS.DEMO_START);
      // Step 1/9 (intro) is page-agnostic — leave the user on whatever page
      // they opened the demo from. Subsequent steps still navigate via
      // `navigateForStep` when the user advances.
      // Make the environment "live": generate ingest + threat-intel
      // workflows and seed Threat Feeds + IOC Types defaults. The
      // indicator pipeline (1 → 2 → 3 → 4) runs sequentially inside
      // enableLiveDemoEnvironment; `indicatorReady` resolves once at
      // least one entry exists in `ioc_domain` so the incidents-list
      // seeder can pick a real IOC instead of the static fallback.
      const liveEnvStartedAt = Date.now();
      const { ready, indicatorReady } = enableLiveDemoEnvironment();
      // Publish the indicator-availability promise so the incidents-list
      // step seeder can await it before picking IOCs.
      setPendingIndicatorReady(indicatorReady);
      const liveEnvPromise = ready
        .then(() => {
          trackPredefinedEvent(GA_EVENTS.DEMO_LIVE_ENV_SUCCESS, undefined, Date.now() - liveEnvStartedAt);
        })
        .catch(err => {
          console.warn('[demo] live environment bootstrap failed', err);
          trackPredefinedEvent(GA_EVENTS.DEMO_LIVE_ENV_FAILURE, String(err?.message || 'unknown'), Date.now() - liveEnvStartedAt);
        });
      await Promise.all([runStepSeed(0), liveEnvPromise]);
    } finally {
      setIsSeeding(false);
    }
  }, [navigateForStep, runStepSeed]);

  const openTour = useCallback(() => {
    setDrawerOpen(true);
    setMinimized(false);
    setAttentionPulse(p => p + 1);
    try { safeLocalStorage.setItem('shuffle_demo_minimized', 'false'); } catch { /* ignore */ }
    navigateForStep(step);
    runStepSeed(step);
  }, [navigateForStep, runStepSeed, step]);

  // Closing the tour drawer also deactivates demo mode so the dashboard CTA
  // returns to its inactive state. Any already-seeded sample data stays put
  // until the user explicitly runs "Clean up demo data".
  const closeTour = useCallback(() => {
    // Fire the abandon event ONLY if the user did not actually finish the
    // tour. Reaching the wrap step means they completed it.
    const isOnFinalStep = step === TOUR_STEPS.length - 1;
    if (!isOnFinalStep) {
      trackPredefinedEvent(GA_EVENTS.DEMO_ABANDON, TOUR_STEPS[step]?.id, step, {
        step_index: step,
        step_id: TOUR_STEPS[step]?.id,
      });
    }
    setDrawerOpen(false);
    setActive(false);
    try { safeLocalStorage.removeItem('shuffle_demo_active'); } catch { /* ignore */ }
    // If they reached the final step, treat the demo as finished and stop
    // showing the resume pill.
    if (isOnFinalStep) {
      try { safeLocalStorage.removeItem('shuffle_demo_started'); } catch { /* ignore */ }
      try { safeLocalStorage.removeItem('shuffle_demo_resume_dismissed'); } catch { /* ignore */ }
      setWasStarted(false);
      setResumeDismissed(false);
    }
  }, [step]);

  const resumeTour = useCallback(() => {
    setActive(true);
    setDrawerOpen(true);
    setMinimized(false);
    setResumeDismissed(false);
    try { safeLocalStorage.setItem('shuffle_demo_active', 'true'); } catch { /* ignore */ }
    try { safeLocalStorage.setItem('shuffle_demo_minimized', 'false'); } catch { /* ignore */ }
    try { safeLocalStorage.removeItem('shuffle_demo_resume_dismissed'); } catch { /* ignore */ }
    setAttentionPulse(p => p + 1);
    navigateForStep(step);
  }, [navigateForStep, step]);

  const dismissResumePrompt = useCallback(() => {
    setResumeDismissed(true);
    try { safeLocalStorage.setItem('shuffle_demo_resume_dismissed', 'true'); } catch { /* ignore */ }
  }, []);

  const isStepUnlocked = useCallback((s: TourStep | undefined): boolean => {
    if (!s) return true;
    // Sub-goal gate takes precedence: if defined, the step's own
    // `requirement` is purely cosmetic and only the sub-goals decide.
    if (s.subGoals && s.subGoals.length > 0) {
      return s.subGoals.every(g => {
        // Optional sub-goals never block step advancement.
        if (g.optional) return true;
        // Special-case the incidents-list:present sub-goal — it is satisfied
        // by the live datastore presence check, not by the completedSteps map.
        if (g.id === 'incidents-list:present') return hasDemoIncidents;
        // Special-case the incidents-list:open sub-goal — it tracks the live
        // route, so leaving the detail page reverts the gate.
        if (g.id === 'incidents-list:open') return isOnIncidentDetail;
        return !!completedSteps[g.id];
      });
    }
    // Step-level requirement gate (legacy single-goal).
    if (s.requirement && !completedSteps[s.id]) return false;
    return true;
  }, [completedSteps, hasDemoIncidents, isOnIncidentDetail]);

  const currentStep = TOUR_STEPS[step];
  const currentStepUnlocked = isStepUnlocked(currentStep);

  const nextStep = useCallback(() => {
    setStep(prev => {
      const cur = TOUR_STEPS[prev];
      if (!isStepUnlocked(cur)) return prev;
      const next = Math.min(prev + 1, TOUR_STEPS.length - 1);
      // Successful step advance — counts as "user completed step N successfully".
      trackPredefinedEvent(GA_EVENTS.DEMO_STEP_ADVANCE, cur?.id, prev, {
        step_index: prev,
        step_id: cur?.id,
        from_index: prev,
        to_index: next,
      });
      navigateForStep(next);
      runStepSeed(next);
      return next;
    });
  }, [navigateForStep, runStepSeed, isStepUnlocked]);

  const prevStep = useCallback(() => {
    setStep(prev => {
      const next = Math.max(prev - 1, 0);
      navigateForStep(next);
      runStepSeed(next);
      return next;
    });
  }, [navigateForStep, runStepSeed]);

  const goToStep = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(i, TOUR_STEPS.length - 1));
    // Allow free backward jumps; forward jumps respect the gate at current step.
    if (clamped > step) {
      const cur = TOUR_STEPS[step];
      if (!isStepUnlocked(cur)) return;
    }
    setStep(clamped);
    navigateForStep(clamped);
    runStepSeed(clamped);
  }, [navigateForStep, runStepSeed, isStepUnlocked, step]);

  const cleanup = useCallback(async () => {
    setIsCleaning(true);
    trackPredefinedEvent(GA_EVENTS.DEMO_CLEANUP, TOUR_STEPS[step]?.id, step);
    try {
      const res = await cleanupDemoData();
      setActive(false);
      setDrawerOpen(false);
      setStep(0);
      setCompletedSteps({});
      setWasStarted(false);
      setResumeDismissed(false);
      try { safeLocalStorage.removeItem('shuffle_demo_started'); } catch { /* ignore */ }
      try { safeLocalStorage.removeItem('shuffle_demo_resume_dismissed'); } catch { /* ignore */ }
      viewedStepsRef.current = new Set();
      completedStepsGARef.current = new Set();
      refreshStats();
      // Bust the dashboard's leftover-demo-count cache so the "Clean up demo
      // data (N)" button immediately reflects the new state instead of
      // showing a stale count for up to 60s.
      queryClient.invalidateQueries({ queryKey: ['demo-card', 'leftover-demo-count'] });
      if (res.success) {
        toast.success(`Removed ${res.deleted} demo item${res.deleted === 1 ? '' : 's'}.`);
      } else {
        toast.warning(`Removed ${res.deleted} items, ${res.failed} failed. You can run cleanup again.`);
      }
    } finally {
      setIsCleaning(false);
    }
  }, [refreshStats, step]);

  const forceCreateIncidents = useCallback(async () => {
    setIsForceCreatingIncidents(true);
    try {
      const added = await forceRecreateDemoIncidents();
      refreshStats();
      const present = await countDemoIncidents();
      setHasDemoIncidents(present > 0);
      trackPredefinedEvent(GA_EVENTS.DEMO_FORCE_CREATE_INCIDENTS, present > 0 ? 'success' : 'failure', present, {
        added,
        present,
      });
      if (added > 0) {
        toast.success(tDemo(`Recreated ${added} demo incident${added === 1 ? '' : 's'}.`));
      } else if (present > 0) {
        toast.success(tDemo(`Demo incidents are present (${present}).`));
      } else {
        toast.error(tDemo('Could not create demo incidents. Please try again.'));
      }
    } catch (err) {
      trackPredefinedEvent(GA_EVENTS.DEMO_FORCE_CREATE_INCIDENTS, 'error', 0, {
        error: String((err as Error)?.message || 'unknown'),
      });
      toast.error(tDemo('Failed to recreate demo incidents.'));
    } finally {
      setIsForceCreatingIncidents(false);
    }
  }, [refreshStats]);

  const forceGenerateSingleIncident = useCallback(async () => {
    setIsForceGeneratingSingle(true);
    try {
      const added = await forceCreateSingleDemoIncident();
      refreshStats();
      const present = await countDemoIncidents();
      setHasDemoIncidents(present > 0);
      trackPredefinedEvent(GA_EVENTS.DEMO_FORCE_CREATE_INCIDENTS, added > 0 ? 'success-single' : 'failure-single', present, {
        added,
        present,
        mode: 'single',
      });
      if (added > 0) {
        toast.success(tDemo('Generated focus incident — others will follow.'));
      } else {
        toast.error(tDemo('Could not generate the focus incident. Please try again.'));
      }
    } catch (err) {
      trackPredefinedEvent(GA_EVENTS.DEMO_FORCE_CREATE_INCIDENTS, 'error-single', 0, {
        error: String((err as Error)?.message || 'unknown'),
        mode: 'single',
      });
      toast.error(tDemo('Failed to generate the focus incident.'));
    } finally {
      setIsForceGeneratingSingle(false);
    }
  }, [refreshStats]);

  const forceGenerateWazuhIncident = useCallback(async () => {
    setIsForceGeneratingWazuh(true);
    try {
      const added = await seedDemoWazuhImplantIncident();
      refreshStats();
      if (added > 0) {
        toast.warning('New correlation found: Sliver C2 implant detected on the same host.', { duration: 5000 });
      } else {
        toast.info('Sliver C2 detection is already present.');
      }
    } catch {
      toast.error('Failed to generate the Sliver C2 detection.');
    } finally {
      setIsForceGeneratingWazuh(false);
    }
  }, [refreshStats]);
  // Tracks whether any demo-tagged incidents currently exist. Re-checks on
  // every `demo:refresh` broadcast (covers seeder/cleanup paths) AND on a
  // light interval + window focus while the tour drawer is open on the
  // `incidents-list` step. The interval is intentionally scoped so we do
  // not poll the datastore for the entire session — only when the user is
  // actually on the step that needs the live "is the phishing email still
  // there?" signal (e.g. they manually deleted it from the list).
  useEffect(() => {
    if (!active) {
      setHasDemoIncidents(false);
      return;
    }
    let cancelled = false;
    const check = async () => {
      const n = TOUR_STEPS[step]?.id === 'incidents-list'
        ? await countDemoFocusIncidents()
        : await countDemoIncidents();
      if (!cancelled) setHasDemoIncidents(n > 0);
    };
    check();
    const onRefresh = () => check();
    window.addEventListener('demo:refresh', onRefresh as EventListener);

    // Live polling — only while on step `incidents-list` with the drawer
    // open. Picks up manual deletions of the seeded phishing incident so the
    // sub-goal (and the "Force generate" button) stay accurate in real time.
    const onIncidentsListStep =
      drawerOpen && TOUR_STEPS[step]?.id === 'incidents-list';
    let intervalId: number | undefined;
    let onFocus: (() => void) | undefined;
    if (onIncidentsListStep) {
      intervalId = window.setInterval(check, 4000);
      onFocus = () => check();
      window.addEventListener('focus', onFocus);
    }

    return () => {
      cancelled = true;
      window.removeEventListener('demo:refresh', onRefresh as EventListener);
      if (intervalId !== undefined) window.clearInterval(intervalId);
      if (onFocus) window.removeEventListener('focus', onFocus);
    };
  }, [active, drawerOpen, step]);

  // Funnel signal: whenever the user lands on a new step (via start/next/prev/
  // goToStep/openTour), fire DEMO_STEP_VIEW exactly once per step per session.
  // Also fire DEMO_FINISH the first time the final "wrap" step is viewed.
  useEffect(() => {
    if (!active || !drawerOpen) return;
    const def = TOUR_STEPS[step];
    if (!def) return;
    if (viewedStepsRef.current.has(def.id)) return;
    viewedStepsRef.current.add(def.id);
    trackDemoStep(GA_EVENTS.DEMO_STEP_VIEW, step);
    if (step === TOUR_STEPS.length - 1) {
      trackDemoStep(GA_EVENTS.DEMO_FINISH, step);
    }
  }, [active, drawerOpen, step, trackDemoStep]);

  // Re-sync active flag if changed in another tab
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'shuffle_demo_active') {
        setActive(isDemoActive());
        refreshStats();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshStats]);

  const value = useMemo<DemoContextValue>(() => ({
    active, isSeeding, isCleaning, drawerOpen, minimized, dock, step, stats,
    completedSteps, currentStepUnlocked,
    startDemo, openTour, closeTour, minimizeTour, restoreTour, toggleDock, setDock,
    nextStep, prevStep, goToStep, cleanup,
    markStepCompleted, setStepCompleted,
    forceCreateIncidents, isForceCreatingIncidents,
    forceGenerateSingleIncident, isForceGeneratingSingle,
    forceGenerateWazuhIncident, isForceGeneratingWazuh,
    hasDemoIncidents,
    isOnIncidentDetail,
    attentionPulse,
    hoveredGoalSelector, setHoveredGoalSelector,
    wasStarted, resumeDismissed, resumeTour, dismissResumePrompt,
  }), [
    active, isSeeding, isCleaning, drawerOpen, minimized, dock, step, stats,
    completedSteps, currentStepUnlocked,
    startDemo, openTour, closeTour, minimizeTour, restoreTour, toggleDock, setDock,
    nextStep, prevStep, goToStep, cleanup,
    markStepCompleted, setStepCompleted,
    forceCreateIncidents, isForceCreatingIncidents,
    forceGenerateSingleIncident, isForceGeneratingSingle,
    forceGenerateWazuhIncident, isForceGeneratingWazuh,
    hasDemoIncidents,
    isOnIncidentDetail,
    attentionPulse,
    hoveredGoalSelector,
    wasStarted, resumeDismissed, resumeTour, dismissResumePrompt,
  ]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
};

// useDemo is re-exported above from ./demoContextObject.

