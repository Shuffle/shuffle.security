import { createFileRoute } from '@tanstack/react-router';
import AgentUI from '@/Shuffle-MCPs/components/AgentUI';

export const Route = createFileRoute('/tmp-agent-tabs')({
  component: () => (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AgentUI initialView="chat" />
    </div>
  ),
});
