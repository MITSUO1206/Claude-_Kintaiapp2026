import { supabaseAdmin } from '@/lib/supabase/admin'

interface AuditLogParams {
  company_id: string
  user_id?: string | null
  action: string
  table_name?: string
  record_id?: string
  old_values?: Record<string, unknown>
  new_values?: Record<string, unknown>
  ip_address?: string
}

export async function writeAuditLog(params: AuditLogParams): Promise<void> {
  const { error } = await supabaseAdmin.from('audit_logs').insert({
    company_id: params.company_id,
    user_id: params.user_id ?? null,
    action: params.action,
    table_name: params.table_name ?? null,
    record_id: params.record_id ?? null,
    old_values: params.old_values ?? null,
    new_values: params.new_values ?? null,
    ip_address: params.ip_address ?? null,
  })

  if (error) {
    console.error('audit_log write failed:', error.message, params)
  }
}
