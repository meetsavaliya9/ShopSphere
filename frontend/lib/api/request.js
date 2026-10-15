class ApiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function errorMessage(payload, fallback) {
  const message = payload && payload.error && payload.error.message;
  if (typeof message === "string" && message.length > 0) {
    return message;
  }
  if (payload && typeof payload.message === "string" && payload.message.length > 0) {
    return payload.message;
  }
  return fallback;
}

async function requestJson(url, options = {}, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new ApiError("The service did not respond in time. Please try again.", 504);
    }
    throw new ApiError("The service could not be reached. Please try again.", 502);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("The service returned an unreadable response.", response.status);
  }

  if (!response.ok) {
    throw new ApiError(errorMessage(payload, `The service returned HTTP ${response.status}.`), response.status);
  }

  return payload;
}

function getServiceEndpoint(environmentVariable, path) {
  const baseUrl = process.env[environmentVariable];
  if (!baseUrl) {
    throw new ApiError(`${environmentVariable} is not configured on the frontend server.`, 503);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new ApiError(`${environmentVariable} must be a valid HTTP(S) URL.`, 500);
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new ApiError(`${environmentVariable} must use HTTP or HTTPS.`, 500);
  }

  const configuredPrefix = parsedUrl.pathname.replace(/\/+$/, "");
  if (configuredPrefix && configuredPrefix !== "/api/v1") {
    throw new ApiError(`${environmentVariable} must be a backend origin or end in /api/v1.`, 500);
  }
  if (parsedUrl.search || parsedUrl.hash) {
    throw new ApiError(`${environmentVariable} must not include a query string or fragment.`, 500);
  }

  let requestedUrl;
  try {
    requestedUrl = new URL(path, parsedUrl.origin);
  } catch {
    throw new ApiError("The backend API path is invalid.", 500);
  }
  if (requestedUrl.origin !== parsedUrl.origin) {
    throw new ApiError("The backend API path must remain on the configured service.", 500);
  }

  const apiPath = requestedUrl.pathname === "/api/v1" || requestedUrl.pathname.startsWith("/api/v1/")
    ? requestedUrl.pathname
    : `/api/v1${requestedUrl.pathname}`;
  return `${parsedUrl.origin}${apiPath}${requestedUrl.search}`;
}

module.exports = { ApiError, getServiceEndpoint, requestJson };
