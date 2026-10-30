import { createFileRoute } from '@tanstack/react-router';
import { AskAiWidget } from '@/Shuffle-MCPs';

export const Route = createFileRoute('/tmp-agentview')({
  component: () => (
    <div style={{ padding: 40, minHeight: '100vh' }}>
      <AskAiWidget requireSupport={false} mode="panel" />
    </div>
  ),
});
