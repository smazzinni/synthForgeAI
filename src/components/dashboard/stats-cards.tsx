'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Database, BarChart3, ShieldCheck, MessageSquare } from 'lucide-react'
import { mockStats } from '@/lib/mock-data'

export function StatsCards() {
  const stats = [
    {
      title: 'Total Databases',
      value: mockStats.totalDatabases,
      icon: Database,
      change: '+2 this week',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Datasets Generated',
      value: mockStats.datasetsGenerated,
      icon: BarChart3,
      change: '+5 this week',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Quality Score',
      value: `${mockStats.qualityScore}%`,
      icon: ShieldCheck,
      change: '+1.2% from last week',
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
    },
    {
      title: 'Active Conversations',
      value: mockStats.activeConversations,
      icon: MessageSquare,
      change: '2 in progress',
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.bgColor}`}>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
