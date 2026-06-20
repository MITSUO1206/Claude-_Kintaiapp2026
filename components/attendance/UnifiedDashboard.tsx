'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { AttendanceTable } from './AttendanceTable'
import { MonthSummary } from './MonthSummary'
import { ApprovalBanner } from './ApprovalBanner'
import { MobileDayView } from './MobileDayView'
import { ComplianceBar } from './ComplianceBar'
import type { AttendanceRecord, MonthlyApproval, ComplianceSummary } from '@/lib/types'

interface UnifiedDashboardProps {
  userName: string
  userId: string
  initialMonthRecords: AttendanceRecord[]
  initialApproval: MonthlyApproval | null
  initialYear: number
  initialMonth: number
}

export function UnifiedDashboard({
  userName,
  userId,
  initialMonthRecords,
  initialApproval,
  initialYear,
  initialMonth,
}: UnifiedDashboardProps) {
  const [monthRecords, setMonthRecords] = useState(initialMonthRecords)
  const [approval,     setApproval]     = useState<MonthlyApproval | null>(initialApproval)
  const [year,         setYear]         = useState(initialYear)
  const [month,        setMonth]        = useState(initialMonth)
  const [loading,          setLoading]          = useState(false)
  const [complianceData,    setComplianceData]    = useState<ComplianceSummary | null>(null)
  const [complianceLoading, setComplianceLoading] = useState(false)

  const today = useMemo(() => {
    const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    return jst.toISOString().split('T')[0]
  }, [])

  const summary = useMemo(() => ({
    total_days:       monthRecords.filter((r) => r.status === 'present').length,
    total_minutes:    monthRecords.reduce((s, r) => s + (r.actual_minutes ?? 0), 0),
    overtime_minutes: monthRecords.reduce((s, r) => s + (r.overtime_minutes ?? 0), 0),
  }), [monthRecords])

  const handleMonthChange = useCallback(async (newYear: number, newMonth: number) => {
    setYear(newYear)
    setMonth(newMonth)
    setLoading(true)
    setComplianceLoading(true)
    try {
      const [recordsRes, approvalRes, complianceRes] = await Promise.all([
        fetch(`/api/attendance?year=${newYear}&month=${newMonth}`),
        fetch(`/api/approvals?year=${newYear}&month=${newMonth}`),
        fetch(`/api/compliance/summary?year=${newYear}&month=${newMonth}`),
      ])
      if (recordsRes.ok) {
        const data = await recordsRes.json() as { records?: AttendanceRecord[] }
        setMonthRecords(data.records ?? [])
      }
      if (approvalRes.ok) {
        const data = await approvalRes.json() as { approval?: MonthlyApproval }
        setApproval(data.approval ?? null)
      } else {
        setApproval(null)
      }
      if (complianceRes.ok) {
        const data = await complianceRes.json() as { summary?: ComplianceSummary }
        setComplianceData(data.summary ?? null)
      }
    } finally {
      setLoading(false)
      setComplianceLoading(false)
    }
  }, [])

  useEffect(() => {
    setComplianceLoading(true)
    fetch(`/api/compliance/summary?year=${year}&month=${month}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: { summary?: ComplianceSummary } | null) => {
        setComplianceData(data?.summary ?? null)
      })
      .catch(() => {})
      .finally(() => setComplianceLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <>
      {/* ── スマホ表示（md未満） ── */}
      <div className="md:hidden">
        <MobileDayView
          userName={userName}
          monthRecords={monthRecords}
          year={year}
          month={month}
          initialDate={today}
          onSaved={handleSaved}
          onMonthChange={handleMonthChange}
          complianceData={complianceData}
          complianceLoading={complianceLoading}
        />
      </div>

      {/* ── PC表示（md以上） ── */}
      <div className="hidden md:flex min-h-screen bg-gray-50">
        {/* サイドバー */}
        <aside className="w-44 min-h-screen bg-slate-800 flex flex-col flex-shrink-0">
          <div className="px-4 py-4 border-b border-slate-700">
            <span className="text-white font-bold text-base">KintaiApp</span>
            <p className="text-slate-400 text-xs mt-0.5">勤怠・給与管理</p>
          </div>
          <nav className="flex-1 px-2 py-3 space-y-1">
            {[
              { href: '/dashboard', label: '勤怠' },
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
            <a href="/api/auth/logout" className="text-slate-400 hover:text-slate-200 text-xs transition-colors">
              ログアウト
            </a>
          </div>
        </aside>

        {/* メインコンテンツ */}
        <main className="flex-1 flex flex-col min-h-screen">
          {/* サマリーバー */}
          <div className="px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0 space-y-2">
            <MonthSummary
              totalDays={summary.total_days}
              totalMinutes={summary.total_minutes}
              overtimeMinutes={summary.overtime_minutes}
            />
            <ComplianceBar data={complianceData} loading={complianceLoading} />
          </div>

          {/* 勤怠テーブル */}
          <div className={`flex-1 bg-white ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
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
    </>
  )
}
