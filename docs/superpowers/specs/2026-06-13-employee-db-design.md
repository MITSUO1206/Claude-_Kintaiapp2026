# 社員データベース（Excel感覚スプレッドシート）設計書

## 概要

管理者が社員の給与関連情報（基本給・時給・各種手当・控除）をExcelのような全画面スプレッドシートで一覧・編集できる新画面を追加する。列（手当・控除項目）は管理者が自由に追加・削除でき、個別の例外項目も設定可能。

---

## 画面設計

### 新ページ: `/admin/employee-db`

既存の `/admin/users`（社員一覧・権限管理）とは別ページとして追加する。サイドバーにリンクを追加。

#### レイアウト

```
[AdminSidebar] | [ツールバー: タイトル / CSV出力 / ⚙列管理 / ＋社員追加]
               | [スプレッドシート本体]          | [列管理パネル（開閉式）]
```

#### スプレッドシート列構成

固定列（常に表示、削除不可）:
- 氏名（ソート可、行固定）
- 種別（月給 / 時給 バッジ表示）
- 基本給/時給（数値入力）

共通列（列管理パネルで追加・削除・並び替え可能）:
- 手当カテゴリ（緑色ヘッダー）
- 控除カテゴリ（赤色ヘッダー）

個別列（特定社員にのみ存在する例外項目、琥珀色ヘッダー）:
- 役職手当など、その社員の行からのみ追加できる

#### インライン編集

- 「編集」ボタンを押すと行全体がインライン編集モードに（青い枠線）
- 各セルが `<input type="number">` に変わる
- 「保存」ボタンで確定、「キャンセル」で破棄
- 同時に複数行の編集は不可

#### 列管理パネル（右サイドパネル）

- 「⚙ 列管理」ボタンで開閉
- 共通列を追加するフォーム: ラベル名 ＋ カテゴリ（手当 / 控除）
- 既存共通列の削除（値が入っている場合は確認アラート）
- 並び替えは将来拡張（今回は追加順固定）

#### ＋社員追加

- ボタンクリックで既存の `/admin/users/new` ページへ遷移（新規作成画面は流用）

---

## データモデル

### 新テーブル: `employee_field_defs`（共通列マスタ）

```sql
CREATE TABLE employee_field_defs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id),
  label       text NOT NULL,
  category    text NOT NULL CHECK (category IN ('allowance', 'deduction')),
  sort_order  int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
```

### 新テーブル: `employee_field_values`（社員ごとの値）

```sql
CREATE TABLE employee_field_values (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  field_id   uuid REFERENCES employee_field_defs(id) ON DELETE SET NULL,
  label      text NOT NULL,   -- field_id=NULLの個別項目はここにラベルを持つ
  category   text NOT NULL CHECK (category IN ('allowance', 'deduction')),
  amount     numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
-- 共通列（field_id IS NOT NULL）だけ重複を禁止する
CREATE UNIQUE INDEX uq_employee_field_values_shared
  ON employee_field_values (company_id, user_id, field_id)
  WHERE field_id IS NOT NULL;
```

**設計ポイント:**
- 共通列: `field_id` が `employee_field_defs.id` を指す。列削除時は `field_id = NULL` になるがデータは残る（`ON DELETE SET NULL`）
- 個別列: `field_id = NULL`、`label` にラベルを直接持つ
- `users` テーブルの `commuting_allowance`・`resident_tax` は既存のまま残す（後方互換）。新規項目はすべて `employee_field_values` に入れる

---

## API 設計

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/admin/employee-db` | 全社員 ＋ 全フィールド定義 ＋ 全値を一括取得 |
| PUT | `/api/admin/employee-db/[userId]` | 1社員の基本給・時給と全フィールド値を保存 |
| GET | `/api/admin/employee-db/fields` | 共通列マスタ一覧取得 |
| POST | `/api/admin/employee-db/fields` | 共通列を追加 |
| DELETE | `/api/admin/employee-db/fields/[fieldId]` | 共通列を削除 |

### GET `/api/admin/employee-db` レスポンス形

```json
{
  "fields": [
    { "id": "...", "label": "通勤手当", "category": "allowance", "sort_order": 0 }
  ],
  "employees": [
    {
      "id": "...", "name": "山田太郎", "employee_code": "EMP-001",
      "salary_type": "monthly", "base_salary": 280000,
      "values": [
        { "field_id": "...", "label": "通勤手当", "category": "allowance", "amount": 15000 },
        { "field_id": null, "label": "役職手当", "category": "allowance", "amount": 30000 }
      ]
    }
  ]
}
```

### PUT `/api/admin/employee-db/[userId]` リクエスト形

```json
{
  "salary_type": "monthly",
  "base_salary": 280000,
  "values": [
    { "field_id": "...", "label": "通勤手当", "category": "allowance", "amount": 15000 },
    { "field_id": null,  "label": "役職手当", "category": "allowance", "amount": 30000 }
  ]
}
```

---

## コンポーネント構成

```
app/admin/employee-db/page.tsx        ← Server Component（初期データ取得）
components/admin/EmployeeDbClient.tsx ← Client Component（スプレッドシート本体）
components/admin/FieldDefPanel.tsx    ← 列管理サイドパネル（Client Component）
components/admin/EmployeeRow.tsx      ← 1行分（表示／編集切り替え）
```

---

## 既存画面への影響

| 変更対象 | 内容 |
|----------|------|
| `components/AdminSidebar.tsx` | 「社員DB」リンクを追加 |
| `app/admin/users/new/page.tsx` | 変更なし（＋社員追加から遷移先として流用） |
| `app/admin/users/page.tsx` | 変更なし（権限・在籍管理は引き続きこちら） |
| `supabase/schema_phase5.sql` | 新テーブル2本を追加 |

---

## スコープ外（今回やらない）

- 列の並び替えUI（ドラッグ＆ドロップ）→ 追加順固定
- CSV インポート → 出力のみ
- 給与計算への自動連携 → 手動で payslip に転記
- 過去の変更履歴表示
