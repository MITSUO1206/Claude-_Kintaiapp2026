'use client'

import { useState } from 'react'

const NOW = new Date()

export function AttendanceCsvExport() {
  const [year,    setYear]    = useState(NOW.getFullYear())
  const [month,   setMonth]   = useState(NOW.getMonth() + 1)
  const [loading, setLoading] = useState<'summary' | 'detail' | null>(null)
  const [error,   setError]   = useState('')

  const years  = Array.from({ length: 5 }, (_, i) => NOW.getFullYear() - 2 + i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  async function handleExport(type: 'summary' | 'detail') {
    setLoading(type)
    setError('')
    try {
      const mm  = String(month).padStart(2, '0')
      const res = await fetch(
        `/api/admin/attendance/export?year=${year}&month=${mm}&type=${type}`
      )
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? 'エクスポートに失敗しました')
        return
      }
      const blob     = await res.blob()
      const url      = URL.createObjectURL(blob)
      const a        = document.createElement('a')
      a.href         = url
      a.download     = type === 'detail'
        ? `kintai_detail_${year}${mm}.csv`
        : `kintai_${year}${mm}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">勤怠データ CSVエクスポート</h2>

      <div className="flex items-center gap-3 flex-wrap mb-4">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}年</option>
          ))}
        </select>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {months.map((m) => (
            <option key={m} value={m}>{m}月</option>
          ))}
        </select>
      </div>

      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => handleExport('summary')}
          disabled={loading !== null}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading === 'summary' ? '処理中...' : '月次サマリ CSV'}
        </button>
        <button
          onClick={() => handleExport('detail')}
          disabled={loading !== null}
          className="bg-slate-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {loading === 'detail' ? '処理中...' : '日別全データ CSV'}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-500">{error}</p>
      )}

      <div className="mt-3 space-y-1 text-xs text-gray-400">
        <p>月次サマリ: 社員ごとの出勤日数・実働時間・残業時間など合計値</p>
        <p>日別全データ: その月の全打刻レコードを1行1日で出力（出退勤時刻・区分・就業場所含む）</p>
      </div>
    </div>
  )
}
