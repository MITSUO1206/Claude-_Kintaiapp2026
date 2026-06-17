import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { ApiError } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      company_code: string
      employee_code: string
      action: 'verify' | 'reset'
      new_password?: string
    }
    const { company_code, employee_code, action, new_password } = body

    if (!company_code || !employee_code) {
      return NextResponse.json<ApiError>({ error: '会社IDと社員番号を入力してください' }, { status: 400 })
    }

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('company_code', company_code.trim())
      .single()

    if (!company) {
      return NextResponse.json({ ok: true })
    }

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, name')
      .eq('company_id', company.id)
      .eq('employee_code', employee_code.trim())
      .eq('is_active', true)
      .single()

    if (!user) {
      return NextResponse.json({ ok: true })
    }

    if (action === 'verify') {
      return NextResponse.json({ ok: true, verified: true })
    }

    // action === 'reset'
    if (!new_password || new_password.length < 8) {
      return NextResponse.json<ApiError>({ error: 'パスワードは8文字以上で入力してください' }, { status: 400 })
    }

    const typedUser = user as { id: string; name: string }
    const passwordHash = await bcrypt.hash(new_password, 10)

    await supabaseAdmin
      .from('users')
      .update({
        password_hash: passwordHash,
        force_password_change: false,
        failed_login_count: 0,
        locked_until: null,
      })
      .eq('id', typedUser.id)

    return NextResponse.json({ ok: true, reset: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
