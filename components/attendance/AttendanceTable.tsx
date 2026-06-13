'use client'

import { useState } from 'react'
import type { AttendanceRecord, WorkLocation } from '@/lib/types'

interface AttendanceTableProps {
  records: AttendanceRecord[]
  year: number
  month: number
  userId: string
  isAdmin?: boolean
  onSaved: (record: AttendanceRecord) => void
  onMonthChange: (year: number, month: number) => void
}

const WORK_LOCATION_LABELS: Record<string, string> = {
  office: 'オフィス', home: '自宅', satellite: 'サテライト', other: 'その他',
}

const STATUS_LABELS: Record<string, string> = {
  present: '出勤', absent: '欠勤', late: '遅刻',
  leave_paid: '有給', leave_special: '特休',
}

function isoToHHMM(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function minutesToHHMM(min: number | null | undefined): string {
  if (min == null || min === 0) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

interface EditState {
  clockIn: string
  clockOut: string
  breakMinutes: number
  workLocation: WorkLocation | ''
}

export function AttendanceTable({
  records, year, month, userId, isAdmin = false, onSaved, onMonthChange,
}: AttendanceTableProps) {
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({
    clockIn: '', clockOut: '', breakMinutes: 60, workLocation: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const recordMap = new Map(records.map((r) => [r.work_date, r]))

  const lastDay = new Date(year, month, 0).getDate()
  const days = Array.from({ length: lastDay }, (_, i) => i + 1)
  const DOW = ['日', '月', '火', '水', '木', '金', '土']

  function startEdit(dateStr: string) {
    const rec = recordMap.get(dateStr)
    setEditState({
      clockIn:      isoToHHMM(rec?.clock_in),
      clockOut:     isoToHHMM(rec?.clock_out),
      breakMinutes: rec?.break_minutes ?? 60,
      workLocation: (rec?.work_location ?? '') as WorkLocation | '',
    })
    setEditingDate(dateStr)
    setError('')
  }

  async function handleSave(dateStr: string) {
    setSaving(true)
    setError('')
    try {
      const url = isAdmin
        ? `/api/admin/attendance/${userId}/record`
        : '/api/attendance/record'
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_date:     dateStr,
          clock_in:      editState.clockIn  || null,
          clock_out:     editState.clockOut || null,
          break_minutes: editState.breakMinutes,
          work_location: editState.workLocation || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError((data as { error?: string }).error ?? '保存に失敗しました')
        return
      }
      onSaved((data as { record: AttendanceRecord }).record)
      setEditingDate(null)
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setSaving(false)
    }
  }

  function prevMonth() {
    if (month === 1) onMonthChange(year - 1, 12)
    else onMonthChange(year, month - 1)
  }

  function nextMonth() {
    if (month === 12) onMonthChange(year + 1, 1)
    else onMonthChange(year, month + 1)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 月ナビゲーション */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 flex-shrink-0 bg-white">
        <button
          onClick={prevMonth}
          className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          ‹ 前の月
        </button>
        <span className="text-base font-bold text-gray-800">{year}年{month}月</span>
        <button
          onClick={nextMonth}
          className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          次の月 ›
        </button>
      </div>

      {/* テーブル本体 */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr className="border-b-2 border-gray-200">
              <th className="px-3 py-2 text-left whitespace-nowrap text-xs font-medium text-gray-500 w-16">日付</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 w-8">曜</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-20">区分</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-24">就業場所</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-20">出勤</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-20">退勤</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-16">休憩</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-16">実働</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500"></th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const dateStr = `${year}-${pad(month)}-${pad(day)}`
              const rec = recordMap.get(dateStr)
              const dow = new Date(`${dateStr}T00:00:00`).getDay()
              const isSat = dow === 6
              const isSun = dow === 0
              const isEditing = editingDate === dateStr
              const isLocked = (rec?.is_locked ?? false) && !isAdmin
              const isWeekend = isSat || isSun

              const rowBg = isEditing
                ? 'bg-blue-50'
                : isWeekend
                ? 'bg-gray-50/60'
                : 'bg-white'
              const textDay = isSat ? 'text-blue-500' : isSun ? 'text-red-500' : 'text-gray-700'

              return (
                <tr
                  key={dateStr}
                  className={`border-b border-gray-100 ${rowBg} ${isEditing ? 'ring-2 ring-inset ring-blue-300' : ''}`}
                >
                  {/* 日付 */}
                  <td className={`px-3 py-1.5 font-medium whitespace-nowrap ${textDay}`}>
                    {month}/{day}
                  </td>

                  {/* 曜日 */}
                  <td className={`px-2 py-1.5 text-center text-xs ${textDay}`}>
                    {DOW[dow]}
                  </td>

                  {/* 区分 */}
                  <td className="px-3 py-1.5 text-center">
                    {rec?.status ? (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        rec.status === 'present'    ? 'bg-green-100 text-green-700' :
                        rec.status === 'leave_paid' ? 'bg-blue-100 text-blue-700'  :
                        rec.status === 'absent'     ? 'bg-red-100 text-red-700'    :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {STATUS_LABELS[rec.status] ?? rec.status}
                      </span>
                    ) : isWeekend ? (
                      <span className="text-xs text-gray-300">休日</span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>

                  {/* 就業場所 */}
                  <td className="px-3 py-1.5 text-center">
                    {isEditing ? (
                      <select
                        value={editState.workLocation}
                        onChange={(e) => setEditState((s) => ({ ...s, workLocation: e.target.value as WorkLocation | '' }))}
                        className="border border-blue-300 rounded px-1 py-0.5 text-xs w-24"
                      >
                        <option value="">—</option>
                        <option value="office">オフィス</option>
                        <option value="home">自宅</option>
                        <option value="satellite">サテライト</option>
                        <option value="other">その他</option>
                      </select>
                    ) : (
                      <span className="text-xs text-gray-500">
                        {rec?.work_location ? WORK_LOCATION_LABELS[rec.work_location] : '—'}
                      </span>
                    )}
                  </td>

                  {/* 出勤 */}
                  <td className="px-3 py-1.5 text-center">
                    {isEditing ? (
                      <input
                        type="time"
                        value={editState.clockIn}
                        onChange={(e) => setEditState((s) => ({ ...s, clockIn: e.target.value }))}
                        className="border border-blue-300 rounded px-1 py-0.5 text-xs w-20"
                      />
                    ) : (
                      <span className="text-sm text-gray-700">{isoToHHMM(rec?.clock_in) || '—'}</span>
                    )}
                  </td>

                  {/* 退勤 */}
                  <td className="px-3 py-1.5 text-center">
                    {isEditing ? (
                      <input
                        type="time"
                        value={editState.clockOut}
                        onChange={(e) => setEditState((s) => ({ ...s, clockOut: e.target.value }))}
                        className="border border-blue-300 rounded px-1 py-0.5 text-xs w-20"
                      />
                    ) : (
                      <span className="text-sm text-gray-700">{isoToHHMM(rec?.clock_out) || '—'}</span>
                    )}
                  </td>

                  {/* 休憩 */}
                  <td className="px-3 py-1.5 text-center">
                    {isEditing ? (
                      <input
                        type="number"
                        min={0}
                        step={15}
                        value={editState.breakMinutes}
                        onChange={(e) => setEditState((s) => ({
                          ...s,
                          breakMinutes: Math.max(0, parseInt(e.target.value) || 0),
                        }))}
                        className="border border-blue-300 rounded px-1 py-0.5 text-xs w-14 text-right"
                      />
                    ) : (
                      <span className="text-xs text-gray-500">
                        {rec?.break_minutes != null ? `${rec.break_minutes}分` : '—'}
                      </span>
                    )}
                  </td>

                  {/* 実働 */}
                  <td className="px-3 py-1.5 text-center">
                    <span className="text-xs text-gray-700">{minutesToHHMM(rec?.actual_minutes)}</span>
                  </td>

                  {/* 操作 */}
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex items-center gap-1 justify-end">
                        {error && (
                          <span className="text-xs text-red-500 mr-1 max-w-32 truncate">{error}</span>
                        )}
                        <button
                          onClick={() => handleSave(dateStr)}
                          disabled={saving}
                          className="px-2 py-1 bg-blue-600 text-white text-xs rounded disabled:bg-blue-300 hover:bg-blue-700 transition-colors"
                        >
                          {saving ? '...' : '保存'}
                        </button>
                        <button
                          onClick={() => { setEditingDate(null); setError('') }}
                          className="px-2 py-1 border border-gray-300 text-gray-600 text-xs rounded hover:bg-gray-50 transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    ) : !isWeekend && !isLocked ? (
                      <button
                        onClick={() => startEdit(dateStr)}
                        className="px-2 py-1 border border-gray-200 text-gray-400 text-xs rounded hover:border-blue-300 hover:text-blue-600 transition-colors"
                      >
                        編集
                      </button>
                    ) : isLocked ? (
                      <span className="text-xs text-gray-300">締済</span>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
