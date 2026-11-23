import React from 'react';
import { Box, Container, Typography, Grid, Button } from '@mui/material';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { Footer } from '@/components/landing/Footer';
import { AppStoreBadges } from '@/Shuffle-Core';
import { Link } from '@/lib/router-compat';

const features = [
  {
    label: 'Critical Pager',
    title: 'Alerts that wake you up when it matters',
    body: 'Critical incidents break through silent mode with an emergency siren, vibration and a configurable ring duration. Choose exactly which tenants are allowed to page you.',
  },
  {
    label: 'Agent requests',
    title: 'Approve AI agent actions on the go',
    body: 'When an agent needs a decision on a high-stakes action, you get the request on your phone and can approve or decline it in seconds.',
  },
  {
    label: 'General notifications',
    title: 'Stay on top of every incident',
    body: 'Receive new incidents, assignments and status changes as push notifications, scoped to the tenants you care about.',
  },
  {
    label: 'Multi-tenant',
    title: 'One app for every tenant',
    body: 'Switch between organizations and sub-tenants with the same account and the same security rules you use on the web.',
  },
];

const steps = [
  { n: '1', title: 'Install the app', body: 'Download Shuffle Security from Google Play. The iOS app is coming soon.' },
  { n: '2', title: 'Sign in', body: 'Use your existing account on Shuffle Cloud or on your own self-hosted instance. No separate setup is needed.' },
  { n: '3', title: 'Enable paging', body: 'Turn on Critical Pager and pick which tenants and severities are allowed to reach you.' },
];

const selfHosted = [
  {
    label: 'Your instance',
    title: 'Sign in where Shuffle runs',
    body: 'Run Shuffle on your own infrastructure and use the same account in the app: Docker or Kubernetes containers, or a cloud platform you already operate such as AWS, GCP or Azure.',
  },
  {
    label: 'Your data',
    title: 'The app shows what your deployment sees',
    body: 'Incidents, observables and notification payloads are read from the instance you sign in to, so the mobile app mirrors the tenant you work in rather than a separate copy of your data.',
  },
  {
    label: 'Your rules',
    title: 'Same policies, same paging',
    body: 'Routing rules, severity thresholds and paging permissions come from your instance, so the rules that govern the web app also decide who gets paged on their phone.',
  },
];

const MobileAppPage: React.FC = () => (
  <>
    <LandingNavbar />
    <Box sx={{ pt: { xs: 14, md: 18 }, pb: { xs: 8, md: 12 } }}>
      <Container maxWidth="lg">
        <Box sx={{ maxWidth: 760 }}>
          <Typography sx={{ color: 'hsl(var(--primary))', fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', fontSize: 13, mb: 2 }}>
            Shuffle Security Mobile
          </Typography>
          <Typography component="h1" sx={{ fontSize: { xs: 36, md: 56 }, fontWeight: 700, lineHeight: 1.1, mb: 3, color: 'hsl(var(--foreground))' }}>
            Incident response in your pocket
          </Typography>
          <Typography sx={{ fontSize: { xs: 17, md: 20 }, color: 'hsl(var(--muted-foreground))', lineHeight: 1.6, mb: 5 }}>
            Get paged for critical incidents, approve agent actions and follow every tenant from your phone. The mobile app works with the account you already have, on Shuffle Cloud or on your own self-hosted Shuffle.
          </Typography>
          <AppStoreBadges iosComingSoon height={48} />
        </Box>
      </Container>
    </Box>

    <Box sx={{ py: { xs: 8, md: 12 }, borderTop: '1px solid hsl(var(--border))' }}>
      <Container maxWidth="lg">
        <Typography component="h2" sx={{ fontSize: { xs: 28, md: 36 }, fontWeight: 700, mb: 6, color: 'hsl(var(--foreground))' }}>
          Built for on-call security teams
        </Typography>
        <Grid container spacing={4}>
          {features.map((f) => (
            <Grid key={f.label} size={{ xs: 12, md: 6 }}>
              <Box sx={{ height: '100%', p: 4, borderRadius: 2, border: '1px solid hsl(var(--border))', bgcolor: 'hsl(var(--card))' }}>
                <Typography sx={{ color: 'hsl(var(--primary))', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>
                  {f.label}
                </Typography>
                <Typography component="h3" sx={{ fontSize: 22, fontWeight: 600, mb: 1.5, color: 'hsl(var(--foreground))' }}>
                  {f.title}
                </Typography>
                <Typography sx={{ color: 'hsl(var(--muted-foreground))', lineHeight: 1.7 }}>{f.body}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>

    <Box sx={{ py: { xs: 8, md: 12 }, borderTop: '1px solid hsl(var(--border))' }}>
      <Container maxWidth="lg">
        <Typography component="h2" sx={{ fontSize: { xs: 28, md: 36 }, fontWeight: 700, mb: 3, color: 'hsl(var(--foreground))' }}>
          Works with your own Shuffle
        </Typography>
        <Typography sx={{ fontSize: { xs: 17, md: 19 }, color: 'hsl(var(--muted-foreground))', lineHeight: 1.6, mb: 6, maxWidth: 760 }}>
          Shuffle is open source, and you can run it on your own infrastructure just as easily as you use it in the cloud. The mobile app is the same either way: you sign in to the instance you work in, and everything it shows you comes from that instance.
        </Typography>
        <Grid container spacing={4}>
          {selfHosted.map((f) => (
            <Grid key={f.label} size={{ xs: 12, md: 4 }}>
              <Box sx={{ height: '100%', p: 4, borderRadius: 2, border: '1px solid hsl(var(--border))', bgcolor: 'hsl(var(--card))' }}>
                <Typography sx={{ color: 'hsl(var(--primary))', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>
                  {f.label}
                </Typography>
                <Typography component="h3" sx={{ fontSize: 22, fontWeight: 600, mb: 1.5, color: 'hsl(var(--foreground))' }}>
                  {f.title}
                </Typography>
                <Typography sx={{ color: 'hsl(var(--muted-foreground))', lineHeight: 1.7 }}>{f.body}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
        <Box sx={{ mt: 6, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button component="a" href="https://github.com/shuffle/shuffle/blob/main/.github/install-guide.md" target="_blank" rel="noopener noreferrer" variant="outlined" sx={{ height: 44 }}>
            Read the install guide
          </Button>
          <Button component={Link} to="/pricing" variant="text" sx={{ height: 44 }}>
            Self-hosted pricing
          </Button>
        </Box>
      </Container>
    </Box>

    <Box sx={{ py: { xs: 8, md: 12 }, borderTop: '1px solid hsl(var(--border))' }}>
      <Container maxWidth="lg">
        <Typography component="h2" sx={{ fontSize: { xs: 28, md: 36 }, fontWeight: 700, mb: 6, color: 'hsl(var(--foreground))' }}>
          Get started in three steps
        </Typography>
        <Grid container spacing={4}>
          {steps.map((s) => (
            <Grid key={s.n} size={{ xs: 12, md: 4 }}>
              <Typography sx={{ fontSize: 40, fontWeight: 700, color: 'hsl(var(--primary))', mb: 1 }}>{s.n}</Typography>
              <Typography component="h3" sx={{ fontSize: 20, fontWeight: 600, mb: 1, color: 'hsl(var(--foreground))' }}>{s.title}</Typography>
              <Typography sx={{ color: 'hsl(var(--muted-foreground))', lineHeight: 1.7 }}>{s.body}</Typography>
            </Grid>
          ))}
        </Grid>
        <Box sx={{ mt: 8, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <AppStoreBadges iosComingSoon height={44} />
          <Button component={Link} to="/register" variant="outlined" sx={{ height: 44 }}>
            Create a free account
          </Button>
        </Box>
      </Container>
    </Box>
    <Footer />
  </>
);

export default MobileAppPage;
