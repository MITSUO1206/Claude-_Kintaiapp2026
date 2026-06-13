# 勤怠Excel表 + 管理者社員詳細 設計書

## 概要

2つの機能改善を行う。

1. **社員ダッシュボードのリニューアル**: カレンダー表示＋左パネルフォームをExcel風月次一覧表に置き換える
2. **管理者画面に社員別勤怠詳細ページ追加**: 出退勤状況一覧から社員名をクリックして個人の月次勤怠を確認・編集できるようにする

共通の `AttendanceTable` コンポーネントを作成し、両方の画面で使い回す。

---

## 画面設計

### AttendanceTable（共通）

```
月次勤怠表 — 2026年6月

  日付  曜  区分     就業場所   出勤    退勤    休憩  実働    操作
  6/1  月  出勤     オフィス   09:00   18:00   60   8:00    [編集]
  6/2  火  出勤     自宅       09:15   17:30   60   7:15    [編集]
  6/3  水  有給      —          —       —       —    —       [編集]
  6/4  木  出勤     オフィス   09:00   [入力] 60   入力中  [保存][取消]
  6/5  金  未入力    —          —       —       —    —       [編集]
  6/7  土  休日      —          —       —       —    —
  6/8  日  休日      —          —       —       —    —
  ...
```

- 土曜: 青色、日曜: 赤色
- 未入力の日: 薄い amber でハイライト
- 締め済み行: グレーアウト、編集ボタン非表示
- 実働 = 自動計算（退勤 − 出勤 − 休憩）、読み取り専用
- 1行ずつインライン編集、同時編集は1行のみ

### `/dashboard`（社員用）リニューアル

```
[KintaiApp ヘッダー: ユーザー名 | ログアウト]

[月次サマリーバー: 出勤X日 | 実働XXh | 残業Xh]

[< 前の月]  2026年6月  [次の月 >]

[AttendanceTable — 全幅]

[ApprovalBanner: 締め承認申請]
```

- 左パネル（DayEntryForm）廃止
- MonthCalendar廃止
- AttendanceTableで全て完結
- UserSidebar（ダッシュボード/勤怠履歴/申請/給与明細）は残す

### `/admin/attendance/[userId]`（新規）

```
[AdminSidebar]

[← 出退勤状況に戻る]  山田 太郎 (EMP-001) の勤怠

[< 前の月]  2026年6月  [次の月 >]

[AttendanceTable — 管理者モード（全行編集可）]
```

### `/admin`（変更）

社員一覧テーブルの「氏名」列をリンクに変更:
- `<a href="/admin/attendance/{u.id}">{u.name}</a>`

---

## コンポーネント構成

```
components/attendance/AttendanceTable.tsx   ← 新規作成（共通）
components/attendance/UnifiedDashboard.tsx  ← 修正（AttendanceTable使用）
app/admin/attendance/[userId]/page.tsx      ← 新規作成
app/admin/page.tsx                          ← 修正（名前をリンクに）
```

### AttendanceTable Props

```typescript
interface AttendanceTableProps {
  records: AttendanceRecord[]
  year: number
  month: number
  isAdmin?: boolean           // true = 全行編集可（締め済みも）
  onSaved: (record: AttendanceRecord) => void
  onMonthChange: (year: number, month: number) => void
}
```

### 編集時のAPI呼び出し

- **社員（/dashboard）**: `PUT /api/attendance/record`
- **管理者（/admin/attendance/[userId]）**: `PUT /api/admin/attendance/[id]`（既存）

管理者は別エンドポイント経由なので、`isAdmin` フラグで切り替える。

---

## データフロー

### /dashboard

1. Server Component: 当月レコード取得 → `UnifiedDashboard` に渡す
2. Client: `AttendanceTable` で表示
3. 月変更: `GET /api/attendance?year=&month=` でリフェッチ
4. 行編集: `PUT /api/attendance/record`

### /admin/attendance/[userId]

1. Server Component: `GET /api/admin/attendance/monthly?user_id=&year=&month=` で取得
2. Client: `AttendanceTable` (isAdmin=true) で表示
3. 月変更: `GET /api/admin/attendance/monthly?user_id=&year=&month=` でリフェッチ
4. 行編集: `PUT /api/admin/attendance/[recordId]`

---

## スコープ外

- 行の並び替え
- CSVエクスポート（勤怠表）← 別途実装可
- 打刻種別（通常/残業等）の選択 ← 今回は区分（status）のみ
- 深夜休憩・立替金・備考フィールド ← 今後の拡張
