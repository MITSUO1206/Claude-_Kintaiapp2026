import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError, WorkRule } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    const db = withCompany(payload.company_id)

    const { data: rule } = await db.select('work_rules', '*').single()

    if (!rule) {
      return NextResponse.json<ApiError>({ error: '就業規則が見つかりません' }, { status: 404 })
    }

    return NextResponse.json({ rule: rule as unknown as WorkRule })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }
    const db = withCompany(payload.company_id)

    const body = await request.json() as Record<string, unknown>
    const allowed = [
      'work_hours_per_day', 'work_days_per_month',
      'closing_day', 'payment_day',
      'overtime_alert_hours', 'overtime_limit_hours', 'overtime_annual_limit',
      'holiday_weekdays', 'payment_on_holiday',
    ]
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    const { data: existing } = await db.select('work_rules', 'id').single()
    if (!existing) {
      const { error } = await db.raw
        .from('work_rules')
        .insert({ company_id: payload.company_id, ...updates })
      if (error) {
        return NextResponse.json<ApiError>({ error: '作成に失敗しました' }, { status: 500 })
      }
    } else {
      const { error } = await db.update('work_rules', updates)
        .eq('company_id', payload.company_id)
      if (error) {
        return NextResponse.json<ApiError>({ error: '更新に失敗しました' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
