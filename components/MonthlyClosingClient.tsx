'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface UserStatus {
  user_id: string
  employee_code: string
  name: string
  closing_id: string | null
  employee_confirmed_at: string | null
  closed_at: string | null
}

interface Props {
  year: number
  month: number
  users: UserStatus[]
  isAdmin: boolean
}

export function MonthlyClosingClient({ year, month, users, isAdmin }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [unlockId, setUnlockId] = useState<string | null>(null)
  const [unlockReason, setUnlockReason] = useState('')

  const notClosed = users.filter((u) => !u.closed_at)

  async function closeAll() {
    if (notClosed.length === 0) return
    if (!confirm(`${year}年${month}月 の未締め社員 ${notClosed.length}名 を一括締めしますか？`)) return

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/admin/monthly-closing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          month,
          user_ids: notClosed.map((u) => u.user_id),
        }),
      })

      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? '締め処理に失敗しました')
        return
      }

      setSuccess(`締め完了: ${body.processed ?? notClosed.length}名`)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function unlock(closingId: string) {
    if (!unlockReason.trim()) {
      setError('ロック解除理由を入力してください')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/admin/monthly-closing/${closingId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: unlockReason }),
      })

      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'ロック解除に失敗しました')
        return
      }

      setUnlockId(null)
      setUnlockReason('')
      setSuccess('ロックを解除しました')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded">
          {success}
        </div>
      )}

      {notClosed.length > 0 && (
        <button
          onClick={closeAll}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '処理中...' : `未締め ${notClosed.length}名 を一括締め`}
        </button>
      )}

      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-3 py-2 text-left">社員番号</th>
            <th className="px-3 py-2 text-left">氏名</th>
            <th className="px-3 py-2 text-center">確定申請</th>
            <th className="px-3 py-2 text-center">締め状態</th>
            {isAdmin && <th className="px-3 py-2 text-left">操作</th>}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.user_id} className="border-b hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-500">{u.employee_code}</td>
              <td className="px-3 py-2 font-medium">{u.name}</td>
              <td className="px-3 py-2 text-center">
                {u.employee_confirmed_at ? (
                  <span className="text-xs text-blue-600">
                    {new Date(u.employee_confirmed_at).toLocaleDateString('ja-JP')}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">未申請</span>
                )}
              </td>
              <td className="px-3 py-2 text-center">
                {u.closed_at ? (
                  <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                    締め済 {new Date(u.closed_at).toLocaleDateString('ja-JP')}
                  </span>
                ) : (
                  <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
                    未締め
                  </span>
                )}
              </td>
              {isAdmin && (
                <td className="px-3 py-2">
                  {u.closed_at && u.closing_id && (
                    unlockId === u.closing_id ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={unlockReason}
                          onChange={(e) => setUnlockReason(e.target.value)}
                          placeholder="解除理由"
                          className="border rounded px-2 py-1 text-xs w-40"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => unlock(u.closing_id!)}
                            disabled={loading}
                            className="bg-orange-500 text-white text-xs px-2 py-1 rounded hover:bg-orange-600"
                          >
                            解除
                          </button>
                          <button
                            onClick={() => { setUnlockId(null); setUnlockReason('') }}
                            className="text-xs text-gray-500"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setUnlockId(u.closing_id!)}
                        className="text-xs text-orange-600 hover:underline"
                      >
                        ロック解除
                      </button>
                    )
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default MonthlyClosingClient
