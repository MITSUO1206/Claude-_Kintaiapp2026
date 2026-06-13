'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  year: number
  month: number
  isLocked: boolean
  isConfirmed: boolean
}

export function MonthlyConfirmButton({ year, month, isLocked, isConfirmed }: Props) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(isConfirmed)
  const [error, setError] = useState('')

  if (isLocked) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-100 rounded p-3">
        <span className="text-xs bg-gray-400 text-white px-2 py-0.5 rounded">締め済み</span>
        <span>{year}年{month}月は締め処理が完了しています</span>
      </div>
    )
  }

  if (done) {
    return (
      <p className="text-sm text-green-600 bg-green-50 p-3 rounded border border-green-200">
        ✓ 確定申請済み — 管理者の締め処理をお待ちください
      </p>
    )
  }

  async function handleConfirm() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/monthly-closing/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '申請に失敗しました')
        return
      }
      setDone(true)
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleConfirm}
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
      >
        {loading ? '送信中...' : `${year}年${month}月の勤怠を確定申請する`}
      </Button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
