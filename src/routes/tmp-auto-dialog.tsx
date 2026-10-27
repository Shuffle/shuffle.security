import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import CategoryAutomationsDialog from '@/Shuffle-Core/components/CategoryAutomationsDialog';
import type { CategoryAutomation } from '@/Shuffle-Core/datastore';

export const Route = createFileRoute('/tmp-auto-dialog')({ component: TmpDialogPage });

const SAMPLE: CategoryAutomation[] = [
  { id: '1', name: 'Enrich', type: 'enrich', enabled: true, trigger: 'on_edit' },
  { id: '2', name: 'Security Rules', type: 'security_rules', enabled: false, trigger: 'on_edit' },
  { id: '3', name: 'Run AI Agent', type: 'ai_agent', enabled: false, trigger: 'on_edit' },
];

function TmpDialogPage() {
  const [automations, setAutomations] = useState<CategoryAutomation[] | null>(SAMPLE);
  return (
    <div style={{ minHeight: '100vh' }}>
      <CategoryAutomationsDialog
        open
        onClose={() => {}}
        category="shuffle-security_incidents"
        automations={automations}
        onAutomationsChange={setAutomations}
        entityLabel={{ singular: 'incident', plural: 'incidents' }}
      />
    </div>
  );
}
