import React from 'react';
import {
  CheckCircle2 as CheckCircleIcon,
  Circle as RadioButtonUncheckedIcon,
  XCircle as XCircleIcon,
  Zap as BoltIcon,
  Power as PowerSettingsNewIcon,
  Rocket as RocketLaunchIcon,
} from 'lucide-react';
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
  SxProps,
  Theme,
} from '@mui/material';

export interface ReadinessCheckPart {
  label: string;
  active: boolean;
  detail?: string;
}

export interface ReadinessItem {
  id?: string;
  label: string;
  active: boolean;
  loading?: boolean;
  busy?: boolean;
  tooltip?: string;
  /** Sub-parts required for this item, surfaced in the hover tooltip. */
  checks?: ReadinessCheckPart[];
  onEnable?: () => void | Promise<void>;
  onDisable?: () => void | Promise<void>;
  /** When set, clicking the label opens the matching usecase drawer or triggers a navigation callback. */
  onOpenUsecase?: () => void;
}

export const ReadinessRow = ({
  label,
  active,
  loading,
  busy,
  tooltip,
  checks,
  onEnable,
  onDisable,
  onOpenUsecase,
}: ReadinessItem) => {
  const icon = loading ? (
    <CircularProgress size={12} sx={{ color: 'hsl(var(--muted-foreground))' }} />
  ) : active ? (
    <CheckCircleIcon size={14} style={{ color: 'hsl(var(--severity-low))' }} />
  ) : (
    <RadioButtonUncheckedIcon size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
  );

  const missingCount = (checks || []).filter((c) => !c.active).length;

  const tooltipContent = (tooltip || checks?.length || onOpenUsecase) ? (
    <Box sx={{ py: 0.25 }}>
      {tooltip && <Typography sx={{ fontSize: '0.72rem', color: 'inherit' }}>{tooltip}</Typography>}
      {!loading && !!checks?.length && (
        <Box sx={{ mt: tooltip ? 0.75 : 0 }}>
          <Typography sx={{ fontSize: '0.66rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, opacity: 0.75 }}>
            {missingCount > 0 ? `${missingCount} of ${checks.length} parts missing` : 'All parts configured'}
          </Typography>
          {checks.map((c, i) => (
            <Box key={`${c.label}-${i}`} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mt: 0.4 }}>
              {c.active ? (
                <CheckCircleIcon size={12} style={{ color: 'hsl(var(--severity-low))', marginTop: 2, flexShrink: 0 }} />
              ) : (
                <XCircleIcon size={12} style={{ color: 'hsl(var(--destructive))', marginTop: 2, flexShrink: 0 }} />
              )}
              <Box>
                <Typography sx={{ fontSize: '0.72rem', color: 'inherit', opacity: c.active ? 0.8 : 1, fontWeight: c.active ? 400 : 600 }}>
                  {c.label}
                </Typography>
                {!c.active && c.detail && (
                  <Typography sx={{ fontSize: '0.66rem', opacity: 0.75, mt: 0.1 }}>{c.detail}</Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {onOpenUsecase && (
        <Typography sx={{ fontSize: '0.66rem', opacity: 0.7, mt: 0.75 }}>Click to open usecase</Typography>
      )}
    </Box>
  ) : '';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
      {icon}
      <Tooltip
        title={tooltipContent}
        arrow
        placement="left"
        disableHoverListener={!tooltipContent}
        componentsProps={{ tooltip: { sx: { maxWidth: 340 } } }}
      >
        <Typography
          variant="body2"
          onClick={onOpenUsecase}
          sx={{
            flex: 1,
            fontSize: '0.78rem',
            color: active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
            cursor: onOpenUsecase ? 'pointer' : 'default',
            '&:hover': onOpenUsecase ? { color: 'hsl(var(--primary))', textDecoration: 'underline' } : undefined,
          }}
        >
          {label}
        </Typography>
      </Tooltip>

      {!loading && active && onDisable && (
        <Tooltip title={`Disable ${label}`} arrow>
          <span>
            <IconButton
              size="small"
              disabled={busy}
              onClick={onDisable}
              sx={{
                width: 22,
                height: 22,
                color: 'hsl(var(--muted-foreground))',
                '&:hover': { bgcolor: 'hsl(var(--destructive) / 0.1)', color: 'hsl(var(--destructive))' },
              }}
            >
              {busy ? <CircularProgress size={12} /> : <PowerSettingsNewIcon size={14} />}
            </IconButton>
          </span>
        </Tooltip>
      )}
      {!loading && !active && onEnable && (
        <Tooltip title={`Enable ${label}`} arrow>
          <span>
            <IconButton
              size="small"
              disabled={busy}
              onClick={onEnable}
              sx={{
                width: 22,
                height: 22,
                color: 'hsl(var(--primary))',
                '&:hover': { bgcolor: 'hsl(var(--primary) / 0.1)' },
              }}
            >
              {busy ? <CircularProgress size={12} /> : <BoltIcon size={14} />}
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Box>
  );
};

export interface AutomationReadinessCardProps {
  title?: string;
  items: ReadinessItem[];
  allActive?: boolean;
  activeCount?: number;
  totalCount?: number;
  isLoading?: boolean;
  isEnablingAll?: boolean;
  onEnableAll?: () => void | Promise<void>;
  enableAllLabel?: string;
  atTop?: boolean;
  /** Render flat on the surrounding background: no border, no tinted background. */
  borderless?: boolean;
  sx?: SxProps<Theme>;
}

export const AutomationReadinessCard: React.FC<AutomationReadinessCardProps> = ({
  title = 'Automation Readiness',
  items,
  allActive: explicitAllActive,
  activeCount: explicitActiveCount,
  totalCount: explicitTotalCount,
  isLoading,
  isEnablingAll,
  onEnableAll,
  enableAllLabel = 'Enable all',
  atTop,
  borderless,
  sx,
}) => {
  const total = explicitTotalCount ?? items.length;
  const active = explicitActiveCount ?? items.filter((i) => i.active).length;
  const isAllActive = explicitAllActive ?? (total > 0 && active === total);

  return (
    <Box
      sx={{
        mt: atTop ? 0 : 2,
        mb: atTop ? 2 : 0,
        p: 1.5,
        borderRadius: 2,
        bgcolor: !borderless && isAllActive ? 'hsl(var(--severity-low) / 0.04)' : 'transparent',
        border: borderless
          ? 'none'
          : isAllActive
            ? '1px solid hsl(var(--severity-low))'
            : atTop
              ? '1px solid hsl(var(--primary) / 0.5)'
              : '1px solid hsl(var(--border))',
        boxShadow: 'none',
        display: 'flex',
        flexDirection: 'column',
        ...sx,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            color: 'hsl(var(--muted-foreground))',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontSize: '0.68rem',
          }}
        >
          {title}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.68rem',
            fontWeight: isAllActive ? 700 : 500,
            color: isAllActive ? 'hsl(var(--severity-low))' : 'hsl(var(--muted-foreground))',
          }}
        >
          {active}/{total} active
        </Typography>
      </Box>

      {items.map((item, idx) => (
        <ReadinessRow key={item.id || `${item.label}-${idx}`} {...item} />
      ))}

      {!isAllActive && onEnableAll && (
        <Button
          fullWidth
          size="small"
          variant="outlined"
          startIcon={
            isEnablingAll ? <CircularProgress size={12} color="inherit" /> : <RocketLaunchIcon size={14} />
          }
          disabled={isEnablingAll || isLoading}
          onClick={onEnableAll}
          sx={{
            mt: 1,
            height: 28,
            textTransform: 'none',
            fontSize: '0.72rem',
            fontWeight: 600,
            borderColor: 'hsl(var(--primary) / 0.5)',
            color: 'hsl(var(--primary))',
            '&:hover': { borderColor: 'hsl(var(--primary))', bgcolor: 'hsl(var(--primary) / 0.08)' },
          }}
        >
          {isEnablingAll ? 'Enabling…' : enableAllLabel}
        </Button>
      )}
    </Box>
  );
};

export default AutomationReadinessCard;
