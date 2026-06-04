'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Question, QuestionFlow, getCurrentQuestion } from '@/lib/question-flow'
import { Sparkles, HelpCircle, ArrowRight, SkipForward, AlertCircle } from 'lucide-react'

interface QuestionFlowPanelProps {
  flow: QuestionFlow
  onAnswer: (answer: string | string[] | null) => void
  onCancel: () => void
}

export function QuestionFlowPanel({ flow, onAnswer, onCancel }: QuestionFlowPanelProps) {
  const currentQuestion = getCurrentQuestion(flow)
  const [textVal, setTextVal] = useState('')
  const [checkedVals, setCheckedVals] = useState<Set<string>>(new Set())
  const [selectedRadio, setSelectedRadio] = useState('')
  const [customAnswer, setCustomAnswer] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)

  // Reset local states when question changes
  useEffect(() => {
    setTextVal('')
    setCheckedVals(new Set())
    setSelectedRadio('')
    setCustomAnswer('')
    setShowCustomInput(false)
  }, [flow.currentQuestionIndex])

  if (!currentQuestion) {
    return (
      <div className="p-5 border border-dashed rounded-xl bg-amber-50/50 dark:bg-amber-950/10 flex flex-col items-center justify-center text-center gap-3">
        <Sparkles className="h-6 w-6 text-amber-500 animate-pulse" />
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">All questions answered!</p>
        <p className="text-xs text-muted-foreground">Preparing database generation with your responses...</p>
      </div>
    )
  }

  // FIX (Bug 4): progress should reflect *completed* questions, not the
  // current one. Using currentQuestionIndex / total means the bar starts
  // at 0 on question 1 and reaches 100% only after the last answer is
  // submitted — not prematurely while the last question is still open.
  const progressPercentage = (flow.currentQuestionIndex / flow.questions.length) * 100

  const handleNext = () => {
    if (showCustomInput && customAnswer.trim()) {
      onAnswer(customAnswer.trim())
      return
    }

    switch (currentQuestion.type) {
      case 'single_choice':
        onAnswer(selectedRadio || null)
        break
      case 'multi_choice':
        // FIX (Bug 5): submit null instead of [] when nothing is selected
        // (required === false path). Consistent with all other types that
        // return null for an empty/unset answer.
        onAnswer(checkedVals.size > 0 ? Array.from(checkedVals) : null)
        break
      case 'text_input':
      case 'number_input':
      case 'date_input':
        onAnswer(textVal.trim() || null)
        break
      default:
        onAnswer(null)
    }
  }

  const handleCheckboxToggle = (val: string) => {
    setCheckedVals(prev => {
      const next = new Set(prev)
      if (next.has(val)) next.delete(val)
      else next.add(val)
      return next
    })
  }

  const isNextDisabled = (): boolean => {
    if (currentQuestion.required === false) return false

    if (showCustomInput) {
      return !customAnswer.trim()
    }

    switch (currentQuestion.type) {
      case 'single_choice':
        return !selectedRadio
      case 'multi_choice':
        return checkedVals.size === 0
      case 'text_input':
      case 'number_input':
      case 'date_input':
        return !textVal.trim()
      default:
        return false
    }
  }

  // FIX (Bug 6): toggling the custom-answer panel should clear the state
  // of whichever side is being left, so stale selections are never visible
  // when the user flips back.
  const handleCustomToggle = () => {
    if (!showCustomInput) {
      // Switching TO custom input — clear choice state
      setSelectedRadio('')
      setCheckedVals(new Set())
    } else {
      // Switching BACK to choices — clear custom state
      setCustomAnswer('')
    }
    setShowCustomInput(prev => !prev)
  }

  const nextDisabled = isNextDisabled()

  return (
    <div className="w-full border rounded-xl bg-card text-card-foreground shadow-sm overflow-hidden mb-4 transition-all duration-300">
      {/* Panel Header */}
      <div className="p-4 border-b bg-muted/30 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* FIX (Bug 7): h-4.5 / w-4.5 are not valid Tailwind utility classes
              (spacing scale has no .5 step at that size). Use h-[18px] w-[18px]
              for the intended ~4.5 * 4px = 18px size. */}
          <HelpCircle className="h-[18px] w-[18px] text-violet-500 animate-pulse" />
          <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            {flow.title}
          </span>
        </div>
        <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-full border-violet-200 text-violet-700 bg-violet-50 dark:bg-violet-950/20 dark:text-violet-400">
          Question {flow.currentQuestionIndex + 1} of {flow.questions.length}
        </Badge>
      </div>

      {/* Progress Bar */}
      <Progress value={progressPercentage} className="h-1 bg-muted rounded-none" />

      {/* Main Content Area */}
      <div className="p-5 flex flex-col gap-4">
        {/* Question Text */}
        <h3 className="text-sm font-semibold leading-relaxed tracking-tight text-foreground/90 flex gap-2">
          {currentQuestion.text}
          {currentQuestion.required !== false && (
            <span className="text-red-500" title="Required">*</span>
          )}
        </h3>

        {/* Note if available */}
        {currentQuestion.note && (
          <div className="flex gap-1.5 items-start text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400 p-2.5 rounded-lg border border-amber-100 dark:border-amber-950/50">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{currentQuestion.note}</span>
          </div>
        )}

        {/* Dynamic Controls based on Question Type */}
        <div className="py-1">
          {/* Single Choice (Radio Group) */}
          {currentQuestion.type === 'single_choice' && currentQuestion.options && !showCustomInput && (
            <RadioGroup
              value={selectedRadio}
              onValueChange={setSelectedRadio}
              className="grid gap-2.5"
            >
              {currentQuestion.options.map((option) => (
                // FIX (Bug 2): the div's onClick set selectedRadio directly
                // while RadioGroupItem already handles the same click via
                // onValueChange on the parent RadioGroup. Removing the div
                // onClick prevents the redundant (though idempotent) double
                // state set and keeps a single clear event path.
                <div
                  key={option.value}
                  className={`flex items-center space-x-3 p-3 rounded-lg border transition-all cursor-pointer ${
                    selectedRadio === option.value
                      ? 'border-violet-500 bg-violet-50/45 dark:bg-violet-950/15'
                      : 'border-muted hover:bg-muted/30'
                  }`}
                >
                  <RadioGroupItem value={option.value} id={`radio-${option.value}`} className="text-violet-600 border-muted" />
                  <Label htmlFor={`radio-${option.value}`} className="text-xs font-medium cursor-pointer flex-grow text-foreground/80">
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}

          {/* Multiple Choice (Checkboxes) */}
          {currentQuestion.type === 'multi_choice' && currentQuestion.options && !showCustomInput && (
            <div className="grid gap-2.5">
              {currentQuestion.options.map((option) => {
                const isChecked = checkedVals.has(option.value)
                return (
                  // FIX (Bug 1): the div had onClick={handleCheckboxToggle}
                  // AND the Checkbox had onCheckedChange={handleCheckboxToggle}.
                  // A single click on the row fired both handlers, toggling
                  // the value twice — net result: no visible change. Fix by
                  // removing the div's onClick and relying solely on the
                  // Checkbox's onCheckedChange. The Label's htmlFor already
                  // forwards label clicks to the checkbox, so the full row
                  // remains clickable via the label.
                  <div
                    key={option.value}
                    className={`flex items-center space-x-3 p-3 rounded-lg border transition-all cursor-pointer ${
                      isChecked
                        ? 'border-violet-500 bg-violet-50/45 dark:bg-violet-950/15'
                        : 'border-muted hover:bg-muted/30'
                    }`}
                  >
                    <Checkbox
                      id={`checkbox-${option.value}`}
                      checked={isChecked}
                      onCheckedChange={() => handleCheckboxToggle(option.value)}
                      className="text-violet-600 border-muted"
                    />
                    <Label htmlFor={`checkbox-${option.value}`} className="text-xs font-medium cursor-pointer flex-grow text-foreground/80">
                      {option.label}
                    </Label>
                  </div>
                )
              })}
            </div>
          )}

          {/* Text Input / Number / Date */}
          {!showCustomInput && ['text_input', 'number_input', 'date_input'].includes(currentQuestion.type) && (
            <Input
              type={
                currentQuestion.type === 'number_input'
                  ? 'number'
                  : currentQuestion.type === 'date_input'
                  ? 'date'
                  : 'text'
              }
              value={textVal}
              onChange={(e) => setTextVal(e.target.value)}
              placeholder={
                currentQuestion.type === 'number_input'
                  ? 'Enter a number...'
                  : currentQuestion.type === 'date_input'
                  ? 'Select date...'
                  : 'Type your response...'
              }
              className="text-xs focus-visible:ring-violet-500 border-muted h-10"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !nextDisabled) {
                  handleNext()
                }
              }}
            />
          )}

          {/* Custom Answer Input Field (when toggled) */}
          {showCustomInput && (
            <div className="space-y-2">
              <Label className="text-[11px] text-muted-foreground font-medium">Provide your custom answer:</Label>
              <Input
                // FIX (Bug 8): autoFocus so the user doesn't have to
                // manually click into the field after toggling it open.
                autoFocus
                value={customAnswer}
                onChange={(e) => setCustomAnswer(e.target.value)}
                placeholder="Describe your custom requirement..."
                className="text-xs focus-visible:ring-violet-500 border-muted h-10"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !nextDisabled) {
                    handleNext()
                  }
                }}
              />
            </div>
          )}
        </div>

        {/* Custom Answer Toggle Link */}
        {currentQuestion.customAnswerAllowed && (
          <div className="flex justify-end">
            <button
              onClick={handleCustomToggle}
              className="text-[10px] text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 font-semibold underline underline-offset-2"
            >
              {showCustomInput ? 'Back to choices' : "Something else — I'll type details"}
            </button>
          </div>
        )}

        {/* Panel Footer Controls */}
        <div className="flex items-center justify-between pt-2 border-t mt-1 gap-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            className="text-[11px] h-8 text-muted-foreground hover:text-foreground"
          >
            Cancel Flow
          </Button>

          <div className="flex gap-1.5">
            {/* Skip Option */}
            {currentQuestion.skipOption && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAnswer(null)}
                className="text-[11px] h-8 font-medium border-muted hover:bg-muted/50 gap-1"
              >
                Skip
                <SkipForward className="h-3 w-3" />
              </Button>
            )}

            {/* Next / Submit */}
            <Button
              size="sm"
              disabled={nextDisabled}
              onClick={handleNext}
              className="text-[11px] h-8 font-semibold gap-1 bg-violet-600 hover:bg-violet-700 text-white dark:bg-violet-700 dark:hover:bg-violet-600 transition-colors shadow-sm"
            >
              {flow.currentQuestionIndex === flow.questions.length - 1 ? 'Finish & Generate' : 'Next'}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}