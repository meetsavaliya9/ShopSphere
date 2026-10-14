const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ApiError, getServiceEndpoint, requestJson } = require("../lib/api/request");
const { formatPrice } = require("../lib/catalog");

test("requestJson returns a JSON payload for successful responses", async () => {
  const result = await requestJson(
    "http://service.test/api",
    {},
    async () => new Response(JSON.stringify({ data: { status: "ok" } }), { status: 200 })
  );

  assert.deepEqual(result, { data: { status: "ok" } });
});

test("requestJson preserves meaningful API errors and HTTP status", async () => {
  await assert.rejects(
    requestJson(
      "http://service.test/api",
      {},
      async () => new Response(JSON.stringify({ error: { message: "Product not found" } }), { status: 404 })
    ),
    (error) => error instanceof ApiError && error.status === 404 && error.message === "Product not found"
  );
});

test("requestJson reports malformed JSON responses without hiding status", async () => {
  await assert.rejects(
    requestJson(
      "http://service.test/api",
      {},
      async () => new Response("not json", { status: 502 })
    ),
    (error) => error instanceof ApiError && error.status === 502
  );
});

test("requestJson distinguishes timeouts from network failures", async () => {
  await assert.rejects(
    requestJson("http://service.test/api", {}, async () => {
      const error = new Error("timeout");
      error.name = "TimeoutError";
      throw error;
    }),
    (error) => error.status === 504
  );

  await assert.rejects(
    requestJson("http://service.test/api", {}, async () => {
      throw new Error("network");
    }),
    (error) => error.status === 502
  );
});

test("service URL construction appends paths and requires server configuration", () => {
  process.env.NEST_API_URL = "http://127.0.0.1:3004/api/v1/";
  assert.equal(getServiceEndpoint("NEST_API_URL", "/products"), "http://127.0.0.1:3004/api/v1/products");
  delete process.env.NEST_API_URL;
  assert.throws(
    () => getServiceEndpoint("NEST_API_URL", "/products"),
    (error) => error instanceof ApiError && error.status === 503
  );
});

test("customer currency formatting uses INR with Indian grouping and two decimals", () => {
  assert.equal(formatPrice(1299), "₹1,299.00");
});
