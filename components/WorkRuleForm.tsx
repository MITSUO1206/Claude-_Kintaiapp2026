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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t pt-5 pb-1">
      <h3 className="text-sm font-semibold text-gray-700">{children}</h3>
    </div>
  )
}

function ReadOnlyRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-center gap-4 py-2">
      <span className="w-48 text-sm text-gray-600 shrink-0">{label}</span>
      <span className="font-mono text-sm font-semibold text-gray-800 bg-gray-100 px-3 py-1 rounded">{value}</span>
      {note && <span className="text-xs text-gray-400">{note}</span>}
    </div>
  )
}

function FieldRow({
  label, note, children,
}: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-sm">{label}</Label>
      {children}
      {note && <p className="text-xs text-gray-400 mt-1">{note}</p>}
    </div>
  )
}

export function WorkRuleForm({ initialRule }: { initialRule: WorkRule | null }) {
  const r = initialRule as unknown as Record<string, unknown>

  // 勤務ルール
  const [workHours, setWorkHours]   = useState(String(initialRule?.work_hours_per_day   ?? 8))
  const [workDays, setWorkDays]     = useState(String(initialRule?.work_days_per_month  ?? 20))
  const [closingDay, setClosingDay] = useState(String(initialRule?.closing_day          ?? 31))
  const [paymentDay, setPaymentDay] = useState(String(initialRule?.payment_day          ?? 25))
  const [holidayWeekdays, setHolidayWeekdays] = useState<string[]>(
    initialRule?.holiday_weekdays ?? ['sunday']
  )
  const [paymentOnHoliday, setPaymentOnHoliday] = useState(
    initialRule?.payment_on_holiday ?? '前倒し'
  )

  // 36協定
  const [limitHours, setLimitHours]   = useState(String(r?.overtime_limit_hours   ?? 45))
  const [annualLimit, setAnnualLimit] = useState(String(r?.overtime_annual_limit  ?? 360))
  const [alertHours, setAlertHours]   = useState(String(initialRule?.overtime_alert_hours ?? 36))

  // 割増賃金率
  const [rate25, setRate25] = useState(String(r?.overtime_rate_25 ?? 1.25))
  const [rate50, setRate50] = useState(String(r?.overtime_rate_50 ?? 1.50))

  // 社会保険料率
  const [healthRate, setHealthRate]   = useState(String(r?.health_insurance_rate ?? 0.0497))
  const [pensionRate, setPensionRate] = useState(String(r?.pension_rate          ?? 0.0915))
  const [empInsRate, setEmpInsRate]   = useState(String(r?.employment_ins_rate   ?? 0.006))

  // コンプライアンス閾値
  const [consecLimit, setConsecLimit]     = useState(String(r?.consecutive_work_limit ?? 14))
  const [intervalHours, setIntervalHours] = useState(String(r?.interval_min_hours     ?? 11))
  const [alertRatio, setAlertRatio]       = useState(String(r?.annual_alert_ratio      ?? 0.83))

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
          holiday_weekdays:      holidayWeekdays,
          payment_on_holiday:    paymentOnHoliday,
          overtime_limit_hours:  parseInt(limitHours),
          overtime_annual_limit: parseInt(annualLimit),
          overtime_alert_hours:  parseInt(alertHours),
          overtime_rate_25:      parseFloat(rate25),
          overtime_rate_50:      parseFloat(rate50),
          health_insurance_rate: parseFloat(healthRate),
          pension_rate:          parseFloat(pensionRate),
          employment_ins_rate:   parseFloat(empInsRate),
          consecutive_work_limit: parseInt(consecLimit),
          interval_min_hours:    parseInt(intervalHours),
          annual_alert_ratio:    parseFloat(alertRatio),
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
        <CardTitle className="text-base">システムパラメータ設定</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-2">

          {/* ── 勤務ルール ─────────────────────── */}
          <SectionTitle>勤務ルール</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="所定労働時間（時間/日）">
              <Input type="number" step="0.5" value={workHours} onChange={(e) => setWorkHours(e.target.value)} />
            </FieldRow>
            <FieldRow label="所定労働日数（日/月）">
              <Input type="number" value={workDays} onChange={(e) => setWorkDays(e.target.value)} />
            </FieldRow>
            <FieldRow label="締め日（毎月何日）" note="31 = 月末">
              <Input type="number" min="1" max="31" value={closingDay} onChange={(e) => setClosingDay(e.target.value)} />
            </FieldRow>
            <FieldRow label="支給日（毎月何日）">
              <Input type="number" min="1" max="31" value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} />
            </FieldRow>
          </div>

          <div className="mt-3">
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

          <div className="mt-2">
            <Label className="text-sm font-semibold">支給日が休業日の場合</Label>
            <select
              value={paymentOnHoliday}
              onChange={(e) => setPaymentOnHoliday(e.target.value)}
              className="mt-1 block border rounded px-3 py-1.5 text-sm w-48"
            >
              <option value="前倒し">前倒し（直前の営業日）</option>
              <option value="翌営業日">翌営業日</option>
            </select>
          </div>

          {/* ── 36協定・残業上限 ─────────────────── */}
          <SectionTitle>36協定・残業上限</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="月上限（h/月）" note="法定上限 45h（特別条項なし）">
              <Input type="number" value={limitHours} onChange={(e) => setLimitHours(e.target.value)} />
            </FieldRow>
            <FieldRow label="年上限（h/年）" note="法定上限 360h（特別条項なし）">
              <Input type="number" value={annualLimit} onChange={(e) => setAnnualLimit(e.target.value)} />
            </FieldRow>
            <FieldRow label="月警告しきい値（h）" note="この時間を超えると黄色警告">
              <Input type="number" value={alertHours} onChange={(e) => setAlertHours(e.target.value)} />
            </FieldRow>
          </div>

          {/* ── 割増賃金率 ──────────────────────── */}
          <SectionTitle>割増賃金率</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="月60h以内（倍率）" note="法定最低 1.25（25%増）">
              <Input type="number" step="0.01" min="1" value={rate25} onChange={(e) => setRate25(e.target.value)} />
            </FieldRow>
            <FieldRow label="月60h超（倍率）" note="法定最低 1.50（50%増）">
              <Input type="number" step="0.01" min="1" value={rate50} onChange={(e) => setRate50(e.target.value)} />
            </FieldRow>
          </div>

          {/* ── 社会保険料率（従業員負担分） ─────────── */}
          <SectionTitle>社会保険料率（従業員負担分）</SectionTitle>
          <div className="grid grid-cols-3 gap-4">
            <FieldRow label="健康保険料率" note="例: 0.0497 = 4.97%">
              <Input type="number" step="0.0001" min="0" max="1" value={healthRate} onChange={(e) => setHealthRate(e.target.value)} />
            </FieldRow>
            <FieldRow label="厚生年金料率" note="例: 0.0915 = 9.15%">
              <Input type="number" step="0.0001" min="0" max="1" value={pensionRate} onChange={(e) => setPensionRate(e.target.value)} />
            </FieldRow>
            <FieldRow label="雇用保険料率" note="例: 0.006 = 0.6%">
              <Input type="number" step="0.0001" min="0" max="1" value={empInsRate} onChange={(e) => setEmpInsRate(e.target.value)} />
            </FieldRow>
          </div>

          {/* ── コンプライアンス閾値 ───────────────── */}
          <SectionTitle>コンプライアンス閾値</SectionTitle>
          <div className="grid grid-cols-3 gap-4">
            <FieldRow label="連続勤務上限（日）" note="超過で警告（労基法 35条目安）">
              <Input type="number" min="1" value={consecLimit} onChange={(e) => setConsecLimit(e.target.value)} />
            </FieldRow>
            <FieldRow label="勤務間インターバル（h）" note="下回ると警告（法定努力義務 11h）">
              <Input type="number" min="1" value={intervalHours} onChange={(e) => setIntervalHours(e.target.value)} />
            </FieldRow>
            <FieldRow label="年間残業 警告比率" note="例: 0.83 = 年上限の83%で警告">
              <Input type="number" step="0.01" min="0" max="1" value={alertRatio} onChange={(e) => setAlertRatio(e.target.value)} />
            </FieldRow>
          </div>

          {/* ── 法定固定値（参考表示のみ） ─────────── */}
          <SectionTitle>法定固定値（参考・変更不可）</SectionTitle>
          <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-1">
            <ReadOnlyRow label="深夜割増率" value="× 0.25（25%増）" note="労基法 37条4項" />
            <ReadOnlyRow label="休日割増率" value="× 1.35（35%増）" note="労基法 37条1項" />
            <ReadOnlyRow label="60h超 tier2 しきい値" value="60h" note="中小企業は2023年4月より適用" />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {msg   && <p className="text-sm text-green-600">{msg}</p>}

          <div className="pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? '保存中...' : 'すべて保存'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
