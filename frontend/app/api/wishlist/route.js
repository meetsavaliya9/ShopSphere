import { proxyNestRequest } from "../../../lib/server/nest-proxy";

export const dynamic = "force-dynamic";

export async function GET(request) {
  return proxyNestRequest(request, "/wishlist");
}
