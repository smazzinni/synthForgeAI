'use client'

import React, { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Send, SkipForward, Check } from 'lucide-react'
import type { ClarificationOption } from './types'

export const ClarificationOptions = React.memo(function ClarificationOptions({ options, onSelectOption, isLoading }: {
  options: ClarificationOption[]
  onSelectOption: (value: string) => void
  isLoading: boolean
}) {
  const [customAnswer, setCustomAnswer] = useState('')
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set())

  // Group options by questionId
  const groupedOptions = useMemo(() => {
    const groups: Record<string, ClarificationOption[]> = {}
    const ungrouped: ClarificationOption[] = []

    for (const opt of options) {
      if (opt.questionId) {
        if (!groups[opt.questionId]) groups[opt.questionId] = []
        groups[opt.questionId].push(opt)
      } else {
        ungrouped.push(opt)
      }
    }

    return { groups, ungrouped }
  }, [options])

  // Determine if any group uses multiSelect
  const hasMultiSelect = options.some(opt => opt.multiSelect)

  const toggleSelection = (value: string) => {
    setSelectedValues(prev => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const handleCustomSubmit = () => {
    if (customAnswer.trim()) {
      onSelectOption(customAnswer.trim())
      setCustomAnswer('')
    }
  }

  const handleCustomKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCustomSubmit()
    }
  }

  const handleMultiSubmit = () => {
    if (selectedValues.size > 0) {
      onSelectOption(Array.from(selectedValues).join(', '))
      setSelectedValues(new Set())
    }
  }

  const handleSkip = () => {
    onSelectOption('Skip')
  }

  if (!options || options.length === 0) return null

  // If there are groups, render grouped
  const hasGroups = Object.keys(groupedOptions.groups).length > 0

  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Choose an option:</p>

      {hasGroups ? (
        // Grouped rendering
        Object.entries(groupedOptions.groups).map(([questionId, groupOpts]) => {
          const isMulti = groupOpts.some(o => o.multiSelect)
          return (
            <div key={questionId} className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">{questionId}</p>
              <div className="flex flex-wrap gap-2">
                {groupOpts.map((opt) => {
                  const isSelected = selectedValues.has(String(opt.value))
                  return (
                    <motion.div key={opt.id} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                      <Button
                        variant={isMulti ? (isSelected ? 'default' : 'outline') : 'outline'}
                        size="sm"
                        className={`h-auto py-1.5 px-3 text-xs transition-colors ${
                          isMulti
                            ? isSelected
                              ? 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700'
                              : 'hover:bg-amber-50 hover:border-amber-300'
                            : 'hover:bg-amber-50 hover:border-amber-300'
                        }`}
                        onClick={() => {
                          if (isMulti) {
                            toggleSelection(String(opt.value))
                          } else {
                            onSelectOption(String(opt.value))
                          }
                        }}
                        disabled={isLoading}
                      >
                        {isMulti && isSelected && <Check className="h-3 w-3 mr-1" />}
                        {opt.label}
                      </Button>
                    </motion.div>
                  )
                })}
              </div>
              {isMulti && selectedValues.size > 0 && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">{selectedValues.size} selected</Badge>
                  <Button
                    size="sm"
                    className="h-6 text-xs bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white"
                    onClick={handleMultiSubmit}
                    disabled={isLoading}
                  >
                    <Send className="h-3 w-3 mr-1" />
                    Submit
                  </Button>
                </div>
              )}
            </div>
          )
        })
      ) : (
        // Flat list rendering (no groups)
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => {
            const isMulti = opt.multiSelect || hasMultiSelect
            const isSelected = selectedValues.has(String(opt.value))
            return (
              <motion.div key={opt.id} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button
                  variant={isMulti ? (isSelected ? 'default' : 'outline') : 'outline'}
                  size="sm"
                  className={`h-auto py-1.5 px-3 text-xs transition-colors ${
                    isMulti
                      ? isSelected
                        ? 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700'
                        : 'hover:bg-amber-50 hover:border-amber-300'
                      : 'hover:bg-amber-50 hover:border-amber-300'
                  }`}
                  onClick={() => {
                    if (isMulti) {
                      toggleSelection(String(opt.value))
                    } else {
                      onSelectOption(String(opt.value))
                    }
                  }}
                  disabled={isLoading}
                >
                  {isMulti && isSelected && <Check className="h-3 w-3 mr-1" />}
                  {opt.label}
                </Button>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Multi-select submit for flat list */}
      {hasMultiSelect && !hasGroups && selectedValues.size > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">{selectedValues.size} selected</Badge>
          <Button
            size="sm"
            className="h-6 text-xs bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white"
            onClick={handleMultiSubmit}
            disabled={isLoading}
          >
            <Send className="h-3 w-3 mr-1" />
            Submit
          </Button>
        </div>
      )}

      {/* Custom answer input */}
      <div className="flex items-center gap-2">
        <Input
          value={customAnswer}
          onChange={(e) => setCustomAnswer(e.target.value)}
          onKeyDown={handleCustomKeyDown}
          placeholder="Type your own answer..."
          className="h-7 text-xs"
          disabled={isLoading}
          aria-label="Custom answer input"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-7 p-0 shrink-0 hover:bg-amber-50 hover:border-amber-300"
          onClick={handleCustomSubmit}
          disabled={isLoading || !customAnswer.trim()}
          aria-label="Send custom answer"
        >
          <Send className="h-3 w-3" />
        </Button>
      </div>

      {/* Skip button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-xs text-muted-foreground hover:text-foreground"
        onClick={handleSkip}
        disabled={isLoading}
      >
        <SkipForward className="h-3 w-3 mr-1" />
        Skip
      </Button>
    </div>
  )
})
