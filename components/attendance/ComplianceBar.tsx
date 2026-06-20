'use client'

import type { ComplianceSummary } from '@/lib/types'

interface ComplianceBarProps {
  data: ComplianceSummary | null
  loading: boolean
  mobile?: boolean
}

function minutesToHours(min: number): number {
  return Math.round(min / 6) / 10
}

function getOvertimeStatus(
  hours: number,
  alertHours: number,
  limitHours: number
): 'ok' | 'warning' | 'danger' {
  if (hours >= limitHours) return 'danger'
  if (hours >= alertHours) return 'warning'
  return 'ok'
}

const STATUS_COLOR = {
  ok:      { bar: 'bg-green-500', text: 'text-green-600', label: '問題なし' },
  warning: { bar: 'bg-amber-400', text: 'text-amber-600', label: '注意'    },
  danger:  { bar: 'bg-red-500',   text: 'text-red-600',   label: '上限超過' },
}

interface OvertimeBarProps {
  hours: number
  limitHours: number
  alertHours: number
  label: string
}

function OvertimeBar({ hours, limitHours, alertHours, label }: OvertimeBarProps) {
  const status = getOvertimeStatus(hours, alertHours, limitHours)
  const pct    = Math.min(100, (hours / limitHours) * 100)
  const { bar, text, label: statusLabel } = STATUS_COLOR[status]
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-xs text-gray-500">{label}</span>
        <span className={`text-xs font-semibold ${text}`}>
          {hours}h / {limitHours}h <span className="font-normal">({statusLabel})</span>
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function ComplianceBar({ data, loading, mobile = false }: ComplianceBarProps) {
  if (loading) {
    return (
      <div className={`${mobile ? 'mx-4 my-2 px-4 py-3' : 'flex gap-4'} animate-pulse`}>
        <div className="h-4 bg-gray-200 rounded w-48" />
      </div>
    )
  }
  if (!data) return null

  const monthlyHours = minutesToHours(data.monthly_overtime_minutes)
  const annualHours  = minutesToHours(data.annual_overtime_minutes)
  const { overtime_limit_hours, overtime_annual_limit, overtime_alert_hours } = data.work_rules

  const intervalWarning = !data.interval_ok
  const consecutiveWarn = data.consecutive_work_days >= 14

  if (mobile) {
    return (
      <div className="mx-4 my-2 bg-white border border-gray-200 rounded-xl px-4 py-3 space-y-2">
        <OvertimeBar
          hours={monthlyHours}
          limitHours={overtime_limit_hours}
          alertHours={overtime_alert_hours}
          label="今月残業"
        />
        <OvertimeBar
          hours={annualHours}
          limitHours={overtime_annual_limit}
          alertHours={Math.round(overtime_annual_limit * 0.83)}
          label="年間累計"
        />
        <div className="flex gap-4 pt-1 border-t border-gray-100">
          <div className="text-xs text-gray-500">
            有休残数 <span className="font-semibold text-gray-700">{data.paid_leave_remaining}日</span>
          </div>
          <div className={`text-xs ${consecutiveWarn ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
            連続勤務 <span className="font-semibold">{data.consecutive_work_days}日</span>
            {consecutiveWarn && ' ⚠️'}
          </div>
        </div>
        {intervalWarning && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-xs text-red-600">
            ⚠️ 前日退勤から11時間未満です
          </div>
        )}
        {consecutiveWarn && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-xs text-red-600">
            ⚠️ 連続勤務{data.consecutive_work_days}日（法定上限14日）
          </div>
        )}
      </div>
    )
  }

  const monthStatus  = getOvertimeStatus(monthlyHours, overtime_alert_hours, overtime_limit_hours)
  const annualStatus = getOvertimeStatus(annualHours, Math.round(overtime_annual_limit * 0.83), overtime_annual_limit)
  const { text: monthText }  = STATUS_COLOR[monthStatus]
  const { text: annualText } = STATUS_COLOR[annualStatus]

  return (
    <div className="flex items-center gap-4 text-sm flex-wrap">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400">有休残</span>
        <span className="font-semibold text-gray-700">{data.paid_leave_remaining}日</span>
      </div>
      <div className="w-px h-4 bg-gray-200" />
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">今月残業</span>
        <span className={`text-xs font-semibold ${monthText}`}>{monthlyHours}h / {overtime_limit_hours}h</span>
        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${STATUS_COLOR[monthStatus].bar}`}
            style={{ width: `${Math.min(100, (monthlyHours / overtime_limit_hours) * 100)}%` }}
          />
        </div>
      </div>
      <div className="w-px h-4 bg-gray-200" />
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">年間</span>
        <span className={`text-xs font-semibold ${annualText}`}>{annualHours}h / {overtime_annual_limit}h</span>
        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${STATUS_COLOR[annualStatus].bar}`}
            style={{ width: `${Math.min(100, (annualHours / overtime_annual_limit) * 100)}%` }}
          />
        </div>
      </div>
      <div className="w-px h-4 bg-gray-200" />
      <div className={`text-xs ${consecutiveWarn ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
        連続{data.consecutive_work_days}日{consecutiveWarn && ' ⚠️'}
      </div>
      {intervalWarning && (
        <div className="text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded">
          ⚠️ インターバル不足
        </div>
      )}
    </div>
  )
}
