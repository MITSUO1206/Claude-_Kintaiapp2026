'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Payslip } from '@/lib/types'

type UserRow = { id: string; name: string; employee_code: string }
type PayslipRow = Payslip & { status: string }

interface PayslipsClientProps {
  rows: PayslipRow[]
  userMap: Record<string, UserRow>
  year: number
  month: number
  prevYear: number
  prevMonth: number
  nextYear: number
  nextMonth: number
  totalGross: number
  totalNet: number
  filterUserId: string
  filterStatus: string
  allUsers: UserRow[]
}

function yen(v: number) { return `¥${Math.round(v).toLocaleString()}` }

export function PayslipsClient({
  rows: initialRows,
  userMap: initialUserMap,
  year,
  month,
  prevYear,
  prevMonth,
  nextYear,
  nextMonth,
  totalGross,
  totalNet,
  filterUserId,
  filterStatus,
  allUsers,
}: PayslipsClientProps) {
  const [rows, setRows] = useState(initialRows)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState('')

  const publishableRows = rows.filter((r) => r.status !== 'published')
  const allChecked =
    publishableRows.length > 0 && publishableRows.every((r) => checkedIds.has(r.id))

  function toggleAll() {
    if (allChecked) {
      setCheckedIds(new Set())
    } else {
      setCheckedIds(new Set(publishableRows.map((r) => r.id)))
    }
  }

  function toggleOne(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handlePublish() {
    const targets = [...checkedIds]
    if (targets.length === 0) return
    const ok = window.confirm(`${targets.length}件の明細を発行（公開）しますか？\n社員側から閲覧可能になります。`)
    if (!ok) return

    setPublishing(true)
    setPublishMsg('')
    let success = 0
    let failed = 0

    for (const id of targets) {
      try {
        const res = await fetch(`/api/admin/payslips/${id}/publish`, { method: 'PATCH' })
        if (res.ok) {
          success++
          setRows((prev) =>
            prev.map((r) => (r.id === id ? { ...r, status: 'published' } : r))
          )
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }

    setPublishing(false)
    setCheckedIds(new Set())
    setPublishMsg(
      failed === 0
        ? `${success}件を発行しました`
        : `${success}件発行、${failed}件失敗`
    )
  }

  const userMap = new Map(Object.entries(initialUserMap))
  const checkedCount = checkedIds.size

  return (
    <main className="flex-1 p-6 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">給与明細管理</h1>
        <div className="flex items-center gap-2">
          <a href={`/admin/payslips?year=${prevYear}&month=${prevMonth}`} className="text-sm text-blue-500 hover:underline">‹ 前月</a>
          <span className="font-semibold">{year}年{month}月</span>
          <a href={`/admin/payslips?year=${nextYear}&month=${nextMonth}`} className="text-sm text-blue-500 hover:underline">翌月 ›</a>
        </div>
      </div>

      {/* 絞り込みフォーム */}
      <form method="GET" className="flex gap-2 flex-wrap bg-white p-3 rounded-lg border text-sm">
        <input type="hidden" name="year"  value={year}  />
        <input type="hidden" name="month" value={month} />
        <select name="user_id" defaultValue={filterUserId} className="border rounded px-2 py-1">
          <option value="">全社員</option>
          {allUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.name}（{u.employee_code}）</option>
          ))}
        </select>
        <select name="status" defaultValue={filterStatus} className="border rounded px-2 py-1">
          <option value="">全ステータス</option>
          <option value="draft">下書き</option>
          <option value="published">公開済</option>
        </select>
        <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">絞り込み</button>
        {(filterUserId || filterStatus) && (
          <a href={`/admin/payslips?year=${year}&month=${month}`} className="text-xs text-gray-400 hover:text-gray-600 self-center">クリア</a>
        )}
      </form>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-xs text-gray-500">総支給額合計</p>
              <p className="text-2xl font-bold text-blue-700">{yen(totalGross)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-xs text-gray-500">差引支給額合計</p>
              <p className="text-2xl font-bold text-green-700">{yen(totalNet)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
            <span>
              {year}年{month}月 明細一覧
              {(filterUserId || filterStatus) && <span className="text-xs font-normal text-gray-400 ml-1">（絞り込み中）</span>}
            </span>
            <div className="flex items-center gap-3">
              {publishMsg && (
                <span className={`text-xs ${publishMsg.includes('失敗') ? 'text-red-500' : 'text-green-600'}`}>
                  {publishMsg}
                </span>
              )}
              {checkedCount > 0 && (
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {publishing ? '発行中...' : `選択した${checkedCount}件を発行`}
                </button>
              )}
              {rows.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap">
                  <a
                    href={`/api/admin/payslips/export?year=${year}&month=${month}`}
                    className="text-xs text-blue-500 hover:underline"
                  >
                    賃金台帳CSV
                  </a>
                  <a
                    href={`/api/admin/payslips/export?year=${year}&month=${month}&format=bank`}
                    className="text-xs text-green-600 hover:underline font-medium"
                  >
                    銀行振込CSV
                  </a>
                  <a
                    href={`/api/admin/payslips/export?year=${year}&month=${month}&format=freee`}
                    className="text-xs text-purple-600 hover:underline font-medium"
                  >
                    freee給与CSV
                  </a>
                </div>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-400 p-4">給与明細がありません。「生成」ボタンで作成してください。</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-center w-10">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                      className="w-4 h-4 cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-2 text-left">社員</th>
                  <th className="px-3 py-2 text-right">総支給額</th>
                  <th className="px-3 py-2 text-right">控除</th>
                  <th className="px-3 py-2 text-right">差引支給額</th>
                  <th className="px-3 py-2 text-center">出勤</th>
                  <th className="px-3 py-2 text-center">残業h</th>
                  <th className="px-3 py-2 text-center">状態</th>
                  <th className="px-3 py-2 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const u = userMap.get(p.user_id)
                  const isPublished = p.status === 'published'
                  return (
                    <tr key={p.id} className={`border-b hover:bg-gray-50 ${checkedIds.has(p.id) ? 'bg-green-50' : ''}`}>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={checkedIds.has(p.id)}
                          onChange={() => toggleOne(p.id)}
                          disabled={isPublished}
                          className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{u?.name ?? '—'}</span>
                        <span className="text-xs text-gray-400 ml-1">{u?.employee_code}</span>
                      </td>
                      <td className="px-3 py-2 text-right">{yen(p.gross_pay)}</td>
                      <td className="px-3 py-2 text-right text-red-600">-{yen(p.total_deduction)}</td>
                      <td className="px-3 py-2 text-right font-bold text-blue-700">{yen(p.net_pay)}</td>
                      <td className="px-3 py-2 text-center">{p.work_days}日</td>
                      <td className="px-3 py-2 text-center">{Number(p.overtime_hours).toFixed(1)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {isPublished ? '公開済' : '下書き'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex gap-2 justify-center">
                          <a href={`/admin/payslips/${p.id}/edit`} className="text-xs text-blue-500 hover:underline">明細編集</a>
                          <a href={`/api/admin/payslips/${p.id}/pdf`} target="_blank" className="text-xs text-gray-500 hover:underline">PDF</a>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
