import type { MessageOutput } from './types'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatLogsForExport, triggerFileDownload, generateExportFilename } from './utils'

interface ExportButtonProps {
  filteredMessages: MessageOutput[]
  selectedRunId: number | null
  activeFilterCount: number
}

function ExportButton({
  filteredMessages,
  selectedRunId,
  activeFilterCount
}: ExportButtonProps): React.JSX.Element {
  const handleExport = (): void => {
    // Export always succeeds — even with zero matching messages, produce a valid file.
    const content = formatLogsForExport(
      filteredMessages,
      selectedRunId,
      { error: false, opencode: false, system: false } // placeholder; actual filter info is in the function
    )
    const filename = generateExportFilename(selectedRunId)
    triggerFileDownload(content, filename)
  }

  const label =
    activeFilterCount > 0
      ? `Export filtered (${filteredMessages.length})`
      : `Export all (${filteredMessages.length})`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="sm" onClick={handleExport}>
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Download run logs as a text file</p>
        {activeFilterCount > 0 && <p>Includes only filter-matching messages</p>}
      </TooltipContent>
    </Tooltip>
  )
}

export { ExportButton }
