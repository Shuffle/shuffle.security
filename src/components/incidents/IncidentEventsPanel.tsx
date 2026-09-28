import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
} from '@mui/material';
import type { IncidentEvent } from '@/config/ocsfIncidentSchema';
import {
  saveIncidentEvent,
  deleteIncidentEvent,
  bulkSaveIncidentEvents,
  extractEventsFromUnmapped,
  hasExtractableEvents,
} from '@/services/incidentEventsService';
import { AddIncidentEventDialog } from './AddIncidentEventDialog';
import { toast } from 'sonner';

interface IncidentEventsPanelProps {
  incidentId: string;
  events: IncidentEvent[];
  unmappedOriginal?: any;
  defaultSource?: string;
  onEventsChange: (updatedEvents: IncidentEvent[]) => void;
  onNavigateToIncident?: (targetIncidentId: string) => void;
  readOnly?: boolean;
}

export const IncidentEventsPanel: React.FC<IncidentEventsPanelProps> = ({
  incidentId,
  events,
  unmappedOriginal,
  defaultSource,
  onEventsChange,
  onNavigateToIncident,
  readOnly = false,
}) => {
  const [filterText, setFilterText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedRawEvent, setSelectedRawEvent] = useState<IncidentEvent | null>(null);

  // Extractable check
  const canExtract = useMemo(() => {
    return hasExtractableEvents(unmappedOriginal);
  }, [unmappedOriginal]);

  // Unique sources for filter dropdown
  const uniqueSources = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => {
      if (e.source) set.add(e.source);
    });
    return Array.from(set).sort();
  }, [events]);

  // Filtered event list
  const filteredEvents = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return events.filter((ev) => {
      if (statusFilter !== 'all' && ev.status !== statusFilter) return false;
      if (sourceFilter !== 'all' && ev.source !== sourceFilter) return false;
      if (!q) return true;

      const inAction = ev.action?.toLowerCase().includes(q);
      const inSource = ev.source?.toLowerCase().includes(q);
      const inType = ev.type?.toLowerCase().includes(q);
      const inNotes = ev.notes?.toLowerCase().includes(q);
      const inTags = ev.tags?.some((t) => t.toLowerCase().includes(q));
      const inMessage = ev.message?.toLowerCase().includes(q);
      return inAction || inSource || inType || inNotes || inTags || inMessage;
    });
  }, [events, filterText, statusFilter, sourceFilter]);

  // Handlers
  const handleExtractFromSource = async () => {
    if (!unmappedOriginal || isExtracting) return;
    setIsExtracting(true);

    try {
      const extracted = extractEventsFromUnmapped(incidentId, unmappedOriginal, defaultSource);
      if (extracted.length === 0) {
        toast.info('No events found in source payload');
        return;
      }

      // Merge with existing events, avoiding duplicate IDs or fingerprints
      const existingIds = new Set(events.map((e) => e.id));
      const existingFps = new Set(events.map((e) => e.fingerprint).filter(Boolean));

      const newEvents = extracted.filter(
        (e) => !existingIds.has(e.id) && (!e.fingerprint || !existingFps.has(e.fingerprint)),
      );

      if (newEvents.length === 0) {
        toast.info('All events from source are already present');
        return;
      }

      const res = await bulkSaveIncidentEvents(newEvents);
      if (res.success) {
        const merged = [...newEvents, ...events];
        onEventsChange(merged);
        toast.success(`Extracted and saved ${newEvents.length} events from source data`);
      } else {
        toast.error(`Failed to save events: ${res.error}`);
      }
    } catch (err: any) {
      console.error('Extraction failed:', err);
      toast.error('Failed to extract events from source');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleAddEvent = async (newEvent: IncidentEvent) => {
    const res = await saveIncidentEvent(newEvent);
    if (res.success) {
      const updated = [newEvent, ...events];
      onEventsChange(updated);
      toast.success('Event added successfully');
    } else {
      toast.error(`Failed to save event: ${res.error}`);
    }
  };

  const handleStatusChange = async (event: IncidentEvent, nextStatus: IncidentEvent['status']) => {
    if (event.status === nextStatus || readOnly) return;
    const updated: IncidentEvent = { ...event, status: nextStatus };
    const res = await saveIncidentEvent(updated);
    if (res.success) {
      const list = events.map((e) => (e.id === event.id ? updated : e));
      onEventsChange(list);
      toast.success(`Status updated to ${nextStatus}`);
    } else {
      toast.error(`Failed to update status: ${res.error}`);
    }
  };

  const handleDeleteEvent = async (event: IncidentEvent) => {
    if (readOnly) return;
    const key = event.key || `${incidentId}_${event.id}`;
    const res = await deleteIncidentEvent(key);
    if (res.success) {
      const updated = events.filter((e) => e.id !== event.id && e.key !== key);
      onEventsChange(updated);
      toast.success('Event deleted');
    } else {
      toast.error(`Failed to delete event: ${res.error}`);
    }
  };

  const getSeverityStyle = (sev?: string) => {
    const s = (sev || '').toLowerCase();
    if (s === 'critical') return { color: 'hsl(var(--destructive))', border: '1px solid hsl(var(--destructive) / 0.4)' };
    if (s === 'high') return { color: '#f97316', border: '1px solid rgba(249, 115, 22, 0.4)' };
    if (s === 'medium') return { color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.4)' };
    if (s === 'low') return { color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.4)' };
    return { color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))' };
  };

  const getStatusStyle = (status: IncidentEvent['status']) => {
    if (status === 'relevant') {
      return {
        color: '#22c55e',
        bgcolor: 'rgba(34, 197, 94, 0.1)',
        borderColor: 'rgba(34, 197, 94, 0.3)',
      };
    }
    if (status === 'investigating') {
      return {
        color: '#f59e0b',
        bgcolor: 'rgba(245, 158, 11, 0.1)',
        borderColor: 'rgba(245, 158, 11, 0.3)',
      };
    }
    return {
      color: 'hsl(var(--muted-foreground))',
      bgcolor: 'hsl(var(--muted) / 0.2)',
      borderColor: 'hsl(var(--border))',
    };
  };

  const formatTimestamp = (t?: string | number) => {
    if (!t) return '-';
    try {
      const d = typeof t === 'number' ? new Date(t) : new Date(String(t));
      if (isNaN(d.getTime())) return String(t);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return String(t);
    }
  };

  return (
    <Box
      sx={{
        bgcolor: 'transparent',
        borderRadius: 2,
        border: '1px solid hsl(var(--border))',
        p: 2.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {/* Header Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Search events..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            sx={{
              minWidth: 200,
              maxWidth: 320,
              height: 32,
              '& .MuiOutlinedInput-root': {
                height: 32,
                fontSize: '0.8rem',
                '& fieldset': { borderColor: 'hsl(var(--border))' },
              },
            }}
          />

          <Select
            size="small"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            sx={{
              height: 32,
              fontSize: '0.78rem',
              minWidth: 120,
              '& fieldset': { borderColor: 'hsl(var(--border))' },
            }}
          >
            <MenuItem value="all">All Statuses</MenuItem>
            <MenuItem value="relevant">Relevant</MenuItem>
            <MenuItem value="investigating">Investigating</MenuItem>
            <MenuItem value="excluded">Excluded</MenuItem>
          </Select>

          {uniqueSources.length > 1 && (
            <Select
              size="small"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              sx={{
                height: 32,
                fontSize: '0.78rem',
                minWidth: 130,
                '& fieldset': { borderColor: 'hsl(var(--border))' },
              }}
            >
              <MenuItem value="all">All Sources</MenuItem>
              {uniqueSources.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </Select>
          )}

          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', ml: 0.5 }}>
            {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}
          </Typography>
        </Box>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {canExtract && !readOnly && (
            <Button
              size="small"
              variant="outlined"
              onClick={handleExtractFromSource}
              disabled={isExtracting}
              sx={{
                height: 32,
                fontSize: '0.78rem',
                fontWeight: 600,
                textTransform: 'none',
                px: 1.5,
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--foreground))',
                '&:hover': {
                  borderColor: 'hsl(var(--primary))',
                  bgcolor: 'hsl(var(--muted) / 0.25)',
                },
              }}
            >
              {isExtracting ? (
                <>
                  <CircularProgress size={12} sx={{ mr: 1 }} />
                  Extracting...
                </>
              ) : (
                'Extract from Source Data'
              )}
            </Button>
          )}

          {!readOnly && (
            <Button
              size="small"
              variant="contained"
              onClick={() => setShowAddDialog(true)}
              sx={{
                height: 32,
                fontSize: '0.78rem',
                fontWeight: 600,
                textTransform: 'none',
                px: 1.75,
                bgcolor: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                boxShadow: 'none',
                '&:hover': {
                  bgcolor: 'hsl(var(--primary) / 0.9)',
                  boxShadow: 'none',
                },
              }}
            >
              Add Event
            </Button>
          )}
        </Box>
      </Box>

      {/* Events Table */}
      {filteredEvents.length === 0 ? (
        <Box
          sx={{
            py: 6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px dashed hsl(var(--border))',
            borderRadius: 1.5,
            gap: 1.5,
          }}
        >
          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>
            {filterText || statusFilter !== 'all' || sourceFilter !== 'all'
              ? 'No events match the selected filters.'
              : 'No events linked to this incident yet.'}
          </Typography>
          {canExtract && !readOnly && (
            <Button
              size="small"
              variant="outlined"
              onClick={handleExtractFromSource}
              disabled={isExtracting}
              sx={{
                height: 30,
                fontSize: '0.75rem',
                textTransform: 'none',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--foreground))',
              }}
            >
              Extract from Source Data
            </Button>
          )}
        </Box>
      ) : (
        <Box
          sx={{
            overflowX: 'auto',
            border: '1px solid hsl(var(--border))',
            borderRadius: 1.5,
          }}
        >
          <Box
            component="table"
            sx={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.78rem',
              '& th': {
                textAlign: 'left',
                py: 1,
                px: 1.5,
                fontWeight: 600,
                color: 'hsl(var(--muted-foreground))',
                borderBottom: '1px solid hsl(var(--border))',
                bgcolor: 'hsl(var(--muted) / 0.3)',
                whiteSpace: 'nowrap',
              },
              '& td': {
                py: 1.25,
                px: 1.5,
                borderBottom: '1px solid hsl(var(--border))',
                verticalAlign: 'middle',
              },
              '& tr:last-child td': {
                borderBottom: 'none',
              },
              '& tr:hover': {
                bgcolor: 'hsl(var(--muted) / 0.15)',
              },
            }}
          >
            <thead>
              <tr>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 140 }}>Time</th>
                <th style={{ width: 130 }}>Source</th>
                <th>Action / Description</th>
                <th style={{ width: 100 }}>Severity</th>
                <th style={{ width: 140 }}>Correlation</th>
                <th style={{ width: 160 }}>Tags</th>
                <th style={{ width: 110, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((ev) => {
                const statusStyle = getStatusStyle(ev.status);
                const sevStyle = getSeverityStyle(ev.severity);

                return (
                  <tr key={ev.id}>
                    {/* Status Toggle */}
                    <td>
                      <Select
                        size="small"
                        value={ev.status || 'relevant'}
                        disabled={readOnly}
                        onChange={(e) => handleStatusChange(ev, e.target.value as any)}
                        sx={{
                          height: 24,
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: statusStyle.color,
                          bgcolor: statusStyle.bgcolor,
                          border: `1px solid ${statusStyle.borderColor}`,
                          borderRadius: 1,
                          '& .MuiSelect-select': { py: 0.25, px: 1 },
                          '& fieldset': { border: 'none' },
                        }}
                      >
                        <MenuItem value="relevant" sx={{ fontSize: '0.75rem' }}>
                          Relevant
                        </MenuItem>
                        <MenuItem value="investigating" sx={{ fontSize: '0.75rem' }}>
                          Investigating
                        </MenuItem>
                        <MenuItem value="excluded" sx={{ fontSize: '0.75rem' }}>
                          Excluded
                        </MenuItem>
                      </Select>
                    </td>

                    {/* Time */}
                    <td>
                      <Typography sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        {formatTimestamp(ev.time)}
                      </Typography>
                    </td>

                    {/* Source */}
                    <td>
                      <Chip
                        label={ev.source || 'Telemetry'}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.7rem',
                          bgcolor: 'transparent',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 1,
                          maxWidth: 120,
                        }}
                      />
                    </td>

                    {/* Action / Title */}
                    <td>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 500 }}>
                          {ev.action}
                        </Typography>
                        {ev.type && ev.type !== 'event' && (
                          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem' }}>
                            {ev.type}
                          </Typography>
                        )}
                        {ev.notes && (
                          <Typography variant="caption" sx={{ color: 'hsl(var(--primary))', fontSize: '0.7rem', fontStyle: 'italic' }}>
                            Note: {ev.notes}
                          </Typography>
                        )}
                      </Box>
                    </td>

                    {/* Severity */}
                    <td>
                      <Chip
                        label={ev.severity || 'info'}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          bgcolor: 'transparent',
                          ...sevStyle,
                          borderRadius: 1,
                        }}
                      />
                    </td>

                    {/* Cross-Incident Correlation */}
                    <td>
                      {ev.correlated_incident_ids && ev.correlated_incident_ids.length > 0 ? (
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {ev.correlated_incident_ids.map((otherIncId) => (
                            <Tooltip key={otherIncId} title={`Shared event with Incident ${otherIncId}`}>
                              <Chip
                                label={`Incident ${otherIncId.slice(0, 8)}`}
                                size="small"
                                clickable={!!onNavigateToIncident}
                                onClick={() => onNavigateToIncident?.(otherIncId)}
                                sx={{
                                  height: 20,
                                  fontSize: '0.68rem',
                                  fontWeight: 500,
                                  color: '#38bdf8',
                                  bgcolor: 'rgba(56, 189, 248, 0.1)',
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                  borderRadius: 1,
                                }}
                              />
                            </Tooltip>
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                          -
                        </Typography>
                      )}
                    </td>

                    {/* Tags */}
                    <td>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {ev.tags && ev.tags.length > 0 ? (
                          ev.tags.map((tag) => (
                            <Chip
                              key={tag}
                              label={tag}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.65rem',
                                bgcolor: 'transparent',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: 0.75,
                              }}
                            />
                          ))
                        ) : (
                          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                            -
                          </Typography>
                        )}
                      </Box>
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        {ev.raw && (
                          <Button
                            size="small"
                            onClick={() => setSelectedRawEvent(ev)}
                            sx={{
                              height: 24,
                              fontSize: '0.7rem',
                              textTransform: 'none',
                              px: 1,
                              color: 'hsl(var(--muted-foreground))',
                              border: '1px solid hsl(var(--border))',
                              '&:hover': { color: 'hsl(var(--foreground))' },
                            }}
                          >
                            Raw
                          </Button>
                        )}

                        {!readOnly && (
                          <Button
                            size="small"
                            onClick={() => handleDeleteEvent(ev)}
                            sx={{
                              height: 24,
                              fontSize: '0.7rem',
                              textTransform: 'none',
                              px: 1,
                              color: 'hsl(var(--destructive))',
                              border: '1px solid hsl(var(--border))',
                              '&:hover': { bgcolor: 'hsl(var(--destructive) / 0.1)' },
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </Box>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Box>
        </Box>
      )}

      {/* Raw Payload Inspection Modal */}
      {selectedRawEvent && (
        <Dialog
          open={!!selectedRawEvent}
          onClose={() => setSelectedRawEvent(null)}
          maxWidth="md"
          fullWidth
          PaperProps={{
            sx: {
              bgcolor: 'hsl(var(--card))',
              color: 'hsl(var(--foreground))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 2,
            },
          }}
        >
          <DialogTitle
            sx={{
              fontSize: '0.95rem',
              fontWeight: 600,
              py: 1.5,
              px: 2.5,
              borderBottom: '1px solid hsl(var(--border))',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Event Payload: {selectedRawEvent.action}
            </Typography>
            <Chip
              label={selectedRawEvent.source || 'Telemetry'}
              size="small"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          </DialogTitle>
          <DialogContent sx={{ p: 2.5 }}>
            <Box
              component="pre"
              sx={{
                p: 2,
                borderRadius: 1.5,
                bgcolor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                overflowX: 'auto',
                maxHeight: '60vh',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {JSON.stringify(selectedRawEvent.raw || selectedRawEvent, null, 2)}
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 1.5, borderTop: '1px solid hsl(var(--border))' }}>
            <Button
              size="small"
              onClick={() => {
                try {
                  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(
                      JSON.stringify(selectedRawEvent.raw || selectedRawEvent, null, 2),
                    ).catch(() => {});
                  }
                } catch {}
                toast.success('Event JSON copied to clipboard');
              }}
              sx={{
                height: 28,
                fontSize: '0.75rem',
                textTransform: 'none',
                color: 'hsl(var(--foreground))',
                border: '1px solid hsl(var(--border))',
              }}
            >
              Copy JSON
            </Button>
            <Button
              size="small"
              onClick={() => setSelectedRawEvent(null)}
              sx={{
                height: 28,
                fontSize: '0.75rem',
                textTransform: 'none',
                color: 'hsl(var(--muted-foreground))',
              }}
            >
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Add Event Dialog */}
      <AddIncidentEventDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onAdd={handleAddEvent}
        incidentId={incidentId}
      />
    </Box>
  );
};
