import { useState } from 'react'
import type { MaterialItem } from '@/hooks/use-planning'
import { materialTypeLabel } from '@/hooks/use-planning'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

interface MaterialsInputProps {
  materials: MaterialItem[]
  locked: boolean
  saving: boolean
  error: string | null
  onAdd: (data: { type: string; content: string }) => Promise<boolean>
  onDelete: (id: number) => Promise<void>
}

const MATERIAL_TYPES = [
  { value: 'requirements', label: 'Requirements' },
  { value: 'prototype', label: 'Prototype' },
  { value: 'api_spec', label: 'API Spec' },
  { value: 'note', label: 'Note' }
] as const

export function MaterialsInput({
  materials,
  locked,
  saving,
  error,
  onAdd,
  onDelete
}: MaterialsInputProps): React.JSX.Element {
  const [type, setType] = useState<string>('requirements')
  const [content, setContent] = useState('')

  const canAdd = content.trim().length > 0 && !locked && !saving

  const handleAdd = async (): Promise<void> => {
    if (!canAdd) return
    const ok = await onAdd({ type, content: content.trim() })
    if (ok) setContent('')
  }

  const handleDelete = async (id: number): Promise<void> => {
    await onDelete(id)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Materials</CardTitle>
        <CardDescription>Reference documents and context for plan generation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!locked && (
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Select value={type} onValueChange={setType} disabled={locked}>
                <SelectTrigger className="w-36 shrink-0">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={locked}
                placeholder="Paste or type material content..."
                className="min-h-16 flex-1"
                rows={3}
                maxLength={100000}
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm" disabled={!canAdd} onClick={handleAdd}>
                {saving ? 'Adding...' : 'Add Material'}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p className="text-destructive text-xs/relaxed" role="alert">
            {error}
          </p>
        )}

        {materials.length === 0 ? (
          <div className="rounded-md border border-dashed border-border py-8 text-center">
            <p className="text-muted-foreground text-xs/relaxed">
              {locked
                ? 'No materials attached to this plan'
                : 'Add materials to provide context for task generation'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {materials.map((m) => (
              <div
                key={m.id}
                className="group/material flex items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/30"
              >
                <Badge variant="outline" className="shrink-0 mt-0.5">
                  {materialTypeLabel(m.type)}
                </Badge>
                <p className="text-xs/relaxed flex-1 whitespace-pre-wrap break-words line-clamp-4">
                  {m.content}
                </p>
                {!locked && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 opacity-0 transition-opacity group-hover/material:opacity-100"
                    onClick={() => handleDelete(m.id)}
                    aria-label={`Delete material: ${materialTypeLabel(m.type)}`}
                  >
                    ×
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
