import { NextResponse } from "next/server";
import { listProducts } from "../../../lib/api/catalog";
import { apiErrorResponse } from "../../../lib/api/errors";
import { proxyNestRequest } from "../../../lib/server/nest-proxy";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const query = request.nextUrl.searchParams;
    const filters = Object.fromEntries(
      ["search", "category", "minPrice", "maxPrice", "sortBy", "order", "page", "limit"]
        .filter((key) => query.has(key))
        .map((key) => [key, query.get(key)])
    );
    const result = await listProducts(filters);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request) {
  return proxyNestRequest(request, "/products");
}
