import { NextRequest, NextResponse } from "next/server";
import {
  constantTimeTextEqual,
  createSessionToken,
  getAuthConfiguration,
  sanitizeReturnPath,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToLogin(
  request: NextRequest,
  nextPath: string,
  parameter: "error" | "config"
) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(parameter, "1");
  loginUrl.searchParams.set("next", nextPath);

  return NextResponse.redirect(loginUrl, 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const suppliedPassword = String(formData.get("password") || "");
  const nextPath = sanitizeReturnPath(formData.get("next"));
  const configuration = getAuthConfiguration();

  if (!configuration.isValid) {
    return redirectToLogin(request, nextPath, "config");
  }

  const passwordIsCorrect =
    suppliedPassword.length <= 256 &&
    (await constantTimeTextEqual(
      suppliedPassword,
      configuration.password
    ));

  if (!passwordIsCorrect) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return redirectToLogin(request, nextPath, "error");
  }

  const sessionToken = await createSessionToken(
    configuration.signingSecret
  );
  const response = NextResponse.redirect(
    new URL(nextPath, request.url),
    303
  );

  response.cookies.set(
    SESSION_COOKIE_NAME,
    sessionToken,
    sessionCookieOptions()
  );
  response.headers.set("Cache-Control", "private, no-store, max-age=0");

  return response;
}
