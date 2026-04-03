import type { MessageOutput } from './types'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getRoleColor, formatTimestamp, isErrorContent } from './utils'
import { cn } from '@/lib/utils'

interface MessageStreamProps {
  messages: MessageOutput[]
  filteredMessages: MessageOutput[]
  totalAvailable: number
  hasMore: boolean
  isLoadingMessages: boolean
  messagesError: string | null
  loadMore: () => void
}

function MessageItem({ message }: { message: MessageOutput }): React.JSX.Element {
  const color = getRoleColor(message.role)
  const isError = isErrorContent(message.content)

  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-md border px-3 py-2 text-xs transition-colors',
        color.bg,
        color.border,
        isError && 'border-red-500/40 bg-red-500/5'
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('inline-block h-1.5 w-1.5 rounded-full', color.dot)} />
        <span className={cn('font-medium', color.text)}>{getRoleColor(message.role).label}</span>
        <span className="text-muted-foreground">{formatTimestamp(message.created_at)}</span>
        <span className="ml-auto font-mono text-[0.625rem] text-muted-foreground/60">
          {message.correlation_id.slice(0, 8)}
        </span>
      </div>
      <div className={cn('whitespace-pre-wrap break-words text-xs leading-relaxed', color.text)}>
        {message.content}
      </div>
    </div>
  )
}

function MessageStream({
  filteredMessages,
  totalAvailable,
  hasMore,
  isLoadingMessages,
  messagesError,
  loadMore
}: MessageStreamProps): React.JSX.Element {
  if (messagesError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-destructive">
        <p className="text-xs">{messagesError}</p>
      </div>
    )
  }

  if (isLoadingMessages && filteredMessages.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (filteredMessages.length === 0 && !isLoadingMessages) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 py-12">
        <p className="text-xs text-muted-foreground">
          {totalAvailable === 0
            ? 'No messages for this run'
            : 'No messages match the current filters'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">
          Showing {filteredMessages.length} of {totalAvailable} messages
        </span>
      </div>
      <ScrollArea className="h-[400px] rounded-md border border-border/50">
        <div className="flex flex-col gap-1.5 p-3">
          {filteredMessages.map((msg) => (
            <MessageItem key={msg.id} message={msg} />
          ))}
          {isLoadingMessages && (
            <div className="flex flex-col gap-1.5 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
      {hasMore && (
        <div className="flex justify-center pt-1">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoadingMessages}>
            {isLoadingMessages
              ? 'Loading...'
              : `Load more (${totalAvailable - filteredMessages.length} remaining)`}
          </Button>
        </div>
      )}
    </div>
  )
}

export { MessageStream, MessageItem }
