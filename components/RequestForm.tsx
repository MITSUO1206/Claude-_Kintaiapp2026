'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const TYPE_LABELS: Record<string, string> = {
  leave_paid: '有給休暇',
  leave_special: '特別休暇',
  overtime: '残業申請',
  attendance_fix: '打刻修正',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '審査中',
  approved: '承認済',
  rejected: '却下',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

interface RequestRow {
  id: string
  type: string
  target_date: string | null
  reason: string
  status: string
  rejection_reason: string | null
  created_at: string
}

interface Props {
  initialRequests: RequestRow[]
  leaveBalance: { total_days: number; used_days: number; remaining_days: number } | null
}

export function RequestForm({ initialRequests, leaveBalance }: Props) {
  const router = useRouter()
  const [requests, setRequests] = useState<RequestRow[]>(initialRequests)
  const [type, setType] = useState('leave_paid')
  const [targetDate, setTargetDate] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          target_date: targetDate || undefined,
          reason,
          note: note || undefined,
        }),
      })

      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? '申請に失敗しました')
        return
      }

      setSuccess('申請を受け付けました')
      setReason('')
      setNote('')
      setTargetDate('')

      const newReq: RequestRow = {
        id: body.request.id,
        type,
        target_date: targetDate || null,
        reason,
        status: 'pending',
        rejection_reason: null,
        created_at: new Date().toISOString(),
      }
      setRequests([newReq, ...requests])
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {leaveBalance && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-gray-500 mb-1">今年度の有給残日数</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-blue-600">{leaveBalance.remaining_days}</span>
              <span className="text-sm text-gray-500">日残</span>
              <span className="text-xs text-gray-400">
                （付与 {leaveBalance.total_days}日 / 使用 {leaveBalance.used_days}日）
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">新規申請</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">申請種別</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">対象日</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                申請理由 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                rows={3}
                placeholder="申請理由を入力してください"
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">補足（任意）</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="補足情報があれば入力"
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '送信中...' : '申請する'}
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">申請一覧</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {requests.length === 0 ? (
            <p className="text-sm text-gray-400 p-4">申請はありません</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left">種別</th>
                  <th className="px-3 py-2 text-left">対象日</th>
                  <th className="px-3 py-2 text-left">理由</th>
                  <th className="px-3 py-2 text-center">状態</th>
                  <th className="px-3 py-2 text-left">申請日</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2">{TYPE_LABELS[r.type] ?? r.type}</td>
                    <td className="px-3 py-2">{r.target_date ?? '—'}</td>
                    <td className="px-3 py-2 max-w-xs truncate">{r.reason}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status]}`}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                      {r.status === 'rejected' && r.rejection_reason && (
                        <p className="text-xs text-red-500 mt-0.5">{r.rejection_reason}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {new Date(r.created_at).toLocaleDateString('ja-JP')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default RequestForm
