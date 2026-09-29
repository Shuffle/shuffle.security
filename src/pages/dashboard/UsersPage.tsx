import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
} from '@mui/material';
import TenantManagement from '@/components/tenants/TenantManagement';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { useAuth } from '@/context/AuthContext';
import { OnCallScheduleManager, type OnCallUser } from '@/components/users/OnCallScheduleManager';
import { ScheduleHealthBanner } from '@/components/users/ScheduleHealthBanner';
import { PagerNotificationSettings } from '@/components/settings/PagerNotificationSettings';
import { usePageMeta } from '@/hooks/usePageMeta';

interface User extends OnCallUser {
  orgs?: string[];
  created_at?: number;
}

const UsersPage = ({ embedded }: { embedded?: boolean }) => {

  usePageMeta({
    title: 'Users',
    description: 'Manage users, roles, and access in your organization.',
    url: '/users',
  });
  const [activeTab, setActiveTab] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { sessionToken } = useAuth();

  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch(getApiUrl('/api/v1/getusers'), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.reason || 'Failed to fetch users');
      }

      const data = await response.json();
      setUsers(Array.isArray(data) ? data : data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [sessionToken, fetchUsers]);

  return (
    <Box sx={{ p: embedded ? 0 : { xs: 2, md: 4 }, maxWidth: 1400, width: '100%', mx: embedded ? 0 : 'auto' }}>
      {!embedded && (
        <>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              color: 'hsl(var(--foreground))',
              letterSpacing: '-0.02em',
              mb: 1,
            }}
          >
            Tenant Admin
          </Typography>
          <Typography variant="body1" sx={{ color: 'hsl(var(--muted-foreground))', mb: 3 }}>
            Manage your team members and sub-tenants
          </Typography>

          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            sx={{
              mb: 4,
              '& .MuiTabs-indicator': { bgcolor: 'hsl(var(--primary))' },
              '& .MuiTab-root': {
                color: 'hsl(var(--muted-foreground))',
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '0.9rem',
                '&.Mui-selected': { color: 'hsl(var(--foreground))' },
              },
            }}
          >
            <Tab label="User Management" />
            <Tab label="Tenant Management" />
          </Tabs>
        </>
      )}

      {!embedded && activeTab === 1 ? (
        <TenantManagement />
      ) : (
        <>
          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>
          )}
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
              <CircularProgress sx={{ color: 'hsl(var(--primary))' }} />
            </Box>
          ) : (
            <>
              <Box sx={{ mb: 4 }}>
                <PagerNotificationSettings />
              </Box>
              <ScheduleHealthBanner hideManageCta />
              <OnCallScheduleManager users={users} loading={loading} onRefreshUsers={fetchUsers} />
            </>
          )}
        </>
      )}
    </Box>
  );
};

export default UsersPage;
