import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import { AppFallbackIcon } from '../AppFallbackIcon';
import { toast } from '@/Shuffle-Core/lib/toast';
import { API_CONFIG } from '../../api';

export type McpPlatform = 'chatgpt' | 'claude';

export interface McpSetupModalProps {
  open: boolean;
  onClose: () => void;
  platform?: McpPlatform;
  title?: string;
  platformName?: string;
  pluginsUrl?: string;
  defaultServerName?: string;
  defaultServerUrl?: string;
  appName?: string;
  appTitle?: string;
  globalUrl?: string;
  step1Image?: string;
  step2Image?: string;
  step3Image?: string;
}

export const resolveBackendBaseUrl = (globalUrl?: string): string => {
  const candidate = (globalUrl || API_CONFIG.baseUrl || '').trim().replace(/\/+$/, '');
  if (candidate && /^https?:\/\//i.test(candidate)) {
    return candidate;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return 'https://shuffler.io';
};

export const McpSetupModal: React.FC<McpSetupModalProps> = ({
  open,
  onClose,
  platform = 'chatgpt',
  title,
  platformName,
  pluginsUrl,
  defaultServerName,
  defaultServerUrl,
  appName,
  appTitle,
  globalUrl,
  step1Image,
  step2Image,
  step3Image,
}) => {
  const isClaude = platform === 'claude' || platformName?.toLowerCase() === 'claude';
  const resolvedPlatformName = platformName || (isClaude ? 'Claude' : 'ChatGPT');
  const resolvedPluginsUrl =
    pluginsUrl || (isClaude ? 'https://claude.ai/new#customize/connectors' : 'https://chatgpt.com/plugins');

  const resolvedStep1Image =
    step1Image !== undefined ? step1Image : isClaude ? undefined : '/images/mcp/chatgpt-add-mcp.png';
  const resolvedStep2Image =
    step2Image !== undefined
      ? step2Image
      : isClaude
        ? '/images/mcp/claude-add-connector.png'
        : '/images/mcp/chatgpt-mcp-form.png';

  const baseUrl = resolveBackendBaseUrl(globalUrl);
  const cleanAppName = (appName || '').trim();
  const displayAppTitle = (appTitle || cleanAppName.replace(/_/g, ' ')).trim();

  const resolvedDefaultName =
    defaultServerName || (displayAppTitle ? `Shuffle ${displayAppTitle}` : 'Shuffle Workflow Builder');
  const resolvedDefaultUrl =
    defaultServerUrl ||
    (cleanAppName
      ? `${baseUrl}/api/v1/apps/${encodeURIComponent(cleanAppName)}/mcp`
      : `${baseUrl}/api/v1/agent/workflow-edit`);
  const resolvedTitle =
    title ||
    (displayAppTitle
      ? `Connect ${resolvedPlatformName} to ${displayAppTitle} MCP`
      : `Connect ${resolvedPlatformName} to Shuffle MCP`);

  const [serverName, setServerName] = useState(resolvedDefaultName);
  const [serverUrl, setServerUrl] = useState(resolvedDefaultUrl);
  const [copiedField, setCopiedField] = useState<'name' | 'url' | null>(null);

  useEffect(() => {
    setServerName(resolvedDefaultName);
  }, [resolvedDefaultName, open]);

  useEffect(() => {
    setServerUrl(resolvedDefaultUrl);
  }, [resolvedDefaultUrl, open]);

  const handleCopy = (value: string, field: 'name' | 'url') => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(value);
      }
      setCopiedField(field);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // ignore
    }
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
          bgcolor: 'hsl(var(--card))',
          backgroundImage: 'none',
          border: '1px solid hsl(var(--border))',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          pb: 1.5,
          borderBottom: '1px solid hsl(var(--border))',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <AppFallbackIcon
            name={resolvedPlatformName}
            size={26}
            alt={resolvedPlatformName}
            style={{ borderRadius: '50%', objectFit: 'cover' }}
          />
          <Typography
            variant="subtitle1"
            sx={{ color: 'hsl(var(--foreground))', fontWeight: 700, fontSize: '1rem' }}
          >
            {resolvedTitle}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 2.5, pb: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75, mt: 0.5 }}>
          {/* Step 1 */}
          <Box>
            <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))', fontSize: '0.85rem' }}>
              <strong>1.</strong> Go to{' '}
              <Box
                component="a"
                href={resolvedPluginsUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: 'hsl(var(--primary))',
                  fontWeight: 600,
                  textDecoration: 'none',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                {resolvedPluginsUrl}
              </Box>
            </Typography>
          </Box>

          {/* Step 2 */}
          <Box>
            <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))', fontSize: '0.85rem', mb: resolvedStep1Image ? 1 : 0 }}>
              <strong>2.</strong>{' '}
              {isClaude ? (
                <>
                  Click <strong>&quot;Add&quot;</strong> in the top-right corner and select{' '}
                  <strong>&quot;Add custom connector&quot;</strong>
                </>
              ) : (
                <>
                  Click <strong>&quot;Add &gt; Add custom MCP server&quot;</strong> in the top-right corner
                </>
              )}
            </Typography>
            {resolvedStep1Image && (
              <Box
                component="img"
                src={resolvedStep1Image}
                alt="Add custom MCP server"
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                  e.currentTarget.style.display = 'none';
                }}
                sx={{
                  display: 'block',
                  maxWidth: 260,
                  width: '100%',
                  borderRadius: 2,
                  border: '1px solid hsl(var(--border))',
                }}
              />
            )}
          </Box>

          {/* Step 3 */}
          <Box>
            <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))', fontSize: '0.85rem', mb: 1 }}>
              <strong>3.</strong>{' '}
              {displayAppTitle
                ? `Enter the Name and the ${displayAppTitle} MCP server URL below:`
                : 'Enter the Name and the MCP server URL below:'}
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.25 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                  label="Name"
                  size="small"
                  fullWidth
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  sx={{
                    '& .MuiInputBase-root': { height: 36, fontSize: '0.82rem' },
                    '& .MuiInputLabel-root': { fontSize: '0.8rem' },
                  }}
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => handleCopy(serverName, 'name')}
                  sx={{
                    height: 36,
                    px: 1.5,
                    flexShrink: 0,
                    textTransform: 'none',
                    fontSize: '0.78rem',
                    borderRadius: 1.5,
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                >
                  {copiedField === 'name' ? 'Copied' : 'Copy'}
                </Button>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                  label="MCP server URL"
                  size="small"
                  fullWidth
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  sx={{
                    '& .MuiInputBase-root': { height: 36, fontSize: '0.8rem', fontFamily: 'monospace' },
                    '& .MuiInputLabel-root': { fontSize: '0.8rem' },
                  }}
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => handleCopy(serverUrl, 'url')}
                  sx={{
                    height: 36,
                    px: 1.5,
                    flexShrink: 0,
                    textTransform: 'none',
                    fontSize: '0.78rem',
                    borderRadius: 1.5,
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                >
                  {copiedField === 'url' ? 'Copied' : 'Copy'}
                </Button>
              </Box>
            </Box>

            {resolvedStep2Image && (
              <Box
                component="img"
                src={resolvedStep2Image}
                alt="Fill in MCP server details"
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                  e.currentTarget.style.display = 'none';
                }}
                sx={{
                  display: 'block',
                  maxWidth: 420,
                  width: '100%',
                  borderRadius: 2,
                  border: '1px solid hsl(var(--border))',
                }}
              />
            )}
          </Box>

          {/* Step 4 & Step 5 / Step 6 */}
          {isClaude ? (
            <>
              <Box>
                <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))', fontSize: '0.85rem', mb: step3Image ? 1 : 0 }}>
                  <strong>4.</strong> Click <strong>&quot;Continue&quot;</strong> and log in with Shuffle
                </Typography>
                {step3Image && (
                  <Box
                    component="img"
                    src={step3Image}
                    alt="Login with Shuffle"
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    sx={{
                      display: 'block',
                      maxWidth: 420,
                      width: '100%',
                      borderRadius: 2,
                      border: '1px solid hsl(var(--border))',
                    }}
                  />
                )}
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))', fontSize: '0.85rem' }}>
                  <strong>5.</strong> Start using it in your chats!
                </Typography>
              </Box>
            </>
          ) : (
            <>
              <Box>
                <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))', fontSize: '0.85rem' }}>
                  <strong>4.</strong> Click <strong>&quot;Create as plugin&quot;</strong>
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))', fontSize: '0.85rem', mb: step3Image ? 1 : 0 }}>
                  <strong>5.</strong> Log in with Shuffle
                </Typography>
                {step3Image && (
                  <Box
                    component="img"
                    src={step3Image}
                    alt="Login with Shuffle"
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    sx={{
                      display: 'block',
                      maxWidth: 420,
                      width: '100%',
                      borderRadius: 2,
                      border: '1px solid hsl(var(--border))',
                    }}
                  />
                )}
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))', fontSize: '0.85rem' }}>
                  <strong>6.</strong> Start using it in your chats!
                </Typography>
              </Box>
            </>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, pt: 1, borderTop: '1px solid hsl(var(--border))' }}>
        <Button
          variant="outlined"
          size="small"
          onClick={onClose}
          sx={{
            height: 32,
            px: 2,
            textTransform: 'none',
            borderRadius: 1.5,
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--foreground))',
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default McpSetupModal;
