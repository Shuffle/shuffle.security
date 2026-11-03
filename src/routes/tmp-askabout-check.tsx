import { createFileRoute } from '@tanstack/react-router'
import AgentUI from '@/Shuffle-MCPs/components/AgentUI'
import { API_CONFIG } from '@/Shuffle-MCPs'
import { ShuffleMcpThemeProvider } from '@/Shuffle-MCPs/ShuffleMcpThemeProvider'

export const Route = createFileRoute('/tmp-askabout-check')({
  component: Page,
})

function Page() {
  return (
    <ShuffleMcpThemeProvider mode="dark">
      <div style={{ height: '100vh', padding: 16 }}>
        <AgentUI
          apiBaseUrl={API_CONFIG.baseUrl}
          theme="dark"
          sidebarLayout
          compact
          contextStorageKey="page__tmp-askabout-check"
        />
      </div>
    </ShuffleMcpThemeProvider>
  )
}
