import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError, Payslip } from '@/lib/types'

function yen(v: number): string {
  return String(Math.round(v))
}

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }

    const url = new URL(request.url)
    const year  = parseInt(url.searchParams.get('year')  ?? String(new Date().getFullYear()))
    const month = parseInt(url.searchParams.get('month') ?? String(new Date().getMonth() + 1))

    const db = withCompany(payload.company_id)

    const { data: payslips } = await db
      .select('payslips', '*')
      .eq('year', year)
      .eq('month', month)
      .order('user_id')

    const rows = (payslips ?? []) as unknown as Payslip[]
    const userIds = rows.map((r) => r.user_id)

    const { data: users } = userIds.length > 0
      ? await db.select('users', 'id, name, employee_code, salary_type, hired_at').in('id', userIds)
      : { data: [] }

    type UserRow = { id: string; name: string; employee_code: string; salary_type: string; hired_at: string }
    const userMap = new Map(((users ?? []) as unknown as UserRow[]).map((u) => [u.id, u]))

    const BOM = '﻿'
    const headers = [
      '社員番号', '氏名', '雇用形態', '給与形態', '対象年月',
      '出勤日数', '欠勤日数', '有給取得日数',
      '実働時間(h)', '残業時間(h)', '深夜時間(h)', '休日出勤日数',
      '基本給(円)', '残業手当(円)', '深夜手当(円)', '休日出勤手当(円)',
      '通勤手当(円)', 'その他手当(円)', '総支給額(円)',
      '健康保険料(円)', '厚生年金保険料(円)', '雇用保険料(円)',
      '所得税(円)', '住民税(円)', 'その他控除(円)', '控除合計(円)', '差引支給額(円)',
      '確定フラグ',
    ]

    const yearMonth = `${year}年${month}月`
    const csvRows = rows.map((p) => {
      const u = userMap.get(p.user_id)
      return [
        u?.employee_code ?? '',
        u?.name ?? '',
        '正社員',
        u?.salary_type === 'hourly' ? '時給' : '月給',
        yearMonth,
        p.work_days,
        p.absent_days,
        p.paid_leave_days,
        p.actual_hours,
        p.overtime_hours,
        p.night_hours,
        p.holiday_work_days,
        yen(p.base_salary),
        yen(p.overtime_pay),
        yen(p.night_pay),
        yen(p.holiday_pay),
        yen(p.commuting_allowance),
        yen(p.other_allowance),
        yen(p.gross_pay),
        yen(p.health_insurance),
        yen(p.pension),
        yen(p.employment_insurance),
        yen(p.income_tax),
        yen(p.resident_tax),
        yen(p.other_deduction),
        yen(p.total_deduction),
        yen(p.net_pay),
        p.is_finalized ? '確定' : '未確定',
      ].join(',')
    })

    const csv = BOM + [headers.join(','), ...csvRows].join('\n')

    await writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'payslip_export',
      table_name: 'payslips',
      new_values: { year, month, count: rows.length },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="chingin_daichou_${year}${String(month).padStart(2,'0')}.csv"`,
      },
    })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
