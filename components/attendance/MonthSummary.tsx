interface MonthSummaryProps {
  totalDays: number
  totalMinutes: number
  overtimeMinutes: number
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

export function MonthSummary({ totalDays, totalMinutes, overtimeMinutes }: MonthSummaryProps) {
  return (
    <div className="flex gap-4 bg-gray-50 rounded-xl px-4 py-3 text-sm">
      <div className="text-center">
        <p className="text-xs text-gray-400 mb-0.5">出勤日数</p>
        <p className="font-bold text-gray-800">{totalDays}<span className="text-xs font-normal text-gray-500 ml-0.5">日</span></p>
      </div>
      <div className="w-px bg-gray-200" />
      <div className="text-center">
        <p className="text-xs text-gray-400 mb-0.5">総就業時間</p>
        <p className="font-bold text-gray-800">{formatMinutes(totalMinutes)}</p>
      </div>
      <div className="w-px bg-gray-200" />
      <div className="text-center">
        <p className="text-xs text-gray-400 mb-0.5">残業時間</p>
        <p className={`font-bold ${overtimeMinutes > 45 * 60 ? 'text-red-500' : overtimeMinutes > 36 * 60 ? 'text-amber-500' : 'text-gray-800'}`}>
          {formatMinutes(overtimeMinutes)}
        </p>
      </div>
    </div>
  )
}
