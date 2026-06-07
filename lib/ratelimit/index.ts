import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

let _limiter: Ratelimit | null = null

function getLimiter(): Ratelimit | null {
  if (_limiter) return _limiter
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  _limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    analytics: false,
  })
  return _limiter
}

export async function checkRateLimit(identifier: string): Promise<{ allowed: boolean; remaining: number }> {
  const limiter = getLimiter()
  if (!limiter) return { allowed: true, remaining: 999 }
  const { success, remaining } = await limiter.limit(identifier)
  return { allowed: success, remaining }
}
