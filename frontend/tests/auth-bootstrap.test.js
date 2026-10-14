const assert = require("node:assert/strict");
const { test } = require("node:test");
const { resolveInitialAuthState } = require("../lib/auth/bootstrap");

test("guest auth bootstraps successfully even when the backend is temporarily unavailable", () => {
  const result = resolveInitialAuthState({
    csrf: { status: "rejected", reason: Object.assign(new Error("offline"), { status: 503 }) },
    me: { status: "rejected", reason: Object.assign(new Error("offline"), { status: 503 }) }
  });

  assert.deepEqual(result, {
    user: null,
    csrfToken: "",
    status: "ready",
    error: ""
  });
});

test("a 401 from the current-user endpoint bootstraps as an unauthenticated visitor", () => {
  const result = resolveInitialAuthState({
    csrf: { status: "fulfilled", value: { csrfToken: "csrf-token" } },
    me: { status: "rejected", reason: Object.assign(new Error("Authentication required"), { status: 401 }) }
  });

  assert.deepEqual(result, {
    user: null,
    csrfToken: "csrf-token",
    status: "ready",
    error: ""
  });
});
