import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import bcrypt from 'bcryptjs'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { sendPasswordReset } from '@/lib/email/resend'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError } from '@/lib/types'

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let result = ''
  for (let i = 0; i < 16; i++) {
    result += chars[randomInt(chars.length)]
  }
  return result
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }

    const { id } = await params
    const db = withCompany(payload.company_id)

    const { data: user } = await db
      .select('users', 'id, name, email, employee_code')
      .eq('id', id)
      .single()

    type UserRow = { id: string; name: string; email: string; employee_code: string }
    const target = user as unknown as UserRow | null

    if (!target) {
      return NextResponse.json<ApiError>({ error: '社員が見つかりません' }, { status: 404 })
    }

    const tempPassword = generateTempPassword()
    const hash = await bcrypt.hash(tempPassword, 12)

    const { error } = await db
      .update('users', {
        password_hash: hash,
        force_password_change: true,
      })
      .eq('id', id)

    if (error) {
      return NextResponse.json<ApiError>({ error: 'パスワードリセットに失敗しました' }, { status: 500 })
    }

    if (target.email) {
      sendPasswordReset({
        to: target.email,
        name: target.name,
        tempPassword,
      }).catch(() => undefined)
    }

    await writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'password_reset',
      table_name: 'users',
      record_id: id,
      new_values: { force_password_change: true },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({
      success: true,
      temp_password: target.email ? null : tempPassword,
      message: target.email
        ? `${target.name}さんにパスワードリセットメールを送信しました`
        : `仮パスワード: ${tempPassword}（メールアドレス未設定のため直接確認してください）`,
    })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
