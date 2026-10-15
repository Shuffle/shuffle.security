/**
 * Signed-out /monitors — the real host table filled with sample hosts.
 * Any action asks the visitor to sign in first.
 */
import { useMemo, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { Link } from '@/lib/router-compat';
import { MonitorHostTable } from '@/Shuffle-Core/views/monitors/MonitorHostTable';
import { buildSampleMonitorHosts } from '@/lib/dashboardSampleData';
import GuestSampleView from './GuestSampleView';

const LOGIN_HREF = '/login?view=/monitors';

const GuestMonitorsPage = () => {
  const hosts = useMemo(() => buildSampleMonitorHosts(), []);
  const [signInOpen, setSignInOpen] = useState(false);
  return (
    <GuestSampleView returnPath="/monitors" pageName="the host monitors for your own tenant">
      <Box sx={{ maxWidth: 1400, width: '100%', mx: 'auto', px: { xs: 2, md: 4 }, pb: 4 }}>
        <MonitorHostTable hosts={hosts as any} onSignInRequired={() => setSignInOpen(true)} />
      </Box>
      <Dialog open={signInOpen} onClose={() => setSignInOpen(false)} sx={{ zIndex: 10000 }}>
        <DialogTitle>Sign in to use host monitors</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
            These are sample hosts. You need to be logged in to deploy monitors, run actions or open a host.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSignInOpen(false)} sx={{ height: 36, textTransform: 'none' }}>Keep browsing</Button>
          <Button component={Link} to={LOGIN_HREF} variant="contained" sx={{ height: 36, textTransform: 'none' }}>Sign in</Button>
        </DialogActions>
      </Dialog>
    </GuestSampleView>
  );
};

export default GuestMonitorsPage;
