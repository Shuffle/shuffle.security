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
  /** Inline label rendered inside the control (compact mode) instead of above it. */
  label?: string;
  /**
   * Compact 36px control sized to sit in a toolbar next to a button. The
   * closed control shows only the plural ("Incidents"); the full option text
   * stays in the menu.
   */
  compact?: boolean;
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export const DatastoreCategorySelect: React.FC<DatastoreCategorySelectProps> = ({
  value,
  onChange,
  options = DATASTORE_CATEGORY_OPTIONS,
  labelMode = 'category',
  getStatus,
  isActive,
  label,
  compact = false,
}) => {
  const selectValue = value;
  const handleChange = (next: string) => {
    if (next !== value) onChange(next);
  };
  const selectedOption = options.find((opt) => opt.category === value);

  const menuItems = options.map((opt) => {
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
              : `${capitalize(opt.plural)} (${opt.category})`}
          </Typography>
          {status && (
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              {status}
            </Typography>
          )}
        </Box>
      </MenuItem>
    );
  });

  if (compact) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          height: 36,
          flexShrink: 0,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'hsl(var(--border))',
          bgcolor: 'hsl(var(--muted) / 0.4)',
          overflow: 'hidden',
          '&:hover': { borderColor: 'hsl(var(--primary))' },
        }}
      >
        {label && (
          <Typography
            component="span"
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: 1.25,
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'text.secondary',
              whiteSpace: 'nowrap',
              borderRight: '1px solid',
              borderColor: 'hsl(var(--border))',
            }}
          >
            {label}
          </Typography>
        )}
        <FormControl size="small" sx={{ minWidth: 0 }}>
          <Select
            value={selectValue}
            onChange={(e) => handleChange(String(e.target.value))}
            variant="standard"
            disableUnderline
            renderValue={() => (selectedOption ? capitalize(selectedOption.plural) : value)}
            sx={{
              fontSize: '0.8rem',
              color: 'text.primary',
              '& .MuiSelect-select': {
                py: 0,
                px: 1.25,
                minHeight: 34,
                display: 'flex',
                alignItems: 'center',
              },
              '& .MuiSelect-icon': { right: 2, width: 16, height: 16, color: 'text.secondary' },
            }}
            MenuProps={{
              PaperProps: {
                sx: { bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' },
              },
            }}
          >
            {menuItems}
          </Select>
        </FormControl>
      </Box>
    );
  }

  return (
    <FormControl fullWidth size="small">
      <Select
        value={selectValue}
        onChange={(e) => handleChange(String(e.target.value))}
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
        {menuItems}
      </Select>
    </FormControl>
  );
};

export default DatastoreCategorySelect;
