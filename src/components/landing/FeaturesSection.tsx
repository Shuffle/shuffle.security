import { Box, Container, Typography, Grid, Stack } from '@mui/material';
import { motion } from 'framer-motion';
import { Link } from '@/lib/router-compat';
import shuffleIcon from '@/assets/shuffle-icon.png';

interface FeatureSectionProps {
  icon: React.ReactNode;
  title: string;
  highlight: string;
  description: string;
  bullets: string[];
  color: string;
  reverse?: boolean;
  visual: React.ReactNode;
  link?: string;
  linkLabel?: string;
}

const FeatureSection = ({ title, highlight, description, bullets, color, reverse, visual, link, linkLabel }: FeatureSectionProps) => (
  <Box 
    sx={{ 
      py: { xs: 10, md: 16 },
      position: 'relative',
      overflow: 'hidden',
    }}
  >
    {/* Section background glow */}
    <Box
      sx={{
        position: 'absolute',
        top: '50%',
        left: reverse ? '20%' : '80%',
        transform: 'translate(-50%, -50%)',
        width: '60%',
        height: '80%',
        background: `radial-gradient(ellipse at center, ${color}08 0%, transparent 60%)`,
        pointerEvents: 'none',
      }}
    />

    <Container maxWidth="lg">
      <Grid 
        container 
        spacing={{ xs: 6, md: 10 }} 
        alignItems="center"
        direction={reverse ? 'row-reverse' : 'row'}
      >
        <Grid size={{ xs: 12, md: 6 }}>
          <motion.div
            initial={{ opacity: 0, x: reverse ? 40 : -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7 }}
          >
            <Typography
              variant="h2"
              sx={{
                fontSize: { xs: '2rem', md: '3rem' },
                fontWeight: 700,
                mb: 3,
                lineHeight: 1.15,
              }}
            >
              {title}{' '}
              <Box
                component="span"
                sx={{
                  background: `linear-gradient(135deg, ${color} 0%, ${color}99 100%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {highlight}
              </Box>
            </Typography>
            <Typography
              sx={{
                color: 'text.secondary',
                fontWeight: 400,
                mb: 5,
                lineHeight: 1.8,
                fontSize: { xs: '1rem', md: '1.15rem' },
              }}
            >
              {description}
            </Typography>
            <Stack spacing={2.5}>
              {bullets.map((bullet, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                    <Box
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: `${color}15`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        mt: 0.25,
                      }}
                    >
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: color,
                        }}
                      />
                    </Box>
                    <Typography sx={{ color: 'text.secondary', lineHeight: 1.6, fontSize: '1.05rem' }}>
                      {bullet}
                    </Typography>
                  </Box>
                </motion.div>
              ))}
            </Stack>
            {link && (
              <Box sx={{ mt: 5 }}>
                <Box
                  component={link.startsWith('http') ? 'a' : Link}
                  {...(link.startsWith('http')
                    ? { href: link, target: '_blank', rel: 'noopener noreferrer' }
                    : { to: link })}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 1.25,
                    px: 2.5,
                    borderRadius: 2,
                    background: `${color}12`,
                    border: `1px solid ${color}30`,
                    color,
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    textDecoration: 'none',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      background: `${color}1f`,
                      borderColor: `${color}55`,
                      transform: 'translateX(4px)',
                    },
                  }}
                >
                  {linkLabel || 'View feature details'} →
                </Box>
              </Box>
            )}
          </motion.div>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <motion.div
            initial={{ opacity: 0, x: reverse ? -40 : 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            {visual}
          </motion.div>
        </Grid>
      </Grid>
    </Container>
  </Box>
);

// Custom visual components for each feature
const AIAgentVisual = () => (
  <Box
    sx={{
      p: 4,
      borderRadius: 4,
      background: 'linear-gradient(145deg, rgba(255, 102, 0, 0.08) 0%, rgba(255, 102, 0, 0.02) 100%)',
      border: '1px solid rgba(255, 102, 0, 0.15)',
      position: 'relative',
      overflow: 'hidden',
    }}
  >
    {/* Chat-like interface */}
    <Stack spacing={3}>
      {/* AI thinking bubble */}
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Box
          component={motion.div}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            background: 'linear-gradient(135deg, #FF6600 0%, #FF8533 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            flexShrink: 0,
          }}
        >
          <img src={shuffleIcon} alt="Shuffle Security logo" style={{ width: 24, height: 24, borderRadius: 4 }} />
        </Box>
        <Box
          sx={{
            flex: 1,
            p: 2.5,
            borderRadius: 3,
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
          }}
        >
          <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem', mb: 1.5 }}>
            Detected suspicious login from unusual location
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Box sx={{ py: 0.5, px: 1.5, borderRadius: 2, background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <Typography sx={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 600 }}>High Risk</Typography>
            </Box>
            <Box sx={{ py: 0.5, px: 1.5, borderRadius: 2, background: 'rgba(255, 102, 0, 0.15)', border: '1px solid rgba(255, 102, 0, 0.3)' }}>
              <Typography sx={{ color: '#FF6600', fontSize: '0.75rem', fontWeight: 600 }}>Awaiting Approval</Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Suggested action */}
      <Box
        sx={{
          p: 3,
          borderRadius: 3,
          background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.03) 100%)',
          border: '1px solid rgba(34, 197, 94, 0.2)',
        }}
      >
        <Typography sx={{ color: '#22c55e', fontSize: '0.8rem', fontWeight: 600, mb: 1 }}>
          SUGGESTED ACTION
        </Typography>
        <Typography sx={{ color: 'text.primary', fontSize: '0.95rem', mb: 2 }}>
          Disable account and require password reset
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box
            component={motion.div}
            whileHover={{ scale: 1.05 }}
            sx={{
              py: 1,
              px: 3,
              borderRadius: 2,
              background: '#22c55e',
              cursor: 'pointer',
            }}
          >
            <Typography sx={{ color: 'white', fontSize: '0.85rem', fontWeight: 600 }}>Approve</Typography>
          </Box>
          <Box
            sx={{
              py: 1,
              px: 3,
              borderRadius: 2,
              border: '1px solid hsl(var(--border))',
              cursor: 'pointer',
            }}
          >
            <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>Modify</Typography>
          </Box>
        </Box>
      </Box>
    </Stack>
  </Box>
);

const UniversalReachVisual = () => (
  <Box
    sx={{
      p: 4,
      borderRadius: 4,
      background: 'linear-gradient(145deg, rgba(34, 197, 94, 0.06) 0%, rgba(34, 197, 94, 0.01) 100%)',
      border: '1px solid rgba(34, 197, 94, 0.12)',
      position: 'relative',
    }}
  >
    {/* Environment nodes */}
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {[
        { label: 'Cloud', items: ['AWS', 'Azure', 'GCP'], color: '#4285F4', status: 'connected' },
        { label: 'On-Premises', items: ['DC1', 'DC2', 'DR Site'], color: '#8b5cf6', status: 'connected' },
        { label: 'Hybrid', items: ['VPN', 'DirectConnect'], color: '#22c55e', status: 'syncing' },
      ].map((env, i) => (
        <motion.div
          key={env.label}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.15 }}
        >
          <Box
            sx={{
              p: 2.5,
              borderRadius: 3,
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>{env.label}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  component={motion.div}
                  animate={env.status === 'syncing' ? { opacity: [1, 0.5, 1] } : {}}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: env.status === 'connected' ? '#22c55e' : '#f59e0b',
                  }}
                />
                <Typography sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  {env.status === 'connected' ? 'Connected' : 'Syncing'}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              {env.items.map((item) => (
                <Box
                  key={item}
                  sx={{
                    py: 0.75,
                    px: 2,
                    borderRadius: 2,
                    background: `${env.color}10`,
                    border: `1px solid ${env.color}25`,
                  }}
                >
                  <Typography sx={{ color: env.color, fontSize: '0.8rem', fontWeight: 500 }}>{item}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </motion.div>
      ))}
    </Box>
  </Box>
);

const IntegrationsVisual = () => (
  <Box
    sx={{
      p: 4,
      borderRadius: 4,
      background: 'linear-gradient(145deg, rgba(139, 92, 246, 0.06) 0%, rgba(139, 92, 246, 0.01) 100%)',
      border: '1px solid rgba(139, 92, 246, 0.12)',
    }}
  >
    {/* Integration grid with styled boxes */}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: { xs: 1.5, md: 2 } }}>
      {[
        { name: 'Splunk', abbr: 'SPL', color: '#65A637' },
        { name: 'CrowdStrike', abbr: 'CS', color: '#E01E5A' },
        { name: 'AWS', abbr: 'AWS', color: '#FF9900' },
        { name: 'ServiceNow', abbr: 'SN', color: '#81B5A1' },
        { name: 'VirusTotal', abbr: 'VT', color: '#394EFF' },
        { name: 'Azure', abbr: 'AZ', color: '#0089D6' },
        { name: 'Jira', abbr: 'JRA', color: '#0052CC' },
        { name: 'GCP', abbr: 'GCP', color: '#4285F4' },
      ].map((int, i) => (
        <motion.div
          key={int.name}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.05 }}
          whileHover={{ scale: 1.1, y: -4 }}
        >
          <Box
            component={Link}
            to={`/apps?search=${encodeURIComponent(int.name)}`}
            onClick={() => {
              import('@/lib/analytics').then(({ trackCTA }) => trackCTA(`integration_${int.name}`, 'features_grid'));
            }}
            sx={{
              aspectRatio: '1',
              borderRadius: 3,
              background: `linear-gradient(135deg, ${int.color}15 0%, ${int.color}08 100%)`,
              border: `1px solid ${int.color}30`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              cursor: 'pointer',
              p: 2,
              textDecoration: 'none',
              transition: 'all 0.2s ease',
              '&:hover': {
                background: `${int.color}20`,
                borderColor: `${int.color}50`,
              },
            }}
          >
            <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: int.color }}>{int.abbr}</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.65rem', fontWeight: 500, textAlign: 'center' }}>{int.name}</Typography>
          </Box>
        </motion.div>
      ))}
    </Box>
    <Box 
      component={Link}
      to="/apps"
      onClick={() => {
        import('@/lib/analytics').then(({ trackCTA }) => trackCTA('view_all_integrations', 'features_grid'));
      }}
      sx={{ 
        mt: 3, 
        p: 2, 
        borderRadius: 2, 
        background: 'rgba(139, 92, 246, 0.1)', 
        border: '1px solid rgba(139, 92, 246, 0.2)',
        textDecoration: 'none',
        display: 'block',
      }}
    >
      <Typography sx={{ color: '#8b5cf6', fontSize: '0.85rem', textAlign: 'center' }}>
        3,000+ integrations • Webhooks • App SDK
      </Typography>
    </Box>
  </Box>
);

const DetectionLoopVisual = () => {
  const stages = [
    { label: 'Detect', icon: 'D', color: '#ef4444', desc: 'New threat detected' },
    { label: 'Analyze', icon: 'A', color: '#f59e0b', desc: 'Analyst reviews' },
    { label: 'Respond', icon: 'R', color: '#22c55e', desc: 'Action executed' },
    { label: 'Tune', icon: 'T', color: '#0ea5e9', desc: 'Rules refined' },
  ];

  return (
    <Box
      sx={{
        p: 4,
        borderRadius: 4,
        background: 'linear-gradient(145deg, rgba(14, 165, 233, 0.06) 0%, rgba(14, 165, 233, 0.01) 100%)',
        border: '1px solid rgba(14, 165, 233, 0.12)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Loop container with curved return path - centered */}
      <Box sx={{ display: 'flex', position: 'relative', justifyContent: 'center' }}>
        <Box sx={{ display: 'flex', position: 'relative', maxWidth: 320 }}>
          {/* Left side: SVG curved return path with animated arrow */}
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              top: 12,
              bottom: 12,
              width: 32,
            }}
          >
            <svg
              width="32"
              height="100%"
              viewBox="0 0 32 200"
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            >
              {/* Dashed path */}
              <path
                id="loopPath"
                d="M 28 195 C 28 195, 8 195, 8 180 L 8 20 C 8 5, 28 5, 28 5"
                fill="none"
                stroke="rgba(14, 165, 233, 0.4)"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
              {/* Animated circle following the path */}
              <motion.circle
                r="5"
                fill="#0ea5e9"
                initial={{ offsetDistance: '0%' }}
                animate={{ offsetDistance: '100%' }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                style={{
                  offsetPath: 'path("M 28 195 C 28 195, 8 195, 8 180 L 8 20 C 8 5, 28 5, 28 5")',
                }}
              />
            </svg>
          </Box>

          {/* Main flow */}
          <Stack spacing={0} sx={{ flex: 1, pl: 5 }}>
          {stages.map((stage, i) => (
            <motion.div
              key={stage.label}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {/* Icon with connector */}
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 48 }}>
                  <Box
                    component={motion.div}
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      background: `linear-gradient(135deg, ${stage.color}20 0%, ${stage.color}10 100%)`,
                      border: `1px solid ${stage.color}40`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.1rem',
                      fontWeight: 800,
                      color: stage.color,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {stage.icon}
                  </Box>
                  {i < stages.length - 1 && (
                    <Box
                      sx={{
                        width: 2,
                        height: 24,
                        background: `linear-gradient(to bottom, ${stage.color}60, ${stages[i + 1].color}60)`,
                      }}
                    />
                  )}
                </Box>
                
                {/* Content */}
                <Box sx={{ flex: 1, py: 1 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: stage.color }}>
                    {stage.label}
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                    {stage.desc}
                  </Typography>
                </Box>
              </Box>
            </motion.div>
          ))}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
};

const HostMonitorVisual = () => {
  const checks = [
    { label: 'Disk Encryption', status: 'pass', color: '#22c55e' },
    { label: 'Screenlock Policy', status: 'pass', color: '#22c55e' },
    { label: 'OS Patch Level', status: 'warn', color: '#f59e0b' },
    { label: 'EDR Running', status: 'pass', color: '#22c55e' },
    { label: 'Firewall Enabled', status: 'fail', color: '#ef4444' },
  ];
  return (
    <Box
      sx={{
        p: 4,
        borderRadius: 4,
        background: 'linear-gradient(145deg, rgba(16, 185, 129, 0.06) 0%, rgba(16, 185, 129, 0.01) 100%)',
        border: '1px solid rgba(16, 185, 129, 0.15)',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>laptop-fin-04</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>macOS 14.5 • SOC2 baseline</Typography>
        </Box>
        <Box sx={{ py: 0.5, px: 1.5, borderRadius: 2, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          <Typography sx={{ color: '#10b981', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em' }}>ONLINE</Typography>
        </Box>
      </Box>
      <Stack spacing={1.25}>
        {checks.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderRadius: 2, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Typography sx={{ fontSize: '0.85rem' }}>{c.label}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: c.color }} />
                <Typography sx={{ color: c.color, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>{c.status}</Typography>
              </Box>
            </Box>
          </motion.div>
        ))}
      </Stack>
      <Box sx={{ mt: 2.5, p: 1.75, borderRadius: 2, background: 'rgba(14, 165, 233, 0.08)', border: '1px solid rgba(14, 165, 233, 0.2)', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
        <Typography sx={{ color: '#0ea5e9', fontSize: '0.75rem' }}>$ shuffle exec --host laptop-fin-04 -- enable-firewall</Typography>
      </Box>
    </Box>
  );
};

const VulnAutomationVisual = () => {
  const vulns = [
    { cve: 'CVE-2024-3094', sev: 'Critical', color: '#ef4444', action: 'Auto-patched on 12 hosts' },
    { cve: 'CVE-2024-21413', sev: 'High', color: '#f97316', action: 'Ticket created in Jira' },
    { cve: 'CVE-2023-44487', sev: 'Medium', color: '#f59e0b', action: 'Suppressed (not exploitable)' },
  ];
  return (
    <Box
      sx={{
        p: 4,
        borderRadius: 4,
        background: 'linear-gradient(145deg, rgba(244, 63, 94, 0.06) 0%, rgba(244, 63, 94, 0.01) 100%)',
        border: '1px solid rgba(244, 63, 94, 0.15)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>Vulnerability Pipeline</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>437 findings · last 24h</Typography>
      </Box>
      <Stack spacing={1.5}>
        {vulns.map((v, i) => (
          <motion.div
            key={v.cve}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Box sx={{ p: 2, borderRadius: 2, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{v.cve}</Typography>
                <Box sx={{ py: 0.25, px: 1, borderRadius: 1, background: `${v.color}20`, border: `1px solid ${v.color}40` }}>
                  <Typography sx={{ color: v.color, fontSize: '0.7rem', fontWeight: 700 }}>{v.sev}</Typography>
                </Box>
              </Box>
              <Typography sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>→ {v.action}</Typography>
            </Box>
          </motion.div>
        ))}
      </Stack>
      <Box sx={{ mt: 2.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {['Enrich', 'Prioritize', 'Patch', 'Verify'].map((step, i) => (
          <Box key={step} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ py: 0.5, px: 1.5, borderRadius: 1.5, background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.25)' }}>
              <Typography sx={{ color: '#f43f5e', fontSize: '0.7rem', fontWeight: 600 }}>{step}</Typography>
            </Box>
            {i < 3 && <Typography sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>→</Typography>}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

const features: Omit<FeatureSectionProps, 'reverse'>[] = [
  {
    icon: null,
    title: 'Automatic Security',
    highlight: 'You Control',
    description: 'Configure once, run forever. Enable or disable automatic capabilities at your whim — the platform does exactly what you tell it to, when you tell it to.',
    bullets: [
      'Automatic triage and threat enrichment in seconds',
      'Suggested response actions you approve with one click',
      'Works with any LLM — cloud APIs or your own models',
      'Full transparency into every automated decision',
    ],
    color: '#FF6600',
    visual: <AIAgentVisual />,
    link: '/agents',
    linkLabel: 'See the AI Agent',
  },
  {
    icon: null,
    title: 'Universal',
    highlight: 'Reach',
    description: 'One platform that connects everywhere. Cloud, on-prem, air-gapped — no environment is out of reach. Your security automation finally works everywhere your infrastructure lives.',
    bullets: [
      'Native connectors for AWS, Azure, GCP, and more',
      'On-prem agents for internal and isolated networks',
      'Hybrid deployments that bridge everything',
      'Zero trust — your data stays where you want it',
    ],
    color: '#22c55e',
    visual: <UniversalReachVisual />,
    link: '/infrastructure',
    linkLabel: 'Explore the Infrastructure view',
  },
  {
    icon: null,
    title: '3,000+',
    highlight: 'MCP-Ready Integrations',
    description: 'Use your existing tools, fill in the gaps. SIEM, Email, EDR, ITSM, Threat Intel — connect them all via MCP and find ANY information in ANY of your data sources.',
    bullets: [
      'Splunk, CrowdStrike, Sentinel, ServiceNow, and 3,000+ more',
      'All integrations are MCP-compatible out of the box',
      'Bi-directional sync keeps everything in lockstep',
      'Build new integrations in minutes with our SDK',
    ],
    color: '#8b5cf6',
    visual: <IntegrationsVisual />,
    link: '/apps',
    linkLabel: 'Browse the Apps catalog',
  },
  {
    icon: null,
    title: 'Detection &',
    highlight: 'Endpoint Visibility',
    description: 'Do not have a SIEM? Use Shuffle Pipelines to ingest, parse and match Sigma rules with Tenzir — and deploy host monitors for endpoint compliance and remote response.',
    bullets: [
      'Shuffle Pipelines: Tenzir-powered ingest with Sigma rule matching',
      'Host monitors for encryption, screenlock and software inventory',
      'Run commands on any monitored endpoint from the browser',
      'No SIEM required, no per-GB pricing — your hardware, your data',
    ],
    color: '#0ea5e9',
    visual: <DetectionLoopVisual />,
    link: '/docs/shuffle-pipelines',
    linkLabel: 'Read the Pipelines guide',
  },
  {
    icon: null,
    title: 'Host Monitoring for',
    highlight: 'SOC2 & Response',
    description: 'Lightweight monitors on every endpoint give you continuous compliance evidence, vulnerability signals, and a remote action channel — without standing up an EDR.',
    bullets: [
      'Continuous SOC2 checks: encryption, screenlock, patching, MDM posture',
      'Live software inventory and vulnerability matching per host',
      'Run shell commands or response actions on any host from the browser',
      'Audit trail of every check and action for your auditors',
    ],
    color: '#10b981',
    visual: <HostMonitorVisual />,
    link: '/monitors',
    linkLabel: 'See Host Monitors',
  },
  {
    icon: null,
    title: 'Vulnerability',
    highlight: 'Automation at Scale',
    description: 'Stop drowning in CVEs. Ingest findings from any scanner, enrich with threat intel and reachability, then route fixes through automated patching or ticketing workflows.',
    bullets: [
      'Ingest from Qualys, Tenable, Wiz, Defender and host monitors',
      'Auto-prioritize using severity, affected assets and exploitability context',
      'Trigger patch, isolate, ticket or suppression workflows automatically',
      'Track MTTR per team, asset and severity in one place',
    ],
    color: '#f43f5e',
    visual: <VulnAutomationVisual />,
    link: '/vulnerabilities',
    linkLabel: 'Open Vulnerability Management',
  },
];

export const FeaturesSection = () => {
  return (
    <Box id="features">
      {/* Section header */}
      <Box 
        sx={{ 
          py: { xs: 10, md: 14 }, 
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <Container maxWidth="md">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Typography
              variant="h2"
              sx={{
                mb: 3,
                fontSize: { xs: '2.25rem', md: '3.5rem' },
                fontWeight: 700,
              }}
            >
              Built for teams who want{' '}
              <Box
                component="span"
                sx={{
                  background: 'linear-gradient(135deg, #FF6600 0%, #FF8533 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                results
              </Box>
              , not busywork
            </Typography>
            <Typography
              sx={{
                color: 'text.secondary',
                maxWidth: 600,
                mx: 'auto',
                fontWeight: 400,
                fontSize: { xs: '1.05rem', md: '1.25rem' },
                lineHeight: 1.7,
              }}
            >
              Stop drowning in alerts. Let AI handle the noise while you focus on what matters.
            </Typography>
          </motion.div>
        </Container>
      </Box>

      {/* Individual feature sections */}
      {features.map((feature, index) => (
        <FeatureSection key={feature.title} {...feature} reverse={index % 2 === 1} />
      ))}
    </Box>
  );
};