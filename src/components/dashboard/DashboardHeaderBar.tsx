/**
 * Dashboard header bar — view picker, time range, mode, granularity and
 * refresh. Shared by the signed-in dashboard and the signed-out sample
 * dashboard so both always look and behave the same.
 */
import { forwardRef } from 'react';
import { Box, FormControl, IconButton, InputLabel, ListSubheader, MenuItem, Select, Tooltip } from '@mui/material';
import { RefreshCw as RefreshIcon, X as CloseIcon, Download as DownloadIcon, Loader2 } from 'lucide-react';
import {
  AUTOMATION_RANGE_OPTIONS,
  TAB_LABELS,
  isCustomDashboardTab,
  toCustomDashboardTab,
  type CustomDashboardConfig,
  type DashboardTab,
} from '@/Shuffle-Core';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useIsMobile } from '@/hooks/use-mobile';

export interface DashboardHeaderBarProps {
  tab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  days: string;
  onDaysChange: (days: string) => void;
  customRange: { fromMs: number; toMs: number } | null;
  onClearCustomRange: () => void;
  mode: 'workflows' | 'apps';
  onModeChange: (mode: 'workflows' | 'apps') => void;
  gran: 'daily' | 'monthly';
  onGranChange: (gran: 'daily' | 'monthly') => void;
  onRefresh: () => void;
  /** When set, shows the Export report (PDF) button next to Refresh. */
  onExport?: () => void;
  exporting?: boolean;
  exportStatus?: string;
  customDashboards?: CustomDashboardConfig[];
  onCreateDashboard?: () => void;
}

const subheaderSx = {
  fontSize: '0.68rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  lineHeight: 2.4,
  color: 'hsl(var(--muted-foreground))',
  bgcolor: 'transparent',
} as const;

const fmtShort = (ms: number) => {
  const d = new Date(ms);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${M} ${d.getDate()}`;
};

export const DashboardHeaderBar = forwardRef<HTMLDivElement, DashboardHeaderBarProps>(function DashboardHeaderBar(
  {
    tab,
    onTabChange,
    days,
    onDaysChange,
    customRange,
    onClearCustomRange,
    mode,
    onModeChange,
    gran,
    onGranChange,
    onRefresh,
    onExport,
    exporting = false,
    exportStatus,
    customDashboards = [],
    onCreateDashboard,
  },
  ref,
) {
  const isMobile = useIsMobile();
  const daysStr = String(days ?? '30');
  const customRangeLabel = customRange ? `${fmtShort(customRange.fromMs)} → ${fmtShort(customRange.toMs)}` : null;
  const isAutomation = tab === 'automation';
  const hasMatchingCustom =
    isCustomDashboardTab(tab) && customDashboards.some((d) => toCustomDashboardTab(d.id) === tab);
  const selectValue = isCustomDashboardTab(tab) && !hasMatchingCustom ? 'security' : tab;

  return (
    <Box ref={ref} sx={{ display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'space-between', gap: isMobile ? 1 : 2, flexWrap: isMobile ? 'nowrap' : 'wrap' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', minHeight: isMobile ? 32 : 36, minWidth: 0 }}>
        <FormControl size="small" sx={{ minWidth: isMobile ? 0 : 210, maxWidth: isMobile ? 172 : 'none' }}>
          <Select
            value={selectValue}
            onChange={(e) => {
              const val = String(e.target.value);
              if (val === '__new_custom__') {
                onCreateDashboard?.();
                return;
              }
              onTabChange?.(val as DashboardTab);
            }}
            inputProps={{ 'aria-label': 'Dashboard view' }}
            sx={{
              height: isMobile ? 32 : 36,
              borderRadius: '999px',
              fontSize: isMobile ? '0.78rem' : '0.85rem',
              fontWeight: 600,
              '& .MuiSelect-select': {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--border))' },
            }}
            MenuProps={{ PaperProps: { sx: { mt: 0.5, borderRadius: '10px' } } }}
          >
            <ListSubheader sx={subheaderSx}>Security</ListSubheader>
            <MenuItem value="security">{TAB_LABELS.security}</MenuItem>
            <MenuItem value="vulnerabilities">{TAB_LABELS.vulnerabilities}</MenuItem>
            <ListSubheader sx={subheaderSx}>Automation</ListSubheader>
            <MenuItem value="automation">{TAB_LABELS.automation}</MenuItem>
            <MenuItem value="agents">{TAB_LABELS.agents}</MenuItem>
            {(customDashboards.length > 0 || onCreateDashboard) && (
              <ListSubheader sx={subheaderSx}>Custom</ListSubheader>
            )}
            {customDashboards.map((d) => (
              <MenuItem key={d.id} value={toCustomDashboardTab(d.id)}>
                {d.name}
              </MenuItem>
            ))}
            {onCreateDashboard && (
              <MenuItem
                value="__new_custom__"
                sx={{ fontWeight: 600, color: 'hsl(var(--primary))' }}
              >
                + New custom dashboard...
              </MenuItem>
            )}
          </Select>
        </FormControl>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: isMobile ? 0.5 : 1.5, flexWrap: isMobile ? 'nowrap' : 'wrap', minWidth: 0 }}>
        <FormControl size="small" sx={{ minWidth: customRangeLabel ? (isMobile ? 148 : 220) : (isMobile ? 92 : 130) }}>
          <InputLabel>Last</InputLabel>
          <Select
            label="Last"
            sx={{ height: isMobile ? 32 : 40 }}
            value={customRange ? '__custom__' : daysStr}
            onChange={(e) => {
              const v = String(e.target.value);
              if (v === '__custom__') return;
              onClearCustomRange?.();
              onDaysChange?.(v);
            }}
            renderValue={() => customRangeLabel ?? (AUTOMATION_RANGE_OPTIONS.find(o => o.value === daysStr)?.label ?? `${daysStr} days`)}
            endAdornment={customRange ? (
              <IconButton
                size="small"
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); onClearCustomRange?.(); }}
                sx={{ mr: 3, p: 0.25, color: 'hsl(var(--muted-foreground))' }}
                aria-label="Clear custom range"
              >
                <CloseIcon size={14} />
              </IconButton>
            ) : undefined}
          >
            {customRangeLabel && (
              <MenuItem value="__custom__" disabled>{customRangeLabel} (custom)</MenuItem>
            )}
            {AUTOMATION_RANGE_OPTIONS.map(o => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {isMobile ? null : isAutomation && (
          <Box sx={{ alignSelf: 'flex-end' }}>
            <SegmentedControl
              ariaLabel="Mode"
              value={mode}
              onChange={(v) => onModeChange?.(v as 'workflows' | 'apps')}
              options={[
                { value: 'workflows', label: 'Workflows' },
                { value: 'apps', label: 'Apps' },
              ]}
            />
          </Box>
        )}
        {!isMobile && (
          <Box sx={{ alignSelf: 'flex-end' }}>
            <SegmentedControl
              ariaLabel="Granularity"
              value={gran}
              onChange={(v) => onGranChange?.(v as 'daily' | 'monthly')}
              options={[{ value: 'daily', label: 'Daily' }, { value: 'monthly', label: 'Monthly' }]}
            />
          </Box>
        )}
        <Tooltip title="Refresh">
          <IconButton
            size="small"
            onClick={() => onRefresh?.()}
            sx={{ color: 'hsl(var(--muted-foreground))', alignSelf: 'flex-end', width: isMobile ? 32 : 36, height: isMobile ? 32 : 36, borderRadius: '8px' }}
          >
            <RefreshIcon size={16} />
          </IconButton>
        </Tooltip>
        {onExport && (
          <Tooltip title={exporting ? (exportStatus || 'Generating PDF...') : 'Export Tenant Report'}>
            <span style={{ alignSelf: 'flex-end' }}>
              <IconButton
                size="small"
                onClick={() => onExport()}
                disabled={exporting}
                aria-label="Export Tenant Report"
                sx={{ color: 'hsl(var(--muted-foreground))', width: isMobile ? 32 : 36, height: isMobile ? 32 : 36, borderRadius: '8px' }}
              >
                {exporting ? <Loader2 size={16} className="animate-spin" /> : <DownloadIcon size={16} />}
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
});

export default DashboardHeaderBar;
