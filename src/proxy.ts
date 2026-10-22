import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { decideAccess } from "@/server/auth/policy";

type ProxyHandler = (request: NextRequest, event: NextFetchEvent) => Promise<Response>;

// Optimistic access control based on the session token. Pages and server
// actions re-check the role against the database (src/server/auth/guards.ts).
// With a lazy Auth.js config, `auth(callback)` resolves to the handler
// asynchronously, hence the cast and the await below.
const handlerPromise = auth((request) => {
  const { pathname, search } = request.nextUrl;
  const decision = decideAccess(pathname, request.auth?.user?.role ?? null);

  if (decision === "login") {
    const loginUrl = new URL("/connexion", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (decision === "forbidden") {
    return NextResponse.rewrite(new URL("/interdit", request.nextUrl.origin), { status: 403 });
  }

  return NextResponse.next();
}) as unknown as Promise<ProxyHandler>;

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const handler = await handlerPromise;
  return handler(request, event);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
