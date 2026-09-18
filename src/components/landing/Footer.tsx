import { Github as GitHubIcon, Linkedin as LinkedInIcon, Twitter as TwitterIcon } from 'lucide-react';
import { Box, Container, Typography, Grid, Link as MuiLink, Stack, IconButton } from '@mui/material';
import { Link } from '@/lib/router-compat';
const footerLinks = {
  Product: [
    { label: 'Features', href: '#features' },
    { label: 'Usecases', href: '/usecases' },
    { label: 'Integrations', href: '/apps' },
    
  ],
  Platform: [
    { label: 'Incidents', href: '/incidents' },
    { label: 'Detection Pipelines', href: '/detection' },
    { label: 'Host Monitors', href: '/monitors' },
    { label: 'Infrastructure', href: '/infrastructure' },
    { label: 'Shuffle Core', href: 'https://github.com/shuffle/shuffle' },
    { label: 'Shuffle MCPs Demo', href: 'https://github.com/shuffle/shuffle-mcps-demo' },
  ],
  Resources: [
    { label: 'Documentation', href: '/docs' },
    { label: 'Getting Started', href: '/docs/getting-started' },
    { label: 'API Reference', href: 'https://shuffler.io/docs/API' },
    { label: 'Community', href: 'https://discord.com/invite/B2CBzUm' },
    { label: 'Contact', href: 'https://shuffler.io/contact' },
  ],
};

import { ShuffleLogo } from '@/components/common/ShuffleLogo';

export const Footer = () => {
  return (
    <Box
      component="footer"
      sx={{
        py: 8,
        borderTop: '1px solid hsl(var(--border))',
        background: 'linear-gradient(180deg, transparent 0%, hsla(var(--foreground) / 0.03) 100%)',
      }}
    >
      <Container maxWidth="lg">
        <Grid container spacing={8}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
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
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, maxWidth: 280 }}>
              Automatic, Predictable, and Controllable security.
            </Typography>
            <Stack direction="row" spacing={1}>
              <IconButton 
                component="a"
                href="https://github.com/shuffle"
                target="_blank"
                rel="noopener noreferrer"
                size="small" 
                sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
              >
                <GitHubIcon />
              </IconButton>
              <IconButton 
                component="a"
                href="https://www.linkedin.com/company/shuffleio/"
                target="_blank"
                rel="noopener noreferrer"
                size="small" 
                sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
              >
                <LinkedInIcon />
              </IconButton>
              <IconButton 
                component="a"
                href="https://twitter.com/shuffleio"
                target="_blank"
                rel="noopener noreferrer"
                size="small" 
                sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
              >
                <TwitterIcon />
              </IconButton>
            </Stack>
          </Grid>

          {Object.entries(footerLinks).map(([category, links]) => (
            <Grid size={{ xs: 6, sm: 4, md: 2 }} key={category}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                {category}
              </Typography>
              <Stack spacing={1.5}>
                {links.map((link) => (
                  <MuiLink
                    key={link.label}
                    component={link.href.startsWith('http') || link.href.startsWith('#') ? 'a' : Link}
                    href={link.href.startsWith('http') || link.href.startsWith('#') ? link.href : undefined}
                    to={!link.href.startsWith('http') && !link.href.startsWith('#') ? link.href : undefined}
                    target={link.href.startsWith('http') ? '_blank' : undefined}
                    rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    sx={{
                      color: 'text.secondary',
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                      transition: 'color 0.2s',
                      '&:hover': {
                        color: 'primary.main',
                      },
                    }}
                  >
                    {link.label}
                  </MuiLink>
                ))}
              </Stack>
            </Grid>
          ))}
        </Grid>

        <Box
          sx={{
            mt: 8,
            pt: 4,
            borderTop: '1px solid hsl(var(--border))',
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            © 2026 Shuffle Security. All rights reserved.
          </Typography>
          <Stack direction="row" spacing={3}>
            <MuiLink 
              href="https://shuffler.io/privacy" 
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: 'text.secondary', fontSize: '0.875rem', textDecoration: 'none' }}
            >
              Privacy Policy
            </MuiLink>
            <MuiLink 
              href="https://shuffler.io/terms" 
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: 'text.secondary', fontSize: '0.875rem', textDecoration: 'none' }}
            >
              Terms of Service
            </MuiLink>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
};
