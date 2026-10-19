import { ApiError, getServiceEndpoint } from "../api/request.js";

const NEST_REQUEST_TIMEOUT_MS = 45_000;

export async function proxyNestRequest(request, endpoint) {
  try {
    const headers = new Headers();
    for (const name of ["content-type", "cookie", "x-csrf-token", "idempotency-key"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    const method = request.method.toUpperCase();
    const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
    if (body !== undefined) {
      headers.set("content-length", String(body.byteLength));
    }
    const upstream = await fetch(getServiceEndpoint("NEST_API_URL", endpoint), {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(NEST_REQUEST_TIMEOUT_MS)
    });
    const responseHeaders = new Headers({
      "content-type": upstream.headers.get("content-type") || "application/json",
      "cache-control": "no-store"
    });
    const contentDisposition = upstream.headers.get("content-disposition");
    if (contentDisposition) {
      responseHeaders.set("content-disposition", contentDisposition);
    }
    const setCookies = typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : [];
    for (const cookie of setCookies) {
      responseHeaders.append("set-cookie", cookie);
    }
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: responseHeaders
    });
  } catch (error) {
    const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    const status = error instanceof ApiError ? error.status : isTimeout ? 504 : 502;
    const message =
      error instanceof ApiError
        ? error.message
        : isTimeout
          ? "The account service took too long to respond. Please try again."
          : "The account service could not be reached. Please try again.";
    console.error("NestJS proxy request failed:", {
      endpoint,
      status,
      error: isTimeout ? "request_timeout" : error instanceof Error ? error.name : "Unknown error",
      code: error?.code
    });
    return Response.json({ error: { message } }, { status });
  }
}
