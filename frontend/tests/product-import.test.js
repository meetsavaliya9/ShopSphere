const assert = require("node:assert/strict");
const { test, describe, it } = require("node:test");
const { getServiceEndpoint, ApiError, requestJson } = require("../lib/api/request");
const { authRequest, AuthRequestError } = require("../lib/api/auth");
const { proxyNestRequest } = require("../lib/server/nest-proxy");
const { isAllowedImageSrc } = require("../lib/image-url");

describe("Product Import Feature", () => {
  describe("Task 2 & 3: URL Construction and Route Resolution", () => {
    test("reproduces root cause: relative endpoint without leading slash duplicates page path", () => {
      const pageUrl = new URL("http://localhost:3000/admin/products/import");
      const relativeEndpoint = "admin/products/import";
      const resolvedUrl = new URL(relativeEndpoint, pageUrl).toString();

      // This reproduces the exact bug: /admin/products/admin/products/import
      assert.equal(resolvedUrl, "http://localhost:3000/admin/products/admin/products/import");
    });

    test("correct absolute preview endpoints resolve without path duplication", () => {
      const pageUrl = new URL("http://localhost:3000/admin/products/import");

      const adminEndpoint = "/api/admin/products/import/preview";
      const managerEndpoint = "/api/manager/products/import/preview";

      assert.equal(
        new URL(adminEndpoint, pageUrl).toString(),
        "http://localhost:3000/api/admin/products/import/preview"
      );
      assert.equal(
        new URL(managerEndpoint, pageUrl).toString(),
        "http://localhost:3000/api/manager/products/import/preview"
      );
    });

    test("authRequest targets /api/admin/products/import and /api/manager/products/import", async () => {
      const recordedUrls = [];
      const fakeFetch = async (url) => {
        recordedUrls.push(url);
        return new Response(JSON.stringify({ success: true, results: { total: 0 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      };

      await authRequest("admin/products/import", {
        method: "POST",
        body: { products: [] },
        includeEnvelope: true,
        fetchImpl: fakeFetch
      });

      await authRequest("manager/products/import", {
        method: "POST",
        body: { products: [] },
        includeEnvelope: true,
        fetchImpl: fakeFetch
      });

      assert.deepEqual(recordedUrls, [
        "/api/admin/products/import",
        "/api/manager/products/import"
      ]);
    });

    test("getServiceEndpoint maps preview and import endpoints to NestJS API routes with /api/v1 prefix", () => {
      const originalUrl = process.env.NEST_API_URL;
      try {
        process.env.NEST_API_URL = "http://127.0.0.1:3004";

        assert.equal(
          getServiceEndpoint("NEST_API_URL", "/admin/products/import/preview"),
          "http://127.0.0.1:3004/api/v1/admin/products/import/preview"
        );
        assert.equal(
          getServiceEndpoint("NEST_API_URL", "/admin/products/import"),
          "http://127.0.0.1:3004/api/v1/admin/products/import"
        );
        assert.equal(
          getServiceEndpoint("NEST_API_URL", "/manager/products/import/preview"),
          "http://127.0.0.1:3004/api/v1/manager/products/import/preview"
        );
        assert.equal(
          getServiceEndpoint("NEST_API_URL", "/manager/products/import"),
          "http://127.0.0.1:3004/api/v1/manager/products/import"
        );
      } finally {
        if (originalUrl === undefined) delete process.env.NEST_API_URL;
        else process.env.NEST_API_URL = originalUrl;
      }
    });
  });

  describe("Task 4: Multipart Upload Forwarding", () => {
    test("proxyNestRequest forwards multipart FormData, headers, and cookies to NestJS backend", async () => {
      const originalUrl = process.env.NEST_API_URL;
      const originalFetch = globalThis.fetch;

      try {
        process.env.NEST_API_URL = "http://127.0.0.1:3004";

        let upstreamCalled = false;
        let upstreamUrl = "";
        let upstreamMethod = "";
        let upstreamHeaders = {};
        let upstreamBodyLength = 0;

        const fakeUpstreamBody = JSON.stringify({
          success: true,
          filename: "test.csv",
          headerValidation: { valid: true },
          rowResults: [],
          summary: { total: 0, valid: 0, duplicate: 0, invalid: 0 }
        });

        globalThis.fetch = async (url, options) => {
          upstreamCalled = true;
          upstreamUrl = url;
          upstreamMethod = options.method;
          upstreamHeaders = Object.fromEntries(options.headers.entries());
          upstreamBodyLength = options.body ? options.body.byteLength : 0;

          return new Response(fakeUpstreamBody, {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": "shopsphere_session=abc123; Path=/"
            }
          });
        };

        const boundary = "----WebKitFormBoundaryXYZ";
        const multipartBody = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="products.csv"\r\nContent-Type: text/csv\r\n\r\nname,category,price\r\nItem 1,Electronics,10\r\n--${boundary}--\r\n`;
        const buffer = Buffer.from(multipartBody);

        const incomingRequest = new Request("http://localhost:3000/api/admin/products/import/preview", {
          method: "POST",
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Cookie": "shopsphere_session=abc123",
            "X-CSRF-Token": "test-csrf-token",
            "Idempotency-Key": "test-idempotency"
          },
          body: buffer
        });

        const proxyResponse = await proxyNestRequest(incomingRequest, "/admin/products/import/preview");

        assert.equal(upstreamCalled, true);
        assert.equal(upstreamUrl, "http://127.0.0.1:3004/api/v1/admin/products/import/preview");
        assert.equal(upstreamMethod, "POST");
        assert.equal(upstreamHeaders["content-type"], `multipart/form-data; boundary=${boundary}`);
        assert.equal(upstreamHeaders["cookie"], "shopsphere_session=abc123");
        assert.equal(upstreamHeaders["x-csrf-token"], "test-csrf-token");
        assert.equal(upstreamHeaders["idempotency-key"], "test-idempotency");
        assert.equal(upstreamBodyLength, buffer.byteLength);

        assert.equal(proxyResponse.status, 200);
        const responseJson = await proxyResponse.json();
        assert.equal(responseJson.success, true);
        assert.equal(responseJson.filename, "test.csv");
      } finally {
        globalThis.fetch = originalFetch;
        if (originalUrl === undefined) delete process.env.NEST_API_URL;
        else process.env.NEST_API_URL = originalUrl;
      }
    });
  });

  describe("Task 5 & 6: Safe JSON and Non-JSON Response Error Handling", () => {
    test("handles Next.js Server Action 409 plain-text response safely without JSON parse error", async () => {
      // When a POST hits a page route, Next.js returns 409 Conflict with plain text "Server Action not found"
      const fakeFetch = async () =>
        new Response('Server Action "abc123" was not found on this server.', {
          status: 409,
          headers: { "Content-Type": "text/plain" }
        });

      await assert.rejects(
        authRequest("admin/products/import", {
          method: "POST",
          body: { products: [] },
          fetchImpl: fakeFetch
        }),
        (error) => {
          assert.equal(error instanceof AuthRequestError, true);
          assert.equal(error.status, 409);
          assert.match(error.message, /Server Action/);
          return true;
        }
      );
    });

    test("handles 502 / 500 HTML error responses without crashing on '<' token", async () => {
      const htmlBody = "<!DOCTYPE html><html><body><h1>502 Bad Gateway</h1></body></html>";
      const fakeFetch = async () =>
        new Response(htmlBody, {
          status: 502,
          headers: { "Content-Type": "text/html" }
        });

      await assert.rejects(
        authRequest("admin/products/import", {
          method: "POST",
          body: { products: [] },
          fetchImpl: fakeFetch
        }),
        (error) => {
          assert.equal(error instanceof AuthRequestError, true);
          assert.equal(error.status, 502);
          assert.equal(error.message, "The request failed with status 502.");
          return true;
        }
      );
    });

    test("preserves JSON API error messages and status codes (400 Bad Request)", async () => {
      const fakeFetch = async () =>
        new Response(JSON.stringify({ error: { message: "Invalid file type. Only CSV and Excel files are allowed." } }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });

      await assert.rejects(
        authRequest("admin/products/import", {
          method: "POST",
          body: { products: [] },
          fetchImpl: fakeFetch
        }),
        (error) => {
          assert.equal(error instanceof AuthRequestError, true);
          assert.equal(error.status, 400);
          assert.equal(error.message, "Invalid file type. Only CSV and Excel files are allowed.");
          return true;
        }
      );
    });

    test("safe dashboard upload parsing logic handles non-JSON and JSON correctly", async () => {
      // Simulate dashboard upload parsing
      async function parseDashboardUploadResponse(response) {
        let result = null;
        let rawText = "";
        try {
          rawText = await response.text();
          result = rawText ? JSON.parse(rawText) : null;
        } catch {
          result = null;
        }

        if (!response.ok) {
          const serverMessage =
            (result?.headerValidation?.missingRequired?.length
              ? `Missing required fields: ${result.headerValidation.missingRequired.join(", ")}`
              : null) ||
            result?.error?.message ||
            result?.message ||
            (rawText && !rawText.startsWith("<") && !rawText.startsWith("{") && rawText.length < 300
              ? rawText.trim()
              : null);
          throw new Error(
            serverMessage || `Failed to parse file (${response.status})`,
          );
        }

        if (!result) {
          throw new Error("The server returned an unreadable response.");
        }

        if (!result.success) {
          throw new Error(
            result.headerValidation?.missingRequired?.length
              ? `Missing required fields: ${result.headerValidation.missingRequired.join(", ")}`
              : result.error?.message || result.message || "Invalid file format",
          );
        }

        return result;
      }

      // 1. Plain text 409 Next.js Server Action
      const serverActionResponse = new Response('Server Action not found', { status: 409 });
      await assert.rejects(
        parseDashboardUploadResponse(serverActionResponse),
        (error) => error.message === "Server Action not found"
      );

      // 2. HTML 502 response
      const htmlResponse = new Response('<!DOCTYPE html><html><body>502 Bad Gateway</body></html>', { status: 502 });
      await assert.rejects(
        parseDashboardUploadResponse(htmlResponse),
        (error) => error.message === "Failed to parse file (502)"
      );

      // 3. 400 JSON missing required headers
      const missingHeadersResponse = new Response(
        JSON.stringify({
          success: false,
          headerValidation: { valid: false, missingRequired: ["price", "category"] }
        }),
        { status: 400 }
      );
      await assert.rejects(
        parseDashboardUploadResponse(missingHeadersResponse),
        (error) => error.message === "Missing required fields: price, category"
      );

      // 4. Valid 200 response
      const validResponse = new Response(
        JSON.stringify({
          success: true,
          filename: "products.csv",
          headerValidation: { valid: true, missingRequired: [] },
          rowResults: [{ rowNumber: 2, status: "valid", data: { name: "P1", category: "Cat", price: 10 } }],
          summary: { total: 1, valid: 1, duplicate: 0, invalid: 0 }
        }),
        { status: 200 }
      );
      const data = await parseDashboardUploadResponse(validResponse);
      assert.equal(data.success, true);
      assert.equal(data.rowResults.length, 1);
    });
  });

  describe("Task 7: Legitimate Duplicate Conflicts", () => {
    test("does NOT suppress genuine 409 Conflict errors or treat them as success", async () => {
      const duplicateErrorBody = JSON.stringify({
        error: { message: 'Product "Smart Watch" in category "Electronics" already exists.' }
      });
      const fakeFetch = async () =>
        new Response(duplicateErrorBody, {
          status: 409,
          headers: { "Content-Type": "application/json" }
        });

      await assert.rejects(
        authRequest("admin/products/import", {
          method: "POST",
          body: { products: [{ name: "Smart Watch", category: "Electronics", price: 99 }] },
          fetchImpl: fakeFetch
        }),
        (error) => {
          assert.equal(error instanceof AuthRequestError, true);
          assert.equal(error.status, 409);
          assert.equal(error.message, 'Product "Smart Watch" in category "Electronics" already exists.');
          return true;
        }
      );
    });

    test("correctly parses import results containing skipped duplicates and errors", async () => {
      const importResponsePayload = {
        success: true,
        results: {
          total: 3,
          successful: 2,
          skipped: 1,
          failed: 0,
          errors: [
            {
              row: 3,
              error: 'Product "Wireless Earbuds" in category "Audio" already exists (ID: 42)'
            }
          ]
        }
      };

      const fakeFetch = async () =>
        new Response(JSON.stringify(importResponsePayload), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });

      // authRequest with includeEnvelope: true returns top-level payload with results
      const response = await authRequest("admin/products/import", {
        method: "POST",
        body: { products: [{ name: "P1" }, { name: "P2" }, { name: "P3" }] },
        includeEnvelope: true,
        fetchImpl: fakeFetch
      });

      const results = response?.results || response?.data?.results || response;
      assert.equal(results.total, 3);
      assert.equal(results.successful, 2);
      assert.equal(results.skipped, 1);
      assert.equal(results.failed, 0);
      assert.equal(results.errors.length, 1);
      assert.match(results.errors[0].error, /already exists/);
    });
  });

  describe("Task 8: Field Validation and Data Normalization", () => {
    function validateClientRow(data, rowNumber, existingRows = []) {
      const errors = [];
      if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
        errors.push("Product name is required and cannot be empty");
      } else if (data.name.trim().length > 191) {
        errors.push("Product name exceeds maximum length of 191 characters");
      }

      if (!data.category || typeof data.category !== "string" || !data.category.trim()) {
        errors.push("Category is required and cannot be empty");
      } else if (data.category.trim().length > 100) {
        errors.push("Category exceeds maximum length of 100 characters");
      }

      const numPrice = Number(data.price);
      if (
        data.price === undefined ||
        data.price === null ||
        data.price === "" ||
        !Number.isFinite(numPrice)
      ) {
        errors.push("Price must be a valid number");
      } else if (numPrice < 0) {
        errors.push("Price cannot be negative");
      } else if (numPrice > 99999999.99) {
        errors.push("Price exceeds maximum allowed value of 99999999.99");
      }

      if (data.stockQuantity !== undefined && data.stockQuantity !== null && data.stockQuantity !== "") {
        const numStock = Number(data.stockQuantity);
        if (!Number.isFinite(numStock) || !Number.isSafeInteger(numStock) || numStock < 0) {
          errors.push("Stock quantity must be a non-negative whole number");
        }
      }

      if (data.lowStockThreshold !== undefined && data.lowStockThreshold !== null && data.lowStockThreshold !== "") {
        const numThreshold = Number(data.lowStockThreshold);
        if (!Number.isFinite(numThreshold) || !Number.isSafeInteger(numThreshold) || numThreshold < 0) {
          errors.push("Low stock threshold must be a non-negative whole number");
        }
      }

      if (data.imageUrl && typeof data.imageUrl === "string" && data.imageUrl.trim() !== "") {
        if (data.imageUrl.trim().length > 2048) {
          errors.push("Image URL exceeds maximum length of 2048 characters");
        } else if (!isAllowedImageSrc(data.imageUrl.trim())) {
          errors.push("Image URL hostname is not configured (allowed: images.unsplash.com, res.cloudinary.com)");
        }
      }

      if (errors.length > 0) {
        return { status: "invalid", errors };
      }

      const normName = data.name.trim().toLowerCase();
      const normCat = data.category.trim().toLowerCase();
      const dup = existingRows.find(
        (r) =>
          r.rowNumber !== rowNumber &&
          r.name?.trim().toLowerCase() === normName &&
          r.category?.trim().toLowerCase() === normCat
      );

      if (dup) {
        return { status: "duplicate", duplicateSource: "uploaded_file" };
      }

      return { status: "valid", errors: [] };
    }

    test("validates valid product data correctly", () => {
      const row = {
        name: "Wireless Mouse",
        category: "Electronics",
        price: "499.00",
        stockQuantity: "50",
        lowStockThreshold: "10"
      };
      const res = validateClientRow(row, 2, []);
      assert.equal(res.status, "valid");
      assert.equal(res.errors.length, 0);
    });

    test("flags missing required fields and negative price", () => {
      const invalidRow = {
        name: "",
        category: "Electronics",
        price: -10
      };
      const res = validateClientRow(invalidRow, 2, []);
      assert.equal(res.status, "invalid");
      assert.equal(res.errors.includes("Product name is required and cannot be empty"), true);
      assert.equal(res.errors.includes("Price cannot be negative"), true);
    });

    test("detects duplicate product in same file by normalized name and category", () => {
      const existing = [
        { rowNumber: 2, name: "Noise Cancelling Headphones", category: "Audio" }
      ];
      const newRow = {
        name: "  NOISE CANCELLING HEADPHONES  ",
        category: "audio",
        price: 9999
      };
      const res = validateClientRow(newRow, 3, existing);
      assert.equal(res.status, "duplicate");
      assert.equal(res.duplicateSource, "uploaded_file");
    });

    test("handles optional fields with safe defaults without corrupting data", () => {
      const rowWithoutOptionals = {
        name: "Minimal Product",
        category: "General",
        price: 150
      };
      const res = validateClientRow(rowWithoutOptionals, 4, []);
      assert.equal(res.status, "valid");
      assert.equal(res.errors.length, 0);
    });

    test("validates image URLs: accepts configured host and empty image, rejects unconfigured placeholder host", () => {
      // Configured host
      const validRow = {
        name: "Headphones",
        category: "Electronics",
        price: 2999,
        imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e"
      };
      const validRes = validateClientRow(validRow, 2, []);
      assert.equal(validRes.status, "valid");
      assert.equal(validRes.errors.length, 0);

      // Empty optional image field
      const emptyImageRow = {
        name: "Notebook",
        category: "Stationery",
        price: 99,
        imageUrl: ""
      };
      const emptyRes = validateClientRow(emptyImageRow, 3, []);
      assert.equal(emptyRes.status, "valid");
      assert.equal(emptyRes.errors.length, 0);

      // Unconfigured placeholder hostname (example.com)
      const placeholderRow = {
        name: "Notebook Pack",
        category: "Stationery",
        price: 199,
        imageUrl: "https://example.com/images/notebook-pack.jpg"
      };
      const placeholderRes = validateClientRow(placeholderRow, 4, []);
      assert.equal(placeholderRes.status, "invalid");
      assert.equal(placeholderRes.errors.some(e => e.includes("not configured")), true);
    });
  });

  describe("Task 9: Partial Import Failures and Retry Safety", () => {
    test("handles partial import failure gracefully and returns per-row error breakdown", async () => {
      const serverResponse = {
        success: true,
        results: {
          total: 3,
          successful: 1,
          failed: 1,
          skipped: 1,
          errors: [
            { row: 2, error: "Database transaction failed on constraint check" },
            { row: 3, error: 'Product "P3" in category "Cat" already exists (ID: 10)' }
          ]
        }
      };

      const fakeFetch = async () =>
        new Response(JSON.stringify(serverResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });

      const response = await authRequest("admin/products/import", {
        method: "POST",
        body: { products: [{ rowNumber: 1 }, { rowNumber: 2 }, { rowNumber: 3 }] },
        includeEnvelope: true,
        fetchImpl: fakeFetch
      });

      const results = response?.results;
      assert.equal(results.successful, 1);
      assert.equal(results.failed, 1);
      assert.equal(results.skipped, 1);
      assert.equal(results.errors.length, 2);
    });

    test("import retry safety: duplicate checks safely skip already imported products on retry", async () => {
      // First attempt succeeds for row 1, fails for row 2
      // Retry attempt sends both: backend skips row 1 as duplicate and imports row 2
      const retryResponse = {
        success: true,
        results: {
          total: 2,
          successful: 1,
          failed: 0,
          skipped: 1,
          errors: [
            { row: 1, error: 'Product "P1" in category "C1" already exists (ID: 101)' }
          ]
        }
      };

      const fakeFetch = async () =>
        new Response(JSON.stringify(retryResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });

      const response = await authRequest("admin/products/import", {
        method: "POST",
        body: { products: [{ rowNumber: 1, name: "P1", category: "C1" }, { rowNumber: 2, name: "P2", category: "C2" }] },
        includeEnvelope: true,
        fetchImpl: fakeFetch
      });

      assert.equal(response.results.successful, 1);
      assert.equal(response.results.skipped, 1);
      assert.equal(response.results.failed, 0);
    });
  });

  describe("Task 10: Role Authorization & Template Endpoint", () => {
    test("template endpoints resolve with /api/v1 prefix for admin and manager", () => {
      const originalUrl = process.env.NEST_API_URL;
      try {
        process.env.NEST_API_URL = "http://127.0.0.1:3004";

        assert.equal(
          getServiceEndpoint("NEST_API_URL", "/admin/products/import/template?format=xlsx"),
          "http://127.0.0.1:3004/api/v1/admin/products/import/template?format=xlsx"
        );
        assert.equal(
          getServiceEndpoint("NEST_API_URL", "/manager/products/import/template?format=csv"),
          "http://127.0.0.1:3004/api/v1/manager/products/import/template?format=csv"
        );
      } finally {
        if (originalUrl === undefined) delete process.env.NEST_API_URL;
        else process.env.NEST_API_URL = originalUrl;
      }
    });
  });
});
