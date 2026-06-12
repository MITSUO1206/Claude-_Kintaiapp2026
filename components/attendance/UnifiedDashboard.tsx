'use client'

import { useState, useCallback, useEffect } from 'react'
import { DayEntryForm } from './DayEntryForm'
import { MonthCalendar } from './MonthCalendar'
import { MonthSummary } from './MonthSummary'
import { ApprovalBanner } from './ApprovalBanner'
import type { AttendanceRecord, MonthlyApproval } from '@/lib/types'

interface UnifiedDashboardProps {
  userName: string
  initialDate: string
  initialRecord: AttendanceRecord | null
  initialMonthRecords: AttendanceRecord[]
  initialSummary: {
    total_days: number
    total_minutes: number
    overtime_minutes: number
  }
  initialApproval: MonthlyApproval | null
  initialYear: number
  initialMonth: number
}

export function UnifiedDashboard({
  userName,
  initialDate,
  initialRecord,
  initialMonthRecords,
  initialSummary,
  initialApproval,
  initialYear,
  initialMonth,
}: UnifiedDashboardProps) {
  const [selectedDate,   setSelectedDate]   = useState(initialDate)
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(initialRecord)
  const [monthRecords,   setMonthRecords]   = useState(initialMonthRecords)
  const [summary,        setSummary]        = useState(initialSummary)
  const [approval,       setApproval]       = useState<MonthlyApproval | null>(initialApproval)
  const [year,           setYear]           = useState(initialYear)
  const [month,          setMonth]          = useState(initialMonth)
  const [loadingDate,    setLoadingDate]    = useState(false)
  const [loadingMonth,   setLoadingMonth]   = useState(false)

  // monthRecords が変わるたびにサマリーを再計算
  useEffect(() => {
    setSummary({
      total_days:       monthRecords.filter((r) => r.status === 'present').length,
      total_minutes:    monthRecords.reduce((s, r) => s + (r.actual_minutes ?? 0), 0),
      overtime_minutes: monthRecords.reduce((s, r) => s + (r.overtime_minutes ?? 0), 0),
    })
  }, [monthRecords])

  // 日付クリック → その日のレコードを取得してフォームに表示
  const handleSelectDate = useCallback(async (date: string) => {
    setSelectedDate(date)
    setLoadingDate(true)
    try {
      const [y, m] = date.split('-')
      const res = await fetch(`/api/attendance?year=${y}&month=${parseInt(m)}`)
      if (res.ok) {
        const data = await res.json()
        const rec = (data.records as AttendanceRecord[]).find((r) => r.work_date === date) ?? null
        setSelectedRecord(rec)
      }
    } finally {
      setLoadingDate(false)
    }
  }, [])

  // 月変更 → その月のレコードと承認状況を再取得
  const handleMonthChange = useCallback(async (newYear: number, newMonth: number) => {
    setYear(newYear)
    setMonth(newMonth)
    setLoadingMonth(true)
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
      setLoadingMonth(false)
    }
  }, [])

  // 保存後 → 月次レコードを更新（summary は useEffect が追従する）
  const handleSaved = useCallback((record: AttendanceRecord) => {
    setSelectedRecord(record)
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
      {/* 左パネル */}
      <div className="w-72 min-w-72 bg-white border-r border-gray-100 p-5 flex flex-col relative">
        {loadingDate && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center rounded-xl z-10">
            <span className="text-xs text-gray-400">読み込み中...</span>
          </div>
        )}
        <DayEntryForm
          selectedDate={selectedDate}
          record={selectedRecord}
          onSaved={handleSaved}
        />
      </div>

      {/* 右パネル */}
      <main className="flex-1 p-6 max-w-4xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-800">勤怠管理</h1>
          <p className="text-sm text-gray-400">{userName}さんの勤怠</p>
        </div>

        {/* 月次サマリー */}
        <div className="mb-4">
          <MonthSummary
            totalDays={summary.total_days}
            totalMinutes={summary.total_minutes}
            overtimeMinutes={summary.overtime_minutes}
          />
        </div>

        {/* カレンダー */}
        <div className={`bg-white rounded-2xl border border-gray-100 p-5 shadow-sm mb-4 ${loadingMonth ? 'opacity-60' : ''}`}>
          <MonthCalendar
            year={year}
            month={month}
            records={monthRecords}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            onMonthChange={handleMonthChange}
          />
        </div>

        {/* 締め承認 */}
        <ApprovalBanner
          year={year}
          month={month}
          approval={approval}
          onSubmitted={setApproval}
        />
      </main>
    </div>
  )
}
