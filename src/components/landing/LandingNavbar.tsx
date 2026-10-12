import { Menu as MenuIcon, Github as GitHubIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from '@/lib/router-compat';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { trackCTA, trackPredefinedEvent, GA_EVENTS } from '@/lib/analytics';
import { ShuffleLogo } from '@/components/common/ShuffleLogo';

const navItems = [
  { label: 'Features', href: '/#features', internal: true },
  { label: 'Usecases', href: '/usecases', internal: true },
  { label: 'Docs', href: '/docs', internal: true },
];

export interface LandingNavbarProps {
  onMobileMenuClick?: () => void;
}

export const LandingNavbar = ({ onMobileMenuClick }: LandingNavbarProps = {}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { isAuthenticated: authFromContext } = useAuth();
  // The auth cache lives in browser storage, so SSR always renders the signed-out
  // CTA. Only trust the auth state after hydration to avoid a mismatch.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const isAuthenticated = hydrated && authFromContext;
  const location = useLocation();
  const isOnLoginPage = location.pathname === '/login';
  const isOnAuthPage = isOnLoginPage || location.pathname === '/register';

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  return (
    <>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          left: 0,
          right: { xs: 0, md: 'var(--ask-ai-panel-width, 0px)' },
          width: 'auto',
          transition: 'right 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', py: 1, position: 'relative' }}>
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Box 
              component={Link} 
              to="/"
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, textDecoration: 'none' }}
            >
              <ShuffleLogo />
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #FF6600 0%, #FF8533 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  Shuffle
                </Typography>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 700,
                    color: 'text.primary',
                  }}
                >
                  Security
                </Typography>
              </Box>
            </Box>
          </motion.div>

          {!isMobile && (
            <Box sx={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {navItems.map((item, index) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  {item.internal ? (
                    <Typography
                      component={Link}
                      to={item.href}
                      sx={{
                        color: 'text.secondary',
                        textDecoration: 'none',
                        fontWeight: 500,
                        fontSize: '0.95rem',
                        transition: 'color 0.2s',
                        '&:hover': {
                          color: 'primary.main',
                        },
                      }}
                    >
                      {item.label}
                    </Typography>
                  ) : (
                    <Typography
                      component="a"
                      href={item.href}
                      sx={{
                        color: 'text.secondary',
                        textDecoration: 'none',
                        fontWeight: 500,
                        fontSize: '0.95rem',
                        transition: 'color 0.2s',
                        '&:hover': {
                          color: 'primary.main',
                        },
                      }}
                    >
                      {item.label}
                    </Typography>
                  )}
                </motion.div>
              ))}
            </Box>
          )}

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {!isMobile && (
                <IconButton
                  component="a"
                  href="https://github.com/Shuffle/shuffle.security"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open Source on GitHub"
                  title="Open Source on GitHub"
                  sx={{
                    color: 'text.secondary',
                    borderRadius: 1.5,
                    transition: 'background-color 0.15s, color 0.15s',
                    '&:hover': {
                      color: 'text.primary',
                      backgroundColor: 'hsl(var(--accent))',
                    },
                  }}
                >
                  <GitHubIcon />
                </IconButton>
              )}
              {!isMobile && (
                <>
                  {isAuthenticated ? (
                    <Button
                      component={Link}
                      to="/dashboard"
                      variant="contained"
                    >
                      Go to Product
                    </Button>
                  ) : (
                    <>
                      <Button
                        component={Link}
                        to={isOnLoginPage ? '/register' : '/login'}
                        variant="text"
                        sx={{ color: 'text.secondary' }}
                      >
                        {isOnLoginPage ? 'Sign Up' : 'Sign In'}
                      </Button>
                      {!isOnAuthPage && (
                        <Button
                          component={Link}
                          to="/register"
                          variant="contained"
                          onClick={() => trackCTA('get_started', 'navbar')}
                        >
                          Get Started
                        </Button>
                      )}
                    </>
                  )}
                </>
              )}
              {isMobile && (
                <IconButton
                  aria-label="open drawer"
                  edge="end"
                  onClick={onMobileMenuClick || handleDrawerToggle}
                  sx={{
                    color: 'text.primary',
                    '&:hover': { backgroundColor: 'action.hover' },
                  }}
                >
                  <MenuIcon />
                </IconButton>
              )}
            </Box>
          </motion.div>
        </Toolbar>
      </AppBar>

      <Drawer
        anchor="right"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        sx={{
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: 280,
            minWidth: 240,
            maxWidth: '85vw',
          },
        }}
      >
        <Box sx={{ py: 2 }}>
          <List>
            {navItems.map((item) => (
              <ListItem key={item.label} disablePadding>
                <ListItemButton
                  component={item.internal ? Link : 'a'}
                  {...(item.internal ? { to: item.href } : { href: item.href })}
                  onClick={handleDrawerToggle}
                >
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
            {isAuthenticated ? (
              <ListItem sx={{ px: 2, pt: 2 }}>
                <Button
                  component={Link}
                  to="/dashboard"
                  variant="contained"
                  fullWidth
                  onClick={handleDrawerToggle}
                >
                  Go to Product
                </Button>
              </ListItem>
            ) : (
              <>
                <ListItem disablePadding>
                  <ListItemButton component={Link} to={isOnLoginPage ? '/register' : '/login'} onClick={handleDrawerToggle}>
                    <ListItemText primary={isOnLoginPage ? 'Sign Up' : 'Sign In'} />
                  </ListItemButton>
                </ListItem>
                {!isOnAuthPage && (
                  <ListItem sx={{ px: 2, pt: 2 }}>
                    <Button
                      component={Link}
                      to="/register"
                      variant="contained"
                      fullWidth
                      onClick={() => {
                        trackCTA('get_started', 'mobile_drawer');
                        handleDrawerToggle();
                      }}
                    >
                      Get Started
                    </Button>
                  </ListItem>
                )}
              </>
            )}
          </List>
        </Box>
      </Drawer>
    </>
  );
};
