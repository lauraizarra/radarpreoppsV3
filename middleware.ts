import { NextRequest, NextResponse } from "next/server";
import {
  getAuthConfiguration,
  sanitizeReturnPath,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "./lib/auth";

function addPrivateHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");

  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isLoginPage = pathname === "/login";
  const isAuthenticationRoute =
    pathname === "/api/login" || pathname === "/api/logout";

  const configuration = getAuthConfiguration();
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuthenticated = configuration.isValid
    ? await verifySessionToken(sessionToken, configuration.signingSecret)
    : false;

  if (isAuthenticationRoute) {
    return addPrivateHeaders(NextResponse.next());
  }

  if (isLoginPage) {
    if (isAuthenticated) {
      const destination = sanitizeReturnPath(
        request.nextUrl.searchParams.get("next")
      );

      return addPrivateHeaders(
        NextResponse.redirect(new URL(destination, request.url))
      );
    }

    return addPrivateHeaders(NextResponse.next());
  }

  if (!isAuthenticated) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: "Acceso no autorizado" },
        {
          status: 401,
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
            "X-Robots-Tag": "noindex, nofollow, noarchive",
          },
        }
      );
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);

    if (!configuration.isValid) {
      loginUrl.searchParams.set("config", "1");
    }

    return addPrivateHeaders(NextResponse.redirect(loginUrl));
  }

  return addPrivateHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|preopp-icons/).*)",
  ],
};
