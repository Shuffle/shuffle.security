import { createFileRoute } from '@tanstack/react-router'
import { AgentUI } from '@/Shuffle-MCPs/components/AgentUI'
import { ShuffleMcpThemeProvider } from '@/Shuffle-MCPs/ShuffleMcpThemeProvider'
import { API_CONFIG } from '@/config'

export const Route = createFileRoute('/tmp-askabout-check')({
  component: Page,
})

function Page() {
  return (
    <ShuffleMcpThemeProvider mode="dark">
      <div style={{ height: '100vh', padding: 16 }}>
        <AgentUI
          globalUrl={API_CONFIG.baseUrl}
          theme="dark"
          sidebarLayout
          compact
          initialView="chat"
          contextStorageKey="page__tmp-askabout-check"
        />
      </div>
    </ShuffleMcpThemeProvider>
  )
}
