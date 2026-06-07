'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  requestId: string
}

export function AdminRequestActions({ requestId }: Props) {
  const router = useRouter()
  const [rejectionReason, setRejectionReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function approve() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/requests/${requestId}/approve`, { method: 'PATCH' })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error ?? '承認に失敗しました')
        return
      }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function reject() {
    if (!rejectionReason.trim()) {
      setError('却下理由を入力してください')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/requests/${requestId}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejection_reason: rejectionReason }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error ?? '却下に失敗しました')
        return
      }
      setShowRejectForm(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  if (showRejectForm) {
    return (
      <div className="space-y-2">
        {error && <p className="text-xs text-red-500">{error}</p>}
        <textarea
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          placeholder="却下理由を入力"
          rows={2}
          className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-400"
        />
        <div className="flex gap-2">
          <button
            onClick={reject}
            disabled={loading}
            className="bg-red-500 text-white text-xs px-3 py-1 rounded hover:bg-red-600 disabled:opacity-50"
          >
            却下確定
          </button>
          <button
            onClick={() => { setShowRejectForm(false); setError('') }}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            キャンセル
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2 items-center">
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        onClick={approve}
        disabled={loading}
        className="bg-green-500 text-white text-xs px-3 py-1 rounded hover:bg-green-600 disabled:opacity-50"
      >
        承認
      </button>
      <button
        onClick={() => setShowRejectForm(true)}
        disabled={loading}
        className="bg-red-100 text-red-700 text-xs px-3 py-1 rounded hover:bg-red-200 disabled:opacity-50"
      >
        却下
      </button>
    </div>
  )
}

export default AdminRequestActions
