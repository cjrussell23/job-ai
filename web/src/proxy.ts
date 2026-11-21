import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// An early redirect for visitors with no session cookie at all. It is not a security
// check: every page and action still verifies the session with requireMember().
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!sign-in|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
