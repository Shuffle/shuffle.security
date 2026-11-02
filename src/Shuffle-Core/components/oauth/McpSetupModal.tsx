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

export interface McpSetupModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  platformName?: string;
  pluginsUrl?: string;
  defaultServerName?: string;
  defaultServerUrl?: string;
  step1Image?: string;
  step2Image?: string;
  step3Image?: string;
}

export const McpSetupModal: React.FC<McpSetupModalProps> = ({
  open,
  onClose,
  title = 'Connect ChatGPT to Shuffle MCP',
  platformName = 'ChatGPT',
  pluginsUrl = 'https://chatgpt.com/plugins',
  defaultServerName = 'Shuffle Workflow Builder',
  defaultServerUrl = 'https://shuffler.io/api/v1/agent/workflow-edit',
  step1Image = '/images/mcp/chatgpt-add-mcp.png',
  step2Image = '/images/mcp/chatgpt-mcp-form.png',
  step3Image,
}) => {
  const [serverName, setServerName] = useState(defaultServerName);
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);
  const [copiedField, setCopiedField] = useState<'name' | 'url' | null>(null);

  useEffect(() => {
    setServerName(defaultServerName);
  }, [defaultServerName]);

  useEffect(() => {
    setServerUrl(defaultServerUrl);
  }, [defaultServerUrl]);

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
            name={platformName}
            size={26}
            alt={platformName}
            style={{ borderRadius: '50%', objectFit: 'cover' }}
          />
          <Typography
            variant="subtitle1"
            sx={{ color: 'hsl(var(--foreground))', fontWeight: 700, fontSize: '1rem' }}
          >
            {title}
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
                href={pluginsUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: 'hsl(var(--primary))',
                  fontWeight: 600,
                  textDecoration: 'none',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                {pluginsUrl}
              </Box>
            </Typography>
          </Box>

          {/* Step 2 */}
          <Box>
            <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))', fontSize: '0.85rem', mb: 1 }}>
              <strong>2.</strong> Click <strong>&quot;Add &gt; Add custom MCP server&quot;</strong> in the top-right corner
            </Typography>
            {step1Image && (
              <Box
                component="img"
                src={step1Image}
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
              <strong>3.</strong> Fill in a name, and the workflow edit MCP example:
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
                  label="MCP Server URL"
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

            {step2Image && (
              <Box
                component="img"
                src={step2Image}
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

          {/* Step 4 */}
          <Box>
            <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))', fontSize: '0.85rem' }}>
              <strong>4.</strong> Click <strong>&quot;Create as plugin&quot;</strong>
            </Typography>
          </Box>

          {/* Step 5 */}
          <Box>
            <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))', fontSize: '0.85rem', mb: step3Image ? 1 : 0 }}>
              <strong>5.</strong> Login with Shuffle
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

          {/* Step 6 */}
          <Box>
            <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))', fontSize: '0.85rem' }}>
              <strong>6.</strong> Use it in your chats!
            </Typography>
          </Box>
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
