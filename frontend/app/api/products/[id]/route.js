import { NextResponse } from "next/server";
import { getProduct } from "../../../../lib/api/catalog";
import { apiErrorResponse } from "../../../../lib/api/errors";
import { proxyNestRequest } from "../../../../lib/server/nest-proxy";

export const dynamic = "force-dynamic";

export async function GET(request, context) {
  try {
    const { id } = await context.params;
    const result = await getProduct(id);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request, context) {
  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id)) return Response.json({ error: { message: "Product not found" } }, { status: 404 });
  return proxyNestRequest(request, `/products/${id}`);
}

export async function DELETE(request, context) {
  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id)) return Response.json({ error: { message: "Product not found" } }, { status: 404 });
  return proxyNestRequest(request, `/products/${id}`);
}
