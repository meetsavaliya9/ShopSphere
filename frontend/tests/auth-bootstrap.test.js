const assert = require("node:assert/strict");
const { test } = require("node:test");
const { resolveInitialAuthState } = require("../lib/auth/bootstrap");

test("a backend failure leaves authentication unresolved instead of treating it as a guest session", () => {
  const result = resolveInitialAuthState({
    csrf: { status: "fulfilled", value: { csrfToken: "csrf-token" } },
    me: { status: "rejected", reason: Object.assign(new Error("offline"), { status: 503 }) }
  });

  assert.deepEqual(result, {
    user: null,
    csrfToken: "csrf-token",
    status: "error",
    error: "offline"
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

test("a valid current-user response and CSRF token initialize an authenticated session", () => {
  const user = { id: 7, role: "CUSTOMER" };
  const result = resolveInitialAuthState({
    csrf: { status: "fulfilled", value: { csrfToken: "csrf-token" } },
    me: { status: "fulfilled", value: user }
  });

  assert.deepEqual(result, {
    user,
    csrfToken: "csrf-token",
    status: "ready",
    error: ""
  });
});

test("a CSRF failure does not mark auth initialization ready", () => {
  const result = resolveInitialAuthState({
    csrf: { status: "rejected", reason: Object.assign(new Error("CSRF unavailable"), { status: 503 }) },
    me: { status: "rejected", reason: Object.assign(new Error("Authentication required"), { status: 401 }) }
  });

  assert.deepEqual(result, {
    user: null,
    csrfToken: "",
    status: "error",
    error: "CSRF unavailable"
  });
});

test("an empty successful current-user response is not treated as unauthenticated success", () => {
  const result = resolveInitialAuthState({
    csrf: { status: "fulfilled", value: { csrfToken: "csrf-token" } },
    me: { status: "fulfilled", value: null }
  });

  assert.equal(result.status, "error");
  assert.equal(result.user, null);
});
