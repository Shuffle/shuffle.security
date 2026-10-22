import * as React from 'react';
import { Box, FormControl, MenuItem, Select, Typography } from '@mui/material';
import { DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';

/**
 * Shared datastore category dropdown. Used by the "Automation for X" dialog
 * and the Incident Routing Rules editor so both stay identical.
 */
export interface DatastoreCategoryOption {
  category: string;
  singular: string;
  plural: string;
}

export const DATASTORE_CATEGORY_OPTIONS: DatastoreCategoryOption[] = [
  { category: DATASTORE_CATEGORIES.INCIDENTS, singular: 'incident', plural: 'incidents' },
  { category: DATASTORE_CATEGORIES.VULNERABILITIES, singular: 'vulnerability', plural: 'vulnerabilities' },
  { category: DATASTORE_CATEGORIES.INFRASTRUCTURE, singular: 'sensor', plural: 'sensors' },
  { category: DATASTORE_CATEGORIES.ASSETS, singular: 'asset', plural: 'assets' },
  { category: DATASTORE_CATEGORIES.PACKAGES, singular: 'package', plural: 'packages' },
  { category: DATASTORE_CATEGORIES.SOFTWARE, singular: 'software', plural: 'software' },
  { category: DATASTORE_CATEGORIES.USERS, singular: 'user', plural: 'users' },
];

export interface DatastoreCategorySelectProps {
  value: string;
  onChange: (category: string) => void;
  options?: DatastoreCategoryOption[];
  /** 'when' renders "An X is edited"; 'category' renders "Xs (category)". */
  labelMode?: 'when' | 'category';
  /** Status text on the right of each option. */
  getStatus?: (category: string) => string;
  /** Whether the option's dot is lit. */
  isActive?: (category: string) => boolean;
}

export const DatastoreCategorySelect: React.FC<DatastoreCategorySelectProps> = ({
  value,
  onChange,
  options = DATASTORE_CATEGORY_OPTIONS,
  labelMode = 'category',
  getStatus,
  isActive,
}) => (
  <FormControl fullWidth size="small">
    <Select
      value={value}
      onChange={(e) => {
        const next = String(e.target.value);
        if (next !== value) onChange(next);
      }}
      sx={{
        bgcolor: 'hsl(var(--muted) / 0.4)',
        fontSize: '0.95rem',
        '& .MuiSelect-select': { py: 1.5, px: 2 },
        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--border))' },
      }}
      MenuProps={{
        PaperProps: {
          sx: { bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' },
        },
      }}
    >
      {options.map((opt) => {
        const active = isActive ? isActive(opt.category) : false;
        const status = getStatus ? getStatus(opt.category) : '';
        return (
          <MenuItem key={opt.category} value={opt.category}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  flexShrink: 0,
                  bgcolor: active ? 'hsl(var(--severity-low))' : 'hsl(var(--muted-foreground) / 0.5)',
                }}
              />
              <Typography sx={{ fontSize: '0.95rem', flex: 1 }}>
                {labelMode === 'when'
                  ? `A${/^[aeiou]/i.test(opt.singular) ? 'n' : ''} ${opt.singular} is edited`
                  : `${opt.plural.charAt(0).toUpperCase() + opt.plural.slice(1)} (${opt.category})`}
              </Typography>
              {status && (
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                  {status}
                </Typography>
              )}
            </Box>
          </MenuItem>
        );
      })}
    </Select>
  </FormControl>
);

export default DatastoreCategorySelect;
