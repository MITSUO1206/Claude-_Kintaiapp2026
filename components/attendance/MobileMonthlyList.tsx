'use client'

import type { AttendanceRecord } from '@/lib/types'

interface MobileMonthlyListProps {
  records: AttendanceRecord[]
  year: number
  month: number
}

function isoToHHMM(iso: string | null | undefined): string {
  if (!iso) return '—'
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

export function MobileMonthlyList({ records, year, month }: MobileMonthlyListProps) {
  const recordMap = new Map(records.map((r) => [r.work_date, r]))
  const lastDay = new Date(year, month, 0).getDate()
  const days = Array.from({ length: lastDay }, (_, i) => i + 1)
  const DOW = ['日', '月', '火', '水', '木', '金', '土']

  return (
    <div className="overflow-x-auto mt-2 border border-gray-200 rounded-xl">
      <table className="text-xs border-collapse w-max min-w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">日付</th>
            <th className="px-2 py-2 text-center font-medium text-gray-500">曜</th>
            <th className="px-3 py-2 text-center font-medium text-gray-500 whitespace-nowrap">区分</th>
            <th className="px-3 py-2 text-center font-medium text-gray-500 whitespace-nowrap">出勤</th>
            <th className="px-3 py-2 text-center font-medium text-gray-500 whitespace-nowrap">退勤</th>
            <th className="px-3 py-2 text-center font-medium text-gray-500 whitespace-nowrap">休憩</th>
            <th className="px-3 py-2 text-center font-medium text-gray-500 whitespace-nowrap">実働</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const dateStr = `${year}-${pad(month)}-${pad(day)}`
            const rec = recordMap.get(dateStr)
            const dow = new Date(`${dateStr}T00:00:00`).getDay()
            const isSat = dow === 6
            const isSun = dow === 0
            const textColor = isSat ? 'text-blue-500' : isSun ? 'text-red-500' : 'text-gray-700'
            const bgColor = isSat || isSun ? 'bg-gray-50' : 'bg-white'

            return (
              <tr key={dateStr} className={`border-b border-gray-100 ${bgColor}`}>
                <td className={`px-3 py-2 font-medium whitespace-nowrap ${textColor}`}>
                  {month}/{day}
                </td>
                <td className={`px-2 py-2 text-center ${textColor}`}>{DOW[dow]}</td>
                <td className="px-3 py-2 text-center text-gray-600 whitespace-nowrap">
                  {rec?.shift_type ?? '—'}
                </td>
                <td className="px-3 py-2 text-center text-gray-700 whitespace-nowrap">
                  {isoToHHMM(rec?.clock_in)}
                </td>
                <td className="px-3 py-2 text-center text-gray-700 whitespace-nowrap">
                  {isoToHHMM(rec?.clock_out)}
                </td>
                <td className="px-3 py-2 text-center text-gray-500 whitespace-nowrap">
                  {rec?.break_minutes != null ? `${rec.break_minutes}分` : '—'}
                </td>
                <td className="px-3 py-2 text-center text-gray-700 whitespace-nowrap">
                  {minutesToHHMM(rec?.actual_minutes)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
