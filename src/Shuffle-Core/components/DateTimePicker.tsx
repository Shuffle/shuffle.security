import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Popover,
  IconButton,
  type SxProps,
  type Theme,
} from '@mui/material';
import dayjs, { Dayjs } from 'dayjs';

export type DateTimePickerMode = 'datetime' | 'date' | 'time';

export interface DateTimePreset {
  label: string;
  getValue: () => Dayjs;
}

export interface DateTimePickerProps {
  /** Mode: full datetime, date only, or time only. Defaults to 'datetime'. */
  mode?: DateTimePickerMode;
  /** Label for the text field input */
  label?: string;
  /** Placeholder for text input */
  placeholder?: string;
  /** Current value as Dayjs, Date, ISO string, timestamp number, or null */
  value: Dayjs | Date | string | number | null | undefined;
  /** Callback fired when value changes */
  onChange: (value: Dayjs | null, formattedStr?: string) => void;
  /** Custom display and parsing format */
  format?: string;
  /** Use 12-hour AM/PM format (defaults to false / 24h engineering time) */
  ampm?: boolean;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether the field is read-only */
  readOnly?: boolean;
  /** Whether input shows error state */
  error?: boolean;
  /** Helper text displayed below input */
  helperText?: React.ReactNode;
  /** Size variant: 'small' or 'medium' */
  size?: 'small' | 'medium';
  /** Full width text field */
  fullWidth?: boolean;
  /** Custom presets array, or boolean to toggle default presets (defaults to true) */
  presets?: boolean | DateTimePreset[];
  /** Minimum selectable date */
  minDate?: Dayjs | Date | string;
  /** Maximum selectable date */
  maxDate?: Dayjs | Date | string;
  /** Additional SX styles for the root input */
  sx?: SxProps<Theme>;
  /** Additional SX styles for the popover surface */
  popoverSx?: SxProps<Theme>;
  /** Passthrough props for MUI TextField slot */
  slotProps?: {
    textField?: Record<string, any>;
  };
  /** Custom trigger render function (e.g. for compact toolbar buttons, chips, badges) */
  renderTrigger?: (props: {
    value: Dayjs | null;
    formattedValue: string;
    open: boolean;
    onClick: (e: React.MouseEvent<HTMLElement>) => void;
    onClear: (e?: React.MouseEvent) => void;
  }) => React.ReactNode;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * Standard relative presets tailored for SecOps, logs, and workflow debugging.
 */
const getDefaultPresets = (mode: DateTimePickerMode): DateTimePreset[] => {
  if (mode === 'date') {
    return [
      { label: 'Today', getValue: () => dayjs().startOf('day') },
      { label: 'Yesterday', getValue: () => dayjs().subtract(1, 'day').startOf('day') },
      { label: '-7d', getValue: () => dayjs().subtract(7, 'day').startOf('day') },
      { label: '-30d', getValue: () => dayjs().subtract(30, 'day').startOf('day') },
    ];
  }
  if (mode === 'time') {
    return [
      { label: 'Now', getValue: () => dayjs() },
      { label: 'Start of Day', getValue: () => dayjs().startOf('day') },
      { label: 'Noon', getValue: () => dayjs().hour(12).minute(0).second(0) },
      { label: 'End of Day', getValue: () => dayjs().hour(23).minute(59).second(59) },
    ];
  }
  // mode === 'datetime'
  return [
    { label: 'Now', getValue: () => dayjs() },
    { label: '-15m', getValue: () => dayjs().subtract(15, 'minute') },
    { label: '-1h', getValue: () => dayjs().subtract(1, 'hour') },
    { label: '-24h', getValue: () => dayjs().subtract(24, 'hour') },
    { label: '-7d', getValue: () => dayjs().subtract(7, 'day') },
    { label: 'Today', getValue: () => dayjs().startOf('day') },
  ];
};

/**
 * Coerce any accepted value prop into a valid Dayjs object or null.
 */
const toDayjs = (val: Dayjs | Date | string | number | null | undefined): Dayjs | null => {
  if (!val) return null;
  if (dayjs.isDayjs(val)) {
    return val.isValid() ? val : null;
  }
  const parsed = dayjs(val);
  return parsed.isValid() ? parsed : null;
};

/**
 * Lightweight, zero-dependency, highly extendible DateTimePicker for Shuffle-Core.
 * Completely replaces @mui/x-date-pickers and AdapterDayjs.
 */
export const DateTimePicker: React.FC<DateTimePickerProps> = ({
  mode = 'datetime',
  label,
  placeholder,
  value,
  onChange,
  format: customFormat,
  ampm = false,
  disabled = false,
  readOnly = false,
  error = false,
  helperText,
  size = 'small',
  fullWidth = false,
  presets = true,
  minDate,
  maxDate,
  sx,
  popoverSx,
  slotProps,
  renderTrigger,
}) => {
  const defaultFormat = useMemo(() => {
    if (customFormat) return customFormat;
    if (mode === 'date') return 'YYYY-MM-DD';
    if (mode === 'time') return ampm ? 'hh:mm:ss A' : 'HH:mm:ss';
    return ampm ? 'YYYY-MM-DD hh:mm:ss A' : 'YYYY-MM-DD HH:mm:ss';
  }, [customFormat, mode, ampm]);

  const parsedValue = useMemo(() => toDayjs(value), [value]);

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  // Active viewing month and year for calendar navigation
  const [viewDate, setViewDate] = useState<Dayjs>(() => parsedValue || dayjs());

  // Text representation in input field
  const [textInput, setTextInput] = useState<string>(() =>
    parsedValue ? parsedValue.format(defaultFormat) : ''
  );

  // Synchronize internal text whenever parsedValue changes externally
  useEffect(() => {
    setTextInput(parsedValue ? parsedValue.format(defaultFormat) : '');
  }, [parsedValue, defaultFormat]);

  // When popover opens, sync view date to current value or today
  const handleOpenPopover = (event: React.MouseEvent<HTMLElement>) => {
    if (disabled || readOnly) return;
    setViewDate(parsedValue || dayjs());
    setAnchorEl(event.currentTarget);
  };

  const handleClosePopover = () => {
    setAnchorEl(null);
  };

  const minDayjs = useMemo(() => toDayjs(minDate), [minDate]);
  const maxDayjs = useMemo(() => toDayjs(maxDate), [maxDate]);

  const isDateDisabled = useCallback(
    (d: Dayjs) => {
      if (minDayjs && d.isBefore(minDayjs, 'day')) return true;
      if (maxDayjs && d.isAfter(maxDayjs, 'day')) return true;
      return false;
    },
    [minDayjs, maxDayjs]
  );

  // Manual typing handler
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setTextInput(raw);

    if (!raw.trim()) {
      onChange(null, '');
      return;
    }

    const candidate = dayjs(raw);
    if (candidate.isValid()) {
      onChange(candidate, candidate.format(defaultFormat));
      setViewDate(candidate);
    }
  };

  const handleClear = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTextInput('');
    onChange(null, '');
  };

  const handleSelectDay = (dayNumber: number) => {
    const base = parsedValue || dayjs();
    const updated = viewDate
      .date(dayNumber)
      .hour(base.hour())
      .minute(base.minute())
      .second(base.second());

    onChange(updated, updated.format(defaultFormat));
    if (mode === 'date') {
      handleClosePopover();
    }
  };

  const handlePresetSelect = (preset: DateTimePreset) => {
    const val = preset.getValue();
    onChange(val, val.format(defaultFormat));
    setViewDate(val);
  };

  // Time components adjustment
  const handleTimePartChange = (part: 'hour' | 'minute' | 'second', newNum: number) => {
    const base = parsedValue || dayjs();
    const updated = base.set(part, newNum);
    onChange(updated, updated.format(defaultFormat));
  };

  // Calendar grid calculations
  const daysInCurrentMonth = viewDate.daysInMonth();
  const firstDayOfMonthWeekday = viewDate.startOf('month').day(); // 0 = Sunday
  const prevMonthDaysCount = viewDate.subtract(1, 'month').daysInMonth();

  const prevMonthCells = Array.from(
    { length: firstDayOfMonthWeekday },
    (_, i) => prevMonthDaysCount - firstDayOfMonthWeekday + 1 + i
  );

  const currentMonthCells = Array.from(
    { length: daysInCurrentMonth },
    (_, i) => i + 1
  );

  const totalCellsSoFar = prevMonthCells.length + currentMonthCells.length;
  const nextMonthCellsNeeded = totalCellsSoFar % 7 === 0 ? 0 : 7 - (totalCellsSoFar % 7);
  const nextMonthCells = Array.from(
    { length: nextMonthCellsNeeded },
    (_, i) => i + 1
  );

  // Active presets list
  const activePresets = useMemo(() => {
    if (presets === false) return [];
    if (Array.isArray(presets)) return presets;
    return getDefaultPresets(mode);
  }, [presets, mode]);

  const inputSize = slotProps?.textField?.size || size;
  const inputSx = slotProps?.textField?.sx || sx;
  const textFieldSlot = slotProps?.textField || {};

  return (
    <>
      {renderTrigger ? (
        renderTrigger({
          value: parsedValue,
          formattedValue: textInput,
          open,
          onClick: handleOpenPopover,
          onClear: handleClear,
        })
      ) : (
        <TextField
          label={label}
          placeholder={placeholder || defaultFormat}
          value={textInput}
          onChange={handleTextChange}
          onClick={handleOpenPopover}
          disabled={disabled}
          size={inputSize}
          fullWidth={fullWidth}
          error={error}
          helperText={helperText}
          InputProps={{
            readOnly,
            endAdornment: textInput && !disabled && !readOnly ? (
              <IconButton
                size="small"
                onClick={handleClear}
                title="Clear date"
                sx={{
                  p: 0.4,
                  mr: -0.5,
                  color: 'text.secondary',
                  fontSize: '0.85rem',
                  lineHeight: 1,
                  '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
                }}
              >
                ×
              </IconButton>
            ) : null,
            ...(textFieldSlot.InputProps || {}),
          }}
          InputLabelProps={{ shrink: true, ...(textFieldSlot.InputLabelProps || {}) }}
          sx={{
            minWidth: mode === 'time' ? 140 : mode === 'date' ? 170 : 210,
            '& .MuiInputBase-root': {
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
            },
            '& .MuiInputBase-input': {
              cursor: 'pointer',
              py: inputSize === 'small' ? '8.5px' : '12px',
            },
            ...inputSx,
          }}
          {...textFieldSlot}
        />
      )}

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClosePopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        sx={{ zIndex: 10025 }}
        PaperProps={{
          sx: {
            p: 2.5,
            width: mode === 'time' ? 260 : 340,
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '10px',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
            ...popoverSx,
          },
        }}
      >
        {/* Presets Row */}
        {activePresets.length > 0 && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0.8,
              mb: 2,
              pb: 1.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            {activePresets.map((p) => (
              <Button
                key={p.label}
                size="small"
                variant="outlined"
                onClick={() => handlePresetSelect(p)}
                sx={{
                  py: 0.35,
                  px: 1.2,
                  fontSize: '0.72rem',
                  fontWeight: 500,
                  textTransform: 'none',
                  borderRadius: '6px',
                  borderColor: 'divider',
                  color: 'text.secondary',
                  bgcolor: 'transparent',
                  '&:hover': {
                    borderColor: 'primary.main',
                    color: 'text.primary',
                    bgcolor: 'action.hover',
                  },
                }}
              >
                {p.label}
              </Button>
            ))}
          </Box>
        )}

        {/* Calendar View (for datetime and date modes) */}
        {mode !== 'time' && (
          <Box>
            {/* Header: Month and Year navigation */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 1.8,
                px: 0.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <IconButton
                  size="small"
                  onClick={() => setViewDate(viewDate.subtract(1, 'year'))}
                  title="Previous Year"
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    '&:hover': { color: 'text.primary', borderColor: 'primary.main', bgcolor: 'action.hover' },
                  }}
                >
                  «
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => setViewDate(viewDate.subtract(1, 'month'))}
                  title="Previous Month"
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    '&:hover': { color: 'text.primary', borderColor: 'primary.main', bgcolor: 'action.hover' },
                  }}
                >
                  ‹
                </IconButton>
              </Box>

              <Typography
                sx={{
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  color: 'text.primary',
                  letterSpacing: '0.01em',
                }}
              >
                {MONTH_NAMES[viewDate.month()]} {viewDate.year()}
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <IconButton
                  size="small"
                  onClick={() => setViewDate(viewDate.add(1, 'month'))}
                  title="Next Month"
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    '&:hover': { color: 'text.primary', borderColor: 'primary.main', bgcolor: 'action.hover' },
                  }}
                >
                  ›
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => setViewDate(viewDate.add(1, 'year'))}
                  title="Next Year"
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    '&:hover': { color: 'text.primary', borderColor: 'primary.main', bgcolor: 'action.hover' },
                  }}
                >
                  »
                </IconButton>
              </Box>
            </Box>

            {/* Weekday headers */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                textAlign: 'center',
                mb: 1,
              }}
            >
              {WEEK_DAYS.map((wd) => (
                <Typography
                  key={wd}
                  variant="caption"
                  sx={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: 'text.secondary',
                    py: 0.3,
                  }}
                >
                  {wd}
                </Typography>
              ))}
            </Box>

            {/* Day Cells Grid */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                rowGap: '6px',
                columnGap: '4px',
              }}
            >
              {/* Previous month trailing days */}
              {prevMonthCells.map((day) => (
                <Box
                  key={`prev-${day}`}
                  sx={{
                    width: 34,
                    height: 34,
                    margin: '0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    color: 'text.disabled',
                    opacity: 0.35,
                  }}
                >
                  {day}
                </Box>
              ))}

              {/* Current month days */}
              {currentMonthCells.map((day) => {
                const cellDate = viewDate.date(day);
                const isSelected =
                  parsedValue &&
                  parsedValue.year() === viewDate.year() &&
                  parsedValue.month() === viewDate.month() &&
                  parsedValue.date() === day;
                const isToday =
                  dayjs().year() === viewDate.year() &&
                  dayjs().month() === viewDate.month() &&
                  dayjs().date() === day;
                const disabledCell = isDateDisabled(cellDate);

                return (
                  <Box
                    key={`cur-${day}`}
                    onClick={() => !disabledCell && handleSelectDay(day)}
                    sx={{
                      width: 34,
                      height: 34,
                      margin: '0 auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.78rem',
                      fontWeight: isSelected || isToday ? 700 : 500,
                      cursor: disabledCell ? 'not-allowed' : 'pointer',
                      borderRadius: '8px',
                      border: isToday && !isSelected ? '1.5px solid' : 'none',
                      borderColor: 'primary.main',
                      bgcolor: isSelected ? 'primary.main' : 'transparent',
                      color: isSelected
                        ? '#FFFFFF'
                        : isToday
                        ? 'primary.main'
                        : disabledCell
                        ? 'text.disabled'
                        : 'text.primary',
                      boxShadow: isSelected ? '0 2px 8px rgba(255, 87, 34, 0.4)' : 'none',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        bgcolor: isSelected
                          ? 'primary.dark'
                          : disabledCell
                          ? 'transparent'
                          : 'action.hover',
                      },
                    }}
                  >
                    {day}
                  </Box>
                );
              })}

              {/* Next month leading days */}
              {nextMonthCells.map((day) => (
                <Box
                  key={`next-${day}`}
                  sx={{
                    width: 34,
                    height: 34,
                    margin: '0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    color: 'text.disabled',
                    opacity: 0.35,
                  }}
                >
                  {day}
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Time Selector (for datetime and time modes) */}
        {mode !== 'date' && (
          <Box
            sx={{
              mt: mode === 'datetime' ? 2 : 0,
              pt: mode === 'datetime' ? 1.5 : 0,
              borderTop: mode === 'datetime' ? '1px solid' : 'none',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Time (24h)
              </Typography>
              <Button
                size="small"
                onClick={() => {
                  const now = dayjs();
                  handleTimePartChange('hour', now.hour());
                  handleTimePartChange('minute', now.minute());
                  handleTimePartChange('second', now.second());
                }}
                sx={{
                  py: 0.2,
                  px: 0.8,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  color: 'primary.main',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                Set to Now
              </Button>
            </Box>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                py: 1,
                px: 1.5,
                borderRadius: '8px',
                bgcolor: (theme) =>
                  theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.04)',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ textAlign: 'center' }}>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={parsedValue ? String(parsedValue.hour()).padStart(2, '0') : '00'}
                  onChange={(e) => {
                    let v = parseInt(e.target.value, 10);
                    if (isNaN(v)) v = 0;
                    if (v < 0) v = 0;
                    if (v > 23) v = 23;
                    handleTimePartChange('hour', v);
                  }}
                  style={{
                    width: 46,
                    height: 32,
                    textAlign: 'center',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                    borderRadius: 6,
                    border: '1px solid rgba(128, 128, 128, 0.25)',
                    background: 'transparent',
                    color: 'inherit',
                    outline: 'none',
                  }}
                />
                <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.3 }}>HH</Typography>
              </Box>

              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'text.secondary', pb: 1.8 }}>:</Typography>

              <Box sx={{ textAlign: 'center' }}>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={parsedValue ? String(parsedValue.minute()).padStart(2, '0') : '00'}
                  onChange={(e) => {
                    let v = parseInt(e.target.value, 10);
                    if (isNaN(v)) v = 0;
                    if (v < 0) v = 0;
                    if (v > 59) v = 59;
                    handleTimePartChange('minute', v);
                  }}
                  style={{
                    width: 46,
                    height: 32,
                    textAlign: 'center',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                    borderRadius: 6,
                    border: '1px solid rgba(128, 128, 128, 0.25)',
                    background: 'transparent',
                    color: 'inherit',
                    outline: 'none',
                  }}
                />
                <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.3 }}>MM</Typography>
              </Box>

              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'text.secondary', pb: 1.8 }}>:</Typography>

              <Box sx={{ textAlign: 'center' }}>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={parsedValue ? String(parsedValue.second()).padStart(2, '0') : '00'}
                  onChange={(e) => {
                    let v = parseInt(e.target.value, 10);
                    if (isNaN(v)) v = 0;
                    if (v < 0) v = 0;
                    if (v > 59) v = 59;
                    handleTimePartChange('second', v);
                  }}
                  style={{
                    width: 46,
                    height: 32,
                    textAlign: 'center',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                    borderRadius: 6,
                    border: '1px solid rgba(128, 128, 128, 0.25)',
                    background: 'transparent',
                    color: 'inherit',
                    outline: 'none',
                  }}
                />
                <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.3 }}>SS</Typography>
              </Box>
            </Box>
          </Box>
        )}

        {/* Footer Actions */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mt: 2,
            pt: 1.5,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Button
            size="small"
            onClick={handleClear}
            sx={{
              py: 0.35,
              px: 1.2,
              fontSize: '0.75rem',
              textTransform: 'none',
              color: 'text.secondary',
              '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
            }}
          >
            Clear
          </Button>

          <Button
            size="small"
            variant="contained"
            onClick={handleClosePopover}
            sx={{
              py: 0.45,
              px: 2,
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: '6px',
              bgcolor: 'primary.main',
              color: '#FFFFFF',
              boxShadow: 'none',
              '&:hover': {
                bgcolor: 'primary.dark',
                boxShadow: 'none',
              },
            }}
          >
            Done
          </Button>
        </Box>
      </Popover>
    </>
  );
};

/** Specialized Date-only picker */
export const DatePicker: React.FC<Omit<DateTimePickerProps, 'mode'>> = (props) => (
  <DateTimePicker mode="date" {...props} />
);

/** Specialized Time-only picker */
export const TimePicker: React.FC<Omit<DateTimePickerProps, 'mode'>> = (props) => (
  <DateTimePicker mode="time" {...props} />
);

export interface DateRangePickerProps {
  startDate: Dayjs | Date | string | number | null | undefined;
  endDate: Dayjs | Date | string | number | null | undefined;
  onRangeChange: (start: Dayjs | null, end: Dayjs | null) => void;
  startLabel?: string;
  endLabel?: string;
  mode?: DateTimePickerMode;
  size?: 'small' | 'medium';
  disabled?: boolean;
  ampm?: boolean;
  sx?: SxProps<Theme>;
}

/** Paired Start/End date and time picker */
export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onRangeChange,
  startLabel = 'From',
  endLabel = 'To',
  mode = 'datetime',
  size = 'small',
  disabled = false,
  ampm = false,
  sx,
}) => {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ...sx }}>
      <DateTimePicker
        mode={mode}
        label={startLabel}
        value={startDate}
        onChange={(val) => onRangeChange(val, toDayjs(endDate))}
        maxDate={toDayjs(endDate) || undefined}
        size={size}
        disabled={disabled}
        ampm={ampm}
      />
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
        to
      </Typography>
      <DateTimePicker
        mode={mode}
        label={endLabel}
        value={endDate}
        onChange={(val) => onRangeChange(toDayjs(startDate), val)}
        minDate={toDayjs(startDate) || undefined}
        size={size}
        disabled={disabled}
        ampm={ampm}
      />
    </Box>
  );
};

/**
 * Drop-in backward-compatibility shims for legacy @mui/x-date-pickers usages
 * in consuming packages (e.g. Shaffuru).
 */
export const LocalizationProvider: React.FC<{
  children?: React.ReactNode;
  dateAdapter?: any;
  [key: string]: any;
}> = ({ children }) => <>{children}</>;

export class AdapterDayjs {
  constructor(..._args: any[]) {}
}

export default DateTimePicker;

