import { proxyNestRequest } from "../../../../lib/server/nest-proxy";

export const dynamic = "force-dynamic";

const allowedRoutes = {
  items: { POST: "/cart/items" },
  "items/:productId": {
    PATCH: (segments) => `/cart/items/${encodeURIComponent(segments[1])}`,
    DELETE: (segments) => `/cart/items/${encodeURIComponent(segments[1])}`
  }
};

async function dispatch(request, context) {
  const { segments = [] } = await context.params;
  const key = segments.length === 1 ? segments[0] : "items/:productId";
  const method = request.method.toUpperCase();
  const route = allowedRoutes[key];
  const endpoint = route?.[method];
  if (!endpoint || (key === "items/:productId" && segments.length !== 2)) {
    return Response.json({ error: { message: "Route not found" } }, { status: 404 });
  }
  return proxyNestRequest(
    request,
    typeof endpoint === "function" ? endpoint(segments) : endpoint
  );
}

export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
