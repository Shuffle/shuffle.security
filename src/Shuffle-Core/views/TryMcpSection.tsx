/**
 * TryMcpSection — Standalone "Try MCP" block.
 *
 * Wraps the heading + AppMcpChat. Pass in the resolved app props.
 */

import React, { useState } from 'react';
import { Box, Typography, Collapse } from '@mui/material';
import { motion } from 'framer-motion';
import AppMcpChat from '@/Shuffle-Core/views/AppMcpChat';
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
  /** Whether the section starts expanded. Defaults to false (contracted). */
  defaultExpanded?: boolean;
  /** Optional children rendered inside the collapsible area below AppMcpChat. */
  children?: React.ReactNode;
}

export default function TryMcpSection({
  appName,
  appIcon,
  appId,
  categories,
  defaultExpanded = false,
  children,
  globalUrl,
  userdata,
  isLoaded,
  isLoggedIn,
  serverside,
  theme,
  colorMode,
}: TryMcpSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
      <Box
        sx={{
          mt: 4.5,
          mb: 4.5,
          borderRadius: 2,
          border: '1px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--card))',
          overflow: 'hidden',
        }}
      >
        <Box
          onClick={() => setExpanded(prev => !prev)}
          sx={{
            px: { xs: 2, sm: 2.5 },
            py: 1.75,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            cursor: 'pointer',
            borderBottom: expanded ? '1px solid hsl(var(--border))' : 'none',
            bgcolor: 'hsl(var(--muted) / 0.35)',
            '&:hover': { bgcolor: 'hsl(var(--muted) / 0.55)' },
          }}
        >
          <Typography sx={{ color: 'hsl(var(--foreground))', fontWeight: 600, fontSize: '0.9rem' }}>
            Try MCP
          </Typography>
          <Typography
            sx={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'hsl(var(--primary))',
              userSelect: 'none',
            }}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </Typography>
        </Box>
        <Collapse in={expanded}>
          <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
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
            {children}
          </Box>
        </Collapse>
      </Box>
    </motion.div>
  );
}
