/**
 * IncidentReportDialog
 *
 * Preview an incident report and save it as PDF via the browser's
 * native print-to-PDF flow. The report is generated once (mostly
 * extracted, with AI for the summary + event analysis) and stored
 * so subsequent opens are instant.
 */

import { X as CloseIcon, Printer as PrintIcon, RefreshCw as RefreshIcon, Wand2 as AutoFixHighIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Button,
  CircularProgress,
  Chip,
  Divider,
  Tooltip,
} from '@mui/material';
import { toast } from '@/lib/toast';
import {
  generateIncidentReport,
  loadIncidentReport,
  saveIncidentReport,
  type IncidentReport,
  type GenerateReportInput,
} from '@/services/incidentReports';

interface IncidentReportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Builds the input on-demand; only called when generation is needed. */
  buildInput: () => GenerateReportInput;
  /** Optional org id for cross-org datastore reads/writes. */
  overrideOrgId?: string;
  /** Username to attribute the generation to. */
  generatedBy?: string;
}

const formatTs = (ms?: number) => {
  if (!ms) return 'Unknown';
  const d = new Date(ms < 1e12 ? ms * 1000 : ms);
  if (isNaN(d.getTime())) return 'Unknown';
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Box sx={{ mt: 4 }} className="report-section">
    <Typography
      variant="h6"
      sx={{
        fontWeight: 700,
        color: 'hsl(var(--foreground))',
        borderBottom: '2px solid hsl(var(--primary))',
        pb: 0.5,
        mb: 2,
      }}
    >
      {title}
    </Typography>
    {children}
  </Box>
);

const KV = ({ k, v }: { k: string; v?: React.ReactNode }) => (
  <Box sx={{ display: 'flex', gap: 2, py: 0.5, fontSize: 13 }}>
    <Box sx={{ minWidth: 140, color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>{k}</Box>
    <Box sx={{ color: 'hsl(var(--foreground))', flex: 1, wordBreak: 'break-word' }}>{v ?? '—'}</Box>
  </Box>
);

const IncidentReportDialog = ({
  open,
  onClose,
  buildInput,
  overrideOrgId,
  generatedBy,
}: IncidentReportDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<IncidentReport | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const ensureReport = async (force = false) => {
    const input = buildInput();
    if (!input?.incidentId) {
      toast.error('Cannot generate report: missing incident id');
      return;
    }
    setLoading(true);
    try {
      if (!force) {
        const existing = await loadIncidentReport(input.incidentId, overrideOrgId);
        if (existing) {
          setReport(refreshReportTimeline(existing, input));
          setLoading(false);
          return;
        }
      }
      setGenerating(true);
      const fresh = await generateIncidentReport(input, generatedBy);
      setReport(fresh);
      const ok = await saveIncidentReport(fresh, overrideOrgId);
      if (!ok) toast.error('Report generated but failed to save');
    } catch (err) {
      console.error('Report generation failed:', err);
      toast.error('Failed to generate report');
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setReport(null);
    ensureReport(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handlePrint = () => {
    // Add a class to body so the print stylesheet hides everything except the report.
    const cls = 'printing-incident-report';
    document.body.classList.add(cls);
    const cleanup = () => {
      document.body.classList.remove(cls);
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => window.print(), 50);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          maxHeight: '90vh',
        },
      }}
    >
      {/* Print stylesheet: hide everything except the printable area. */}
      <style>{`
        @media print {
          body.printing-incident-report > *:not(.MuiDialog-root):not(.MuiPopover-root) { display: none !important; }
          body.printing-incident-report .MuiDialog-root .MuiBackdrop-root { display: none !important; }
          html:has(body.printing-incident-report), body.printing-incident-report { overflow: visible !important; height: auto !important; }
          body.printing-incident-report .MuiDialog-root { position: static !important; inset: auto !important; }
          body.printing-incident-report .MuiDialog-root .MuiDialog-container { position: static !important; height: auto !important; display: block !important; overflow: visible !important; }
          body.printing-incident-report .MuiDialog-root .MuiDialogContent-root { overflow: visible !important; max-height: none !important; height: auto !important; }
          body.printing-incident-report .MuiDialog-root .MuiPaper-root { display: block !important; overflow: visible !important; height: auto !important; box-shadow: none !important; max-height: none !important; max-width: none !important; width: 100% !important; margin: 0 !important; border: none !important; }
          body.printing-incident-report .report-no-print { display: none !important; }
          body.printing-incident-report .report-printable { color: #000 !important; background: #fff !important; }
          body.printing-incident-report .report-printable * { color: #000 !important; background: transparent !important; border-color: #ccc !important; }
          body.printing-incident-report .report-printable .report-section { page-break-inside: auto; break-inside: auto; }
          body.printing-incident-report .report-printable .report-timeline-row { break-inside: avoid; page-break-inside: avoid; }
          @page { margin: 18mm; }
        }
      `}</style>

      <DialogTitle
        className="report-no-print"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid hsl(var(--border))',
          py: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoFixHighIcon size={18} style={{ color: 'hsl(var(--primary))' }} />
          <Typography sx={{ fontWeight: 600 }}>Incident Report</Typography>
          {report && (
            <Chip
              size="small"
              label={`Generated ${formatTs(report.generatedAt)}`}
              sx={{ ml: 1, bgcolor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Regenerate using AI (replaces saved report)">
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshIcon size={16} />}
                onClick={() => ensureReport(true)}
                disabled={loading || generating}
                sx={{ height: 36, textTransform: 'none' }}
              >
                Regenerate
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Save as PDF (uses your browser's print dialog)">
            <span>
              <Button
                size="small"
                variant="contained"
                startIcon={<PrintIcon size={16} />}
                onClick={handlePrint}
                disabled={!report || loading || generating}
                sx={{ height: 36, textTransform: 'none' }}
              >
                Save as PDF
              </Button>
            </span>
          </Tooltip>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon size={20} />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {(loading || generating) && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8, gap: 2 }}>
            <CircularProgress size={20} />
            <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: 14 }}>
              {generating ? 'Generating report with AI…' : 'Loading…'}
            </Typography>
          </Box>
        )}

        {!loading && !generating && report && (
          <Box
            ref={printRef}
            className="report-printable"
            sx={{ p: 4, bgcolor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
          >
            {/* 1. Title */}
            <Box>
              <Typography variant="overline" sx={{ color: 'hsl(var(--muted-foreground))', letterSpacing: 1.2 }}>
                Incident Report
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5, mb: 1 }}>
                {report.title}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                {report.alertDetails.severity && (
                  <Chip size="small" label={`Severity: ${report.alertDetails.severity}`} />
                )}
                {report.alertDetails.status && (
                  <Chip size="small" label={`Status: ${report.alertDetails.status}`} />
                )}
                {report.alertDetails.source && (
                  <Chip size="small" label={`Source: ${report.alertDetails.source}`} />
                )}
                <Typography sx={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', ml: 'auto' }}>
                  Report ID: {report.incidentId}
                </Typography>
              </Box>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* 2. Executive Summary */}
            <Section title="Executive Summary">
              {report.executiveSummary
                .split(/\n{2,}/)
                .map((p, i) => (
                  <Typography key={i} sx={{ mb: 1.5, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {p.trim()}
                  </Typography>
                ))}
            </Section>

            {/* 3. Alert Details */}
            <Section title="Alert Details">
              <KV k="Source" v={report.alertDetails.source} />
              <KV k="Severity" v={report.alertDetails.severity} />
              <KV k="Status" v={report.alertDetails.status} />
              <KV k="Assignee" v={report.alertDetails.assignee || 'Unassigned'} />
              <KV k="Created" v={report.alertDetails.created} />
              <KV k="Last edited" v={report.alertDetails.edited} />
              <KV k="TLP" v={report.alertDetails.tlp} />
              <KV k="PAP" v={report.alertDetails.pap} />
              {report.alertDetails.labels && report.alertDetails.labels.length > 0 && (
                <KV
                  k="Labels"
                  v={
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {report.alertDetails.labels.map((l, i) => (
                        <Chip key={i} size="small" label={l} sx={{ height: 20, fontSize: 11 }} />
                      ))}
                    </Box>
                  }
                />
              )}
              {report.alertDetails.references && report.alertDetails.references.length > 0 && (
                <KV
                  k="References"
                  v={
                    <Box>
                      {report.alertDetails.references.map((r, i) => (
                        <Box key={i} sx={{ fontSize: 12, fontFamily: 'monospace' }}>{r}</Box>
                      ))}
                    </Box>
                  }
                />
              )}
              {report.alertDetails.customFields && Object.keys(report.alertDetails.customFields).length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 13, mb: 0.5 }}>Custom fields</Typography>
                  {Object.entries(report.alertDetails.customFields).map(([k, v]) => (
                    <KV key={k} k={k} v={String(v)} />
                  ))}
                </Box>
              )}
            </Section>

            {/* 4. Tasks */}
            <Section title={`Tasks (${report.tasks.length})`}>
              {report.tasks.length === 0 && (
                <Typography sx={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
                  No tasks were created for this incident.
                </Typography>
              )}
              {report.tasks.map((t, i) => (
                <Box
                  key={i}
                  sx={{
                    py: 1,
                    borderBottom: '1px solid hsl(var(--border))',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                  }}
                >
                  <Box
                    sx={{
                      width: 14,
                      height: 14,
                      borderRadius: '3px',
                      border: '1.5px solid hsl(var(--border))',
                      bgcolor: t.completed ? 'hsl(var(--primary))' : 'transparent',
                      flexShrink: 0,
                    }}
                  />
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 500, textDecoration: t.completed ? 'line-through' : 'none' }}>
                      {t.title}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                      {[t.category, t.assignee && `@${t.assignee}`, t.dueDate && `due ${t.dueDate}`, t.completedAt && `completed ${formatTs(t.completedAt)}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Section>

            {/* 5. Event Analysis */}
            <Section title="Event Analysis">
              {report.eventAnalysis
                .split(/\n{2,}/)
                .map((p, i) => (
                  <Typography key={i} sx={{ mb: 1.5, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {p.trim()}
                  </Typography>
                ))}
            </Section>

            {/* 6. IOCs */}
            <Section title={`Indicators of Compromise (${report.iocs.length})`}>
              {report.iocs.length === 0 && (
                <Typography sx={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
                  No indicators of compromise were identified.
                </Typography>
              )}
              {report.iocs.length > 0 && (
                <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <Box component="thead">
                    <Box component="tr">
                      {['Type', 'Value', 'First seen', 'Last seen'].map(h => (
                        <Box
                          key={h}
                          component="th"
                          sx={{
                            textAlign: 'left',
                            p: 1,
                            borderBottom: '1px solid hsl(var(--border))',
                            color: 'hsl(var(--muted-foreground))',
                            fontWeight: 600,
                          }}
                        >
                          {h}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                  <Box component="tbody">
                    {report.iocs.map((ioc, i) => (
                      <Box component="tr" key={i}>
                        <Box component="td" sx={{ p: 1, borderBottom: '1px solid hsl(var(--border))', fontFamily: 'monospace' }}>{ioc.type}</Box>
                        <Box component="td" sx={{ p: 1, borderBottom: '1px solid hsl(var(--border))', fontFamily: 'monospace', wordBreak: 'break-all' }}>{ioc.value}</Box>
                        <Box component="td" sx={{ p: 1, borderBottom: '1px solid hsl(var(--border))', whiteSpace: 'nowrap' }}>{ioc.first_seen ? String(ioc.first_seen) : '—'}</Box>
                        <Box component="td" sx={{ p: 1, borderBottom: '1px solid hsl(var(--border))', whiteSpace: 'nowrap' }}>{ioc.last_seen ? String(ioc.last_seen) : '—'}</Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </Section>

            {/* 7. Full Timeline */}
            <Section title={`Full Timeline (${report.timeline.length})`}>
              {report.timeline.length === 0 && (
                <Typography sx={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
                  No timeline events recorded.
                </Typography>
              )}
              {report.timeline.map((entry, i) => (
                <Box key={i} className="report-timeline-row" sx={{ display: 'flex', gap: 2, py: 0.75, borderBottom: '1px solid hsl(var(--border))' }}>
                  <Box sx={{ minWidth: 160, fontSize: 11, fontFamily: 'monospace', color: 'hsl(var(--muted-foreground))' }}>
                    {formatTs(entry.timestamp)}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                      {entry.label}
                      {entry.source && (
                        <Box component="span" sx={{ ml: 1, fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>
                          [{entry.source}]
                        </Box>
                      )}
                    </Typography>
                    {entry.detail && (
                      <Typography sx={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', whiteSpace: 'pre-wrap' }}>
                        {entry.detail}
                      </Typography>
                    )}
                  </Box>
                </Box>
              ))}
            </Section>

            <Box sx={{ mt: 5, pt: 2, borderTop: '1px solid hsl(var(--border))', fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
              Generated by Shuffle on {formatTs(report.generatedAt)}
              {report.generatedBy ? ` · ${report.generatedBy}` : ''}
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default IncidentReportDialog;
