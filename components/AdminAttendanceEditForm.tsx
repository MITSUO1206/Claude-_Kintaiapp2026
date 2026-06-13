'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { AttendanceRecord } from '@/lib/types'

interface AdminAttendanceEditFormProps {
  record: AttendanceRecord
  userName: string
}

function toJSTInput(ts: string | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(11, 16) // HH:MM
}

function fromJSTInput(dateStr: string, timeStr: string): string {
  const localISO = `${dateStr}T${timeStr}:00+09:00`
  return new Date(localISO).toISOString()
}

export function AdminAttendanceEditForm({ record }: AdminAttendanceEditFormProps) {
  const router = useRouter()
  const [clockIn, setClockIn]   = useState(toJSTInput(record.clock_in))
  const [clockOut, setClockOut] = useState(toJSTInput(record.clock_out))
  const [breakMin, setBreakMin] = useState(String(record.break_minutes))
  const [reason, setReason]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const canSubmit = clockIn.trim() !== '' && reason.trim() !== '' && !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError('')

    const body: Record<string, unknown> = {
      clock_in:      fromJSTInput(record.work_date, clockIn),
      break_minutes: parseInt(breakMin) || 0,
      reason:        reason.trim(),
    }
    if (clockOut.trim()) {
      body.clock_out = fromJSTInput(record.work_date, clockOut)
    }

    try {
      const res = await fetch(`/api/admin/attendance/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '更新に失敗しました')
        return
      }
      router.push('/admin/attendance')
      router.refresh()
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium block mb-1">出勤時刻 *</label>
          <input
            type="time"
            value={clockIn}
            onChange={(e) => setClockIn(e.target.value)}
            className="border rounded px-3 py-2 w-full text-sm"
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">退勤時刻（任意）</label>
          <input
            type="time"
            value={clockOut}
            onChange={(e) => setClockOut(e.target.value)}
            className="border rounded px-3 py-2 w-full text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">休憩時間（分）</label>
          <input
            type="number"
            min="0"
            max="480"
            value={breakMin}
            onChange={(e) => setBreakMin(e.target.value)}
            className="border rounded px-3 py-2 w-full text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium block mb-1">修正理由 *</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="border rounded px-3 py-2 w-full text-sm h-20"
          placeholder="例：社員からの依頼により退勤打刻を修正"
          required
        />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={!canSubmit}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {loading ? '保存中...' : '保存する'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          キャンセル
        </Button>
      </div>
    </form>
  )
}
