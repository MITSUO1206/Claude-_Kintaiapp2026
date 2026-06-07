import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { signJWT } from '@/lib/auth/jwt'
import { writeAuditLog } from '@/lib/audit/log'
import { checkRateLimit } from '@/lib/ratelimit'
import type { Company, User, ApiError } from '@/lib/types'

const LOCK_THRESHOLD = 5
const LOCK_MINUTES = 30

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, remaining } = await checkRateLimit(`login:${ip}`)
    if (!allowed) {
      return NextResponse.json<ApiError>(
        { error: 'ログイン試行回数の上限に達しました。1分後に再試行してください', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'X-RateLimit-Remaining': String(remaining) } }
      )
    }

    const body = await request.json()
    const { company_code, employee_code, password } = body

    if (!company_code || !employee_code || !password) {
      return NextResponse.json<ApiError>(
        { error: 'すべての項目を入力してください' },
        { status: 400 }
      )
    }

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('*')
      .eq('company_code', company_code)
      .single()

    if (companyError || !company) {
      return NextResponse.json<ApiError>(
        { error: 'IDまたはパスワードが正しくありません' },
        { status: 401 }
      )
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('company_id', (company as Company).id)
      .eq('employee_code', employee_code)
      .eq('is_active', true)
      .single()

    if (userError || !user) {
      return NextResponse.json<ApiError>(
        { error: 'IDまたはパスワードが正しくありません' },
        { status: 401 }
      )
    }

    const typedUser = user as User & { failed_login_count: number; locked_until: string | null }

    // アカウントロック確認
    if (typedUser.locked_until && new Date(typedUser.locked_until) > new Date()) {
      const remaining = Math.ceil(
        (new Date(typedUser.locked_until).getTime() - Date.now()) / 60000
      )
      return NextResponse.json<ApiError>(
        { error: `アカウントがロックされています。あと約${remaining}分後に再試行してください`, code: 'ACCOUNT_LOCKED' },
        { status: 423 }
      )
    }

    const passwordMatch = await bcrypt.compare(password, typedUser.password_hash)
    if (!passwordMatch) {
      const newCount = (typedUser.failed_login_count ?? 0) + 1
      const updates: Record<string, unknown> = { failed_login_count: newCount }
      if (newCount >= LOCK_THRESHOLD) {
        updates.locked_until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString()
      }
      await supabaseAdmin.from('users').update(updates).eq('id', typedUser.id)

      return NextResponse.json<ApiError>(
        { error: 'IDまたはパスワードが正しくありません' },
        { status: 401 }
      )
    }

    // ログイン成功: 失敗カウントリセット
    await supabaseAdmin.from('users').update({
      failed_login_count: 0,
      locked_until: null,
    }).eq('id', typedUser.id)

    const token = await signJWT({
      user_id: typedUser.id,
      company_id: typedUser.company_id,
      role: typedUser.role,
      employee_code: typedUser.employee_code,
      name: typedUser.name,
    })

    await writeAuditLog({
      company_id: typedUser.company_id,
      user_id: typedUser.id,
      action: 'login',
      ip_address: ip,
    })

    const response = NextResponse.json({
      user: {
        id: typedUser.id,
        name: typedUser.name,
        role: typedUser.role,
        company_id: typedUser.company_id,
        force_password_change: typedUser.force_password_change,
      },
    })

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json<ApiError>(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    )
  }
}
