'use client'

import { useState } from 'react'
import type { EmployeeDbRow, EmployeeFieldDef, EmployeeFieldValue } from '@/lib/types'

interface EmployeeRowProps {
  employee: EmployeeDbRow
  fieldDefs: EmployeeFieldDef[]
  isEditing: boolean
  onStartEdit: () => void
  onSaved: (updated: EmployeeDbRow) => void
  onCancelEdit: () => void
  actualHours?: number
  overtimeHours?: number
  absentDays?: number
  overtimeHourlyRate?: number
  workDaysPerMonth: number
  year: number
  month: number
  readOnly?: boolean
}

function yen(v: number) { return `¥${Math.round(v).toLocaleString()}` }

export function EmployeeRow({
  employee, fieldDefs, isEditing, onStartEdit, onSaved, onCancelEdit,
  actualHours, overtimeHours, absentDays, overtimeHourlyRate,
  workDaysPerMonth, year, month, readOnly,
}: EmployeeRowProps) {
  const [salaryType, setSalaryType] = useState(employee.salary_type)
  const [baseSalary, setBaseSalary] = useState(String(employee.base_salary))
  const [overtimeRate, setOvertimeRate] = useState(overtimeHourlyRate != null ? String(overtimeHourlyRate) : '')
  const [values, setValues] = useState<EmployeeFieldValue[]>(employee.values)
  const [newItemLabel, setNewItemLabel] = useState('')
  const [newItemCategory, setNewItemCategory] = useState<'allowance' | 'deduction'>('allowance')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function getSharedValue(fieldId: string): number {
    return values.find((v) => v.field_id === fieldId)?.amount ?? 0
  }

  const individualValues = values.filter((v) => v.field_id === null)

  function setSharedValue(fieldId: string, label: string, category: 'allowance' | 'deduction', amount: number) {
    setValues((prev) => {
      const idx = prev.findIndex((v) => v.field_id === fieldId)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], amount }
        return next
      }
      return [...prev, { field_id: fieldId, label, category, amount }]
    })
  }

  function updateIndividualAmount(index: number, amount: number) {
    const indivList = values.filter((v) => v.field_id === null)
    const target = indivList[index]
    setValues((prev) => {
      const idx = prev.findIndex((v) => v === target)
      if (idx < 0) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], amount }
      return next
    })
  }

  function removeIndividualItem(index: number) {
    const indivList = values.filter((v) => v.field_id === null)
    const target = indivList[index]
    setValues((prev) => prev.filter((v) => v !== target))
  }

  function addIndividualItem() {
    if (!newItemLabel.trim()) return
    setValues((prev) => [
      ...prev,
      { field_id: null, label: newItemLabel.trim(), category: newItemCategory, amount: 0 },
    ])
    setNewItemLabel('')
    setNewItemCategory('allowance')
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/monthly-salary/${employee.id}?year=${year}&month=${month}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salary_type: salaryType,
          base_salary: parseFloat(baseSalary) || 0,
          overtime_hourly_rate: overtimeRate !== '' ? parseFloat(overtimeRate) : null,
          values,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? '保存に失敗しました')
        return
      }
      onSaved({
        ...employee,
        salary_type: salaryType,
        base_salary: parseFloat(baseSalary) || 0,
        values,
      })
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setSaving(false)
    }
  }

  // ---- リアルタイム計算 ----
  const currentSalaryType = isEditing ? salaryType : employee.salary_type
  const currentBase       = isEditing ? (parseFloat(baseSalary) || 0) : employee.base_salary
  const currentOTRate     = parseFloat(isEditing ? overtimeRate : (overtimeHourlyRate != null ? String(overtimeHourlyRate) : '')) || 0

  // 基本給部分（月給:そのまま / 時給:時給×実働h）
  const basePay = currentSalaryType === 'hourly'
    ? currentBase * (actualHours ?? 0)
    : currentBase

  // 残業手当 = 残業単価 × 残業時間
  const calcOvertimePay = Math.round(currentOTRate * (overtimeHours ?? 0))

  // 欠勤控除 = (基本給 ÷ 所定労働日数) × 欠勤日数（月給のみ）
  const calcAbsenceDeduction = currentSalaryType === 'monthly' && workDaysPerMonth > 0
    ? Math.round((currentBase / workDaysPerMonth) * (absentDays ?? 0))
    : 0

  // DB入力値
  const totalAllowance  = values.filter((v) => v.category === 'allowance').reduce((s, v) => s + v.amount, 0)
  const totalDBDeduction = values.filter((v) => v.category === 'deduction').reduce((s, v) => s + v.amount, 0)

  // 集計
  const calcGross      = Math.round(basePay) + totalAllowance + calcOvertimePay
  const calcDeduction  = totalDBDeduction + calcAbsenceDeduction
  const calcNet        = calcGross - calcDeduction

  const rowBg      = isEditing ? 'bg-blue-50' : ''
  const rowOutline = isEditing ? 'outline outline-2 outline-blue-400 outline-offset-[-1px]' : ''

  return (
    <>
      <tr className={`border-b border-gray-100 ${rowBg} ${rowOutline}`}>
        {/* 氏名 */}
        <td className="px-3 py-2 font-medium text-gray-800 sticky left-0 bg-inherit whitespace-nowrap">
          {employee.name}
          <span className="text-xs text-gray-400 ml-1">{employee.employee_code}</span>
        </td>

        {/* 種別 */}
        <td className="px-3 py-2 text-center">
          {isEditing ? (
            <select
              value={salaryType}
              onChange={(e) => setSalaryType(e.target.value as 'monthly' | 'hourly')}
              className="border border-blue-300 rounded px-1 py-0.5 text-xs"
            >
              <option value="monthly">月給</option>
              <option value="hourly">時給</option>
            </select>
          ) : (
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
              employee.salary_type === 'monthly' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {employee.salary_type === 'monthly' ? '月給' : '時給'}
            </span>
          )}
        </td>

        {/* 基本給/時給 */}
        <td className="px-3 py-2 text-right">
          {isEditing ? (
            <input
              type="number" min={0} value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value)}
              className="w-24 border border-blue-300 rounded px-1 py-0.5 text-xs text-right"
            />
          ) : (
            <span className="text-sm text-gray-700">
              ¥{Number(employee.base_salary).toLocaleString()}
              {employee.salary_type === 'hourly' && <span className="text-xs text-gray-400">/h</span>}
            </span>
          )}
        </td>

        {/* 実働h */}
        <td className="px-3 py-2 text-right text-blue-700 text-sm">
          {actualHours != null ? actualHours.toFixed(1) : <span className="text-gray-300">—</span>}
        </td>

        {/* 残業h */}
        <td className="px-3 py-2 text-right text-orange-600 text-sm">
          {overtimeHours != null && overtimeHours > 0
            ? overtimeHours.toFixed(1)
            : <span className="text-gray-300">0.0</span>}
        </td>

        {/* 残業単価（手入力） */}
        <td className="px-3 py-2 text-right">
          {isEditing ? (
            <input
              type="number" min={0} value={overtimeRate}
              placeholder="0"
              onChange={(e) => setOvertimeRate(e.target.value)}
              className="w-20 border border-purple-300 rounded px-1 py-0.5 text-xs text-right"
            />
          ) : (
            <span className="text-sm text-purple-700">
              {currentOTRate > 0 ? `¥${currentOTRate.toLocaleString()}/h` : <span className="text-gray-300">—</span>}
            </span>
          )}
        </td>

        {/* 残業手当（自動計算） */}
        <td className="px-3 py-2 text-right text-purple-700 text-sm">
          {calcOvertimePay > 0 ? yen(calcOvertimePay) : <span className="text-gray-300">—</span>}
        </td>

        {/* 欠勤日 */}
        <td className="px-3 py-2 text-center text-sm text-gray-500">
          {absentDays != null && absentDays > 0
            ? <span className="text-red-500 font-medium">{absentDays}日</span>
            : <span className="text-gray-300">0</span>}
        </td>

        {/* 欠勤控除（自動計算・月給のみ） */}
        <td className="px-3 py-2 text-right text-red-400 text-sm">
          {currentSalaryType === 'monthly' && calcAbsenceDeduction > 0
            ? `-${yen(calcAbsenceDeduction)}`
            : <span className="text-gray-300">—</span>}
        </td>

        {/* カスタム列（fieldDefs） */}
        {fieldDefs.map((def) => (
          <td key={def.id} className="px-3 py-2 text-right">
            {isEditing ? (
              <input
                type="number" min={0}
                value={getSharedValue(def.id)}
                onChange={(e) => setSharedValue(def.id, def.label, def.category, parseFloat(e.target.value) || 0)}
                className="w-20 border border-blue-300 rounded px-1 py-0.5 text-xs text-right"
              />
            ) : (
              <span className="text-sm text-gray-600">
                {getSharedValue(def.id) > 0
                  ? `¥${getSharedValue(def.id).toLocaleString()}`
                  : <span className="text-gray-300">—</span>}
              </span>
            )}
          </td>
        ))}

        {/* 総支給額 */}
        <td className="px-3 py-2 text-right text-blue-700 text-sm font-medium">
          {yen(calcGross)}
        </td>

        {/* 控除合計 */}
        <td className="px-3 py-2 text-right text-red-500 text-sm font-medium">
          {calcDeduction > 0 ? `-${yen(calcDeduction)}` : <span className="text-gray-300">—</span>}
        </td>

        {/* 差引支給額 */}
        <td className="px-3 py-2 text-right text-green-700 text-sm font-bold">
          {yen(calcNet)}
        </td>

        {/* 操作ボタン */}
        <td className="px-3 py-2 text-right whitespace-nowrap">
          {!isEditing && individualValues.length > 0 && (
            <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded mr-2">
              個別 {individualValues.length}件
            </span>
          )}
          {isEditing ? (
            <div className="flex gap-1 justify-end">
              <button onClick={handleSave} disabled={saving}
                className="px-2 py-1 bg-blue-600 text-white text-xs rounded disabled:bg-blue-300">
                {saving ? '...' : '保存'}
              </button>
              <button onClick={onCancelEdit}
                className="px-2 py-1 border border-gray-300 text-gray-600 text-xs rounded">
                取消
              </button>
            </div>
          ) : readOnly ? (
            <span className="text-xs text-gray-300">参照のみ</span>
          ) : (
            <button onClick={onStartEdit}
              className="px-2 py-1 border border-gray-200 text-gray-500 text-xs rounded hover:border-blue-300 hover:text-blue-600">
              編集
            </button>
          )}
        </td>
      </tr>

      {/* 編集中：個別項目行 */}
      {isEditing && (
        <tr className="bg-blue-50 border-b border-blue-200">
          <td colSpan={13 + fieldDefs.length} className="px-4 py-2">
            <div className="flex flex-wrap gap-2 items-start">
              <span className="text-xs text-amber-600 font-medium pt-1">個別項目:</span>
              {individualValues.map((v, i) => (
                <div key={i} className="flex items-center gap-1 bg-white border border-amber-200 rounded px-2 py-1">
                  <span className="text-xs text-amber-700">{v.label}</span>
                  <input
                    type="number" min={0} value={v.amount}
                    onChange={(e) => updateIndividualAmount(i, parseFloat(e.target.value) || 0)}
                    className="w-16 border border-amber-200 rounded px-1 text-xs text-right"
                  />
                  <button onClick={() => removeIndividualItem(i)} className="text-red-400 text-xs hover:text-red-600">✕</button>
                </div>
              ))}
              <div className="flex items-center gap-1">
                <input
                  placeholder="項目名" value={newItemLabel}
                  onChange={(e) => setNewItemLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addIndividualItem()}
                  className="w-20 border border-dashed border-amber-300 rounded px-1 py-0.5 text-xs"
                />
                <select
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value as 'allowance' | 'deduction')}
                  className="border border-dashed border-amber-300 rounded px-1 py-0.5 text-xs"
                >
                  <option value="allowance">手当</option>
                  <option value="deduction">控除</option>
                </select>
                <button onClick={addIndividualItem}
                  className="text-xs text-amber-600 border border-dashed border-amber-300 rounded px-1.5 py-0.5 hover:bg-amber-50">
                  ＋
                </button>
              </div>
            </div>
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </td>
        </tr>
      )}
    </>
  )
}
