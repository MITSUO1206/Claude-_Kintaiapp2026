import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { ApiError } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: '権限がありません' }, { status: 403 })
    }

    const body = await request.json() as {
      user_id: string
      fiscal_year: number
      total_days: number
      note?: string | null
    }

    if (!body.user_id || !body.fiscal_year || body.total_days == null) {
      return NextResponse.json<ApiError>({ error: '必須項目が不足しています' }, { status: 400 })
    }

    // 対象ユーザーが同一会社に属するか確認（IDOR防止）
    const { data: targetUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', body.user_id)
      .eq('company_id', payload.company_id)
      .single()
    if (!targetUser) {
      return NextResponse.json<ApiError>({ error: '社員が見つかりません' }, { status: 404 })
    }

    const today = new Date().toISOString().slice(0, 10)

    // leave_grants に手動付与レコードを挿入（同日付は上書き）
    await supabaseAdmin.from('leave_grants').upsert({
      company_id:   payload.company_id,
      user_id:      body.user_id,
      grant_date:   today,
      granted_days: body.total_days,
      basis:        'manual',
      note:         body.note ?? null,
    }, { onConflict: 'company_id,user_id,grant_date', ignoreDuplicates: false })

    // leave_balances を upsert（fiscal_year + user_id で管理）
    const { data: lb } = await supabaseAdmin
      .from('leave_balances')
      .select('id, used_days')
      .eq('company_id', payload.company_id)
      .eq('user_id', body.user_id)
      .eq('fiscal_year', body.fiscal_year)
      .single()

    if (lb) {
      await supabaseAdmin
        .from('leave_balances')
        .update({ total_days: body.total_days })
        .eq('id', (lb as { id: string; used_days: number }).id)
    } else {
      await supabaseAdmin.from('leave_balances').insert({
        company_id:  payload.company_id,
        user_id:     body.user_id,
        fiscal_year: body.fiscal_year,
        total_days:  body.total_days,
        used_days:   0,
      })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
