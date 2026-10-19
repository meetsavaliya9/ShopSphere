import { proxyNestRequest } from "../../../../lib/server/nest-proxy";

export const dynamic = "force-dynamic";

function resolveRoute(segments, method) {
  const path = segments.join("/");
  if (path === "access" && method === "GET") return "/manager/access";
  if (path === "dashboard" && method === "GET") return "/manager/dashboard";
  if (path === "inventory/alerts" && method === "GET") return "/manager/inventory/alerts";
  if (path === "inventory/history" && method === "GET") return "/manager/inventory/history";
  if (path === "inventory/reports" && method === "GET") return "/manager/inventory/reports";
  if (path === "inventory/reports/export" && method === "GET") return "/manager/inventory/reports/export";
  if (path === "products/image" && method === "POST") return "/manager/products/image";
  if (path === "products/import/preview" && method === "POST") return "/manager/products/import/preview";
  if (path === "products/import" && method === "POST") return "/manager/products/import";
  if (path === "products/import/template" && method === "GET") return "/manager/products/import/template";
  if (path === "products" && ["GET", "POST"].includes(method)) return "/manager/products";
  if (path === "categories" && ["GET", "POST"].includes(method)) return "/manager/categories";
  if (path === "orders" && method === "GET") return "/manager/orders";
  const categoryMatch = path.match(/^categories\/([1-9]\d*)$/);
  if (categoryMatch && ["PATCH", "DELETE"].includes(method)) {
    return `/manager/categories/${categoryMatch[1]}`;
  }
  const productMatch = path.match(/^products\/([1-9]\d*)$/);
  if (productMatch && ["GET", "PUT", "DELETE"].includes(method)) {
    return `/manager/products/${productMatch[1]}`;
  }
  const inventoryMatch = path.match(/^products\/([1-9]\d*)\/inventory$/);
  if (inventoryMatch && method === "PATCH") {
    return `/manager/products/${inventoryMatch[1]}/inventory`;
  }
  const stockMatch = path.match(/^products\/([1-9]\d*)\/stock$/);
  if (stockMatch && method === "PATCH") {
    return `/manager/products/${stockMatch[1]}/stock`;
  }
  return null;
}

async function dispatch(request, context) {
  const { segments } = await context.params;
  const endpoint = resolveRoute(segments, request.method.toUpperCase());
  if (!endpoint) return Response.json({ error: { message: "Route not found" } }, { status: 404 });
  const query = request.method.toUpperCase() === "GET" ? new URL(request.url).search : "";
  return proxyNestRequest(request, `${endpoint}${query}`);
}

export const GET = dispatch;
export const PATCH = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;
