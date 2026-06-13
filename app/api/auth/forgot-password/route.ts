import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomInt } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { ApiError } from '@/lib/types'

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let result = ''
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(randomInt(chars.length))
  }
  return result
}

export async function POST(request: NextRequest) {
  try {
    const { company_code, employee_code } = await request.json() as {
      company_code: string
      employee_code: string
    }

    if (!company_code || !employee_code) {
      return NextResponse.json<ApiError>({ error: '会社IDと社員番号を入力してください' }, { status: 400 })
    }

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('company_code', company_code.trim().toUpperCase())
      .single()

    if (!company) {
      // セキュリティ上、成功と同じメッセージを返す
      return NextResponse.json({ ok: true })
    }

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .eq('company_id', company.id)
      .eq('employee_code', employee_code.trim().toUpperCase())
      .eq('is_active', true)
      .single()

    if (!user) {
      return NextResponse.json({ ok: true })
    }

    const typedUser = user as { id: string; name: string; email: string | null }

    // メール送信できない場合はパスワードをリセットしない（管理者経由でのリセットを促す）
    if (!process.env.RESEND_API_KEY || !typedUser.email) {
      return NextResponse.json({ ok: true, requireAdmin: true })
    }

    const tempPassword = generateTempPassword()
    const passwordHash = await bcrypt.hash(tempPassword, 10)

    const { sendPasswordReset } = await import('@/lib/email/resend')
    await sendPasswordReset({
      to: typedUser.email,
      name: typedUser.name,
      tempPassword,
    })

    // メール送信成功後にのみパスワードを更新する
    await supabaseAdmin
      .from('users')
      .update({
        password_hash: passwordHash,
        force_password_change: true,
        failed_login_count: 0,
        locked_until: null,
      })
      .eq('id', typedUser.id)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
