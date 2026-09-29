import { Save as SaveIcon } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from '@/lib/router-compat';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Alert,
  Avatar,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { toast } from '@/lib/toast';
import { getApiUrl, getAuthHeader, mapCloudRegionUrl } from '@/Shuffle-MCPs/api';
import { useAuth } from '@/context/AuthContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { getRegionFlag } from '@/lib/regionFlag';
import UsersPage from './UsersPage';
import OrgPreferencesPage from './OrgPreferencesPage';
import RuntimeLocationsTab from '@/components/settings/RuntimeLocationsTab';
import { TenantManagement } from '@/Shuffle-Core';
import DatastoreCategories from '@/Shuffle-Core/views/DatastoreCategories';
import { SegmentedControl, type SegmentedItem } from '@/components/ui/segmented-control';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useTheme as useAppTheme } from '@/context/ThemeContext';
import { PagerNotificationSettings } from '@/components/settings/PagerNotificationSettings';
import TenantOAuthTokens from '@/components/tenants/TenantOAuthTokens';

const REGION_OPTIONS = [
  { value: '', label: 'Default (UK)' },
  { value: 'https://uk.shuffle.security', label: 'UK' },
  { value: 'https://us.shuffle.security', label: 'US' },
  { value: 'https://frankfurt.shuffle.security', label: 'DE (Setup in progress)' },
  { value: 'https://eu.shuffle.security', label: 'EU' },
  { value: 'https://ca.shuffle.security', label: 'CA' },
  { value: 'https://au.shuffle.security', label: 'AUS' },
];

interface OrgDetails {
  id: string;
  name: string;
  description: string;
  image: string;
  region_url: string;
}

const AdminPage = () => {

  usePageMeta({
    title: 'Admin',
    description: 'Admin panel for managing users, tenants, and organization-wide settings.',
    url: '/admin',
  });
  const location = useLocation();
  const navigate = useNavigate();
  const { userInfo, isLoading: authLoading, refreshUserInfo, setActiveOrg } = useAuth();
  const isAdmin = useIsAdmin();
  const { resolvedTheme } = useAppTheme();
  const shuffleTheme = (resolvedTheme === 'light' ? 'light' : 'dark') as 'light' | 'dark';
  const orgId = userInfo?.active_org?.id;

  // Determine active tab from path
  const getTabFromPath = useCallback(() => {
    if (location.pathname === '/admin/users') return 1;
    if (location.pathname === '/admin/tenants') return 2;
    if (location.pathname === '/admin/runtime-locations' || location.pathname === '/admin/locations') return 3;
    if (location.pathname === '/admin/preferences') return 4;
    if (location.pathname === '/admin/datastore') return 5;
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('admin_tab') || searchParams.get('tab');
    if (tabParam === 'users') return 1;
    if (tabParam === 'tenants') return 2;
    if (tabParam === 'runtime-locations' || tabParam === 'locations') return 3;
    if (tabParam === 'preferences') return 4;
    if (tabParam === 'datastore') return 5;
    return 0;
  }, [location.pathname, location.search]);

  const [activeTab, setActiveTab] = useState(getTabFromPath());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fullOrg, setFullOrg] = useState<any>(null);
  const oauthTokens = fullOrg?.oauth_tokens ?? (userInfo?.active_org as any)?.oauth_tokens;
  const hasOAuthTokens = oauthTokens !== undefined && oauthTokens !== null;

  const [orgName, setOrgName] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  const [orgImage, setOrgImage] = useState('');
  const [orgRegionUrl, setOrgRegionUrl] = useState('');
  const [changingOrg, setChangingOrg] = useState(false);

  // Track original values to detect changes
  const [originalName, setOriginalName] = useState('');
  const [originalDescription, setOriginalDescription] = useState('');
  const [originalImage, setOriginalImage] = useState('');
  const [originalRegionUrl, setOriginalRegionUrl] = useState('');

  // Auto-open create tenant dialog trigger
  const [createTenantTrigger, setCreateTenantTrigger] = useState(0);

  // Tab redirection: /admin?tab=datastore&category=... -> /admin/datastore?category=...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab') || params.get('admin_tab');
    if (tabParam && (location.pathname === '/admin' || location.pathname === '/admin/')) {
      const lower = tabParam.toLowerCase();
      if (!isAdmin && lower !== 'overview' && lower !== 'tenants') {
        params.delete('tab');
        params.delete('admin_tab');
        const remaining = params.toString();
        navigate(`/admin${remaining ? `?${remaining}` : ''}`, { replace: true });
        return;
      }
      const tabRoutes: Record<string, string> = {
        datastore: '/admin/datastore',
        users: '/admin/users',
        tenants: '/admin/tenants',
        'runtime-locations': '/admin/runtime-locations',
        locations: '/admin/runtime-locations',
        preferences: '/admin/preferences',
      };
      const target = tabRoutes[lower];
      if (target) {
        params.delete('tab');
        params.delete('admin_tab');
        const remaining = params.toString();
        navigate(`${target}${remaining ? `?${remaining}` : ''}`, { replace: true });
        return;
      }
    }
  }, [location.pathname, location.search, navigate, isAdmin]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('click') === 'add-tenant') {
      setCreateTenantTrigger((prev) => prev + 1);
      params.delete('click');
      const nextSearch = params.toString();
      navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
    }
  }, [location.search, location.pathname, navigate]);

  // Sync tab with route
  useEffect(() => {
    setActiveTab(getTabFromPath());
  }, [getTabFromPath]);

  // Deep link: /admin?org_id=<org id or email> switches the active tenant.
  // The value can be an org id or an email. We delegate directly to setActiveOrg
  // so deep-link switches use the exact same reliable mechanism and auth cache
  // cleanup as the sidebar switcher.
  const orgSwitchHandledRef = useRef(false);
  useEffect(() => {
    if (orgSwitchHandledRef.current) return;
    const params = new URLSearchParams(location.search);
    const requestedOrg = (params.get('org_id') || '').trim();
    if (!requestedOrg) return;
    orgSwitchHandledRef.current = true;

    // Strip the param first — the flow ends in a reload and we do not want
    // the switch to fire again on every reload.
    params.delete('org_id');
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });

    if (requestedOrg === orgId) return;

    setChangingOrg(true);
    setActiveOrg(requestedOrg).catch(err => {
      console.error('Custom org change failed:', err);
      toast.error('Failed to change organization');
      setChangingOrg(false);
    });
  }, [location.search, location.pathname, navigate, orgId, setActiveOrg]);



  // Guard admin-only tabs: non-admins only have access to Overview (0) and Tenants (2)
  useEffect(() => {
    if (!authLoading && userInfo && !isAdmin) {
      if (activeTab !== 0 && activeTab !== 2) {
        navigate('/admin', { replace: true });
      }
    }
  }, [authLoading, userInfo, isAdmin, activeTab, navigate]);

  const handleTabChange = (_: unknown, newValue: number) => {
    if (!isAdmin && newValue !== 0 && newValue !== 2) {
      return;
    }
    setActiveTab(newValue);
    if (newValue === 0) navigate('/admin');
    else if (newValue === 1) navigate('/admin/users');
    else if (newValue === 2) navigate('/admin/tenants');
    else if (newValue === 3) navigate('/admin/runtime-locations');
    else if (newValue === 4) navigate('/admin/preferences');
    else if (newValue === 5) navigate('/admin/datastore');
  };

  // Fetch org details
  const fetchOrg = useCallback(async () => {
    if (!orgId) return;

    try {
      const response = await fetch(getApiUrl(`/api/v1/orgs/${orgId}`), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });

      if (!response.ok) throw new Error('Failed to fetch organization details');

      const data = await response.json();
      setFullOrg(data);
      const name = data.name || '';
      const description = data.description || '';
      const image = data.image || '';
      const rawRegionUrl = data.region_url || '';
      const regionUrl = rawRegionUrl ? (mapCloudRegionUrl(rawRegionUrl) || rawRegionUrl) : '';
      
      setOrgName(name);
      setOrgDescription(description);
      setOrgImage(image);
      setOrgRegionUrl(regionUrl);
      
      setOriginalName(name);
      setOriginalDescription(description);
      setOriginalImage(image);
      setOriginalRegionUrl(regionUrl);
    } catch (err) {
      // Fallback to userInfo
      const name = userInfo?.active_org?.name || '';
      const image = userInfo?.active_org?.image || '';
      const rawRegionUrl = userInfo?.active_org?.region_url || '';
      const regionUrl = rawRegionUrl ? (mapCloudRegionUrl(rawRegionUrl) || rawRegionUrl) : '';
      
      setOrgName(name);
      setOrgDescription('');
      setOrgImage(image);
      setOrgRegionUrl(regionUrl);
      
      setOriginalName(name);
      setOriginalDescription('');
      setOriginalImage(image);
      setOriginalRegionUrl(regionUrl);
      
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [orgId, userInfo]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);

    try {
      // Build payload with only changed fields + org_id
      const payload: Record<string, string> = { org_id: orgId };
      
      if (orgName !== originalName) payload.name = orgName;
      if (orgDescription !== originalDescription) payload.description = orgDescription;
      if (orgImage !== originalImage) payload.image = orgImage;
      if (orgRegionUrl !== originalRegionUrl) payload.region_url = orgRegionUrl;

      const response = await fetch(getApiUrl(`/api/v1/orgs/${orgId}`), {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.reason || 'Failed to update organization');
      }

      // Update original values to current values
      setOriginalName(orgName);
      setOriginalDescription(orgDescription);
      setOriginalImage(orgImage);
      setOriginalRegionUrl(orgRegionUrl);

      toast.success('Tenant updated successfully');
      await refreshUserInfo();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setOrgImage(result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setOrgImage('');
  };

  const regionFlag = getRegionFlag(orgRegionUrl);

  return (
    <>
      {changingOrg && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            backgroundColor: 'hsla(var(--background) / 0.85)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <CircularProgress size={32} sx={{ color: 'hsl(var(--primary))' }} />
          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
            Changing tenant…
          </Typography>
        </Box>
      )}
    <Box sx={{ p: { xs: 0, sm: 0 }, pb: '200px', maxWidth: 1200, width: '100%', mx: 'auto' }}>
      <Box sx={{ display: { xs: 'none', sm: 'block' }, pt: { xs: 2, sm: 4 }, px: { xs: 2, sm: 4 } }}>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 600,
            mb: 0.5,
            color: 'hsl(var(--foreground))',
            fontSize: '1.5rem',
          }}
        >
          Tenant Admin
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: 'hsl(var(--muted-foreground))',
            mb: { xs: 2, sm: 3 },
            fontSize: { xs: '0.825rem', sm: '0.875rem' },
          }}
        >
          Manage your tenant settings, users, and sub-tenants.
        </Typography>
      </Box>

      {(() => {
        type TabValue = 'overview' | 'users' | 'tenants' | 'runtime-locations' | 'preferences' | 'datastore';
        const valueByIndex: TabValue[] = ['overview', 'users', 'tenants', 'runtime-locations', 'preferences', 'datastore'];
        const currentValue: TabValue = valueByIndex[activeTab] ?? 'overview';

        const primaryOptions: SegmentedItem<TabValue>[] = [
          { value: 'overview', label: 'Overview' },
          {
            value: 'users',
            label: 'Users',
            disabled: !isAdmin,
            title: !isAdmin ? 'Requires admin privileges' : undefined,
          },
          { value: 'tenants', label: 'Tenants' },
          {
            value: 'runtime-locations',
            label: 'Runtime Locations',
            disabled: !isAdmin,
            title: !isAdmin ? 'Requires admin privileges' : undefined,
          },
          {
            value: 'datastore',
            label: 'Datastore',
            disabled: !isAdmin,
            title: !isAdmin ? 'Requires admin privileges' : undefined,
          },
        ];

        const prefOptions: SegmentedItem<TabValue>[] = [
          {
            value: 'preferences',
            label: 'UI Preferences',
            disabled: !isAdmin,
            title: !isAdmin ? 'Requires admin privileges' : undefined,
          },
        ];

        return (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: { xs: 1.5, sm: 2.5 },
              mb: { xs: 2.5, sm: 4 },
              maxWidth: '100%',
              overflowX: 'auto',
              pb: 0.5,
              '& > div': { flexShrink: 0 },
            }}
          >
            <SegmentedControl<TabValue>
              layoutId="admin-primary-tabs"
              options={primaryOptions}
              value={currentValue}
              onChange={(v) => handleTabChange(null, valueByIndex.indexOf(v))}
              variant="filled"
              ariaLabel="Admin sections"
            />
            <SegmentedControl<TabValue>
              layoutId="admin-preferences-tabs"
              options={prefOptions}
              value={currentValue}
              onChange={(v) => handleTabChange(null, valueByIndex.indexOf(v))}
              variant="filled"
              ariaLabel="Preferences sections"
            />
          </Box>
        );
      })()}

      {activeTab === 0 && (
        <>
          <Box sx={{ width: '100%', mb: 4 }}>
            <PagerNotificationSettings />
          </Box>

          {error && (
            <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert>
          )}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress sx={{ color: 'hsl(var(--primary))' }} />
            </Box>
          ) : (
            <Box sx={{ width: '100%' }}>
              {/* Image section */}
              <Paper
                sx={{
                  p: 3,
                  mb: 3,
                  bgcolor: 'transparent', backgroundImage: 'none', backdropFilter: 'blur(12px)',
                  border: '1px solid hsl(var(--border))',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3 }}>
                  <Avatar
                    src={orgImage && orgImage.startsWith('data:') ? orgImage : undefined}
                    sx={{
                      width: 100,
                      height: 100,
                      // Orange is only the letter fallback; uploaded logos keep their own transparency.
                      bgcolor: orgImage && orgImage.startsWith('data:') ? 'transparent' : 'hsl(var(--primary))',
                      color: 'hsl(var(--primary-foreground))',
                      fontSize: '2rem',
                      fontWeight: 600,
                      borderRadius: 3,
                    }}
                    variant="rounded"
                  >
                    {orgName?.charAt(0)?.toUpperCase() || '?'}
                  </Avatar>

                  {isAdmin && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
                      <Button
                        variant="outlined"
                        component="label"
                        size="small"
                        sx={{
                          borderColor: 'hsl(var(--primary))',
                          color: 'hsl(var(--primary))',
                          '&:hover': { bgcolor: 'hsla(var(--primary) / 0.1)' },
                        }}
                      >
                        Update
                        <input
                          type="file"
                          hidden
                          accept="image/*"
                          onChange={handleImageUpload}
                        />
                      </Button>
                      {orgImage && (
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={handleRemoveImage}
                          sx={{
                            borderColor: 'hsl(var(--border))',
                            color: 'hsl(var(--muted-foreground))',
                            '&:hover': { bgcolor: 'hsl(var(--muted))' },
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </Box>
                  )}
                </Box>
              </Paper>

              {/* Name, Status, Region row */}
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 3 }}>
                <TextField
                  label="Name"
                  value={orgName}
                  disabled={!isAdmin}
                  onChange={(e) => setOrgName(e.target.value)}
                  fullWidth
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      color: 'hsl(var(--foreground))',
                      '& fieldset': { borderColor: 'hsl(var(--border))' },
                      '&:hover fieldset': { borderColor: 'hsl(var(--primary))' },
                    },
                    '& .MuiInputLabel-root': { color: 'hsl(var(--muted-foreground))' },
                  }}
                />

                <FormControl disabled={!isAdmin} sx={{ minWidth: { xs: '100%', sm: 160 } }}>
                  <InputLabel sx={{ color: 'hsl(var(--muted-foreground))' }}>Region</InputLabel>
                  <Select
                    value={orgRegionUrl}
                    label="Region"
                    disabled={!isAdmin}
                    onChange={(e) => setOrgRegionUrl(e.target.value)}
                    sx={{
                      color: 'hsl(var(--foreground))',
                      '& fieldset': { borderColor: 'hsl(var(--border))' },
                      '&:hover fieldset': { borderColor: 'hsl(var(--primary))' },
                    }}
                    renderValue={() => {
                      const r = getRegionFlag(orgRegionUrl);
                      return `${r.flag} ${r.code}`;
                    }}
                  >
                    {REGION_OPTIONS.map((opt) => {
                      const r = getRegionFlag(opt.value);
                      return (
                        <MenuItem key={opt.value} value={opt.value}>
                          {r.flag} {opt.label}
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
              </Box>

              {/* Description */}
              <TextField
                label="Description"
                value={orgDescription}
                disabled={!isAdmin}
                onChange={(e) => setOrgDescription(e.target.value)}
                multiline
                rows={4}
                fullWidth
                placeholder="Tenant description"
                sx={{
                  mb: 3,
                  '& .MuiOutlinedInput-root': {
                    color: 'hsl(var(--foreground))',
                    '& fieldset': { borderColor: 'hsl(var(--border))' },
                    '&:hover fieldset': { borderColor: 'hsl(var(--primary))' },
                  },
                  '& .MuiInputLabel-root': { color: 'hsl(var(--muted-foreground))' },
                }}
              />

              {/* Save button */}
              {isAdmin && (
                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={saving}
                  startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                  sx={{
                    bgcolor: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary-foreground))',
                    height: 40,
                    width: { xs: '100%', sm: 'auto' },
                    '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
                  }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              )}
            </Box>
          )}

          {/* OAuth Tokens Section (rendered if oauth_tokens returned in org response) */}
          {!loading && hasOAuthTokens && isAdmin && (
            <TenantOAuthTokens
              tokens={oauthTokens}
              orgId={orgId}
              onRefresh={fetchOrg}
              onTokenRevoked={fetchOrg}
            />
          )}
        </>
      )}

      {activeTab === 3 && isAdmin && <RuntimeLocationsTab />}
      {activeTab === 4 && isAdmin && <OrgPreferencesPage embedded />}
      {activeTab === 1 && isAdmin && <UsersPage embedded />}
      {activeTab === 2 && (
        <TenantManagement
          theme={shuffleTheme}
          {...({
            userdata: userInfo,
            selectedOrganization: fullOrg || userInfo?.active_org,
            globalUrl: getApiUrl(''),
            serverside: false,
            isLoaded: true,
            setActiveOrg,
            handleGetOrg: refreshUserInfo,
            autoOpenCreate: createTenantTrigger,
          } as any)}
        />
      )}
      {activeTab === 5 && isAdmin && <DatastoreCategories embedded />}
      {!isAdmin && activeTab !== 0 && activeTab !== 2 && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          You need administrator privileges to access this section.
        </Alert>
      )}
      
    </Box>
    </>
  );
};

export default AdminPage;
