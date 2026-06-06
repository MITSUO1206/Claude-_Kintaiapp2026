import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth/jwt'

const PUBLIC_PATHS = ['/login', '/api/auth/login']
const ADMIN_PATHS = ['/admin', '/api/admin']

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublic(pathname)) {
    return NextResponse.next()
  }

  const token = request.cookies.get('auth_token')?.value
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const payload = await verifyJWT(token)

    if (
      ADMIN_PATHS.some((p) => pathname.startsWith(p)) &&
      payload.role !== 'admin' &&
      payload.role !== 'manager'
    ) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Clone request headers and strip any client-supplied identity headers first
    // to prevent spoofing — clients must never be able to set these themselves
    const requestHeaders = new Headers(request.headers)
    requestHeaders.delete('x-user-id')
    requestHeaders.delete('x-company-id')
    requestHeaders.delete('x-user-role')
    requestHeaders.delete('x-employee-code')
    requestHeaders.delete('x-user-name')
    // Then set verified values from the JWT
    requestHeaders.set('x-user-id', payload.user_id)
    requestHeaders.set('x-company-id', payload.company_id)
    requestHeaders.set('x-user-role', payload.role)
    requestHeaders.set('x-employee-code', payload.employee_code)
    requestHeaders.set('x-user-name', payload.name)
    return NextResponse.next({ request: { headers: requestHeaders } })
  } catch {
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.delete('auth_token')
    return response
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
