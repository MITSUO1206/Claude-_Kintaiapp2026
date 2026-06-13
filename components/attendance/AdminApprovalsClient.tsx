'use client'

import { useState } from 'react'
import type { MonthlyApproval } from '@/lib/types'

type ApprovalWithName = MonthlyApproval & { user_name: string }

interface AdminApprovalsClientProps {
  initialApprovals: ApprovalWithName[]
  year: number
  month: number
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft:     { label: '未申請', cls: 'bg-gray-100 text-gray-500' },
  submitted: { label: '申請済み', cls: 'bg-amber-100 text-amber-700' },
  approved:  { label: '承認済み', cls: 'bg-green-100 text-green-700' },
  rejected:  { label: '却下', cls: 'bg-red-100 text-red-700' },
}

export function AdminApprovalsClient({ initialApprovals, year, month }: AdminApprovalsClientProps) {
  const [approvals, setApprovals] = useState(initialApprovals)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleAction(id: string, action: 'approve' | 'reject') {
    setLoading(id + action)
    setError('')
    try {
      const res = await fetch(`/api/admin/approvals/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '操作に失敗しました')
        return
      }
      setApprovals((prev) =>
        prev.map((a) => a.id === id ? { ...a, ...data.approval } : a)
      )
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setLoading(null)
    }
  }

  const submittedCount = approvals.filter((a) => a.status === 'submitted').length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto p-6">
        <div className="mb-6">
          <a href="/admin" className="text-sm text-gray-400 hover:text-gray-600">← 管理者ダッシュボード</a>
        </div>

        <h1 className="text-2xl font-bold text-gray-800 mb-1">
          {year}年{month}月 月末締め承認
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          申請済み {submittedCount}件 / 全{approvals.length}件
        </p>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">社員</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">ステータス</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">申請日時</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {approvals.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                    申請はありません
                  </td>
                </tr>
              )}
              {approvals.map((a) => {
                const badge = STATUS_BADGE[a.status] ?? STATUS_BADGE['draft']
                return (
                  <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{a.user_name}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500 text-xs">
                      {a.submitted_at
                        ? new Date(a.submitted_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a.status === 'submitted' && (
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => handleAction(a.id, 'approve')}
                            disabled={!!loading}
                            className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                          >
                            {loading === a.id + 'approve' ? '...' : '承認'}
                          </button>
                          <button
                            onClick={() => handleAction(a.id, 'reject')}
                            disabled={!!loading}
                            className="px-3 py-1 bg-red-400 hover:bg-red-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                          >
                            {loading === a.id + 'reject' ? '...' : '却下'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
