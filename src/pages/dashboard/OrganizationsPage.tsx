import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Avatar,
  CircularProgress,
  Alert,
} from '@mui/material';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { useAuth } from '@/context/AuthContext';
import { usePageMeta } from '@/hooks/usePageMeta';

interface Organization {
  id: string;
  name: string;
  description?: string;
  image?: string;
  users?: unknown[];
  child_orgs?: unknown[];
  creator_org?: string;
  cloud_sync?: boolean;
}

const OrganizationsPage = () => {

  usePageMeta({
    title: 'Organizations',
    description: 'Manage organizations and tenant access in Shuffle Security.',
    url: '/organizations',
  });
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { sessionToken } = useAuth();

  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        const response = await fetch(getApiUrl('/api/v1/orgs'), {
          credentials: 'include',
          headers: {
            ...getAuthHeader(),
          },
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.reason || 'Failed to fetch organizations');
        }

        const data = await response.json();
        setOrgs(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch organizations');
      } finally {
        setLoading(false);
      }
    };

    if (sessionToken) {
      fetchOrgs();
    }
  }, [sessionToken]);

  return (
    <Box sx={{ p: 4, maxWidth: 1400, width: '100%', mx: 'auto' }}>
      <Typography variant="h4" sx={{ fontWeight: 600, mb: 4 }}>
        Tenants
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ bgcolor: 'background.paper' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Tenant</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Users</TableCell>
                <TableCell>Sub-tenants</TableCell>
                <TableCell>Sync</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orgs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      No tenants found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                orgs.map((org) => (
                  <TableRow key={org.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar 
                          src={org.image && org.image.startsWith('data:') ? org.image : undefined}
                          sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}
                        >
                          {org.name?.charAt(0).toUpperCase() || '?'}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {org.name}
                          </Typography>
                          {org.creator_org && (
                            <Typography variant="caption" color="text.secondary">
                              Child tenant
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 200 }} noWrap>
                        {org.description || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {org.users?.length || 0}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {org.child_orgs?.length || 0}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={org.cloud_sync ? 'Enabled' : 'Disabled'}
                        size="small"
                        color={org.cloud_sync ? 'success' : 'default'}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default OrganizationsPage;
