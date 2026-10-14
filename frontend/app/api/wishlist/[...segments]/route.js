import { proxyNestRequest } from "../../../../lib/server/nest-proxy";

export const dynamic = "force-dynamic";

async function dispatch(request, context) {
  const { segments = [] } = await context.params;
  const method = request.method.toUpperCase();
  let endpoint;

  if (segments.length === 1 && segments[0] === "items" && method === "POST") {
    endpoint = "/wishlist/items";
  } else if (segments.length === 2 && segments[0] === "items" && method === "DELETE") {
    endpoint = `/wishlist/items/${encodeURIComponent(segments[1])}`;
  }

  if (!endpoint) {
    return Response.json({ error: { message: "Route not found" } }, { status: 404 });
  }
  return proxyNestRequest(request, endpoint);
}

export const POST = dispatch;
export const DELETE = dispatch;
