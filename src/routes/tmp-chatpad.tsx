import { createFileRoute } from "@tanstack/react-router";
import { routeMeta } from '@/lib/routeMeta';
import { useRef, useState } from 'react';
import { Box } from '@mui/material';
import AgentChatView from '@/Shuffle-MCPs/components/AgentChatView';

const EXECUTION = { execution_id: 'tmp-run', authorization: '', status: 'FINISHED' } as const;
const AGENT_DATA = { original_input: 'Triage the new incident and tell me what to do next', decisions: [] } as const;

const noop = () => {};

function Panel({ padding }: { padding?: number }) {
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  return (
    <Box
      ref={panelRef}
      id={`panel-${padding ?? 'default'}`}
      sx={{
        width: 420,
        border: '1px solid hsl(var(--border))',
        bgcolor: 'hsl(var(--card))',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 320,
      }}
    >
      {/* Mirrors AgentUI's middle scrollable container in sidebar layout */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 1.5, pb: 1.5, display: 'flex', flexDirection: 'column' }}>
        <AgentChatView
          execution={EXECUTION as any}
          agentData={AGENT_DATA as any}
          isRunning={false}
          busy={false}
          contentPaddingX={padding}
          composerContainer={footerEl}
          onStart={noop}
          onSubmit={noop}
          onStop={noop}
          onRefresh={noop}
          isAppAuthenticated={() => true}
          onAuthenticateApp={noop}
          onRefreshAuthenticatedApps={noop}
          resolveUrl={(p: string) => p}
          resolveHeaders={() => ({})}
        />
      </Box>
      {/* Mirrors AgentUI's pinned footer that hosts the composer */}
      <Box
        ref={setFooterEl}
        sx={{ flexShrink: 0, width: '100%', px: '27px', pt: 1, pb: 1.5, borderTop: '1px solid hsl(var(--border) / 0.5)', bgcolor: 'hsl(var(--card))' }}
      />
    </Box>
  );
}

function TmpChatPad() {
  return (
    <Box sx={{ display: 'flex', gap: 3, p: 3, flexWrap: 'wrap' }}>
      <Panel padding={15} />
      <Panel />
    </Box>
  );
}

export const Route = createFileRoute("/tmp-chatpad")({
  head: () => routeMeta({ title: "Temp", description: "Temporary check.", url: "/tmp-chatpad", noindex: true }),
  component: TmpChatPad,
});
