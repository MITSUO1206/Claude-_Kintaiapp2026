'use client'

import { useState, useEffect, useMemo } from 'react'
import type { AttendanceRecord, WorkLocation, ComplianceSummary, WorkRulePattern, MonthlyApproval } from '@/lib/types'
import { MobileMonthlyList } from './MobileMonthlyList'
import { ComplianceBar } from './ComplianceBar'

interface MobileDayViewProps {
  userName: string
  monthRecords: AttendanceRecord[]
  year: number
  month: number
  initialDate: string
  onSaved: (record: AttendanceRecord) => void
  onMonthChange: (year: number, month: number) => void
  complianceData: ComplianceSummary | null
  complianceLoading: boolean
  workPattern: Pick<WorkRulePattern, 'id' | 'name' | 'start_time' | 'end_time' | 'break_minutes'> | null
  approval: MonthlyApproval | null
}

const WORK_LOCATIONS: { value: WorkLocation; label: string }[] = [
  { value: 'office',    label: 'オフィス' },
  { value: 'home',      label: '自宅' },
  { value: 'satellite', label: 'サテライト' },
  { value: 'other',     label: 'その他' },
]

const NON_TIME_SHIFTS = ['休日', '年休']

function toHHMM(timeStr: string): string {
  // "09:00:00" → "0900"
  return timeStr.slice(0, 5).replace(':', '')
}

function patternToShiftLabel(startTime: string, endTime: string): string {
  return `${toHHMM(startTime)}-${toHHMM(endTime)}`
}

function isoToHHMM(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function formatDateHeader(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const days = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`
}

function parseShiftLabel(shiftType: string | null): string {
  if (!shiftType) return ''
  const match = shiftType.match(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/)
  if (match) return `${match[1]}:${match[2]}〜${match[3]}:${match[4]}`
  return shiftType
}

function calcActualTime(clockIn: string, clockOut: string, breakMinutes: number): string {
  if (!clockIn || !clockOut) return '—'
  const [inH, inM] = clockIn.split(':').map(Number)
  const [outH, outM] = clockOut.split(':').map(Number)
  const total = (outH * 60 + outM) - (inH * 60 + inM) - breakMinutes
  if (total <= 0) return '—'
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function offsetDate(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

export function MobileDayView({
  userName, monthRecords, year, month, initialDate, onSaved, onMonthChange,
  complianceData, complianceLoading, workPattern, approval,
}: MobileDayViewProps) {
  const isMonthLocked = approval?.status === 'submitted' || approval?.status === 'approved'

  const patternShift = workPattern
    ? patternToShiftLabel(workPattern.start_time, workPattern.end_time)
    : null

  const [currentDate,  setCurrentDate]  = useState(initialDate)
  const [shiftTypes,   setShiftTypes]   = useState<string[]>(
    patternShift ? [patternShift, ...NON_TIME_SHIFTS] : ['0900-1745', ...NON_TIME_SHIFTS]
  )
  const [shiftType,    setShiftType]    = useState(patternShift ?? '0900-1745')
  const [clockIn,      setClockIn]      = useState('')
  const [clockOut,     setClockOut]     = useState('')
  const [breakMinutes, setBreakMinutes] = useState(60)
  const [workLocation, setWorkLocation] = useState<WorkLocation | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [saved,        setSaved]        = useState(false)
  const [showMonthly,  setShowMonthly]  = useState(false)

  const recordMap = useMemo(
    () => new Map(monthRecords.map((r) => [r.work_date, r])),
    [monthRecords]
  )

  const currentRecord     = recordMap.get(currentDate) ?? null
  const isLocked          = (currentRecord?.is_locked ?? false) || isMonthLocked
  const isTimeOff         = shiftType === '休日' || shiftType === '年休'
  const isClockInRecorded = !!currentRecord?.clock_in

  useEffect(() => {
    fetch('/api/shift-types')
      .then((r) => r.json())
      .then((data: { shift_types?: string[] }) => {
        if (!Array.isArray(data.shift_types)) return
        if (patternShift) {
          // パターンの時間を先頭に固定し、非時間系（休日・年休など）だけAPIから追加
          const nonTime = data.shift_types.filter((s) => !/^\d{4}-\d{4}$/.test(s))
          setShiftTypes([patternShift, ...nonTime])
        } else if (data.shift_types.length > 0) {
          setShiftTypes(data.shift_types)
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const rec = recordMap.get(currentDate)
    setShiftType(rec?.shift_type ?? patternShift ?? '0900-1745')
    setClockIn(isoToHHMM(rec?.clock_in ?? null))
    setClockOut(isoToHHMM(rec?.clock_out ?? null))
    setBreakMinutes(rec?.break_minutes ?? 60)
    setWorkLocation(rec?.work_location ?? null)
    setError('')
    setSaved(false)
  }, [currentDate, recordMap])

  function navigate(delta: number) {
    const next = offsetDate(currentDate, delta)
    const [ny, nm] = next.split('-').map(Number)
    if (ny !== year || nm !== month) {
      onMonthChange(ny, nm)
    }
    setCurrentDate(next)
  }

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
          work_date:     currentDate,
          clock_in:      isTimeOff ? null : (clockIn  || null),
          clock_out:     isTimeOff ? null : (clockOut || null),
          break_minutes: isTimeOff ? 0 : breakMinutes,
          work_location: workLocation,
          shift_type:    shiftType,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError((data as { error?: string }).error ?? '保存に失敗しました')
        return
      }
      onSaved((data as { record: AttendanceRecord }).record)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const actualTime = isTimeOff ? '—' : calcActualTime(clockIn, clockOut, breakMinutes)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* トップバー */}
      <header className="bg-slate-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <span className="text-white font-bold text-sm">KintaiApp</span>
          <span className="text-slate-400 text-xs ml-2">勤怠・給与管理</span>
        </div>
        <span className="text-slate-300 text-sm">{userName}</span>
      </header>

      {/* 日付ナビゲーション */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          ‹ 前日
        </button>
        <div className="text-center">
          <p className="text-base font-bold text-gray-800">{formatDateHeader(currentDate)}</p>
          {currentRecord?.shift_type && (
            <p className="text-xs text-gray-500 mt-0.5">
              シフト {parseShiftLabel(currentRecord.shift_type)}
            </p>
          )}
        </div>
        <button
          onClick={() => navigate(1)}
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          翌日 ›
        </button>
      </div>

      {/* コンプライアンス情報 */}
      <ComplianceBar data={complianceData} loading={complianceLoading} mobile />

      {/* フォーム */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">勤務情報</p>

          {/* 就業場所 */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">◎ 就業場所</label>
            <select
              value={workLocation ?? ''}
              disabled={isLocked}
              onChange={(e) => setWorkLocation((e.target.value || null) as WorkLocation | null)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400 bg-white"
            >
              <option value="">—</option>
              {WORK_LOCATIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* 出勤 */}
          {!isTimeOff && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-500">出勤</label>
                {isClockInRecorded && (
                  <span className="text-xs text-blue-600 font-medium">✓ 記録済み</span>
                )}
              </div>
              <input
                type="time"
                value={clockIn}
                disabled={isLocked}
                onChange={(e) => setClockIn(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400 bg-white"
              />
            </div>
          )}

          {/* 退勤 */}
          {!isTimeOff && (
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">退勤</label>
              <input
                type="time"
                value={clockOut}
                disabled={isLocked}
                onChange={(e) => setClockOut(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400 bg-white"
              />
            </div>
          )}

          {/* 休憩（分） */}
          {!isTimeOff && (
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">休憩（分）</label>
              <input
                type="number"
                min={0}
                step={15}
                value={breakMinutes}
                disabled={isLocked}
                onChange={(e) => setBreakMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400 bg-white"
              />
            </div>
          )}

          {/* 実働時間（自動計算） */}
          {!isTimeOff && (
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">⊙ 実働時間</label>
              <div className="w-full border border-gray-100 rounded-lg px-3 py-2.5 text-sm text-gray-700 bg-gray-50">
                {actualTime}
              </div>
            </div>
          )}

          {/* 区分 */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">◇ 区分</label>
            <select
              value={shiftType}
              disabled={isLocked}
              onChange={(e) => setShiftType(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400 bg-white"
            >
              {shiftTypes.map((st) => (
                <option key={st} value={st}>{parseShiftLabel(st)}</option>
              ))}
            </select>
          </div>

          {/* エラー */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}

          {/* 保存ボタン */}
          {isLocked ? (
            <div className={`text-center text-xs py-2 ${isMonthLocked ? 'text-amber-500' : 'text-gray-400'}`}>
              {isMonthLocked ? '月次申請済みのため編集不可' : '締め済みのため編集不可'}
            </div>
          ) : (
            <button
              onClick={handleSave}
              disabled={loading}
              className={`w-full h-12 rounded-xl text-sm font-semibold transition-all ${
                saved
                  ? 'bg-green-500 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:bg-blue-300'
              }`}
            >
              {loading ? '保存中...' : saved ? '保存しました ✓' : '保存する'}
            </button>
          )}

          {/* 月次一覧トグル */}
          <button
            onClick={() => setShowMonthly((v) => !v)}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm text-blue-600 hover:text-blue-700 transition-colors border-t border-gray-100 mt-2"
          >
            <span>📅</span>
            <span>月次一覧を見る（横スクロール）</span>
            <span>{showMonthly ? '▲' : '▼'}</span>
          </button>

          {showMonthly && (
            <MobileMonthlyList records={monthRecords} year={year} month={month} />
          )}
        </div>
      </div>

      {/* ボトムナビ */}
      <nav className="bg-white border-t border-gray-200 px-4 py-2 flex gap-4 flex-shrink-0">
        <a href="/dashboard" className="text-xs text-blue-600 font-medium">勤怠</a>
        <a href="/payslips" className="text-xs text-gray-500 hover:text-gray-700">給与明細</a>
        <a href="/api/auth/logout" className="text-xs text-gray-400 hover:text-gray-600 ml-auto">ログアウト</a>
      </nav>
    </div>
  )
}
