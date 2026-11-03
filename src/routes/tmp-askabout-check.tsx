import { createFileRoute } from '@tanstack/react-router'
import AgentUI from '@/Shuffle-MCPs/components/AgentUI'
import { API_CONFIG } from '@/Shuffle-MCPs'
import { ShuffleMcpThemeProvider } from '@/Shuffle-MCPs/ShuffleMcpThemeProvider'

export const Route = createFileRoute('/tmp-askabout-check')({
  component: Page,
})

function Page() {
  const withExec = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('withexec') === '1'
  const initialExecution = withExec
    ? {
        execution_id: 'fake-exec-1',
        status: 'COMPLETED',
        results: [{ action: { app_name: 'AI Agent' }, result: '{"intent":"test"}' }],
      }
    : undefined

  return (
    <ShuffleMcpThemeProvider mode="dark">
      <div style={{ height: '100vh', padding: 16 }}>
        <AgentUI
          globalUrl={API_CONFIG.baseUrl}
          theme="dark"
          sidebarLayout
          compact
          contextStorageKey="page__tmp-askabout-check"
          initialExecution={initialExecution as never}
        />
      </div>
    </ShuffleMcpThemeProvider>
  )
}
