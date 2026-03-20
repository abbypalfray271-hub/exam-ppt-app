import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const nextAction = request.headers.get('next-action');
  const origin = request.headers.get('origin');
  console.log(`[Middleware] ${request.method} ${request.nextUrl.pathname} - Action: ${nextAction} - Origin: ${origin}`);
  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
