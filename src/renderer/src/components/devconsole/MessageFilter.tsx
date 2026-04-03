import type { MessageFilterKey, FilterState } from './types'
import { FILTER_CONFIG } from './types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface MessageFilterProps {
  filters: FilterState
  filterCounts: Record<MessageFilterKey, number>
  activeFilterCount: number
  toggleFilter: (key: MessageFilterKey) => void
  clearFilters: () => void
}

const FILTER_STYLES: Record<MessageFilterKey, { active: string; inactive: string; badge: string }> =
  {
    error: {
      active: 'border-red-500/50 bg-red-500/10 text-red-400',
      inactive: 'border-border hover:border-red-500/30',
      badge: 'bg-red-500/20 text-red-400'
    },
    opencode: {
      active: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
      inactive: 'border-border hover:border-emerald-500/30',
      badge: 'bg-emerald-500/20 text-emerald-400'
    },
    system: {
      active: 'border-blue-500/50 bg-blue-500/10 text-blue-400',
      inactive: 'border-border hover:border-blue-500/30',
      badge: 'bg-blue-500/20 text-blue-400'
    }
  }

function MessageFilter({
  filters,
  filterCounts,
  activeFilterCount,
  toggleFilter,
  clearFilters
}: MessageFilterProps): React.JSX.Element {
  const filterKeys = Object.keys(FILTER_CONFIG) as MessageFilterKey[]

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Filters:</span>
      {filterKeys.map((key) => {
        const config = FILTER_CONFIG[key]
        const isActive = filters[key]
        const count = filterCounts[key]
        const styles = FILTER_STYLES[key]

        return (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleFilter(key)}
                className={cn(
                  'gap-1.5 transition-colors',
                  isActive ? styles.active : styles.inactive
                )}
                aria-pressed={isActive}
              >
                {config.label}
                <Badge variant="ghost" className={cn('ml-0.5 px-1 text-[0.625rem]', styles.badge)}>
                  {count}
                </Badge>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{config.description}</p>
            </TooltipContent>
          </Tooltip>
        )
      })}
      {activeFilterCount > 0 && (
        <Button variant="ghost" size="xs" onClick={clearFilters} className="text-muted-foreground">
          Clear all
        </Button>
      )}
    </div>
  )
}

export { MessageFilter }
