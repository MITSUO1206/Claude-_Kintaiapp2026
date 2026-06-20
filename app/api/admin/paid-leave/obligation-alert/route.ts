import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { sendRequestNotification } from '@/lib/email/resend'
import { Resend } from 'resend'

type UserRow    = { id: string; name: string; employee_code: string; email: string | null; hired_at: string }
type GrantRow   = { user_id: string; grant_date: string; granted_days: number }
type BalanceRow = { user_id: string; fiscal_year: number; total_days: number; used_days: number }

export interface ObligationAlertUser {
  user_id: string
  name: string
  employee_code: string
  grant_date: string
  granted_days: number
  used_days: number
  remaining_obligation: number  // あと何日取得が必要か（5 - used_days）
  days_until_deadline: number   // 付与から1年の期限まで残り日数
  level: 'urgent' | 'warning'  // urgent=30日以内 / warning=90日以内
}

// 付与日から1年以内に5日取得させる義務（労基法39条7項）
// 付与日数が10日以上の場合のみ対象
export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }

    const db  = withCompany(payload.company_id)
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))

    const [usersRes, grantsRes, balancesRes] = await Promise.all([
      db.select('users', 'id, name, employee_code, email, hired_at')
        .eq('is_active', true)
        .order('employee_code'),
      db.select('leave_grants', 'user_id, grant_date, granted_days')
        .gte('granted_days', 10)   // 10日以上付与された場合のみ義務対象
        .order('grant_date', { ascending: false }),
      db.select('leave_balances', 'user_id, fiscal_year, total_days, used_days'),
    ])

    const users    = (usersRes.data    ?? []) as unknown as UserRow[]
    const grants   = (grantsRes.data   ?? []) as unknown as GrantRow[]
    const balances = (balancesRes.data ?? []) as unknown as BalanceRow[]

    // 最新の付与レコードをユーザーごとに取得
    const latestGrantByUser = new Map<string, GrantRow>()
    for (const g of grants) {
      if (!latestGrantByUser.has(g.user_id)) {
        latestGrantByUser.set(g.user_id, g)
      }
    }

    // used_daysをユーザー・fiscal_yearごとにマップ
    const usedByUserYear = new Map<string, number>()
    for (const b of balances) {
      usedByUserYear.set(`${b.user_id}_${b.fiscal_year}`, b.used_days)
    }

    const alerts: ObligationAlertUser[] = []

    for (const user of users) {
      const grant = latestGrantByUser.get(user.id)
      if (!grant) continue

      const grantDate    = new Date(grant.grant_date)
      const deadlineDate = new Date(grantDate)
      deadlineDate.setFullYear(deadlineDate.getFullYear() + 1)

      // 期限切れは対象外（既に違反済み or 期限内のみ）
      if (deadlineDate < now) continue

      const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (daysUntilDeadline > 90) continue  // 90日超は対象外（まだ余裕あり）

      const fiscalYear = grantDate.getFullYear()
      const usedDays   = usedByUserYear.get(`${user.id}_${fiscalYear}`) ?? 0
      const obligationRemaining = Math.max(0, 5 - usedDays)

      if (obligationRemaining === 0) continue  // 義務履行済み

      alerts.push({
        user_id:               user.id,
        name:                  user.name,
        employee_code:         user.employee_code,
        grant_date:            grant.grant_date,
        granted_days:          grant.granted_days,
        used_days:             usedDays,
        remaining_obligation:  obligationRemaining,
        days_until_deadline:   daysUntilDeadline,
        level:                 daysUntilDeadline <= 30 ? 'urgent' : 'warning',
      })
    }

    // 期限が近い順にソート
    alerts.sort((a, b) => a.days_until_deadline - b.days_until_deadline)

    return NextResponse.json({ alerts, as_of: now.toISOString() })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// 対象社員の上長へアラートメール送信
export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }

    const db  = withCompany(payload.company_id)

    // GETと同じロジックでアラート一覧を取得
    const alertsRes = await fetch(
      new URL('/api/admin/paid-leave/obligation-alert', request.url),
      { headers: { cookie: request.headers.get('cookie') ?? '' } }
    )
    const { alerts } = await alertsRes.json() as { alerts: ObligationAlertUser[] }

    const { data: managers } = await db
      .select('users', 'email')
      .in('role', ['manager', 'admin'])
      .eq('is_active', true)

    const managerEmails = ((managers ?? []) as unknown as { email: string | null }[])
      .map((u) => u.email).filter(Boolean) as string[]

    if (managerEmails.length === 0 || alerts.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ sent: 0, note: 'RESEND_API_KEY未設定' })

    const resend = new Resend(resendKey)
    const from   = process.env.EMAIL_FROM ?? 'KintaiApp <noreply@kintaiapp.example.com>'

    const urgentCount  = alerts.filter((a) => a.level === 'urgent').length
    const warningCount = alerts.filter((a) => a.level === 'warning').length

    const lines = alerts.map((a) =>
      `${a.level === 'urgent' ? '【緊急】' : '【警告】'}${a.name}（${a.employee_code}）: あと${a.remaining_obligation}日 / 期限まで${a.days_until_deadline}日`
    )

    await resend.emails.send({
      from,
      to: managerEmails,
      subject: `【有休5日義務】未達成者${alerts.length}名 — 緊急${urgentCount}名・警告${warningCount}名`,
      text: [
        '労基法39条7項 年次有給休暇5日取得義務の未達成者についてお知らせします。',
        '',
        ...lines,
        '',
        '管理画面 › 有給管理 から取得を促してください: /admin/leave-management',
      ].join('\n'),
    }).catch((e) => console.error('resend paid-leave alert error:', e))

    return NextResponse.json({ sent: alerts.length, recipients: managerEmails.length })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
