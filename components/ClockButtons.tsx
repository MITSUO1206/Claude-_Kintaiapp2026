'use client'

import { useState, useEffect } from 'react'
import type { AttendanceRecord } from '@/lib/types'

interface ClockButtonsProps {
  initialRecord: AttendanceRecord | null
  initialBreakStart: string | null
}

type ClockState = 'before_work' | 'working' | 'on_break' | 'finished'

function getClockState(record: AttendanceRecord | null, hasActiveBreak: boolean): ClockState {
  if (!record?.clock_in) return 'before_work'
  if (record.clock_out) return 'finished'
  if (hasActiveBreak) return 'on_break'
  return 'working'
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ClockButtons({ initialRecord, initialBreakStart }: ClockButtonsProps) {
  const [record, setRecord] = useState<AttendanceRecord | null>(initialRecord)
  const [breakStart, setBreakStart] = useState<string | null>(initialBreakStart)
  const [state, setState] = useState<ClockState>(
    getClockState(initialRecord, initialBreakStart !== null)
  )
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState('')
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    function tick() {
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
      setCurrentTime(now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }))
      if ((state === 'working' || state === 'on_break') && record?.clock_in) {
        const diff = Date.now() - new Date(record.clock_in).getTime()
        const h = Math.floor(diff / 3600000)
        const m = Math.floor((diff % 3600000) / 60000)
        setElapsed(`${h}:${String(m).padStart(2, '0')}`)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [state, record])

  async function handleAction(action: 'clock-in' | 'clock-out' | 'break-start' | 'break-end') {
    setLoading(action)
    setError('')
    try {
      const res = await fetch(`/api/attendance/${action}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '操作に失敗しました')
        return
      }
      if (action === 'clock-in') { setRecord(data.record); setState('working') }
      else if (action === 'clock-out') { setRecord(data.record); setBreakStart(null); setState('finished') }
      else if (action === 'break-start') { setBreakStart(data.break_start); setState('on_break') }
      else if (action === 'break-end') { setBreakStart(null); setState('working') }
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setLoading(null)
    }
  }

  const statusConfig = {
    before_work: { label: '出勤前', bg: 'bg-gray-100', text: 'text-gray-600' },
    working:     { label: '出勤中', bg: 'bg-green-100', text: 'text-green-700' },
    on_break:    { label: '休憩中', bg: 'bg-yellow-100', text: 'text-yellow-700' },
    finished:    { label: '退勤済み', bg: 'bg-blue-50', text: 'text-blue-600' },
  }
  const sc = statusConfig[state]

  return (
    <div>
      {/* Current time + status */}
      <div className="text-center mb-6">
        <p className="text-6xl font-bold text-gray-800 tracking-tight tabular-nums">{currentTime}</p>
        <div className="mt-3">
          <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold ${sc.bg} ${sc.text}`}>
            {sc.label}
          </span>
          {elapsed && (state === 'working' || state === 'on_break') && (
            <span className="ml-3 text-sm text-gray-400">経過 {elapsed}</span>
          )}
        </div>
        {state === 'finished' && (
          <p className="mt-2 text-gray-500 text-sm">お疲れ様でした！</p>
        )}
      </div>

      {/* Time log */}
      {record?.clock_in && (
        <div className="flex justify-center gap-6 mb-6 text-sm text-gray-500">
          <span>出勤 <strong className="text-gray-800">{formatTime(record.clock_in)}</strong></span>
          {state === 'on_break' && breakStart && (
            <span>休憩開始 <strong className="text-gray-800">{formatTime(breakStart)}</strong></span>
          )}
          {record.clock_out && (
            <span>退勤 <strong className="text-gray-800">{formatTime(record.clock_out)}</strong></span>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => handleAction('clock-in')}
          disabled={state !== 'before_work' || loading !== null}
          className={`h-14 rounded-xl text-base font-semibold transition-all ${
            state === 'before_work' && loading === null
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {loading === 'clock-in' ? '処理中...' : '出勤'}
        </button>

        <button
          onClick={() => handleAction('clock-out')}
          disabled={(state !== 'working' && state !== 'on_break') || loading !== null}
          className={`h-14 rounded-xl text-base font-semibold transition-all ${
            (state === 'working' || state === 'on_break') && loading === null
              ? 'bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-200'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {loading === 'clock-out' ? '処理中...' : '退勤'}
        </button>

        <button
          onClick={() => handleAction('break-start')}
          disabled={state !== 'working' || loading !== null}
          className={`h-12 rounded-xl text-sm font-semibold transition-all ${
            state === 'working' && loading === null
              ? 'bg-amber-400 hover:bg-amber-500 text-white shadow-sm'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {loading === 'break-start' ? '処理中...' : '休憩開始'}
        </button>

        <button
          onClick={() => handleAction('break-end')}
          disabled={state !== 'on_break' || loading !== null}
          className={`h-12 rounded-xl text-sm font-semibold transition-all ${
            state === 'on_break' && loading === null
              ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {loading === 'break-end' ? '処理中...' : '休憩終了'}
        </button>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  )
}
