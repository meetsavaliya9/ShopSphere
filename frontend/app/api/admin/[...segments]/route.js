import { proxyNestRequest } from "../../../../lib/server/nest-proxy";

export const dynamic = "force-dynamic";

async function dispatch(request, context) {
  const { segments } = await context.params;
  const url = new URL(request.url);
  const search = url.search || "";
  const endpoint = `/admin/${segments.join("/")}${search}`;
  return proxyNestRequest(request, endpoint);
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
