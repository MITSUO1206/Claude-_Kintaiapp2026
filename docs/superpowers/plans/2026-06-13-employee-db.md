# 社員データベース（スプレッドシート） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理者が社員の給与・手当・控除情報をExcel感覚のスプレッドシートで一覧・インライン編集できる `/admin/employee-db` 画面を追加する。

**Architecture:** Server Component がデータを初期取得して Client Component に渡す。列定義（`employee_field_defs`）と値（`employee_field_values`）の2テーブルで共通列と個別列のハイブリッド管理を実現。行クリックでインライン編集、右パネルで列マスタ管理。

**Tech Stack:** Next.js 16 App Router, Supabase (withCompany wrapper), Tailwind CSS, TypeScript

---

## ファイル構成

| 操作 | パス |
|------|------|
| 新規作成 | `supabase/schema_phase5.sql` |
| 修正 | `lib/types/index.ts` |
| 新規作成 | `app/api/admin/employee-db/route.ts` |
| 新規作成 | `app/api/admin/employee-db/[userId]/route.ts` |
| 新規作成 | `app/api/admin/employee-db/fields/route.ts` |
| 新規作成 | `app/api/admin/employee-db/fields/[fieldId]/route.ts` |
| 新規作成 | `components/admin/EmployeeRow.tsx` |
| 新規作成 | `components/admin/FieldDefPanel.tsx` |
| 新規作成 | `components/admin/EmployeeDbClient.tsx` |
| 新規作成 | `app/admin/employee-db/page.tsx` |
| 修正 | `components/AdminSidebar.tsx` |

---

## Task 1: Supabaseスキーマ追加（手動実行）

**Files:**
- Create: `supabase/schema_phase5.sql`

- [ ] **Step 1: SQLファイルを作成する**

```sql
-- supabase/schema_phase5.sql
-- 社員データベース: 手当・控除フィールド定義と値

-- 共通列マスタ（会社ごとに定義する手当・控除の列）
CREATE TABLE IF NOT EXISTS employee_field_defs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id),
  label       text NOT NULL,
  category    text NOT NULL CHECK (category IN ('allowance', 'deduction')),
  sort_order  int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- 社員ごとのフィールド値（共通列 + 個別列）
CREATE TABLE IF NOT EXISTS employee_field_values (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  field_id   uuid REFERENCES employee_field_defs(id) ON DELETE SET NULL,
  label      text NOT NULL,
  category   text NOT NULL CHECK (category IN ('allowance', 'deduction')),
  amount     numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 共通列（field_id IS NOT NULL）のみ1人1値を保証
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_field_values_shared
  ON employee_field_values (company_id, user_id, field_id)
  WHERE field_id IS NOT NULL;

-- RLS無効（supabaseAdminで操作するため）
ALTER TABLE employee_field_defs DISABLE ROW LEVEL SECURITY;
ALTER TABLE employee_field_values DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Supabase Dashboardで実行する**

1. https://supabase.com/dashboard を開く
2. 対象プロジェクト → SQL Editor
3. `supabase/schema_phase5.sql` の内容を貼り付けて Run
4. 「Success. No rows returned.」が出ることを確認

- [ ] **Step 3: コミットする**

```bash
git add supabase/schema_phase5.sql
git commit -m "chore: add schema_phase5 for employee field defs and values"
```

---

## Task 2: 型定義追加

**Files:**
- Modify: `lib/types/index.ts`

- [ ] **Step 1: 3つの型をファイル末尾に追加する**

`lib/types/index.ts` の末尾（`MonthlyApproval` の後）に追記:

```typescript
export type EmployeeFieldCategory = 'allowance' | 'deduction'

export interface EmployeeFieldDef {
  id: string
  company_id: string
  label: string
  category: EmployeeFieldCategory
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface EmployeeFieldValue {
  id?: string
  field_id: string | null
  label: string
  category: EmployeeFieldCategory
  amount: number
}

export interface EmployeeDbRow {
  id: string
  employee_code: string
  name: string
  salary_type: SalaryType
  base_salary: number
  is_active: boolean
  values: EmployeeFieldValue[]
}
```

- [ ] **Step 2: ビルドエラーがないか確認する**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 3: コミットする**

```bash
git add lib/types/index.ts
git commit -m "feat: add EmployeeFieldDef, EmployeeFieldValue, EmployeeDbRow types"
```

---

## Task 3: Fields API（列マスタ GET / POST / DELETE）

**Files:**
- Create: `app/api/admin/employee-db/fields/route.ts`
- Create: `app/api/admin/employee-db/fields/[fieldId]/route.ts`

- [ ] **Step 1: GET + POST エンドポイントを作成する**

```typescript
// app/api/admin/employee-db/fields/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { EmployeeFieldDef, ApiError } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }
    const db = withCompany(payload.company_id)
    const { data, error } = await db
      .select('employee_field_defs', 'id, label, category, sort_order, is_active, created_at')
      .eq('is_active', true)
      .order('sort_order')
    if (error) return NextResponse.json<ApiError>({ error: 'DB error' }, { status: 500 })
    return NextResponse.json({ fields: (data ?? []) as unknown as EmployeeFieldDef[] })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await request.json() as { label: string; category: string }
    if (!body.label?.trim()) {
      return NextResponse.json<ApiError>({ error: 'label は必須です' }, { status: 400 })
    }
    if (body.category !== 'allowance' && body.category !== 'deduction') {
      return NextResponse.json<ApiError>({ error: 'category は allowance または deduction です' }, { status: 400 })
    }
    const db = withCompany(payload.company_id)
    // sort_order = 現在の最大値 + 1
    const { data: existing } = await db
      .select('employee_field_defs', 'sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
    const maxOrder = ((existing ?? []) as unknown as { sort_order: number }[])[0]?.sort_order ?? -1
    const { data, error } = await db.insert('employee_field_defs', {
      label: body.label.trim(),
      category: body.category,
      sort_order: maxOrder + 1,
    })
    if (error) return NextResponse.json<ApiError>({ error: 'DB error' }, { status: 500 })
    const field = (data as unknown as EmployeeFieldDef[])[0]
    void writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'employee_field_def_create',
      table_name: 'employee_field_defs',
      record_id: field.id,
      new_values: { label: field.label, category: field.category },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })
    return NextResponse.json({ field }, { status: 201 })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
```

- [ ] **Step 2: DELETE エンドポイントを作成する**

```typescript
// app/api/admin/employee-db/fields/[fieldId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError } from '@/lib/types'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fieldId: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }
    const { fieldId } = await params
    const db = withCompany(payload.company_id)
    // is_active = false に切り替え（値データは保持する）
    const { error } = await db
      .update('employee_field_defs', { is_active: false })
      .eq('id', fieldId)
    if (error) return NextResponse.json<ApiError>({ error: 'DB error' }, { status: 500 })
    void writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'employee_field_def_delete',
      table_name: 'employee_field_defs',
      record_id: fieldId,
      new_values: { is_active: false },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
```

- [ ] **Step 3: ビルドを確認する**

```bash
npm run build 2>&1 | tail -5
```

Expected: エラーなし

- [ ] **Step 4: コミットする**

```bash
git add app/api/admin/employee-db/fields/route.ts app/api/admin/employee-db/fields/[fieldId]/route.ts
git commit -m "feat: add employee field defs GET/POST/DELETE APIs"
```

---

## Task 4: Employee DB GET API

**Files:**
- Create: `app/api/admin/employee-db/route.ts`

- [ ] **Step 1: 全社員・全フィールド・全値を一括取得するAPIを作成する**

```typescript
// app/api/admin/employee-db/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { EmployeeFieldDef, EmployeeFieldValue, EmployeeDbRow, ApiError } from '@/lib/types'

type UserRow = {
  id: string; employee_code: string; name: string
  salary_type: string; base_salary: number; is_active: boolean
}
type ValueRow = {
  id: string; user_id: string; field_id: string | null
  label: string; category: string; amount: number
}

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }
    const db = withCompany(payload.company_id)

    const [usersRes, defsRes, valuesRes] = await Promise.all([
      db.select('users', 'id, employee_code, name, salary_type, base_salary, is_active')
        .order('employee_code'),
      db.select('employee_field_defs', 'id, label, category, sort_order, is_active, created_at')
        .eq('is_active', true)
        .order('sort_order'),
      db.select('employee_field_values', 'id, user_id, field_id, label, category, amount'),
    ])

    const users = (usersRes.data ?? []) as unknown as UserRow[]
    const fields = (defsRes.data ?? []) as unknown as EmployeeFieldDef[]
    const allValues = (valuesRes.data ?? []) as unknown as ValueRow[]

    // user_id ごとに値をグループ化
    const valuesByUser = new Map<string, EmployeeFieldValue[]>()
    for (const v of allValues) {
      const list = valuesByUser.get(v.user_id) ?? []
      list.push({
        id: v.id,
        field_id: v.field_id,
        label: v.label,
        category: v.category as 'allowance' | 'deduction',
        amount: Number(v.amount),
      })
      valuesByUser.set(v.user_id, list)
    }

    const employees: EmployeeDbRow[] = users.map((u) => ({
      id: u.id,
      employee_code: u.employee_code,
      name: u.name,
      salary_type: u.salary_type as 'monthly' | 'hourly',
      base_salary: Number(u.base_salary ?? 0),
      is_active: u.is_active,
      values: valuesByUser.get(u.id) ?? [],
    }))

    return NextResponse.json({ fields, employees })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
```

- [ ] **Step 2: ビルドを確認する**

```bash
npm run build 2>&1 | tail -5
```

Expected: エラーなし

- [ ] **Step 3: コミットする**

```bash
git add app/api/admin/employee-db/route.ts
git commit -m "feat: add employee-db GET API (employees + field defs + values)"
```

---

## Task 5: Employee DB PUT API（1社員の保存）

**Files:**
- Create: `app/api/admin/employee-db/[userId]/route.ts`

- [ ] **Step 1: 1社員の基本給・全フィールド値を保存するAPIを作成する**

```typescript
// app/api/admin/employee-db/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { EmployeeFieldValue, ApiError } from '@/lib/types'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }
    const { userId } = await params
    const body = await request.json() as {
      salary_type: string
      base_salary: number
      values: EmployeeFieldValue[]
    }

    // バリデーション
    if (body.salary_type !== 'monthly' && body.salary_type !== 'hourly') {
      return NextResponse.json<ApiError>({ error: 'salary_type は monthly または hourly です' }, { status: 400 })
    }
    if (typeof body.base_salary !== 'number' || body.base_salary < 0) {
      return NextResponse.json<ApiError>({ error: 'base_salary は0以上の数値です' }, { status: 400 })
    }

    const db = withCompany(payload.company_id)

    // 対象社員が同一テナントか確認
    const { data: userCheck } = await db
      .select('users', 'id')
      .eq('id', userId)
      .single()
    if (!userCheck) {
      return NextResponse.json<ApiError>({ error: '社員が見つかりません' }, { status: 404 })
    }

    // 1. users テーブルの基本給・時給を更新
    await db
      .update('users', { salary_type: body.salary_type, base_salary: body.base_salary })
      .eq('id', userId)

    // 2. 既存の employee_field_values を全削除してから再挿入（replace all）
    await db.delete('employee_field_values').eq('user_id', userId)

    if (body.values.length > 0) {
      const rows = body.values.map((v) => ({
        user_id: userId,
        field_id: v.field_id ?? null,
        label: v.label,
        category: v.category,
        amount: v.amount,
      }))
      await db.insert('employee_field_values', rows)
    }

    void writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'employee_db_update',
      table_name: 'users',
      record_id: userId,
      new_values: { salary_type: body.salary_type, base_salary: body.base_salary, value_count: body.values.length },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
```

- [ ] **Step 2: ビルドを確認する**

```bash
npm run build 2>&1 | tail -5
```

Expected: エラーなし

- [ ] **Step 3: コミットする**

```bash
git add app/api/admin/employee-db/[userId]/route.ts
git commit -m "feat: add employee-db PUT API (save salary + field values)"
```

---

## Task 6: EmployeeRow コンポーネント

**Files:**
- Create: `components/admin/EmployeeRow.tsx`

- [ ] **Step 1: 1行分のコンポーネントを作成する**

```typescript
// components/admin/EmployeeRow.tsx
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
}

export function EmployeeRow({
  employee, fieldDefs, isEditing, onStartEdit, onSaved, onCancelEdit,
}: EmployeeRowProps) {
  const [salaryType, setSalaryType] = useState(employee.salary_type)
  const [baseSalary, setBaseSalary] = useState(String(employee.base_salary))
  const [values, setValues] = useState<EmployeeFieldValue[]>(employee.values)
  const [newItemLabel, setNewItemLabel] = useState('')
  const [newItemCategory, setNewItemCategory] = useState<'allowance' | 'deduction'>('allowance')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 共通列の値を取得（なければ0）
  function getSharedValue(fieldId: string): number {
    return values.find((v) => v.field_id === fieldId)?.amount ?? 0
  }

  // 個別項目（field_id = null）
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
      const res = await fetch(`/api/admin/employee-db/${employee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salary_type: salaryType,
          base_salary: parseFloat(baseSalary) || 0,
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

  const rowBg = isEditing ? 'bg-blue-50' : employee.is_active ? '' : 'opacity-50'
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
              employee.salary_type === 'monthly'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-amber-100 text-amber-800'
            }`}>
              {employee.salary_type === 'monthly' ? '月給' : '時給'}
            </span>
          )}
        </td>

        {/* 基本給/時給 */}
        <td className="px-3 py-2 text-right">
          {isEditing ? (
            <input
              type="number"
              min={0}
              value={baseSalary}
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

        {/* 共通列 */}
        {fieldDefs.map((def) => (
          <td key={def.id} className="px-3 py-2 text-right">
            {isEditing ? (
              <input
                type="number"
                min={0}
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

        {/* 個別項目バッジ / 操作ボタン */}
        <td className="px-3 py-2 text-right whitespace-nowrap">
          {!isEditing && individualValues.length > 0 && (
            <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded mr-2">
              個別 {individualValues.length}件
            </span>
          )}
          {isEditing ? (
            <div className="flex gap-1 justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-2 py-1 bg-blue-600 text-white text-xs rounded disabled:bg-blue-300"
              >
                {saving ? '...' : '保存'}
              </button>
              <button
                onClick={onCancelEdit}
                className="px-2 py-1 border border-gray-300 text-gray-600 text-xs rounded"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={onStartEdit}
              className="px-2 py-1 border border-gray-200 text-gray-500 text-xs rounded hover:border-blue-300 hover:text-blue-600"
            >
              編集
            </button>
          )}
        </td>
      </tr>

      {/* 個別項目（編集モード時のみ展開） */}
      {isEditing && (
        <tr className="bg-blue-50 border-b border-blue-200">
          <td colSpan={4 + fieldDefs.length} className="px-4 py-2">
            <div className="flex flex-wrap gap-2 items-start">
              <span className="text-xs text-amber-600 font-medium pt-1">個別項目:</span>
              {individualValues.map((v, i) => (
                <div key={i} className="flex items-center gap-1 bg-white border border-amber-200 rounded px-2 py-1">
                  <span className="text-xs text-amber-700">{v.label}</span>
                  <input
                    type="number"
                    min={0}
                    value={v.amount}
                    onChange={(e) => updateIndividualAmount(i, parseFloat(e.target.value) || 0)}
                    className="w-16 border border-amber-200 rounded px-1 text-xs text-right"
                  />
                  <button onClick={() => removeIndividualItem(i)} className="text-red-400 text-xs hover:text-red-600">✕</button>
                </div>
              ))}
              {/* 新規個別項目追加 */}
              <div className="flex items-center gap-1">
                <input
                  placeholder="項目名"
                  value={newItemLabel}
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
                <button
                  onClick={addIndividualItem}
                  className="text-xs text-amber-600 border border-dashed border-amber-300 rounded px-1.5 py-0.5 hover:bg-amber-50"
                >
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
```

- [ ] **Step 2: ビルドを確認する**

```bash
npm run build 2>&1 | tail -5
```

Expected: エラーなし

- [ ] **Step 3: コミットする**

```bash
git add components/admin/EmployeeRow.tsx
git commit -m "feat: add EmployeeRow component with inline edit and individual items"
```

---

## Task 7: FieldDefPanel コンポーネント（列管理パネル）

**Files:**
- Create: `components/admin/FieldDefPanel.tsx`

- [ ] **Step 1: 列管理サイドパネルを作成する**

```typescript
// components/admin/FieldDefPanel.tsx
'use client'

import { useState } from 'react'
import type { EmployeeFieldDef } from '@/lib/types'

interface FieldDefPanelProps {
  fields: EmployeeFieldDef[]
  onAdded: (field: EmployeeFieldDef) => void
  onDeleted: (fieldId: string) => void
  onClose: () => void
}

export function FieldDefPanel({ fields, onAdded, onDeleted, onClose }: FieldDefPanelProps) {
  const [label, setLabel] = useState('')
  const [category, setCategory] = useState<'allowance' | 'deduction'>('allowance')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleAdd() {
    if (!label.trim()) return
    setAdding(true)
    setError('')
    try {
      const res = await fetch('/api/admin/employee-db/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), category }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '追加に失敗しました')
        return
      }
      onAdded(data.field as EmployeeFieldDef)
      setLabel('')
    } catch {
      setError('ネットワークエラー')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(field: EmployeeFieldDef) {
    if (!confirm(`「${field.label}」を削除しますか？\n設定済みの値データは保持されます。`)) return
    setDeletingId(field.id)
    try {
      const res = await fetch(`/api/admin/employee-db/fields/${field.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? '削除に失敗しました')
        return
      }
      onDeleted(field.id)
    } catch {
      setError('ネットワークエラー')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="w-52 border-l border-blue-200 bg-blue-50 flex flex-col flex-shrink-0">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-blue-200">
        <span className="text-sm font-semibold text-blue-700">⚙ 列管理</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
      </div>

      {/* 共通列リスト */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <p className="text-xs text-gray-400 mb-1">共通列（全員に表示）</p>
        {fields.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">列がありません</p>
        )}
        {fields.map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between bg-white border border-gray-200 rounded px-2 py-1.5 text-xs"
          >
            <span className="truncate flex-1">{f.label}</span>
            <span className={`ml-1 font-medium flex-shrink-0 ${
              f.category === 'allowance' ? 'text-green-600' : 'text-red-500'
            }`}>
              {f.category === 'allowance' ? '手当' : '控除'}
            </span>
            <button
              onClick={() => handleDelete(f)}
              disabled={deletingId === f.id}
              className="ml-1 text-gray-300 hover:text-red-400 flex-shrink-0 disabled:text-gray-200"
              title="削除"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* 新規追加フォーム */}
      <div className="border-t border-blue-200 p-2 space-y-1.5">
        <p className="text-xs text-gray-500">新しい列を追加</p>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="列名（例: 役職手当）"
          className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
        />
        <div className="flex gap-1">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as 'allowance' | 'deduction')}
            className="flex-1 border border-gray-200 rounded px-1 py-1 text-xs"
          >
            <option value="allowance">手当</option>
            <option value="deduction">控除</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={adding || !label.trim()}
            className="px-2 py-1 bg-blue-600 text-white text-xs rounded disabled:bg-blue-300"
          >
            追加
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <p className="text-xs text-gray-400">※個別項目は各社員の行で追加</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: ビルドを確認する**

```bash
npm run build 2>&1 | tail -5
```

Expected: エラーなし

- [ ] **Step 3: コミットする**

```bash
git add components/admin/FieldDefPanel.tsx
git commit -m "feat: add FieldDefPanel component for column management"
```

---

## Task 8: EmployeeDbClient コンポーネント（スプレッドシート本体）

**Files:**
- Create: `components/admin/EmployeeDbClient.tsx`

- [ ] **Step 1: スプレッドシートのメインClient Componentを作成する**

```typescript
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
    const headers = ['社員番号', '氏名', '種別', '基本給/時給', ...fieldDefs.map((f) => f.label)]
    const rows = employees.map((emp) => [
      emp.employee_code,
      emp.name,
      emp.salary_type === 'monthly' ? '月給' : '時給',
      emp.base_salary,
      ...fieldDefs.map((f) => emp.values.find((v) => v.field_id === f.id)?.amount ?? 0),
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
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
      {/* ツールバー */}
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

      {/* スプレッドシート ＋ サイドパネル */}
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

        {/* 列管理パネル */}
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
```

- [ ] **Step 2: ビルドを確認する**

```bash
npm run build 2>&1 | tail -5
```

Expected: エラーなし

- [ ] **Step 3: コミットする**

```bash
git add components/admin/EmployeeDbClient.tsx
git commit -m "feat: add EmployeeDbClient spreadsheet component with CSV export"
```

---

## Task 9: ページ + サイドバーリンク追加

**Files:**
- Create: `app/admin/employee-db/page.tsx`
- Modify: `components/AdminSidebar.tsx`

- [ ] **Step 1: Server Component ページを作成する**

```typescript
// app/admin/employee-db/page.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { AdminSidebar } from '@/components/AdminSidebar'
import { EmployeeDbClient } from '@/components/admin/EmployeeDbClient'
import type { EmployeeDbRow, EmployeeFieldDef, EmployeeFieldValue } from '@/lib/types'

type UserRow = {
  id: string; employee_code: string; name: string
  salary_type: string; base_salary: number; is_active: boolean
}
type ValueRow = {
  id: string; user_id: string; field_id: string | null
  label: string; category: string; amount: number
}

export default async function EmployeeDbPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin' && payload.role !== 'manager') redirect('/dashboard')

  const db = withCompany(payload.company_id)

  const [usersRes, defsRes, valuesRes] = await Promise.all([
    db.select('users', 'id, employee_code, name, salary_type, base_salary, is_active')
      .order('employee_code'),
    db.select('employee_field_defs', 'id, label, category, sort_order, is_active, created_at')
      .eq('is_active', true)
      .order('sort_order'),
    db.select('employee_field_values', 'id, user_id, field_id, label, category, amount'),
  ])

  const users = (usersRes.data ?? []) as unknown as UserRow[]
  const fields = (defsRes.data ?? []) as unknown as EmployeeFieldDef[]
  const allValues = (valuesRes.data ?? []) as unknown as ValueRow[]

  const valuesByUser = new Map<string, EmployeeFieldValue[]>()
  for (const v of allValues) {
    const list = valuesByUser.get(v.user_id) ?? []
    list.push({
      id: v.id,
      field_id: v.field_id,
      label: v.label,
      category: v.category as 'allowance' | 'deduction',
      amount: Number(v.amount),
    })
    valuesByUser.set(v.user_id, list)
  }

  const employees: EmployeeDbRow[] = users.map((u) => ({
    id: u.id,
    employee_code: u.employee_code,
    name: u.name,
    salary_type: u.salary_type as 'monthly' | 'hourly',
    base_salary: Number(u.base_salary ?? 0),
    is_active: u.is_active,
    values: valuesByUser.get(u.id) ?? [],
  }))

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={payload.name} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <EmployeeDbClient initialEmployees={employees} initialFields={fields} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: AdminSidebar に「社員DB」リンクを追加する**

`components/AdminSidebar.tsx` の `navItems` 配列の `'/admin/users'` エントリの直前に追加:

```typescript
  {
    href: '/admin/employee-db',
    label: '社員DB',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M3 6h18M3 18h18" />
      </svg>
    ),
  },
```

- [ ] **Step 3: 最終ビルドを確認する**

```bash
npm run build 2>&1 | grep -E "error|warning|employee-db|Route"
```

Expected:
- `/admin/employee-db` が動的ルートとして一覧に表示される
- エラーなし

- [ ] **Step 4: Lint を確認する**

```bash
npm run lint 2>&1 | tail -5
```

Expected: エラーなし

- [ ] **Step 5: コミット＆プッシュする**

```bash
git add app/admin/employee-db/page.tsx components/AdminSidebar.tsx components/admin/
git commit -m "feat: add /admin/employee-db spreadsheet page with sidebar link"
git push origin main
```

---

## 動作確認チェックリスト（実装完了後）

- [ ] Supabase Dashboard で `employee_field_defs` / `employee_field_values` テーブルが作成されている
- [ ] `/admin/employee-db` にアクセスして社員一覧が表示される
- [ ] 「⚙ 列管理」パネルが開閉できる
- [ ] 列を追加するとテーブルに新しい列が現れる
- [ ] 社員行の「編集」を押してインライン入力 → 「保存」で値が反映される
- [ ] 編集モードで個別項目を追加・削除できる
- [ ] 「CSV出力」でExcel対応のBOM付きCSVがダウンロードされる
- [ ] AdminSidebar に「社員DB」リンクが表示され、クリックで遷移する
