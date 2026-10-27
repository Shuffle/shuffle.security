/**
 * ExportReportDialog — lets the user pick which report sections to include
 * in the PDF export. All range-scoped sections use the caller's current time
 * range.
 *
 * Shared surface: the dashboards use it through CombinedDashboard, and any
 * other Shuffle-Core area (or host app embedding the library) can render it
 * with its own button and its own PDF assembly step.
 */
import { useState } from 'react';
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Typography } from '@mui/material';
import { visibleReportSections, type ReportSectionId } from './exportReport';

export const DEFAULT_REPORT_SECTIONS: ReportSectionId[] = ['dashboards', 'tenant'];

export interface ExportReportDialogProps {
  open: boolean;
  /** Range printed in the header. Defaults to "the selected range". */
  rangeLabel?: string;
  /** Show the sub-tenants section. Defaults to false. */
  hasChildTenants?: boolean;
  /** Sections ticked when the dialog opens. Defaults to DEFAULT_REPORT_SECTIONS. */
  initialSections?: ReportSectionId[];
  onClose: () => void;
  onExport?: (sections: ReportSectionId[]) => void;
  onSubmit?: (sections: ReportSectionId[]) => void;
}

const ExportReportDialog = ({
  open,
  rangeLabel = '',
  hasChildTenants = false,
  initialSections,
  onClose,
  onExport,
  onSubmit,
}: ExportReportDialogProps) => {
  const sections = visibleReportSections(hasChildTenants);
  const [selected, setSelected] = useState<ReportSectionId[]>(initialSections ?? DEFAULT_REPORT_SECTIONS);
  const toggle = (id: ReportSectionId) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const allSelected = sections.every((s) => selected.includes(s.id));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '12px', border: '1px solid hsl(var(--border))' } }}>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '1.05rem' }}>Export report</Typography>
        <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', mt: 0.5 }}>
          Choose what to include. Time-based sections use {rangeLabel ? `the current range: ${rangeLabel}.` : 'the selected range.'}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
          <Button size="small" onClick={() => setSelected(allSelected ? [] : sections.map((s) => s.id))} sx={{ textTransform: 'none' }}>
            {allSelected ? 'Clear all' : 'Select all'}
          </Button>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {sections.map((s) => (
            <FormControlLabel
              key={s.id}
              sx={{ alignItems: 'flex-start', m: 0, py: 0.75, px: 1, borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
              control={<Checkbox size="small" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} sx={{ p: 0.5, mr: 1 }} />}
              label={
                <Box sx={{ pt: 0.25 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    {s.label}
                    {s.rangeScoped && (
                      <Typography component="span" sx={{ fontSize: '0.72rem', fontWeight: 500, color: 'hsl(var(--muted-foreground))', ml: 1 }}>
                        Uses time range
                      </Typography>
                    )}
                  </Typography>
                  <Typography sx={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))' }}>{s.description}</Typography>
                </Box>
              }
            />
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ height: 36, textTransform: 'none' }}>Cancel</Button>
        <Button
          variant="contained"
          disabled={selected.length === 0}
          onClick={() => {
            if (typeof onExport === 'function') {
              onExport(selected);
            } else if (typeof onSubmit === 'function') {
              onSubmit(selected);
            }
          }}
          sx={{ height: 36, textTransform: 'none', boxShadow: 'none' }}
        >
          Generate PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExportReportDialog;
