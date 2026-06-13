import { NextRequest, NextResponse } from 'next/server'

function logout(request: NextRequest) {
  const loginUrl = new URL('/login', request.url)
  const response = NextResponse.redirect(loginUrl, { status: 302 })
  response.cookies.set('auth_token', '', { maxAge: 0, path: '/' })
  return response
}

export async function GET(request: NextRequest) { return logout(request) }
export async function POST(request: NextRequest) { return logout(request) }
