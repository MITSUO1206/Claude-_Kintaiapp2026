export type UserRole = 'employee' | 'manager' | 'admin'
export type SalaryType = 'monthly' | 'hourly'
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave_paid' | 'leave_special'

export interface Company {
  id: string
  company_code: string
  name: string
  created_at: string
}

export interface WorkRule {
  id: string
  company_id: string
  work_hours_per_day: number
  work_days_per_month: number
  start_time: string
  end_time: string
  break_minutes: number
  overtime_alert_hours: number
  overtime_limit_hours: number
  closing_day: number
  payment_day: number
  holiday_weekdays: string[]
  payment_on_holiday: string
}

export interface User {
  id: string
  company_id: string
  employee_code: string
  name: string
  email: string
  role: UserRole
  salary_type: SalaryType
  base_salary: number | null
  commuting_allowance: number
  resident_tax: number
  password_hash: string
  force_password_change: boolean
  is_active: boolean
  hired_at: string
  created_at: string
}

export interface AttendanceRecord {
  id: string
  company_id: string
  user_id: string
  work_date: string
  clock_in: string | null
  clock_out: string | null
  break_minutes: number
  actual_minutes: number | null
  overtime_minutes: number | null
  night_minutes: number
  holiday_minutes: number
  is_holiday_work: boolean
  work_location: 'office' | 'home' | 'satellite' | 'other' | null
  is_locked: boolean
  status: AttendanceStatus
  created_at: string
}

export interface AuditLog {
  id: string
  company_id: string
  user_id: string | null
  action: string
  table_name: string | null
  record_id: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

export interface JWTPayload {
  user_id: string
  company_id: string
  role: UserRole
  employee_code: string
  name: string
}

export interface BreakLog {
  id: string
  company_id: string
  attendance_id: string
  break_start: string
  break_end: string | null
  created_at: string
}

export type RequestType = 'leave_paid' | 'leave_special' | 'overtime' | 'attendance_fix'
export type RequestStatus = 'pending' | 'approved' | 'rejected'

export interface Request {
  id: string
  company_id: string
  user_id: string
  type: RequestType
  target_date: string | null
  reason: string
  status: RequestStatus
  approver_id: string | null
  approved_at: string | null
  rejection_reason: string | null
  note: string | null
  created_at: string
}

export interface MonthlyClosing {
  id: string
  company_id: string
  user_id: string
  year: number
  month: number
  employee_confirmed_at: string | null
  closed_at: string | null
  closed_by: string | null
  created_at: string
}

export interface LeaveBalance {
  id: string
  company_id: string
  user_id: string
  fiscal_year: number
  total_days: number
  used_days: number
  created_at: string
}

export type PayslipStatus = 'draft' | 'published'
export type PayslipItemCategory = 'income' | 'deduction' | 'adjustment'

export interface Payslip {
  id: string
  company_id: string
  user_id: string
  year: number
  month: number
  work_days: number
  absent_days: number
  paid_leave_days: number
  actual_hours: number
  overtime_hours: number
  night_hours: number
  holiday_work_days: number
  base_salary: number
  overtime_pay: number
  night_pay: number
  holiday_pay: number
  commuting_allowance: number
  other_allowance: number
  gross_pay: number
  health_insurance: number
  pension: number
  employment_insurance: number
  income_tax: number
  resident_tax: number
  other_deduction: number
  total_deduction: number
  net_pay: number
  is_finalized: boolean
  status: PayslipStatus
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface PayslipItem {
  id: string
  company_id: string
  payslip_id: string
  category: PayslipItemCategory
  label: string
  amount: number
  note: string | null
  sort_order: number
  is_auto_calc: boolean
  is_active: boolean
  created_at: string
}

export interface PayslipTemplate {
  id: string
  company_id: string
  category: PayslipItemCategory
  label: string
  default_amount: number | null
  note: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface ApiError {
  error: string
  code?: string
  details?: Record<string, string>
}

export type WorkLocation = 'office' | 'home' | 'satellite' | 'other'

export type ApprovalStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export interface MonthlyApproval {
  id: string
  company_id: string
  user_id: string
  year: number
  month: number
  status: ApprovalStatus
  submitted_at: string | null
  approved_at: string | null
  approved_by: string | null
  created_at: string
}
