/**
 * UsecaseOutcome — chip + detail section + sparkline renderers for the
 * outcome metrics produced by `useUsecaseOutcomes`.
 *
 * Two exports:
 *   - <UsecaseOutcomeChip />   — single-line summary under each card.
 *   - <UsecaseOutcomeSection /> — full breakdown block in UsecaseDetailContent.
 */

import React from 'react';
import { Box, Typography, Tooltip, CircularProgress, useTheme } from '@mui/material';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
// In the standalone library build, support diagnostics are always off.
// The host app overrides this internally via its own AuthContext, but the
const useIsSupport = (): boolean => false;
import type { UsecaseOutcome } from '../lib/outcomes';
import { getShuffleCoreUrl } from '../api';
import { navigateToShuffleCore, isShuffleCoreUrl } from '@/lib/authHandoff';

/** Frontend routes we know exist in src/App.tsx — used by the support-only
 *  CTA diagnostic chip to flag broken outcome links before users hit them. */
const KNOWN_INTERNAL_ROUTES: ReadonlyArray<string | RegExp> = [
  '/incidents', '/alerts', '/tickets', '/cases', '/jobs',
  '/vulnerabilities', '/monitors', '/infrastructure',
  '/agent', '/agents', '/dashboard', '/usecases', '/apps',
  '/admin', '/users', '/organizations', '/settings', '/preferences',
  '/templates', '/detection', '/detection/sigma', '/detection/pipelines',
  '/incidents/observables', '/incidents/threat-feeds',
  '/incidents/custom-fields', '/monitors/response',
  '/assets', '/forms', '/software', '/packages',
];

/** Audit a CTA href against the known frontend routes. Returns a status the
 *  support diagnostic chip can render. Only the path part of the URL is
 *  inspected; query/hash are ignored. */
function auditCtaPath(href: string): 'ok' | 'broken' | 'external' {
  if (/^https?:/i.test(href) || /^mailto:/i.test(href)) return 'external';
  const path = href.split(/[?#]/)[0];
  if (!path.startsWith('/')) return 'broken';
  for (const route of KNOWN_INTERNAL_ROUTES) {
    if (typeof route === 'string') {
      if (path === route || path.startsWith(route + '/')) return 'ok';
    } else if (route.test(path)) {
      return 'ok';
    }
  }
  return 'broken';
}

const FG = 'hsl(var(--foreground, 0 0% 100%))';
const MUTED = 'hsl(var(--muted-foreground, 0 0% 60%))';
const BORDER = 'hsl(var(--border, 0 0% 20%))';
const CARD = 'hsl(var(--card, 0 0% 13%))';

const formatNumber = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
};

const emptyMessage = (
  outcome: UsecaseOutcome,
  sourceCategoryLabel?: string,
): string => {
  switch (outcome.emptyReason) {
    case 'not_enabled':
      return 'No data yet — automation not enabled';
    case 'no_source_tool':
      return `No data yet — connect a ${sourceCategoryLabel || 'source'} tool`;
    case 'no_data_yet':
    default:
      return 'No data yet';
  }
}

// ── Chip ───────────────────────────────────────────────────────────────────────

export interface UsecaseOutcomeChipProps {
  outcome: UsecaseOutcome | undefined;
  sourceCategoryLabel?: string;
  /** Hide entirely when kind is 'none' or the usecase is coming soon. */
  hidden?: boolean;
}

export function UsecaseOutcomeChip({ outcome, sourceCategoryLabel, hidden }: UsecaseOutcomeChipProps) {
  const theme = useTheme();
  const primaryColor = theme.palette.primary.main;
  
  if (hidden || !outcome || outcome.kind === 'none') return null;

  if (outcome.isEmpty) {
    return (
      <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Activity size={12} color={MUTED} />
        <Typography sx={{ fontSize: '0.72rem', color: MUTED, lineHeight: 1.4 }}>
          {emptyMessage(outcome, sourceCategoryLabel)}
        </Typography>
      </Box>
    );
  }

  const trend = outcome.trendPct;
  const TrendIcon = trend != null && trend < 0 ? TrendingDown : TrendingUp;
  const trendColor = trend == null ? MUTED : trend >= 0 ? 'hsl(142 71% 45%)' : 'hsl(0 84% 60%)';

  return (
    <Box sx={{ mt: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: primaryColor }} />
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: FG }}>
          {formatNumber(outcome.primary.value)}
        </Typography>
        <Typography sx={{ fontSize: '0.72rem', color: MUTED }}>
          {outcome.primary.label} · last {outcome.windowDays}d
        </Typography>
        {trend != null && (
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, color: trendColor }}>
            <TrendIcon size={11} />
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: trendColor }}>
              {trend > 0 ? '+' : ''}{trend}%
            </Typography>
          </Box>
        )}
      </Box>
      {outcome.breakdown.length > 0 && (
        <Typography sx={{ fontSize: '0.7rem', color: MUTED, mt: 0.4, lineHeight: 1.4 }}>
          {outcome.breakdown
            .slice(0, 3)
            .map((entry) => `${entry.label} ${formatNumber(entry.value)}`)
            .join(' · ')}
        </Typography>
      )}
    </Box>
  );
}

// ── Sparkline ──────────────────────────────────────────────────────────────────

/** Minimal inline-SVG sparkline. Used by the detail section. */
function Sparkline({ trendPct }: { trendPct?: number }) {
  // Synth a 7-point series biased by trendPct so the line "tells the story"
  // even when we don't have exact daily counts. Cheap, no dep.
  const base = 10;
  const drift = trendPct == null ? 0 : Math.max(-8, Math.min(8, trendPct / 10));
  const points: number[] = Array.from({ length: 7 }, (_, i) => {
    const wobble = ((i * 37) % 5) - 2;
    return Math.max(1, base + drift * (i - 3) + wobble);
  });
  const max = Math.max(...points);
  const min = Math.min(...points);
  const w = 90;
  const h = 28;
  const path = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((v - min) / Math.max(1, max - min)) * h;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const color = trendPct == null ? MUTED : trendPct >= 0 ? 'hsl(142 71% 45%)' : 'hsl(0 84% 60%)';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

// ── Section ────────────────────────────────────────────────────────────────────

export interface UsecaseOutcomeSectionProps {
  outcome: UsecaseOutcome | undefined;
  sourceCategoryLabel?: string;
  /** Source category id (e.g. "edr", "siem") — used to deep-link
   *  `/incidents?filter=<source>` from the CTA. */
  sourceId?: string;
  /** Optional explicit CTA (overrides the kind-derived default). */
  nextActionHref?: string;
  nextActionLabel?: string;
  /** For iocs_managed flows: when known, the specific datastore categories
   *  (e.g. ["ioc_ipv4_addr", "ioc_domain"]) so each breakdown row links to
   *  its own admin datastore page. */
  iocCategoryByKey?: Record<string, string>;
  /** When true, render a loader inside the Outcome card instead of the
   *  empty-state / metric content. Used while async lookups are still
   *  resolving so users see progress until the number is final. */
  loading?: boolean;
}

export type OutcomeCta = { href?: string; label: string; external?: boolean; onClick?: () => void };

/** Derive a default CTA for an outcome when the caller didn't supply one. */
function deriveCta(
  outcome: UsecaseOutcome,
  sourceId?: string,
): OutcomeCta | null {
  const isDisabled = outcome.emptyReason === 'not_enabled';
  switch (outcome.kind) {
    case 'incidents_ingested': {
      const q = sourceId ? `?source=${encodeURIComponent(sourceId)}` : '';
      return {
        href: `/incidents${q}`,
        label: isDisabled ? 'Preview where these incidents will appear' : 'View incidents',
      };
    }
    case 'enrichments_run': {
      const q = sourceId ? `?source=${encodeURIComponent(sourceId)}` : '';
      return {
        href: `/incidents${q}`,
        label: isDisabled ? 'See where enrichments will show up' : 'View enriched incidents',
      };
    }
    case 'vulns_tracked':
      return {
        href: '/vulnerabilities',
        label: isDisabled ? 'See where vulnerabilities will appear' : 'View vulnerabilities',
      };
    case 'iocs_managed':
      return {
        href: '/incidents/threat-feeds',
        label: isDisabled ? 'Open Threat Feeds' : 'Manage Threat Feeds',
      };
    case 'responses_executed':
      return {
        // /monitors/response is the Response Actions page (support-gated, but
        // the route exists). There is no /automations page in this app.
        href: '/monitors/response',
        label: isDisabled ? 'Configure response actions' : 'View response actions',
      };
    case 'comms_sent':
      return {
        label: 'View notifications',
        onClick: () => {
          window.dispatchEvent(new CustomEvent('notifications:open'));
        },
      };
    default:
      return null;
  }
}


export function UsecaseOutcomeSection({
  outcome,
  sourceCategoryLabel,
  sourceId,
  nextActionHref,
  nextActionLabel,
  iocCategoryByKey,
  loading,
}: UsecaseOutcomeSectionProps) {
  const theme = useTheme();
  const primaryColor = theme.palette.primary.main;
  const isSupport = useIsSupport();
  if (!outcome || outcome.kind === 'none') return null;

  const windowDays = outcome.windowDays;

  return (
    <Box
      sx={{
        p: 2.5,
        borderRadius: 2,
        border: 'none',
        bgcolor: 'transparent',
        mb: 3,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: loading || outcome.isEmpty ? 0 : 1.5 }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Outcome · last {windowDays} days
        </Typography>
      </Box>


      {loading ? (
        (() => {
          // Outcome cards each fetch a different signal — surface what is
          // actually being loaded so the wait is informative instead of
          // generic ("Loading outcome…" tells the user nothing).
          const LOADING_LABEL: Partial<Record<UsecaseOutcome['kind'], string>> = {
            incidents_ingested: 'Loading incidents from the last 30 days…',
            enrichments_run: 'Loading enrichment runs from the last 30 days…',
            vulns_tracked: 'Loading vulnerabilities tracked in the last 30 days…',
            iocs_managed: 'Loading observables datastore counts…',
            responses_executed: 'Loading response action executions from the last 30 days…',
            comms_sent: 'Loading notifications sent in the last 30 days…',
          };
          const label = LOADING_LABEL[outcome.kind];
          const fallbackLabel = `Loading ${outcome.kind.replace(/_/g, ' ')}…`;
          return (
            <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
              <CircularProgress size={14} thickness={5} sx={{ color: primaryColor }} />
              <Typography sx={{ fontSize: '0.85rem', color: MUTED }}>
                {label || fallbackLabel}
              </Typography>
              {!label && isSupport && (
                <Typography sx={{ fontSize: '0.72rem', color: MUTED, fontStyle: 'italic' }}>
                  (support) No outcome-specific loader registered for kind &quot;{outcome.kind}&quot; — falling back to generic copy.
                </Typography>
              )}
            </Box>
          );
        })()
      ) : outcome.isEmpty ? (
        <Typography sx={{ fontSize: '0.85rem', color: MUTED }}>
          {emptyMessage(outcome, sourceCategoryLabel)}
        </Typography>
      ) : (
        <>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, color: FG, lineHeight: 1 }}>
              {formatNumber(outcome.primary.value)}
            </Typography>
            <Typography sx={{ fontSize: '0.9rem', color: FG }}>
              {outcome.primary.label}
            </Typography>
            {outcome.trendPct != null && (
              <Typography
                sx={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: outcome.trendPct >= 0 ? 'hsl(142 71% 45%)' : 'hsl(0 84% 60%)',
                }}
              >
                {outcome.trendPct > 0 ? '▲' : '▼'} {Math.abs(outcome.trendPct)}% vs prior 7d
              </Typography>
            )}
          </Box>

          {outcome.extraMetrics && outcome.extraMetrics.length > 0 && (
            <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {outcome.extraMetrics.map((m) => (
                <Box key={m.label} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                  <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: FG, lineHeight: 1 }}>
                    {formatNumber(m.value)}
                  </Typography>
                  <Typography sx={{ fontSize: '0.78rem', color: MUTED }}>
                    {m.label}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          {outcome.breakdown.length > 0 && (
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Typography sx={{ fontSize: '0.7rem', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Breakdown
              </Typography>
              {outcome.breakdown.map((entry) => {
                const share = outcome.primary.value > 0
                  ? Math.min(100, Math.round((entry.value / outcome.primary.value) * 100))
                  : 0;
                const pretty = entry.label
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase());
                return (
                  <Box key={entry.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {(() => {
                      const iocCategory = iocCategoryByKey?.[entry.key];
                      const href = entry.href || (iocCategory
                        ? getShuffleCoreUrl(`/admin?tab=datastore&category=${encodeURIComponent(iocCategory)}`)
                        : undefined);
                      const external = entry.external || !!iocCategory;
                      const clickable = !!entry.onClick || !!href;
                      const label = (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 160 }}>
                          {entry.iconNode ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, flexShrink: 0, color: FG }}>
                              {entry.iconNode}
                            </Box>
                          ) : entry.iconUrl && (
                            <Box
                              sx={{
                                width: 20,
                                height: 20,
                                borderRadius: '50%',
                                overflow: 'hidden',
                                flexShrink: 0,
                                bgcolor: '#ffffff',
                                border: `1px solid ${BORDER}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Box
                                component="img"
                                src={entry.iconUrl}
                                alt={pretty}
                                loading="lazy"
                                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            </Box>
                          )}
                          <Typography sx={{ fontSize: '0.82rem', color: FG }}>
                            {pretty}
                          </Typography>
                        </Box>
                      );
                      if (entry.onClick) {
                        return (
                          <Box
                            component="button"
                            type="button"
                            onClick={entry.onClick}
                            sx={{ all: 'unset', cursor: 'pointer', '&:hover': { opacity: 0.85 } }}
                          >
                            {label}
                          </Box>
                        );
                      }
                      if (href) {
                        return (
                          <Box
                            component="a"
                            href={href}
                            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                            onClick={async (e: React.MouseEvent) => {
                              if (isShuffleCoreUrl(href)) {
                                e.preventDefault();
                                await navigateToShuffleCore(href, { newTab: external });
                              }
                            }}
                            sx={{ textDecoration: 'none', cursor: 'pointer', '&:hover': { opacity: 0.85 } }}
                          >
                            {label}
                          </Box>
                        );
                      }
                      return label;
                    })()}
                    <Box sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: BORDER, overflow: 'hidden' }}>
                      <Box sx={{ height: '100%', width: `${share}%`, bgcolor: primaryColor }} />
                    </Box>
                    <Typography sx={{ fontSize: '0.8rem', color: FG, fontWeight: 600, minWidth: 60, textAlign: 'right' }}>
                      {formatNumber(entry.value)}
                    </Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: MUTED, minWidth: 40, textAlign: 'right' }}>
                      {share}%
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}

          {outcome.secondary && outcome.secondary.entries.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography sx={{ fontSize: '0.7rem', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.5 }}>
                {outcome.secondary.label}
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', color: FG }}>
                {outcome.secondary.entries
                  .map((e) => `${e.label} (${formatNumber(e.value)})`)
                  .join(' · ')}
              </Typography>
            </Box>
          )}

        </>
      )}

      {!loading && (() => {
        const explicit: OutcomeCta | null = nextActionHref && nextActionLabel
          ? { href: nextActionHref, label: nextActionLabel, external: /^https?:/i.test(nextActionHref) }
          : null;
        const cta = explicit || deriveCta(outcome, sourceId);
        if (!cta) return null;
        const helper = outcome.isEmpty
          ? (outcome.emptyReason === 'not_enabled'
              ? 'Enable this automation to start populating data here. In the meantime:'
              : 'Nothing here yet — once data arrives it will show up. In the meantime:')
          : 'What to do next';
        const audit = cta.onClick ? 'ok' : auditCtaPath(cta.href || '');
        const auditMeta = {
          ok: { label: 'Route OK', color: 'hsl(142 70% 45%)', bg: 'hsl(142 70% 45% / 0.12)', desc: 'Resolves to a real frontend route in this app.' },
          broken: { label: 'BROKEN — no such route', color: 'hsl(0 75% 60%)', bg: 'hsl(0 75% 60% / 0.12)', desc: 'This path is not registered in src/App.tsx. The link will land on the NotFound page.' },
          external: { label: 'External link', color: 'hsl(210 80% 60%)', bg: 'hsl(210 80% 60% / 0.12)', desc: 'Opens an absolute URL outside this app — not audited.' },
        }[audit];
        return (
          <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px solid ${BORDER}` }}>
            <Typography sx={{ fontSize: '0.78rem', color: MUTED, mb: 0.5 }}>
              {helper}
            </Typography>
            <Box
              component={cta.onClick ? 'button' : 'a'}
              {...(!cta.onClick ? { href: cta.href } : {})}
              onClick={cta.onClick ? (e: React.MouseEvent) => {
                e.preventDefault();
                cta.onClick?.();
              } : undefined}
              {...(cta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              sx={{
                background: 'none',
                border: 'none',
                p: 0,
                cursor: 'pointer',
                font: 'inherit',
                textAlign: 'left',
                display: 'inline-block',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: primaryColor,
                textDecoration: 'none',
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              {cta.label} →
            </Box>
            {isSupport && audit === 'broken' && (
              <Tooltip title={`${auditMeta.desc} (${cta.href})`} arrow>
                <Box sx={{
                  mt: 0.75,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  bgcolor: auditMeta.bg,
                  border: `1px solid ${auditMeta.color}`,
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: auditMeta.color,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  cursor: 'help',
                }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: auditMeta.color }} />
                  Support · {auditMeta.label}
                  <Typography component="span" sx={{ ml: 0.5, fontSize: '0.65rem', fontWeight: 500, color: MUTED, textTransform: 'none', letterSpacing: 0 }}>
                    {cta.href}
                  </Typography>
                </Box>
              </Tooltip>
            )}
          </Box>
        );
      })()}
    </Box>
  );
}

// ── Alluvial badge ─────────────────────────────────────────────────────────────

export interface UsecaseOutcomeBadgeProps {
  outcome: UsecaseOutcome | undefined;
}

export function UsecaseOutcomeBadge({ outcome }: UsecaseOutcomeBadgeProps) {
  if (!outcome || outcome.isEmpty || outcome.kind === 'none') return null;
  const tip = outcome.breakdown.length > 0
    ? outcome.breakdown.map((e) => `${e.label}: ${formatNumber(e.value)}`).join('\n')
    : '';
  return (
    <Tooltip title={tip} placement="top" arrow>
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.4,
          px: 0.75,
          py: 0.25,
          borderRadius: 1,
          bgcolor: 'hsl(var(--muted, 0 0% 20%))',
          border: `1px solid ${BORDER}`,
          fontSize: '0.68rem',
          fontWeight: 700,
          color: FG,
          lineHeight: 1.2,
        }}
      >
        {formatNumber(outcome.primary.value)}
      </Box>
    </Tooltip>
  );
}
