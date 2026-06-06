import type { NextRequest } from 'next/server'
import { verifyJWT } from '@/lib/auth/jwt'
import type { JWTPayload } from '@/lib/types'

/**
 * Route handler で JWT Cookie を直接検証して identity を返す。
 * proxy.ts がスキップされた場合でも各 route が独立して認証できるよう、
 * ヘッダーからではなく Cookie から読む。
 */
export async function requireAuth(request: NextRequest): Promise<JWTPayload> {
  const token = request.cookies.get('auth_token')?.value
  if (!token) throw new Error('Unauthorized')
  return verifyJWT(token)
}
