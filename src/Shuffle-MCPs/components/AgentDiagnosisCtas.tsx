/**
 * Shared CTA strip rendered for an agent diagnosis.
 *
 * Used in BOTH:
 *  - the inline AgentRunDiagnosisBanner shown above an agent run
 *  - the tooltip inside AgentRunStatusBadge (the "Needs attention" pill)
 *
 * Currently only the `token_limit` diagnosis surfaces CTAs:
 *   1. Change LLM      -> opens the global Agent drawer on the Local LLM tab
 *   2. Get more tokens -> opens the Shuffle support contact form
 *
 * Returns `null` when the diagnosis has no associated CTAs, so callers can
 * render it unconditionally.
 */
import { Box, Button, Tooltip } from '@mui/material';
import { ExternalLink, Settings2 } from 'lucide-react';
import type { OutputDiagnosis } from '@/Shuffle-MCPs/agentDiagnosis';
import type { ShuffleHostProps } from '@/Shuffle-Core/host-props';
import { navigateToShuffleCore } from '@/Shuffle-MCPs/navigation';

interface Props extends ShuffleHostProps {
  diagnosis: OutputDiagnosis | null | undefined;
  /** When true, renders compact buttons sized for a tooltip. */
  compact?: boolean;
  /** Tone that drives accent colors (matches banner tone). */
  tone?: 'critical' | 'medium';
}

const openLocalLlmTab = (e: React.MouseEvent) => {
  e.stopPropagation();
  window.dispatchEvent(
    new CustomEvent('agent-drawer-open', { detail: { tab: 'localLLM' } }),
  );
};

const openSupportContact = async (e: React.MouseEvent) => {
  e.stopPropagation();
  await navigateToShuffleCore('https://shuffler.io/contact?category=Support', { newTab: true });
};

export { diagnosisHasCtas } from '@/Shuffle-MCPs/agentDiagnosis';
import { diagnosisHasCtas } from '@/Shuffle-MCPs/agentDiagnosis';

const AgentDiagnosisCtas = ({ diagnosis, compact = false, tone = 'medium' }: Props) => {
  if (!diagnosisHasCtas(diagnosis)) return null;

  const height = compact ? 26 : 32;
  const fontSize = compact ? '0.7rem' : '0.78rem';
  const iconSize = compact ? 12 : 14;
  const px = compact ? 1 : 1.5;

  if (diagnosis?.kind === 'ai_auth' || diagnosis?.isAiAuth) {
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 0.5 : 1 }}>
        <Tooltip title="Open Local LLM settings to update your API key or model configuration" placement="top" arrow>
          <Button
            size="small"
            variant="contained"
            disableElevation
            onClick={openLocalLlmTab}
            sx={{
              textTransform: 'none',
              fontSize,
              fontWeight: 600,
              height,
              px,
              bgcolor: `hsl(var(--severity-${tone}))`,
              color: 'hsl(var(--background))',
              '&:hover': { bgcolor: `hsla(var(--severity-${tone}) / 0.88)` },
            }}
          >
            Change authentication
          </Button>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 0.5 : 1 }}>
      <Tooltip title="Configure your own LLM vendor (OpenAI-compatible endpoint)" placement="top" arrow>
        <Button
          size="small"
          variant="contained"
          disableElevation
          startIcon={<Settings2 size={iconSize} />}
          onClick={openLocalLlmTab}
          sx={{
            textTransform: 'none',
            fontSize,
            fontWeight: 600,
            height,
            px,
            bgcolor: `hsl(var(--severity-${tone}))`,
            color: 'hsl(var(--background))',
            '&:hover': { bgcolor: `hsla(var(--severity-${tone}) / 0.88)` },
          }}
        >
          Change LLM
        </Button>
      </Tooltip>
      <Tooltip title="Contact Shuffle Support to get more tokens" placement="top" arrow>
        <Button
          size="small"
          variant="outlined"
          endIcon={<ExternalLink size={iconSize} />}
          onClick={openSupportContact}
          sx={{
            textTransform: 'none',
            fontSize,
            fontWeight: 600,
            height,
            px,
            borderColor: `hsla(var(--severity-${tone}) / 0.5)`,
            color: 'hsl(var(--foreground))',
            '&:hover': {
              borderColor: `hsl(var(--severity-${tone}))`,
              bgcolor: `hsla(var(--severity-${tone}) / 0.08)`,
            },
          }}
        >
          Get more tokens
        </Button>
      </Tooltip>
    </Box>
  );
};

export default AgentDiagnosisCtas;
