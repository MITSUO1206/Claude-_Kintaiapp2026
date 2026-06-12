'use client'

import { useState } from 'react'
import type { MonthlyApproval, ApprovalStatus } from '@/lib/types'

interface ApprovalBannerProps {
  year: number
  month: number
  approval: MonthlyApproval | null
  onSubmitted: (approval: MonthlyApproval) => void
}

const STATUS_LABEL: Record<ApprovalStatus, { label: string; color: string }> = {
  draft:     { label: '未申請', color: 'text-gray-500' },
  submitted: { label: '申請済み（承認待ち）', color: 'text-amber-600' },
  approved:  { label: '承認済み', color: 'text-green-600' },
  rejected:  { label: '却下されました', color: 'text-red-600' },
}

export function ApprovalBanner({ year, month, approval, onSubmitted }: ApprovalBannerProps) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const status = approval?.status ?? 'draft'
  const { label, color } = STATUS_LABEL[status]

  async function handleSubmit() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/approvals/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '申請に失敗しました')
        return
      }
      onSubmitted(data.approval)
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-4 border border-gray-200 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">{year}年{month}月 締め承認</p>
          <p className={`text-sm font-medium ${color}`}>{label}</p>
        </div>
        {(status === 'draft' || status === 'rejected') && (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg disabled:bg-blue-300 transition-colors"
          >
            {loading ? '申請中...' : '月末締め申請する'}
          </button>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}
