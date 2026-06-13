// components/admin/FieldDefPanel.tsx
'use client'

import { useState } from 'react'
import type { EmployeeFieldDef } from '@/lib/types'

interface FieldDefPanelProps {
  fields: EmployeeFieldDef[]
  onAdded: (field: EmployeeFieldDef) => void
  onDeleted: (fieldId: string) => void
  onClose: () => void
}

export function FieldDefPanel({ fields, onAdded, onDeleted, onClose }: FieldDefPanelProps) {
  const [label, setLabel] = useState('')
  const [category, setCategory] = useState<'allowance' | 'deduction'>('allowance')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleAdd() {
    if (!label.trim()) return
    setAdding(true)
    setError('')
    try {
      const res = await fetch('/api/admin/employee-db/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), category }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '追加に失敗しました')
        return
      }
      onAdded(data.field as EmployeeFieldDef)
      setLabel('')
    } catch {
      setError('ネットワークエラー')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(field: EmployeeFieldDef) {
    if (!confirm(`「${field.label}」を削除しますか？\n設定済みの値データは保持されます。`)) return
    setDeletingId(field.id)
    try {
      const res = await fetch(`/api/admin/employee-db/fields/${field.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? '削除に失敗しました')
        return
      }
      onDeleted(field.id)
    } catch {
      setError('ネットワークエラー')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="w-52 border-l border-blue-200 bg-blue-50 flex flex-col flex-shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-blue-200">
        <span className="text-sm font-semibold text-blue-700">⚙ 列管理</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <p className="text-xs text-gray-400 mb-1">共通列（全員に表示）</p>
        {fields.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">列がありません</p>
        )}
        {fields.map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between bg-white border border-gray-200 rounded px-2 py-1.5 text-xs"
          >
            <span className="truncate flex-1">{f.label}</span>
            <span className={`ml-1 font-medium flex-shrink-0 ${
              f.category === 'allowance' ? 'text-green-600' : 'text-red-500'
            }`}>
              {f.category === 'allowance' ? '手当' : '控除'}
            </span>
            <button
              onClick={() => handleDelete(f)}
              disabled={deletingId === f.id}
              className="ml-1 text-gray-300 hover:text-red-400 flex-shrink-0 disabled:text-gray-200"
              title="削除"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="border-t border-blue-200 p-2 space-y-1.5">
        <p className="text-xs text-gray-500">新しい列を追加</p>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="列名（例: 役職手当）"
          className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
        />
        <div className="flex gap-1">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as 'allowance' | 'deduction')}
            className="flex-1 border border-gray-200 rounded px-1 py-1 text-xs"
          >
            <option value="allowance">手当</option>
            <option value="deduction">控除</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={adding || !label.trim()}
            className="px-2 py-1 bg-blue-600 text-white text-xs rounded disabled:bg-blue-300"
          >
            追加
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <p className="text-xs text-gray-400">※個別項目は各社員の行で追加</p>
      </div>
    </div>
  )
}
