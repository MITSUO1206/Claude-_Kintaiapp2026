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

    const response = NextResponse.next()
    response.headers.set('x-user-id', payload.user_id)
    response.headers.set('x-company-id', payload.company_id)
    response.headers.set('x-user-role', payload.role)
    response.headers.set('x-employee-code', payload.employee_code)
    response.headers.set('x-user-name', payload.name)
    return response
  } catch {
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.delete('auth_token')
    return response
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
