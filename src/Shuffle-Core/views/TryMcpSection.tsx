/**
 * TryMcpSection — Standalone "Try MCP" block.
 *
 * Wraps the heading + AppMcpChat. Pass in the resolved app props.
 */

import { Box, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import AppMcpChat from '@/Shuffle-Core/views/AppMcpChat';
import { McpSetupButtons } from '@/Shuffle-Core/components/oauth/McpSetupButtons';
import type { ShuffleHostProps } from '@/Shuffle-Core/host-props';

export interface TryMcpSectionProps extends ShuffleHostProps {
  appName: string;
  /** Human-readable display name for the app. */
  displayName?: string;
  /** Image URL used as the chat avatar. */
  appIcon?: string;
  /** Resolved app id (Algolia objectID or Shuffle id). */
  appId: string;
  /** App categories — used to pick suggested actions. */
  categories?: string[];
}

export default function TryMcpSection({ appName, displayName, appIcon, appId, categories, globalUrl, userdata, isLoaded, isLoggedIn, serverside, theme, colorMode }: TryMcpSectionProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
      <Box sx={{ mt: 5, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <Typography sx={{ color: 'hsl(var(--foreground))', fontWeight: 600, fontSize: '0.95rem' }}>
            Try MCP
          </Typography>
          <McpSetupButtons
            appName={appName}
            appTitle={displayName}
            globalUrl={globalUrl}
            size="compact"
          />
        </Box>
        <AppMcpChat
          appName={appName}
          appIcon={appIcon}
          appId={appId}
          categories={categories}
          globalUrl={globalUrl}
          userdata={userdata}
          isLoaded={isLoaded}
          isLoggedIn={isLoggedIn}
          serverside={serverside}
          theme={theme}
          colorMode={colorMode}
        />
      </Box>
    </motion.div>
  );
}
