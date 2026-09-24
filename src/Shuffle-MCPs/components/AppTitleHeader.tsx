/**
 * AppTitleHeader — Standalone title/header card for an app.
 *
 * Shows avatar (with valid-auth border), name, Verified/Pending chip,
 * categories, and either an "Activate/Deactivate" or "+ Add" action.
 *
 * Pure presentational component — pass in already-resolved props.
 */

import { Box, Typography, Avatar, Chip, Button } from '@mui/material';
import {
  CheckCircle2 as CheckCircleIcon,
  AlertCircle as ErrorOutlineIcon
} from 'lucide-react';
import { motion } from 'framer-motion';
import { isNoAuthApp, getBuiltInAppImage } from '@/Shuffle-MCPs/noAuthApps';
import type { ShuffleHostProps } from '@/Shuffle-MCPs/host-props';

export interface AppTitleHeaderProps extends ShuffleHostProps {
  /** Display name of the app (will be capitalized via CSS). */
  name: string;
  /** Image URL for the app icon. */
  image?: string;
  /** Whether at least one valid authentication exists. */
  hasValidAuth?: boolean;
  /** Whether at least one auth entry exists (valid or not). */
  hasAnyAuth?: boolean;
  /** Whether the host is authenticated — controls Verified/Pending chip + Activate button visibility. */
  isAuthenticated?: boolean;
  /** App categories to display as chips. */
  categories?: string[];
  /** Activation state — `null` hides the Activate button. */
  isActivated?: boolean | null;
  /** Whether activation toggle is in-flight. */
  activateLoading?: boolean;
  /** Called when user clicks Activate/Deactivate. */
  onActivateToggle?: () => void;
  /** When true, visually highlight the Activate button to signal an
   *  automatic click is happening (e.g. from a usecase auto-activate flow). */
  highlightActivate?: boolean;
  /** When provided, replaces the Activate button with "+ Add". */
  onAdd?: () => void;
  /** Called when the auth status chip is clicked (host may expand its auth section). */
  onAuthClick?: () => void;
}

export default function AppTitleHeader({
  name,
  image,
  hasValidAuth = false,
  hasAnyAuth = false,
  isAuthenticated = true,
  categories,
  isActivated = null,
  activateLoading = false,
  onActivateToggle,
  highlightActivate = false,
  onAdd,
}: AppTitleHeaderProps) {
  const isBuiltIn = isNoAuthApp(name);
  const resolvedImage = image || (isBuiltIn ? (getBuiltInAppImage(name) || undefined) : undefined);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          mb: 3,
          p: 2.5,
          borderRadius: 3,
          background: 'linear-gradient(135deg, hsl(var(--foreground) / 0.03) 0%, hsl(var(--foreground) / 0.01) 100%)',
          border: '1px solid hsl(var(--border))',
        }}
      >
        <Avatar
          src={resolvedImage}
          alt={name}
          sx={{
            width: 56,
            height: 56,
            borderRadius: '14px',
            backgroundColor: 'hsl(var(--muted))',
            border: '2px solid',
            borderColor: hasValidAuth || isBuiltIn
              ? 'hsl(var(--severity-low))'
              : hasAnyAuth
                ? 'hsl(142 76% 36% / 0.3)'
                : 'hsl(var(--border))',
            p: 0.5,
            '& img': { objectFit: 'contain', borderRadius: '10px' },
          }}
        >
          <Typography sx={{ fontSize: '1.2rem', fontWeight: 700 }}>{name.charAt(0).toUpperCase()}</Typography>
        </Avatar>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography sx={{ color: 'hsl(var(--foreground))', fontWeight: 700, fontSize: '1rem', textTransform: 'capitalize' }}>
              {name}
            </Typography>
            {isAuthenticated && hasValidAuth && (
              <Chip
                icon={<CheckCircleIcon size={14} />}
                label="Verified"
                size="small"
                sx={{ height: 22, backgroundColor: 'hsla(142, 76%, 36%, 0.15)', color: 'hsl(var(--severity-low))', fontWeight: 600, fontSize: '0.7rem', '& .MuiChip-icon': { color: 'hsl(var(--severity-low))' } }}
              />
            )}
            {isAuthenticated && !hasValidAuth && hasAnyAuth && (
              <Chip
                icon={<ErrorOutlineIcon size={14} />}
                label="Pending"
                size="small"
                sx={{ height: 22, backgroundColor: 'hsla(38, 92%, 50%, 0.15)', color: 'hsl(var(--severity-medium))', fontWeight: 600, fontSize: '0.7rem', '& .MuiChip-icon': { color: 'hsl(var(--severity-medium))' } }}
              />
            )}
          </Box>

          {categories && categories.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {categories.slice(0, 3).map(cat => (
                <Chip
                  key={cat}
                  label={cat}
                  size="small"
                  sx={{ height: 18, fontSize: '0.6rem', fontWeight: 500, backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', textTransform: 'capitalize' }}
                />
              ))}
            </Box>
          )}
        </Box>

        {onAdd && (
          <Button
            onClick={onAdd}
            variant="contained"
            size="small"
            sx={{
              textTransform: 'none', fontWeight: 600, fontSize: '0.72rem', borderRadius: 2, px: 1.5, py: 0.5, minHeight: 0, flexShrink: 0,
              bgcolor: 'hsl(var(--primary))', '&:hover': { bgcolor: 'hsl(var(--primary) / 0.85)' },
            }}
          >
            + Add
          </Button>
        )}

        {!onAdd && isAuthenticated && !isBuiltIn && isActivated !== null && onActivateToggle && (
          <Button
            onClick={onActivateToggle}
            disabled={activateLoading}
            variant={isActivated ? 'outlined' : 'contained'}
            size="small"
            sx={{
              textTransform: 'none', fontWeight: 600, fontSize: '0.72rem', borderRadius: 2, px: 1.5, py: 0.5, minHeight: 0, flexShrink: 0,
              ...(isActivated
                ? { color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border))', '&:hover': { borderColor: 'hsl(var(--destructive))', color: 'hsl(var(--destructive))', bgcolor: 'hsla(var(--destructive) / 0.08)' } }
                : { bgcolor: 'hsl(var(--primary))', '&:hover': { bgcolor: 'hsl(var(--primary) / 0.85)' } }),
              ...(highlightActivate
                ? {
                    boxShadow: '0 0 0 0 hsla(var(--primary) / 0.6)',
                    animation: 'appTitleActivatePulse 1.1s ease-out infinite',
                    '@keyframes appTitleActivatePulse': {
                      '0%':   { boxShadow: '0 0 0 0 hsla(var(--primary) / 0.55)' },
                      '70%':  { boxShadow: '0 0 0 10px hsla(var(--primary) / 0)' },
                      '100%': { boxShadow: '0 0 0 0 hsla(var(--primary) / 0)' },
                    },
                  }
                : {}),
            }}
          >
            {activateLoading ? '…' : isActivated ? 'Deactivate' : 'Activate'}
          </Button>
        )}
      </Box>
    </motion.div>
  );
}
