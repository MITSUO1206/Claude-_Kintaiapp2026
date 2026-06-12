import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * 全DBクエリにcompany_idを強制付与するラッパー。
 * このファイルを経由しない直接クエリは禁止。
 * マルチテナント漏洩防止のための中心的な防衛機構。
 */
export function withCompany(companyId: string) {
  const db = supabaseAdmin

  return {
    select(table: string, columns = '*') {
      return db.from(table).select(columns).eq('company_id', companyId)
    },

    insert<T extends Record<string, unknown>>(table: string, data: T | T[]) {
      const records = Array.isArray(data)
        ? data.map((r) => ({ ...r, company_id: companyId }))
        : { ...data, company_id: companyId }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return db.from(table).insert(records as any).select()
    },

    update<T extends Record<string, unknown>>(table: string, data: T) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return db.from(table).update(data as any).eq('company_id', companyId)
    },

    delete(table: string) {
      return db.from(table).delete().eq('company_id', companyId)
    },

    upsert<T extends Record<string, unknown>>(table: string, data: T, onConflict: string) {
      const record = { ...data, company_id: companyId }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return db.from(table).upsert(record as any, { onConflict }).select()
    },

    raw: db,
    companyId,
  }
}

