'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ShiftRow {
  id: string
  label: string
  sort_order: number
}

interface Props {
  initialShiftTypes: ShiftRow[]
}

export function ShiftTypeManager({ initialShiftTypes }: Props) {
  const [shiftTypes, setShiftTypes] = useState<ShiftRow[]>(initialShiftTypes)
  const [newLabel, setNewLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleAdd() {
    if (!newLabel.trim()) { setError('パターン名を入力してください'); return }
    setAdding(true)
    setError('')
    try {
      const res = await fetch('/api/admin/shift-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '追加に失敗しました'); return }
      // 一覧を再取得
      const listRes = await fetch('/api/admin/shift-types')
      const listData = await listRes.json() as { shift_types: ShiftRow[] }
      setShiftTypes(listData.shift_types ?? [])
      setNewLabel('')
    } catch {
      setError('ネットワークエラー')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/shift-types/${id}`, { method: 'DELETE' })
      if (!res.ok) { setError('削除に失敗しました'); return }
      setShiftTypes((prev) => prev.filter((s) => s.id !== id))
    } catch {
      setError('ネットワークエラー')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">区分パターン管理</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 現在のパターン一覧 */}
        <div className="space-y-1.5">
          {shiftTypes.length === 0 && (
            <p className="text-sm text-gray-400">パターンがありません（デフォルト値が使用されます）</p>
          )}
          {shiftTypes.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">{s.label}</span>
              <button
                onClick={() => handleDelete(s.id)}
                disabled={deletingId === s.id}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
              >
                {deletingId === s.id ? '削除中...' : '削除'}
              </button>
            </div>
          ))}
        </div>

        {/* 追加フォーム */}
        <div className="flex gap-2 pt-1">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="例: 1000-1845"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button
            onClick={handleAdd}
            disabled={adding}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {adding ? '追加中...' : '追加'}
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <p className="text-xs text-gray-400">※ 削除したパターンは社員の勤怠入力に表示されなくなります</p>
      </CardContent>
    </Card>
  )
}
