'use client'

import { useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EMPLOYMENT_TYPE_LABELS } from '@/lib/leave/grantCalc'

export type LeaveUserRow = {
  id: string
  employee_code: string
  name: string
  hired_at: string
  tenureStr: string
  employment_type: string
  weekly_working_days: number
  totalDays: number
  usedDays: number
  remaining: number
  nextGrantDate: string | null
  nextGrantDays: number | null
  fiscalYear: number
  grants: {
    grant_date: string
    granted_days: number
    basis: string
    note: string | null
  }[]
}

function BasisLabel({ basis }: { basis: string }) {
  const map: Record<string, { label: string; color: string }> = {
    statutory:         { label: '法定', color: 'text-blue-600' },
    statutory_skipped: { label: '出勤率不足', color: 'text-red-500' },
    manual:            { label: '手動', color: 'text-orange-500' },
  }
  const b = map[basis] ?? { label: basis, color: 'text-gray-500' }
  return <span className={`text-xs ${b.color}`}>{b.label}</span>
}

function EditModal({ row, onClose }: { row: LeaveUserRow; onClose: () => void }) {
  const router = useRouter()
  const [days, setDays] = useState(String(row.totalDays))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    const res = await fetch('/api/admin/leave-grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id:     row.id,
        fiscal_year: row.fiscalYear,
        total_days:  parseFloat(days) || 0,
        note:        note || null,
      }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json(); setError(d.error ?? '失敗'); return }
    onClose()
    router.refresh()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-5 w-72"
        onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-sm mb-3">{row.name} — 有給補填・手動設定</h3>
        <label className="block text-xs text-gray-600 mb-1">付与日数（{row.fiscalYear}年度）</label>
        <input
          type="number" min="0" max="40" step="0.5" value={days}
          onChange={(e) => setDays(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label className="block text-xs text-gray-600 mb-1">備考</label>
        <input
          type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="任意"
          className="w-full border rounded px-2 py-1 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        <div className="flex gap-2">
          <button onClick={save} disabled={saving}
            className="flex-1 bg-blue-600 text-white text-sm py-1.5 rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
          <button onClick={onClose} className="flex-1 border text-sm py-1.5 rounded hover:bg-gray-50">
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}

export function LeaveManagementTable({ rows, fiscalYear }: { rows: LeaveUserRow[]; fiscalYear: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<LeaveUserRow | null>(null)

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <>
      {editing && <EditModal row={editing} onClose={() => setEditing(null)} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">社員別有給状況</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">社員番号</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">氏名</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">入社日</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">勤続年数</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">雇用形態</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">付与日数</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">消化日数</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">残日数</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">次回付与予定</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                    社員が登録されていません
                  </td>
                </tr>
              ) : rows.map((u) => (
                <Fragment key={u.id}>
                  <tr
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggle(u.id)}
                  >
                    <td className="px-3 py-2 text-sm text-gray-500">{u.employee_code}</td>
                    <td className="px-3 py-2 text-sm font-medium">{u.name}</td>
                    <td className="px-3 py-2 text-sm text-center text-gray-500">
                      {u.hired_at?.slice(0, 10) ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-sm text-center text-gray-500">{u.tenureStr}</td>
                    <td className="px-3 py-2 text-sm text-center text-gray-500">
                      <span className="block">
                        {EMPLOYMENT_TYPE_LABELS[u.employment_type] ?? u.employment_type}
                      </span>
                      <span className="text-xs text-gray-400">週{u.weekly_working_days}日</span>
                    </td>
                    <td className="px-3 py-2 text-sm text-center">{u.totalDays}日</td>
                    <td className="px-3 py-2 text-sm text-center text-orange-500">{u.usedDays}日</td>
                    <td className={`px-3 py-2 text-sm text-center font-semibold ${
                      u.remaining <= 0 ? 'text-red-600' : u.remaining <= 3 ? 'text-yellow-600' : 'text-green-600'
                    }`}>
                      {u.remaining}日
                    </td>
                    <td className="px-3 py-2 text-sm text-center text-gray-500">
                      {u.nextGrantDate ? (
                        <>
                          <span className="block text-xs">{u.nextGrantDate}</span>
                          <span className="text-xs text-blue-500">+{u.nextGrantDays}日</span>
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setEditing(u)}
                        className="text-xs text-blue-600 border border-blue-300 rounded px-2 py-0.5 hover:bg-blue-50"
                      >
                        補填
                      </button>
                    </td>
                  </tr>
                  {expanded.has(u.id) && (
                    <tr className="bg-blue-50">
                      <td colSpan={10} className="px-6 py-3">
                        <p className="text-xs font-medium text-gray-600 mb-2">付与履歴</p>
                        {u.grants.length === 0 ? (
                          <p className="text-xs text-gray-400">付与履歴がありません</p>
                        ) : (
                          <table className="text-xs w-full max-w-md">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="text-left pr-4 font-medium">付与日</th>
                                <th className="text-center pr-4 font-medium">日数</th>
                                <th className="text-left pr-4 font-medium">区分</th>
                                <th className="text-left font-medium">備考</th>
                              </tr>
                            </thead>
                            <tbody>
                              {u.grants.map((g, i) => (
                                <tr key={i} className="border-t border-blue-100">
                                  <td className="pr-4 py-0.5">{g.grant_date}</td>
                                  <td className="pr-4 text-center">{g.granted_days}日</td>
                                  <td className="pr-4"><BasisLabel basis={g.basis} /></td>
                                  <td className="text-gray-500">{g.note ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  )
}
