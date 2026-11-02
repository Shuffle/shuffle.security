import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Alert,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { toast } from '@/Shuffle-Core/lib/toast';

export interface OAuthConnectionItem {
  id: string;
  client_id: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  token_type?: string;
  scope?: string;
  allowed_apps?: string[];
  org_id?: string;
  user_id?: string;
  created_at?: number | string;
  expires_at?: string | number;
  token_masked?: string;
}

export interface OAuthConnectionsSettingsProps {
  globalUrl?: string;
  orgId?: string;
  orgName?: string;
}

const SCOPE_LABELS: Record<string, string> = {
  'workflow:edit': 'Edit workflows',
  'workflow:run': 'Run workflows',
  'workflow:read': 'Read workflows',
  'mcp:execute': 'Execute MCP tools',
  'apps:run': 'Run apps',
  'apps:read': 'Read apps',
  'files:read': 'Read files',
  'files:write': 'Write files',
};

const formatScopeLabel = (scope: string): string => {
  const clean = scope.trim();
  if (SCOPE_LABELS[clean]) {
    return `${SCOPE_LABELS[clean]} (${clean})`;
  }
  return clean;
};

const parseScopes = (scopeStr?: string): string[] => {
  if (!scopeStr) return ['workflow:edit'];
  const parts = scopeStr
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : ['workflow:edit'];
};

const formatDate = (val?: number | string): string => {
  if (!val) return 'Unknown';
  try {
    const d =
      typeof val === 'number'
        ? new Date(val > 1e11 ? val : val * 1000)
        : new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return String(val);
  }
};

const resolveClientDisplayName = (conn: OAuthConnectionItem): string => {
  if (conn.client_name && conn.client_name.trim() !== '' && conn.client_name !== conn.client_id) {
    return conn.client_name;
  }
  const cid = (conn.client_id || '').toLowerCase();
  const uri = (conn.client_uri || '').toLowerCase();
  if (cid.includes('chatgpt') || cid.includes('openai') || uri.includes('chatgpt.com') || uri.includes('openai.com')) {
    return 'ChatGPT';
  }
  if (cid.includes('claude') || cid.includes('anthropic') || uri.includes('claude.ai') || uri.includes('anthropic.com')) {
    return 'Claude';
  }
  if (cid.includes('cursor') || uri.includes('cursor.com') || uri.includes('cursor.sh')) {
    return 'Cursor';
  }
  if (cid.includes('copilot') || uri.includes('github.com')) {
    return 'GitHub Copilot';
  }
  if (cid.includes('gemini') || uri.includes('google.com')) {
    return 'Google Gemini';
  }
  if (cid.startsWith('shuffle_client_')) {
    return conn.client_name || 'Connected MCP Client';
  }
  return conn.client_name || conn.client_id || 'OAuth Application';
};

export const OAuthConnectionsSettings: React.FC<OAuthConnectionsSettingsProps> = ({
  globalUrl,
  orgId,
  orgName,
}) => {
  const [connections, setConnections] = useState<OAuthConnectionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<OAuthConnectionItem | null>(null);

  const resolveEndpoint = useCallback(
    (path: string) => {
      if (globalUrl && globalUrl.trim().length > 0) {
        return `${globalUrl.replace(/\/+$/, '')}${path}`;
      }
      return getApiUrl(path);
    },
    [globalUrl]
  );

  const fetchConnections = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(resolveEndpoint('/api/v1/oauth2/tokens'), {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...getAuthHeader(orgId),
        },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData?.error_description || errData?.reason || `Failed to load connections (${response.status})`
        );
      }

      const data = await response.json();
      setConnections(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load connected applications');
    } finally {
      setLoading(false);
    }
  }, [resolveEndpoint, orgId]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleRevoke = async (conn: OAuthConnectionItem) => {
    const targetToken = conn.id || conn.token_masked;
    if (!targetToken) return;

    setRevokingId(targetToken);
    try {
      const response = await fetch(resolveEndpoint('/api/v1/oauth2/revoke'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...getAuthHeader(orgId),
        },
        body: JSON.stringify({
          token: targetToken,
          client_id: conn.client_id,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData?.error_description || errData?.reason || `Failed to revoke connection (${response.status})`
        );
      }

      setConnections((prev) => prev.filter((item) => (item.id || item.token_masked) !== targetToken));
      setConfirmTarget(null);
      toast.success(`Revoked access for ${resolveClientDisplayName(conn)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke connection';
      toast.error(msg);
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <Paper
      sx={{
        p: 3,
        bgcolor: 'transparent',
        backgroundImage: 'none',
        backdropFilter: 'blur(12px)',
        border: '1px solid hsl(var(--border))',
        borderRadius: 3,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
          mb: 2,
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="subtitle1"
            sx={{ color: 'hsl(var(--foreground))', fontWeight: 700, mb: 0.5 }}
          >
            Connected Applications (OAuth / MCP)
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem' }}
          >
            External AI assistants, MCP clients, and third-party services authorized to access your Shuffle account.
          </Typography>
        </Box>

        <Button
          variant="outlined"
          size="small"
          onClick={fetchConnections}
          disabled={loading}
          sx={{
            height: 32,
            px: 1.75,
            textTransform: 'none',
            fontSize: '0.8rem',
            borderRadius: 1.5,
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--foreground))',
            '&:hover': {
              borderColor: 'hsl(var(--primary))',
              bgcolor: 'hsl(var(--muted) / 0.4)',
            },
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </Box>

      {/* Simple Revocation Instructions Box */}
      <Box
        sx={{
          p: 1.75,
          mb: 2.5,
          borderRadius: 2,
          bgcolor: 'hsl(var(--muted) / 0.25)',
          border: '1px solid hsl(var(--border))',
        }}
      >
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            color: 'hsl(var(--foreground))',
            fontWeight: 600,
            mb: 0.5,
            fontSize: '0.78rem',
          }}
        >
          How to revoke a connection
        </Typography>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            color: 'hsl(var(--muted-foreground))',
            lineHeight: 1.5,
            fontSize: '0.76rem',
          }}
        >
          Click <strong>Revoke</strong> next to any application below to immediately invalidate both its access token and refresh token. Once revoked, the external client will no longer be able to run tools or access your workflows until you authorize it again.
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2, fontSize: '0.825rem' }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} sx={{ color: 'hsl(var(--primary))' }} />
        </Box>
      ) : connections.length === 0 ? (
        <Box
          sx={{
            py: 3.5,
            px: 2.5,
            textAlign: 'center',
            borderRadius: 2,
            border: '1px dashed hsl(var(--border))',
            bgcolor: 'hsl(var(--muted) / 0.1)',
          }}
        >
          <Typography
            variant="body2"
            sx={{ color: 'hsl(var(--foreground))', fontWeight: 600, mb: 0.5, fontSize: '0.85rem' }}
          >
            No active connected applications
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: 'hsl(var(--muted-foreground))', display: 'block', maxWidth: 480, mx: 'auto' }}
          >
            When you connect an external client such as ChatGPT, Claude, Cursor, or another MCP integration via OAuth, it will appear here so you can review its permissions or revoke access at any time.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {connections.map((conn, idx) => {
            const connKey = conn.id || conn.token_masked || `conn-${idx}`;
            const displayName = resolveClientDisplayName(conn);
            const scopes = parseScopes(conn.scope);
            const isRevoking = revokingId === connKey;
            const allowedApps = Array.isArray(conn.allowed_apps)
              ? conn.allowed_apps.filter((a) => a && a !== '*')
              : [];

            return (
              <Box
                key={connKey}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid hsl(var(--border))',
                  bgcolor: 'hsl(var(--muted) / 0.12)',
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  alignItems: { xs: 'stretch', sm: 'center' },
                  justifyContent: 'space-between',
                  gap: 2,
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 0.5 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        color: 'hsl(var(--foreground))',
                        fontSize: '0.9rem',
                      }}
                    >
                      {displayName}
                    </Typography>
                    <Box
                      component="span"
                      sx={{
                        px: 0.85,
                        py: 0.15,
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        borderRadius: 1,
                        bgcolor: 'rgba(34, 197, 94, 0.12)',
                        color: '#22C55E',
                        border: '1px solid rgba(34, 197, 94, 0.25)',
                      }}
                    >
                      Active
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 1 }}>
                    <Typography
                      variant="caption"
                      sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem' }}
                    >
                      Connected: <strong>{formatDate(conn.created_at)}</strong>
                    </Typography>
                    {conn.expires_at && (
                      <Typography
                        variant="caption"
                        sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem' }}
                      >
                        Expires: <strong>{formatDate(conn.expires_at)}</strong>
                      </Typography>
                    )}
                    {conn.client_id && (
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'hsl(var(--muted-foreground))',
                          fontSize: '0.73rem',
                          fontFamily: 'monospace',
                        }}
                      >
                        Client ID: {conn.client_id}
                      </Typography>
                    )}
                    {conn.org_id && (
                      <Typography
                        variant="caption"
                        sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem' }}
                      >
                        Organization: <strong>{conn.org_id === orgId && orgName ? orgName : conn.org_id}</strong>
                      </Typography>
                    )}
                  </Box>

                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
                    <Typography
                      variant="caption"
                      sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.73rem', mr: 0.25 }}
                    >
                      Permissions:
                    </Typography>
                    {scopes.map((sc) => (
                      <Box
                        key={sc}
                        component="span"
                        sx={{
                          px: 0.85,
                          py: 0.2,
                          fontSize: '0.7rem',
                          borderRadius: 1,
                          bgcolor: 'hsl(var(--muted) / 0.5)',
                          color: 'hsl(var(--foreground))',
                          border: '1px solid hsl(var(--border))',
                        }}
                      >
                        {formatScopeLabel(sc)}
                      </Box>
                    ))}
                    {allowedApps.length > 0 && (
                      <Box
                        component="span"
                        sx={{
                          px: 0.85,
                          py: 0.2,
                          fontSize: '0.7rem',
                          borderRadius: 1,
                          bgcolor: 'hsl(var(--muted) / 0.5)',
                          color: 'hsl(var(--foreground))',
                          border: '1px solid hsl(var(--border))',
                        }}
                      >
                        Restricted to {allowedApps.length} app{allowedApps.length === 1 ? '' : 's'} ({allowedApps.slice(0, 3).join(', ')}{allowedApps.length > 3 ? '...' : ''})
                      </Box>
                    )}
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={isRevoking}
                    onClick={() => setConfirmTarget(conn)}
                    sx={{
                      height: 32,
                      px: 1.75,
                      textTransform: 'none',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      borderRadius: 1.5,
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                      color: '#EF4444',
                      bgcolor: 'rgba(239, 68, 68, 0.04)',
                      '&:hover': {
                        borderColor: '#EF4444',
                        bgcolor: 'rgba(239, 68, 68, 0.12)',
                      },
                    }}
                  >
                    {isRevoking ? 'Revoking...' : 'Revoke'}
                  </Button>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Simple Confirmation Dialog */}
      <Dialog
        open={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: 'hsl(var(--card))',
            backgroundImage: 'none',
            border: '1px solid hsl(var(--border))',
            p: 1,
            maxWidth: 440,
          },
        }}
      >
        <DialogTitle sx={{ color: 'hsl(var(--foreground))', fontWeight: 700, fontSize: '1.05rem', pb: 1 }}>
          Revoke Application Access
        </DialogTitle>
        <DialogContent sx={{ pb: 2 }}>
          <DialogContentText sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.85rem', mb: 1.5 }}>
            Are you sure you want to revoke access for{' '}
            <strong style={{ color: 'hsl(var(--foreground))' }}>
              {confirmTarget ? resolveClientDisplayName(confirmTarget) : 'this application'}
            </strong>
            ?
          </DialogContentText>
          <Divider sx={{ borderColor: 'hsl(var(--border))', my: 1.5 }} />
          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block', lineHeight: 1.5 }}>
            This immediately invalidates both the active access token and refresh token. The application will no longer be able to access your Shuffle account unless you re-authorize it.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2, gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setConfirmTarget(null)}
            sx={{
              height: 32,
              textTransform: 'none',
              borderRadius: 1.5,
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            size="small"
            disabled={revokingId !== null}
            onClick={() => {
              if (confirmTarget) {
                handleRevoke(confirmTarget);
              }
            }}
            sx={{
              height: 32,
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 1.5,
              bgcolor: '#EF4444',
              color: '#FFFFFF',
              '&:hover': { bgcolor: '#DC2626' },
            }}
          >
            {revokingId ? 'Revoking...' : 'Confirm Revoke'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default OAuthConnectionsSettings;
