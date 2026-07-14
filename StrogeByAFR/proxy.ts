import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = ["/login", "/shared", "/api/auth/login", "/api/auth/csrf", "/api/shared"];

const BOT_PATTERNS = [
  /bot/i, /crawler/i, /spider/i, /scrape/i, /curl/i, /wget/i,
  /python-requests/i, /go-http/i, /java\//i, /perl/i,
];

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return BOT_PATTERNS.some((p) => p.test(userAgent));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = publicPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (isPublic || pathname.startsWith("/api/shared/")) {
    const response = NextResponse.next();
    applySecurityHeaders(response);
    return response;
  }

  const sessionCookie = request.cookies.get("storage_session");

  // Bot detection for non-public routes
  const ua = request.headers.get("user-agent");
  if (isBot(ua) && !pathname.startsWith("/api/")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!sessionCookie && !pathname.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!sessionCookie && pathname.startsWith("/api/")) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const response = NextResponse.next();
  applySecurityHeaders(response);

  return response;
}

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );
  response.headers.set("X-DNS-Prefetch-Control", "on");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  response.headers.set("Cross-Origin-Embedder-Policy", "credentialless");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.headers.set("Cross-Origin-Resource-Policy", "cross-origin");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
