/**
 * DataFlowDetailPage — Standalone page for a single data flow.
 * Route: /infrastructure/flows/:flowId
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from '@/lib/router-compat';
import { Box, Typography, Chip, Button, Avatar, IconButton, Tooltip } from '@mui/material';
import { ArrowRight, ArrowLeft, Bot, Link as LinkIcon, Plus, PlayCircle, BookOpen, Image as ImageIcon, Flame, Zap, ExternalLink } from 'lucide-react';
import UsecaseAlluvialDiagram from '@/components/usecases/UsecaseAlluvialDiagram';
import { IntegrationStatus } from '@/Shuffle-Core/components/IntegrationStatus';
import { Clock } from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useUsecases } from '@/hooks/useUsecases';
import { API_CONFIG, getApiUrl, getAuthHeader, getShuffleCoreWorkflowUrl } from '@/Shuffle-Core/api';
import { navigateToShuffleCore } from '@/lib/authHandoff';
import { AppSearchDrawer } from '@/Shuffle-Core';
import { deduplicateAuthApps, type AuthAppEntry } from '@/lib/utils';
import {
  TOOL_CATEGORIES,
  FLOW_PHASES,
  CATEGORY_KEYWORDS,
  matchAppToCategory,
  findWorkflowsForUsecase,
  type Usecase,
  type FlowPhase,
  type UsecaseWorkflowCandidate,
} from '@/config/usecases';
import { getToolCategoryMeta } from '@/pages/dashboard/InfrastructurePage';

// ── Tag colors (shared with InfrastructurePage) ────────────────────────────────

// ── Tag colors (shared with InfrastructurePage) ────────────────────────────────

const TAG_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  Alert:       { color: 'hsl(var(--infra-siem))',         bg: 'hsla(var(--infra-siem) / 0.1)',         border: 'hsla(var(--infra-siem) / 0.25)' },
  Detection:   { color: 'hsl(var(--infra-edr))',          bg: 'hsla(var(--infra-edr) / 0.1)',          border: 'hsla(var(--infra-edr) / 0.25)' },
  Logs:        { color: 'hsl(var(--infra-network))',      bg: 'hsla(var(--infra-network) / 0.1)',      border: 'hsla(var(--infra-network) / 0.25)' },
  Intel:       { color: 'hsl(var(--infra-threat-intel))', bg: 'hsla(var(--infra-threat-intel) / 0.1)', border: 'hsla(var(--infra-threat-intel) / 0.25)' },
  Response:    { color: 'hsl(var(--infra-case-mgmt))',    bg: 'hsla(var(--infra-case-mgmt) / 0.1)',    border: 'hsla(var(--infra-case-mgmt) / 0.25)' },
  Prevention:  { color: 'hsl(var(--infra-iam))',          bg: 'hsla(var(--infra-iam) / 0.1)',          border: 'hsla(var(--infra-iam) / 0.25)' },
  Containment: { color: 'hsl(var(--destructive))',        bg: 'hsla(var(--destructive) / 0.08)',       border: 'hsla(var(--destructive) / 0.2)' },
  Correlation: { color: 'hsl(var(--infra-cloud))',        bg: 'hsla(var(--infra-cloud) / 0.1)',        border: 'hsla(var(--infra-cloud) / 0.25)' },
  Context:     { color: 'hsl(var(--infra-asset-mgmt))',   bg: 'hsla(var(--infra-asset-mgmt) / 0.1)',  border: 'hsla(var(--infra-asset-mgmt) / 0.25)' },
};
const DEFAULT_TAG_COLOR = { color: 'hsl(var(--muted-foreground))', bg: 'hsla(var(--muted-foreground) / 0.08)', border: 'hsla(var(--muted-foreground) / 0.2)' };

// ── Helpers ────────────────────────────────────────────────────────────────────

function getPhaseInfo(phase: FlowPhase) {
  return FLOW_PHASES.find(p => p.id === phase) || FLOW_PHASES[0];
}

function getRelatedFlows(flow: Usecase, usecases: Usecase[]): Usecase[] {
  return usecases.filter(
    f => f.id !== flow.id && (f.source === flow.source || f.target === flow.target || f.source === flow.target || f.target === flow.source)
  );
}

function getCategoryDetails(categoryId: string) {
  return TOOL_CATEGORIES.find(c => c.id === categoryId);
}

// ── Section component ──────────────────────────────────────────────────────────

const Section = ({ title, children, borderBottom = true }: { title: string; children: React.ReactNode; borderBottom?: boolean }) => (
  <Box sx={{ py: 3, borderBottom: borderBottom ? '1px solid hsl(var(--border))' : 'none' }}>
    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1.5 }}>
      {title}
    </Typography>
    {children}
  </Box>
);

// ── Connection Endpoint ─────────────────────────────────────────────────────────

const ConnectionEndpoint = ({
  label,
  category,
  categoryDetails,
  appNames,
  onAddTool,
}: {
  label: string;
  category: ReturnType<typeof getToolCategoryMeta>;
  categoryDetails: typeof TOOL_CATEGORIES[number] | undefined;
  appNames: string[];
  onAddTool?: () => void;
}) => {
  const colorVar = category?.color || '--primary';

  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
        {label}
      </Typography>

      {/* Category header */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        mb: 1.5,
        p: 1.5,
        borderRadius: 2,
        bgcolor: `hsla(var(${colorVar}) / 0.06)`,
        border: `1px solid hsla(var(${colorVar}) / 0.15)`,
      }}>
        {category && (
          <Box sx={{
            width: 32, height: 32, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: `hsla(var(${colorVar}) / 0.12)`,
            color: `hsl(var(${colorVar}))`,
            flexShrink: 0,
          }}>
            {category.icon}
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: `hsl(var(${colorVar}))` }}>
            {category?.label || 'Unknown'}
          </Typography>
          {categoryDetails && (
            <Typography
              sx={{
                fontSize: '0.7rem',
                color: 'hsl(var(--muted-foreground))',
                lineHeight: 1.4,
                mt: 0.25,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minHeight: 'calc(0.7rem * 1.4 * 2)',
              }}
            >
              {categoryDetails.description.split('—')[0].trim()}
            </Typography>
          )}

        </Box>
      </Box>

      {/* Apps via IntegrationStatus */}
      <Box sx={{ pl: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
          <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Your Tools
          </Typography>
          {onAddTool && (
            <Tooltip title={`Add ${category?.label || ''} tool`} placement="top" arrow>
              <IconButton
                onClick={onAddTool}
                size="small"
                sx={{
                  width: 24,
                  height: 24,
                  border: '1.5px dashed hsla(var(--muted-foreground) / 0.3)',
                  color: 'hsl(var(--muted-foreground))',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary))',
                    bgcolor: 'hsla(var(--primary) / 0.08)',
                  },
                }}
              >
                <Plus size={14} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        {appNames.length > 0 ? (
          <IntegrationStatus
            collapsed={false}
            filterApps={appNames}
            iconSize={28}
            showAll
            hideAddButton
          />
        ) : (
          <Box
            onClick={onAddTool}
            sx={{
              py: 2, px: 1.5,
              borderRadius: 1.5,
              border: '1px dashed hsla(var(--muted-foreground) / 0.25)',
              textAlign: 'center',
              cursor: onAddTool ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
              '&:hover': onAddTool ? {
                borderColor: 'hsl(var(--primary))',
                bgcolor: 'hsla(var(--primary) / 0.04)',
              } : {},
            }}
          >
            <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
              No tools configured
            </Typography>
            <Typography sx={{ fontSize: '0.68rem', color: 'hsla(var(--muted-foreground) / 0.6)', mt: 0.5 }}>
              {categoryDetails?.examples.slice(0, 3).join(', ')}…
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

// ── Reusable detail content ────────────────────────────────────────────────────
// Exported so it can be embedded in a drawer (e.g. from /usecases) and reused
// across platforms by copying this single file.

export interface UsecaseDetailContentProps {
  /** Usecase / data flow ID to render */
  flowId: string | undefined;
  /** When true, suppresses the back-to-Automations nav (e.g. when shown in a drawer) */
  hideBackNav?: boolean;
  /** When true, suppresses prev/next pagination at the bottom */
  hidePrevNext?: boolean;
  /** Override navigation (e.g. close drawer + push) for prev/next + not-found */
  onNavigateUsecase?: (flowId: string) => void;
}

export const UsecaseDetailContent = ({
  flowId,
  hideBackNav = false,
  hidePrevNext = false,
  onNavigateUsecase,
}: UsecaseDetailContentProps) => {
  const navigate = useNavigate();
  const { usecases } = useUsecases();
  const flow = usecases.find(f => f.id === flowId);
  const goToUsecase = (id: string) => {
    if (onNavigateUsecase) onNavigateUsecase(id);
    else {
      const target = usecases.find(u => u.id === id);
      const seg = target?.label || id;
      navigate(`/usecases/${encodeURIComponent(seg)}/details`);
    }
  };

  // Fetch apps from API and match to categories
  const [categoryAppNames, setCategoryAppNames] = useState<Record<string, string[]>>({});
  const [searchDrawerQuery, setSearchDrawerQuery] = useState<string | null>(null);
  // Fetch workflows so we can render "Linked Workflows" for this usecase
  const [workflows, setWorkflows] = useState<UsecaseWorkflowCandidate[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(getApiUrl('/api/v1/workflows'), { credentials: 'include', headers: getAuthHeader() })
      .then((r) => (r.ok ? r.json() : []))
      .then((body) => {
        if (cancelled) return;
        const list = Array.isArray(body) ? body : (body?.workflows || []);
        setWorkflows(list);
      })
      .catch(() => { /* keep empty */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const fetchApps = async () => {
      const mapped: Record<string, Set<string>> = {};
      const addToCategory = (name: string, categories: string[]) => {
        const catId = matchAppToCategory(name, categories);
        if (!catId) return;
        if (!mapped[catId]) mapped[catId] = new Set();
        mapped[catId].add(name);
      };

      try {
        // Fetch authenticated apps
        const authRes = await fetch(getApiUrl('/api/v1/apps/authentication'), {
          credentials: 'include',
          headers: getAuthHeader(),
        });
        if (authRes.ok) {
          const authData = await authRes.json();
          if (Array.isArray(authData)) {
            const dedupedApps = deduplicateAuthApps(authData);
            dedupedApps.forEach(({ app }) => addToCategory(app.name, app.categories || []));
          }
        }

        // Also fetch all apps (activated) to fill gaps
        const appsRes = await fetch(getApiUrl('/api/v1/apps'), {
          credentials: 'include',
          headers: getAuthHeader(),
        });
        if (appsRes.ok) {
          const appsData = await appsRes.json();
          if (Array.isArray(appsData)) {
            appsData
              .filter((app: any) => app.activated)
              .forEach((app: any) => addToCategory(app.name, app.categories || []));
          }
        }
      } catch (e) {
        console.error('Failed to fetch apps:', e);
      }

      // Convert Sets to arrays
      const result: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(mapped)) {
        result[k] = Array.from(v);
      }
      setCategoryAppNames(result);
    };
    fetchApps();
  }, []);


  usePageMeta({
    title: flow ? `${flow.label} — Data Flow` : 'Data Flow Not Found',
    description: flow?.description || 'Data flow detail page',
  });

  if (!flow) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography sx={{ fontSize: '1.2rem', color: 'hsl(var(--muted-foreground))', mb: 2 }}>
          Data flow not found
        </Typography>
        <Button onClick={() => (onNavigateUsecase ? onNavigateUsecase('') : navigate('/usecases'))} sx={{ color: 'hsl(var(--primary))', textTransform: 'none' }}>
          ← Back to Automations
        </Button>
      </Box>
    );
  }

  const sourceCat = getToolCategoryMeta(flow.source);
  const targetCat = getToolCategoryMeta(flow.target);
  const sourceDetails = getCategoryDetails(flow.source);
  const targetDetails = getCategoryDetails(flow.target);
  const phaseInfo = getPhaseInfo(flow.phase);
  const related = getRelatedFlows(flow, usecases);
  const headerColor = sourceCat?.color || '--primary';
  const sourceAppNames = categoryAppNames[flow.source] || [];
  const targetAppNames = categoryAppNames[flow.target] || [];

  // Find current index for prev/next navigation
  const currentIdx = usecases.findIndex(f => f.id === flow.id);
  const prevFlow = currentIdx > 0 ? usecases[currentIdx - 1] : null;
  const nextFlow = currentIdx < usecases.length - 1 ? usecases[currentIdx + 1] : null;

  return (
    <Box sx={{ maxWidth: 860, width: '100%', mx: 'auto', pb: 6 }}>
      {/* Back nav */}
      {!hideBackNav && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
          <Button
            onClick={() => navigate('/usecases')}
            startIcon={<ArrowLeft size={14} />}
            sx={{
              color: 'hsl(var(--muted-foreground))',
              textTransform: 'none',
              fontSize: '0.8rem',
              fontWeight: 600,
              '&:hover': { color: 'hsl(var(--foreground))', bgcolor: 'hsla(var(--muted-foreground) / 0.08)' },
            }}
          >
            Automations
          </Button>
        </Box>
      )}

      {/* Hero header */}
      <Box sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 3,
        mb: 4,
        p: 4,
        borderRadius: 3,
        border: '1px solid hsl(var(--border))',
        bgcolor: 'hsl(var(--card))',
        background: `linear-gradient(135deg, hsla(var(${headerColor}) / 0.06) 0%, hsl(var(--card)) 60%)`,
        position: 'relative',
      }}>
        <Box sx={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: `hsla(var(${headerColor}) / 0.12)`,
          color: `hsl(var(${headerColor}))`,
          flexShrink: 0,
        }}>
          {sourceCat?.icon || <ArrowRight size={24} />}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: 'hsl(var(--foreground))', mb: 0.5, lineHeight: 1.2 }}>
            {flow.label}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            {/* Phase badge */}
            <Typography sx={{
              fontSize: '0.65rem',
              fontWeight: 700,
              px: 1,
              py: 0.3,
              borderRadius: 1,
              bgcolor: `hsla(var(${phaseInfo.color}) / 0.12)`,
              color: `hsl(var(${phaseInfo.color}))`,
              border: `1px solid hsla(var(${phaseInfo.color}) / 0.25)`,
            }}>
              Step {phaseInfo.step}: {phaseInfo.label}
            </Typography>
            {flow.manualVerification && (
              <Typography sx={{
                fontSize: '0.65rem',
                fontWeight: 700,
                px: 1,
                py: 0.3,
                borderRadius: 1,
                bgcolor: 'hsla(45 93% 47% / 0.1)',
                color: 'hsl(45 93% 47%)',
                border: '1px solid hsla(45 93% 47% / 0.25)',
              }}>
                Manual Verification
              </Typography>
            )}
            {typeof flow.priority === 'number' && (
              <Tooltip title={`Priority ${flow.priority} / 100 — higher means more important / commonly used`} placement="top" arrow>
                <Box sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.4,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  px: 1,
                  py: 0.3,
                  borderRadius: 1,
                  bgcolor: 'hsla(var(--primary) / 0.1)',
                  color: 'hsl(var(--primary))',
                  border: '1px solid hsla(var(--primary) / 0.25)',
                }}>
                  <Flame size={11} />
                  Priority {flow.priority}
                </Box>
              </Tooltip>
            )}
          </Box>
          {/* Tags */}
          {flow.tags.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {flow.tags.map(tag => {
                const tc = TAG_COLORS[tag] ?? DEFAULT_TAG_COLOR;
                return (
                  <Typography key={tag} sx={{ fontSize: '0.65rem', px: 1, py: 0.3, borderRadius: 1, fontWeight: 600, letterSpacing: '0.04em', color: tc.color, bgcolor: tc.bg, border: `1px solid ${tc.border}` }}>
                    {tag}
                  </Typography>
                );
              })}
            </Box>
          )}
        </Box>
        {/* Coming soon badge — top right of hero. Hidden for fully-routed flows and custom actions. */}
        {!flow.customAction && !['siem_case_management_1', 'edr_case_management_1', 'email_case_management_1'].includes(flow.id) && (
          <Box sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.5,
            py: 0.5,
            borderRadius: 1.5,
            bgcolor: 'hsla(45 93% 47% / 0.1)',
            border: '1px solid hsla(45 93% 47% / 0.25)',
          }}>
            <Clock size={13} style={{ color: 'hsl(45 93% 47%)' }} />
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(45 93% 47%)' }}>
              Coming Soon
            </Typography>
          </Box>
        )}
      </Box>

      {/* Custom action CTA — shown when the usecase has a one-click in-app destination
          (e.g. "Add Monitors" → /monitors?add_host=true) instead of a generated workflow. */}
      {flow.customAction && (() => {
        const ca = flow.customAction;
        const isExternal = !!ca.url;
        const target = ca.url || ca.href || '#';
        const handleClick = (e: React.MouseEvent) => {
          if (isExternal) return; // let the anchor handle it
          e.preventDefault();
          navigate(target);
        };
        return (
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            p: 2.5,
            mb: 3,
            borderRadius: 3,
            border: '1px solid hsla(var(--primary) / 0.3)',
            bgcolor: 'hsla(var(--primary) / 0.05)',
          }}>
            <Box sx={{
              width: 40, height: 40, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'hsla(var(--primary) / 0.12)',
              color: 'hsl(var(--primary))',
              flexShrink: 0,
            }}>
              <Zap size={18} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'hsl(var(--foreground))' }}>
                {ca.label}
              </Typography>
              {ca.description && (
                <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', mt: 0.25, lineHeight: 1.5 }}>
                  {ca.description}
                </Typography>
              )}
            </Box>
            <Button
              {...(isExternal ? { href: target, target: '_blank', rel: 'noopener noreferrer' } : {})}
              onClick={handleClick}
              endIcon={isExternal ? <ExternalLink size={14} /> : <ArrowRight size={14} />}
              sx={{
                textTransform: 'none',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: 'hsl(var(--primary-foreground))',
                bgcolor: 'hsl(var(--primary))',
                px: 2,
                py: 0.75,
                whiteSpace: 'nowrap',
                '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
              }}
            >
              {ca.label}
            </Button>
          </Box>
        );
      })()}

      {/* Connection Path */}
      <Box sx={{
        p: 3,
        borderRadius: 3,
        border: '1px solid hsl(var(--border))',
        bgcolor: 'hsl(var(--card))',
        mb: 3,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Connection Path
          </Typography>
        </Box>
        {['siem_case_management_1', 'edr_case_management_1', 'email_case_management_1'].includes(flow.id) ? (
          <UsecaseAlluvialDiagram
            flowId={flow.id}
            sourceCategory={flow.source}
            targetCategory={flow.target}
            highlightCategory={flow.source}
          />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 2 }}>
            {/* Source */}
            <ConnectionEndpoint
              label="Source"
              category={sourceCat}
              categoryDetails={sourceDetails}
              appNames={sourceAppNames}
              onAddTool={() => setSearchDrawerQuery(sourceCat?.label || flow.source)}
            />

            {/* Arrow */}
            <Box sx={{ display: 'flex', alignItems: 'center', pt: 3 }}>
              <ArrowRight size={22} style={{ color: 'hsl(var(--muted-foreground))' }} />
            </Box>

            {/* Target */}
            <ConnectionEndpoint
              label="Destination"
              category={targetCat}
              categoryDetails={targetDetails}
              appNames={targetAppNames}
              onAddTool={() => setSearchDrawerQuery(targetCat?.label || flow.target)}
            />
          </Box>
        )}
      </Box>

      {/* Linked Workflows — workflows whose name matches the usecase's automationLabel */}
      {(() => {
        const linkedWorkflows = findWorkflowsForUsecase(flow, workflows);
        if (linkedWorkflows.length === 0) return null;
        return (
          <Box sx={{
            p: 3,
            borderRadius: 3,
            border: '1px solid hsl(var(--border))',
            bgcolor: 'hsl(var(--card))',
            mb: 3,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, gap: 2, flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Linked Workflows ({linkedWorkflows.length})
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>
                Matched on label "{flow.automationLabel}"
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {linkedWorkflows.map((wf) => (
                <Box
                  key={wf.id}
                  component="a"
                  href={getShuffleCoreWorkflowUrl(wf.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={async (e: React.MouseEvent) => {
                    e.preventDefault();
                    await navigateToShuffleCore(getShuffleCoreWorkflowUrl(wf.id), { newTab: true });
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    p: 1.25,
                    borderRadius: 1.5,
                    border: '1px solid hsl(var(--border))',
                    bgcolor: 'hsl(var(--muted) / 0.3)',
                    textDecoration: 'none',
                    color: 'hsl(var(--foreground))',
                    transition: 'background-color 120ms ease, border-color 120ms ease',
                    '&:hover': {
                      bgcolor: 'hsl(var(--primary) / 0.08)',
                      borderColor: 'hsl(var(--primary) / 0.35)',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                    <Zap size={14} style={{ color: 'hsl(var(--primary))', flexShrink: 0 }} />
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {wf.name || 'Untitled workflow'}
                    </Typography>
                  </Box>
                  <ExternalLink size={13} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                </Box>
              ))}
            </Box>
          </Box>
        );
      })()}

      {/* Resources — video / blogpost / reference image */}
      {(flow.video || flow.blogpost || flow.referenceImage) && (
        <Box sx={{
          p: 3,
          borderRadius: 3,
          border: '1px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--card))',
          mb: 3,
        }}>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1.5 }}>
            Resources
          </Typography>

          {flow.referenceImage && (
            <Box
              component="a"
              href={flow.referenceImage}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                display: 'block',
                mb: (flow.video || flow.blogpost) ? 2 : 0,
                borderRadius: 2,
                overflow: 'hidden',
                border: '1px solid hsl(var(--border))',
                bgcolor: 'hsla(var(--muted-foreground) / 0.04)',
              }}
            >
              <Box
                component="img"
                src={flow.referenceImage}
                alt={`${flow.label} reference diagram`}
                loading="lazy"
                sx={{ display: 'block', width: '100%', height: 'auto', maxHeight: 420, objectFit: 'contain' }}
              />
            </Box>
          )}

          {(flow.video || flow.blogpost) && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {flow.video && (
                <Button
                  href={flow.video}
                  target="_blank"
                  rel="noopener noreferrer"
                  startIcon={<PlayCircle size={16} />}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'hsl(var(--primary))',
                    border: '1px solid hsla(var(--primary) / 0.3)',
                    bgcolor: 'hsla(var(--primary) / 0.06)',
                    px: 1.5,
                    '&:hover': { bgcolor: 'hsla(var(--primary) / 0.12)', borderColor: 'hsl(var(--primary))' },
                  }}
                >
                  Watch video
                </Button>
              )}
              {flow.blogpost && (
                <Button
                  href={flow.blogpost}
                  target="_blank"
                  rel="noopener noreferrer"
                  startIcon={<BookOpen size={16} />}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'hsl(var(--foreground))',
                    border: '1px solid hsl(var(--border))',
                    bgcolor: 'hsla(var(--muted-foreground) / 0.04)',
                    px: 1.5,
                    '&:hover': { bgcolor: 'hsla(var(--muted-foreground) / 0.08)' },
                  }}
                >
                  Read blogpost
                </Button>
              )}
            </Box>
          )}
        </Box>
      )}


      {/* Prev / Next navigation */}
      {!hidePrevNext && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mt: 2 }}>
          {prevFlow ? (
            <Button
              onClick={() => goToUsecase(prevFlow.id)}
              startIcon={<ArrowLeft size={14} />}
              sx={{
                color: 'hsl(var(--muted-foreground))',
                textTransform: 'none',
                fontSize: '0.78rem',
                fontWeight: 600,
                '&:hover': { color: 'hsl(var(--foreground))', bgcolor: 'hsla(var(--muted-foreground) / 0.08)' },
              }}
            >
              {prevFlow.label}
            </Button>
          ) : <Box />}
          {nextFlow ? (
            <Button
              onClick={() => goToUsecase(nextFlow.id)}
              endIcon={<ArrowRight size={14} />}
              sx={{
                color: 'hsl(var(--muted-foreground))',
                textTransform: 'none',
                fontSize: '0.78rem',
                fontWeight: 600,
                '&:hover': { color: 'hsl(var(--foreground))', bgcolor: 'hsla(var(--muted-foreground) / 0.08)' },
              }}
            >
              {nextFlow.label}
            </Button>
          ) : <Box />}
        </Box>
      )}

      {/* App search drawer */}
      <AppSearchDrawer
        open={searchDrawerQuery !== null}
        onClose={() => setSearchDrawerQuery(null)}
        initialQuery={(() => {
          const raw = searchDrawerQuery || '';
          if (raw.toLowerCase() === 'email') return 'Communication';
          if (raw.toLowerCase() === 'case management') return 'Cases';
          return raw;
        })()}
        title={`Add ${searchDrawerQuery || ''} Tool`}
        subtitle="Search and authenticate an integration"
        
      />
    </Box>
  );
};

// ── Category detail card ───────────────────────────────────────────────────────

const CategoryCard = ({ category, role }: { category: typeof TOOL_CATEGORIES[number]; role: 'Source' | 'Target' }) => {
  const colorVar = category.color;
  return (
    <Box sx={{
      p: 3,
      borderRadius: 3,
      border: `1px solid hsla(var(${colorVar}) / 0.2)`,
      bgcolor: `hsla(var(${colorVar}) / 0.03)`,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Box sx={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: `hsla(var(${colorVar}) / 0.12)`,
          color: `hsl(var(${colorVar}))`,
        }}>
          {category.icon}
        </Box>
        <Box>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {role}
          </Typography>
          <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: `hsl(var(${colorVar}))` }}>
            {category.label}
          </Typography>
        </Box>
      </Box>
      <Typography sx={{ fontSize: '0.82rem', color: 'hsl(var(--foreground))', lineHeight: 1.7, mb: 2 }}>
        {category.description}
      </Typography>

      {/* Examples */}
      <Box sx={{ mb: 2 }}>
        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>
          Examples
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {category.examples.slice(0, 6).map(ex => (
            <Typography key={ex} sx={{
              fontSize: '0.7rem',
              px: 0.75,
              py: 0.25,
              borderRadius: 0.75,
              bgcolor: 'hsla(var(--muted-foreground) / 0.08)',
              color: 'hsl(var(--muted-foreground))',
              fontWeight: 500,
            }}>
              {ex}
            </Typography>
          ))}
        </Box>
      </Box>

      {/* Data In/Out */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(142 71% 45%)', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.5 }}>
            Data In
          </Typography>
          {category.dataIn.slice(0, 3).map(d => (
            <Typography key={d} sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.6 }}>
              • {d}
            </Typography>
          ))}
        </Box>
        <Box>
          <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(200 80% 50%)', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.5 }}>
            Data Out
          </Typography>
          {category.dataOut.slice(0, 3).map(d => (
            <Typography key={d} sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.6 }}>
              • {d}
            </Typography>
          ))}
        </Box>
      </Box>


    </Box>
  );
};

// ── Page wrapper ───────────────────────────────────────────────────────────────

const DataFlowDetailPage = () => {
  const { flowId } = useParams<{ flowId: string }>();
  const { usecases } = useUsecases();
  // Param may be either an internal id OR a URL-encoded usecase label.
  // Resolve to an id so downstream lookups (which key on `id`) work.
  const decoded = flowId ? decodeURIComponent(flowId) : undefined;
  const resolvedId = decoded
    ? (usecases.find(u => u.id === decoded)?.id || usecases.find(u => u.label === decoded)?.id || decoded)
    : undefined;
  return <UsecaseDetailContent flowId={resolvedId} />;
};

export default DataFlowDetailPage;
