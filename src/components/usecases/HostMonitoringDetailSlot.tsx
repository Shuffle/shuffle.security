import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  Server,
  ShieldCheck,
  Lock,
  Package,
  Terminal,
  ExternalLink,
  Copy,
  Check,
  Plus,
  PlayCircle,
  Activity,
  HardDrive,
} from 'lucide-react';
import { useHostMonitorCount } from '@/hooks/useHostMonitorCount';
import { toast } from '@/lib/toast';

interface HostMonitoringDetailSlotProps {
  onDeployClick?: () => void;
  onManageClick?: () => void;
}

type Platform = 'linux' | 'macos' | 'windows';

export const HostMonitoringDetailSlot: React.FC<HostMonitoringDetailSlotProps> = ({
  onDeployClick,
  onManageClick,
}) => {
  const hostCount = useHostMonitorCount();
  const [platform, setPlatform] = useState<Platform>('linux');
  const [copied, setCopied] = useState(false);

  const isConnected = typeof hostCount === 'number' && hostCount > 0;

  const getQuickCommand = (plat: Platform) => {
    switch (plat) {
      case 'windows':
        return `powershell -ExecutionPolicy Bypass -Command "& {iex (irm 'https://shuffler.io/api/v1/orborus?sensor_mode=true&os=windows')}"`;
      case 'macos':
        return `curl -sSL 'https://shuffler.io/api/v1/orborus?sensor_mode=true&os=darwin' | sudo bash`;
      case 'linux':
      default:
        return `curl -sSL 'https://shuffler.io/api/v1/orborus?sensor_mode=true' | bash`;
    }
  };

  const handleCopy = () => {
    const cmd = getQuickCommand(platform);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(cmd).catch(() => {});
      }
    } catch {}
    setCopied(true);
    toast.success('Command copied to clipboard', {
      description: 'Run this command on the target host or use the full Deploy wizard for custom groups.',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const capabilities = [
    {
      icon: HardDrive,
      title: 'Disk Encryption',
      desc: 'FileVault, BitLocker, and LUKS encryption verification',
    },
    {
      icon: Lock,
      title: 'Screen Lock',
      desc: 'Inactivity timeouts and password-on-wake enforcement',
    },
    {
      icon: Package,
      title: 'Package Scanner',
      desc: 'Continuous SBOM and CVE tracking for npm, pip, go, cargo',
    },
    {
      icon: PlayCircle,
      title: 'Response Actions',
      desc: 'On-demand containment, process termination, and triage',
    },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Status & Overview Bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
          p: 2,
          borderRadius: 2,
          bgcolor: isConnected ? 'rgba(34, 197, 94, 0.08)' : 'rgba(234, 179, 8, 0.08)',
          border: '1px solid',
          borderColor: isConnected ? 'rgba(34, 197, 94, 0.25)' : 'rgba(234, 179, 8, 0.25)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: '50%',
              bgcolor: isConnected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
              color: isConnected ? '#22c55e' : '#eab308',
            }}
          >
            {isConnected ? <ShieldCheck size={22} /> : <Server size={22} />}
          </Box>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: 'text.primary' }}>
                {hostCount === null
                  ? 'Checking host monitors...'
                  : isConnected
                    ? `${hostCount} Active ${hostCount === 1 ? 'Host Monitor' : 'Host Monitors'}`
                    : 'No Host Monitors Deployed'}
              </Typography>
              <Chip
                label={isConnected ? 'Healthy' : 'Setup Required'}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  bgcolor: isConnected ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                  color: isConnected ? '#16a34a' : '#ca8a04',
                  borderRadius: 1,
                }}
              />
            </Box>
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mt: 0.25 }}>
              {isConnected
                ? 'Endpoints are actively streaming security posture and telemetry into Shuffle.'
                : 'Deploy the lightweight Shuffle sensor to endpoints to stream compliance, vulnerabilities, and telemetry.'}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {onDeployClick && (
            <Button
              variant="contained"
              size="small"
              onClick={onDeployClick}
              startIcon={<Plus size={15} />}
              sx={{
                fontSize: '0.78rem',
                fontWeight: 600,
                textTransform: 'none',
                bgcolor: '#22c55e',
                color: '#fff',
                '&:hover': { bgcolor: '#16a34a' },
              }}
            >
              Deploy Host
            </Button>
          )}
          {onManageClick && (
            <Button
              variant="outlined"
              size="small"
              onClick={onManageClick}
              endIcon={<ExternalLink size={13} />}
              sx={{
                fontSize: '0.78rem',
                fontWeight: 600,
                textTransform: 'none',
                color: 'text.primary',
                borderColor: 'divider',
                '&:hover': { borderColor: 'text.secondary', bgcolor: 'action.hover' },
              }}
            >
              Monitors View
            </Button>
          )}
        </Box>
      </Box>

      {/* Quick Deploy Command Box */}
      <Box
        sx={{
          p: 2,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Terminal size={16} className="text-muted-foreground" />
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'text.primary' }}>
              Quick Deploy Command
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 0.5, bgcolor: 'action.hover', p: 0.5, borderRadius: 1.5 }}>
            {(['linux', 'macos', 'windows'] as Platform[]).map((p) => (
              <Button
                key={p}
                size="small"
                onClick={() => setPlatform(p)}
                sx={{
                  minWidth: 64,
                  py: 0.3,
                  px: 1,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: 1,
                  color: platform === p ? '#fff' : 'text.secondary',
                  bgcolor: platform === p ? 'primary.main' : 'transparent',
                  '&:hover': {
                    bgcolor: platform === p ? 'primary.dark' : 'action.selected',
                  },
                }}
              >
                {p === 'linux' ? 'Linux' : p === 'macos' ? 'macOS' : 'Windows'}
              </Button>
            ))}
          </Box>
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            p: 1.25,
            borderRadius: 1.5,
            bgcolor: 'action.selected',
            border: '1px solid',
            borderColor: 'divider',
            fontFamily: 'monospace',
            fontSize: '0.78rem',
            color: 'text.primary',
            overflowX: 'auto',
          }}
        >
          <Typography
            component="code"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.76rem',
              color: 'text.primary',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
            }}
          >
            {getQuickCommand(platform)}
          </Typography>
          <Tooltip title={copied ? 'Copied!' : 'Copy command'}>
            <Button
              size="small"
              onClick={handleCopy}
              startIcon={copied ? <Check size={13} /> : <Copy size={13} />}
              sx={{
                minWidth: 70,
                py: 0.3,
                fontSize: '0.72rem',
                textTransform: 'none',
                color: copied ? '#22c55e' : 'text.secondary',
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </Tooltip>
        </Box>

        <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 1 }}>
          Run on target machines as root/administrator. For custom monitor groups or token auth, click <strong>Deploy Host</strong> above.
        </Typography>
      </Box>

      {/* Monitored Capabilities Grid */}
      <Box>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary', letterSpacing: '0.05em', textTransform: 'uppercase', mb: 1 }}>
          Continuous Posture & Telemetry Capabilities
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 1.25,
          }}
        >
          {capabilities.map((cap) => {
            const Icon = cap.icon;
            return (
              <Box
                key={cap.title}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1.25,
                  p: 1.5,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    borderRadius: 1,
                    bgcolor: 'action.hover',
                    color: 'primary.main',
                    flexShrink: 0,
                    mt: 0.25,
                  }}
                >
                  <Icon size={16} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'text.primary' }}>
                    {cap.title}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', lineHeight: 1.3, mt: 0.25 }}>
                    {cap.desc}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Shuffle Workflows Integration Note */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          p: 1.5,
          borderRadius: 1.5,
          bgcolor: 'action.hover',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Activity size={18} className="text-muted-foreground shrink-0" />
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
          Host monitors stream real-time events into Shuffle. You can bind automated response workflows to trigger endpoint containment, run memory diagnostics, or audit compliance drift automatically.
        </Typography>
      </Box>
    </Box>
  );
};

export default HostMonitoringDetailSlot;
