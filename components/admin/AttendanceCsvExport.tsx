'use client'

import { useState } from 'react'

const NOW = new Date()

export function AttendanceCsvExport() {
  const [year,    setYear]    = useState(NOW.getFullYear())
  const [month,   setMonth]   = useState(NOW.getMonth() + 1)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const years  = Array.from({ length: 5 }, (_, i) => NOW.getFullYear() - 2 + i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  async function handleExport() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/admin/attendance/export?year=${year}&month=${String(month).padStart(2, '0')}`
      )
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? 'エクスポートに失敗しました')
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `kintai_${year}${String(month).padStart(2, '0')}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-md">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">勤怠データ CSVエクスポート</h2>
      <div className="flex items-center gap-3 flex-wrap">
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
        <button
          onClick={handleExport}
          disabled={loading}
          className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? '処理中...' : 'CSVダウンロード'}
        </button>
      </div>
      {error && (
        <p className="mt-3 text-xs text-red-500">{error}</p>
      )}
      <p className="mt-3 text-xs text-gray-400">全社員の月次勤怠データをCSVで出力します</p>
    </div>
  )
}
