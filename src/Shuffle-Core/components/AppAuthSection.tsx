/**
 * AppAuthSection — Standalone Authentication block for an app.
 *
 * Wraps the heading/description + AppAuthCard. Pass in the resolved
 * algoliaApp and auth state so this remains presentational.
 */

import { Box, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import { AppAuthCard } from '@/Shuffle-MCPs/components/AppAuthConfig';
import type { AlgoliaSearchApp } from '@/Shuffle-MCPs/shuffle-mcp.helpers';
import type { ShuffleHostProps } from '@/Shuffle-MCPs/host-props';

export interface AppAuthSectionProps extends ShuffleHostProps {
  /** Display name (used in copy when no auth exists). */
  displayName: string;
  /** Algolia app object — required to render the AuthCard. */
  algoliaApp: AlgoliaSearchApp | null;
  /** Resolved app id (Algolia objectID). When missing the card is hidden. */
  resolvedAlgoliaId: string | null;
  /** Auth state object from useAppAuth. */
  authState: any;
  /** Whether the card is expanded. */
  expanded: boolean;
  onToggle: () => void;
  /** Number of matching auth entries — drives the subtitle copy. */
  authCount: number;
  /** Whether the host is authenticated (no Cloud session = hide form). */
  isAuthenticated?: boolean;
  /** Auth entries already filtered to this app. */
  matchingEntries: any[];
  onAuthChange: any;
  onTestConnection: (appId: string, authId?: string) => any;
  onSaveAuth: (appId: string, credentials: Record<string, string>) => Promise<boolean>;
  onRefreshAuth: () => void;
}

export default function AppAuthSection({
  displayName,
  algoliaApp,
  resolvedAlgoliaId,
  authState,
  expanded,
  onToggle,
  authCount,
  isAuthenticated = true,
  matchingEntries,
  onAuthChange,
  onTestConnection,
  onSaveAuth,
  onRefreshAuth,
  globalUrl,
  userdata,
  isLoaded,
  isLoggedIn,
  serverside,
  theme,
  colorMode,
}: AppAuthSectionProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
      <Box sx={{ mb: 3 }}>
        <Typography sx={{ color: 'hsl(var(--foreground))', fontWeight: 600, fontSize: '0.95rem', mb: 0.5 }}>
          Authentication
        </Typography>
        <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', mb: 1.5 }}>
          {isAuthenticated
            ? authCount > 0
              ? `${authCount} configuration${authCount > 1 ? 's' : ''} found`
              : 'No authentication configured yet'
            : `Connect your ${displayName} account`}
        </Typography>
        {isAuthenticated && algoliaApp && resolvedAlgoliaId && (
          <AppAuthCard
            app={algoliaApp}
            authState={authState}
            isExpanded={expanded}
            onToggle={onToggle}
            onAuthChange={onAuthChange}
            onTestConnection={onTestConnection}
            onSaveAuth={onSaveAuth}
            apiAuthEntries={matchingEntries}
            onRefreshAuth={onRefreshAuth}
            globalUrl={globalUrl}
            userdata={userdata}
            isLoaded={isLoaded}
            isLoggedIn={isLoggedIn}
            serverside={serverside}
            theme={theme}
            colorMode={colorMode}
          />
        )}
      </Box>
    </motion.div>
  );
}
