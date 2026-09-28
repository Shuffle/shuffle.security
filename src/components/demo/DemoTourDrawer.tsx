/**
 * Floating, non-modal tour drawer that narrates each step of the demo.
 *
 * Layout modes:
 * - dock = 'right'  → tall panel pinned to the right edge (default)
 * - dock = 'bottom' → short panel pinned along the bottom edge (use when you
 *   need the right side for app drawers, e.g. enabling/authenticating apps)
 *
 * It can also be minimized to a compact pill in the bottom-right so users can
 * reclaim screen space without losing tour progress.
 *
 * Does NOT block clicks on the underlying page.
 */

import { Box, IconButton, Typography, Button, LinearProgress, Tooltip, Chip } from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from '@/lib/router-compat';
import { useDemo, TOUR_STEPS } from '@/context/DemoContext';
import { useEntityPreference } from '@/hooks/useEntityLabel';
import { applyEntityTerminology } from '@/lib/entityTerminology';
import { motion, AnimatePresence, useMotionValue, type PanInfo } from 'framer-motion';
import { X, Minus, PanelRight, PanelBottom } from 'lucide-react';

// Persisted drag offset for the floating demo UI (anchor pill, minimized
// pill, and expanded drawer all share one position so the user's preferred
// spot survives mode switches and reloads). Stored as { x, y } pixel deltas
// from the default bottom-right anchor.
const DEMO_OFFSET_KEY = 'shuffle:demo-drawer-offset';

const clampOffset = (o: { x: number; y: number }): { x: number; y: number } => {
  if (typeof window === 'undefined') return o;
  // Anchor sits in the bottom-right (right: 24, bottom: 104). Negative x moves
  // it leftward, negative y moves it upward. Clamp so it stays on screen even
  // after viewport changes between sessions.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const minX = -(vw - 120); // keep at least ~120px visible from the right edge
  const maxX = 40;
  const minY = -(vh - 200);
  const maxY = 40;
  return {
    x: Math.min(Math.max(o.x, minX), maxX),
    y: Math.min(Math.max(o.y, minY), maxY),
  };
};

const readOffset = (): { x: number; y: number } => {
  try {
    const raw = localStorage.getItem(DEMO_OFFSET_KEY);
    if (!raw) return { x: 0, y: 0 };
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return clampOffset(parsed);
  } catch { /* ignore */ }
  return { x: 0, y: 0 };
};

const writeOffset = (offset: { x: number; y: number }) => {
  try { localStorage.setItem(DEMO_OFFSET_KEY, JSON.stringify(offset)); } catch { /* ignore */ }
};

/** Hook that wires up persisted drag for one of the floating demo elements. */
const useDraggableDemoOffset = () => {
  const initial = useMemo(() => readOffset(), []);
  const x = useMotionValue(initial.x);
  const y = useMotionValue(initial.y);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const next = { x: x.get(), y: y.get() };
    writeOffset(next);
    // Broadcast so any other floating demo element (e.g. the anchor pill
    // mounting after the drawer was dragged) syncs to the same offset on
    // its next render.
    window.dispatchEvent(new CustomEvent('demo-offset-changed', { detail: next }));
  };
  // Sync to other instances updating the offset while we are mounted.
  useEffect(() => {
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent<{ x: number; y: number }>).detail;
      if (!detail) return;
      x.set(detail.x);
      y.set(detail.y);
    };
    window.addEventListener('demo-offset-changed', onSync as EventListener);
    return () => window.removeEventListener('demo-offset-changed', onSync as EventListener);
  }, [x, y]);
  return { x, y, onDragEnd };
};


export const DemoTourDrawer = () => {
  const {
    drawerOpen,
    minimized,
    dock,
    step,
    nextStep,
    prevStep,
    closeTour,
    goToStep,
    cleanup,
    isCleaning,
    currentStepUnlocked,
    completedSteps,
    minimizeTour,
    restoreTour,
    toggleDock,
    forceGenerateSingleIncident,
    isForceGeneratingSingle,
    forceGenerateWazuhIncident,
    isForceGeneratingWazuh,
    hasDemoIncidents,
    isOnIncidentDetail,
    attentionPulse,
    openTour,
    setHoveredGoalSelector,
  } = useDemo();
  const drag = useDraggableDemoOffset();
  const location = useLocation();
  // True whenever the current route deep-links into a demo-seeded object
  // (incident, asset, host, user, etc.). All demo data uses the `demo-…`
  // key prefix, so the URL itself is enough to detect this without round-
  // tripping the datastore. We surface a glowing anchor pill below so the
  // user always understands "this object is fake demo data".
  const onDemoObjectByUrl = /\/demo-[a-z0-9-]+/i.test(location.pathname);

  // Some demo objects are surfaced inline (e.g. expanding the FIN-LAPTOP-04
  // row on /monitors) without a URL change. Components broadcast a
  // `demo-object-context` event with `{ active: true|false }` so we can keep
  // the anchor pill visible while the user is engaging with that fake data.
  const [inlineDemoActive, setInlineDemoActive] = useState(false);
  useEffect(() => {
    const onCtx = (e: Event) => {
      const detail = (e as CustomEvent<{ active: boolean }>).detail;
      setInlineDemoActive(!!detail?.active);
    };
    window.addEventListener('demo-object-context', onCtx as EventListener);
    return () => window.removeEventListener('demo-object-context', onCtx as EventListener);
  }, []);
  // Reset the inline flag whenever the route changes — the broadcasting
  // component will re-emit if it still applies on the new page.
  useEffect(() => {
    setInlineDemoActive(false);
  }, [location.pathname]);

  const onDemoObject = onDemoObjectByUrl || inlineDemoActive;

  // Trigger a brief attention flash whenever attentionPulse increments while
  // the drawer is already visible — so repeatedly clicking "Continue demo
  // mode" on the dashboard makes the panel visibly react.
  const [flash, setFlash] = useState(false);
  const lastPulseRef = useRef(attentionPulse);
  const wasOpenRef = useRef(false);
  const triggerFlash = useCallback(() => {
    setFlash(false);
    const r = requestAnimationFrame(() => setFlash(true));
    const t = window.setTimeout(() => setFlash(false), 900);
    return () => { cancelAnimationFrame(r); window.clearTimeout(t); };
  }, []);
  useEffect(() => {
    if (attentionPulse !== lastPulseRef.current) {
      lastPulseRef.current = attentionPulse;
      if (drawerOpen && !minimized) {
        return triggerFlash();
      }
    }
    return undefined;
  }, [attentionPulse, drawerOpen, minimized, triggerFlash]);
  // Always flash when the drawer transitions from closed to open so the
  // user immediately sees where the demo panel is.
  useEffect(() => {
    const isVisible = drawerOpen && !minimized;
    if (isVisible && !wasOpenRef.current) {
      wasOpenRef.current = true;
      return triggerFlash();
    }
    if (!isVisible) {
      wasOpenRef.current = false;
    }
    return undefined;
  }, [drawerOpen, minimized, triggerFlash]);

  const total = TOUR_STEPS.length;
  const rawCurrent = TOUR_STEPS[step];
  // Swap the literal word "incident(s)" for the org's configured terminology
  // (Alert, Case, Ticket, …) so every step's title/body/bullets/sub-goals
  // matches what the rest of the app says.
  const { singular: entitySingular, plural: entityPlural } = useEntityPreference();
  const current = useMemo(() => {
    if (!rawCurrent) return rawCurrent;
    const t = (s: string) => applyEntityTerminology(s, entitySingular, entityPlural);
    return {
      ...rawCurrent,
      title: t(rawCurrent.title),
      body: t(rawCurrent.body),
      bullets: rawCurrent.bullets?.map(t),
      requirement: rawCurrent.requirement
        ? { ...rawCurrent.requirement, label: t(rawCurrent.requirement.label) }
        : undefined,
      subGoals: rawCurrent.subGoals?.map(g => ({ ...g, label: t(g.label) })),
    };
  }, [rawCurrent, entitySingular, entityPlural]);
  const progress = ((step + 1) / total) * 100;
  const isLast = step === total - 1;
  const requirement = current?.requirement;
  const locked = !!requirement && !currentStepUnlocked;
  const isIncidentsListStep = current?.id === 'incidents-list';

  // ── Celebrate the moment a step's requirement flips to "done" ─────────────
  // When the user satisfies the gate (e.g. opens an incident on step 4), we
  // pulse the Next button + run a one-shot success ripple so they cannot miss
  // that the tour is ready to advance. The pulse auto-clears after ~2.5s.
  const [justUnlocked, setJustUnlocked] = useState(false);
  // The "Detailed steps" disclosure is collapsed by default. The spotlight +
  // Required-to-Continue list usually communicates enough; the bullets are
  // there for users who want the explicit click-by-click breakdown.
  const [bulletsOpen, setBulletsOpen] = useState(false);
  // Reset the disclosure whenever the user advances to a new step.
  useEffect(() => {
    setBulletsOpen(false);
  }, [step]);
  const wasLockedRef = useRef(locked);
  useEffect(() => {
    if (wasLockedRef.current && !locked) {
      setJustUnlocked(true);
      const t = window.setTimeout(() => setJustUnlocked(false), 2600);
      return () => window.clearTimeout(t);
    }
    return undefined;
    wasLockedRef.current = locked;
  }, [locked, step]);
  // Reset the celebration whenever the user advances to a new step.
  useEffect(() => {
    setJustUnlocked(false);
    wasLockedRef.current = locked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Demo-data anchor pill ────────────────────────────────────────────────
  // Shown ONLY when the drawer is fully closed AND the user is currently
  // viewing a demo-seeded object. The goal is to remove the "wait, is this
  // real data?" confusion by always advertising that they're inside the
  // sample dataset, with a single click to re-open the tour.
  if (!drawerOpen && onDemoObject) {
    return (
      <motion.div
        key="demo-anchor-pill"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        drag
        dragMomentum={false}
        onDragEnd={drag.onDragEnd}
        style={{
          position: 'fixed',
          right: 24,
          bottom: 104,
          zIndex: 2147483000,
          pointerEvents: 'auto',
          x: drag.x,
          y: drag.y,
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        <Tooltip
          title="You are viewing fake demo data. Click to re-open the demo tour."
          arrow
          placement="left"
          slotProps={{ popper: { sx: { zIndex: 2147483647 } } }}
        >
          <Box
            onClick={openTour}
            role="button"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              pl: 1.5,
              pr: 2,
              py: 1,
              borderRadius: 999,
              cursor: 'pointer',
              border: '1px solid hsl(var(--primary) / 0.5)',
              backgroundColor: 'hsl(var(--card))',
              position: 'relative',
              boxShadow:
                '0 0 0 4px hsl(var(--primary) / 0.12), 0 16px 36px -12px hsl(var(--primary) / 0.55), 0 0 24px hsl(var(--primary) / 0.4)',
              animation: 'demoAnchorPulse 2.4s ease-in-out infinite',
              '@keyframes demoAnchorPulse': {
                '0%, 100%': {
                  boxShadow:
                    '0 0 0 4px hsl(var(--primary) / 0.12), 0 16px 36px -12px hsl(var(--primary) / 0.55), 0 0 24px hsl(var(--primary) / 0.4)',
                },
                '50%': {
                  boxShadow:
                    '0 0 0 8px hsl(var(--primary) / 0.18), 0 18px 40px -12px hsl(var(--primary) / 0.7), 0 0 36px hsl(var(--primary) / 0.6)',
                },
              },
              transition: 'transform 0.15s ease',
              '&:hover': { transform: 'translateY(-1px)' },
              maxWidth: 320,
            }}
          >
            <Box
              sx={{
                px: 0.75,
                py: 0.25,
                borderRadius: 1,
                backgroundColor: 'hsl(var(--primary) / 0.15)',
                color: 'hsl(var(--primary))',
                fontSize: '0.625rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              Demo
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.15 }}>
              <Typography
                sx={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: 'hsl(var(--primary))',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Demo data
              </Typography>
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'hsl(var(--foreground))',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 220,
                }}
              >
                Re-open demo tour
              </Typography>
            </Box>
          </Box>
        </Tooltip>
      </motion.div>
    );
  }

  // ── Minimized pill ────────────────────────────────────────────────────────
  if (drawerOpen && minimized) {
    return (
      <AnimatePresence>
        <motion.div
          key="demo-pill"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          drag
          dragMomentum={false}
          onDragEnd={drag.onDragEnd}
          style={{
            position: 'fixed',
            right: 24,
            bottom: 104,
            zIndex: 2147483000,
            pointerEvents: 'auto',
            x: drag.x,
            y: drag.y,
            cursor: 'grab',
            touchAction: 'none',
          }}
        >
          <Tooltip title={`${current.title} — click to expand`} arrow placement="left" slotProps={{ popper: { sx: { zIndex: 2147483647 } } }}>
            <Box
              onClick={restoreTour}
              role="button"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                pl: 1.5,
                pr: 2,
                py: 1,
                borderRadius: 999,
                cursor: 'pointer',
                border: '1px solid hsl(var(--border))',
                backgroundColor: 'hsl(var(--card))',
                boxShadow: '0 16px 36px -12px hsl(0 0% 0% / 0.35), 0 0 0 1px hsl(var(--primary) / 0.08)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: '0 20px 44px -12px hsl(0 0% 0% / 0.4), 0 0 0 1px hsl(var(--primary) / 0.18)',
                },
                maxWidth: 320,
              }}
            >
              <Box
                sx={{
                  px: 0.75,
                  py: 0.25,
                  borderRadius: 1,
                  backgroundColor: 'hsl(var(--primary) / 0.15)',
                  color: 'hsl(var(--primary))',
                  fontSize: '0.625rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  flexShrink: 0,
                  position: 'relative',
                }}
              >
                Demo
                {locked && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -2,
                      right: -2,
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: 'hsl(var(--primary))',
                    }}
                  />
                )}
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))' }}>
                    Demo · {step + 1}/{total}
                  </Typography>
                  <Chip
                    label="Beta"
                    size="small"
                    sx={{
                      height: 16,
                      fontSize: '0.575rem',
                      fontWeight: 600,
                      color: 'hsl(var(--primary))',
                      backgroundColor: 'hsl(var(--primary) / 0.1)',
                      border: '1px solid hsl(var(--primary) / 0.25)',
                      borderRadius: 1,
                      '& .MuiChip-label': {
                        px: 0.5,
                        lineHeight: 1,
                      },
                    }}
                  />
                </Box>
                <Typography
                  sx={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'hsl(var(--foreground))',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 220,
                  }}
                >
                  {current.title}
                </Typography>
              </Box>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); closeTour(); }}
                sx={{ color: 'hsl(var(--muted-foreground))', ml: 0.5, '&:hover': { color: 'hsl(var(--foreground))' } }}
              >
                <X size={14} />
              </IconButton>
            </Box>
          </Tooltip>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── Expanded drawer ──────────────────────────────────────────────────────
  const isBottom = dock === 'bottom';

  // Single persistent container that animates between docks instead of being
  // unmounted + remounted. Position/size are driven by `animate` so framer
  // tweens them; the initial mount still slides in from the right edge.
  const dockedAnimate = isBottom
    ? {
        top: 'auto' as const,
        left: 24,
        right: 24,
        bottom: 104,
        width: 'auto' as const,
        opacity: 1,
      }
    : {
        top: 'auto' as const,
        left: 'auto' as const,
        right: 24,
        bottom: 104,
        width: 380,
        opacity: 1,
      };

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    maxWidth: isBottom ? 'min(960px, calc(100vw - 32px))' : 'calc(100vw - 32px)',
    maxHeight: isBottom ? 'min(360px, 60vh)' : 'min(640px, 70vh)',
    marginLeft: isBottom ? 'auto' : undefined,
    marginRight: isBottom ? 'auto' : undefined,
    zIndex: 2147483000,
    pointerEvents: 'auto',
  };

  return (
    <AnimatePresence>
      {drawerOpen && (
        <motion.div
          key="demo-drawer"
          // Enter/exit fade only — x/y are driven by the persisted drag
          // offset (useMotionValue), so animating them here would fight the
          // user's chosen position.
          initial={{ ...dockedAnimate, opacity: 0 }}
          animate={{ ...dockedAnimate, opacity: 1 }}
          exit={{ ...dockedAnimate, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          drag
          dragMomentum={false}
          onDragEnd={drag.onDragEnd}
          style={{ ...containerStyle, x: drag.x, y: drag.y, touchAction: 'none' }}
        >
          <Box
            sx={{
              height: 'auto',
              maxHeight: isBottom ? 'min(360px, 60vh)' : 'min(640px, 70vh)',
              display: 'flex',
              flexDirection: isBottom ? 'row' : 'column',
              borderRadius: 3,
              border: '1px solid hsl(var(--border))',
              backgroundColor: 'hsl(var(--card))',
              boxShadow: flash
                ? '0 24px 60px -16px hsl(0 0% 0% / 0.45), 0 0 0 3px hsl(var(--primary)), 0 0 0 10px hsl(var(--primary) / 0.25), 0 0 40px 6px hsl(var(--primary) / 0.5)'
                : '0 24px 60px -16px hsl(0 0% 0% / 0.35), 0 0 0 1px hsl(var(--primary) / 0.08)',
              transform: flash ? 'scale(1.015)' : 'scale(1)',
              // Smoothly tween between dock layouts (column ↔ row, color flash).
              transition: 'box-shadow 0.35s ease, transform 0.35s ease, flex-direction 0.35s ease, max-height 0.35s ease',
              overflow: 'hidden',
            }}
          >
            {/* Header (top for right dock, left rail for bottom dock) */}
            <Box
              sx={{
                ...(isBottom
                  ? {
                      width: 220,
                      flexShrink: 0,
                      borderRight: '1px solid hsl(var(--border))',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1.5,
                      p: 2,
                    }
                  : {
                      px: 2.5,
                      py: 1.75,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid hsl(var(--border))',
                    }),
                background: 'linear-gradient(135deg, hsl(var(--primary) / 0.08), hsl(var(--primary) / 0.02))',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box
                  sx={{
                    px: 0.75,
                    py: 0.25,
                    borderRadius: 1,
                    backgroundColor: 'hsl(var(--primary) / 0.15)',
                    color: 'hsl(var(--primary))',
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Demo
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'nowrap' }}>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'hsl(var(--foreground))', whiteSpace: 'nowrap' }}>
                    Demo mode
                  </Typography>
                  <Chip
                    label="Beta"
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.625rem',
                      fontWeight: 600,
                      color: 'hsl(var(--primary))',
                      backgroundColor: 'hsl(var(--primary) / 0.1)',
                      border: '1px solid hsl(var(--primary) / 0.25)',
                      borderRadius: 1,
                      '& .MuiChip-label': {
                        px: 0.75,
                        lineHeight: 1,
                      },
                    }}
                  />
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>
                    · {step + 1}/{total}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, ml: isBottom ? 0 : 'auto' }}>
                <Tooltip title={isBottom ? 'Dock to right' : 'Dock to bottom'} arrow slotProps={{ popper: { sx: { zIndex: 2147483647 } } }}>
                  <IconButton
                    onClick={toggleDock}
                    size="small"
                    sx={{
                      color: 'hsl(var(--muted-foreground))',
                      p: 0.5,
                      borderRadius: 1,
                      '&:hover': { color: 'hsl(var(--foreground))', backgroundColor: 'hsl(var(--muted) / 0.6)' },
                    }}
                  >
                    {isBottom ? <PanelRight size={16} /> : <PanelBottom size={16} />}
                  </IconButton>
                </Tooltip>
                <Tooltip title="Minimize" arrow slotProps={{ popper: { sx: { zIndex: 2147483647 } } }}>
                  <IconButton
                    onClick={minimizeTour}
                    size="small"
                    sx={{
                      color: 'hsl(var(--muted-foreground))',
                      p: 0.5,
                      borderRadius: 1,
                      '&:hover': { color: 'hsl(var(--foreground))', backgroundColor: 'hsl(var(--muted) / 0.6)' },
                    }}
                  >
                    <Minus size={16} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Close demo mode" arrow slotProps={{ popper: { sx: { zIndex: 2147483647 } } }}>
                  <IconButton
                    onClick={closeTour}
                    size="small"
                    sx={{
                      color: 'hsl(var(--muted-foreground))',
                      p: 0.5,
                      borderRadius: 1,
                      '&:hover': { color: 'hsl(var(--foreground))', backgroundColor: 'hsl(var(--muted) / 0.6)' },
                    }}
                  >
                    <X size={16} />
                  </IconButton>
                </Tooltip>
              </Box>
              {isBottom && (
                <Box sx={{ mt: 'auto' }}>
                  <LinearProgress
                    variant="determinate"
                    value={progress}
                    sx={{
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: 'hsl(var(--muted))',
                      '& .MuiLinearProgress-bar': { backgroundColor: 'hsl(var(--primary))', borderRadius: 2 },
                    }}
                  />
                  <Typography sx={{ mt: 1, fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>
                    {step + 1} of {total} steps
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Progress (only for right dock — bottom dock has it in the rail) */}
            {!isBottom && (
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                  height: 3,
                  backgroundColor: 'hsl(var(--muted))',
                  '& .MuiLinearProgress-bar': { backgroundColor: 'hsl(var(--primary))' },
                }}
              />
            )}

            {/* Main content column */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {/* Body */}
              <Box sx={{ p: isBottom ? 2.5 : 3, flex: 1, overflowY: 'auto' }}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={current.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Typography
                      sx={{
                        fontSize: isBottom ? '1rem' : '1.15rem',
                        fontWeight: 600,
                        color: 'hsl(var(--foreground))',
                        mb: 1.25,
                        lineHeight: 1.3,
                      }}
                    >
                      {current.title}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: '0.9rem',
                        lineHeight: 1.5,
                        color: 'hsl(var(--foreground))',
                        fontWeight: 500,
                      }}
                    >
                      {current.body}
                    </Typography>
                    {current.bullets && current.bullets.length > 0 && (
                      <Box sx={{ mt: 1.5 }}>
                        <Box
                          component="button"
                          type="button"
                          onClick={() => setBulletsOpen(o => !o)}
                          aria-expanded={bulletsOpen}
                          sx={{
                            all: 'unset',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.5,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            color: 'hsl(var(--muted-foreground))',
                            opacity: 0.85,
                            py: 0.25,
                            '&:hover': { color: 'hsl(var(--foreground))', opacity: 1 },
                          }}
                        >
                          Detailed steps ({bulletsOpen ? 'Hide' : 'Show'})
                        </Box>
                        <AnimatePresence initial={false}>
                          {bulletsOpen && (
                            <motion.div
                              key="bullets"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.18, ease: 'easeOut' }}
                              style={{ overflow: 'hidden' }}
                            >
                              <Box
                                component="ul"
                                sx={{
                                  mt: 1,
                                  mb: 0,
                                  pl: 0,
                                  listStyle: 'none',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 0.75,
                                }}
                              >
                                {current.bullets.map((b, i) => (
                                  <Box
                                    key={i}
                                    component="li"
                                    sx={{
                                      fontSize: '0.85rem',
                                      lineHeight: 1.5,
                                      color: 'hsl(var(--muted-foreground))',
                                      display: 'flex',
                                      alignItems: 'flex-start',
                                      gap: 1,
                                    }}
                                  >
                                    <Box
                                      component="span"
                                      sx={{
                                        mt: '0.55em',
                                        width: 4,
                                        height: 4,
                                        borderRadius: '50%',
                                        backgroundColor: 'hsl(var(--primary))',
                                        flexShrink: 0,
                                      }}
                                    />
                                    <span>{b}</span>
                                  </Box>
                                ))}
                              </Box>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </Box>
                    )}

                    {(requirement || (current?.subGoals && current.subGoals.length > 0)) && (() => {
                      // Build a unified list of goals. If the step uses
                      // sub-goals, show them as separate rows so the user can
                      // see exactly what is left. Otherwise fall back to the
                      // single requirement label.
                      const goals = current?.subGoals && current.subGoals.length > 0
                        ? current.subGoals.map(g => ({
                            id: g.id,
                            label: g.label,
                            optional: !!g.optional,
                            // Per-sub-goal selector falls back to the
                            // step-level requirement so hover always has
                            // *something* to point at.
                            selector: g.targetSelector || requirement?.targetSelector || null,
                            // Special-cases for live-state sub-goals — these
                            // ignore the persisted completedSteps map.
                            done: g.id === 'incidents-list:present'
                              ? hasDemoIncidents
                              : g.id === 'incidents-list:open'
                                ? isOnIncidentDetail
                                : !!completedSteps[g.id],
                          }))
                        : requirement
                          ? [{
                              id: current.id,
                              label: requirement.label,
                              optional: false,
                              selector: requirement.targetSelector,
                              done: isIncidentsListStep
                                ? hasDemoIncidents
                                : !!completedSteps[current.id],
                            }]
                          : [];
                      // Required goals decide the "Done" header. Optional
                      // goals are shown but do not affect step gating.
                      const requiredGoals = goals.filter(g => !g.optional);
                      const allDone = requiredGoals.length === 0
                        ? goals.every(g => g.done)
                        : requiredGoals.every(g => g.done);
                      return (
                        <Box
                          sx={{
                            mt: 2.5,
                            p: 1.75,
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: allDone ? 'hsl(var(--severity-low) / 0.35)' : 'hsl(var(--primary) / 0.35)',
                            backgroundColor: allDone ? 'hsl(var(--severity-low) / 0.08)' : 'hsl(var(--primary) / 0.06)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 1.25,
                          }}
                        >
                          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: allDone ? 'hsl(var(--severity-low))' : 'hsl(var(--primary))' }}>
                            {allDone ? 'Done' : 'Required to continue'}
                          </Typography>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.85 }}>
                            {goals.map(g => {
                              // For the incidents-list "present" sub-goal,
                              // ALWAYS render the inline "Force generate"
                              // button — even when the goal is already done.
                              // This is a safety net: if the seeded phishing
                              // incident is missing or got manually deleted
                              // (and the live presence check has not flipped
                              // yet), the user can still recover with one
                              // click and the tour keeps working.
                              const showForceGenerate =
                                (isIncidentsListStep && g.id === 'incidents-list:present') ||
                                (g.id === 'incident-detail:wazuh' && !g.done);
                              const isWazuhForce = g.id === 'incident-detail:wazuh';
                              // Optional goals use a softer palette and an
                              // "Optional" pill instead of a lock so they do
                              // not read as blockers.
                              const baseColor = g.optional
                                ? 'hsl(var(--muted-foreground))'
                                : g.done
                                  ? 'hsl(var(--severity-low))'
                                  : 'hsl(var(--primary))';
                              const baseBg = g.optional
                                ? 'hsl(var(--muted) / 0.6)'
                                : g.done
                                  ? 'hsl(var(--severity-low) / 0.2)'
                                  : 'hsl(var(--primary) / 0.18)';
                              return (
                                <Box
                                  key={g.id}
                                  onMouseEnter={() => g.selector && setHoveredGoalSelector(g.selector)}
                                  onMouseLeave={() => setHoveredGoalSelector(null)}
                                  onFocus={() => g.selector && setHoveredGoalSelector(g.selector)}
                                  onBlur={() => setHoveredGoalSelector(null)}
                                  onClick={() => {
                                    // Special: clicking the "Ask the agent"
                                    // sub-goal injects a sample @AIAgent
                                    // mention into the comment input so the
                                    // user only has to press Enter to send.
                                    if (g.id === 'incident-detail:ask-agent') {
                                      try {
                                        window.dispatchEvent(new CustomEvent('demo:inject-agent-mention'));
                                      } catch { /* ignore */ }
                                    }
                                  }}
                                  tabIndex={g.selector ? 0 : -1}
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1.25,
                                    p: 0.6,
                                    mx: -0.6,
                                    borderRadius: 1.25,
                                    cursor: g.selector ? 'pointer' : 'default',
                                    transition: 'background-color 140ms ease, transform 140ms ease, box-shadow 140ms ease',
                                    '&:hover': g.selector ? {
                                      backgroundColor: 'hsl(var(--primary) / 0.12)',
                                      transform: 'translateX(2px)',
                                      boxShadow: 'inset 3px 0 0 hsl(var(--primary))',
                                    } : undefined,
                                    '&:focus-visible': g.selector ? {
                                      outline: 'none',
                                      backgroundColor: 'hsl(var(--primary) / 0.12)',
                                      boxShadow: 'inset 3px 0 0 hsl(var(--primary))',
                                    } : undefined,
                                  }}
                                >
                                  <motion.div
                                    initial={false}
                                    animate={
                                      g.done
                                        ? { scale: [1, 1.15, 1] }
                                        : { scale: 1 }
                                    }
                                    transition={{ duration: 0.3, ease: 'easeOut' }}
                                    style={{
                                      minWidth: 38,
                                      height: 20,
                                      padding: '0 4px',
                                      borderRadius: 4,
                                      display: 'grid',
                                      placeItems: 'center',
                                      backgroundColor: g.done ? 'hsl(var(--severity-low) / 0.15)' : baseBg,
                                      color: g.done ? 'hsl(var(--severity-low))' : baseColor,
                                      border: g.done
                                        ? '1px solid hsl(var(--severity-low) / 0.35)'
                                        : g.optional
                                          ? '1px solid hsl(var(--primary) / 0.25)'
                                          : '1px solid hsl(var(--border))',
                                      fontSize: '0.625rem',
                                      fontWeight: 700,
                                      letterSpacing: '0.04em',
                                      textTransform: 'uppercase',
                                      lineHeight: 1,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {g.done ? 'Done' : g.optional ? 'Opt' : 'Req'}
                                  </motion.div>
                                  <Typography
                                    sx={{
                                      flex: 1,
                                      fontSize: '0.78rem',
                                      fontWeight: 500,
                                      color: 'hsl(var(--foreground))',
                                      lineHeight: 1.4,
                                      textDecoration: g.done ? 'line-through' : 'none',
                                      opacity: g.done ? 0.7 : 1,
                                    }}
                                  >
                                    {g.label}
                                  </Typography>
                                  {g.optional && !g.done && (
                                    <Box
                                      sx={{
                                        flexShrink: 0,
                                        px: 0.85,
                                        py: 0.15,
                                        borderRadius: 999,
                                        fontSize: '0.62rem',
                                        fontWeight: 700,
                                        letterSpacing: '0.05em',
                                        textTransform: 'uppercase',
                                        color: 'hsl(var(--muted-foreground))',
                                        border: '1px solid hsl(var(--border))',
                                        backgroundColor: 'hsl(var(--muted) / 0.5)',
                                      }}
                                    >
                                      Optional
                                    </Box>
                                  )}
                                  {showForceGenerate && (
                                    <Button
                                      data-tour={isWazuhForce ? 'demo-force-generate-wazuh' : 'demo-force-generate-single'}
                                      onClick={isWazuhForce ? forceGenerateWazuhIncident : forceGenerateSingleIncident}
                                      disabled={isWazuhForce ? isForceGeneratingWazuh : isForceGeneratingSingle}
                                      variant="contained"
                                      size="small"
                                      sx={{
                                        flexShrink: 0,
                                        textTransform: 'none',
                                        fontSize: '0.68rem',
                                        fontWeight: 600,
                                        minHeight: 22,
                                        height: 22,
                                        py: 0,
                                        px: 1,
                                        lineHeight: 1,
                                        backgroundColor: 'hsl(var(--primary))',
                                        color: 'hsl(var(--primary-foreground))',
                                        boxShadow: 'none',
                                        '&:hover': { backgroundColor: 'hsl(var(--primary) / 0.9)', boxShadow: 'none' },
                                      }}
                                    >
                                      {(isWazuhForce ? isForceGeneratingWazuh : isForceGeneratingSingle)
                                        ? 'Generating…'
                                        : isWazuhForce
                                          ? 'Trigger arrival'
                                          : 'Re-create'}
                                    </Button>
                                  )}
                                </Box>
                              );
                            })}
                          </Box>
                        </Box>
                      );
                    })()}


                    {isLast && (
                      <Box
                        sx={{
                          mt: 3,
                          p: 2,
                          borderRadius: 2,
                          border: '1px solid hsl(var(--border))',
                          backgroundColor: 'hsl(var(--muted) / 0.4)',
                        }}
                      >
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'hsl(var(--foreground))', mb: 1 }}>
                          Ready to use real data?
                        </Typography>
                        <Button
                          onClick={cleanup}
                          disabled={isCleaning}
                          variant="outlined"
                          size="small"
                          fullWidth
                          sx={{
                            textTransform: 'none',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            borderColor: 'hsl(var(--border))',
                            color: 'hsl(var(--foreground))',
                            '&:hover': {
                              borderColor: 'hsl(var(--destructive) / 0.5)',
                              backgroundColor: 'hsl(var(--destructive) / 0.06)',
                              color: 'hsl(var(--destructive))',
                            },
                          }}
                        >
                          {isCleaning ? 'Cleaning up…' : 'Clean up all demo data'}
                        </Button>
                      </Box>
                    )}
                  </motion.div>
                </AnimatePresence>
              </Box>

              {/* Step dots (hidden in bottom dock to save vertical space) */}
              {!isBottom && (
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.75, px: 2, pb: 1.5 }}>
                  {TOUR_STEPS.map((s, i) => {
                    const isCurrent = i === step;
                    const hasSubGoals = !!s.subGoals && s.subGoals.length > 0;
                    const isComplete = hasSubGoals
                      ? s.subGoals!.filter(g => !g.optional).every(g => !!completedSteps[g.id])
                      : !!completedSteps[s.id];
                    const hasReq = !!s.requirement || hasSubGoals;
                    return (
                      <Box
                        key={s.id}
                        onClick={() => goToStep(i)}
                        sx={{
                          cursor: 'pointer',
                          width: isCurrent ? 18 : 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: isCurrent
                            ? 'hsl(var(--primary))'
                            : hasReq && !isComplete
                              ? 'hsl(var(--primary) / 0.35)'
                              : 'hsl(var(--muted))',
                          transition: 'all 0.2s ease',
                          '&:hover': { backgroundColor: isCurrent ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.5)' },
                        }}
                      />
                    );
                  })}
                </Box>
              )}

              {/* Footer */}
              <Box
                sx={{
                  p: 2,
                  display: 'flex',
                  gap: 1,
                  borderTop: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--background))',
                }}
              >
                <Button
                  onClick={prevStep}
                  disabled={step === 0}
                  variant="outlined"
                  size="small"
                  sx={{
                    flex: 1,
                    textTransform: 'none',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                    '&:hover': { borderColor: 'hsl(var(--primary) / 0.5)', backgroundColor: 'hsl(var(--primary) / 0.06)' },
                    '&.Mui-disabled': { color: 'hsl(var(--muted-foreground) / 0.4)' },
                  }}
                >
                  Previous
                </Button>
                <Tooltip
                  title={
                    locked
                      ? (() => {
                          const pending = current?.subGoals?.find(g => !completedSteps[g.id]);
                          if (pending) return `Complete: ${pending.label}`;
                          if (requirement) return `Complete: ${requirement.label}`;
                          return '';
                        })()
                      : ''
                  }
                  arrow
                  disableHoverListener={!locked}
                  slotProps={{ popper: { sx: { zIndex: 2147483647 } } }}
                >
                  <span style={{ flex: 1.4, display: 'flex', position: 'relative' }}>
                    {/* Celebration ring — pulses out from the Next button the moment the gate clears */}
                    <AnimatePresence>
                      {justUnlocked && (
                        <>
                          <motion.span
                            key="ring-1"
                            initial={{ opacity: 0.6, scale: 1 }}
                            animate={{ opacity: 0, scale: 1.35 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 1.2, ease: 'easeOut', repeat: 1, repeatDelay: 0.2 }}
                            style={{
                              position: 'absolute',
                              inset: -2,
                              borderRadius: 8,
                              border: '1px solid hsl(var(--severity-low))',
                              pointerEvents: 'none',
                            }}
                          />
                          <motion.span
                            key="ring-2"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 0.5, scale: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                            style={{
                              position: 'absolute',
                              inset: -2,
                              borderRadius: 8,
                              boxShadow: '0 0 0 4px hsl(var(--severity-low) / 0.25)',
                              pointerEvents: 'none',
                            }}
                          />
                        </>
                      )}
                    </AnimatePresence>
                    <motion.div
                      style={{ flex: 1, display: 'flex' }}
                      animate={
                        !locked && justUnlocked
                          ? { scale: [1, 1.05, 1, 1.03, 1] }
                          : { scale: 1 }
                      }
                      transition={{ duration: 1.4, ease: 'easeInOut' }}
                    >
                      <Button
                        onClick={isLast ? closeTour : nextStep}
                        disabled={locked}
                        variant="contained"
                        size="small"
                        sx={{
                          flex: 1,
                          textTransform: 'none',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          // Unlocked → green CTA (clear "go" affordance).
                          // Locked → outlined / neutral so it does not look
                          // clickable and does not steal focus from the actual
                          // unlock target on the page. We must override
                          // `background` (not just `backgroundColor`) because
                          // MUI's containedPrimary theme override paints a
                          // gradient on the `background` shorthand which would
                          // otherwise leak through.
                          background: locked ? 'transparent' : 'hsl(var(--severity-low))',
                          backgroundColor: locked ? 'transparent' : 'hsl(var(--severity-low))',
                          color: locked ? 'hsl(var(--muted-foreground))' : 'hsl(0 0% 100%)',
                          border: locked ? '1px solid hsl(var(--border))' : 'none',
                          boxShadow: !locked && justUnlocked ? '0 6px 22px -6px hsl(var(--severity-low) / 0.7)' : 'none',
                          transition: 'background-color 0.2s ease, box-shadow 0.3s ease',
                          '&:hover': {
                            background: locked ? 'transparent' : 'hsl(var(--severity-low) / 0.85)',
                            backgroundColor: locked ? 'transparent' : 'hsl(var(--severity-low) / 0.85)',
                            boxShadow: !locked ? '0 6px 22px -6px hsl(var(--severity-low) / 0.7)' : 'none',
                          },
                          '&.Mui-disabled': {
                            background: 'transparent',
                            backgroundColor: 'transparent',
                            color: 'hsl(var(--muted-foreground))',
                            border: '1px solid hsl(var(--border))',
                            boxShadow: 'none',
                          },
                        }}
                      >
                        {locked
                          ? 'Locked'
                          : isLast
                            ? 'Finish tour'
                            : 'Next'}
                      </Button>
                    </motion.div>
                  </span>
                </Tooltip>
              </Box>
            </Box>
          </Box>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DemoTourDrawer;
