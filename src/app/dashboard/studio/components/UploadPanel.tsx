import React, { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, FileJson, Loader2, Eye, Save } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const ACCEPT =
  '.json,.sql,.csv,.xlsx,.xls,application/json,text/csv,application/sql,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'

export type UploadMode = 'preview' | 'save'

interface UploadPanelProps {
  onUpload: (file: File, mode: UploadMode) => Promise<void>
  disabled?: boolean
  compact?: boolean
}

export default function UploadPanel({
  onUpload,
  disabled = false,
  compact = false,
}: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const modeRef = useRef<UploadMode>('preview')
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = async (
    file: File | null | undefined,
    mode: UploadMode = 'preview',
  ) => {
    if (!file || disabled || uploading) return
    setUploading(true)
    try {
      await onUpload(file, mode)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      toast.error(message)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const openPicker = (mode: UploadMode) => {
    modeRef.current = mode
    inputRef.current?.click()
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    void handleFile(e.dataTransfer.files?.[0], 'preview')
  }

  if (compact) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) =>
            void handleFile(e.target.files?.[0], modeRef.current)
          }
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 shrink-0"
          disabled={disabled || uploading}
          title="Preview upload (JSON, SQL, CSV, Excel)"
          onClick={() => openPicker('preview')}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
        </Button>
      </>
    )
  }

  return (
    <div
      className={cn(
        'mx-3 mt-2 mb-1 shrink-0 rounded-md border border-dashed px-3 py-2 transition-colors',
        dragOver ? 'border-amber-500 bg-amber-500/5' : 'border-border bg-muted/30',
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) =>
          void handleFile(e.target.files?.[0], modeRef.current)
        }
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileJson className="h-4 w-4 text-amber-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">
              Import existing data
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              JSON, SQL, CSV, or Excel — preview instantly, save when ready
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[10px]"
            disabled={disabled || uploading}
            onClick={() => openPicker('preview')}
          >
            {uploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <Eye className="h-3 w-3 mr-1" />
                Preview
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-7 text-[10px] bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700"
            disabled={disabled || uploading}
            onClick={() => openPicker('save')}
          >
            <Save className="h-3 w-3 mr-1" />
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
