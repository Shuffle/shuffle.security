import { ChevronDown as ExpandMoreIcon, CheckCircle2 as CheckCircleIcon, AlertCircle as ErrorIcon } from 'lucide-react';
import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  Collapse,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
} from '@mui/material';
import { motion } from 'framer-motion';
import type { AlgoliaSearchApp } from '@shuffleio/shuffle-mcps';

export type AuthStatus = 'pending' | 'testing' | 'connected' | 'error';

export interface ToolAuthState {
  systemId: string;
  status: AuthStatus;
  credentials: Record<string, string>;
  errorMessage?: string;
}

interface ToolAuthenticationProps {
  apps: AlgoliaSearchApp[];
  authStates: Record<string, ToolAuthState>;
  onAuthChange: (systemId: string, credentials: Record<string, string>) => void;
  onTestConnection: (systemId: string) => void;
}

// Default auth fields for apps
const getAuthFields = (appName: string) => {
  const lowerName = appName.toLowerCase();
  
  if (lowerName.includes('jira')) {
    return [
      { label: 'Jira URL', type: 'url', placeholder: 'https://your-domain.atlassian.net' },
      { label: 'Email', type: 'email', placeholder: 'your-email@company.com' },
      { label: 'API Token', type: 'password', placeholder: 'Your Jira API token' },
    ];
  }
  if (lowerName.includes('servicenow')) {
    return [
      { label: 'Instance URL', type: 'url', placeholder: 'https://your-instance.service-now.com' },
      { label: 'Username', type: 'text', placeholder: 'admin' },
      { label: 'Password', type: 'password', placeholder: 'Your password' },
    ];
  }
  if (lowerName.includes('slack')) {
    return [
      { label: 'Bot Token', type: 'password', placeholder: 'xoxb-your-bot-token' },
      { label: 'Signing Secret', type: 'password', placeholder: 'Your signing secret' },
    ];
  }
  if (lowerName.includes('teams') || lowerName.includes('microsoft')) {
    return [
      { label: 'Webhook URL', type: 'url', placeholder: 'https://outlook.office.com/webhook/...' },
    ];
  }
  if (lowerName.includes('gmail') || lowerName.includes('email')) {
    return [
      { label: 'Email', type: 'email', placeholder: 'your-email@gmail.com' },
      { label: 'App Password', type: 'password', placeholder: 'Your app password' },
    ];
  }
  if (lowerName.includes('splunk')) {
    return [
      { label: 'Splunk URL', type: 'url', placeholder: 'https://your-splunk-instance:8089' },
      { label: 'Username', type: 'text', placeholder: 'admin' },
      { label: 'Password', type: 'password', placeholder: 'Your password' },
    ];
  }
  
  // Default fields
  return [
    { label: 'API Key', type: 'password', placeholder: 'Your API key' },
  ];
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export const ToolAuthentication = ({
  apps,
  authStates,
  onAuthChange,
  onTestConnection,
}: ToolAuthenticationProps) => {
  const [expanded, setExpanded] = useState<string | false>(apps[0]?.objectID || false);

  if (apps.length === 0) {
    return (
      <Alert
        severity="info"
        sx={{
          backgroundColor: 'hsl(var(--primary) / 0.1)',
          color: 'hsl(var(--primary))',
          border: '1px solid hsl(var(--primary) / 0.3)',
          borderRadius: 2,
        }}
      >
        No integrations selected. Go back and select at least one integration.
      </Alert>
    );
  }

  const getStatusConfig = (status: AuthStatus) => {
    switch (status) {
      case 'connected':
        return { color: 'hsl(var(--severity-low))', label: 'Connected', icon: <CheckCircleIcon size={20} /> };
      case 'error':
        return { color: 'hsl(var(--destructive))', label: 'Error', icon: <ErrorIcon size={20} /> };
      case 'testing':
        return { color: 'hsl(var(--primary))', label: 'Testing...', icon: <CircularProgress size={16} sx={{ color: 'hsl(var(--primary))' }} /> };
      default:
        return { color: 'hsl(var(--muted-foreground))', label: 'Not Configured', icon: null };
    }
  };

  return (
    <Box>
      <Typography
        variant="h5"
        sx={{
          color: 'hsl(var(--foreground))',
          fontWeight: 700,
          mb: 1,
        }}
      >
        Configure Authentication
      </Typography>
      <Typography
        variant="body1"
        sx={{ mb: 4, color: 'hsl(var(--muted-foreground))' }}
      >
        Enter the credentials for each selected integration. We'll test the connections for you.
      </Typography>

      <motion.div variants={containerVariants} initial="hidden" animate="visible">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {apps.map((app) => {
            const authState = authStates[app.objectID] || { status: 'pending', credentials: {} };
            const fields = getAuthFields(app.name);
            const isExpanded = expanded === app.objectID;
            const statusConfig = getStatusConfig(authState.status);

            return (
              <motion.div key={app.objectID} variants={itemVariants}>
                <Card
                  sx={{
                    backgroundColor: 'transparent',
                    border: '1px solid',
                    borderColor:
                      authState.status === 'connected'
                        ? 'hsl(var(--severity-low) / 0.3)'
                        : authState.status === 'error'
                        ? 'hsl(var(--destructive) / 0.3)'
                        : 'hsl(var(--border))',
                    borderRadius: 3,
                    backdropFilter: 'blur(10px)',
                    overflow: 'hidden',
                  }}
                >
                  <CardContent
                    onClick={() => setExpanded(isExpanded ? false : app.objectID)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      cursor: 'pointer',
                      p: 3,
                      '&:last-child': { pb: 3 },
                      '&:hover': { backgroundColor: 'hsl(var(--muted))' },
                    }}
                  >
                    {app.image_url ? (
                      <Box
                        component="img"
                        src={app.image_url}
                        alt={app.name}
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: 2,
                          objectFit: 'contain',
                          backgroundColor: 'hsl(var(--muted))',
                          p: 1,
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          width: 48,
                          height: 48,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'hsl(var(--muted))',
                          borderRadius: 2,
                          fontSize: '1.5rem',
                        }}
                      >
                        🔗
                      </Box>
                    )}
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography sx={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}>
                        {app.name.replace(/_/g, ' ')}
                      </Typography>
                      {app.description && (
                        <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                          {app.description}
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Chip
                        icon={statusConfig.icon || undefined}
                        label={statusConfig.label}
                        size="small"
                        sx={{
                          backgroundColor: `${statusConfig.color}15`,
                          color: statusConfig.color,
                          fontWeight: 500,
                          fontSize: '0.7rem',
                          '& .MuiChip-icon': { color: statusConfig.color },
                        }}
                      />
                      <IconButton
                        size="small"
                        sx={{
                          color: 'hsl(var(--muted-foreground))',
                          transform: isExpanded ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.3s ease',
                        }}
                      >
                        <ExpandMoreIcon />
                      </IconButton>
                    </Box>
                  </CardContent>

                  <Collapse in={isExpanded}>
                    <Box
                      sx={{
                        px: 3,
                        pb: 3,
                        pt: 1,
                        borderTop: '1px solid hsl(var(--border))',
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {fields.map((field, index) => (
                          <TextField
                            key={index}
                            label={field.label}
                            type={field.type}
                            placeholder={field.placeholder}
                            value={authState.credentials[field.label] || ''}
                            onChange={(e) =>
                              onAuthChange(app.objectID, {
                                ...authState.credentials,
                                [field.label]: e.target.value,
                              })
                            }
                            fullWidth
                            size="small"
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                backgroundColor: 'hsl(var(--background-elevated))',
                                borderRadius: 2,
                                '& fieldset': { borderColor: 'hsl(var(--border))' },
                                '&:hover fieldset': { borderColor: 'hsl(var(--muted-foreground))' },
                                '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
                              },
                              '& .MuiInputBase-input': { color: 'hsl(var(--foreground))' },
                              '& .MuiInputLabel-root': { color: 'hsl(var(--muted-foreground))' },
                            }}
                          />
                        ))}

                        {authState.status === 'error' && authState.errorMessage && (
                          <Alert
                            severity="error"
                            sx={{
                              backgroundColor: 'transparent',
                              color: 'hsl(var(--destructive))',
                              border: '1px solid hsl(var(--destructive) / 0.3)',
                              borderRadius: 2,
                            }}
                          >
                            {authState.errorMessage}
                          </Alert>
                        )}

                        <Button
                          variant="contained"
                          onClick={(e) => {
                            e.stopPropagation();
                            onTestConnection(app.objectID);
                          }}
                          disabled={authState.status === 'testing'}
                          sx={{
                            alignSelf: 'flex-start',
                            background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary-glow)) 100%)',
                            boxShadow: '0 4px 14px hsl(var(--primary) / 0.25)',
                            fontWeight: 600,
                            '&:hover': {
                              background: 'linear-gradient(135deg, hsl(var(--primary-glow)) 0%, hsl(var(--primary-glow)) 100%)',
                            },
                            '&.Mui-disabled': {
                              background: 'hsl(var(--muted))',
                              color: 'hsl(var(--muted-foreground))',
                            },
                          }}
                        >
                          {authState.status === 'testing' ? 'Testing...' : 'Test Connection'}
                        </Button>
                      </Box>
                    </Box>
                  </Collapse>
                </Card>
              </motion.div>
            );
          })}
        </Box>
      </motion.div>
    </Box>
  );
};
