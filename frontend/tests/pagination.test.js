const assert = require("node:assert/strict");
const { test } = require("node:test");
const { getPaginationItems, getPaginationRange } = require("../lib/pagination");

test("getPaginationRange calculates correct range for first page of products", () => {
  const result = getPaginationRange(1, 12, 120);
  assert.equal(result.page, 1);
  assert.equal(result.limit, 12);
  assert.equal(result.total, 120);
  assert.equal(result.totalPages, 10);
  assert.equal(result.startItem, 1);
  assert.equal(result.endItem, 12);
  assert.equal(result.isFirstPage, true);
  assert.equal(result.isLastPage, false);
});

test("getPaginationRange calculates correct range for middle page", () => {
  const result = getPaginationRange(2, 12, 25);
  assert.equal(result.page, 2);
  assert.equal(result.limit, 12);
  assert.equal(result.total, 25);
  assert.equal(result.totalPages, 3);
  assert.equal(result.startItem, 13);
  assert.equal(result.endItem, 24);
  assert.equal(result.isFirstPage, false);
  assert.equal(result.isLastPage, false);
});

test("getPaginationRange calculates correct range for last page with remainder", () => {
  const result = getPaginationRange(3, 12, 25);
  assert.equal(result.page, 3);
  assert.equal(result.limit, 12);
  assert.equal(result.total, 25);
  assert.equal(result.totalPages, 3);
  assert.equal(result.startItem, 25);
  assert.equal(result.endItem, 25);
  assert.equal(result.isFirstPage, false);
  assert.equal(result.isLastPage, true);
});

test("getPaginationRange handles zero products safely", () => {
  const result = getPaginationRange(1, 12, 0);
  assert.equal(result.page, 1);
  assert.equal(result.total, 0);
  assert.equal(result.totalPages, 1);
  assert.equal(result.startItem, 0);
  assert.equal(result.endItem, 0);
  assert.equal(result.isFirstPage, true);
  assert.equal(result.isLastPage, true);
});

test("getPaginationItems returns single page when totalPages <= 1", () => {
  assert.deepEqual(getPaginationItems(1, 1), [1]);
  assert.deepEqual(getPaginationItems(1, 0), [1]);
});

test("getPaginationItems returns all pages when totalPages <= 7", () => {
  assert.deepEqual(getPaginationItems(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(getPaginationItems(3, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("getPaginationItems displays Flipkart-style start ellipsis when near beginning", () => {
  // Page 1 of 10 -> [1, 2, 3, 4, 5, '...', 10]
  assert.deepEqual(getPaginationItems(1, 10), [1, 2, 3, 4, 5, "...", 10]);
  assert.deepEqual(getPaginationItems(4, 10), [1, 2, 3, 4, 5, "...", 10]);
});

test("getPaginationItems displays Flipkart-style middle ellipsis when in the middle", () => {
  // Page 5 of 10 -> [1, '...', 4, 5, 6, '...', 10]
  assert.deepEqual(getPaginationItems(5, 10), [1, "...", 4, 5, 6, "...", 10]);
  // Page 6 of 10 -> [1, '...', 5, 6, 7, '...', 10]
  assert.deepEqual(getPaginationItems(6, 10), [1, "...", 5, 6, 7, "...", 10]);
});

test("getPaginationItems displays Flipkart-style end ellipsis when near the end", () => {
  // Page 7 of 10 -> [1, '...', 6, 7, 8, 9, 10]
  assert.deepEqual(getPaginationItems(7, 10), [1, "...", 6, 7, 8, 9, 10]);
  // Page 10 of 10 -> [1, '...', 6, 7, 8, 9, 10]
  assert.deepEqual(getPaginationItems(10, 10), [1, "...", 6, 7, 8, 9, 10]);
});
