import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { Payslip } from '@/lib/types'

const s = StyleSheet.create({
  page:    { fontFamily: 'Helvetica', fontSize: 9, padding: 32, color: '#1a1a1a' },
  title:   { fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  period:  { fontSize: 11, textAlign: 'center', marginBottom: 12 },
  meta:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, borderBottom: '1 solid #ccc', paddingBottom: 8 },
  metaText:{ fontSize: 9 },
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 10, fontWeight: 'bold', backgroundColor: '#e8eaf6', padding: '4 6', marginBottom: 2 },
  row:     { flexDirection: 'row', borderBottom: '0.5 solid #e0e0e0', paddingVertical: 3 },
  label:   { flex: 1, color: '#555' },
  value:   { width: 90, textAlign: 'right' },
  total:   { flexDirection: 'row', backgroundColor: '#f5f5f5', paddingVertical: 4, marginTop: 2 },
  totalLabel: { flex: 1, fontWeight: 'bold' },
  totalValue: { width: 90, textAlign: 'right', fontWeight: 'bold' },
  netPay:  { flexDirection: 'row', backgroundColor: '#1565c0', color: '#fff', padding: '6 4', marginTop: 8, borderRadius: 2 },
  netLabel:{ flex: 1, fontSize: 11, fontWeight: 'bold' },
  netValue:{ width: 110, textAlign: 'right', fontSize: 13, fontWeight: 'bold' },
  kintai:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 2 },
  kintaiItem: { flexDirection: 'row', width: '22%' },
  kintaiLabel: { color: '#555', flex: 1 },
  kintaiValue: { textAlign: 'right', width: 40 },
  footer: { marginTop: 16, borderTop: '0.5 solid #ccc', paddingTop: 6, fontSize: 7, color: '#999', textAlign: 'center' },
})

function yen(v: number) {
  return `¥${Math.round(v).toLocaleString()}`
}

interface Props {
  payslip: Payslip
  userName: string
  employeeCode: string
  companyName: string
}

export function PayslipDocument({ payslip: p, userName, employeeCode, companyName }: Props) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>給 与 明 細 書</Text>
        <Text style={s.period}>{p.year}年{p.month}月分</Text>

        <View style={s.meta}>
          <Text style={s.metaText}>{companyName}</Text>
          <Text style={s.metaText}>社員番号: {employeeCode}　氏名: {userName}</Text>
        </View>

        {/* 勤怠 */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>【勤怠】</Text>
          <View style={s.kintai}>
            <View style={s.kintaiItem}><Text style={s.kintaiLabel}>出勤日数</Text><Text style={s.kintaiValue}>{p.work_days}日</Text></View>
            <View style={s.kintaiItem}><Text style={s.kintaiLabel}>欠勤日数</Text><Text style={s.kintaiValue}>{p.absent_days}日</Text></View>
            <View style={s.kintaiItem}><Text style={s.kintaiLabel}>有給取得</Text><Text style={s.kintaiValue}>{p.paid_leave_days}日</Text></View>
            <View style={s.kintaiItem}><Text style={s.kintaiLabel}>休日出勤</Text><Text style={s.kintaiValue}>{p.holiday_work_days}日</Text></View>
            <View style={s.kintaiItem}><Text style={s.kintaiLabel}>実働時間</Text><Text style={s.kintaiValue}>{Number(p.actual_hours).toFixed(1)}h</Text></View>
            <View style={s.kintaiItem}><Text style={s.kintaiLabel}>残業時間</Text><Text style={s.kintaiValue}>{Number(p.overtime_hours).toFixed(1)}h</Text></View>
            <View style={s.kintaiItem}><Text style={s.kintaiLabel}>深夜時間</Text><Text style={s.kintaiValue}>{Number(p.night_hours).toFixed(1)}h</Text></View>
          </View>
        </View>

        {/* 支給 */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>【支給】</Text>
          <View style={s.row}><Text style={s.label}>基本給</Text><Text style={s.value}>{yen(p.base_salary)}</Text></View>
          <View style={s.row}><Text style={s.label}>残業手当</Text><Text style={s.value}>{yen(p.overtime_pay)}</Text></View>
          <View style={s.row}><Text style={s.label}>深夜手当</Text><Text style={s.value}>{yen(p.night_pay)}</Text></View>
          <View style={s.row}><Text style={s.label}>休日出勤手当</Text><Text style={s.value}>{yen(p.holiday_pay)}</Text></View>
          <View style={s.row}><Text style={s.label}>通勤手当</Text><Text style={s.value}>{yen(p.commuting_allowance)}</Text></View>
          <View style={s.row}><Text style={s.label}>その他手当</Text><Text style={s.value}>{yen(p.other_allowance)}</Text></View>
          <View style={s.total}><Text style={s.totalLabel}>総支給額</Text><Text style={s.totalValue}>{yen(p.gross_pay)}</Text></View>
        </View>

        {/* 控除 */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>【控除】</Text>
          <View style={s.row}><Text style={s.label}>健康保険料</Text><Text style={s.value}>{yen(p.health_insurance)}</Text></View>
          <View style={s.row}><Text style={s.label}>厚生年金保険料</Text><Text style={s.value}>{yen(p.pension)}</Text></View>
          <View style={s.row}><Text style={s.label}>雇用保険料</Text><Text style={s.value}>{yen(p.employment_insurance)}</Text></View>
          <View style={s.row}><Text style={s.label}>所得税</Text><Text style={s.value}>{yen(p.income_tax)}</Text></View>
          <View style={s.row}><Text style={s.label}>住民税</Text><Text style={s.value}>{yen(p.resident_tax)}</Text></View>
          <View style={s.row}><Text style={s.label}>その他控除</Text><Text style={s.value}>{yen(p.other_deduction)}</Text></View>
          <View style={s.total}><Text style={s.totalLabel}>控除合計</Text><Text style={s.totalValue}>{yen(p.total_deduction)}</Text></View>
        </View>

        {/* 差引支給額 */}
        <View style={s.netPay}>
          <Text style={s.netLabel}>差引支給額</Text>
          <Text style={s.netValue}>{yen(p.net_pay)}</Text>
        </View>

        <Text style={s.footer}>
          ※ この給与明細は KintaiApp によって自動生成されました。内容に不明点がある場合は管理者にお問い合わせください。
        </Text>
      </Page>
    </Document>
  )
}

export default PayslipDocument
