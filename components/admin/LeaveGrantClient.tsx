'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  userId: string
  fiscalYear: number
  totalDays: number
  isAuto: boolean
}

export function LeaveGrantClient({ userId, fiscalYear, totalDays, isAuto }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(totalDays))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    const days = parseInt(value)
    if (isNaN(days) || days < 0) { setError('正の整数を入力してください'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/leave-balances/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, fiscal_year: fiscalYear, total_days: days }),
      })
      if (!res.ok) { setError('保存に失敗しました'); return }
      setEditing(false)
      router.refresh()
    } catch {
      setError('ネットワークエラー')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-16 border rounded px-2 py-0.5 text-sm text-center"
          autoFocus
        />
        <span className="text-xs text-gray-400">日</span>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? '保存中' : '確定'}
        </button>
        <button
          onClick={() => { setEditing(false); setValue(String(totalDays)); setError('') }}
          className="text-xs text-gray-400 hover:text-gray-600 px-1"
        >
          取消
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-blue-500 hover:underline"
      >
        補填
      </button>
      {isAuto && <span className="text-xs text-gray-400">（自動）</span>}
    </div>
  )
}
