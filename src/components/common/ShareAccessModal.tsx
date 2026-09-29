import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  Switch,
  Alert,
  CircularProgress,
  Divider,
  Autocomplete,
} from '@mui/material';
import { X as CloseIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useUsers } from '@/hooks/useUsers';
import { RBACConfig } from '@/Shuffle-Core/datastore';

export type AccessRole = 'viewer' | 'editor';

export interface ShareAccessModalProps {
  open: boolean;
  onClose: () => void;
  resourceType: 'key' | 'category';
  resourceName: string;
  parentName?: string;
  initialRBAC?: RBACConfig | null;
  onSave: (rbac: RBACConfig | null) => Promise<void>;
}

interface AccessEntry {
  id: string; // user ID or role name
  type: 'user' | 'role';
  name: string;
  email?: string;
  role: AccessRole | 'owner';
  isOwner?: boolean;
}

const DEFAULT_ROLES = [
  { id: 'admin', name: 'Admins (admin)', description: 'Organization administrators' },
  { id: 'user', name: 'Users (user)', description: 'Standard organization users' },
  { id: 'org-reader', name: 'Readers (org-reader)', description: 'Read-only organization members' },
];

export const ShareAccessModal: React.FC<ShareAccessModalProps> = ({
  open,
  onClose,
  resourceType,
  resourceName,
  parentName,
  initialRBAC,
  onSave,
}) => {
  const { userInfo } = useAuth();
  const { users: tenantUsers, loading: loadingUsers } = useUsers();

  const currentUserId = userInfo?.id || '';
  const currentUsername = userInfo?.username || 'Current User';
  const currentUserEmail = (userInfo as unknown as Record<string, string>)?.email || '';

  // Whether RBAC is actively configured on this object
  const [rbacEnabled, setRbacEnabled] = useState(false);
  const [inherit, setInherit] = useState(true);
  const [entries, setEntries] = useState<AccessEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Search/Add input state
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  const [candidateSearchText, setCandidateSearchText] = useState('');
  const [selectedRole, setSelectedRole] = useState<AccessRole>('editor');

  // Parse initial RBAC into state
  useEffect(() => {
    if (!open) return;
    setSaveError(null);
    setSelectedCandidate(null);
    setCandidateSearchText('');

    const hasActiveRules =
      Boolean(initialRBAC) &&
      (Boolean(initialRBAC?.read?.roles?.length) ||
        Boolean(initialRBAC?.read?.users?.length) ||
        Boolean(initialRBAC?.write?.roles?.length) ||
        Boolean(initialRBAC?.write?.users?.length) ||
        Boolean(initialRBAC?.admin?.roles?.length) ||
        Boolean(initialRBAC?.admin?.users?.length) ||
        Boolean(initialRBAC?.inherit));

    setRbacEnabled(hasActiveRules);
    setInherit(initialRBAC?.inherit !== false);

    // Build entry list
    const parsedEntries: AccessEntry[] = [];

    // Always ensure current user is Owner
    parsedEntries.push({
      id: currentUserId || 'owner',
      type: 'user',
      name: currentUsername,
      email: currentUserEmail,
      role: 'owner',
      isOwner: true,
    });

    if (initialRBAC) {
      const readUsers = initialRBAC.read?.users || [];
      const writeUsers = initialRBAC.write?.users || [];
      const adminUsers = initialRBAC.admin?.users || [];

      const readRoles = initialRBAC.read?.roles || [];
      const writeRoles = initialRBAC.write?.roles || [];
      const adminRoles = initialRBAC.admin?.roles || [];

      // Collect all unique user IDs and deduplicate against tenantUsers
      const userEntryMap = new Map<string, { role: AccessRole; userObj?: any }>();
      const allUserIds = Array.from(new Set([...readUsers, ...writeUsers, ...adminUsers]));
      for (const uId of allUserIds) {
        if (uId === currentUserId || uId === currentUsername) continue;
        const matchedTenantUser = tenantUsers.find(
          (u) => u.id === uId || u.username === uId
        );
        const canonicalId = matchedTenantUser?.id || uId;
        const userRole: AccessRole = (adminUsers.includes(uId) || writeUsers.includes(uId)) ? 'editor' : 'viewer';

        if (!userEntryMap.has(canonicalId) || userRole === 'editor') {
          userEntryMap.set(canonicalId, { role: userRole, userObj: matchedTenantUser });
        }
      }

      for (const [canonicalId, info] of userEntryMap.entries()) {
        parsedEntries.push({
          id: canonicalId,
          type: 'user',
          name: info.userObj?.username || canonicalId,
          email: (info.userObj as unknown as Record<string, string>)?.email || '',
          role: info.role,
          isOwner: false,
        });
      }

      // Collect all unique roles
      const allRoles = Array.from(new Set([...readRoles, ...writeRoles, ...adminRoles]));
      for (const rId of allRoles) {
        let roleRole: AccessRole = 'viewer';
        if (adminRoles.includes(rId) || writeRoles.includes(rId)) {
          roleRole = 'editor';
        }

        const matchedDefaultRole = DEFAULT_ROLES.find((r) => r.id === rId);
        parsedEntries.push({
          id: rId,
          type: 'role',
          name: matchedDefaultRole?.name || `Role: ${rId}`,
          role: roleRole,
          isOwner: false,
        });
      }
    }

    setEntries(parsedEntries);
  }, [open, initialRBAC, currentUserId, currentUsername, currentUserEmail, tenantUsers]);

  // Autocomplete options: tenant users + default roles
  const autocompleteOptions = useMemo(() => {
    const options: any[] = [];

    // Add roles
    for (const r of DEFAULT_ROLES) {
      const alreadyAdded = entries.some((e) => e.id === r.id);
      if (!alreadyAdded) {
        options.push({
          id: r.id,
          label: r.name,
          category: 'Roles',
          type: 'role',
          subtext: r.description,
        });
      }
    }

    // Add tenant users
    for (const u of tenantUsers) {
      const alreadyAdded = entries.some((e) => e.id === u.id || e.id === u.username);
      if (!alreadyAdded) {
        const email = (u as unknown as Record<string, string>)?.email || '';
        options.push({
          id: u.id,
          username: u.username,
          label: `${u.username}${email ? ` (${email})` : ''}`,
          category: 'People in Organization',
          type: 'user',
          email,
        });
      }
    }

    return options;
  }, [tenantUsers, entries]);

  // Track typed candidate
  const handleInputChange = (_: any, newInputValue: string) => {
    setCandidateSearchText(newInputValue);
  };

  const handleAddCandidate = () => {
    let candidate = selectedCandidate;
    const text = candidateSearchText.trim();

    if (!candidate && text) {
      const lower = text.toLowerCase();
      const matched = tenantUsers.find(
        (u) =>
          u.username.toLowerCase() === lower ||
          u.id.toLowerCase() === lower ||
          ((u as unknown as Record<string, string>)?.email || '').toLowerCase() === lower
      );
      if (matched) {
        candidate = {
          id: matched.id,
          label: matched.username || matched.id,
          type: 'user',
          category: 'People',
          username: matched.username,
        };
      } else {
        const matchedRole = DEFAULT_ROLES.find(
          (r) => r.id.toLowerCase() === lower || r.name.toLowerCase() === lower
        );
        if (matchedRole) {
          candidate = matchedRole;
        } else {
          // Freeform email or username - will be validated and normalized server-side
          candidate = {
            id: text,
            label: text,
            type: 'user',
            category: 'People',
            username: text,
            email: text.includes('@') ? text : undefined,
          };
        }
      }
    }

    if (!candidate) return;

    setRbacEnabled(true);

    const canonicalId = candidate.id || candidate.username;
    if (entries.some((e) => e.id.toLowerCase() === canonicalId.toLowerCase())) {
      setSelectedCandidate(null);
      setCandidateSearchText('');
      return;
    }

    const newEntry: AccessEntry = {
      id: canonicalId,
      type: candidate.type,
      name: candidate.username || candidate.label || canonicalId,
      email: candidate.email || (canonicalId.includes('@') ? canonicalId : ''),
      role: selectedRole,
      isOwner: false,
    };

    setEntries((prev) => [...prev, newEntry]);
    setSelectedCandidate(null);
    setCandidateSearchText('');
  };

  const handleRoleChange = (id: string, newRole: AccessRole | 'remove') => {
    if (newRole === 'remove') {
      // Owner cannot be removed
      setEntries((prev) => prev.filter((e) => e.id !== id || e.isOwner));
      return;
    }

    setEntries((prev) =>
      prev.map((e) => (e.id === id && !e.isOwner ? { ...e, role: newRole } : e))
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      // If RBAC is disabled or no custom rules were added beyond owner and inherit is default,
      // return null so it does NOTHING until roles are assigned
      const hasOtherRules = entries.some((e) => !e.isOwner);
      const isInheritOnly = resourceType === 'key' && inherit && !hasOtherRules;

      if (!rbacEnabled && !isInheritOnly) {
        await onSave(null);
        onClose();
        return;
      }

      // Build RBACConfig payload
      const readUsers: string[] = [];
      const writeUsers: string[] = [];
      const adminUsers: string[] = [];

      const readRoles: string[] = [];
      const writeRoles: string[] = [];
      const adminRoles: string[] = [];

      // Owner is always added using their canonical user ID
      const ownerId = currentUserId || currentUsername;
      if (ownerId) {
        readUsers.push(ownerId);
        writeUsers.push(ownerId);
        adminUsers.push(ownerId);
      }

      for (const entry of entries) {
        if (entry.isOwner) continue;

        if (entry.type === 'user') {
          if (entry.role === 'viewer') {
            readUsers.push(entry.id);
          } else if (entry.role === 'editor') {
            readUsers.push(entry.id);
            writeUsers.push(entry.id);
          }
        } else if (entry.type === 'role') {
          if (entry.role === 'viewer') {
            readRoles.push(entry.id);
          } else if (entry.role === 'editor') {
            readRoles.push(entry.id);
            writeRoles.push(entry.id);
          }
        }
      }

      const rbacConfig: RBACConfig = {
        inherit: resourceType === 'key' ? inherit : undefined,
        read: {
          users: Array.from(new Set(readUsers)),
          roles: Array.from(new Set(readRoles)),
        },
        write: {
          users: Array.from(new Set(writeUsers)),
          roles: Array.from(new Set(writeRoles)),
        },
        admin: {
          users: Array.from(new Set(adminUsers)),
          roles: Array.from(new Set(adminRoles)),
        },
      };

      await onSave(rbacConfig);
      onClose();
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save permissions');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefault = () => {
    setRbacEnabled(false);
    setEntries((prev) => prev.filter((e) => e.isOwner));
    setInherit(true);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          border: '1px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--card))',
          backgroundImage: 'none',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        },
      }}
    >
      <DialogTitle
        sx={{
          pt: 2.5,
          pb: 1,
          px: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography sx={{ fontSize: '1.05rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
          Share &ldquo;{resourceName}&rdquo;
        </Typography>
        <IconButton
          size="small"
          onClick={onClose}
          sx={{
            color: 'hsl(var(--muted-foreground))',
            '&:hover': { color: 'hsl(var(--foreground))' },
          }}
        >
          <CloseIcon size={18} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3, pt: 1.5, pb: 2.5 }}>
        {saveError && (
          <Alert severity="error" sx={{ mb: 2, fontSize: '0.82rem' }}>
            {saveError}
          </Alert>
        )}

        {/* Add people / roles input */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Autocomplete
              fullWidth
              freeSolo
              size="small"
              options={autocompleteOptions}
              groupBy={(option) => typeof option === 'string' ? 'People' : option.category}
              getOptionLabel={(option) => (typeof option === 'string' ? option : option.label || option.id)}
              value={selectedCandidate}
              onChange={(_, newValue) => {
                if (typeof newValue === 'string') {
                  setCandidateSearchText(newValue);
                  setSelectedCandidate(null);
                } else {
                  setSelectedCandidate(newValue);
                  setCandidateSearchText('');
                }
              }}
              inputValue={candidateSearchText}
              onInputChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCandidate();
                }
              }}
              loading={loadingUsers}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Add people (email or username) or roles"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: 'hsl(var(--background))',
                      borderRadius: 1.5,
                      fontSize: '0.85rem',
                    },
                  }}
                />
              )}
            />

            <FormControl size="small" sx={{ minWidth: 105 }}>
              <Select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as AccessRole)}
                sx={{
                  bgcolor: 'hsl(var(--background))',
                  borderRadius: 1.5,
                  fontSize: '0.85rem',
                  '& .MuiSelect-select': { py: 1 },
                }}
              >
                <MenuItem value="viewer">Viewer</MenuItem>
                <MenuItem value="editor">Editor</MenuItem>
              </Select>
            </FormControl>

            <Button
              variant="contained"
              size="small"
              onClick={handleAddCandidate}
              disabled={!selectedCandidate && !candidateSearchText.trim()}
              sx={{
                height: 40,
                px: 2,
                borderRadius: 1.5,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.85rem',
                bgcolor: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
              }}
            >
              Add
            </Button>
          </Box>
        </Box>

        {/* Key inheritance option */}
        {resourceType === 'key' && (
          <Box
            sx={{
              mb: 3,
              p: 1.5,
              borderRadius: 2,
              border: '1px solid hsl(var(--border))',
              bgcolor: 'hsl(var(--muted) / 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Box>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: 'hsl(var(--foreground))' }}>
                Inherit category permissions
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                {parentName
                  ? `Members with access to category "${parentName}" will automatically have access to this key`
                  : 'Inherit access rules from parent category'}
              </Typography>
            </Box>
            <Switch
              checked={inherit}
              onChange={(e) => {
                setInherit(e.target.checked);
                setRbacEnabled(true);
              }}
              color="primary"
            />
          </Box>
        )}

        {/* People with access list */}
        <Box sx={{ mb: 2 }}>
          <Typography
            sx={{
              fontSize: '0.8rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: 'hsl(var(--muted-foreground))',
              mb: 1.5,
            }}
          >
            People with access
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {entries.map((entry) => {
              const matchedUser = entry.type === 'user'
                ? tenantUsers.find((u) => u.id === entry.id || u.username === entry.id)
                : null;
              const displayName = matchedUser?.username || entry.name;
              const initialLetter = (displayName || 'U').charAt(0).toUpperCase();

              // Only display secondary text for roles ("Role-based access") or if
              // a distinct email is available that isn't identical to the display name.
              // Never display raw user IDs or UUIDs.
              const secondaryText = (() => {
                if (entry.type === 'role') return 'Role-based access';
                const email = entry.email || (matchedUser as unknown as Record<string, string>)?.email || '';
                if (email && email.includes('@') && email.toLowerCase() !== displayName.toLowerCase()) {
                  return email;
                }
                return null;
              })();

              return (
                <Box
                  key={entry.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    py: 0.75,
                    px: 1,
                    borderRadius: 1.5,
                    '&:hover': { bgcolor: 'hsl(var(--muted) / 0.15)' },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {/* Plain circular avatar with initial */}
                    <Box
                      sx={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        bgcolor: entry.isOwner
                          ? '#ea580c'
                          : entry.type === 'role'
                          ? 'hsl(var(--secondary))'
                          : 'hsl(var(--muted))',
                        color: entry.isOwner
                          ? '#ffffff'
                          : 'hsl(var(--foreground))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        border: '1px solid hsl(var(--border))',
                        flexShrink: 0,
                      }}
                    >
                      {initialLetter}
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: 'hsl(var(--foreground))' }}>
                        {displayName} {entry.isOwner && '(you)'}
                      </Typography>
                      {secondaryText && (
                        <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                          {secondaryText}
                        </Typography>
                      )}
                    </Box>
                  </Box>

                  {entry.isOwner ? (
                    <Typography
                      sx={{
                        fontSize: '0.85rem',
                        color: 'hsl(var(--muted-foreground))',
                        px: 1.5,
                        py: 0.5,
                        fontWeight: 500,
                      }}
                    >
                      Owner
                    </Typography>
                  ) : (
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                      <Select
                        value={entry.role}
                        onChange={(e) => handleRoleChange(entry.id, e.target.value as any)}
                        sx={{
                          fontSize: '0.82rem',
                          bgcolor: 'hsl(var(--background))',
                          '& .MuiSelect-select': { py: 0.5, px: 1 },
                        }}
                      >
                        <MenuItem value="viewer">Viewer</MenuItem>
                        <MenuItem value="editor">Editor</MenuItem>
                        <Divider sx={{ my: 0.5 }} />
                        <MenuItem value="remove" sx={{ color: 'hsl(var(--destructive))' }}>
                          Remove access
                        </MenuItem>
                      </Select>
                    </FormControl>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* RBAC Status info box */}
        <Box
          sx={{
            mt: 2,
            p: 1.5,
            borderRadius: 1.5,
            bgcolor: rbacEnabled ? 'hsl(var(--primary) / 0.08)' : 'hsl(var(--muted) / 0.2)',
            border: '1px solid',
            borderColor: rbacEnabled ? 'hsl(var(--primary) / 0.3)' : 'hsl(var(--border))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              {rbacEnabled ? 'RBAC is Active' : 'Default Access (Inactive RBAC)'}
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))' }}>
              {rbacEnabled
                ? 'Only members and roles explicitly listed above have access.'
                : 'All organization members have access based on their default workspace role.'}
            </Typography>
          </Box>

          {rbacEnabled && (
            <Button
              size="small"
              onClick={handleResetToDefault}
              sx={{
                fontSize: '0.75rem',
                textTransform: 'none',
                color: 'hsl(var(--destructive))',
                '&:hover': { bgcolor: 'hsl(var(--destructive) / 0.1)' },
              }}
            >
              Reset to default
            </Button>
          )}
        </Box>
      </DialogContent>

      <Divider sx={{ borderColor: 'hsl(var(--border))' }} />

      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'flex-end', gap: 1 }}>
        <Button
          size="small"
          onClick={onClose}
          sx={{
            textTransform: 'none',
            fontSize: '0.85rem',
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={handleSave}
          disabled={isSaving}
          sx={{
            textTransform: 'none',
            fontSize: '0.85rem',
            fontWeight: 600,
            px: 2.5,
            bgcolor: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
          }}
        >
          {isSaving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
