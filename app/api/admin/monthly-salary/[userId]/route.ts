import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { supabaseAdmin } from '@/lib/supabase/admin'
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
    const url   = new URL(request.url)
    const year  = parseInt(url.searchParams.get('year')  ?? '')
    const month = parseInt(url.searchParams.get('month') ?? '')
    if (!year || !month) {
      return NextResponse.json<ApiError>({ error: '年月が必要です' }, { status: 400 })
    }

    const body = await request.json() as {
      salary_type: string
      base_salary: number
      overtime_hourly_rate?: number | null
      values: EmployeeFieldValue[]
    }

    if (body.salary_type !== 'monthly' && body.salary_type !== 'hourly') {
      return NextResponse.json<ApiError>({ error: 'salary_type は monthly または hourly です' }, { status: 400 })
    }

    const db = withCompany(payload.company_id)

    // 対象ユーザーが同一会社か確認
    const { data: userCheck } = await db.select('users', 'id').eq('id', userId).single()
    if (!userCheck) {
      return NextResponse.json<ApiError>({ error: '社員が見つかりません' }, { status: 404 })
    }

    // salary_type, base_salary を users テーブルに保存（未来月のフォールバック用）
    await db.update('users', {
      salary_type:  body.salary_type,
      base_salary:  body.base_salary,
    }).eq('id', userId)

    // salary_type, base_salary をこの月専用に保存（過去月を凍結するため）
    await supabaseAdmin
      .from('monthly_salary_config')
      .upsert(
        {
          company_id:           payload.company_id,
          user_id:              userId,
          year,
          month,
          salary_type:          body.salary_type,
          base_salary:          body.base_salary,
          overtime_hourly_rate: body.overtime_hourly_rate ?? null,
        },
        { onConflict: 'company_id,user_id,year,month' }
      )

    // 手当・控除は月別（monthly_salary_values テーブル）
    await supabaseAdmin
      .from('monthly_salary_values')
      .delete()
      .eq('company_id', payload.company_id)
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month)

    if (body.values.length > 0) {
      const rows = body.values.map((v) => ({
        company_id: payload.company_id,
        user_id:    userId,
        year,
        month,
        field_id:   v.field_id ?? null,
        label:      v.label,
        category:   v.category,
        amount:     v.amount,
      }))
      await supabaseAdmin.from('monthly_salary_values').insert(rows)
    }

    void writeAuditLog({
      company_id: payload.company_id,
      user_id:    payload.user_id,
      action:     'monthly_salary_update',
      table_name: 'monthly_salary_values',
      record_id:  userId,
      new_values: { year, month, salary_type: body.salary_type, base_salary: body.base_salary, value_count: body.values.length },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
