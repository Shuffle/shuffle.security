import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { Key, Trash2, ShieldAlert, Copy, Check, RefreshCw } from 'lucide-react';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { toast } from '@/lib/toast';

export interface OAuthToken {
  id?: string;
  token_id?: string;
  token?: string;
  access_token?: string;
  refresh_token?: string;
  client_id?: string;
  client_name?: string;
  app_name?: string;
  name?: string;
  scope?: string | string[];
  scopes?: string | string[];
  created_at?: string | number;
  created?: string | number;
  issued_at?: string | number;
  expires_at?: string | number;
  expires_in?: number;
  expires?: string | number;
  last_used?: string | number;
  user_id?: string;
  username?: string;
  created_by?: string;
  redirect_uri?: string;
  token_type?: string;
  revoked?: boolean;
  [key: string]: unknown;
}

interface TenantOAuthTokensProps {
  tokens: unknown;
  orgId?: string;
  onRefresh?: () => void;
  onTokenRevoked?: (revokedTokenId: string) => void;
}

export const TenantOAuthTokens: React.FC<TenantOAuthTokensProps> = ({
  tokens,
  orgId,
  onRefresh,
  onTokenRevoked,
}) => {
  const [revokingTokenId, setRevokingTokenId] = useState<string | null>(null);
  const [tokenToRevoke, setTokenToRevoke] = useState<OAuthToken | null>(null);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [localRevokedIds, setLocalRevokedIds] = useState<Set<string>>(new Set());

  // Normalize tokens input to an array
  const tokensList: OAuthToken[] = useMemo(() => {
    if (!tokens) return [];
    let list: OAuthToken[] = [];
    if (Array.isArray(tokens)) {
      list = tokens as OAuthToken[];
    } else if (typeof tokens === 'object') {
      list = Object.entries(tokens as Record<string, unknown>).map(([key, val]) => {
        if (typeof val === 'object' && val !== null) {
          return { id: key, ...(val as Record<string, unknown>) } as OAuthToken;
        }
        return { id: key, token: String(val) } as OAuthToken;
      });
    }

    return list.filter((t) => {
      const id = t.id || t.token_id || t.token;
      return id ? !localRevokedIds.has(id) : true;
    });
  }, [tokens, localRevokedIds]);

  const formatTokenDate = (val?: string | number) => {
    if (!val) return '—';
    try {
      const d = typeof val === 'number' ? new Date(val > 1e11 ? val : val * 1000) : new Date(val);
      if (isNaN(d.getTime())) return String(val);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(val);
    }
  };

  const isTokenExpired = (expiresVal?: string | number) => {
    if (!expiresVal) return false;
    try {
      const d =
        typeof expiresVal === 'number'
          ? new Date(expiresVal > 1e11 ? expiresVal : expiresVal * 1000)
          : new Date(expiresVal);
      if (isNaN(d.getTime())) return false;
      return d.getTime() < Date.now();
    } catch {
      return false;
    }
  };

  const parseTokenScopes = (scopeVal?: string | string[]) => {
    if (!scopeVal) return [];
    if (Array.isArray(scopeVal)) return scopeVal;
    if (typeof scopeVal === 'string') {
      return scopeVal.split(/[,\s]+/).filter(Boolean);
    }
    return [];
  };

  const getAppDisplayName = (token: OAuthToken) => {
    if (token.app_name) return token.app_name;
    if (token.client_name) return token.client_name;
    if (token.name) return token.name;
    if (token.redirect_uri) {
      try {
        const host = new URL(token.redirect_uri).hostname.toLowerCase();
        if (host.includes('chatgpt.com') || host.includes('openai.com')) return 'ChatGPT';
        if (host.includes('claude.ai') || host.includes('anthropic.com')) return 'Claude';
        if (host.includes('cursor.sh') || host.includes('cursor.com')) return 'Cursor';
        if (host.includes('github.com')) return 'GitHub Copilot';
      } catch {}
    }
    if (token.client_id) {
      const cid = token.client_id.toLowerCase();
      if (cid.includes('chatgpt') || cid.includes('openai')) return 'ChatGPT';
      if (cid.includes('claude') || cid.includes('anthropic')) return 'Claude';
      if (cid.includes('cursor')) return 'Cursor';
      if (cid.startsWith('shuffle_client_')) return 'OAuth Application';
      return token.client_id;
    }
    return 'OAuth Application';
  };

  const handleRevokeToken = async (token: OAuthToken) => {
    const tokenIdentifier = token.token || token.access_token || token.id || token.token_id;
    const tokenId = token.id || token.token_id || tokenIdentifier;
    if (!tokenId) return;

    setRevokingTokenId(tokenId);
    try {
      const res = await fetch(getApiUrl('/api/v1/oauth2/revoke'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(orgId),
        },
        body: JSON.stringify({
          token: tokenIdentifier,
          token_id: tokenId,
          id: tokenId,
          client_id: token.client_id,
          org_id: orgId,
        }),
      });

      if (!res.ok) {
        let errMsg = '';
        try {
          const errData = await res.json();
          errMsg = errData?.message || errData?.error || errData?.reason;
        } catch {}
        throw new Error(errMsg || `Failed to revoke token (${res.status})`);
      }

      toast.success('OAuth token revoked successfully');
      setTokenToRevoke(null);
      setLocalRevokedIds((prev) => new Set(prev).add(tokenId));

      if (onTokenRevoked) {
        onTokenRevoked(tokenId);
      }
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke token';
      toast.error(msg);
    } finally {
      setRevokingTokenId(null);
    }
  };

  return (
    <>
      <Paper
        sx={{
          mt: 4,
          p: 3,
          bgcolor: 'transparent',
          backgroundImage: 'none',
          backdropFilter: 'blur(12px)',
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 2.5,
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                p: 1.25,
                borderRadius: 2,
                bgcolor: 'hsla(var(--primary) / 0.1)',
                color: 'hsl(var(--primary))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Key size={20} />
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    fontSize: '1.1rem',
                    color: 'hsl(var(--foreground))',
                  }}
                >
                  OAuth Tokens
                </Typography>
                <Chip
                  label={tokensList.length}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    bgcolor: 'hsl(var(--muted))',
                    color: 'hsl(var(--muted-foreground))',
                  }}
                />
              </Box>
              <Typography
                variant="body2"
                sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.825rem' }}
              >
                Authorized applications and OAuth tokens with access to this tenant.
              </Typography>
            </Box>
          </Box>

          {onRefresh && (
            <Button
              variant="outlined"
              size="small"
              onClick={onRefresh}
              startIcon={<RefreshCw size={14} />}
              sx={{
                textTransform: 'none',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--muted-foreground))',
                fontSize: '0.8rem',
                borderRadius: 1.5,
                '&:hover': {
                  borderColor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary))',
                  bgcolor: 'hsla(var(--primary) / 0.05)',
                },
              }}
            >
              Refresh
            </Button>
          )}
        </Box>

        {tokensList.length === 0 ? (
          <Box
            sx={{
              py: 5,
              px: 3,
              textAlign: 'center',
              borderRadius: 2,
              border: '1px dashed hsl(var(--border))',
              bgcolor: 'hsl(var(--muted) / 0.1)',
            }}
          >
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                bgcolor: 'hsl(var(--muted) / 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 1.5,
                color: 'hsl(var(--muted-foreground))',
              }}
            >
              <Key size={22} />
            </Box>
            <Typography
              variant="body2"
              sx={{ color: 'hsl(var(--foreground))', fontWeight: 600, mb: 0.5 }}
            >
              No active OAuth tokens found for this tenant
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'hsl(var(--muted-foreground))', display: 'block', maxWidth: 450, mx: 'auto' }}
            >
              When external applications (such as ChatGPT, Claude, or custom scripts) are authorized via OAuth, their access tokens will appear here.
            </Typography>
          </Box>
        ) : (
          <TableContainer
            sx={{
              borderRadius: 2,
              border: '1px solid hsl(var(--border))',
              overflow: 'hidden',
            }}
          >
            <Table size="small">
              <TableHead sx={{ bgcolor: 'hsl(var(--muted) / 0.3)' }}>
                <TableRow>
                  <TableCell
                    sx={{
                      color: 'hsl(var(--muted-foreground))',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      letterSpacing: '0.04em',
                      py: 1.25,
                    }}
                  >
                    APPLICATION
                  </TableCell>
                  <TableCell
                    sx={{
                      color: 'hsl(var(--muted-foreground))',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      letterSpacing: '0.04em',
                      py: 1.25,
                    }}
                  >
                    SCOPES
                  </TableCell>
                  <TableCell
                    sx={{
                      color: 'hsl(var(--muted-foreground))',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      letterSpacing: '0.04em',
                      py: 1.25,
                    }}
                  >
                    CREATED
                  </TableCell>
                  <TableCell
                    sx={{
                      color: 'hsl(var(--muted-foreground))',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      letterSpacing: '0.04em',
                      py: 1.25,
                    }}
                  >
                    STATUS
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      color: 'hsl(var(--muted-foreground))',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      letterSpacing: '0.04em',
                      py: 1.25,
                    }}
                  >
                    ACTIONS
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tokensList.map((token, index) => {
                  const tokenId = token.id || token.token_id || token.token || `token-${index}`;
                  const appName = getAppDisplayName(token);
                  const scopes = parseTokenScopes(token.scope || token.scopes);
                  const expired = isTokenExpired(token.expires_at || token.expires);
                  const isRevoking = revokingTokenId === tokenId;

                  return (
                    <TableRow
                      key={tokenId}
                      sx={{
                        '&:last-child td, &:last-child th': { border: 0 },
                        '&:hover': { bgcolor: 'hsl(var(--muted) / 0.2)' },
                        borderColor: 'hsl(var(--border))',
                      }}
                    >
                      <TableCell sx={{ borderColor: 'hsl(var(--border))', py: 1.5 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}
                          >
                            {appName}
                          </Typography>
                          {token.client_id && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <Typography
                                variant="caption"
                                sx={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.725rem',
                                  color: 'hsl(var(--muted-foreground))',
                                  bgcolor: 'hsl(var(--muted) / 0.5)',
                                  px: 0.75,
                                  py: 0.2,
                                  borderRadius: 1,
                                  maxWidth: 260,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {token.client_id}
                              </Typography>
                              <Tooltip
                                title={copiedTokenId === tokenId ? 'Copied' : 'Copy Client ID'}
                              >
                                <IconButton
                                  size="small"
                                   onClick={() => {
                                     try {
                                       if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                                         navigator.clipboard.writeText(token.client_id || '').catch(() => {});
                                       }
                                     } catch {}
                                     setCopiedTokenId(tokenId);
                                     setTimeout(() => setCopiedTokenId(null), 2000);
                                   }}
                                  sx={{ p: 0.25, color: 'hsl(var(--muted-foreground))' }}
                                >
                                  {copiedTokenId === tokenId ? (
                                    <Check size={12} color="#22C55E" />
                                  ) : (
                                    <Copy size={12} />
                                  )}
                                </IconButton>
                              </Tooltip>
                            </Box>
                          )}
                          {token.username && (
                            <Typography
                              variant="caption"
                              sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem' }}
                            >
                              Authorized by {token.username}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ borderColor: 'hsl(var(--border))', py: 1.5 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 0.5,
                            maxWidth: 320,
                          }}
                        >
                          {scopes.length > 0 ? (
                            scopes.map((sc) => (
                              <Chip
                                key={sc}
                                label={sc}
                                size="small"
                                sx={{
                                  height: 22,
                                  fontSize: '0.7rem',
                                  bgcolor: 'hsla(var(--primary) / 0.1)',
                                  color: 'hsl(var(--primary))',
                                  border: '1px solid hsla(var(--primary) / 0.2)',
                                  borderRadius: 1,
                                }}
                              />
                            ))
                          ) : (
                            <Typography
                              variant="caption"
                              sx={{ color: 'hsl(var(--muted-foreground))' }}
                            >
                              Default scopes
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ borderColor: 'hsl(var(--border))', py: 1.5 }}>
                        <Typography
                          variant="caption"
                          sx={{ color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}
                        >
                          {formatTokenDate(token.created_at || token.created || token.issued_at)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ borderColor: 'hsl(var(--border))', py: 1.5 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                          <Chip
                            label={expired ? 'Expired' : 'Active'}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              width: 'fit-content',
                              bgcolor: expired
                                ? 'rgba(239, 68, 68, 0.1)'
                                : 'rgba(34, 197, 94, 0.1)',
                              color: expired ? '#EF4444' : '#22C55E',
                              border: `1px solid ${
                                expired ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'
                              }`,
                            }}
                          />
                          {(token.expires_at || token.expires) && (
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'hsl(var(--muted-foreground))',
                                fontSize: '0.7rem',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Exp: {formatTokenDate(token.expires_at || token.expires)}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ borderColor: 'hsl(var(--border))', py: 1.5 }}
                      >
                        <Tooltip title="Revoke and delete this token">
                          <span>
                            <Button
                              variant="outlined"
                              size="small"
                              color="error"
                              disabled={isRevoking}
                              onClick={() => setTokenToRevoke(token)}
                              startIcon={
                                isRevoking ? (
                                  <CircularProgress size={14} color="inherit" />
                                ) : (
                                  <Trash2 size={14} />
                                )
                              }
                              sx={{
                                textTransform: 'none',
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                borderRadius: 1.5,
                                borderColor: 'rgba(239, 68, 68, 0.3)',
                                color: '#EF4444',
                                '&:hover': {
                                  borderColor: '#EF4444',
                                  bgcolor: 'rgba(239, 68, 68, 0.08)',
                                },
                              }}
                            >
                              {isRevoking ? 'Revoking...' : 'Revoke'}
                            </Button>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Revoke Confirmation Dialog */}
      <Dialog
        open={Boolean(tokenToRevoke)}
        onClose={() => setTokenToRevoke(null)}
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: 'hsl(var(--card))',
            backgroundImage: 'none',
            border: '1px solid hsl(var(--border))',
            p: 1,
            maxWidth: 460,
          },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            color: 'hsl(var(--foreground))',
            pb: 1,
          }}
        >
          <Box
            sx={{
              p: 1,
              borderRadius: 1.5,
              bgcolor: 'rgba(239, 68, 68, 0.1)',
              color: '#EF4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldAlert size={20} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
            Revoke OAuth Token
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pb: 2 }}>
          <DialogContentText
            sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem', mb: 2 }}
          >
            Are you sure you want to revoke this OAuth token for{' '}
            <strong style={{ color: 'hsl(var(--foreground))' }}>
              {tokenToRevoke ? getAppDisplayName(tokenToRevoke) : 'this application'}
            </strong>
            ? Any external application or service using this token will immediately lose access to this tenant.
          </DialogContentText>
          {tokenToRevoke?.client_id && (
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: 'hsl(var(--muted) / 0.4)',
                border: '1px solid hsl(var(--border))',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
              }}
            >
              <Typography
                variant="caption"
                sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}
              >
                Client ID
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'monospace',
                  color: 'hsl(var(--foreground))',
                  wordBreak: 'break-all',
                }}
              >
                {tokenToRevoke.client_id}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => setTokenToRevoke(null)}
            sx={{
              textTransform: 'none',
              borderRadius: 1.5,
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--muted-foreground))',
              '&:hover': { bgcolor: 'hsl(var(--muted) / 0.5)' },
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              if (tokenToRevoke) {
                handleRevokeToken(tokenToRevoke);
              }
            }}
            disabled={revokingTokenId !== null}
            startIcon={
              revokingTokenId ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <Trash2 size={16} />
              )
            }
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 1.5,
              bgcolor: '#EF4444',
              color: '#FFFFFF',
              '&:hover': { bgcolor: '#DC2626' },
            }}
          >
            {revokingTokenId ? 'Revoking...' : 'Revoke Token'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default TenantOAuthTokens;
