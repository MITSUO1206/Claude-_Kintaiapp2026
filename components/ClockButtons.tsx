'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { AttendanceRecord } from '@/lib/types'

interface ClockButtonsProps {
  initialRecord: AttendanceRecord | null
}

type ClockState = 'before_work' | 'working' | 'finished'

function getClockState(record: AttendanceRecord | null): ClockState {
  if (!record?.clock_in) return 'before_work'
  if (record.clock_out) return 'finished'
  return 'working'
}

export function ClockButtons({ initialRecord }: ClockButtonsProps) {
  const [record, setRecord] = useState<AttendanceRecord | null>(initialRecord)
  const [state, setState] = useState<ClockState>(getClockState(initialRecord))
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

  async function handleAction(action: 'clock-in' | 'clock-out') {
    setLoading(action)
    setError('')
    try {
      const res = await fetch(`/api/attendance/${action}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '操作に失敗しました')
        return
      }
      setRecord(data.record)
      setState(getClockState(data.record))
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {state === 'before_work' && <Badge variant="secondary">出勤前</Badge>}
        {state === 'working' && (
          <>
            <Badge className="bg-green-500 text-white">出勤中</Badge>
            {elapsedTime && <span className="text-sm text-gray-500">{elapsedTime}</span>}
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
          disabled={state !== 'before_work' || loading === 'clock-in'}
          className="h-16 text-lg bg-blue-600 hover:bg-blue-700 text-white"
        >
          {loading === 'clock-in' ? '処理中...' : '出勤'}
        </Button>
        <Button
          onClick={() => handleAction('clock-out')}
          disabled={state !== 'working' || loading === 'clock-out'}
          variant="outline"
          className="h-16 text-lg border-2"
        >
          {loading === 'clock-out' ? '処理中...' : '退勤'}
        </Button>
      </div>

      {state === 'finished' && (
        <p className="text-center text-gray-500 text-sm">お疲れ様でした</p>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
    </div>
  )
}
