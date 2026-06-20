'use client'

import { useState, useEffect } from 'react'

interface ObligationUser {
  user_id: string
  name: string
  employee_code: string
  grant_date: string
  granted_days: number
  used_days: number
  remaining_obligation: number
  days_until_deadline: number
  level: 'urgent' | 'warning'
}

export function PaidLeaveObligationAlert() {
  const [alerts, setAlerts] = useState<ObligationUser[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState('')

  useEffect(() => {
    fetch('/api/admin/paid-leave/obligation-alert')
      .then((r) => r.json())
      .then((d) => setAlerts(d.alerts ?? []))
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  async function handleSendAlert() {
    setSending(true)
    setSendMsg('')
    try {
      const res = await fetch('/api/admin/paid-leave/obligation-alert', { method: 'POST' })
      const d = await res.json()
      setSendMsg(res.ok ? `${d.sent}名分のアラートメールを管理者(${d.recipients}名)に送信しました` : d.error ?? 'エラーが発生しました')
    } finally {
      setSending(false)
    }
  }

  if (loading) return null
  if (alerts.length === 0) return (
    <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-green-700">
      <span>✓</span>
      <span>年5日有休取得義務（労基法39条7項）：期限90日以内の未達成者なし</span>
    </div>
  )

  const urgentCount  = alerts.filter((a) => a.level === 'urgent').length
  const warningCount = alerts.filter((a) => a.level === 'warning').length

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-red-700">
            ⚠️ 有休5日取得義務 未達成アラート（労基法39条7項）
          </h3>
          <p className="text-xs text-red-500 mt-0.5">
            付与日から1年以内に5日取得させる義務。違反は1名につき罰金30万円以下。
            {urgentCount > 0 && <span className="font-bold"> 緊急{urgentCount}名（期限30日以内）</span>}
            {warningCount > 0 && <span> 警告{warningCount}名（期限90日以内）</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSendAlert}
            disabled={sending}
            className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40"
          >
            {sending ? '送信中...' : 'アラートメール送信'}
          </button>
          {sendMsg && <span className="text-xs text-green-600">{sendMsg}</span>}
        </div>
      </div>

      <table className="w-full text-xs bg-white rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-gray-50 border-b text-gray-500">
            <th className="px-3 py-2 text-left">状態</th>
            <th className="px-3 py-2 text-left">氏名</th>
            <th className="px-3 py-2 text-center">付与日</th>
            <th className="px-3 py-2 text-center">付与日数</th>
            <th className="px-3 py-2 text-center">取得済</th>
            <th className="px-3 py-2 text-center">残義務</th>
            <th className="px-3 py-2 text-center">期限まで</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((a) => (
            <tr key={a.user_id} className={`border-b last:border-0 ${a.level === 'urgent' ? 'bg-red-50' : 'bg-yellow-50'}`}>
              <td className="px-3 py-2">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${a.level === 'urgent' ? 'bg-red-500 text-white' : 'bg-yellow-400 text-white'}`}>
                  {a.level === 'urgent' ? '緊急' : '警告'}
                </span>
              </td>
              <td className="px-3 py-2 font-medium text-gray-800">
                {a.name} <span className="text-gray-400">{a.employee_code}</span>
              </td>
              <td className="px-3 py-2 text-center text-gray-600">{a.grant_date.slice(0, 10)}</td>
              <td className="px-3 py-2 text-center">{a.granted_days}日</td>
              <td className="px-3 py-2 text-center">{a.used_days}日</td>
              <td className="px-3 py-2 text-center font-semibold text-red-600">あと{a.remaining_obligation}日</td>
              <td className="px-3 py-2 text-center font-semibold">
                <span className={a.level === 'urgent' ? 'text-red-600' : 'text-yellow-600'}>
                  {a.days_until_deadline}日
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
