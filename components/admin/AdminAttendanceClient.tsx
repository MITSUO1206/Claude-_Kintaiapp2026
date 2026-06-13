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
        `/api/admin/attendance/records?user_id=${user.id}&year=${newYear}&month=${newMonth}`
      )
      if (res.ok) {
        const data = await res.json() as { records?: AttendanceRecord[] }
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
    <div className="flex flex-col h-full min-h-0">
      {/* ヘッダー */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <a
            href="/admin"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
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
