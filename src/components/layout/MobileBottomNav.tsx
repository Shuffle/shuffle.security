import { useLocation, Link } from '@/lib/router-compat';
import { Box, Typography } from '@mui/material';
import {
  AlertTriangle as WarningAmberIcon,
  ShieldCheck as AdminPanelSettingsIcon,
} from 'lucide-react';
import AgentIcon from '@/Shuffle-Core/components/AgentIcon';
import { useEntityPreference } from '@/hooks/useEntityLabel';

export const MobileBottomNav = () => {
  const { plural: entityPlural, basePath: entityBasePath } = useEntityPreference();
  const location = useLocation();

  const navItems = [
    {
      label: entityPlural || 'Incidents',
      icon: <WarningAmberIcon size={20} />,
      path: entityBasePath || '/incidents',
    },
    {
      label: 'AI Agent',
      icon: <AgentIcon size={20} />,
      path: '/agent',
    },
    {
      label: 'Admin',
      icon: <AdminPanelSettingsIcon size={20} />,
      path: '/admin',
    },
  ];

  const isActive = (path: string) => {
    if (location.pathname === path || location.pathname.startsWith(path + '/')) return true;
    if (path === '/agent' && location.pathname.startsWith('/agents')) return true;
    return false;
  };

  return (
    <Box
      component="nav"
      aria-label="Mobile Navigation"
      sx={{
        display: { xs: 'flex', sm: 'none' },
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        maxWidth: '100vw',
        boxSizing: 'border-box',
        overflowX: 'hidden',
        zIndex: 1300,
        bgcolor: 'hsl(var(--card))',
        borderTop: '1px solid hsl(var(--border))',
        justifyContent: 'space-around',
        alignItems: 'center',
        px: 2,
        pl: 'calc(1rem + env(safe-area-inset-left, 0px))',
        pr: 'calc(1rem + env(safe-area-inset-right, 0px))',
        py: 0.75,
        pb: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.15)',
      }}
    >
      {navItems.map((item) => {
        const active = isActive(item.path);
        return (
          <Box
            key={item.path}
            component={Link}
            to={item.path}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.5,
              textDecoration: 'none',
              color: active ? '#FF6600' : 'hsl(var(--muted-foreground))',
              minWidth: 72,
              py: 0.6,
              px: 1.5,
              borderRadius: 2,
              bgcolor: active ? 'rgba(255, 102, 0, 0.1)' : 'transparent',
              transition: 'all 0.15s ease-in-out',
              '&:active': {
                transform: 'scale(0.95)',
              },
            }}
          >
            {item.icon}
            <Typography
              sx={{
                fontSize: '0.7rem',
                fontWeight: active ? 700 : 500,
                letterSpacing: '-0.2px',
                lineHeight: 1,
              }}
            >
              {item.label}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
};
