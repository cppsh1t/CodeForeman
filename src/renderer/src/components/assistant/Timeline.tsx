import type { PaginatedMessages } from './types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { buildTimelineFromMessages, formatTimelineTimestamp } from './utils'
import type { TimelineEvent } from './types'

interface TimelineProps {
  messages: PaginatedMessages | null
  loading: boolean
  error: string | null
}

const ROLE_DOT_COLORS: Record<string, string> = {
  system: 'bg-blue-400',
  assistant: 'bg-muted-foreground',
  opencode: 'bg-emerald-400',
  user: 'bg-amber-400'
}

const ROLE_LABELS: Record<string, string> = {
  system: 'Sys',
  assistant: 'Ast',
  opencode: 'SDK',
  user: 'You'
}

export function Timeline({ messages, loading, error }: TimelineProps): React.JSX.Element {
  const events: TimelineEvent[] = messages ? buildTimelineFromMessages(messages.items, 50) : []

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Timeline</CardTitle>
          {messages && (
            <span className="text-[0.625rem] text-muted-foreground tabular-nums">
              {messages.total} event{messages.total !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6">
            <p className="text-xs text-muted-foreground">
              No events yet. Start execution to see timeline activity.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-72">
            <div className="space-y-0.5">
              {events.map((event) => (
                <TimelineItem key={event.id} event={event} />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

function TimelineItem({ event }: { event: TimelineEvent }): React.JSX.Element {
  const dotColor = event.role
    ? (ROLE_DOT_COLORS[event.role] ?? 'bg-muted-foreground')
    : 'bg-muted-foreground'
  const roleLabel = event.role ? (ROLE_LABELS[event.role] ?? event.role) : '—'

  // Truncate long content
  const displayContent =
    event.content.length > 120 ? event.content.slice(0, 120) + '...' : event.content

  return (
    <div className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/30 transition-colors">
      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor}`} />
        <span className="text-[0.625rem] text-muted-foreground tabular-nums w-4 text-center">
          {roleLabel}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-foreground/90 leading-relaxed break-words">{displayContent}</p>
      </div>
      <span className="text-[0.625rem] text-muted-foreground tabular-nums shrink-0 pt-0.5">
        {formatTimelineTimestamp(event.timestamp)}
      </span>
    </div>
  )
}
