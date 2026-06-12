'use client'

import type { AttendanceRecord } from '@/lib/types'

interface MonthCalendarProps {
  year: number
  month: number
  records: AttendanceRecord[]
  selectedDate: string
  onSelectDate: (date: string) => void
  onMonthChange: (year: number, month: number) => void
}

function isoToHHMM(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function MonthCalendar({
  year, month, records, selectedDate, onSelectDate, onMonthChange,
}: MonthCalendarProps) {
  const recordMap = new Map(records.map((r) => [r.work_date, r]))

  function prevMonth() {
    if (month === 1) onMonthChange(year - 1, 12)
    else onMonthChange(year, month - 1)
  }

  function nextMonth() {
    if (month === 12) onMonthChange(year + 1, 1)
    else onMonthChange(year, month + 1)
  }

  // 月曜始まりのカレンダー日付配列を生成
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay() // 0=日
  const firstDayMon = (firstDayOfWeek + 6) % 7 // 月曜=0
  const lastDate = new Date(year, month, 0).getDate()

  const cells: (number | null)[] = [
    ...Array(firstDayMon).fill(null),
    ...Array.from({ length: lastDate }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const DOW = ['月', '火', '水', '木', '金', '土', '日']

  return (
    <div>
      {/* 月ナビゲーション */}
      <div className="flex items-center justify-between mb-3">
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

      {/* カレンダーグリッド */}
      <div className="grid grid-cols-7 gap-0.5">
        {/* ヘッダー行 */}
        {DOW.map((d, i) => (
          <div
            key={d}
            className={`text-center text-xs font-medium py-1.5 ${
              i === 5 ? 'text-blue-500' : i === 6 ? 'text-red-500' : 'text-gray-500'
            }`}
          >
            {d}
          </div>
        ))}

        {/* 日付セル */}
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} className="h-16" />

          const dateStr = `${year}-${pad(month)}-${pad(day)}`
          const rec = recordMap.get(dateStr)
          const isSelected = dateStr === selectedDate
          const colIdx = idx % 7 // 0=月...5=土,6=日
          const isSat = colIdx === 5
          const isSun = colIdx === 6

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={`h-16 rounded-lg p-1 flex flex-col items-start text-left transition-all border ${
                isSelected
                  ? 'border-blue-400 bg-blue-50 shadow-sm'
                  : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span className={`text-xs font-medium mb-0.5 ${
                isSelected ? 'text-blue-600' :
                isSat ? 'text-blue-500' :
                isSun ? 'text-red-500' :
                'text-gray-700'
              }`}>
                {day}
              </span>
              {rec?.clock_in && (
                <span className="text-[10px] text-gray-500 leading-tight">{isoToHHMM(rec.clock_in)}</span>
              )}
              {rec?.clock_out && (
                <span className="text-[10px] text-gray-400 leading-tight">{isoToHHMM(rec.clock_out)}</span>
              )}
              {rec && !rec.clock_in && (
                <span className="text-[10px] text-amber-400 leading-tight">未入力</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
