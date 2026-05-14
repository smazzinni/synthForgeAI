'use client'

import React from 'react'
import {
  Gauge, Table2, AlertCircle, AlertTriangle, Circle, CheckCheck, Wrench
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import type { QualityReportData } from './types'

interface QualityReportProps {
  qualityReport: QualityReportData | null
  showQualityReport: boolean
  setShowQualityReport: (show: boolean) => void
  onAutoFix: () => void
  isQualityCheckRunning: boolean
}

export const QualityReport = React.memo(function QualityReport({
  qualityReport,
  showQualityReport,
  setShowQualityReport,
  onAutoFix,
  isQualityCheckRunning,
}: QualityReportProps) {
  if (!qualityReport) return null
  const scoreColor = qualityReport.overallScore >= 80 ? 'text-green-600' : qualityReport.overallScore >= 60 ? 'text-yellow-600' : 'text-red-600'
  const scoreBg = qualityReport.overallScore >= 80 ? 'bg-green-50 border-green-200' : qualityReport.overallScore >= 60 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'

  return (
    <Dialog open={showQualityReport} onOpenChange={setShowQualityReport}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-amber-700" />
            Data Quality Report
          </DialogTitle>
          <DialogDescription>
            Quality analysis of your generated data
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className={`rounded-lg border p-4 text-center ${scoreBg}`}>
            <div className={`text-4xl font-bold ${scoreColor}`}>{qualityReport.overallScore}</div>
            <div className="text-xs text-muted-foreground mt-1">Overall Quality Score</div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="text-center p-2 rounded bg-muted/50">
              <div className="text-sm font-semibold">{qualityReport.totalTables}</div>
              <div className="text-[10px] text-muted-foreground">Tables</div>
            </div>
            <div className="text-center p-2 rounded bg-muted/50">
              <div className="text-sm font-semibold">{qualityReport.totalRows}</div>
              <div className="text-[10px] text-muted-foreground">Rows</div>
            </div>
            <div className="text-center p-2 rounded bg-red-50">
              <div className="text-sm font-semibold text-red-700">{qualityReport.criticalCount}</div>
              <div className="text-[10px] text-red-600">Critical</div>
            </div>
            <div className="text-center p-2 rounded bg-yellow-50">
              <div className="text-sm font-semibold text-yellow-700">{qualityReport.warningCount}</div>
              <div className="text-[10px] text-yellow-600">Warnings</div>
            </div>
          </div>

          {qualityReport.tables.map((t) => (
            <Card key={t.table} className="overflow-hidden">
              <CardHeader className="pb-2 px-4 pt-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <Table2 className="h-3.5 w-3.5 text-amber-700" />
                    {t.table}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{t.rowCount} rows</Badge>
                    <Badge className={`text-[10px] ${t.score >= 80 ? 'bg-green-100 text-green-800' : t.score >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                      {t.score}/100
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              {t.issues.length > 0 && (
                <CardContent className="px-4 pb-3 pt-0">
                  <div className="space-y-1 mt-1">
                    {t.issues.map((issue, j) => (
                      <div key={j} className={`text-[11px] px-2 py-1 rounded flex items-start gap-1.5 ${issue.severity === 'critical' ? 'bg-red-50 text-red-800' : issue.severity === 'warning' ? 'bg-yellow-50 text-yellow-800' : 'bg-sky-50 text-sky-800'}`}>
                        {issue.severity === 'critical' ? <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" /> : issue.severity === 'warning' ? <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> : <Circle className="h-3 w-3 shrink-0 mt-0.5" />}
                        <span>{issue.message}</span>
                        {issue.recoverable && <Badge className="text-[8px] ml-1 bg-emerald-100 text-emerald-700 h-3.5 px-1">fixable</Badge>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}

          {qualityReport.fixesApplied > 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-green-800 mb-2">
                <CheckCheck className="h-3.5 w-3.5" />
                {qualityReport.fixesApplied} fix(es) applied
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {qualityReport.fixDetails.map((fix, i) => (
                  <div key={i} className="text-[11px] text-green-700">
                    <span className="font-medium">{fix.table}.{fix.column || 'row'}</span>: {fix.message}
                    {fix.before !== undefined && fix.after !== undefined && (
                      <span className="font-mono ml-1">({String(fix.before).slice(0, 20)} → {String(fix.after).slice(0, 20)})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {qualityReport.totalIssues > 0 && qualityReport.fixesApplied === 0 && (
            <Button
              onClick={onAutoFix}
              disabled={isQualityCheckRunning}
              className="w-full gap-2"
            >
              <Wrench className="h-4 w-4" />
              {isQualityCheckRunning ? 'Fixing...' : 'Auto-Fix Recoverable Issues'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
})
