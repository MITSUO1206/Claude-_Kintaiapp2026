// components/admin/EmployeeDbClient.tsx
'use client'

import { useState } from 'react'
import { EmployeeRow } from './EmployeeRow'
import { FieldDefPanel } from './FieldDefPanel'
import type { EmployeeDbRow, EmployeeFieldDef } from '@/lib/types'

interface EmployeeDbClientProps {
  initialEmployees: EmployeeDbRow[]
  initialFields: EmployeeFieldDef[]
}

export function EmployeeDbClient({ initialEmployees, initialFields }: EmployeeDbClientProps) {
  const [employees, setEmployees] = useState(initialEmployees)
  const [fieldDefs, setFieldDefs] = useState(initialFields)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  function handleSaved(updated: EmployeeDbRow) {
    setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
    setEditingId(null)
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
    const headers = ['社員番号', '氏名', '種別', '基本給/時給', ...fieldDefs.map((f) => f.label)]
    const rows = employees.map((emp) => [
      emp.employee_code,
      emp.name,
      emp.salary_type === 'monthly' ? '月給' : '時給',
      emp.base_salary,
      ...fieldDefs.map((f) => emp.values.find((v) => v.field_id === f.id)?.amount ?? 0),
    ])
    const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '社員データベース.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-gray-800">社員データベース</h1>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
            {employees.length}名
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            className="px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
          >
            CSV出力
          </button>
          <button
            onClick={() => setPanelOpen((v) => !v)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              panelOpen
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-blue-200 text-blue-600 hover:bg-blue-50'
            }`}
          >
            ⚙ 列管理
          </button>
          <a
            href="/admin/users/new"
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
          >
            ＋ 社員追加
          </a>
        </div>
      </div>
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
                {fieldDefs.map((def) => (
                  <th
                    key={def.id}
                    className={`px-3 py-2 text-right border-b-2 border-gray-200 border-r border-gray-100 whitespace-nowrap ${
                      def.category === 'allowance' ? 'text-green-700' : 'text-red-600'
                    }`}
                  >
                    {def.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right border-b-2 border-gray-200 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <EmployeeRow
                  key={emp.id}
                  employee={emp}
                  fieldDefs={fieldDefs}
                  isEditing={editingId === emp.id}
                  onStartEdit={() => setEditingId(emp.id)}
                  onSaved={handleSaved}
                  onCancelEdit={() => setEditingId(null)}
                />
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={4 + fieldDefs.length} className="px-4 py-8 text-center text-gray-400 text-sm">
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
