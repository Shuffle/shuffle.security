import { useState, useCallback } from 'react';
import {
  Select,
  MenuItem,
  FormControl,
  CircularProgress,
  Box,
  Typography,
} from '@mui/material';
import { Shield, User, Eye } from 'lucide-react';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/lib/toast';
import { invalidateUsersCache } from '@/hooks/useUsers';

export type UserRole = 'admin' | 'user' | 'org-reader';

interface UserRoleSelectProps {
  userId: string;
  username: string;
  currentRole?: string;
  disabled?: boolean;
  onRoleChanged?: (newRole: string) => void | Promise<void>;
}

const ROLES: { value: UserRole; label: string; icon: typeof Shield }[] = [
  { value: 'admin', label: 'Admin', icon: Shield },
  { value: 'user', label: 'User', icon: User },
  { value: 'org-reader', label: 'Org Reader', icon: Eye },
];

export const UserRoleSelect = ({
  userId,
  username,
  currentRole = 'user',
  disabled = false,
  onRoleChanged,
}: UserRoleSelectProps) => {
  const { userInfo, refreshUserInfo } = useAuth();
  const orgId = userInfo?.active_org?.id || (userInfo as unknown as Record<string, any>)?.org_id || '';

  const normalizedInitial = (currentRole?.toLowerCase() || 'user') as UserRole;
  const [selectedRole, setSelectedRole] = useState<string>(
    ROLES.some((r) => r.value === normalizedInitial) ? normalizedInitial : currentRole || 'user'
  );
  const [isUpdating, setIsUpdating] = useState(false);

  const handleRoleChange = useCallback(
    async (newRole: string) => {
      if (newRole === selectedRole || isUpdating) return;

      const previousRole = selectedRole;
      setSelectedRole(newRole);
      setIsUpdating(true);

      try {
        const payload: Record<string, unknown> = {
          user_id: userId,
          role: newRole,
        };
        if (orgId) {
          payload.org_id = orgId;
        }

        const res = await fetch(getApiUrl('/api/v1/users/updateuser'), {
          method: 'PUT',
          credentials: 'include',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.reason || data.error || `Failed to update role (${res.status})`);
        }

        toast.success(`Updated role for ${username} to ${newRole}`);
        invalidateUsersCache();

        if (userInfo?.id === userId && refreshUserInfo) {
          refreshUserInfo().catch(() => {});
        }

        if (onRoleChanged) {
          await onRoleChanged(newRole);
        }
      } catch (err) {
        setSelectedRole(previousRole);
        toast.error(err instanceof Error ? err.message : 'Failed to update user role');
      } finally {
        setIsUpdating(false);
      }
    },
    [userId, username, selectedRole, isUpdating, orgId, userInfo, refreshUserInfo, onRoleChanged]
  );

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <FormControl size="small">
        <Select
          value={selectedRole}
          onChange={(e) => handleRoleChange(String(e.target.value))}
          disabled={disabled || isUpdating}
          displayEmpty
          sx={{
            height: 24,
            fontSize: '0.7rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: selectedRole === 'admin' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
            bgcolor: selectedRole === 'admin' ? 'hsl(var(--primary) / 0.08)' : 'hsl(var(--muted) / 0.4)',
            borderRadius: 1,
            '& .MuiSelect-select': {
              py: 0.25,
              px: 1,
              pr: '22px !important',
              display: 'flex',
              alignItems: 'center',
            },
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: selectedRole === 'admin' ? 'hsl(var(--primary) / 0.3)' : 'hsl(var(--border))',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: 'hsl(var(--primary))',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: 'hsl(var(--primary))',
            },
            '& .MuiSvgIcon-root': {
              fontSize: '1rem',
              color: 'hsl(var(--muted-foreground))',
              right: 2,
            },
          }}
          MenuProps={{
            PaperProps: {
              sx: {
                bgcolor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 1.5,
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
                '& .MuiMenuItem-root': {
                  fontSize: '0.8rem',
                  color: 'hsl(var(--foreground))',
                  py: 1,
                  px: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  '&:hover': {
                    bgcolor: 'hsl(var(--muted) / 0.6)',
                  },
                  '&.Mui-selected': {
                    bgcolor: 'hsl(var(--primary) / 0.1)',
                    color: 'hsl(var(--primary))',
                    fontWeight: 600,
                    '&:hover': {
                      bgcolor: 'hsl(var(--primary) / 0.15)',
                    },
                  },
                },
              },
            },
          }}
        >
          {ROLES.map((role) => {
            const Icon = role.icon;
            return (
              <MenuItem key={role.value} value={role.value}>
                <Icon size={14} />
                <Typography variant="inherit">{role.label}</Typography>
              </MenuItem>
            );
          })}
          {!ROLES.some((r) => r.value === selectedRole) && (
            <MenuItem value={selectedRole}>
              <User size={14} />
              <Typography variant="inherit">{selectedRole}</Typography>
            </MenuItem>
          )}
        </Select>
      </FormControl>
      {isUpdating && <CircularProgress size={14} sx={{ color: 'hsl(var(--primary))' }} />}
    </Box>
  );
};

export default UserRoleSelect;
