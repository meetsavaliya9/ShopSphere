import { proxyNestRequest } from "../../../../lib/server/nest-proxy";

export const dynamic = "force-dynamic";

const routes = {
  csrf: { GET: "/auth/csrf" },
  login: { POST: "/auth/login" },
  register: { POST: "/auth/register" },
  "verify-otp": { POST: "/auth/verify-otp" },
  "resend-otp": { POST: "/auth/resend-otp" },
  logout: { POST: "/auth/logout" },
  me: { GET: "/auth/me", PATCH: "/auth/me" },
  "me/password": { PATCH: "/auth/me/password" }
};

async function dispatch(request, context) {
  const { segments } = await context.params;
  const key = segments.join("/");
  const route = routes[key];
  const endpoint = route?.[request.method.toUpperCase()];
  if (!endpoint) return Response.json({ error: { message: "Route not found" } }, { status: 404 });
  return proxyNestRequest(request, endpoint);
}

export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
