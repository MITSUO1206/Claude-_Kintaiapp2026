import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { sendRequestNotification } from '@/lib/email/resend'
import type { ApiError, Request } from '@/lib/types'

const VALID_TYPES = ['leave_paid', 'leave_special', 'overtime', 'attendance_fix'] as const

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    const db = withCompany(payload.company_id)

    const body = await request.json() as {
      type: string
      target_date?: string
      reason: string
      note?: string
    }

    if (!VALID_TYPES.includes(body.type as never)) {
      return NextResponse.json<ApiError>(
        { error: '申請種別が不正です', code: 'INVALID_TYPE' },
        { status: 400 }
      )
    }

    if (!body.reason?.trim()) {
      return NextResponse.json<ApiError>(
        { error: '申請理由は必須です', code: 'REASON_REQUIRED' },
        { status: 400 }
      )
    }

    const { data, error } = await db.insert('requests', {
      user_id: payload.user_id,
      type: body.type,
      target_date: body.target_date ?? null,
      reason: body.reason.trim(),
      note: body.note?.trim() ?? null,
      status: 'pending',
    })

    if (error) {
      console.error('requests insert error:', error)
      return NextResponse.json<ApiError>({ error: '申請の作成に失敗しました' }, { status: 500 })
    }

    const inserted = (Array.isArray(data) ? data[0] : data) as unknown as Request

    // manager/admin にメール通知（非同期、失敗しても続行）
    const { data: managers } = await db
      .select('users', 'email')
      .in('role', ['manager', 'admin'])
      .eq('is_active', true)

    const managerEmails = ((managers ?? []) as unknown as { email: string }[])
      .map((u) => u.email)
      .filter(Boolean)

    if (managerEmails.length > 0) {
      sendRequestNotification({
        to: managerEmails,
        applicantName: payload.name,
        requestType: body.type,
        targetDate: body.target_date ?? null,
        reason: body.reason,
      }).catch(() => undefined)
    }

    return NextResponse.json({ request: inserted }, { status: 201 })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    const db = withCompany(payload.company_id)

    const url = new URL(request.url)
    const status = url.searchParams.get('status')

    let query = db
      .select('requests', '*, users!requests_user_id_fkey(name, employee_code)')
      .eq('user_id', payload.user_id)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json<ApiError>({ error: 'データ取得に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ requests: data ?? [] })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
