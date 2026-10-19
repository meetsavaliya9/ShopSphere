import assert from "node:assert/strict";
import test, { describe, beforeEach, afterEach } from "node:test";
import { ApiError, getServiceEndpoint } from "../lib/api/request.js";
import { proxyNestRequest } from "../lib/server/nest-proxy.js";

describe("Production Registration & Auth Proxy", () => {
  let originalNestUrl;
  let originalBackendUrl;
  let originalApiUrl;
  let originalPublicUrl;
  let originalFetch;

  beforeEach(() => {
    originalNestUrl = process.env.NEST_API_URL;
    originalBackendUrl = process.env.BACKEND_URL;
    originalApiUrl = process.env.API_URL;
    originalPublicUrl = process.env.NEXT_PUBLIC_NEST_API_URL;
    originalFetch = globalThis.fetch;

    delete process.env.NEST_API_URL;
    delete process.env.BACKEND_URL;
    delete process.env.API_URL;
    delete process.env.NEXT_PUBLIC_NEST_API_URL;
  });

  afterEach(() => {
    if (originalNestUrl !== undefined) process.env.NEST_API_URL = originalNestUrl;
    else delete process.env.NEST_API_URL;

    if (originalBackendUrl !== undefined) process.env.BACKEND_URL = originalBackendUrl;
    else delete process.env.BACKEND_URL;

    if (originalApiUrl !== undefined) process.env.API_URL = originalApiUrl;
    else delete process.env.API_URL;

    if (originalPublicUrl !== undefined) process.env.NEXT_PUBLIC_NEST_API_URL = originalPublicUrl;
    else delete process.env.NEXT_PUBLIC_NEST_API_URL;

    globalThis.fetch = originalFetch;
  });

  describe("Backend URL Configuration & Fallbacks", () => {
    test("reads from NEST_API_URL and trims whitespace", () => {
      process.env.NEST_API_URL = "  https://backend.example.com/api/v1  ";
      const endpoint = getServiceEndpoint("NEST_API_URL", "/auth/register");
      assert.equal(endpoint, "https://backend.example.com/api/v1/auth/register");
    });

    test("falls back to BACKEND_URL when NEST_API_URL is missing or empty", () => {
      process.env.BACKEND_URL = "https://backend-fallback.example.com";
      const endpoint = getServiceEndpoint("NEST_API_URL", "/auth/register");
      assert.equal(endpoint, "https://backend-fallback.example.com/api/v1/auth/register");
    });

    test("falls back to API_URL when other variables are unset", () => {
      process.env.API_URL = "https://api-fallback.example.com/api/v1";
      const endpoint = getServiceEndpoint("NEST_API_URL", "/auth/register");
      assert.equal(endpoint, "https://api-fallback.example.com/api/v1/auth/register");
    });

    test("falls back to NEXT_PUBLIC_NEST_API_URL when server variables are unset", () => {
      process.env.NEXT_PUBLIC_NEST_API_URL = "https://public-fallback.example.com";
      const endpoint = getServiceEndpoint("NEST_API_URL", "/auth/register");
      assert.equal(endpoint, "https://public-fallback.example.com/api/v1/auth/register");
    });

    test("throws 503 when no backend environment variable is configured", () => {
      assert.throws(
        () => getServiceEndpoint("NEST_API_URL", "/auth/register"),
        (err) => err instanceof ApiError && err.status === 503
      );
    });

    test("throws 500 when configured URL is malformed", () => {
      process.env.NEST_API_URL = "not-a-valid-url";
      assert.throws(
        () => getServiceEndpoint("NEST_API_URL", "/auth/register"),
        (err) => err instanceof ApiError && err.status === 500
      );
    });

    test("throws 500 when configured URL uses an unsupported protocol", () => {
      process.env.NEST_API_URL = "ftp://backend.example.com";
      assert.throws(
        () => getServiceEndpoint("NEST_API_URL", "/auth/register"),
        (err) => err instanceof ApiError && err.status === 500
      );
    });

    test("throws 500 when configured base URL has an unrecognized prefix", () => {
      process.env.NEST_API_URL = "https://backend.example.com/custom/prefix";
      assert.throws(
        () => getServiceEndpoint("NEST_API_URL", "/auth/register"),
        (err) => err instanceof ApiError && err.status === 500
      );
    });

    test("throws 500 when configured URL contains query string or hash", () => {
      process.env.NEST_API_URL = "https://backend.example.com/api/v1?token=123";
      assert.throws(
        () => getServiceEndpoint("NEST_API_URL", "/auth/register"),
        (err) => err instanceof ApiError && err.status === 500
      );
    });
  });

  describe("Path Forwarding", () => {
    test("maps /auth/register to /api/v1/auth/register on root base URL", () => {
      process.env.NEST_API_URL = "https://backend.example.com";
      assert.equal(
        getServiceEndpoint("NEST_API_URL", "/auth/register"),
        "https://backend.example.com/api/v1/auth/register"
      );
    });

    test("maps /auth/register to /api/v1/auth/register on base URL with /api/v1", () => {
      process.env.NEST_API_URL = "https://backend.example.com/api/v1";
      assert.equal(
        getServiceEndpoint("NEST_API_URL", "/auth/register"),
        "https://backend.example.com/api/v1/auth/register"
      );
    });

    test("handles endpoint path without leading slash", () => {
      process.env.NEST_API_URL = "https://backend.example.com";
      assert.equal(
        getServiceEndpoint("NEST_API_URL", "auth/register"),
        "https://backend.example.com/api/v1/auth/register"
      );
    });

    test("preserves query strings during forwarding", () => {
      process.env.NEST_API_URL = "https://backend.example.com";
      assert.equal(
        getServiceEndpoint("NEST_API_URL", "/auth/csrf?format=json"),
        "https://backend.example.com/api/v1/auth/csrf?format=json"
      );
    });
  });

  describe("Registration Request Forwarding via proxyNestRequest", () => {
    test("forwards registration POST request with body and allowed headers, without host or content-length", async () => {
      process.env.NEST_API_URL = "https://backend.example.com/api/v1";

      let capturedUrl = "";
      let capturedMethod = "";
      let capturedHeaders = {};
      let capturedBodyText = "";

      globalThis.fetch = async (url, options) => {
        capturedUrl = url;
        capturedMethod = options.method;
        capturedHeaders = Object.fromEntries(options.headers.entries());
        if (options.body) {
          capturedBodyText = new TextDecoder().decode(options.body);
        }
        return new Response(
          JSON.stringify({
            data: {
              message: "A verification code has been sent to your email.",
              challengeId: "test-challenge-123"
            }
          }),
          {
            status: 202,
            headers: {
              "content-type": "application/json",
              "set-cookie": "shopsphere_csrf=test-token; Path=/"
            }
          }
        );
      };

      const registrationBody = JSON.stringify({
        name: "Test Customer",
        email: "customer@example.com",
        password: "Password123!"
      });

      const incomingRequest = new Request("https://shop-sphere-beryl-seven.vercel.app/api/auth/register", {
        method: "POST",
        headers: {
          "host": "shop-sphere-beryl-seven.vercel.app",
          "content-type": "application/json",
          "cookie": "shopsphere_csrf=test-token",
          "x-csrf-token": "test-token",
          "x-forwarded-for": "1.2.3.4"
        },
        body: registrationBody
      });

      const response = await proxyNestRequest(incomingRequest, "/auth/register");

      assert.equal(response.status, 202);
      assert.equal(capturedUrl, "https://backend.example.com/api/v1/auth/register");
      assert.equal(capturedMethod, "POST");
      assert.equal(capturedHeaders["content-type"], "application/json");
      assert.equal(capturedHeaders["cookie"], "shopsphere_csrf=test-token");
      assert.equal(capturedHeaders["x-csrf-token"], "test-token");

      // Verify forbidden / problematic headers are NOT passed
      assert.equal(capturedHeaders["host"], undefined);
      assert.equal(capturedHeaders["content-length"], undefined);

      assert.deepEqual(JSON.parse(capturedBodyText), {
        name: "Test Customer",
        email: "customer@example.com",
        password: "Password123!"
      });

      const responseJson = await response.json();
      assert.equal(responseJson.data.challengeId, "test-challenge-123");
      assert.equal(response.headers.get("set-cookie"), "shopsphere_csrf=test-token; Path=/");
    });

    test("passes through upstream 500 error response without crashing", async () => {
      process.env.NEST_API_URL = "https://backend.example.com";

      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({ error: { message: "Internal server error" } }),
          {
            status: 500,
            headers: { "content-type": "application/json" }
          }
        );
      };

      const incomingRequest = new Request("https://frontend.test/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "A", email: "a@b.com", password: "Password123!" })
      });

      const response = await proxyNestRequest(incomingRequest, "/auth/register");
      assert.equal(response.status, 500);
      const json = await response.json();
      assert.equal(json.error.message, "Internal server error");
    });

    test("returns 502 with sanitized message when upstream network connection fails", async () => {
      process.env.NEST_API_URL = "https://backend.example.com";

      globalThis.fetch = async () => {
        const networkError = new TypeError("fetch failed");
        networkError.code = "ECONNREFUSED";
        throw networkError;
      };

      const incomingRequest = new Request("https://frontend.test/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "A", email: "a@b.com", password: "Password123!" })
      });

      const response = await proxyNestRequest(incomingRequest, "/auth/register");
      assert.equal(response.status, 502);
      const json = await response.json();
      assert.equal(json.error.message, "The account service could not be reached. Please try again.");
    });

    test("returns 504 when upstream times out", async () => {
      process.env.NEST_API_URL = "https://backend.example.com";

      globalThis.fetch = async () => {
        const timeoutError = new Error("The operation was aborted due to timeout");
        timeoutError.name = "TimeoutError";
        throw timeoutError;
      };

      const incomingRequest = new Request("https://frontend.test/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "A", email: "a@b.com", password: "Password123!" })
      });

      const response = await proxyNestRequest(incomingRequest, "/auth/register");
      assert.equal(response.status, 504);
      const json = await response.json();
      assert.equal(json.error.message, "The account service took too long to respond. Please try again.");
    });
  });
});
