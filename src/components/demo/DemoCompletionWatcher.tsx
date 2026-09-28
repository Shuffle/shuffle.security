/**
 * Watches platform state (workflows, agent notifications, route changes,
 * etc.) and keeps the current required tour step's completion in sync with
 * the live state — both directions. If the user reverts the action (e.g.
 * re-stops the webhook after starting it), the step flips back to
 * "Required to continue".
 *
 * Mounted once near the DemoProvider so it's always running while the demo
 * tour is open.
 */

import { useEffect, useRef } from 'react';
import { useLocation } from '@/lib/router-compat';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { useDemo, TOUR_STEPS } from '@/context/DemoContext';
import { useWorkflows } from '@/hooks/useWorkflows';
import { isWorkflowScheduleStopped } from '@/Shuffle-MCPs/ingestionDetection';
import { seedDemoWazuhImplantIncident } from '@/services/demoMode';
import { useEntityPreference } from '@/hooks/useEntityLabel';

/** How long after the user asks the agent a question before the Wazuh /
 *  Sliver follow-up incident "arrives" — long enough to feel earned, short
 *  enough that the user does not lose context. */
const WAZUH_FOLLOWUP_DELAY_MS = 6000;

export const DemoCompletionWatcher = () => {
  const { drawerOpen, step, setStepCompleted, markStepCompleted, goToStep, setDock, dock, hoveredGoalSelector, completedSteps } = useDemo();
  const askAgentInjectedRef = useRef(false);
  const { data: workflows, isFetching: workflowsFetching } = useWorkflows();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { basePath: entityBasePath } = useEntityPreference();
  const wazuhSeededRef = useRef(false);
  const autoAdvancedRef = useRef(false);
  /** Counts consecutive "webhook missing/stopped" observations. We only
   *  revert the `ingest-webhook` gate to incomplete after seeing it missing
   *  TWICE in a row, to avoid a race where the workflows query is mid-refetch
   *  right after the user clicked Enable: the cache still has the old list
   *  (no webhook), the watcher flips the gate back to false, and the user
   *  sees the spotlight re-lock for a few seconds even though the button is
   *  visibly green. */
  const webhookMissingTicksRef = useRef(0);

  // ─── welcome: bidirectional sync — the user must navigate to the Incidents
  // page from the sidebar themselves. Completes the moment the route matches
  // the configured incidents base path (or any sub-route under it). Reverts
  // to incomplete if they leave again, so the gate stays honest.
  useEffect(() => {
    if (!drawerOpen) return;
    const onIncidents =
      location.pathname === entityBasePath ||
      location.pathname.startsWith(entityBasePath + '/');
    setStepCompleted('welcome', onIncidents);
  }, [drawerOpen, location.pathname, entityBasePath, setStepCompleted]);

  // ─── ingest-webhook: bidirectional sync with the live workflow state ──────
  // Mark complete the moment the Ingestion Webhook workflow exists AND its
  // trigger is started. Mark incomplete only after we have confirmed it's
  // missing/stopped on a SETTLED query (not a mid-flight refetch) AND we have
  // seen it missing twice in a row — see `webhookMissingTicksRef` above.
  useEffect(() => {
    if (!drawerOpen || !workflows) return;
    const webhookWf = workflows.find(w => w.name === 'Ingestion Webhook');
    // Mirror WebhookIngestionButton's source-of-truth exactly: the workflow
    // is "enabled" iff its WEBHOOK trigger specifically is not stopped.
    // (The previous check used isWorkflowScheduleStopped, which returns false
    // as long as ANY trigger is running — that caused the gate to flip green
    // even when the webhook trigger itself was still stopped.)
    const webhookTrigger = webhookWf
      ? (webhookWf.triggers || []).find(
          (t: any) => t.trigger_type === 'WEBHOOK' || t.app_name === 'Webhook'
        )
      : null;
    const done = !!webhookTrigger && (webhookTrigger.status || '').toLowerCase() !== 'stopped';
    if (done) {
      webhookMissingTicksRef.current = 0;
      setStepCompleted('ingest-webhook', true);
      return;
    }
    // Skip flipping false while a refetch is in flight — the cache may be
    // stale right after the user toggled Enable.
    if (workflowsFetching) return;
    webhookMissingTicksRef.current += 1;
    if (webhookMissingTicksRef.current >= 2) {
      setStepCompleted('ingest-webhook', false);
    }
  }, [drawerOpen, workflows, workflowsFetching, setStepCompleted]);

  // Poll workflows so a revert (stopping the webhook again) is picked up
  // quickly without requiring a tab refocus. Only runs while the tour is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    }, 4000);
    return () => clearInterval(id);
  }, [drawerOpen, queryClient]);

  // ─── auto-advance: when the user opens an incident detail page from any
  // earlier step, jump straight to step 5 (incident-detail) and dock the
  // drawer to the right rail — the timeline is the focus now and the bottom
  // dock would cover it. Re-arms whenever the user leaves the detail page,
  // so coming back jumps them again. We only auto-advance forward, never
  // backward — if they're already past step 5 we leave them alone.
  useEffect(() => {
    if (!drawerOpen) return;
    const onDetail = /^\/(?:incidents|cases|alerts|tickets|jobs)\/[^/]+/.test(location.pathname);
    if (!onDetail) {
      autoAdvancedRef.current = false;
      return;
    }
    if (autoAdvancedRef.current) return;
    const targetIdx = TOUR_STEPS.findIndex(s => s.id === 'incident-detail');
    if (targetIdx < 0) return;
    if (step >= targetIdx) return;
    autoAdvancedRef.current = true;
    if (dock !== 'right') setDock('right');
    // Force-mark the gating sub-goals on the previous step so the forward
    // jump is allowed even if the user hasn't ticked everything off (e.g.
    // they navigated directly into a deep link).
    setStepCompleted('incidents-list:present', true);
    setStepCompleted('incidents-list:open', true);
    // Defer so the unlock state propagates before goToStep evaluates it.
    window.setTimeout(() => goToStep(targetIdx), 0);
  }, [drawerOpen, step, location.pathname, dock, setDock, goToStep, setStepCompleted]);

  // Note: the `add-outlook` step is marked complete directly from the
  // IncidentsPage AppSearchDrawer override when the user picks Outlook
  // Office365 from the popup (pretend-authenticated for the demo).

  // Note: the `incidents-list:open` sub-goal is no longer set here. It is
  // computed live from the current route in DemoContext (`isOnIncidentDetail`)
  // so leaving the detail page reverts the gate immediately.

  // ─── incident-detail sub-goals ─────────────────────────────────────────────
  // Step #5 is a guided observation: read the timeline (find the attacker
  // IP), ask the agent a question, then watch the Wazuh / Sliver C2 follow-up
  // arrive. Each sub-goal flips on as evidence appears.

  // Timeline-IP — listens for a custom event dispatched when the user clicks
  // any IP observable pill on the timeline. Fired from the timeline pill
  // click handler in IncidentDetailPage.
  useEffect(() => {
    if (!drawerOpen) return;
    const onIp = () => {
      const stepId = TOUR_STEPS[step]?.id;
      if (stepId !== 'incident-detail') return;
      markStepCompleted('incident-detail:timeline-ip');
    };
    window.addEventListener('demo:timeline-ip-clicked', onIp);
    return () => window.removeEventListener('demo:timeline-ip-clicked', onIp);
  }, [drawerOpen, step, markStepCompleted]);

  // Email-thread-opened — fires when the user expands the EmailThreadPanel.
  // This is required so the user actually sees the email evidence before the
  // tour lets them advance.
  useEffect(() => {
    if (!drawerOpen) return;
    const onOpen = () => {
      const stepId = TOUR_STEPS[step]?.id;
      if (stepId !== 'incident-detail') return;
      markStepCompleted('incident-detail:open-email-thread');
    };
    window.addEventListener('demo:email-thread-opened', onOpen);
    return () => window.removeEventListener('demo:email-thread-opened', onOpen);
  }, [drawerOpen, step, markStepCompleted]);

  // Step #5 now starts with the Email Thread as the first focus target —
  // the previous "hover the title / description" orientation sub-goals were
  // removed so the user is pulled straight into the message body.


  // Comment-sent — listens for the custom event dispatched by the incident
  // detail page when the user adds a comment. Doubles as "ask the agent".
  useEffect(() => {
    if (!drawerOpen) return;
    const onSent = () => {
      const stepId = TOUR_STEPS[step]?.id;
      if (stepId !== 'incident-detail') return;
      markStepCompleted('incident-detail:ask-agent');
      // Once the user asks the agent something, schedule the Wazuh / Sliver C2
      // follow-up to arrive shortly after — as if the agent dug deeper and
      // found the related implant. We do not seed instantly so it reads as a
      // genuine "new correlation found" moment a few seconds later.
      if (wazuhSeededRef.current) return;
      window.setTimeout(async () => {
        if (wazuhSeededRef.current) return;
        try {
          const added = await seedDemoWazuhImplantIncident();
          wazuhSeededRef.current = true;
          if (added > 0) {
            toast.warning('New correlation found: Sliver C2 implant detected on the same host.', {
              duration: 5000,
            });
            markStepCompleted('incident-detail:wazuh');
          }
        } catch {
          // best-effort; user can still force-generate from the drawer
        }
      }, WAZUH_FOLLOWUP_DELAY_MS);
    };
    const onWazuhArrived = () => {
      wazuhSeededRef.current = true;
      markStepCompleted('incident-detail:wazuh');
    };
    window.addEventListener('demo:incident-comment-sent', onSent);
    window.addEventListener('demo:wazuh-incident-arrived', onWazuhArrived);
    return () => {
      window.removeEventListener('demo:incident-comment-sent', onSent);
      window.removeEventListener('demo:wazuh-incident-arrived', onWazuhArrived);
    };
  }, [drawerOpen, step, markStepCompleted]);

  // Fallback arrival for Wazuh C2 incident: if the user expanded the email thread
  // and has spent 16 seconds on the page without submitting a comment, trigger
  // the follow-up incident anyway so the correlation experience is never blocked.
  useEffect(() => {
    if (!drawerOpen) return;
    const stepId = TOUR_STEPS[step]?.id;
    if (stepId !== 'incident-detail') return;
    if (!completedSteps['incident-detail:open-email-thread']) return;
    if (completedSteps['incident-detail:wazuh'] || wazuhSeededRef.current) return;

    const timer = window.setTimeout(async () => {
      if (wazuhSeededRef.current) return;
      try {
        const added = await seedDemoWazuhImplantIncident();
        wazuhSeededRef.current = true;
        if (added > 0) {
          toast.warning('New correlation found: Sliver C2 implant detected on the same host.', {
            duration: 5000,
          });
          markStepCompleted('incident-detail:wazuh');
        }
      } catch {
        // best-effort
      }
    }, 16000);

    return () => window.clearTimeout(timer);
  }, [drawerOpen, step, completedSteps, markStepCompleted]);

  // Auto-inject a sample @AIAgent question into the timeline comment field
  // once the user has reached the "Ask the agent" sub-goal. Without this,
  // users do not realise THEY are supposed to type something — pre-filling
  // makes it obvious they just need to press Enter to send. We only inject
  // once per session and skip if the comment input already has content.
  useEffect(() => {
    if (!drawerOpen) return;
    const stepId = TOUR_STEPS[step]?.id;
    if (stepId !== 'incident-detail') return;
    if (completedSteps['incident-detail:ask-agent']) return;
    if (askAgentInjectedRef.current) return;
    // Wait for the comment input to be in the DOM before firing.
    const tryInject = () => {
      const wrapper = document.querySelector('[data-tour="incident-comment-input"]');
      if (!wrapper) return false;
      askAgentInjectedRef.current = true;
      window.dispatchEvent(new CustomEvent('demo:inject-agent-mention'));
      return true;
    };
    if (tryInject()) return;
    const id = window.setInterval(() => {
      if (tryInject()) window.clearInterval(id);
    }, 500);
    return () => window.clearInterval(id);
  }, [drawerOpen, step, completedSteps]);


  // user force-generated it from the tour drawer, or it landed on a previous
  // run). We read the seeded-keys index from localStorage instead of poking
  // the datastore directly so this stays cheap.
  useEffect(() => {
    if (!drawerOpen) return;
    const stepId = TOUR_STEPS[step]?.id;
    if (stepId !== 'incident-detail') return;
    const check = () => {
      try {
        const idx = JSON.parse(localStorage.getItem('shuffle_demo_seeded_keys') || '{}');
        const incidents = idx['shuffle-security_incidents'];
        if (Array.isArray(incidents) && incidents.some((k: string) => typeof k === 'string' && k.includes('-wazuh'))) {
          wazuhSeededRef.current = true;
          markStepCompleted('incident-detail:wazuh');
          return true;
        }
      } catch { /* ignore */ }
      return false;
    };
    if (check()) return;
    const id = window.setInterval(() => {
      if (check()) window.clearInterval(id);
    }, 2000);
    return () => window.clearInterval(id);
  }, [drawerOpen, step, markStepCompleted]);

  // ─── correlations: track tab clicks on the incident detail page ─────────
  // Step 5 lives on the incident detail page so we spotlight the tab and mark
  // the sub-goal complete the moment they activate it.
  useEffect(() => {
    if (!drawerOpen) return;
    const stepId = TOUR_STEPS[step]?.id;
    if (stepId !== 'correlations') return;

    const check = () => {
      const corrTab = document.querySelector('[data-tour="incident-tab-correlations"]') as HTMLElement | null;
      if (
        corrTab?.getAttribute('data-active') === 'true' ||
        corrTab?.getAttribute('aria-selected') === 'true'
      ) {
        markStepCompleted('correlations:open-tab');
        return;
      }

      // In simple mode, check if the correlations section is in view or active
      const simpleCorr = document.getElementById('simple-case-correlations');
      if (simpleCorr) {
        const rect = simpleCorr.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.85 && rect.bottom > 80) {
          markStepCompleted('correlations:open-tab');
        }
      }
    };

    const onClick = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-tour="incident-tab-correlations"]') || target?.closest('#simple-case-correlations')) {
        markStepCompleted('correlations:open-tab');
      }
    };

    check();
    const id = window.setInterval(check, 600);
    document.addEventListener('click', onClick, true);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('click', onClick, true);
    };
  }, [drawerOpen, step, markStepCompleted]);

  // Listen for a correlation pivot click (sub-goal on step 5).
  useEffect(() => {
    if (!drawerOpen) return;
    const stepId = TOUR_STEPS[step]?.id;
    if (stepId !== 'correlations') return;
    const onClick = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const row = target.closest('[data-corr-key]') as HTMLElement | null;
      if (!row) return;
      // Only count clicks on the URL correlation row — that is the specific
      // pivot point the demo is calling out (lure URL → Sliver C2 incident).
      const key = row.getAttribute('data-corr-key') || '';
      if (/^https?:\/\//i.test(key)) {
        markStepCompleted('correlations:pivot');
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [drawerOpen, step, markStepCompleted]);

  return null;
};

export default DemoCompletionWatcher;
