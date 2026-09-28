import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Button,
  Tabs,
  Tab,
  Alert,
  Tooltip,
  Chip,
} from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { API_CONFIG } from '@/Shuffle-MCPs/api';
import { Server, X as CloseIcon, Copy as ContentCopyIcon, Check as CheckIcon, ExternalLink as OpenInNewIcon } from 'lucide-react';
import gcpLogo from '@/assets/gcp-logo.png';
import awsLogo from '@/assets/aws-logo.png';
import azureLogo from '@/assets/azure-logo.png';

type Provider = 'self-hosted' | 'gcp' | 'aws' | 'azure';

// Cloud provider icons using actual logos
const GCPIcon = () => (
  <img src={gcpLogo} alt="Google Cloud" width={18} height={18} style={{ objectFit: 'contain' }} />
);

const AWSIcon = () => (
  <img src={awsLogo} alt="AWS" width={18} height={18} style={{ objectFit: 'contain' }} />
);

const AzureIcon = () => (
  <img src={azureLogo} alt="Azure" width={18} height={18} style={{ objectFit: 'contain' }} />
);

const ServerIcon = () => (
  <Server size={18} />
);

interface DeploymentInstructionsProps {
  open: boolean;
  onClose: () => void;
  initialProvider?: Provider;
  environmentName?: string;
  environmentId?: string;
  environmentAuth?: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  value: number;
  index: number;
}

const TabPanel = ({ children, value, index }: TabPanelProps) => (
  <Box role="tabpanel" hidden={value !== index} sx={{ pt: 3 }}>
    {value === index && children}
  </Box>
);

// Step item component for better readability
const StepItem = ({ number, children }: { number: number; children: React.ReactNode }) => (
  <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
    <Box
      sx={{
        minWidth: 24,
        height: 24,
        borderRadius: '50%',
        backgroundColor: 'hsl(var(--primary) / 0.15)',
        color: 'hsl(var(--primary))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.75rem',
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {number}
    </Box>
    <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem', lineHeight: 1.6 }}>
      {children}
    </Typography>
  </Box>
);

export const DeploymentInstructions = ({
  open,
  onClose,
  initialProvider = 'self-hosted',
  environmentName = '',
  environmentId = '',
  environmentAuth = '',
}: DeploymentInstructionsProps) => {
  const { userInfo } = useAuth();
  const [activeTab, setActiveTab] = useState(
    initialProvider === 'self-hosted' ? 0 :
    initialProvider === 'gcp' ? 1 :
    initialProvider === 'aws' ? 2 : 3
  );
  const [copied, setCopied] = useState(false);

  // Get credentials for the command
  const authKey = environmentAuth || '';
  const orgId = userInfo?.active_org?.id || '';
  const baseUrl = API_CONFIG.baseUrl || 'https://shuffler.io';
  const envName = environmentName || 'Production';

  const dockerCommand = `docker run -d \\
        --restart=always \\
        --name="shuffle-orborus" \\
        --pull=always \\
        --volume "/var/run/docker.sock:/var/run/docker.sock" \\
        -e AUTH="${authKey}" \\
        -e ENVIRONMENT_NAME="${envName}" \\
        -e ORG="${orgId}" \\
        -e SHUFFLE_SWARM_CONFIG=run \\
        -e BASE_URL="${baseUrl}" \\
        -v /tmp:/tmp \\
        ghcr.io/shuffle/shuffle-orborus:latest`;

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(dockerCommand);
      }
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selfHostedSteps = [
    'Log into your VM or server via SSH',
    'Ensure Docker is installed and running',
    'Copy and run the command below',
  ];

  const vmProvisioningSteps = {
    gcp: {
      name: 'Google Cloud',
      icon: <GCPIcon />,
      consoleUrl: 'https://console.cloud.google.com/compute/instancesAdd',
      steps: [
        'Go to Compute Engine → VM Instances',
        'Click "Create Instance"',
        'Choose e2-medium or larger',
        'Select Container Optimized OS or Ubuntu',
        'Allow HTTP/HTTPS traffic if needed',
        'Click "Create" and wait for startup',
        'SSH into the VM',
      ],
    },
    aws: {
      name: 'Amazon Web Services',
      icon: <AWSIcon />,
      consoleUrl: 'https://console.aws.amazon.com/ec2/v2/home#LaunchInstances:',
      steps: [
        'Go to EC2 → Launch Instance',
        'Choose Amazon Linux 2023 or Ubuntu AMI',
        'Select t3.medium or larger',
        'Configure security group for SSH (port 22)',
        'Launch and download the key pair',
        'SSH: ssh -i your-key.pem ec2-user@<ip>',
        'Install Docker: sudo yum install docker -y && sudo systemctl start docker',
      ],
    },
    azure: {
      name: 'Microsoft Azure',
      icon: <AzureIcon />,
      consoleUrl: 'https://portal.azure.com/#create/Microsoft.VirtualMachine',
      steps: [
        'Go to Virtual Machines → Create',
        'Choose Ubuntu Server 22.04 LTS',
        'Select Standard_B2s or larger',
        'Configure SSH public key authentication',
        'Review and create the VM',
        'SSH into the VM using the public IP',
        'Install Docker: sudo apt update && sudo apt install docker.io -y',
      ],
    },
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid hsl(var(--border))',
        }}
      >
        <Typography sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
          Deploy Detection Sensor
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon style={{ color: 'hsl(var(--muted-foreground))' }} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            borderBottom: '1px solid hsl(var(--border))',
            px: 2,
            '& .MuiTab-root': {
              color: 'hsl(var(--muted-foreground))',
              textTransform: 'none',
              fontWeight: 500,
              minHeight: 48,
              gap: 0.75,
              '&.Mui-selected': {
                color: 'hsl(var(--primary))',
              },
            },
            '& .MuiTabs-indicator': {
              backgroundColor: 'hsl(var(--primary))',
            },
          }}
        >
          <Tab icon={<ServerIcon />} iconPosition="start" label="Self-Hosted" />
          <Tab icon={<GCPIcon />} iconPosition="start" label="Google Cloud" />
          <Tab icon={<AWSIcon />} iconPosition="start" label="AWS" />
          <Tab icon={<AzureIcon />} iconPosition="start" label="Azure" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {/* Environment Name Display */}
          <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>
              Sensor:
            </Typography>
            <Chip
              label={envName}
              sx={{
                backgroundColor: 'hsl(var(--primary) / 0.15)',
                color: 'hsl(var(--primary))',
                fontWeight: 600,
              }}
            />
          </Box>

          {/* Self-Hosted Tab */}
          <TabPanel value={activeTab} index={0}>
            <Typography sx={{ color: 'hsl(var(--foreground))', fontWeight: 600, mb: 2, fontSize: '0.9rem' }}>
              Deploy the Sensor
            </Typography>
            
            <Box sx={{ mb: 3 }}>
              {selfHostedSteps.map((step, i) => (
                <StepItem key={i} number={i + 1}>{step}</StepItem>
              ))}
            </Box>
            
            <Box
              sx={{
                position: 'relative',
                backgroundColor: 'hsl(var(--muted))',
                borderRadius: 1.5,
                border: '1px solid hsl(var(--border))',
                p: 2,
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                color: 'hsl(var(--foreground))',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
                <IconButton
                  onClick={handleCopy}
                  size="small"
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    '&:hover': { backgroundColor: 'hsl(var(--muted))' },
                  }}
                >
                  {copied ? (
                    <CheckIcon size={16} style={{ color: 'hsl(var(--severity-low))' }} />
                  ) : (
                    <ContentCopyIcon size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
                  )}
                </IconButton>
              </Tooltip>
              {dockerCommand}
            </Box>

            {!authKey && (
              <Alert 
                severity="warning" 
                sx={{ 
                  mt: 2,
                  backgroundColor: 'hsl(var(--severity-medium) / 0.1)',
                  border: '1px solid hsl(var(--severity-medium) / 0.3)',
                  color: 'hsl(var(--foreground))',
                  '& .MuiAlert-icon': { color: 'hsl(var(--severity-medium))' },
                }}
              >
                API key not found. Please ensure you're logged in with a valid API key.
              </Alert>
            )}
          </TabPanel>

          {/* Cloud Provider Tabs */}
          {(['gcp', 'aws', 'azure'] as const).map((provider, idx) => (
            <TabPanel key={provider} value={activeTab} index={idx + 1}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                <Button
                  variant="contained"
                  startIcon={vmProvisioningSteps[provider].icon}
                  endIcon={<OpenInNewIcon />}
                  href={vmProvisioningSteps[provider].consoleUrl}
                  target="_blank"
                  sx={{
                    backgroundColor: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary-foreground))',
                    textTransform: 'none',
                    '&:hover': { backgroundColor: 'hsl(var(--primary) / 0.9)' },
                  }}
                >
                  Open {vmProvisioningSteps[provider].name} Console
                </Button>
              </Box>

              <Typography sx={{ color: 'hsl(var(--foreground))', fontWeight: 600, mb: 2, fontSize: '0.9rem' }}>
                Create a VM
              </Typography>
              <Box sx={{ mb: 3 }}>
                {vmProvisioningSteps[provider].steps.map((step, i) => (
                  <StepItem key={i} number={i + 1}>{step}</StepItem>
                ))}
              </Box>

              <Typography sx={{ color: 'hsl(var(--foreground))', fontWeight: 600, mb: 2, fontSize: '0.9rem' }}>
                Run the Sensor
              </Typography>
              <Box
                sx={{
                  position: 'relative',
                  backgroundColor: 'hsl(var(--muted))',
                  borderRadius: 1.5,
                  border: '1px solid hsl(var(--border))',
                  p: 2,
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  color: 'hsl(var(--foreground))',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
                  <IconButton
                    onClick={handleCopy}
                    size="small"
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      '&:hover': { backgroundColor: 'hsl(var(--muted))' },
                    }}
                  >
                    {copied ? (
                      <CheckIcon size={16} style={{ color: 'hsl(var(--severity-low))' }} />
                    ) : (
                      <ContentCopyIcon size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    )}
                  </IconButton>
                </Tooltip>
                {dockerCommand}
              </Box>

              {!authKey && (
                <Alert 
                  severity="warning" 
                  sx={{ 
                    mt: 2,
                    backgroundColor: 'hsl(var(--severity-medium) / 0.1)',
                    border: '1px solid hsl(var(--severity-medium) / 0.3)',
                    color: 'hsl(var(--foreground))',
                    '& .MuiAlert-icon': { color: 'hsl(var(--severity-medium))' },
                  }}
                >
                  API key not found. Please ensure you're logged in with a valid API key.
                </Alert>
              )}
            </TabPanel>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
};
