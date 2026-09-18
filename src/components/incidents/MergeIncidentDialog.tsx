import { Search as SearchIcon, GitMerge as MergeIcon, CheckCircle2 as CheckCircleIcon, ArrowRight as ArrowForwardIcon, AlertTriangle as WarningAmberIcon } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  TextField,
  InputAdornment,
  CircularProgress,
  Avatar,
  Divider,
  IconButton,
} from '@mui/material';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getDatastoreByCategory, getDatastoreItem, DATASTORE_CATEGORIES } from '@/Shuffle-MCPs/datastore';
import { mapOCSFSeverity, mapOCSFStatus, Observable } from '@/config/ocsfIncidentSchema';
import { severityColors, statusConfig } from '@/config/incidentConfig';
import { toast } from '@/lib/toast';
import { useEntityText } from '@/hooks/useEntityLabel';
import { linkMergePair, isMergedIncident } from '@/lib/incidentRelations';
import { useAuth } from '@/context/AuthContext';

interface IncidentSummary {
  id: string;
  title: string;
  severity: string;
  status: string;
  assignee: string;
  created: number;
  source: string;
  observableCount: number;
  taskCount: number;
  commentCount: number;
  rawValue: string;
}

interface MergeIncidentDialogProps {
  open: boolean;
  onClose: () => void;
  currentIncidentId: string;
  currentIncidentTitle: string;
  onMergeComplete: () => void;
  /** When set, the candidate with this id is preselected and the dialog opens
   * directly on the confirmation step. Used by the merge-candidates banner so
   * the user can review and confirm in one click. */
  preselectedTargetId?: string;
}

const parseIncidentSummary = (item: { key: string; value: string; created?: number }): IncidentSummary | null => {
  try {
    const data = JSON.parse(item.value);
    const isNewFormat = 'finding_uid' in data && 'title' in data;
    const customAttrs = data.metadata?.extensions?.custom_attributes;

    let title = '';
    let severity = 'medium';
    let status = 'new';
    let assignee = '';
    let source = '';
    let observableCount = 0;
    let taskCount = 0;
    let commentCount = 0;

    if (isNewFormat) {
      title = data.title || '';
      severity = mapOCSFSeverity(data.severity_id || 3);
      status = mapOCSFStatus(data.status_id || 1);
      assignee = customAttrs?.assignee || data.assignee || '';
      source = data.product?.name || data.types?.[0] || '';
      observableCount = (customAttrs?.observables || data.observables || []).length;
      taskCount = (data.tasks || customAttrs?.tasks || []).length;
      commentCount = (data.activity || customAttrs?.activity || customAttrs?.comments || []).length;
    } else {
      const findingInfo = data.finding_info_list?.[0] || data.finding_info;
      title = findingInfo?.title || data.title || data.message || '';
      severity = mapOCSFSeverity(data.severity_id);
      status = mapOCSFStatus(data.status_id);
      assignee = data.assignee || '';
      source = data.metadata?.product?.name || '';
      observableCount = (data.observables || []).length;
      taskCount = (data.tasks || []).length;
      commentCount = (data.activity || []).length;
    }

    return {
      id: item.key,
      title: title || item.key,
      severity,
      status,
      assignee,
      created: item.created || 0,
      source,
      observableCount,
      taskCount,
      commentCount,
      rawValue: item.value,
    };
  } catch {
    return null;
  }
};

// smartMerge was removed. Merges are now non-destructive: both incidents
// stay as separate datastore rows and are cross-referenced via
// `related_incidents` pointers. See src/lib/incidentRelations.ts.

export const MergeIncidentDialog = ({
  open,
  onClose,
  currentIncidentId,
  currentIncidentTitle,
  onMergeComplete,
  preselectedTargetId,
}: MergeIncidentDialogProps) => {
  const t = useEntityText();
  const { userInfo } = useAuth();
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<IncidentSummary | null>(null);
  const [merging, setMerging] = useState(false);
  const [step, setStep] = useState<'select' | 'confirm'>('select');

  // Load all incidents for selection
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSearch('');
    setSelectedTarget(null);
    setStep('select');

    getDatastoreByCategory(DATASTORE_CATEGORIES.INCIDENTS).then(result => {
      if (result.success && result.data) {
        const parsed = result.data
          .filter(item => item.key !== currentIncidentId) // exclude current
          .map(item => parseIncidentSummary(item))
          .filter(Boolean) as IncidentSummary[];
        // Sort by created desc
        parsed.sort((a, b) => b.created - a.created);
        setIncidents(parsed);

        // If the caller pre-selected a target (e.g. from the banner),
        // jump straight to the confirm step with it selected.
        if (preselectedTargetId) {
          const pre = parsed.find(i => i.id === preselectedTargetId);
          if (pre) {
            setSelectedTarget(pre);
            setStep('confirm');
          }
        }
      }
      setLoading(false);
    });
  }, [open, currentIncidentId, preselectedTargetId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return incidents;
    const q = search.toLowerCase();
    return incidents.filter(i =>
      i.title.toLowerCase().includes(q) ||
      i.id.toLowerCase().includes(q) ||
      i.source.toLowerCase().includes(q)
    );
  }, [incidents, search]);

  const handleMerge = useCallback(async () => {
    if (!selectedTarget) return;
    setMerging(true);

    try {
      // Load the source (current incident) fresh so we snapshot its
      // status accurately for possible unmerge.
      const currentResult = await getDatastoreItem(currentIncidentId, DATASTORE_CATEGORIES.INCIDENTS);
      const currentRaw = currentResult.item ? JSON.parse(currentResult.item.value) : {};

      // Guard: never merge into an already-merged incident. The chain
      // would leave the analyst chasing pointers.
      const targetRaw = JSON.parse(selectedTarget.rawValue);
      if (isMergedIncident(targetRaw)) {
        toast.error('Target incident is itself merged. Pick a primary incident.');
        setMerging(false);
        return;
      }

      const res = await linkMergePair({
        primaryId: selectedTarget.id,
        primaryRaw: targetRaw,
        primaryTitle: selectedTarget.title,
        sourceId: currentIncidentId,
        sourceRaw: currentRaw,
        sourceTitle: currentIncidentTitle,
        linkedBy: userInfo?.username,
      });

      if (!res.success) {
        toast.error(res.error || t('Failed to save merged incident'));
        setMerging(false);
        return;
      }

      toast.success(`Merged into "${selectedTarget.title}"`);
      onMergeComplete();
      onClose();
    } catch (err) {
      console.error('Merge failed:', err);
      toast.error('Merge failed — see console for details');
    } finally {
      setMerging(false);
    }
  }, [selectedTarget, currentIncidentId, currentIncidentTitle, onMergeComplete, onClose, t, userInfo?.username]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <MergeIcon size={20} style={{ color: 'hsl(var(--primary))' }} />
            {step === 'select' ? t('Merge Incident') : 'Confirm Merge'}
          </DialogTitle>
          <DialogDescription>
            {step === 'select'
              ? t('Select the target incident to merge this one into. All tasks, observables, and comments will be combined.')
              : 'Review the merge details below. This action cannot be undone.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <>
            {/* Search */}
            <Box sx={{ px: 3, pb: 2 }}>
              <TextField
                fullWidth
                size="small"
                placeholder={t('Search incidents by title, ID, or source...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    </InputAdornment>
                  ),
                  sx: {
                    bgcolor: 'hsl(var(--muted))',
                    borderRadius: 2,
                    fontSize: '0.875rem',
                    '& fieldset': { borderColor: 'hsl(var(--border))' },
                  },
                }}
              />
            </Box>

            {/* Incident list */}
            <Box sx={{ flex: 1, overflowY: 'auto', px: 3, pb: 2, minHeight: 200, maxHeight: 400 }}>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                  <CircularProgress size={28} sx={{ color: 'hsl(var(--primary))' }} />
                </Box>
              ) : filtered.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 6 }}>
                  {search ? 'No matching incidents found' : 'No other incidents available'}
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {filtered.map((inc) => {
                    const isSelected = selectedTarget?.id === inc.id;
                    const sevColor = severityColors[inc.severity] || severityColors.medium;
                    const statConfig = statusConfig[inc.status];
                    const isMerged = inc.status === 'Merged';

                    return (
                      <Box
                        key={inc.id}
                        onClick={() => !isMerged && setSelectedTarget(isSelected ? null : inc)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          px: 2,
                          py: 1.5,
                          borderRadius: 2,
                          cursor: isMerged ? 'not-allowed' : 'pointer',
                          opacity: isMerged ? 0.5 : 1,
                          border: isSelected ? '1px solid hsl(var(--primary))' : '1px solid transparent',
                          bgcolor: isSelected ? 'hsl(var(--primary) / 0.08)' : 'transparent',
                          '&:hover': isMerged ? {} : {
                            bgcolor: isSelected ? 'hsl(var(--primary) / 0.12)' : 'hsl(var(--muted) / 0.4)',
                          },
                          transition: 'all 0.15s',
                        }}
                      >
                        {/* Severity dot */}
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: sevColor, flexShrink: 0 }} />

                        {/* Content */}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {inc.title}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {inc.id.substring(0, 12)}…
                            </Typography>
                            {inc.source && (
                              <Chip label={inc.source} size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'hsl(var(--muted) / 0.5)' }} />
                            )}
                            {isMerged && (
                              <Chip label="Merged" size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'hsl(var(--muted) / 0.5)' }} />
                            )}
                          </Box>
                        </Box>

                        {/* Stats */}
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexShrink: 0 }}>
                          {inc.taskCount > 0 && (
                            <Chip label={`${inc.taskCount} tasks`} size="small" sx={{ height: 20, fontSize: '0.65rem', bgcolor: 'hsl(var(--muted) / 0.5)' }} />
                          )}
                          {inc.observableCount > 0 && (
                            <Chip label={`${inc.observableCount} IOCs`} size="small" sx={{ height: 20, fontSize: '0.65rem', bgcolor: 'hsl(var(--muted) / 0.5)' }} />
                          )}
                        </Box>

                        {/* Selected indicator */}
                        {isSelected && (
                          <CheckCircleIcon size={20} style={{ color: 'hsl(var(--primary))', flexShrink: 0 }} />
                        )}
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>

            <DialogFooter className="px-6 pb-6 pt-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={!selectedTarget}
                onClick={() => setStep('confirm')}
                className="bg-[#ff6600] hover:bg-[#e55c00] text-white"
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'confirm' && selectedTarget && (
          <>
            <Box sx={{ px: 3, pb: 2 }}>
              {/* Visual merge direction */}
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 2,
                borderRadius: 2,
                bgcolor: 'hsl(var(--muted) / 0.35)',
                border: '1px solid hsl(var(--border))',
              }}>
                {/* Source (current) */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                    Source (this incident)
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentIncidentTitle || currentIncidentId}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Will be marked as "Merged"
                  </Typography>
                </Box>

                {/* Arrow */}
                <ArrowForwardIcon size={28} style={{ color: 'hsl(var(--primary))', flexShrink: 0 }} />

                {/* Target */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                    Target (merge into)
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedTarget.title}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'hsl(var(--severity-low))' }}>
                    Will receive merged data
                  </Typography>
                </Box>
              </Box>

              {/* What will happen */}
              <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  What will happen:
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {[
                    'Both incidents keep their data — nothing is copied or destroyed',
                    'The current incident is marked "Merged" and links to the target',
                    'The target incident lists this one as a linked incident',
                    'Observables and email threads render as a union across both',
                    'You can unmerge at any time from either side',
                  ].map((item, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CheckCircleIcon size={14} style={{ color: 'hsl(var(--severity-low))' }} />
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{item}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>

              {/* Note */}
              <Box sx={{
                mt: 2,
                p: 1.5,
                borderRadius: 2,
                bgcolor: 'hsl(var(--muted) / 0.4)',
                border: '1px solid hsl(var(--border))',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
              }}>
                <WarningAmberIcon size={18} style={{ color: 'hsl(var(--muted-foreground))', marginTop: '2px' }} />
                <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                  This is a non-destructive cross-reference. Opening the current incident afterwards will offer a jump to the target.
                </Typography>
              </Box>
            </Box>

            <DialogFooter className="px-6 pb-6 pt-2">
              <Button variant="outline" onClick={() => setStep('select')}>
                Back
              </Button>
              <Button
                disabled={merging}
                onClick={handleMerge}
                className="bg-[#ff6600] hover:bg-[#e55c00] text-white"
              >
                {merging ? (
                  <CircularProgress size={16} sx={{ color: 'white', mr: 1 }} />
                ) : (
                  <MergeIcon size={16} style={{ marginRight: '4px' }} />
                )}
                Merge Incident
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
