import { ChevronDown as ExpandMoreIcon, Plus as AddIcon, ArrowLeftRight as SwapIcon } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
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
  Avatar,
  Button,
  CircularProgress,
  Alert,
  Collapse,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/lib/toast';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { useAuth } from '@/context/AuthContext';
import { useSubOrgs, SubOrg } from '@/hooks/useSubOrgs';
import { getRegionFlag } from '@/lib/regionFlag';

interface OrgRowProps {
  org: { id: string; name: string; image?: string; creator_org?: string; region_url?: string };
  currentOrgId?: string;
  switchingOrgId: string | null;
  onSwitchOrg: (orgId: string) => void;
  showSwitch?: boolean;
}

const OrgRow = ({ org, currentOrgId, switchingOrgId, onSwitchOrg, showSwitch = true }: OrgRowProps) => {
  const isCurrent = org.id === currentOrgId;
  const region = getRegionFlag(org.region_url);
  return (
    <TableRow hover sx={{ opacity: switchingOrgId === org.id ? 0.5 : 1 }}>
      <TableCell>
        <Avatar
          src={org.image && org.image.startsWith('data:') ? org.image : undefined}
          sx={{ bgcolor: 'hsl(var(--primary))', width: 36, height: 36, fontSize: '0.875rem' }}
        >
          {(org.name || org.id)?.charAt(0).toUpperCase() || '?'}
        </Avatar>
      </TableCell>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 500, color: 'hsl(var(--foreground))' }}>
            {org.name || org.id}
          </Typography>
          {isCurrent && (
            <Chip label="Current" size="small" sx={{ height: 20, fontSize: '0.7rem', bgcolor: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }} />
          )}
        </Box>
      </TableCell>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <span>{region.flag}</span>
          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem' }}>
            {region.code}
          </Typography>
        </Box>
      </TableCell>
      <TableCell>
        <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', fontFamily: 'monospace', fontSize: '0.75rem' }}>
          {org.id}
        </Typography>
      </TableCell>
      <TableCell>
        {showSwitch && !isCurrent && (
          <Button
            size="small"
            variant="outlined"
            startIcon={switchingOrgId === org.id ? <CircularProgress size={14} /> : <SwapIcon />}
            disabled={!!switchingOrgId}
            onClick={() => onSwitchOrg(org.id)}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
              '&:hover': { borderColor: 'hsl(var(--primary))', bgcolor: 'hsl(var(--primary) / 0.1)' },
            }}
          >
            Switch
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
};

interface CreateSubTenantDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<string | true>;
  creating: boolean;
}

const CreateSubTenantDialog: React.FC<CreateSubTenantDialogProps> = ({
  open,
  onClose,
  onSubmit,
  creating,
}) => {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!name.trim() || creating) return;
    setError(null);
    const result = await onSubmit(name.trim());
    if (result !== true) {
      setError(typeof result === 'string' ? result : 'Failed to create sub-organization');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !creating && onClose()}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            bgcolor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
          },
        },
      }}
    >
      <DialogTitle sx={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}>
        Create Sub-Tenant
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', mb: 2 }}>
          Create a new sub-tenant under your current tenant.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 1.5 }}>
            {error}
          </Alert>
        )}
        <TextField
          autoFocus
          fullWidth
          label="Tenant Name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          disabled={creating}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          sx={{
            '& .MuiOutlinedInput-root': {
              color: 'hsl(var(--foreground))',
              '& fieldset': { borderColor: 'hsl(var(--border))' },
              '&:hover fieldset': { borderColor: 'hsl(var(--primary))' },
            },
            '& .MuiInputLabel-root': { color: 'hsl(var(--muted-foreground))' },
          }}
        />
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button
          onClick={onClose}
          disabled={creating}
          sx={{ color: 'hsl(var(--muted-foreground))', textTransform: 'none' }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={creating || !name.trim()}
          variant="contained"
          sx={{
            textTransform: 'none',
            bgcolor: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
          }}
        >
          {creating ? <CircularProgress size={20} /> : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

interface TenantManagementHostProps {
  autoOpenCreate?: boolean | number;
}

const TenantManagement = ({ autoOpenCreate }: TenantManagementHostProps = {}) => {
  const { userInfo, setActiveOrg } = useAuth();
  const currentOrgId = userInfo?.active_org?.id;
  const { subOrgs, parentOrg, isLoading: subOrgsLoading, refetch: refetchSubOrgs } = useSubOrgs(currentOrgId);

  // All orgs from getinfo
  const allOrgs = userInfo?.orgs || [];

  // Collapsible sections
  const [showSubOrgs, setShowSubOrgs] = useState(false);
  const [showAllOrgs, setShowAllOrgs] = useState(false);

  // Create sub-org dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(() => {
    if (autoOpenCreate) return true;
    if (typeof window !== 'undefined') {
      const search = new URLSearchParams(window.location.search);
      return search.get('click') === 'add-tenant';
    }
    return false;
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (autoOpenCreate) {
      setCreateDialogOpen(true);
    }
  }, [autoOpenCreate]);

  // Switching org state
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null);

  const handleSwitchOrg = async (orgId: string) => {
    if (orgId === currentOrgId) return;
    setSwitchingOrgId(orgId);
    try {
      await setActiveOrg(orgId);
    } catch {
      setSwitchingOrgId(null);
    }
  };

  const handleCreateSubOrg = async (name: string): Promise<string | true> => {
    if (!name.trim() || !currentOrgId) return 'Tenant name and active organization are required';
    setCreating(true);
    try {
      const response = await fetch(getApiUrl(`/api/v1/orgs/${currentOrgId}/create_sub_org`), {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ org_id: currentOrgId, name: name.trim() }),
      });

      if (!response.ok) {
        let errorMsg = '';
        try {
          const data = await response.json();
          if (data && typeof data === 'object') {
            if (data.reason) {
              errorMsg = data.reason;
            } else if (data.message) {
              errorMsg = data.message;
            } else if (data.error) {
              errorMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
            }
          }
        } catch {
          try {
            const text = await response.text();
            if (text) errorMsg = text;
          } catch {}
        }

        if (response.status === 401) {
          if (!errorMsg) {
            errorMsg = 'Unauthorized: You do not have permission or a license to create sub-tenants.';
          }
        } else if (!errorMsg) {
          errorMsg = `Failed to create sub-organization (HTTP ${response.status})`;
        }

        toast.error(errorMsg);
        return errorMsg;
      }

      toast.success(`Sub-organization "${name.trim()}" created successfully`);
      setCreateDialogOpen(false);
      refetchSubOrgs();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create sub-organization';
      toast.error(msg);
      return msg;
    } finally {
      setCreating(false);
    }
  };
  return (
    <Box>
      {/* Header with Create button */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
            Tenants
          </Typography>
          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', mt: 0.5 }}>
            Create, manage and switch between sub-organizations (tenants).
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
          sx={{
            textTransform: 'none',
            bgcolor: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
          }}
        >
          Add sub-tenant
        </Button>
      </Box>

      {/* Current Tenant */}
      <Paper sx={{ bgcolor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', mb: 3 }}>
        <Box sx={{ p: 2.5, borderBottom: '1px solid hsl(var(--border))' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
            Current Tenant
          </Typography>
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 60, color: 'hsl(var(--muted-foreground))' }}>Logo</TableCell>
                <TableCell sx={{ color: 'hsl(var(--muted-foreground))' }}>Name</TableCell>
                <TableCell sx={{ width: 80, color: 'hsl(var(--muted-foreground))' }}>Region</TableCell>
                <TableCell sx={{ color: 'hsl(var(--muted-foreground))' }}>ID</TableCell>
                <TableCell sx={{ width: 120, color: 'hsl(var(--muted-foreground))' }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {userInfo?.active_org ? (
                <OrgRow
                  org={userInfo.active_org}
                  currentOrgId={currentOrgId}
                  switchingOrgId={switchingOrgId}
                  onSwitchOrg={handleSwitchOrg}
                  showSwitch={false}
                />
              ) : (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>No active tenant</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Parent Tenant (if exists) */}
      {parentOrg && parentOrg.id !== currentOrgId && (
        <Paper sx={{ bgcolor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', mb: 3 }}>
          <Box sx={{ p: 2.5, borderBottom: '1px solid hsl(var(--border))' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              Parent Tenant
            </Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 60, color: 'hsl(var(--muted-foreground))' }}>Logo</TableCell>
                  <TableCell sx={{ color: 'hsl(var(--muted-foreground))' }}>Name</TableCell>
                  <TableCell sx={{ width: 80, color: 'hsl(var(--muted-foreground))' }}>Region</TableCell>
                  <TableCell sx={{ color: 'hsl(var(--muted-foreground))' }}>ID</TableCell>
                  <TableCell sx={{ width: 120, color: 'hsl(var(--muted-foreground))' }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <OrgRow
                  org={parentOrg}
                  currentOrgId={currentOrgId}
                  switchingOrgId={switchingOrgId}
                  onSwitchOrg={handleSwitchOrg}
                />
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Sub Tenants */}
      <Paper sx={{ bgcolor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', mb: 3 }}>
        <Box
          onClick={() => setShowSubOrgs(!showSubOrgs)}
          sx={{
            p: 2.5,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            '&:hover': { bgcolor: 'hsl(var(--muted) / 0.5)' },
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
            Sub Tenants{subOrgs.length > 0 ? ` (${subOrgs.length})` : ''}
          </Typography>
          <ExpandMoreIcon style={{ color: 'hsl(var(--muted-foreground))', transform: showSubOrgs ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
        </Box>
        <Collapse in={showSubOrgs}>
          {subOrgsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : subOrgs.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                No sub-tenants found
              </Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 60, color: 'hsl(var(--muted-foreground))' }}>Logo</TableCell>
                    <TableCell sx={{ color: 'hsl(var(--muted-foreground))' }}>Name</TableCell>
                    <TableCell sx={{ width: 80, color: 'hsl(var(--muted-foreground))' }}>Region</TableCell>
                    <TableCell sx={{ color: 'hsl(var(--muted-foreground))' }}>ID</TableCell>
                    <TableCell sx={{ width: 120, color: 'hsl(var(--muted-foreground))' }}>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {subOrgs.map((org) => (
                    <OrgRow
                      key={org.id}
                      org={org}
                      currentOrgId={currentOrgId}
                      switchingOrgId={switchingOrgId}
                      onSwitchOrg={handleSwitchOrg}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Collapse>
      </Paper>

      {/* All Tenants */}
      <Paper sx={{ bgcolor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
        <Box
          onClick={() => setShowAllOrgs(!showAllOrgs)}
          sx={{
            p: 2.5,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            '&:hover': { bgcolor: 'hsl(var(--muted) / 0.5)' },
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
            All Tenants{allOrgs.length > 0 ? ` (${allOrgs.length})` : ''}
          </Typography>
          <ExpandMoreIcon style={{ color: 'hsl(var(--muted-foreground))', transform: showAllOrgs ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
        </Box>
        <Collapse in={showAllOrgs}>
          {allOrgs.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                No tenants available
              </Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 60, color: 'hsl(var(--muted-foreground))' }}>Logo</TableCell>
                    <TableCell sx={{ color: 'hsl(var(--muted-foreground))' }}>Name</TableCell>
                    <TableCell sx={{ width: 80, color: 'hsl(var(--muted-foreground))' }}>Region</TableCell>
                    <TableCell sx={{ color: 'hsl(var(--muted-foreground))' }}>ID</TableCell>
                    <TableCell sx={{ width: 120, color: 'hsl(var(--muted-foreground))' }}>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {allOrgs.map((org) => (
                    <OrgRow
                      key={org.id}
                      org={org}
                      currentOrgId={currentOrgId}
                      switchingOrgId={switchingOrgId}
                      onSwitchOrg={handleSwitchOrg}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Collapse>
      </Paper>

      {/* Create Sub-Tenant Dialog */}
      <CreateSubTenantDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSubmit={handleCreateSubOrg}
        creating={creating}
      />
    </Box>
  );
};

export default TenantManagement;
