export interface PayslipInput {
  salary_type: 'monthly' | 'hourly'
  base_salary: number
  work_hours_per_day: number
  work_days_per_month: number
  actual_minutes: number
  overtime_minutes: number
  night_minutes: number
  holiday_work_days: number
  work_days: number
  absent_days: number
  paid_leave_days: number
  commuting_allowance: number
  other_allowance: number
  resident_tax: number
  other_deduction: number
  overtime_rate_25?: number
  overtime_rate_50?: number
}

export interface PayslipResult {
  work_days: number
  absent_days: number
  paid_leave_days: number
  actual_hours: number
  overtime_hours: number
  night_hours: number
  holiday_work_days: number
  base_salary: number
  overtime_pay: number
  overtime_pay_tier2: number
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
}

function round(v: number): number {
  return Math.floor(v)
}

function calcIncomeTax(taxableMonthly: number): number {
  if (taxableMonthly <= 0) return 0
  const annual = taxableMonthly * 12
  let rate: number
  let deduction: number
  if (annual < 1950000)       { rate = 0.05; deduction = 0 }
  else if (annual < 3300000)  { rate = 0.10; deduction = 97500 }
  else if (annual < 6950000)  { rate = 0.20; deduction = 427500 }
  else if (annual < 9000000)  { rate = 0.23; deduction = 636000 }
  else if (annual < 18000000) { rate = 0.33; deduction = 1536000 }
  else                         { rate = 0.40; deduction = 2796000 }
  const annualTax = Math.max(0, annual * rate - deduction)
  return round(annualTax / 12)
}

export function calculatePayslip(input: PayslipInput): PayslipResult {
  const {
    salary_type,
    base_salary,
    work_hours_per_day,
    work_days_per_month,
    actual_minutes,
    overtime_minutes,
    night_minutes,
    holiday_work_days,
    work_days,
    absent_days,
    paid_leave_days,
    commuting_allowance,
    other_allowance,
    resident_tax,
    other_deduction,
    overtime_rate_25 = 1.25,
    overtime_rate_50 = 1.50,
  } = input

  const actualHours   = actual_minutes / 60
  const overtimeHours = overtime_minutes / 60
  const nightHours    = night_minutes / 60
  const holidayHours  = holiday_work_days * work_hours_per_day

  const scheduledMonthlyHours = work_days_per_month * work_hours_per_day
  const hourlyRate =
    salary_type === 'monthly'
      ? base_salary / scheduledMonthlyHours
      : base_salary

  const basePay =
    salary_type === 'monthly'
      ? round(base_salary - (absent_days > 0 ? hourlyRate * work_hours_per_day * absent_days : 0))
      : round(hourlyRate * (actualHours - overtimeHours - nightHours))

  const TIER2_THRESHOLD = 60
  const tier1Hours = Math.min(overtimeHours, TIER2_THRESHOLD)
  const tier2Hours = Math.max(0, overtimeHours - TIER2_THRESHOLD)
  const overtime_pay_tier2 = round(hourlyRate * overtime_rate_50 * tier2Hours)
  const overtime_pay = round(hourlyRate * overtime_rate_25 * tier1Hours) + overtime_pay_tier2
  const night_pay     = round(hourlyRate * 0.25 * nightHours)
  const holiday_pay   = round(hourlyRate * 1.35 * holidayHours)

  const gross_pay = basePay + overtime_pay + night_pay + holiday_pay + commuting_allowance + other_allowance

  // 社会保険料（従業員負担分の近似）
  const health_insurance     = round(gross_pay * 0.0497)  // 東京都標準
  const pension              = round(gross_pay * 0.0915)
  const employment_insurance = round(gross_pay * 0.006)

  const taxable = Math.max(0, gross_pay - health_insurance - pension - employment_insurance)
  const income_tax = calcIncomeTax(taxable)

  const total_deduction = health_insurance + pension + employment_insurance + income_tax + resident_tax + other_deduction
  const net_pay = Math.max(0, gross_pay - total_deduction)

  return {
    work_days,
    absent_days,
    paid_leave_days,
    actual_hours:    Math.round(actualHours   * 100) / 100,
    overtime_hours:      Math.round(overtimeHours * 100) / 100,
    night_hours:         Math.round(nightHours    * 100) / 100,
    holiday_work_days,
    base_salary:         basePay,
    overtime_pay,
    overtime_pay_tier2,
    night_pay,
    holiday_pay,
    commuting_allowance,
    other_allowance,
    gross_pay,
    health_insurance,
    pension,
    employment_insurance,
    income_tax,
    resident_tax,
    other_deduction,
    total_deduction,
    net_pay,
  }
}
