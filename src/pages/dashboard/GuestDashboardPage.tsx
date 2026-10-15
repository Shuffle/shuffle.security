/**
 * Signed-out /dashboard — renders the real overview charts with sample data
 * so visitors can see the dashboard before creating an account.
 */
import { useMemo } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { Link } from '@/lib/router-compat';
import { DashboardOverview } from '@/components/dashboard/DashboardOverview';

const DAY = 86_400_000;
const STATUSES = ['new', 'in_progress', 'resolved', 'resolved', 'on_hold', 'new', 'resolved'];
const SEVERITIES = ['low', 'medium', 'medium', 'high', 'critical', 'low', 'informational', 'high'];

/** Deterministic sample incidents spread over the last 30 days. */
export function buildSampleIncidents(now = Date.now(), count = 140) {
  const out: { status: string; severity: string; createdTs: number }[] = [];
  for (let i = 0; i < count; i++) {
    const dayOffset = (i * 7919) % 30;
    const hourOffset = (i * 104729) % 24;
    out.push({
      status: STATUSES[i % STATUSES.length],
      severity: SEVERITIES[(i * 3) % SEVERITIES.length],
      createdTs: now - dayOffset * DAY - hourOffset * 3_600_000,
    });
  }
  return out;
}

const SAMPLE_VULNS = { critical: 7, high: 23, medium: 58, low: 41, info: 12 };

const GuestDashboardPage = () => {
  const incidents = useMemo(() => buildSampleIncidents(), []);
  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', px: { xs: 2, md: 4 }, py: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap',
        p: 2.5, borderRadius: 2, border: '1px solid hsl(var(--border))', bgcolor: 'hsl(var(--card))',
      }}>
        <Box>
          <Typography sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>You are viewing sample data</Typography>
          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
            Sign in to see the dashboard for your own tenant.
          </Typography>
        </Box>
        <Button component={Link} to="/login?view=/dashboard" variant="contained" sx={{ height: 36, textTransform: 'none' }}>
          Sign in
        </Button>
      </Box>
      <DashboardOverview
        incidents={incidents}
        vulnSeverityCounts={SAMPLE_VULNS}
        monitorHostCount={18}
        runningSensorCount={4}
        days={30}
        gran="daily"
      />
    </Box>
  );
};

export default GuestDashboardPage;
