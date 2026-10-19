export class AuthRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "AuthRequestError";
    this.status = status;
  }
}

const AUTH_REQUEST_TIMEOUT_MS = 50_000;

export async function authRequest(path, {
  method = "GET",
  body,
  csrfToken,
  extraHeaders = {},
  includeEnvelope = false,
  fetchImpl = fetch
} = {}) {
  let response;
  try {
    response = await fetchImpl(`/api/${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        ...extraHeaders
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    throw new AuthRequestError(
      isTimeout
        ? "The account service took too long to respond. Please try again."
        : "The account service could not be reached. Please try again.",
      isTimeout ? 504 : 502
    );
  }

  let rawText = "";
  let payload = null;
  try {
    rawText = await response.text();
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      (rawText && !rawText.startsWith("<") && rawText.length < 300
        ? rawText.trim()
        : null) ||
      `The request failed with status ${response.status}.`;
    throw new AuthRequestError(message, response.status);
  }

  if (payload === null) {
    throw new AuthRequestError(
      "The account service returned an unreadable response.",
      response.status
    );
  }

  return includeEnvelope ? payload : (payload.data !== undefined ? payload.data : payload);
}
