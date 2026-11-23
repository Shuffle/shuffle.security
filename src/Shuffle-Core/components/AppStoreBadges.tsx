import { Box, SxProps, Theme } from '@mui/material';
import appStoreBadge from '../assets/app-store-badge.svg.asset.json';
import googlePlayBadge from '../assets/google-play-badge.png.asset.json';

export interface AppStoreBadgesProps {
  /** Link for the Apple App Store badge. Defaults to the App Store home. */
  iosUrl?: string;
  /** Link for the Google Play badge. Defaults to the Google Play home. */
  androidUrl?: string;
  /** Badge height in pixels. Width follows each badge's official aspect ratio. */
  height?: number;
  /** Layout direction of the two badges. */
  direction?: 'row' | 'column';
  /** Extra styles for the wrapping container. */
  sx?: SxProps<Theme>;
}

/**
 * Official "Download on the App Store" and "Get it on Google Play" badges.
 * Use this everywhere the mobile app is linked so branding stays consistent.
 * All styles are scoped to the elements rendered here; nothing global.
 */
export function AppStoreBadges({
  iosUrl = 'https://apps.apple.com',
  androidUrl = 'https://play.google.com',
  height = 40,
  direction = 'row',
  sx,
}: AppStoreBadgesProps) {
  const badgeSx = {
    display: 'block',
    height: `${height}px`,
    width: 'auto',
  } as const;

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
    </Box>
  );
}

export default AppStoreBadges;
