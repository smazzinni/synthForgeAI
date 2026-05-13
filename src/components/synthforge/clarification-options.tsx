'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import type { ClarificationOption } from './types'

export const ClarificationOptions = React.memo(function ClarificationOptions({ options, onSelectOption, isLoading }: {
  options: ClarificationOption[]
  onSelectOption: (value: string) => void
  isLoading: boolean
}) {
  if (!options || options.length === 0) return null
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Choose an option:</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <motion.div key={opt.id} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Button
              variant="outline"
              size="sm"
              className="h-auto py-1.5 px-3 text-xs hover:bg-amber-50 hover:border-amber-300 transition-colors"
              onClick={() => onSelectOption(opt.value)}
              disabled={isLoading}
            >
              {opt.label}
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  )
})
