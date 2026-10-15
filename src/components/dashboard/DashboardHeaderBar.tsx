/**
 * Dashboard header bar — view picker, time range, mode, granularity and
 * refresh. Shared by the signed-in dashboard and the signed-out sample
 * dashboard so both always look and behave the same.
 */
import { forwardRef } from 'react';
import { Box, FormControl, IconButton, InputLabel, ListSubheader, MenuItem, Select, Tooltip } from '@mui/material';
import { RefreshCw as RefreshIcon, X as CloseIcon } from 'lucide-react';
import { AUTOMATION_RANGE_OPTIONS, TAB_LABELS, type DashboardTab } from '@/Shuffle-Core';
import { SegmentedControl } from '@/components/ui/segmented-control';

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
}

const subheaderSx = { fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 2.4, color: 'hsl(var(--muted-foreground))', bgcolor: 'transparent' } as const;

const fmtShort = (ms: number) => {
  const d = new Date(ms);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${M} ${d.getDate()}`;
};

export const DashboardHeaderBar = forwardRef<HTMLDivElement, DashboardHeaderBarProps>(function DashboardHeaderBar(
  { tab, onTabChange, days, onDaysChange, customRange, onClearCustomRange, mode, onModeChange, gran, onGranChange, onRefresh },
  ref,
) {
  const customRangeLabel = customRange ? `${fmtShort(customRange.fromMs)} → ${fmtShort(customRange.toMs)}` : null;
  const isAutomation = tab === 'automation';
  return (
    <Box ref={ref} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 36 }}>
        <FormControl size="small" sx={{ minWidth: 210 }}>
          <Select
            value={tab}
            onChange={(e) => onTabChange(e.target.value as DashboardTab)}
            inputProps={{ 'aria-label': 'Dashboard view' }}
            sx={{
              height: 36,
              borderRadius: '999px',
              fontSize: '0.85rem',
              fontWeight: 600,
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
          </Select>
        </FormControl>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: customRangeLabel ? 220 : 130 }}>
          <InputLabel>Last</InputLabel>
          <Select
            label="Last"
            value={customRange ? '__custom__' : days}
            onChange={(e) => {
              const v = String(e.target.value);
              if (v === '__custom__') return;
              onClearCustomRange();
              onDaysChange(v);
            }}
            renderValue={() => customRangeLabel ?? (AUTOMATION_RANGE_OPTIONS.find(o => o.value === days)?.label ?? `${days} days`)}
            endAdornment={customRange ? (
              <IconButton
                size="small"
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); onClearCustomRange(); }}
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
        {isAutomation && (
          <Box sx={{ alignSelf: 'flex-end' }}>
            <SegmentedControl
              ariaLabel="Mode"
              value={mode}
              onChange={(v) => onModeChange(v as 'workflows' | 'apps')}
              options={[
                { value: 'workflows', label: 'Workflows' },
                { value: 'apps', label: 'Apps' },
              ]}
            />
          </Box>
        )}
        <Box sx={{ alignSelf: 'flex-end' }}>
          <SegmentedControl
            ariaLabel="Granularity"
            value={gran}
            onChange={(v) => onGranChange(v as 'daily' | 'monthly')}
            options={[{ value: 'daily', label: 'Daily' }, { value: 'monthly', label: 'Monthly' }]}
          />
        </Box>
        <Tooltip title="Refresh">
          <IconButton
            size="small"
            onClick={onRefresh}
            sx={{ color: 'hsl(var(--muted-foreground))', alignSelf: 'flex-end', width: 36, height: 36, borderRadius: '8px' }}
          >
            <RefreshIcon size={16} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
});

export default DashboardHeaderBar;
