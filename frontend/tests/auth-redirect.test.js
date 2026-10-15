const assert = require("node:assert/strict");
const { test } = require("node:test");
const { getPostLoginPath } = require("../lib/auth/redirect");

test("login defaults each verified role to its dashboard", () => {
  assert.equal(getPostLoginPath({ role: "CUSTOMER" }), "/account");
  assert.equal(getPostLoginPath({ role: "ADMIN" }), "/admin");
  assert.equal(getPostLoginPath({ role: "MANAGER" }), "/manager");
  assert.equal(getPostLoginPath({ role: "INVENTORY_MANAGER" }), "/manager");
});

test("login honors safe role-compatible destinations", () => {
  assert.equal(getPostLoginPath({ role: "CUSTOMER" }, "/orders"), "/orders");
  assert.equal(getPostLoginPath({ role: "ADMIN" }, "/admin/products"), "/admin/products");
  assert.equal(getPostLoginPath({ role: "MANAGER" }, "/manager/inventory"), "/manager/inventory");
});

test("login does not redirect to another role's protected routes or public login loops", () => {
  assert.equal(getPostLoginPath({ role: "CUSTOMER" }, "/admin"), "/account");
  assert.equal(getPostLoginPath({ role: "MANAGER" }, "/admin"), "/manager");
  assert.equal(getPostLoginPath({ role: "ADMIN" }, "/manager"), "/admin");
  assert.equal(getPostLoginPath({ role: "CUSTOMER" }, "/login?next=/admin"), "/account");
  assert.equal(getPostLoginPath({ role: "ADMIN" }, "/register"), "/admin");
});

test("login rejects unsafe and unknown destinations/roles", () => {
  assert.equal(getPostLoginPath({ role: "CUSTOMER" }, "//example.com"), "/account");
  assert.equal(getPostLoginPath({ role: "CUSTOMER" }, "/\\example.com"), "/account");
  assert.throws(() => getPostLoginPath({ role: "UNKNOWN" }), /role could not be verified/);
  assert.throws(() => getPostLoginPath(null), /account could not be verified/);
});
