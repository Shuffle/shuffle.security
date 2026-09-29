import { Box, Typography, Chip } from '@mui/material';
import shuffleIcon from '@/assets/shuffle-icon.png';

export function ShufflePipelinesBanner() {
  return (
    <Box
      component="a"
      href="/detection"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
        mb: 2,
        borderRadius: 2.5,
        background: 'linear-gradient(135deg, hsla(25, 100%, 50%, 0.08) 0%, hsla(25, 100%, 50%, 0.03) 100%)',
        border: '1px solid hsla(25, 100%, 50%, 0.2)',
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        '&:hover': {
          border: '1px solid hsla(25, 100%, 50%, 0.4)',
          background: 'linear-gradient(135deg, hsla(25, 100%, 50%, 0.12) 0%, hsla(25, 100%, 50%, 0.05) 100%)',
        },
      }}
    >
      <Box
        component="img"
        src={shuffleIcon}
        alt="Shuffle"
        sx={{ width: 36, height: 36, borderRadius: '10px', flexShrink: 0 }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'hsl(var(--foreground))', lineHeight: 1.3 }}>
          Shuffle Pipelines
        </Typography>
        <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.4 }}>
          Do not have a SIEM? Shuffle can ingest, parse, and correlate your logs and events directly — no external SIEM required.
        </Typography>
      </Box>
      <Chip
        label="Built-in"
        size="small"
        sx={{
          height: 22,
          fontSize: '0.65rem',
          fontWeight: 700,
          backgroundColor: 'hsl(var(--primary) / 0.15)',
          color: 'hsl(var(--primary))',
          border: '1px solid hsl(var(--primary) / 0.3)',
          flexShrink: 0,
        }}
      />
    </Box>
  );
}

export default ShufflePipelinesBanner;
