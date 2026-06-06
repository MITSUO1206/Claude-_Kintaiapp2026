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

export interface ApiError {
  error: string
  code?: string
  details?: Record<string, string>
}
