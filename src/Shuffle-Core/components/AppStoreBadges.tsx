import { Box, SxProps, Theme, Tooltip } from '@mui/material';
import appStoreBadge from '../assets/app-store-badge.svg.asset.json';
import googlePlayBadge from '../assets/google-play-badge.png.asset.json';

/** Official Google Play listing for the Shuffle Security Android app. */
export const SHUFFLE_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=shuffle.security';

/** Shown on the unavailable App Store badge: how to get into the iOS beta. */
export const IOS_BETA_TOOLTIP =
  'The Shuffle Security iOS app is not available yet. Email support@shuffler.io to join the iOS beta program.';

export interface AppStoreBadgesProps {
  /** Link for the Apple App Store badge. Defaults to the App Store home. */
  iosUrl?: string;
  /** Link for the Google Play badge. Defaults to the Shuffle Security listing. */
  androidUrl?: string;
  /** Render the App Store badge as unavailable instead of linking to a listing. */
  iosComingSoon?: boolean;
  /** Badge height in pixels. Width follows each badge's official aspect ratio. */
  height?: number;
  /** Layout direction of the two badges. */
  direction?: 'row' | 'column';
  /** Extra styles for the wrapping container. */
  sx?: SxProps<Theme>;
}

/**
 * Official "Get it on Google Play" and "Download on the App Store" badges.
 * Use this everywhere the mobile app is linked so branding stays consistent.
 * Google Play renders first. Both badge images are trimmed to their artwork, so
 * the same `height` gives both badges the same visible size.
 * All styles are scoped to the elements rendered here; nothing global.
 */
export function AppStoreBadges({
  iosUrl = 'https://apps.apple.com',
  androidUrl = SHUFFLE_PLAY_STORE_URL,
  iosComingSoon = false,
  height = 40,
  direction = 'row',
  sx,
}: AppStoreBadgesProps) {
  const badgeSx = {
    display: 'block',
    height: `${height}px`,
    width: 'auto',
  } as const;

  const playBadge = (
    <Box
      component="a"
      href={androidUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Get it on Google Play"
      sx={{ display: 'inline-flex', lineHeight: 0 }}
    >
      <Box component="img" src={googlePlayBadge.url} alt="Get it on Google Play" sx={badgeSx} />
    </Box>
  );

  const iosBadge = iosComingSoon ? (
    <Tooltip title={IOS_BETA_TOOLTIP} placement="top" arrow>
      <Box
        sx={{
          position: 'relative',
          display: 'inline-flex',
          lineHeight: 0,
          cursor: 'default',
        }}
        aria-label="Download on the App Store — coming soon"
      >
        <Box
          component="img"
          src={appStoreBadge.url}
          alt="Download on the App Store — coming soon"
          sx={{ ...badgeSx, opacity: 0.45, filter: 'grayscale(1)' }}
        />
        <Box
          sx={{
            position: 'absolute',
            right: -6,
            bottom: -7,
            px: 0.75,
            py: 0.2,
            borderRadius: 1,
            border: '1px solid hsl(var(--border))',
            bgcolor: 'hsl(var(--background))',
            color: 'hsl(var(--muted-foreground))',
            fontSize: '0.62rem',
            fontWeight: 600,
            lineHeight: 1.25,
            whiteSpace: 'nowrap',
          }}
        >
          Coming soon
        </Box>
      </Box>
    </Tooltip>
  ) : (
    <Box
      component="a"
      href={iosUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Download on the App Store"
      sx={{ display: 'inline-flex', lineHeight: 0 }}
    >
      <Box component="img" src={appStoreBadge.url} alt="Download on the App Store" sx={badgeSx} />
    </Box>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: direction,
        alignItems: direction === 'row' ? 'center' : 'flex-start',
        gap: 1.5,
        flexWrap: 'wrap',
        ...((sx as object) ?? {}),
      }}
    >
      {playBadge}
      {iosBadge}
    </Box>
  );
}

export default AppStoreBadges;
