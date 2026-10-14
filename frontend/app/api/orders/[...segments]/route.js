import { proxyNestRequest } from "../../../../lib/server/nest-proxy";

export const dynamic = "force-dynamic";

async function dispatch(request, context) {
  const { segments = [] } = await context.params;
  const method = request.method.toUpperCase();
  let endpoint;
  if (segments.length === 1 && segments[0] === "quote" && ["GET", "POST"].includes(method)) {
    endpoint = "/orders/quote";
  } else if (segments.length === 1 && method === "GET" && /^\d+$/.test(segments[0])) {
    endpoint = `/orders/${encodeURIComponent(segments[0])}`;
  } else if (segments.length === 2 && segments[1] === "verify" && method === "POST" &&
      /^\d+$/.test(segments[0])) {
    endpoint = `/orders/${encodeURIComponent(segments[0])}/verify`;
  } else if (segments.length === 2 && segments[1] === "cancel" && method === "POST" &&
      /^\d+$/.test(segments[0])) {
    endpoint = `/orders/${encodeURIComponent(segments[0])}/cancel`;
  }
  if (!endpoint) {
    return Response.json({ error: { message: "Route not found" } }, { status: 404 });
  }
  return proxyNestRequest(request, endpoint);
}

export const GET = dispatch;
export const POST = dispatch;
