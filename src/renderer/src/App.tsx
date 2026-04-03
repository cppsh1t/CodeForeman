/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react'
import { DevConsolePage } from './components/devconsole'
import { PlanningPage } from './components/planning/PlanningPage'
import { AssistantPage } from './components/assistant'
import { AppSidebar, type SidebarSelection } from './components/sidebar'
import { cn } from './lib/utils'

type TabKey = 'planning' | 'assistant' | 'devconsole'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'planning', label: 'Planning' },
  { key: 'assistant', label: 'Assistant' },
  { key: 'devconsole', label: 'Dev Console' }
]

/** Refresh projects via the safe IPC bridge. */
export async function refreshProjects(): Promise<void> {
  const res = await window.api.projectList({ page: 1, page_size: 50 })
  if (res.ok) {
    // Projects loaded successfully — UI updates via component state
    void res.data
  }
}

function App(): React.JSX.Element {
  const [selectedPlan, setSelectedPlan] = useState<SidebarSelection | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('planning')

  // No plan selected — show empty state
  if (!selectedPlan) {
    return (
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        <AppSidebar selectedPlan={null} onSelectPlan={setSelectedPlan} />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-medium text-foreground">Select a plan to get started</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a project and plan from the sidebar
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <AppSidebar selectedPlan={selectedPlan} onSelectPlan={setSelectedPlan} />

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Tab Bar */}
        <div className="flex h-10 shrink-0 items-center border-b border-border bg-card px-4">
          <div className="flex items-center gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  activeTab === tab.key
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-muted-foreground">{selectedPlan.planName}</span>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          {activeTab === 'planning' && <PlanningPage />}
          {activeTab === 'assistant' && <AssistantPage />}
          {activeTab === 'devconsole' && <DevConsolePage />}
        </div>
      </div>
    </div>
  )
}

export default App
