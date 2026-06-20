import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError } from '@/lib/types'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: '権限がありません' }, { status: 403 })
    }

    const { id } = await params
    const db = withCompany(payload.company_id)

    const { data: user } = await db
      .select('users', 'id, employee_code, name, email, role, salary_type, base_salary, commuting_allowance, resident_tax, hired_at, is_active, force_password_change')
      .eq('id', id)
      .single()

    if (!user) {
      return NextResponse.json<ApiError>({ error: '社員が見つかりません' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json() as Record<string, unknown>
    const db = withCompany(payload.company_id)

    const allowed = ['name', 'email', 'role', 'salary_type', 'base_salary', 'commuting_allowance', 'resident_tax', 'hired_at', 'is_active', 'force_password_change', 'employment_type', 'weekly_working_days', 'work_rule_pattern_id']
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json<ApiError>({ error: '更新項目がありません' }, { status: 400 })
    }

    const { data: before } = await db
      .select('users', 'id, name, role')
      .eq('id', id)
      .single()

    if (!before) {
      return NextResponse.json<ApiError>({ error: '社員が見つかりません' }, { status: 404 })
    }

    const { error } = await db.update('users', updates).eq('id', id)
    if (error) {
      return NextResponse.json<ApiError>({ error: '更新に失敗しました' }, { status: 500 })
    }

    await writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'user_update',
      table_name: 'users',
      record_id: id,
      old_values: before as unknown as Record<string, unknown>,
      new_values: updates,
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }

    const { id } = await params
    if (id === payload.user_id) {
      return NextResponse.json<ApiError>({ error: '自分自身を無効化できません' }, { status: 400 })
    }

    const db = withCompany(payload.company_id)

    const { error } = await db.update('users', { is_active: false }).eq('id', id)
    if (error) {
      return NextResponse.json<ApiError>({ error: '無効化に失敗しました' }, { status: 500 })
    }

    await writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'user_deactivate',
      table_name: 'users',
      record_id: id,
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
