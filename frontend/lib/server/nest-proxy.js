import { ApiError, getServiceEndpoint } from "../api/request.js";

const NEST_REQUEST_TIMEOUT_MS = 45_000;

export async function proxyNestRequest(request, endpoint) {
  const method = request.method.toUpperCase();
  try {
    const headers = new Headers();
    for (const name of ["content-type", "cookie", "x-csrf-token", "idempotency-key"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.delete("host");
    headers.delete("content-length");

    const targetUrlString = getServiceEndpoint("NEST_API_URL", endpoint);
    const targetUrl = new URL(targetUrlString);

    const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

    const upstream = await fetch(targetUrl.toString(), {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(NEST_REQUEST_TIMEOUT_MS)
    });

    if (!upstream.ok) {
      console.warn("NestJS upstream response warning:", {
        targetHost: targetUrl.hostname,
        targetPath: targetUrl.pathname,
        method,
        upstreamStatus: upstream.status
      });
    }

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

    let targetHost = "unconfigured";
    let targetPath = endpoint;
    try {
      const resolved = new URL(getServiceEndpoint("NEST_API_URL", endpoint));
      targetHost = resolved.hostname;
      targetPath = resolved.pathname;
    } catch {
      // Configuration or URL parse error
    }

    console.error("NestJS proxy request failed:", {
      targetHost,
      targetPath,
      method,
      status,
      errorName: isTimeout ? "TimeoutError" : error instanceof Error ? error.name : "UnknownError",
      errorCode: error?.code || null
    });
    return Response.json({ error: { message } }, { status });
  }
}
