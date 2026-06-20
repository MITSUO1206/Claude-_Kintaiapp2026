'use client'

import { useState, useEffect, useCallback } from 'react'
import { AdminSidebar } from '@/components/AdminSidebar'

type AlertStatus = 'ok' | 'warning' | 'danger'

interface EmployeeAlert {
  user_id: string
  name: string
  employee_code: string
  monthly_hours: number
  annual_hours: number
  monthly_limit: number
  annual_limit: number
  alert_hours: number
  monthly_status: AlertStatus
  annual_status: AlertStatus
  status: AlertStatus
}

interface AlertData {
  alerts: EmployeeAlert[]
  year: number
  month: number
  monthly_limit: number
  annual_limit: number
}

const STATUS_CONFIG = {
  danger:  { label: '超過',    bg: 'bg-red-100',    text: 'text-red-700',    badge: 'bg-red-500 text-white',    icon: '🔴' },
  warning: { label: '警告',    bg: 'bg-yellow-50',  text: 'text-yellow-700', badge: 'bg-yellow-400 text-white', icon: '🟡' },
  ok:      { label: '正常',    bg: '',               text: 'text-green-700',  badge: 'bg-green-100 text-green-700', icon: '🟢' },
}

function ProgressBar({ value, limit, status }: { value: number; limit: number; status: AlertStatus }) {
  const pct = Math.min(100, Math.round((value / limit) * 100))
  const barColor = status === 'danger' ? 'bg-red-500' : status === 'warning' ? 'bg-yellow-400' : 'bg-green-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-10 text-right">{pct}%</span>
    </div>
  )
}

export default function OvertimeAlertsPage() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData]   = useState<AlertData | null>(null)
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [alertRes, meRes] = await Promise.all([
        fetch(`/api/admin/overtime-alerts?year=${year}&month=${month}`),
        fetch('/api/auth/me'),
      ])
      if (alertRes.ok) setData(await alertRes.json())
      if (meRes.ok) { const m = await meRes.json(); setUserName(m.user?.name ?? '') }
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { fetchData() }, [fetchData])

  const dangerCount  = data?.alerts.filter((a) => a.status === 'danger').length  ?? 0
  const warningCount = data?.alerts.filter((a) => a.status === 'warning').length ?? 0

  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState('')

  async function handleSendAlerts() {
    setSending(true)
    setSendMsg('')
    try {
      const res = await fetch('/api/admin/overtime-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      })
      const d = await res.json()
      setSendMsg(res.ok ? `${d.sent}名分のアラートメールを管理者(${d.recipients}名)に送信しました` : d.error ?? 'エラーが発生しました')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={userName} />

      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-800">36協定アラート</h1>
              <p className="text-sm text-gray-500 mt-0.5">月・年間残業時間の上限管理</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Alert email button */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSendAlerts}
                  disabled={sending || (dangerCount === 0 && warningCount === 0)}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sending ? '送信中...' : `アラートメール送信 (${dangerCount + warningCount}名)`}
                </button>
                {sendMsg && <span className="text-xs text-green-600">{sendMsg}</span>}
              </div>
              {/* Month picker */}
              <div className="flex items-center gap-2">
              <button
                onClick={() => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else { setMonth(m => m - 1) } }}
                className="p-1.5 rounded border hover:bg-gray-100"
              >
                ◀
              </button>
              <span className="text-sm font-medium text-gray-700 w-28 text-center">
                {year}年{month}月
              </span>
              <button
                onClick={() => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else { setMonth(m => m + 1) } }}
                className="p-1.5 rounded border hover:bg-gray-100"
              >
                ▶
              </button>
            </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">月上限</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{data?.monthly_limit ?? 45}<span className="text-sm font-normal text-gray-500">h</span></p>
              <p className="text-xs text-gray-400 mt-0.5">36協定 月間残業上限</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">年上限</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{data?.annual_limit ?? 360}<span className="text-sm font-normal text-gray-500">h</span></p>
              <p className="text-xs text-gray-400 mt-0.5">36協定 年間残業上限</p>
            </div>
            <div className={`rounded-xl border p-4 ${dangerCount > 0 ? 'bg-red-50 border-red-200' : warningCount > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
              <p className="text-xs text-gray-500">アラート状況</p>
              <div className="flex items-end gap-3 mt-1">
                {dangerCount > 0 && <span className="text-2xl font-bold text-red-600">{dangerCount}<span className="text-sm font-normal">名超過</span></span>}
                {warningCount > 0 && <span className="text-2xl font-bold text-yellow-600">{warningCount}<span className="text-sm font-normal">名警告</span></span>}
                {dangerCount === 0 && warningCount === 0 && <span className="text-2xl font-bold text-green-600">全員正常</span>}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border overflow-hidden">
            {loading ? (
              <div className="py-16 text-center text-gray-400 text-sm">読み込み中...</div>
            ) : !data || data.alerts.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-sm">社員データがありません</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-xs text-gray-500">
                    <th className="px-4 py-3 text-left">状態</th>
                    <th className="px-4 py-3 text-left">氏名</th>
                    <th className="px-4 py-3 text-right">当月残業</th>
                    <th className="px-4 py-3 min-w-[160px]">月間進捗</th>
                    <th className="px-4 py-3 text-right">年間残業</th>
                    <th className="px-4 py-3 min-w-[160px]">年間進捗</th>
                  </tr>
                </thead>
                <tbody>
                  {data.alerts.map((a) => {
                    const cfg = STATUS_CONFIG[a.status]
                    return (
                      <tr key={a.user_id} className={`border-b last:border-0 ${cfg.bg}`}>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.badge}`}>
                            {cfg.icon} {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-800">{a.name}</span>
                          <span className="text-xs text-gray-400 ml-1">{a.employee_code}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-medium ${STATUS_CONFIG[a.monthly_status].text}`}>
                            {a.monthly_hours.toFixed(1)}h
                          </span>
                          <span className="text-xs text-gray-400"> / {a.monthly_limit}h</span>
                        </td>
                        <td className="px-4 py-3">
                          <ProgressBar value={a.monthly_hours} limit={a.monthly_limit} status={a.monthly_status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-medium ${STATUS_CONFIG[a.annual_status].text}`}>
                            {a.annual_hours.toFixed(1)}h
                          </span>
                          <span className="text-xs text-gray-400"> / {a.annual_limit}h</span>
                        </td>
                        <td className="px-4 py-3">
                          <ProgressBar value={a.annual_hours} limit={a.annual_limit} status={a.annual_status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-xs text-gray-400">
            * 月上限は選択した年月の残業時間。年間は{year}年1月〜12月の累計。警告しきい値は就業規則設定で変更できます。
          </p>
        </div>
      </main>
    </div>
  )
}
