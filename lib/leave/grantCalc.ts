// 法定付与日数テーブル（週5日以上 / 週30時間以上）
const STANDARD_DAYS = [10, 11, 12, 14, 16, 18, 20] // サイクル 0〜6以上

// 比例付与日数テーブル [週所定労働日数][サイクルindex]
const PROPORTIONAL_DAYS: Record<number, number[]> = {
  4: [7,  8,  9,  10, 12, 13, 15],
  3: [5,  6,  6,  8,  9,  10, 11],
  2: [3,  4,  4,  5,  6,  6,  7],
  1: [1,  2,  2,  2,  3,  3,  3],
}

export interface GrantCycle {
  cycleIndex: number  // 0 = 最初の付与（入社6ヶ月後）
  grantDate: Date     // 付与日
  grantedDays: number // 付与日数
  periodFrom: Date    // 出勤率計算期間 開始
  periodTo: Date      // 出勤率計算期間 終了
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export function getGrantDays(weeklyDays: number, cycleIndex: number): number {
  const idx = Math.min(cycleIndex, 6)
  if (weeklyDays >= 5) return STANDARD_DAYS[idx]
  const table = PROPORTIONAL_DAYS[Math.min(Math.max(weeklyDays, 1), 4)]
  return table?.[idx] ?? STANDARD_DAYS[idx]
}

// 入社日基準で全付与サイクルを計算
export function getGrantCycles(hiredAt: string, weeklyDays: number, maxCycles = 10): GrantCycle[] {
  const hired = new Date(hiredAt + 'T00:00:00')
  const cycles: GrantCycle[] = []

  for (let i = 0; i < maxCycles; i++) {
    const monthsToGrant = i === 0 ? 6 : 6 + i * 12
    const grantDate  = addMonths(hired, monthsToGrant)
    const periodFrom = i === 0 ? new Date(hired) : addMonths(hired, 6 + (i - 1) * 12)
    const periodTo   = new Date(grantDate)
    periodTo.setDate(periodTo.getDate() - 1)

    cycles.push({
      cycleIndex: i,
      grantDate,
      grantedDays: getGrantDays(weeklyDays, i),
      periodFrom,
      periodTo,
    })
  }

  return cycles
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function calcTenureStr(hiredAt: string): string {
  const hired = new Date(hiredAt)
  const now   = new Date()
  const months =
    (now.getFullYear() - hired.getFullYear()) * 12 +
    (now.getMonth() - hired.getMonth())
  if (months < 1)  return '1ヶ月未満'
  const years = Math.floor(months / 12)
  const rem   = months % 12
  if (years === 0) return `${rem}ヶ月`
  if (rem === 0)   return `${years}年`
  return `${years}年${rem}ヶ月`
}

// 次回付与サイクル（今日以降の最初のもの）を返す
export function getNextGrantCycle(hiredAt: string, weeklyDays: number): GrantCycle | null {
  const now    = new Date()
  const cycles = getGrantCycles(hiredAt, weeklyDays)
  return cycles.find((c) => c.grantDate > now) ?? null
}

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: '正社員',
  part_time: 'パート',
  contract:  '契約社員',
  dispatch:  '派遣',
  other:     'その他',
}
