'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { WorkRule } from '@/lib/types'

const HOLIDAY_OPTIONS = [
  { value: 'sunday',   label: '日曜日' },
  { value: 'saturday', label: '土曜日' },
  { value: 'holiday',  label: '祝日' },
]

export function WorkRuleForm({ initialRule }: { initialRule: WorkRule | null }) {
  const [workHours, setWorkHours]   = useState(String(initialRule?.work_hours_per_day   ?? 8))
  const [workDays, setWorkDays]     = useState(String(initialRule?.work_days_per_month  ?? 20))
  const [closingDay, setClosingDay] = useState(String(initialRule?.closing_day          ?? 31))
  const [paymentDay, setPaymentDay] = useState(String(initialRule?.payment_day          ?? 25))
  const [alertHours, setAlertHours]   = useState(String(initialRule?.overtime_alert_hours   ?? 36))
  const [limitHours, setLimitHours]   = useState(String(initialRule?.overtime_limit_hours   ?? 45))
  const [annualLimit, setAnnualLimit] = useState(String((initialRule as unknown as Record<string, unknown>)?.overtime_annual_limit ?? 360))
  const [rate25, setRate25] = useState(String((initialRule as unknown as Record<string, unknown>)?.overtime_rate_25 ?? 1.25))
  const [rate50, setRate50] = useState(String((initialRule as unknown as Record<string, unknown>)?.overtime_rate_50 ?? 1.50))

  const [holidayWeekdays, setHolidayWeekdays] = useState<string[]>(
    initialRule?.holiday_weekdays ?? ['sunday']
  )
  const [paymentOnHoliday, setPaymentOnHoliday] = useState(
    initialRule?.payment_on_holiday ?? '前倒し'
  )

  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState('')
  const [error, setError]   = useState('')

  function toggleHoliday(val: string) {
    setHolidayWeekdays((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    setError('')
    try {
      const res = await fetch('/api/admin/work-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_hours_per_day:    parseFloat(workHours),
          work_days_per_month:   parseInt(workDays),
          closing_day:           parseInt(closingDay),
          payment_day:           parseInt(paymentDay),
          overtime_alert_hours:   parseInt(alertHours),
          overtime_limit_hours:   parseInt(limitHours),
          overtime_annual_limit:  parseInt(annualLimit),
          overtime_rate_25:       parseFloat(rate25),
          overtime_rate_50:       parseFloat(rate50),
          holiday_weekdays:      holidayWeekdays,
          payment_on_holiday:    paymentOnHoliday,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'エラーが発生しました')
        return
      }
      setMsg('保存しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">就業規則設定</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>所定労働時間（時間/日）</Label>
              <Input type="number" step="0.5" value={workHours} onChange={(e) => setWorkHours(e.target.value)} />
            </div>
            <div>
              <Label>所定労働日数（日/月）</Label>
              <Input type="number" value={workDays} onChange={(e) => setWorkDays(e.target.value)} />
            </div>
            <div>
              <Label>締め日（毎月何日）</Label>
              <Input type="number" min="1" max="31" value={closingDay} onChange={(e) => setClosingDay(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">31 = 月末</p>
            </div>
            <div>
              <Label>支給日（毎月何日）</Label>
              <Input type="number" min="1" max="31" value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} />
            </div>
            <div>
              <Label>36協定 月上限（時間/月）</Label>
              <Input type="number" value={limitHours} onChange={(e) => setLimitHours(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">法定上限45h（特別条項なし）</p>
            </div>
            <div>
              <Label>36協定 年上限（時間/年）</Label>
              <Input type="number" value={annualLimit} onChange={(e) => setAnnualLimit(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">法定上限360h（特別条項なし）</p>
            </div>
            <div>
              <Label>警告しきい値（時間/月）</Label>
              <Input type="number" value={alertHours} onChange={(e) => setAlertHours(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">月上限の何時間前から黄色警告するか</p>
            </div>
            <div>
              <Label>割増賃金率（月60h以内）</Label>
              <Input type="number" step="0.01" min="1" value={rate25} onChange={(e) => setRate25(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">時間外労働60h以内に適用（法定最低 1.25）</p>
            </div>
            <div>
              <Label>割増賃金率（月60h超）</Label>
              <Input type="number" step="0.01" min="1" value={rate50} onChange={(e) => setRate50(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">法定最低 1.50（50%増）</p>
            </div>
          </div>

          {/* 法定休日設定 */}
          <div className="border-t pt-4">
            <Label className="text-sm font-semibold">法定休日（休日出勤計算の基準）</Label>
            <div className="flex gap-4 mt-2">
              {HOLIDAY_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={holidayWeekdays.includes(opt.value)}
                    onChange={() => toggleHoliday(opt.value)}
                    className="w-4 h-4"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">チェックした曜日・祝日への出勤が「休日出勤」として集計されます</p>
          </div>

          {/* 支給日が休業日の場合 */}
          <div>
            <Label className="text-sm font-semibold">支給日が休業日の場合</Label>
            <select
              value={paymentOnHoliday}
              onChange={(e) => setPaymentOnHoliday(e.target.value)}
              className="mt-1 block border rounded px-3 py-1.5 text-sm w-48"
            >
              <option value="前倒し">前倒し（直前の営業日）</option>
              <option value="翌営業日">翌営業日</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">支給日が土日祝に当たる場合の処理方法</p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {msg   && <p className="text-sm text-green-600">{msg}</p>}
          <Button type="submit" disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
