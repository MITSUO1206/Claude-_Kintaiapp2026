import { Resend } from 'resend'

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

const FROM = process.env.EMAIL_FROM ?? 'KintaiApp <noreply@kintaiapp.example.com>'

export async function sendRequestNotification(params: {
  to: string[]
  applicantName: string
  requestType: string
  targetDate: string | null
  reason: string
}): Promise<void> {
  const resend = getResend()
  if (!resend) return
  const typeLabel: Record<string, string> = {
    leave_paid: '有給申請',
    leave_special: '特別休暇申請',
    overtime: '残業申請',
    attendance_fix: '打刻修正申請',
  }
  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `【承認依頼】${params.applicantName}さんから${typeLabel[params.requestType] ?? '申請'}が届いています`,
    text: [
      `申請者: ${params.applicantName}`,
      `種別: ${typeLabel[params.requestType] ?? params.requestType}`,
      params.targetDate ? `対象日: ${params.targetDate}` : '',
      `理由: ${params.reason}`,
      '',
      '管理画面から承認/却下してください: /admin/requests',
    ]
      .filter(Boolean)
      .join('\n'),
  }).catch((e) => console.error('resend error:', e))
}

export async function sendApprovalResult(params: {
  to: string
  applicantName: string
  requestType: string
  status: 'approved' | 'rejected'
  rejectionReason?: string | null
}): Promise<void> {
  const resend = getResend()
  if (!resend) return
  const typeLabel: Record<string, string> = {
    leave_paid: '有給申請',
    leave_special: '特別休暇申請',
    overtime: '残業申請',
    attendance_fix: '打刻修正申請',
  }
  const statusLabel = params.status === 'approved' ? '承認されました' : '却下されました'
  await resend.emails.send({
    from: FROM,
    to: [params.to],
    subject: `【申請結果】${typeLabel[params.requestType] ?? '申請'}が${statusLabel}`,
    text: [
      `${params.applicantName} さん`,
      '',
      `${typeLabel[params.requestType] ?? params.requestType}が${statusLabel}。`,
      params.status === 'rejected' && params.rejectionReason
        ? `却下理由: ${params.rejectionReason}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
  }).catch((e) => console.error('resend error:', e))
}

export async function sendPasswordReset(params: {
  to: string
  name: string
  tempPassword: string
}): Promise<void> {
  const resend = getResend()
  if (!resend) return
  await resend.emails.send({
    from: FROM,
    to: [params.to],
    subject: '【KintaiApp】パスワードがリセットされました',
    text: [
      `${params.name} さん`,
      '',
      '管理者によりパスワードがリセットされました。',
      `仮パスワード: ${params.tempPassword}`,
      '',
      '初回ログイン後、必ずパスワードを変更してください。',
    ].join('\n'),
  }).catch((e) => console.error('resend error:', e))
}

export async function sendOvertimeAlert(params: {
  to: string[]
  employeeName: string
  year: number
  month: number
  overtimeHours: number
  level: 'warning' | 'critical'
}): Promise<void> {
  const resend = getResend()
  if (!resend) return
  const label = params.level === 'critical' ? '【緊急】法定上限超過' : '【警告】残業時間超過'
  const threshold = params.level === 'critical' ? '45時間' : '36時間'
  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `${label} ${params.employeeName}さんの${params.month}月残業が${threshold}を超えました`,
    text: [
      `${params.employeeName} さんの ${params.year}年${params.month}月の残業時間が ${params.overtimeHours.toFixed(1)}時間 となり、${threshold}を超えました。`,
      '',
      '管理画面から確認してください: /admin/attendance',
    ].join('\n'),
  }).catch((e) => console.error('resend overtime alert error:', e))
}

export async function sendMonthlyReminder(params: {
  to: string
  name: string
  year: number
  month: number
}): Promise<void> {
  const resend = getResend()
  if (!resend) return
  await resend.emails.send({
    from: FROM,
    to: [params.to],
    subject: `【KintaiApp】${params.year}年${params.month}月の勤怠確認申請をお願いします`,
    text: [
      `${params.name} さん`,
      '',
      `${params.year}年${params.month}月の勤怠確認申請がまだ完了していません。`,
      '',
      '勤怠履歴画面から「今月の勤怠を確定申請する」ボタンを押してください。',
      '',
      '月次締め処理が完了できないため、お早めにご対応をお願いします。',
    ].join('\n'),
  }).catch((e) => console.error('resend reminder error:', e))
}

export async function sendPayslipPublished(params: {
  to: string
  name: string
  year: number
  month: number
}): Promise<void> {
  const resend = getResend()
  if (!resend) return
  await resend.emails.send({
    from: FROM,
    to: [params.to],
    subject: `【KintaiApp】${params.year}年${params.month}月の給与明細が公開されました`,
    text: [
      `${params.name} さん`,
      '',
      `${params.year}年${params.month}月分の給与明細が公開されました。`,
      '',
      '給与明細は KintaiApp のマイページからご確認ください: /payslips',
    ].join('\n'),
  }).catch((e) => console.error('resend error:', e))
}
