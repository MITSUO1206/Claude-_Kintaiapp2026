'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface UserFormData {
  employee_code: string
  name: string
  email: string
  role: string
  salary_type: string
  base_salary: string
  commuting_allowance: string
  resident_tax: string
  hired_at: string
  password: string
}

interface Props {
  mode: 'create' | 'edit'
  userId?: string
  initial?: Partial<UserFormData>
}

const ROLE_LABELS: Record<string, string> = { employee: '一般社員', manager: 'マネージャー', admin: '管理者' }

export function UserForm({ mode, userId, initial }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<UserFormData>({
    employee_code: initial?.employee_code ?? '',
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    role: initial?.role ?? 'employee',
    salary_type: initial?.salary_type ?? 'monthly',
    base_salary: initial?.base_salary ?? '0',
    commuting_allowance: initial?.commuting_allowance ?? '0',
    resident_tax: initial?.resident_tax ?? '0',
    hired_at: initial?.hired_at ?? '',
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(field: keyof UserFormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const body: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        role: form.role,
        salary_type: form.salary_type,
        base_salary: parseFloat(form.base_salary) || 0,
        commuting_allowance: parseFloat(form.commuting_allowance) || 0,
        resident_tax: parseFloat(form.resident_tax) || 0,
        hired_at: form.hired_at,
      }

      if (mode === 'create') {
        body.employee_code = form.employee_code
        body.password = form.password
      }
      if (mode === 'edit' && form.password) {
        body.password = form.password
      }

      const url = mode === 'create' ? '/api/admin/users' : `/api/admin/users/${userId}`
      const method = mode === 'create' ? 'POST' : 'PATCH'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '処理に失敗しました'); return }

      router.push('/admin/users')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-lg">
      {mode === 'create' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">社員番号 *</label>
          <input type="text" value={form.employee_code} onChange={(e) => set('employee_code', e.target.value)} required
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">氏名 *</label>
        <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} required
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
        <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">権限</label>
          <select value={form.role} onChange={(e) => set('role', e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">給与形態</label>
          <select value={form.salary_type} onChange={(e) => set('salary_type', e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="monthly">月給</option>
            <option value="hourly">時給</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {form.salary_type === 'hourly' ? '時給（円）' : '基本給（円/月）'}
        </label>
        <input type="number" min="0" value={form.base_salary} onChange={(e) => set('base_salary', e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">通勤手当（円/月）</label>
          <input type="number" min="0" value={form.commuting_allowance} onChange={(e) => set('commuting_allowance', e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">住民税（円/月）</label>
          <input type="number" min="0" value={form.resident_tax} onChange={(e) => set('resident_tax', e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">入社日 *</label>
        <input type="date" value={form.hired_at} onChange={(e) => set('hired_at', e.target.value)} required
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {mode === 'create' ? 'パスワード *' : 'パスワード変更（空欄で変更なし）'}
        </label>
        <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)}
          required={mode === 'create'}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? '処理中...' : mode === 'create' ? '登録' : '更新'}
        </button>
        <button type="button" onClick={() => router.back()}
          className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
          キャンセル
        </button>
      </div>
    </form>
  )
}

export default UserForm
