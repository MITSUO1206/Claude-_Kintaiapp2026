'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { AttendanceRecord } from '@/lib/types'

interface ClockButtonsProps {
  initialRecord: AttendanceRecord | null
  initialBreakStart: string | null
}

type ClockState = 'before_work' | 'working' | 'on_break' | 'finished'

function getClockState(
  record: AttendanceRecord | null,
  hasActiveBreak: boolean
): ClockState {
  if (!record?.clock_in) return 'before_work'
  if (record.clock_out) return 'finished'
  if (hasActiveBreak) return 'on_break'
  return 'working'
}

export function ClockButtons({ initialRecord, initialBreakStart }: ClockButtonsProps) {
  const [record, setRecord] = useState<AttendanceRecord | null>(initialRecord)
  const [breakStart, setBreakStart] = useState<string | null>(initialBreakStart)
  const [state, setState] = useState<ClockState>(
    getClockState(initialRecord, initialBreakStart !== null)
  )
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [elapsedTime, setElapsedTime] = useState('')

  useEffect(() => {
    if (state !== 'working' || !record?.clock_in) return
    const interval = setInterval(() => {
      const diffMs = Date.now() - new Date(record.clock_in!).getTime()
      const hours = Math.floor(diffMs / 3600000)
      const minutes = Math.floor((diffMs % 3600000) / 60000)
      setElapsedTime(`${hours}時間${String(minutes).padStart(2, '0')}分`)
    }, 1000)
    return () => clearInterval(interval)
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

      if (action === 'clock-in') {
        setRecord(data.record)
        setState('working')
      } else if (action === 'clock-out') {
        setRecord(data.record)
        setBreakStart(null)
        setState('finished')
      } else if (action === 'break-start') {
        setBreakStart(data.break_start)
        setState('on_break')
      } else if (action === 'break-end') {
        setBreakStart(null)
        setState('working')
      }
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {state === 'before_work' && (
          <Badge variant="secondary">出勤前</Badge>
        )}
        {state === 'working' && (
          <>
            <Badge className="bg-green-500 text-white">出勤中</Badge>
            {elapsedTime && <span className="text-sm text-gray-500">{elapsedTime}</span>}
          </>
        )}
        {state === 'on_break' && (
          <>
            <Badge className="bg-yellow-500 text-white">休憩中</Badge>
            {breakStart && (
              <span className="text-sm text-gray-500">
                {new Date(breakStart).toLocaleTimeString('ja-JP', {
                  timeZone: 'Asia/Tokyo',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                〜
              </span>
            )}
          </>
        )}
        {state === 'finished' && <Badge variant="outline">退勤済み</Badge>}
      </div>

      {record?.clock_in && (
        <div className="text-sm text-gray-600">
          出勤:{' '}
          {new Date(record.clock_in).toLocaleTimeString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            hour: '2-digit',
            minute: '2-digit',
          })}
          {record.clock_out && (
            <>
              {' / '}退勤:{' '}
              {new Date(record.clock_out).toLocaleTimeString('ja-JP', {
                timeZone: 'Asia/Tokyo',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={() => handleAction('clock-in')}
          disabled={state !== 'before_work' || loading !== null}
          className="h-16 text-lg bg-blue-600 hover:bg-blue-700 text-white"
        >
          {loading === 'clock-in' ? '処理中...' : '出勤'}
        </Button>
        <Button
          onClick={() => handleAction('clock-out')}
          disabled={(state !== 'working' && state !== 'on_break') || loading !== null}
          variant="outline"
          className="h-16 text-lg border-2"
        >
          {loading === 'clock-out' ? '処理中...' : '退勤'}
        </Button>
        <Button
          onClick={() => handleAction('break-start')}
          disabled={state !== 'working' || loading !== null}
          variant="outline"
          className="h-12 text-sm border-yellow-400 text-yellow-700 hover:bg-yellow-50"
        >
          {loading === 'break-start' ? '処理中...' : '休憩開始'}
        </Button>
        <Button
          onClick={() => handleAction('break-end')}
          disabled={state !== 'on_break' || loading !== null}
          className="h-12 text-sm bg-yellow-500 hover:bg-yellow-600 text-white"
        >
          {loading === 'break-end' ? '処理中...' : '休憩終了'}
        </Button>
      </div>

      {state === 'finished' && (
        <p className="text-center text-gray-500 text-sm">お疲れ様でした</p>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
    </div>
  )
}
