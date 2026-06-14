'use client'

import { useState, useEffect, useCallback } from 'react'
import { EmployeeRow } from './EmployeeRow'
import { FieldDefPanel } from './FieldDefPanel'
import type { EmployeeDbRow, EmployeeFieldDef, EmployeeFieldValue } from '@/lib/types'

type MonthlySummary = {
  user_id: string
  actual_hours: number
  overtime_hours: number
  work_days: number
  absent_days: number
}


type MonthlyValueRow = {
  user_id: string
  field_id: string | null
  label: string
  category: 'allowance' | 'deduction'
  amount: number
}

type MonthlySalaryConfig = {
  user_id: string
  salary_type: 'monthly' | 'hourly'
  base_salary: number
  overtime_hourly_rate: number | null
}

interface EmployeeDbClientProps {
  initialEmployees: EmployeeDbRow[]
  initialFields: EmployeeFieldDef[]
  initialYear: number
  initialMonth: number
  workDaysPerMonth: number
}

export function EmployeeDbClient({
  initialEmployees,
  initialFields,
  initialYear,
  initialMonth,
  workDaysPerMonth,
}: EmployeeDbClientProps) {
  const [employees, setEmployees]       = useState(initialEmployees)
  const [fieldDefs, setFieldDefs]       = useState(initialFields)
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [panelOpen, setPanelOpen]       = useState(false)
  const [year,  setYear]   = useState(initialYear)
  const [month, setMonth]  = useState(initialMonth)
  const [summary, setSummary]           = useState<Map<string, MonthlySummary>>(new Map())
  const [overtimeRates, setOvertimeRates] = useState<Map<string, number>>(new Map())
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [generating, setGenerating]     = useState(false)
  const [generateMsg, setGenerateMsg]   = useState('')
  const [copying, setCopying]           = useState(false)
  const [copyMsg, setCopyMsg]           = useState('')

  // 当月・未来月のみ「先月分を反映」を許可
  const now = new Date()
  const isCurrentOrFuture =
    year > now.getFullYear() ||
    (year === now.getFullYear() && month >= now.getMonth() + 1)

  // 月別の勤怠集計を取得
  const fetchSummary = useCallback(async (y: number, m: number) => {
    setLoadingSummary(true)
    const res = await fetch(`/api/admin/attendance/monthly-summary?year=${y}&month=${m}`)
    setLoadingSummary(false)
    if (!res.ok) return
    const data = await res.json() as { summary: MonthlySummary[] }
    setSummary(new Map(data.summary.map((s) => [s.user_id, s])))
  }, [])

  // 月別の手当・控除＋基本給設定を取得してemployeesを更新
  const fetchMonthlyValues = useCallback(async (y: number, m: number) => {
    const res = await fetch(`/api/admin/monthly-salary?year=${y}&month=${m}`)
    if (!res.ok) return
    const data = await res.json() as { values: MonthlyValueRow[]; configs: MonthlySalaryConfig[] }
    const byUser = new Map<string, EmployeeFieldValue[]>()
    for (const v of data.values) {
      const list = byUser.get(v.user_id) ?? []
      list.push({ field_id: v.field_id, label: v.label, category: v.category, amount: v.amount })
      byUser.set(v.user_id, list)
    }
    const configMap = new Map((data.configs ?? []).map((c) => [c.user_id, c]))
    const newOvertimeRates = new Map<string, number>()
    for (const cfg of (data.configs ?? [])) {
      if (cfg.overtime_hourly_rate != null) {
        newOvertimeRates.set(cfg.user_id, cfg.overtime_hourly_rate)
      }
    }
    setOvertimeRates(newOvertimeRates)
    setEmployees((prev) =>
      prev.map((emp) => {
        const cfg = configMap.get(emp.id)
        return {
          ...emp,
          values:      byUser.get(emp.id) ?? [],
          salary_type: cfg?.salary_type ?? emp.salary_type,
          base_salary: cfg?.base_salary ?? emp.base_salary,
        }
      })
    )
  }, [])

  useEffect(() => {
    fetchSummary(year, month)
    fetchMonthlyValues(year, month)
    setEditingId(null)
    setGenerateMsg('')
    setCopyMsg('')
  }, [year, month, fetchSummary, fetchMonthlyValues])

  function changeMonth(delta: number) {
    let m = month + delta
    let y = year
    if (m < 1)  { m = 12; y-- }
    if (m > 12) { m = 1;  y++ }
    setYear(y)
    setMonth(m)
  }

  // 前月分を当月にコピー
  async function copyFromLastMonth() {
    const prevYear  = month === 1 ? year - 1 : year
    const prevMonth = month === 1 ? 12 : month - 1
    const ok = window.confirm(
      `${prevYear}年${prevMonth}月のデータを ${year}年${month}月 に反映します。\n現在の${year}年${month}月のデータは上書きされます。よろしいですか？`
    )
    if (!ok) return

    setCopying(true)
    setCopyMsg('')
    const res = await fetch('/api/admin/monthly-salary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month }),
    })
    const data = await res.json() as { ok?: boolean; copied?: number; message?: string; error?: string }

    if (!res.ok) { setCopying(false); setCopyMsg(`エラー: ${data.error}`); return }
    if (data.message) { setCopying(false); setCopyMsg(data.message); return }

    // 先にテーブルを更新してから「反映しました」を表示
    await fetchMonthlyValues(year, month)
    setEditingId(null)
    setCopying(false)
    setCopyMsg(`${data.copied ?? 0} 件のデータを反映しました`)
  }

  async function generatePayslips() {
    setGenerating(true)
    setGenerateMsg('')
    const res = await fetch('/api/admin/payslips/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month }),
    })
    const data = await res.json() as { generated?: number; error?: string }
    setGenerating(false)
    if (!res.ok) { setGenerateMsg(`エラー: ${data.error}`); return }
    setGenerateMsg(`${year}年${month}月 給与明細を ${data.generated ?? 0} 件生成しました`)
  }

  function handleSaved(updated: EmployeeDbRow) {
    setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
    setEditingId(null)
    fetchMonthlyValues(year, month)
  }

  function handleFieldAdded(field: EmployeeFieldDef) {
    setFieldDefs((prev) => [...prev, field])
  }

  function handleFieldDeleted(fieldId: string) {
    setFieldDefs((prev) => prev.filter((f) => f.id !== fieldId))
  }

  function exportCSV() {
    const esc = (v: unknown): string => {
      let s = String(v ?? '')
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
      if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'
      return s
    }
    const headers = ['社員番号', '氏名', '種別', '基本給/時給', '実働h', '残業h', ...fieldDefs.map((f) => f.label)]
    const rows = employees.map((emp) => {
      const s = summary.get(emp.id)
      return [
        emp.employee_code,
        emp.name,
        emp.salary_type === 'monthly' ? '月給' : '時給',
        emp.base_salary,
        s?.actual_hours   ?? 0,
        s?.overtime_hours ?? 0,
        ...fieldDefs.map((f) => emp.values.find((v) => v.field_id === f.id)?.amount ?? 0),
      ]
    })
    const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `社員給与項目DB_${year}年${month}月.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-gray-800">社員給与項目DB</h1>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{employees.length}名</span>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={exportCSV}
            className="px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
            CSV出力
          </button>
          <button onClick={() => setPanelOpen((v) => !v)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              panelOpen ? 'bg-blue-600 text-white border-blue-600' : 'border-blue-200 text-blue-600 hover:bg-blue-50'
            }`}>
            ⚙ 列管理
          </button>
          <a href="/admin/users/new"
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
            ＋ 社員追加
          </a>
        </div>
      </div>

      {/* 月セレクタ + アクション */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-gray-50 flex-shrink-0 flex-wrap">
        {/* 月切り替え */}
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)}
            className="text-sm text-blue-500 hover:text-blue-700 px-1">‹ 前月</button>
          <span className="font-semibold text-sm min-w-[80px] text-center">
            {year}年{month}月
          </span>
          <button onClick={() => changeMonth(1)}
            className="text-sm text-blue-500 hover:text-blue-700 px-1">翌月 ›</button>
          {loadingSummary && <span className="text-xs text-gray-400">集計中...</span>}
        </div>

        {/* 先月分を反映ボタン */}
        <div className="flex items-center gap-2">
          <button
            onClick={copyFromLastMonth}
            disabled={copying || !isCurrentOrFuture}
            title={!isCurrentOrFuture ? '過去月のデータは変更できません' : undefined}
            className="px-3 py-1.5 border border-orange-300 text-orange-600 text-sm rounded-lg hover:bg-orange-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
            {copying ? '反映中...' : '先月分を反映'}
          </button>
          {copyMsg && (
            <span className={`text-xs ${copyMsg.startsWith('エラー') ? 'text-red-500' : 'text-orange-600'}`}>
              {copyMsg}
            </span>
          )}
        </div>

        {/* 給与明細生成 */}
        <div className="flex items-center gap-2 ml-auto">
          {generateMsg && (
            <span className={`text-xs ${generateMsg.startsWith('エラー') ? 'text-red-500' : 'text-green-600'}`}>
              {generateMsg}
            </span>
          )}
          <button onClick={generatePayslips} disabled={generating}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
            {generating ? '生成中...' : `${year}年${month}月 給与明細生成`}
          </button>
          <a href={`/admin/payslips?year=${year}&month=${month}`}
            className="text-xs text-blue-500 hover:underline whitespace-nowrap">
            給与明細管理へ →
          </a>
        </div>
      </div>

      {/* 月別データの説明 */}
      <div className="px-4 py-1.5 bg-yellow-50 border-b border-yellow-100 text-xs text-yellow-700 flex-shrink-0">
        手当・控除は月ごとに管理されます。新しい月は白紙から始まります。「先月分を反映」で前月のデータをコピーできます。
      </div>

      {/* テーブル */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-b-2 border-gray-200 border-r border-gray-100 sticky left-0 bg-gray-50 whitespace-nowrap">
                  氏名
                </th>
                <th className="px-3 py-2 text-center border-b-2 border-gray-200 border-r border-gray-100 whitespace-nowrap">
                  種別
                </th>
                <th className="px-3 py-2 text-right border-b-2 border-gray-200 border-r border-gray-100 whitespace-nowrap">
                  基本給/時給
                </th>
                <th className="px-3 py-2 text-right border-b-2 border-gray-200 border-r border-gray-100 whitespace-nowrap text-blue-700">
                  実働h
                </th>
                <th className="px-3 py-2 text-right border-b-2 border-gray-200 border-r border-gray-100 whitespace-nowrap text-orange-600">
                  残業h
                </th>
                <th className="px-3 py-2 text-right border-b-2 border-gray-200 border-r border-gray-100 whitespace-nowrap text-purple-600">
                  残業単価
                </th>
                <th className="px-3 py-2 text-right border-b-2 border-gray-200 border-r border-gray-100 whitespace-nowrap text-purple-600">
                  残業手当
                </th>
                <th className="px-3 py-2 text-center border-b-2 border-gray-200 border-r border-gray-100 whitespace-nowrap text-gray-500">
                  欠勤日
                </th>
                <th className="px-3 py-2 text-right border-b-2 border-gray-200 border-r border-gray-100 whitespace-nowrap text-red-400">
                  欠勤控除
                </th>
                {fieldDefs.map((def) => (
                  <th key={def.id}
                    className={`px-3 py-2 text-right border-b-2 border-gray-200 border-r border-gray-100 whitespace-nowrap ${
                      def.category === 'allowance' ? 'text-green-700' : 'text-red-600'
                    }`}>
                    {def.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right border-b-2 border-gray-200 border-r border-gray-100 whitespace-nowrap text-blue-700">
                  総支給額
                </th>
                <th className="px-3 py-2 text-right border-b-2 border-gray-200 border-r border-gray-100 whitespace-nowrap text-red-600">
                  控除合計
                </th>
                <th className="px-3 py-2 text-right border-b-2 border-gray-200 border-r border-gray-100 whitespace-nowrap text-green-700">
                  差引支給額
                </th>
                <th className="px-3 py-2 text-right border-b-2 border-gray-200 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const s = summary.get(emp.id)
                return (
                  <EmployeeRow
                    key={`${emp.id}-${year}-${month}`}
                    employee={emp}
                    fieldDefs={fieldDefs}
                    isEditing={editingId === emp.id}
                    onStartEdit={() => isCurrentOrFuture && setEditingId(emp.id)}
                    onSaved={handleSaved}
                    onCancelEdit={() => setEditingId(null)}
                    actualHours={s?.actual_hours}
                    overtimeHours={s?.overtime_hours}
                    absentDays={s?.absent_days}
                    overtimeHourlyRate={overtimeRates.get(emp.id)}
                    workDaysPerMonth={workDaysPerMonth}
                    year={year}
                    month={month}
                    readOnly={!isCurrentOrFuture}
                  />
                )
              })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={13 + fieldDefs.length}
                    className="px-4 py-8 text-center text-gray-400 text-sm">
                    社員が登録されていません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {panelOpen && (
          <FieldDefPanel
            fields={fieldDefs}
            onAdded={handleFieldAdded}
            onDeleted={handleFieldDeleted}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>
    </div>
  )
}
