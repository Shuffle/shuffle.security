/**
 * Floating "Continue demo" pill shown in the bottom-right corner when the
 * user previously started demo mode but never finished or cleaned it up.
 *
 * Hidden when:
 *  - Demo mode is currently active (the tour drawer is in charge)
 *  - The user explicitly dismissed it via the X icon
 *  - They reached the final tour step or ran "Clean up demo data"
 */

import { Box, Typography, IconButton, Tooltip, useTheme } from '@mui/material';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from '@/lib/router-compat';
import { useDemo } from '@/context/DemoContext';

export const DemoResumePill = () => {
  const theme = useTheme();
  const primaryColor = theme.palette.primary.main;
  const { drawerOpen, wasStarted, resumeDismissed, resumeTour, dismissResumePrompt } = useDemo();
  const location = useLocation();

  // Mirror DemoTourDrawer's "on demo object" detection: hide this pill
  // whenever the user is viewing a demo-seeded object, because the glowing
  // "DEMO DATA / Re-open demo tour" anchor pill is already shown for that
  // case and two side-by-side demo CTAs are noisy.
  const onDemoObjectByUrl = /\/demo-[a-z0-9-]+/i.test(location.pathname);
  const [inlineDemoActive, setInlineDemoActive] = useState(false);
  useEffect(() => {
    const onCtx = (e: Event) => {
      const detail = (e as CustomEvent<{ active: boolean }>).detail;
      setInlineDemoActive(!!detail?.active);
    };
    window.addEventListener('demo-object-context', onCtx as EventListener);
    return () => window.removeEventListener('demo-object-context', onCtx as EventListener);
  }, []);
  useEffect(() => { setInlineDemoActive(false); }, [location.pathname]);
  const onDemoObject = onDemoObjectByUrl || inlineDemoActive;

  // Show whenever a demo run was started but the drawer is not currently
  // visible (e.g. after a page refresh — `shuffle_demo_active` survives but
  // `drawerOpen` resets to false).
  if (drawerOpen || !wasStarted || resumeDismissed || onDemoObject) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 80,
        right: 24,
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        pl: 1.5,
        pr: 1,
        py: 0.75,
        borderRadius: 999,
        bgcolor: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        boxShadow: '0 8px 24px hsl(var(--background) / 0.4)',
        backdropFilter: 'blur(8px)',
        cursor: 'pointer',
        transition: 'border-color 0.2s ease, transform 0.2s ease',
        '&:hover': {
          borderColor: primaryColor,
          transform: 'translateY(-1px)',
        },
      }}
      onClick={resumeTour}
      role="button"
      aria-label="Continue demo mode"
    >
      <Box
        sx={{
          px: 0.75,
          py: 0.2,
          borderRadius: 1,
          bgcolor: 'hsl(var(--primary) / 0.15)',
          color: primaryColor,
          fontSize: '0.625rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          lineHeight: 1,
        }}
      >
        Demo
      </Box>
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, color: 'hsl(var(--foreground))', fontSize: '0.8125rem' }}
      >
        Continue demo
      </Typography>
      <Tooltip title="Hide until next demo">
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            dismissResumePrompt();
          }}
          sx={{
            width: 24,
            height: 24,
            color: 'hsl(var(--muted-foreground))',
            '&:hover': { color: 'hsl(var(--foreground))', bgcolor: 'hsl(var(--muted))' },
          }}
        >
          <X size={14} />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default DemoResumePill;
