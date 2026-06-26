'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Keyboard } from 'lucide-react'

// ─── ShortcutsDialog ───
// Modal help dialog listing every keyboard shortcut the studio supports,
// grouped by category (Chat / Data / View). Opened via ⌘/ (or the Keyboard
// icon in the chat header). Self-contained — only needs `open` + `onOpenChange`.

export interface ShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Small helper that renders a single shortcut row.
function Row({ label, keys }: { label: string; keys: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <kbd className="px-2 py-1 text-xs font-mono rounded border bg-muted text-muted-foreground">
        {keys}
      </kbd>
    </div>
  )
}

// A styled ⌘ or Ctrl key indicator used inline in the description.
function ModKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded border bg-muted text-muted-foreground">
      {children}
    </kbd>
  )
}

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-amber-600" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Speed up your workflow with these shortcuts. Use <ModKey>⌘</ModKey> on macOS or{' '}
            <ModKey>Ctrl</ModKey> on Windows/Linux.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Chat */}
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Chat
            </h4>
            <div className="space-y-1.5">
              <Row label="Send Message" keys="⌘↵" />
              <Row label="New Chat" keys="⌘K" />
            </div>
          </div>

          {/* Data */}
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Data
            </h4>
            <div className="space-y-1.5">
              <Row label="Data Tab" keys="⌘1" />
              <Row label="SQL Tab" keys="⌘2" />
              <Row label="Explorer Tab" keys="⌘3" />
              <Row label="Save Query" keys="⌘⇧S" />
              <Row label="Export Database" keys="⌘⇧E" />
            </div>
          </div>

          {/* View */}
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              View
            </h4>
            <div className="space-y-1.5">
              <Row label="Toggle Panel" keys="⌘B" />
              <Row label="Shortcuts" keys="⌘/" />
              <Row label="Close Dialog" keys="Esc" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
          >
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
