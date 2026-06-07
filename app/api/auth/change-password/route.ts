import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    const body = await request.json() as { current_password?: string; new_password?: string }
    const { current_password, new_password } = body

    if (!current_password || !new_password) {
      return NextResponse.json<ApiError>(
        { error: '現在のパスワードと新しいパスワードを入力してください' },
        { status: 400 }
      )
    }
    if (new_password.length < 8) {
      return NextResponse.json<ApiError>(
        { error: '新しいパスワードは8文字以上にしてください' },
        { status: 400 }
      )
    }

    const db = withCompany(payload.company_id)
    const { data: user } = await db
      .select('users', 'id, password_hash')
      .eq('id', payload.user_id)
      .single()

    if (!user) {
      return NextResponse.json<ApiError>({ error: 'ユーザーが見つかりません' }, { status: 404 })
    }

    type UserRow = { id: string; password_hash: string }
    const valid = await bcrypt.compare(current_password, (user as unknown as UserRow).password_hash)
    if (!valid) {
      return NextResponse.json<ApiError>({ error: '現在のパスワードが正しくありません' }, { status: 400 })
    }

    const newHash = await bcrypt.hash(new_password, 12)
    await db.update('users', { password_hash: newHash, force_password_change: false })
      .eq('id', payload.user_id)

    await writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'change_password',
      table_name: 'users',
      record_id: payload.user_id,
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
