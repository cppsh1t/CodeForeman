import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RunSelector } from './RunSelector'
import { MessageFilter } from './MessageFilter'
import { MessageStream } from './MessageStream'
import { ExportButton } from './ExportButton'
import { useDevConsole } from './use-dev-console'

/**
 * DevConsolePage — the development console page for viewing run logs.
 *
 * Provides:
 * - Plan ID input for selecting which plan's runs to inspect
 * - Run selector dropdown to switch between task runs
 * - Color-coded message stream with incremental pagination
 * - Filters: error / opencode / system (toggle buttons with counts)
 * - Export: download currently filtered logs as a .txt file
 *
 * Minimal wiring: accepts optional planId prop. If not provided, shows an input
 * for the user to enter one. Task 13 will replace this with sidebar navigation.
 */
function DevConsolePage({ planId: initialPlanId }: { planId?: number }): React.JSX.Element {
  const [manualPlanId, setManualPlanId] = useState<string>(initialPlanId?.toString() ?? '')
  const planId = initialPlanId ?? (manualPlanId ? Number(manualPlanId) : null)

  const {
    taskRuns,
    selectedRunId,
    selectRun,
    isLoadingRuns,
    runsError,
    messages,
    filteredMessages,
    totalAvailable,
    hasMore,
    loadMore,
    isLoadingMessages,
    messagesError,
    filters,
    toggleFilter,
    clearFilters,
    filterCounts,
    activeFilterCount
  } = useDevConsole(planId)

  return (
    <TooltipProvider>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        {/* Header */}
        <header className="border-b border-border px-6 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold tracking-tight">Dev Console</h1>
            {selectedRunId !== null && (
              <span className="text-xs text-muted-foreground">
                Plan {planId} &middot; Run {selectedRunId}
              </span>
            )}
          </div>
        </header>

        {/* Plan ID input (only shown when no initialPlanId prop) */}
        {initialPlanId === undefined && (
          <div className="border-b border-border px-6 py-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                Plan ID:
              </label>
              <Input
                type="number"
                placeholder="Enter plan ID..."
                value={manualPlanId}
                onChange={(e) => setManualPlanId(e.target.value)}
                className="w-48 h-7 text-xs"
                min={1}
              />
              {!planId && (
                <span className="text-xs text-muted-foreground">
                  Enter a plan ID to load task runs
                </span>
              )}
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-hidden px-6 py-4">
          <div className="flex flex-col gap-4 h-full">
            {/* Toolbar: Run selector + filters + export */}
            <Card size="sm">
              <CardContent className="py-3">
                <div className="flex flex-col gap-3">
                  {/* Run selector row */}
                  <RunSelector
                    taskRuns={taskRuns}
                    selectedRunId={selectedRunId}
                    selectRun={selectRun}
                    isLoadingRuns={isLoadingRuns}
                    runsError={runsError}
                  />

                  <Separator />

                  {/* Filters + export row */}
                  <div className="flex items-center justify-between gap-4">
                    <MessageFilter
                      filters={filters}
                      filterCounts={filterCounts}
                      activeFilterCount={activeFilterCount}
                      toggleFilter={toggleFilter}
                      clearFilters={clearFilters}
                    />
                    {selectedRunId !== null && (
                      <ExportButton
                        filteredMessages={filteredMessages}
                        selectedRunId={selectedRunId}
                        activeFilterCount={activeFilterCount}
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Message stream */}
            {selectedRunId !== null ? (
              <MessageStream
                messages={messages}
                filteredMessages={filteredMessages}
                totalAvailable={totalAvailable}
                hasMore={hasMore}
                isLoadingMessages={isLoadingMessages}
                messagesError={messagesError}
                loadMore={loadMore}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  {planId ? 'Loading runs...' : 'Select a plan to view run logs'}
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </TooltipProvider>
  )
}

export { DevConsolePage }
