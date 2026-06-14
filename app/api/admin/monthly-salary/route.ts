import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { ApiError } from '@/lib/types'

// GET: 指定月の全ユーザー分の値を取得
export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: '権限がありません' }, { status: 403 })
    }

    const url   = new URL(request.url)
    const year  = parseInt(url.searchParams.get('year')  ?? '')
    const month = parseInt(url.searchParams.get('month') ?? '')
    if (!year || !month) {
      return NextResponse.json<ApiError>({ error: '年月が必要です' }, { status: 400 })
    }

    const [valuesRes, configsRes] = await Promise.all([
      supabaseAdmin
        .from('monthly_salary_values')
        .select('id, user_id, field_id, label, category, amount')
        .eq('company_id', payload.company_id)
        .eq('year', year)
        .eq('month', month),
      supabaseAdmin
        .from('monthly_salary_config')
        .select('user_id, salary_type, base_salary, overtime_hourly_rate')
        .eq('company_id', payload.company_id)
        .eq('year', year)
        .eq('month', month),
    ])

    return NextResponse.json({ values: valuesRes.data ?? [], configs: configsRes.data ?? [] })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}

// POST: 前月分を当月にコピー（全ユーザー）
export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }

    const body = await request.json() as { year: number; month: number }
    const { year, month } = body
    if (!year || !month) {
      return NextResponse.json<ApiError>({ error: '年月が必要です' }, { status: 400 })
    }

    const prevYear  = month === 1 ? year - 1 : year
    const prevMonth = month === 1 ? 12 : month - 1

    // 前月のデータを取得（手当/控除 + 基本給設定）
    const [prevValuesRes, prevConfigsRes] = await Promise.all([
      supabaseAdmin
        .from('monthly_salary_values')
        .select('company_id, user_id, field_id, label, category, amount')
        .eq('company_id', payload.company_id)
        .eq('year', prevYear)
        .eq('month', prevMonth),
      supabaseAdmin
        .from('monthly_salary_config')
        .select('company_id, user_id, salary_type, base_salary, overtime_hourly_rate')
        .eq('company_id', payload.company_id)
        .eq('year', prevYear)
        .eq('month', prevMonth),
    ])

    const prevData    = prevValuesRes.data
    const prevConfigs = prevConfigsRes.data

    if ((!prevData || prevData.length === 0) && (!prevConfigs || prevConfigs.length === 0)) {
      return NextResponse.json({ ok: true, copied: 0, message: '前月のデータがありません' })
    }

    // 当月のデータを全削除
    await Promise.all([
      supabaseAdmin.from('monthly_salary_values').delete()
        .eq('company_id', payload.company_id).eq('year', year).eq('month', month),
      supabaseAdmin.from('monthly_salary_config').delete()
        .eq('company_id', payload.company_id).eq('year', year).eq('month', month),
    ])

    // 前月データを当月としてコピー（手当/控除）
    type PrevRow = { company_id: string; user_id: string; field_id: string | null; label: string; category: string; amount: number }
    const newRows = ((prevData ?? []) as unknown as PrevRow[]).map((row) => ({
      company_id: row.company_id, user_id: row.user_id, year, month,
      field_id: row.field_id, label: row.label, category: row.category, amount: row.amount,
    }))
    if (newRows.length > 0) await supabaseAdmin.from('monthly_salary_values').insert(newRows)

    // 前月データを当月としてコピー（基本給設定）
    type PrevConfig = { company_id: string; user_id: string; salary_type: string; base_salary: number; overtime_hourly_rate: number | null }
    const newConfigs = ((prevConfigs ?? []) as unknown as PrevConfig[]).map((c) => ({
      company_id: c.company_id, user_id: c.user_id, year, month,
      salary_type: c.salary_type, base_salary: c.base_salary,
      overtime_hourly_rate: c.overtime_hourly_rate,
    }))
    if (newConfigs.length > 0) await supabaseAdmin.from('monthly_salary_config').insert(newConfigs)

    return NextResponse.json({ ok: true, copied: newRows.length + newConfigs.length })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
