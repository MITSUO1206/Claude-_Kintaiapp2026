import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: '権限がありません' }, { status: 403 })
    }

    const url = new URL(request.url)
    const includeInactive = url.searchParams.get('inactive') === 'true'

    const db = withCompany(payload.company_id)
    let query = db
      .select('users', 'id, employee_code, name, email, role, salary_type, base_salary, commuting_allowance, resident_tax, hired_at, is_active, force_password_change, created_at')
      .order('employee_code', { ascending: true })

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json<ApiError>({ error: 'データ取得に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ users: data ?? [] })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }

    const body = await request.json() as {
      employee_code: string
      name: string
      email?: string
      role: string
      salary_type: string
      base_salary: number
      commuting_allowance?: number
      resident_tax?: number
      hired_at: string
      employment_type?: string
      weekly_working_days?: number
      password: string
    }

    if (!body.employee_code?.trim() || !body.name?.trim() || !body.password?.trim() || !body.hired_at) {
      return NextResponse.json<ApiError>({ error: '必須項目が不足しています' }, { status: 400 })
    }

    if (!['employee', 'manager', 'admin'].includes(body.role)) {
      return NextResponse.json<ApiError>({ error: '権限が不正です' }, { status: 400 })
    }
    if (!['monthly', 'hourly'].includes(body.salary_type)) {
      return NextResponse.json<ApiError>({ error: '給与形態が不正です' }, { status: 400 })
    }

    const db = withCompany(payload.company_id)

    const { data: existing } = await db
      .select('users', 'id')
      .eq('employee_code', body.employee_code.trim())
      .single()

    if (existing) {
      return NextResponse.json<ApiError>({ error: 'この社員番号はすでに使用されています' }, { status: 409 })
    }

    const password_hash = await bcrypt.hash(body.password, 12)

    const { data, error } = await db.insert('users', {
      employee_code: body.employee_code.trim(),
      name: body.name.trim(),
      email: body.email?.trim() ?? '',
      role: body.role,
      salary_type: body.salary_type,
      base_salary: body.base_salary ?? 0,
      commuting_allowance: body.commuting_allowance ?? 0,
      resident_tax: body.resident_tax ?? 0,
      hired_at: body.hired_at,
      employment_type: body.employment_type ?? 'full_time',
      weekly_working_days: body.weekly_working_days ?? 5,
      password_hash,
      force_password_change: true,
      is_active: true,
    })

    if (error) {
      console.error('user create error:', error)
      return NextResponse.json<ApiError>({ error: '社員の作成に失敗しました', code: error.code }, { status: 500 })
    }

    const inserted = Array.isArray(data) ? data[0] : data

    await writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'user_create',
      table_name: 'users',
      new_values: { employee_code: body.employee_code, name: body.name, role: body.role },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ user: inserted }, { status: 201 })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
