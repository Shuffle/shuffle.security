/**
 * Signed-out wrapper for app pages (/agents, /infrastructure): answers the
 * page's API calls with sample data while open and shows a sample-data banner.
 */
import { useLayoutEffect, useState, type ReactNode } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@/lib/router-compat';
import { installDashboardSampleFetch } from '@/lib/dashboardSampleData';

interface GuestSampleViewProps {
  /** Path to return to after sign-in, e.g. "/agents". */
  returnPath: string;
  /** Short name of the page, used in the banner text. */
  pageName: string;
  children: ReactNode;
}

const GuestSampleView = ({ returnPath, pageName, children }: GuestSampleViewProps) => {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const restore = installDashboardSampleFetch();
    setReady(true);
    return () => {
      restore();
      // Never leave sample data cached for after sign-in.
      queryClient.removeQueries({ queryKey: ['workflows'] });
    };
  }, [queryClient]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ maxWidth: 1400, width: '100%', mx: 'auto', px: { xs: 2, md: 4 }, pt: 4 }}>
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap',
          p: 2.5, borderRadius: 2, border: '1px solid hsl(var(--border))', bgcolor: 'hsl(var(--card))',
        }}>
          <Box>
            <Typography sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>You are viewing sample data</Typography>
            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              Sign in to see {pageName}.
            </Typography>
          </Box>
          <Button component={Link} to={`/login?view=${returnPath}`} variant="contained" sx={{ height: 36, textTransform: 'none' }}>
            Sign in
          </Button>
        </Box>
      </Box>
      {ready && children}
    </Box>
  );
};

export default GuestSampleView;
