'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface AttendanceSearchBarProps {
  defaultYear: number
  defaultMonth: number
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

const STATUS_OPTIONS = [
  { value: '', label: 'すべて' },
  { value: 'present', label: '出勤' },
  { value: 'late', label: '遅刻' },
  { value: 'absent', label: '欠勤' },
  { value: 'leave_paid', label: '有給' },
  { value: 'leave_special', label: '特休' },
]

export function AttendanceSearchBar({ defaultYear, defaultMonth }: AttendanceSearchBarProps) {
  const router = useRouter()
  const [year, setYear] = useState(defaultYear)
  const [month, setMonth] = useState(defaultMonth)
  const [status, setStatus] = useState('')
  const [overtime, setOvertime] = useState(false)

  function handleSearch() {
    const params = new URLSearchParams()
    params.set('year', String(year))
    params.set('month', String(month))
    if (status) params.set('status', status)
    if (overtime) params.set('overtime', 'true')
    router.push(`/attendance?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-2 items-end bg-white p-3 rounded-lg border">
      <div>
        <label className="text-xs text-gray-500 block mb-1">年</label>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border rounded px-2 py-1 text-sm"
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}年</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">月</label>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="border rounded px-2 py-1 text-sm"
        >
          {MONTHS.map((m) => (
            <option key={m} value={m}>{m}月</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">区分</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1 pb-1">
        <input
          type="checkbox"
          id="overtime"
          checked={overtime}
          onChange={(e) => setOvertime(e.target.checked)}
          className="w-4 h-4"
        />
        <label htmlFor="overtime" className="text-sm text-gray-600">残業のある日のみ</label>
      </div>
      <Button size="sm" onClick={handleSearch}>
        検索
      </Button>
    </div>
  )
}
