'use client'

import { useState, useEffect, useCallback } from 'react'
import { AdminSidebar } from '@/components/AdminSidebar'
import type { WorkRulePattern } from '@/lib/types'

type PatternWithCount = WorkRulePattern & { user_count: number }

const EMPTY_FORM = {
  name: '',
  start_time: '09:00',
  end_time: '18:00',
  break_minutes: 60,
  work_hours_per_day: 8,
  work_days_per_month: 20,
  is_night_shift: false,
  is_default: false,
}

function PatternForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: typeof EMPTY_FORM
  onSave: (data: typeof EMPTY_FORM) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState(initial)

  function field<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <div className="bg-gray-50 border rounded-xl p-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-600">パターン名 *</label>
          <input
            className="mt-1 w-full border rounded px-3 py-1.5 text-sm"
            value={form.name}
            onChange={(e) => field('name', e.target.value)}
            placeholder="例: 正社員日勤"
          />
        </div>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => field('is_default', e.target.checked)}
              className="w-4 h-4"
            />
            デフォルトパターン
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_night_shift}
              onChange={(e) => field('is_night_shift', e.target.checked)}
              className="w-4 h-4"
            />
            夜勤パターン
          </label>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-600">開始時刻</label>
          <input
            type="time"
            className="mt-1 w-full border rounded px-3 py-1.5 text-sm"
            value={form.start_time}
            onChange={(e) => field('start_time', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">終了時刻</label>
          <input
            type="time"
            className="mt-1 w-full border rounded px-3 py-1.5 text-sm"
            value={form.end_time}
            onChange={(e) => field('end_time', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">休憩（分）</label>
          <input
            type="number"
            className="mt-1 w-full border rounded px-3 py-1.5 text-sm"
            value={form.break_minutes}
            onChange={(e) => field('break_minutes', parseInt(e.target.value) || 0)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">所定時間（h/日）</label>
          <input
            type="number"
            step="0.5"
            className="mt-1 w-full border rounded px-3 py-1.5 text-sm"
            value={form.work_hours_per_day}
            onChange={(e) => field('work_hours_per_day', parseFloat(e.target.value) || 8)}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-600">所定日数（日/月）</label>
          <input
            type="number"
            className="mt-1 w-full border rounded px-3 py-1.5 text-sm"
            value={form.work_days_per_month}
            onChange={(e) => field('work_days_per_month', parseInt(e.target.value) || 20)}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.name.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-40"
        >
          {saving ? '保存中...' : '保存'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 border rounded text-sm hover:bg-gray-100"
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}

export default function WorkPatternsPage() {
  const [patterns, setPatterns] = useState<PatternWithCount[]>([])
  const [loading, setLoading]   = useState(true)
  const [userName, setUserName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [pRes, meRes] = await Promise.all([
        fetch('/api/admin/work-patterns'),
        fetch('/api/auth/me'),
      ])
      if (pRes.ok) { const d = await pRes.json(); setPatterns(d.patterns ?? []) }
      if (meRes.ok) { const d = await meRes.json(); setUserName(d.user?.name ?? '') }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleCreate(form: typeof EMPTY_FORM) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/work-patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'エラーが発生しました'); return }
      setCreating(false)
      await fetchData()
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit(id: string, form: typeof EMPTY_FORM) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/work-patterns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'エラーが発生しました'); return }
      setEditingId(null)
      await fetchData()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`パターン「${name}」を削除しますか？`)) return
    setError('')
    const res = await fetch(`/api/admin/work-patterns/${id}`, { method: 'DELETE' })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? '削除に失敗しました'); return }
    await fetchData()
  }

  async function handleSetDefault(id: string) {
    setError('')
    const res = await fetch(`/api/admin/work-patterns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_default: true }),
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'エラーが発生しました'); return }
    await fetchData()
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={userName} />

      <main className="flex-1 p-6 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-800">勤務パターン管理</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              社員ごとの所定時間・勤務時間帯を定義します。社員管理画面で各社員に割り当ててください。
            </p>
          </div>
          {!creating && (
            <button
              onClick={() => { setCreating(true); setEditingId(null); setError('') }}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              + 新規作成
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {creating && (
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">新しいパターンを作成</p>
            <PatternForm
              initial={EMPTY_FORM}
              onSave={handleCreate}
              onCancel={() => { setCreating(false); setError('') }}
              saving={saving}
            />
          </div>
        )}

        {/* DB migration notice */}
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          <p className="font-semibold mb-1">初回セットアップ: Supabase SQL Editorで以下を実行してください</p>
          <pre className="text-xs bg-amber-100 rounded p-2 overflow-x-auto whitespace-pre">{`CREATE TABLE work_rule_patterns (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL,
  name               text NOT NULL,
  start_time         time NOT NULL DEFAULT '09:00',
  end_time           time NOT NULL DEFAULT '18:00',
  break_minutes      integer NOT NULL DEFAULT 60,
  work_hours_per_day numeric NOT NULL DEFAULT 8,
  work_days_per_month integer NOT NULL DEFAULT 20,
  is_night_shift     boolean NOT NULL DEFAULT false,
  is_default         boolean NOT NULL DEFAULT false,
  created_at         timestamptz DEFAULT now(),
  UNIQUE (company_id, name)
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_rule_pattern_id uuid REFERENCES work_rule_patterns(id);`}</pre>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">読み込み中...</div>
        ) : patterns.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">
            パターンがありません。「+ 新規作成」から最初のパターンを作成してください。
          </div>
        ) : (
          <div className="space-y-3">
            {patterns.map((p) => (
              <div key={p.id}>
                {editingId === p.id ? (
                  <PatternForm
                    initial={{
                      name:                p.name,
                      start_time:          p.start_time,
                      end_time:            p.end_time,
                      break_minutes:       p.break_minutes,
                      work_hours_per_day:  p.work_hours_per_day,
                      work_days_per_month: p.work_days_per_month,
                      is_night_shift:      p.is_night_shift,
                      is_default:          p.is_default,
                    }}
                    onSave={(form) => handleEdit(p.id, form)}
                    onCancel={() => { setEditingId(null); setError('') }}
                    saving={saving}
                  />
                ) : (
                  <div className={`bg-white rounded-xl border p-4 flex items-center gap-4 ${p.is_default ? 'border-blue-300 ring-1 ring-blue-200' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-800">{p.name}</span>
                        {p.is_default && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">デフォルト</span>
                        )}
                        {p.is_night_shift && (
                          <span className="text-xs bg-slate-700 text-white px-2 py-0.5 rounded-full">夜勤</span>
                        )}
                        <span className="text-xs text-gray-400">{p.user_count}名が使用中</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>{p.start_time.slice(0,5)} 〜 {p.end_time.slice(0,5)}</span>
                        <span>休憩 {p.break_minutes}分</span>
                        <span>所定 {p.work_hours_per_day}h/日</span>
                        <span>{p.work_days_per_month}日/月</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!p.is_default && (
                        <button
                          onClick={() => handleSetDefault(p.id)}
                          className="text-xs text-blue-500 hover:underline"
                        >
                          デフォルトにする
                        </button>
                      )}
                      <button
                        onClick={() => { setEditingId(p.id); setCreating(false); setError('') }}
                        className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(p.id, p.name)}
                        disabled={p.is_default || p.user_count > 0}
                        className="px-3 py-1.5 text-xs border border-red-200 text-red-500 rounded hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={p.is_default ? 'デフォルトパターンは削除不可' : p.user_count > 0 ? '使用中の社員がいます' : ''}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-gray-400">
          * デフォルトパターンは社員にパターンが未設定の場合に使用されます。必ず1つ設定してください。
        </p>
      </main>
    </div>
  )
}
