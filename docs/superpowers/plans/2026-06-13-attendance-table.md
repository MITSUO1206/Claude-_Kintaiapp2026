# 勤怠Excel表 + 管理者社員詳細 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 社員ダッシュボードをカレンダーからExcel風月次一覧表に刷新し、管理者が社員名クリックで個人の月次勤怠を確認・編集できる詳細ページを追加する。

**Architecture:** 共通の `AttendanceTable` クライアントコンポーネントを作成し、`/dashboard`（社員用）と `/admin/attendance/[userId]`（管理者用）の両方で使い回す。管理者が任意社員のレコードを作成・更新できる新APIエンドポイントを追加する。

**Tech Stack:** Next.js 16 App Router, Supabase (withCompany), TypeScript, Tailwind CSS

---

## ファイル構成

| 操作 | パス | 役割 |
|------|------|------|
| 新規作成 | `app/api/admin/attendance/[userId]/record/route.ts` | 管理者が任意社員のレコードをupsert |
| 新規作成 | `components/attendance/AttendanceTable.tsx` | Excel風月次勤怠テーブル（共通） |
| 修正 | `components/attendance/UnifiedDashboard.tsx` | AttendanceTable を使うよう置き換え |
| 新規作成 | `app/admin/attendance/[userId]/page.tsx` | 管理者用社員別勤怠詳細ページ |
| 修正 | `app/admin/page.tsx` | 社員名を詳細ページへのリンクに変更 |

---

## Task 1: 管理者用レコードUpsert API

**Files:**
- Create: `app/api/admin/attendance/[userId]/record/route.ts`

**背景:**
- 既存の `PATCH /api/admin/attendance/[id]` はレコードID必須で更新のみ
- 管理者が空き日（レコード未存在）に打刻を入れるためにupsert APIが必要
- 社員用 `PUT /api/attendance/record` と同じ仕様で、対象userId を URL から受け取る

- [ ] **Step 1: ファイルを作成する**

```typescript
// app/api/admin/attendance/[userId]/record/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { AttendanceRecord, ApiError } from '@/lib/types'

function toJSTTimestamp(date: string, time: string): string {
  return `${date}T${time}:00+09:00`
}

function isValidTime(t: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(t)) return false
  const [h, m] = t.split(':').map(Number)
  return h >= 0 && h <= 23 && m >= 0 && m <= 59
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }
    const { userId } = await params
    const body = await request.json() as {
      work_date: string
      clock_in: string | null
      clock_out: string | null
      break_minutes: number
      work_location: string | null
    }

    const { work_date, clock_in, clock_out, break_minutes, work_location } = body

    if (!work_date || !/^\d{4}-\d{2}-\d{2}$/.test(work_date)) {
      return NextResponse.json<ApiError>({ error: '日付が不正です' }, { status: 400 })
    }
    if (clock_in && !isValidTime(clock_in)) {
      return NextResponse.json<ApiError>({ error: '出勤時刻の形式が不正です (HH:MM)' }, { status: 400 })
    }
    if (clock_out && !isValidTime(clock_out)) {
      return NextResponse.json<ApiError>({ error: '退勤時刻の形式が不正です (HH:MM)' }, { status: 400 })
    }
    if (typeof break_minutes !== 'number' || break_minutes < 0) {
      return NextResponse.json<ApiError>({ error: '休憩時間が不正です' }, { status: 400 })
    }

    const db = withCompany(payload.company_id)

    // 対象社員が同一テナントか確認
    const { data: userCheck } = await db.select('users', 'id').eq('id', userId).single()
    if (!userCheck) {
      return NextResponse.json<ApiError>({ error: '社員が見つかりません' }, { status: 404 })
    }

    let actualMinutes: number | null = null
    let overtimeMinutes: number | null = null

    if (clock_in && clock_out) {
      const inMs  = new Date(toJSTTimestamp(work_date, clock_in)).getTime()
      const outMs = new Date(toJSTTimestamp(work_date, clock_out)).getTime()
      if (outMs <= inMs) {
        return NextResponse.json<ApiError>({ error: '退勤時刻は出勤時刻より後にしてください' }, { status: 400 })
      }
      actualMinutes = Math.max(0, Math.floor((outMs - inMs) / 60000) - break_minutes)
      const { data: wr } = await db.select('work_rules', 'work_hours_per_day').single()
      type WR = { work_hours_per_day: number }
      const scheduledMin = Math.round(((wr as unknown as WR | null)?.work_hours_per_day ?? 8) * 60)
      overtimeMinutes = Math.max(0, actualMinutes - scheduledMin)
    }

    const { data: existing } = await db
      .select('attendance_records', 'id, is_locked')
      .eq('user_id', userId)
      .eq('work_date', work_date)
      .single()

    type ExRow = { id: string; is_locked: boolean }
    const ex = existing as unknown as ExRow | null

    const clockInISO  = clock_in  ? toJSTTimestamp(work_date, clock_in)  : null
    const clockOutISO = clock_out ? toJSTTimestamp(work_date, clock_out) : null

    let record: AttendanceRecord

    if (ex) {
      const { data, error } = await db
        .update('attendance_records', {
          clock_in: clockInISO, clock_out: clockOutISO,
          break_minutes, actual_minutes: actualMinutes,
          overtime_minutes: overtimeMinutes,
          work_location: work_location ?? null, status: 'present',
        })
        .eq('id', ex.id)
        .select()
        .single()
      if (error) return NextResponse.json<ApiError>({ error: '更新に失敗しました' }, { status: 500 })
      record = data as unknown as AttendanceRecord
    } else {
      const { data, error } = await db.insert('attendance_records', {
        user_id: userId, work_date,
        clock_in: clockInISO, clock_out: clockOutISO,
        break_minutes, actual_minutes: actualMinutes,
        overtime_minutes: overtimeMinutes,
        night_minutes: 0, holiday_minutes: 0,
        is_holiday_work: false, is_locked: false,
        work_location: work_location ?? null, status: 'present',
      })
      if (error) return NextResponse.json<ApiError>({ error: '保存に失敗しました' }, { status: 500 })
      const inserted = Array.isArray(data) ? data[0] : data
      record = inserted as unknown as AttendanceRecord
    }

    void writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'admin_attendance_record_save',
      table_name: 'attendance_records',
      record_id: record.id,
      new_values: { target_user_id: userId, work_date, clock_in, clock_out, break_minutes },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ record })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
```

- [ ] **Step 2: TypeScriptエラーを確認する**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 3: コミットする**

```bash
git add app/api/admin/attendance/[userId]/record/route.ts
git commit -m "feat: add admin attendance upsert API for specific user"
```

---

## Task 2: AttendanceTable コンポーネント

**Files:**
- Create: `components/attendance/AttendanceTable.tsx`

**仕様:**
- 1行 = 1日（月の全日を表示）
- 列: 日付, 曜, 区分, 就業場所, 出勤, 退勤, 休憩(分), 実働, 操作
- 「編集」クリック → その行がインライン編集モード（入力欄に変わる）
- 「保存」クリック → API送信 → 行を更新
- 「取消」クリック → 元の表示に戻す
- `isAdmin=false`（社員）: `PUT /api/attendance/record` を呼ぶ
- `isAdmin=true`（管理者）: `PUT /api/admin/attendance/{userId}/record` を呼ぶ
- 土曜: 青色, 日曜: 赤色
- 締め済み行: グレーアウト、編集不可（ただし isAdmin=true なら編集可）
- 実働時間 = 自動計算（クライアント側でも表示計算）

- [ ] **Step 1: ファイルを作成する**

```typescript
// components/attendance/AttendanceTable.tsx
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

function isoToHHMM(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function calcActualMinutes(clockIn: string, clockOut: string, breakMin: number): number {
  const inMs  = new Date(clockIn).getTime()
  const outMs = new Date(clockOut).getTime()
  return Math.max(0, Math.floor((outMs - inMs) / 60000) - breakMin)
}

function minutesToHHMM(min: number | null): string {
  if (min === null || min === 0) return '—'
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
  workLocation: WorkLocation | null
}

export function AttendanceTable({
  records, year, month, userId, isAdmin = false, onSaved, onMonthChange,
}: AttendanceTableProps) {
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({ clockIn: '', clockOut: '', breakMinutes: 60, workLocation: null })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const recordMap = new Map(records.map((r) => [r.work_date, r]))

  // 月の全日を生成
  const lastDay = new Date(year, month, 0).getDate()
  const days = Array.from({ length: lastDay }, (_, i) => i + 1)
  const DOW = ['日', '月', '火', '水', '木', '金', '土']

  function startEdit(dateStr: string) {
    const rec = recordMap.get(dateStr)
    setEditState({
      clockIn:      isoToHHMM(rec?.clock_in ?? null),
      clockOut:     isoToHHMM(rec?.clock_out ?? null),
      breakMinutes: rec?.break_minutes ?? 60,
      workLocation: rec?.work_location ?? null,
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
          work_location: editState.workLocation,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '保存に失敗しました')
        return
      }
      onSaved(data.record as AttendanceRecord)
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
    <div className="flex flex-col h-full">
      {/* 月ナビゲーション */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 flex-shrink-0">
        <button onClick={prevMonth} className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
          ‹ 前の月
        </button>
        <span className="text-base font-bold text-gray-800">{year}年{month}月</span>
        <button onClick={nextMonth} className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
          次の月 ›
        </button>
      </div>

      {/* テーブル */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr className="border-b-2 border-gray-200">
              <th className="px-3 py-2 text-left whitespace-nowrap text-xs font-medium text-gray-500">日付</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-500">曜</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">区分</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">就業場所</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">出勤</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">退勤</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">休憩</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">実働</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500"></th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const dateStr = `${year}-${pad(month)}-${pad(day)}`
              const rec = recordMap.get(dateStr)
              const dow = new Date(dateStr + 'T00:00:00').getDay()
              const isSat = dow === 6
              const isSun = dow === 0
              const isEditing = editingDate === dateStr
              const isLocked = (rec?.is_locked ?? false) && !isAdmin
              const isWeekend = isSat || isSun

              const actualMin = rec?.actual_minutes
                ?? (isEditing && editState.clockIn && editState.clockOut
                  ? calcActualMinutes(
                      `${dateStr}T${editState.clockIn}:00+09:00`,
                      `${dateStr}T${editState.clockOut}:00+09:00`,
                      editState.breakMinutes
                    )
                  : null)

              const rowBg = isEditing
                ? 'bg-blue-50'
                : isWeekend
                ? 'bg-gray-50/60'
                : ''
              const textDay = isSat ? 'text-blue-500' : isSun ? 'text-red-500' : 'text-gray-700'

              return (
                <tr key={dateStr} className={`border-b border-gray-100 ${rowBg} ${isEditing ? 'outline outline-2 outline-blue-300 outline-offset-[-1px]' : ''}`}>
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
                        rec.status === 'present' ? 'bg-green-100 text-green-700' :
                        rec.status === 'leave_paid' ? 'bg-blue-100 text-blue-700' :
                        rec.status === 'absent' ? 'bg-red-100 text-red-700' :
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
                        value={editState.workLocation ?? ''}
                        onChange={(e) => setEditState((s) => ({ ...s, workLocation: (e.target.value || null) as WorkLocation | null }))}
                        className="border border-blue-300 rounded px-1 py-0.5 text-xs w-20"
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
                      <span className="text-sm text-gray-700">{isoToHHMM(rec?.clock_in ?? null) || '—'}</span>
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
                      <span className="text-sm text-gray-700">{isoToHHMM(rec?.clock_out ?? null) || '—'}</span>
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
                        onChange={(e) => setEditState((s) => ({ ...s, breakMinutes: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="border border-blue-300 rounded px-1 py-0.5 text-xs w-14 text-right"
                      />
                    ) : (
                      <span className="text-xs text-gray-500">{rec?.break_minutes != null ? `${rec.break_minutes}分` : '—'}</span>
                    )}
                  </td>

                  {/* 実働 */}
                  <td className="px-3 py-1.5 text-center">
                    <span className="text-xs text-gray-700">{minutesToHHMM(actualMin ?? null)}</span>
                  </td>

                  {/* 操作 */}
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex gap-1 justify-end">
                        {error && editingDate === dateStr && (
                          <span className="text-xs text-red-500 mr-1">{error}</span>
                        )}
                        <button
                          onClick={() => handleSave(dateStr)}
                          disabled={saving}
                          className="px-2 py-1 bg-blue-600 text-white text-xs rounded disabled:bg-blue-300"
                        >
                          {saving ? '...' : '保存'}
                        </button>
                        <button
                          onClick={() => { setEditingDate(null); setError('') }}
                          className="px-2 py-1 border border-gray-300 text-gray-600 text-xs rounded"
                        >
                          取消
                        </button>
                      </div>
                    ) : !isWeekend && !isLocked ? (
                      <button
                        onClick={() => startEdit(dateStr)}
                        className="px-2 py-1 border border-gray-200 text-gray-400 text-xs rounded hover:border-blue-300 hover:text-blue-600"
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
```

- [ ] **Step 2: TypeScriptエラーを確認する**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 3: コミットする**

```bash
git add components/attendance/AttendanceTable.tsx
git commit -m "feat: add AttendanceTable Excel-style monthly component"
```

---

## Task 3: UnifiedDashboard をリニューアル

**Files:**
- Modify: `components/attendance/UnifiedDashboard.tsx`

**変更内容:**
- 左パネル（DayEntryForm）を削除
- MonthCalendar を削除
- AttendanceTable を全幅で表示
- MonthSummary と ApprovalBanner は上部に残す

- [ ] **Step 1: ファイルを丸ごと書き換える**

```typescript
// components/attendance/UnifiedDashboard.tsx
'use client'

import { useState, useCallback, useMemo } from 'react'
import { AttendanceTable } from './AttendanceTable'
import { MonthSummary } from './MonthSummary'
import { ApprovalBanner } from './ApprovalBanner'
import type { AttendanceRecord, MonthlyApproval } from '@/lib/types'

interface UnifiedDashboardProps {
  userName: string
  userId: string
  initialMonthRecords: AttendanceRecord[]
  initialApproval: MonthlyApproval | null
  initialYear: number
  initialMonth: number
}

export function UnifiedDashboard({
  userName, userId,
  initialMonthRecords, initialApproval,
  initialYear, initialMonth,
}: UnifiedDashboardProps) {
  const [monthRecords, setMonthRecords] = useState(initialMonthRecords)
  const [approval,     setApproval]     = useState<MonthlyApproval | null>(initialApproval)
  const [year,         setYear]         = useState(initialYear)
  const [month,        setMonth]        = useState(initialMonth)
  const [loading,      setLoading]      = useState(false)

  const summary = useMemo(() => ({
    total_days:       monthRecords.filter((r) => r.status === 'present').length,
    total_minutes:    monthRecords.reduce((s, r) => s + (r.actual_minutes ?? 0), 0),
    overtime_minutes: monthRecords.reduce((s, r) => s + (r.overtime_minutes ?? 0), 0),
  }), [monthRecords])

  const handleMonthChange = useCallback(async (newYear: number, newMonth: number) => {
    setYear(newYear)
    setMonth(newMonth)
    setLoading(true)
    try {
      const [recordsRes, approvalRes] = await Promise.all([
        fetch(`/api/attendance?year=${newYear}&month=${newMonth}`),
        fetch(`/api/approvals?year=${newYear}&month=${newMonth}`),
      ])
      if (recordsRes.ok) {
        const data = await recordsRes.json()
        setMonthRecords(data.records ?? [])
      }
      if (approvalRes.ok) {
        const data = await approvalRes.json()
        setApproval(data.approval ?? null)
      } else {
        setApproval(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSaved = useCallback((record: AttendanceRecord) => {
    setMonthRecords((prev) => {
      const idx = prev.findIndex((r) => r.work_date === record.work_date)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = record
        return next
      }
      return [...prev, record]
    })
  }, [])

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* 社員サイドバー */}
      <aside className="w-44 min-h-screen bg-slate-800 flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-slate-700">
          <span className="text-white font-bold text-base">KintaiApp</span>
          <p className="text-slate-400 text-xs mt-0.5">勤怠・給与管理</p>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-1">
          {[
            { href: '/dashboard', label: 'ダッシュボード' },
            { href: '/requests', label: '申請' },
            { href: '/payslips', label: '給与明細' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-slate-700">
          <p className="text-slate-300 text-xs truncate mb-2">{userName}</p>
          <a href="/api/auth/logout" className="text-slate-400 hover:text-slate-200 text-xs">ログアウト</a>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 flex flex-col min-h-0">
        {/* サマリーバー */}
        <div className="px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
          <MonthSummary
            totalDays={summary.total_days}
            totalMinutes={summary.total_minutes}
            overtimeMinutes={summary.overtime_minutes}
          />
        </div>

        {/* テーブル */}
        <div className={`flex-1 bg-white overflow-hidden ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
          <AttendanceTable
            records={monthRecords}
            year={year}
            month={month}
            userId={userId}
            isAdmin={false}
            onSaved={handleSaved}
            onMonthChange={handleMonthChange}
          />
        </div>

        {/* 締め承認バナー */}
        <div className="px-6 py-3 border-t border-gray-100 bg-white flex-shrink-0">
          <ApprovalBanner
            year={year}
            month={month}
            approval={approval}
            onSubmitted={setApproval}
          />
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: `app/dashboard/page.tsx` の props を更新する**

`initialDate` と `initialRecord` の渡し方が変わったので合わせる。

`app/dashboard/page.tsx` を以下に書き換える:

```typescript
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { UnifiedDashboard } from '@/components/attendance/UnifiedDashboard'
import type { AttendanceRecord, MonthlyApproval } from '@/lib/types'

function getTodayJST(): string {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return jst.toISOString().split('T')[0]
}

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')

  const db = withCompany(payload.company_id)
  const today = getTodayJST()
  const [y, m] = today.split('-')
  const year  = parseInt(y)
  const month = parseInt(m)
  const monthFrom = `${y}-${m}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const monthTo = `${y}-${m}-${String(lastDay).padStart(2, '0')}`

  const [monthRes, approvalRes] = await Promise.all([
    db.select('attendance_records')
      .eq('user_id', payload.user_id)
      .gte('work_date', monthFrom)
      .lte('work_date', monthTo)
      .order('work_date', { ascending: true }),
    db.select('monthly_approvals')
      .eq('user_id', payload.user_id)
      .eq('year', year)
      .eq('month', month)
      .single(),
  ])

  const monthRecords = ((monthRes.data ?? []) as unknown as AttendanceRecord[])
  const approval     = (approvalRes.data as unknown as MonthlyApproval | null)

  return (
    <UnifiedDashboard
      userName={payload.name}
      userId={payload.user_id}
      initialMonthRecords={monthRecords}
      initialApproval={approval}
      initialYear={year}
      initialMonth={month}
    />
  )
}
```

- [ ] **Step 3: ビルドを確認する**

```bash
npm run build 2>&1 | tail -10
```

Expected: エラーなし

- [ ] **Step 4: コミットする**

```bash
git add components/attendance/UnifiedDashboard.tsx app/dashboard/page.tsx
git commit -m "feat: replace calendar with AttendanceTable in employee dashboard"
```

---

## Task 4: 管理者用社員別勤怠詳細ページ

**Files:**
- Create: `app/admin/attendance/[userId]/page.tsx`

- [ ] **Step 1: ページを作成する**

```typescript
// app/admin/attendance/[userId]/page.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { AdminSidebar } from '@/components/AdminSidebar'
import { AdminAttendanceClient } from '@/components/admin/AdminAttendanceClient'
import type { AttendanceRecord } from '@/lib/types'

function getTodayJST(): string {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return jst.toISOString().split('T')[0]
}

type UserRow = { id: string; employee_code: string; name: string }

export default async function AdminAttendancePage(
  { params }: { params: Promise<{ userId: string }> }
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin' && payload.role !== 'manager') redirect('/dashboard')

  const { userId } = await params
  const db = withCompany(payload.company_id)
  const today = getTodayJST()
  const [y, m] = today.split('-')
  const year  = parseInt(y)
  const month = parseInt(m)
  const monthFrom = `${y}-${m}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const monthTo = `${y}-${m}-${String(lastDay).padStart(2, '0')}`

  const [userRes, recordsRes] = await Promise.all([
    db.select('users', 'id, employee_code, name').eq('id', userId).single(),
    db.select('attendance_records', 'id, user_id, company_id, work_date, clock_in, clock_out, break_minutes, actual_minutes, overtime_minutes, night_minutes, holiday_minutes, is_holiday_work, work_location, is_locked, status, created_at')
      .eq('user_id', userId)
      .gte('work_date', monthFrom)
      .lte('work_date', monthTo)
      .order('work_date', { ascending: true }),
  ])

  const user = userRes.data as unknown as UserRow | null
  if (!user) redirect('/admin')

  const records = ((recordsRes.data ?? []) as unknown as AttendanceRecord[])

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={payload.name} />
      <div className="flex-1 flex flex-col min-h-0">
        <AdminAttendanceClient
          user={user}
          initialRecords={records}
          initialYear={year}
          initialMonth={month}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `AdminAttendanceClient` コンポーネントを作成する**

```typescript
// components/admin/AdminAttendanceClient.tsx
'use client'

import { useState, useCallback } from 'react'
import { AttendanceTable } from '@/components/attendance/AttendanceTable'
import type { AttendanceRecord } from '@/lib/types'

interface AdminAttendanceClientProps {
  user: { id: string; employee_code: string; name: string }
  initialRecords: AttendanceRecord[]
  initialYear: number
  initialMonth: number
}

export function AdminAttendanceClient({
  user, initialRecords, initialYear, initialMonth,
}: AdminAttendanceClientProps) {
  const [records, setRecords] = useState(initialRecords)
  const [year,    setYear]    = useState(initialYear)
  const [month,   setMonth]   = useState(initialMonth)
  const [loading, setLoading] = useState(false)

  const handleMonthChange = useCallback(async (newYear: number, newMonth: number) => {
    setYear(newYear)
    setMonth(newMonth)
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/attendance/monthly?user_id=${user.id}&year=${newYear}&month=${newMonth}`
      )
      if (res.ok) {
        const data = await res.json()
        setRecords(data.records ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [user.id])

  const handleSaved = useCallback((record: AttendanceRecord) => {
    setRecords((prev) => {
      const idx = prev.findIndex((r) => r.work_date === record.work_date)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = record
        return next
      }
      return [...prev, record]
    })
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← 出退勤状況
          </a>
          <span className="text-gray-300">/</span>
          <h1 className="text-lg font-bold text-gray-800">
            {user.name}
            <span className="text-sm font-normal text-gray-400 ml-2">{user.employee_code}</span>
          </h1>
        </div>
      </div>

      {/* テーブル */}
      <div className={`flex-1 bg-white overflow-hidden ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
        <AttendanceTable
          records={records}
          year={year}
          month={month}
          userId={user.id}
          isAdmin={true}
          onSaved={handleSaved}
          onMonthChange={handleMonthChange}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScriptエラーを確認する**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 4: コミットする**

```bash
git add app/admin/attendance/[userId]/page.tsx components/admin/AdminAttendanceClient.tsx
git commit -m "feat: add admin employee attendance detail page"
```

---

## Task 5: 管理者一覧から社員名リンク追加

**Files:**
- Modify: `app/admin/page.tsx:141-154`

- [ ] **Step 1: 社員名のセルをリンクに変更する**

`app/admin/page.tsx` の社員一覧テーブルの氏名セル部分を修正する:

変更前:
```tsx
<td className="px-3 py-2 font-medium">{u.name}</td>
```

変更後:
```tsx
<td className="px-3 py-2 font-medium">
  <a
    href={`/admin/attendance/${u.id}`}
    className="text-blue-600 hover:text-blue-800 hover:underline"
  >
    {u.name}
  </a>
</td>
```

- [ ] **Step 2: ビルドを確認する**

```bash
npm run build 2>&1 | grep -E "error|employee|attendance" | head -20
```

Expected: `/admin/attendance/[userId]` が routes に表示、エラーなし

- [ ] **Step 3: コミット＆プッシュする**

```bash
git add app/admin/page.tsx
git commit -m "feat: link employee names to attendance detail page in admin"
git push origin main
```

- [ ] **Step 4: Vercelにデプロイする**

```bash
vercel --prod
```

Expected: `✓ Aliased https://kintai-app-two-pink.vercel.app`

---

## 動作確認チェックリスト

- [ ] `/dashboard` でExcel形式の月次一覧表が表示される
- [ ] カレンダーセルの表示が消えて表形式に変わっている
- [ ] 「編集」クリックで行がインライン入力モードになる
- [ ] 出勤/退勤を入力して「保存」するとその行が更新される
- [ ] 前の月/次の月で切り替えができる
- [ ] `/admin` の社員名をクリックすると `/admin/attendance/[userId]` に遷移する
- [ ] 管理者画面でも同じテーブルが表示され、編集・保存できる
