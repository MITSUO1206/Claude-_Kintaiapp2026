'use client'

import { useState, useEffect } from 'react'
import type { AttendanceRecord, WorkLocation } from '@/lib/types'

interface DayEntryFormProps {
  selectedDate: string
  record: AttendanceRecord | null
  onSaved: (record: AttendanceRecord) => void
}

const WORK_LOCATIONS: { value: WorkLocation; label: string }[] = [
  { value: 'office',    label: 'オフィス' },
  { value: 'home',      label: '自宅' },
  { value: 'satellite', label: 'サテライト' },
  { value: 'other',     label: 'その他' },
]

const DEFAULT_SHIFTS = ['0800-1645', '0900-1745', '休日', '年休']

function isoToHHMM(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatDateLabel(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const dow = days[d.getDay()]
  return `${y}年${m}月${day}日（${dow}）`
}

export function DayEntryForm({ selectedDate, record, onSaved }: DayEntryFormProps) {
  const [shiftTypes,   setShiftTypes]   = useState<string[]>(DEFAULT_SHIFTS)
  const [shiftType,    setShiftType]    = useState<string>((record?.shift_type) ?? '0900-1745')
  const [clockIn,      setClockIn]      = useState(isoToHHMM(record?.clock_in ?? null))
  const [clockOut,     setClockOut]     = useState(isoToHHMM(record?.clock_out ?? null))
  const [breakMinutes, setBreakMinutes] = useState(record?.break_minutes ?? 60)
  const [workLocation, setWorkLocation] = useState<WorkLocation | null>(record?.work_location ?? null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [saved,        setSaved]        = useState(false)

  const isTimeOff = shiftType === '休日' || shiftType === '年休'

  useEffect(() => {
    fetch('/api/shift-types')
      .then((r) => r.json())
      .then((data: { shift_types?: string[] }) => {
        if (Array.isArray(data.shift_types) && data.shift_types.length > 0) {
          setShiftTypes(data.shift_types)
        }
      })
      .catch(() => {})
  }, [])

  async function handleSave() {
    if (isLocked) return
    setLoading(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/attendance/record', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_date:     selectedDate,
          clock_in:      isTimeOff ? null : (clockIn  || null),
          clock_out:     isTimeOff ? null : (clockOut || null),
          break_minutes: isTimeOff ? 0 : breakMinutes,
          work_location: workLocation,
          shift_type:    shiftType,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '保存に失敗しました')
        return
      }
      onSaved(data.record)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const isLocked = record?.is_locked ?? false

  return (
    <div className="h-full flex flex-col">
      {/* 日付ヘッダー */}
      <div className="mb-4">
        <p className="text-base font-bold text-gray-800">{formatDateLabel(selectedDate)}</p>
      </div>

      <div className="flex-1 space-y-4">
        {/* 区分 */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">区分</label>
          <select
            value={shiftType}
            disabled={isLocked}
            onChange={(e) => setShiftType(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
          >
            {shiftTypes.map((shift) => (
              <option key={shift} value={shift}>{shift}</option>
            ))}
          </select>
        </div>

        {/* 就業場所 */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">就業場所</p>
          <div className="grid grid-cols-2 gap-1.5">
            {WORK_LOCATIONS.map(({ value, label }) => (
              <label
                key={value}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                  workLocation === value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                } ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input
                  type="radio"
                  name="work_location"
                  value={value}
                  checked={workLocation === value}
                  disabled={isLocked}
                  onChange={() => setWorkLocation(value)}
                  className="sr-only"
                />
                <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                  workLocation === value ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                }`} />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* 出勤・退勤・休憩（年休・休日は非表示） */}
        {!isTimeOff && (
          <>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">出勤</label>
              <input
                type="time"
                value={clockIn}
                disabled={isLocked}
                onChange={(e) => setClockIn(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">退勤</label>
              <input
                type="time"
                value={clockOut}
                disabled={isLocked}
                onChange={(e) => setClockOut(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">休憩（分）</label>
              <input
                type="number"
                min={0}
                step={15}
                value={breakMinutes}
                disabled={isLocked}
                onChange={(e) => setBreakMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          </>
        )}
      </div>

      {/* エラー */}
      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* 保存ボタン */}
      {!isLocked && (
        <button
          onClick={handleSave}
          disabled={loading}
          className={`mt-4 w-full h-11 rounded-xl text-sm font-semibold transition-all ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:bg-blue-300'
          }`}
        >
          {loading ? '保存中...' : saved ? '保存しました ✓' : '保存する'}
        </button>
      )}

      {isLocked && (
        <div className="mt-4 text-center text-xs text-gray-400">締め済みのため編集不可</div>
      )}
    </div>
  )
}
