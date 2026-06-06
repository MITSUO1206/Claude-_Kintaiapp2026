import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { signJWT } from '@/lib/auth/jwt'
import { writeAuditLog } from '@/lib/audit/log'
import type { Company, User, ApiError } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
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

    const passwordMatch = await bcrypt.compare(password, (user as User).password_hash)
    if (!passwordMatch) {
      return NextResponse.json<ApiError>(
        { error: 'IDまたはパスワードが正しくありません' },
        { status: 401 }
      )
    }

    const typedUser = user as User

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
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
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
