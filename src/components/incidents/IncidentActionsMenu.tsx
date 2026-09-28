import { MoreVertical as MoreVertIcon, Link as LinkIcon, RefreshCw as RefreshIcon, Forward as ForwardIcon, GitMerge as CallMergeIcon, CheckCircle2 as CheckCircleIcon, Settings as SettingsIcon, X as CloseIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from '@/lib/router-compat';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  Button,
  CircularProgress,
  Avatar,
} from '@mui/material';
import { toast } from '@/lib/toast';

import { DATASTORE_CATEGORIES, getDatastoreItem } from '@/Shuffle-MCPs/datastore';
import { useAuth } from '@/context/AuthContext';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { resyncState, getResyncBlockedReason, extractResyncFailureReason } from '@/lib/resyncState';
import { useEntityText } from '@/hooks/useEntityLabel';
import { writeIncidentSafe } from '@/lib/incidentRelations';
import {
  ResolveIncidentDialog,
  ResolutionData,
  RESOLUTION_REASONS,
} from '@/components/incidents/ResolveIncidentDialog';
import { MergeIncidentDialog } from '@/components/incidents/MergeIncidentDialog';

// ============================================================================
// Shared incident "three dots" actions menu used by both the full incident
// detail page and the simplified kanban view. Keeps Share, Resync, Forward,
// Merge and Resolve fully working in one place so behaviour stays in sync.
// ============================================================================

export interface IncidentActionsMenuIncident {
  id: string;
  title: string;
  source?: string;
  status: string; // canonical status (e.g. "resolved")
  rawOCSF?: any;
  customFields?: Record<string, string | number | boolean | undefined>;
}

export interface IncidentActionsMenuProps {
  incident: IncidentActionsMenuIncident;
  /** Called after a save / mutation so the host page can refresh itself. */
  onAfterChange?: () => void | Promise<void>;
  /** Override default navigation after resolve (defaults to /incidents). */
  onAfterResolve?: () => void;
  /** Hide the menu entirely (used for the public read-only view). */
  hidden?: boolean;
  /** Cross-org id parsed from "orgId::incidentId" — propagates as Org-Id header. */
  crossOrgId?: string | null;
  /** Public sharing token (for the "Share" dialog public link). */
  publicAuthorization?: string;
  /** Optional list of orgs that share this incident (for cross-org save). */
  sharedOrgs?: Array<{ id: string; name?: string; image?: string }>;
}

const buttonSx = {
  border: '1px solid hsl(var(--border))',
  borderRadius: 1,
  width: 32,
  height: 32,
} as const;

export const IncidentActionsMenu = ({
  incident,
  onAfterChange,
  onAfterResolve,
  hidden = false,
  crossOrgId = null,
  publicAuthorization = '',
  sharedOrgs = [],
}: IncidentActionsMenuProps) => {
  const navigate = useNavigate();
  const { userInfo } = useAuth();
  const t = useEntityText();
  const currentUsername = userInfo?.username || '';

  const crossOrgHeaders: Record<string, string> = crossOrgId ? { 'Org-Id': crossOrgId } : {};

  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [forwardingApps, setForwardingApps] = useState<
    Array<{ id: string; name: string; large_image: string; categories: string[] }>
  >([]);
  const [forwardingAppsLoading, setForwardingAppsLoading] = useState(false);

  const isResolved = incident.status === 'resolved';
  const orgId = userInfo?.active_org?.id || '';

  // ---- Resync ---------------------------------------------------------------
  const resyncBlockedReason = getResyncBlockedReason(incident, isSaving);
  const resyncDisabled = !!resyncBlockedReason;

  const handleResync = async () => {
    setAnchor(null);
    if (!incident?.id) return;
    const source = incident.source || '';
    setIsResyncing(true);
    resyncState.add(incident.id);
    toast.success(source ? `Resyncing from ${source}…` : 'Resyncing…', { duration: 30000 });
    try {
      const preResult = await getDatastoreItem(
        incident.id,
        DATASTORE_CATEGORIES.INCIDENTS,
        crossOrgId || undefined,
      );
      const previousEdited = preResult.item?.edited || 0;

      const response = await fetch(getApiUrl('/api/v1/apps/categories/run'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
          ...crossOrgHeaders,
        },
        body: JSON.stringify({
          action: 'get_ticket',
          category: 'cases',
          fields: [{ key: 'id', value: incident.id }],
          app_name: source,
        }),
      });
      const responseBody = await response.json().catch(() => null);
      const failureReason = extractResyncFailureReason(responseBody);
      if (!response.ok || responseBody?.success === false) {
        toast.error(failureReason ? `Resync failed: ${failureReason}` : 'Resync failed', { duration: 10000 });
        setIsResyncing(false);
        resyncState.remove(incident.id);
        return;
      }
      let pollCount = 0;
      const pollInterval = setInterval(async () => {
        pollCount++;
        const postResult = await getDatastoreItem(
          incident.id,
          DATASTORE_CATEGORIES.INCIDENTS,
          crossOrgId || undefined,
        );
        const newEdited = postResult.item?.edited || 0;
        if (newEdited && newEdited !== previousEdited) {
          clearInterval(pollInterval);
          await onAfterChange?.();
          setIsResyncing(false);
          resyncState.remove(incident.id);
          toast.success('Resync complete — update found');
        } else if (pollCount >= 6) {
          clearInterval(pollInterval);
          await onAfterChange?.();
          setIsResyncing(false);
          resyncState.remove(incident.id);
          toast.info('Resync complete — no changes detected');
        }
      }, 5000);
    } catch {
      toast.error('Resync failed');
      setIsResyncing(false);
      resyncState.remove(incident.id);
    }
  };

  // ---- Forward --------------------------------------------------------------
  const openForwardDialog = () => {
    setAnchor(null);
    setShowForwardDialog(true);
    setForwardingAppsLoading(true);
    fetch(getApiUrl('/api/v1/apps/authentication'), {
      credentials: 'include',
      headers: { ...getAuthHeader(), ...crossOrgHeaders },
    })
      .then((r) => r.json())
      .then((result) => {
        const authData = result.data || result;
        if (Array.isArray(authData)) {
          const seen = new Set<string>();
          const apps = authData
            .filter((a: any) => a.app?.name && a.validation?.valid)
            .filter((a: any) => {
              if (seen.has(a.app.name)) return false;
              seen.add(a.app.name);
              return true;
            })
            .map((a: any) => {
              const rawCategories =
                a.app?.categories ?? a.categories ?? a.app?.category ?? a.category ?? [];
              const categories = Array.isArray(rawCategories)
                ? rawCategories
                : typeof rawCategories === 'string'
                  ? [rawCategories]
                  : typeof rawCategories === 'object' && rawCategories !== null
                    ? Object.keys(rawCategories)
                    : [];
              return {
                id: a.app.name,
                name: (a.app.name || '')
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c: string) => c.toUpperCase()),
                large_image: a.app.large_image || '',
                categories,
              };
            });
          setForwardingApps(apps);
        }
      })
      .catch(() => setForwardingApps([]))
      .finally(() => setForwardingAppsLoading(false));
  };

  const handleForwardTo = async (app: {
    id: string;
    name: string;
    categories: string[];
  }) => {
    setShowForwardDialog(false);
    try {
      const categories = (app.categories || []).map((c: string) => c.toLowerCase());
      const isMessaging =
        categories.includes('communication') ||
        categories.includes('email') ||
        app.id.toLowerCase() === 'gmail';
      const ticketPayload = incident?.rawOCSF || incident || {};
      const forwardBody: Record<string, any> = isMessaging
        ? {
            action: 'send_message',
            category: 'cases',
            key: incident?.id,
            app_name: app.id,
            body: ticketPayload,
            fields: { body: ticketPayload },
          }
        : {
            action: 'update_ticket',
            category: 'cases',
            key: incident?.id,
            app_name: app.id,
            fields: [{ key: 'key', value: JSON.stringify(ticketPayload) }],
          };
      const response = await fetch(getApiUrl('/api/v1/apps/categories/run'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader(), ...crossOrgHeaders },
        body: JSON.stringify(forwardBody),
      });
      if (response.ok) {
        toast.success(`Forwarded to ${app.name}`);
      } else {
        toast.error(`Failed to forward to ${app.name}`);
      }
    } catch {
      toast.error(`Failed to forward to ${app.name}`);
    }
  };

  // ---- Resolve --------------------------------------------------------------
  const handleResolve = async (resolutionData: ResolutionData) => {
    if (!incident) return;
    setIsSaving(true);
    const reasonLabel =
      RESOLUTION_REASONS.find((r) => r.value === resolutionData.reason)?.label ||
      resolutionData.reason;

    // Read latest activity from the freshest copy of the incident so the simple
    // view (which doesn't track activity locally) doesn't accidentally drop it.
    let latestActivity: any[] = [];
    try {
      const latest = await getDatastoreItem(
        incident.id,
        DATASTORE_CATEGORIES.INCIDENTS,
        crossOrgId || undefined,
      );
      const data = latest.item?.value ? JSON.parse(latest.item.value) : incident.rawOCSF || {};
      latestActivity =
        data?.activity ||
        data?.metadata?.extensions?.custom_attributes?.activity ||
        [];
    } catch {
      latestActivity = incident.rawOCSF?.activity || [];
    }

    const resolveActivity = {
      id: `status-${Date.now()}`,
      type: 'status' as const,
      user: currentUsername,
      timestamp: Date.now(),
      content: `Resolved: ${reasonLabel}${resolutionData.notes ? ` - ${resolutionData.notes}` : ''}`,
      details: {},
      attachments: [],
    };
    const updatedActivity = [...latestActivity, resolveActivity];

    const resolvedData = incident.rawOCSF
      ? {
          ...incident.rawOCSF,
          status_id: 3,
          status: 'Resolved',
          status_detail: `${resolutionData.reason}${resolutionData.notes ? `: ${resolutionData.notes}` : ''}`,
          activity: updatedActivity,
          metadata: {
            ...incident.rawOCSF.metadata,
            extensions: {
              ...incident.rawOCSF.metadata?.extensions,
              custom_attributes: {
                ...incident.rawOCSF.metadata?.extensions?.custom_attributes,
              },
            },
          },
        }
      : {
          id: incident.id,
          title: incident.title,
          source: incident.source,
          status: 'resolved',
          status_detail: `${resolutionData.reason}${resolutionData.notes ? `: ${resolutionData.notes}` : ''}`,
          activity: updatedActivity,
        };

    try {
      await writeIncidentSafe(incident.id, resolvedData, crossOrgId || undefined);
      // Sync to other orgs (fire-and-forget) when relevant
      if (sharedOrgs.length > 0) {
        Promise.allSettled(
          sharedOrgs.map((org) =>
            writeIncidentSafe(incident.id, resolvedData, org.id),
          ),
        );
      }
      toast.success(t('Incident resolved'));
      setShowResolveDialog(false);
      if (onAfterResolve) {
        onAfterResolve();
      } else {
        navigate('/incidents');
      }
    } catch {
      toast.error(t('Failed to resolve incident'));
    } finally {
      setIsSaving(false);
    }
  };

  if (hidden) return null;

  const customFieldsAsStrings = incident.customFields
    ? Object.fromEntries(
        Object.entries(incident.customFields).map(([k, v]) => [k, String(v ?? '')]),
      )
    : {};

  const publicLink = `${window.location.origin}/incidents/${incident.id}?authorization=${publicAuthorization}&org=${orgId}`;

  return (
    <>
      <Tooltip title="Actions">
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} sx={buttonSx}>
          <MoreVertIcon size={20} />
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        PaperProps={{
          sx: {
            bgcolor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            minWidth: 160,
          },
        }}
      >
        <MenuItem
          onClick={() => {
            setAnchor(null);
            setShowShareDialog(true);
          }}
        >
          <LinkIcon size={16} style={{ marginRight: '8px' }} />
          Share
        </MenuItem>


        <MenuItem disabled>
          <LinkIcon size={16} style={{ marginRight: '8px' }} />
          Visit Source
        </MenuItem>

        <Divider />

        <Tooltip title={resyncBlockedReason} placement="left">
          <span>
            <MenuItem disabled={resyncDisabled || isResyncing} onClick={handleResync} sx={{ width: '100%' }}>
              <RefreshIcon size={16} style={{ marginRight: '8px' }} />
              Resync
            </MenuItem>
          </span>
        </Tooltip>

        <MenuItem disabled onClick={openForwardDialog}>
          <ForwardIcon size={16} style={{ marginRight: '8px' }} />
          Forward
        </MenuItem>

        <Divider />

        <MenuItem
          disabled={isSaving}
          onClick={() => {
            setAnchor(null);
            setShowMergeDialog(true);
          }}
        >
          <CallMergeIcon size={16} style={{ marginRight: '8px' }} />
          Merge Into…
        </MenuItem>

        {!isResolved && <Divider />}
        {!isResolved && (
          <MenuItem
            disabled={isSaving}
            onClick={() => {
              setAnchor(null);
              setShowResolveDialog(true);
            }}
            sx={{ color: '#22c55e' }}
          >
            <CheckCircleIcon size={16} style={{ marginRight: '8px' }} />
            Resolve
          </MenuItem>
        )}

      </Menu>

      {/* ---- Share dialog ---- */}
      <Dialog
        open={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
          },
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {t('Share Incident')}
          </Typography>
          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
            {t('Anyone with this link can view the incident without logging in.')}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Typography
              variant="caption"
              sx={{ color: 'hsl(var(--muted-foreground))', mb: 0.5, display: 'block' }}
            >
              Public link
            </Typography>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1.5,
                borderRadius: 1.5,
                bgcolor: 'rgba(255,255,255,0.03)',
                border: '1px solid hsl(var(--border))',
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  color: 'hsl(var(--foreground))',
                  wordBreak: 'break-all',
                  minWidth: 0,
                  userSelect: 'all',
                }}
              >
                {publicLink}
              </Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  try {
                    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(publicLink).catch(() => {});
                    }
                  } catch {}
                  toast.success('Link copied to clipboard');
                }}
                sx={{
                  flexShrink: 0,
                  textTransform: 'none',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  '&:hover': {
                    borderColor: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary))',
                  },
                }}
              >
                Copy
              </Button>
            </Box>
            {!publicAuthorization && (
              <Typography variant="caption" sx={{ color: '#fb923c', mt: 1, display: 'block' }}>
                No public authorization token found for this incident. The link may not work for
                unauthenticated users.
              </Typography>
            )}
          </Box>
        </DialogContent>
      </Dialog>

      {/* ---- Resolve dialog ---- */}
      <ResolveIncidentDialog
        open={showResolveDialog}
        onClose={() => setShowResolveDialog(false)}
        onResolve={handleResolve}
        incidentTitle={incident?.title || ''}
        isLoading={isSaving}
        incidentCustomFields={customFieldsAsStrings}
      />

      {/* ---- Forward dialog ---- */}
      <Dialog
        open={showForwardDialog}
        onClose={() => setShowForwardDialog(false)}
        PaperProps={{
          sx: {
            bgcolor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            minWidth: 400,
            maxWidth: 500,
          },
        }}
      >
        <DialogTitle
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}
        >
          <Typography variant="h6" sx={{ fontSize: '1rem' }}>
            {t('Forward Incident')}
          </Typography>
          <IconButton size="small" onClick={() => setShowForwardDialog(false)}>
            <CloseIcon size={20} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            {t('Choose a tool to forward this incident to.')}
          </Typography>
          {forwardingAppsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : forwardingApps.length === 0 ? (
            <Typography
              variant="body2"
              sx={{ color: 'text.disabled', textAlign: 'center', py: 4 }}
            >
              No authenticated tools available. Configure integrations in Settings.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {forwardingApps.map((app) => (
                <MenuItem
                  key={app.id}
                  onClick={() => handleForwardTo(app)}
                  sx={{ borderRadius: 1, py: 1 }}
                >
                  <Avatar
                    src={app.large_image}
                    sx={{ width: 28, height: 28, mr: 1.5, borderRadius: 1 }}
                    variant="rounded"
                  >
                    {app.name.charAt(0)}
                  </Avatar>
                  <Typography variant="body2">{app.name}</Typography>
                </MenuItem>
              ))}
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- Merge dialog ---- */}
      <MergeIncidentDialog
        open={showMergeDialog}
        onClose={() => setShowMergeDialog(false)}
        currentIncidentId={incident?.id || ''}
        currentIncidentTitle={incident?.title || ''}
        onMergeComplete={() => {
          onAfterChange?.();
        }}
      />
    </>
  );
};

export default IncidentActionsMenu;
