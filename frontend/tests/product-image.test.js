const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const {
  ALLOWED_IMAGE_HOSTS,
  isAllowedImageSrc,
  getSafeProductImageUrl
} = require("../lib/image-url");

describe("Product Image Security and Host Validation", () => {
  test("ALLOWED_IMAGE_HOSTS contains exactly the configured project hosts", () => {
    assert.equal(ALLOWED_IMAGE_HOSTS.has("images.unsplash.com"), true);
    assert.equal(ALLOWED_IMAGE_HOSTS.has("res.cloudinary.com"), true);
    assert.equal(ALLOWED_IMAGE_HOSTS.has("example.com"), false);
    assert.equal(ALLOWED_IMAGE_HOSTS.size, 2);
  });

  test("allows configured Unsplash image URLs", () => {
    const urls = [
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e",
      "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&q=80",
      "http://images.unsplash.com/photo-sample"
    ];
    for (const url of urls) {
      assert.equal(isAllowedImageSrc(url), true, `Expected ${url} to be allowed`);
    }
  });

  test("allows configured Cloudinary image URLs", () => {
    const urls = [
      "https://res.cloudinary.com/mjmkjbof/image/upload/v1791894274/shopsphere/products/drk9zwtdtbohokd9br3p.jpg",
      "https://res.cloudinary.com/demo/image/upload/shopsphere/products/item.webp",
      "http://res.cloudinary.com/shopsphere/sample.png"
    ];
    for (const url of urls) {
      assert.equal(isAllowedImageSrc(url), true, `Expected ${url} to be allowed`);
    }
  });

  test("allows local relative image paths", () => {
    const paths = [
      "/images/placeholder.svg",
      "/products/sample.png",
      "/favicon.ico"
    ];
    for (const path of paths) {
      assert.equal(isAllowedImageSrc(path), true, `Expected ${path} to be allowed`);
    }
  });

  test("rejects missing, empty, or whitespace image URLs", () => {
    assert.equal(isAllowedImageSrc(""), false);
    assert.equal(isAllowedImageSrc(null), false);
    assert.equal(isAllowedImageSrc(undefined), false);
    assert.equal(isAllowedImageSrc("   "), false);
    assert.equal(isAllowedImageSrc(12345), false);
    assert.equal(isAllowedImageSrc({}), false);
  });

  test("rejects placeholder example.com URLs that trigger Next.js runtime error", () => {
    const placeholderUrls = [
      "https://example.com/images/notebook-pack.jpg",
      "https://example.com/images/wireless-mouse.jpg",
      "https://example.com/image.jpg",
      "http://example.com/product.jpg"
    ];
    for (const url of placeholderUrls) {
      assert.equal(isAllowedImageSrc(url), false, `Expected placeholder ${url} to be rejected`);
    }
  });

  test("rejects arbitrary unconfigured external hostnames", () => {
    const externalUrls = [
      "https://malicious-site.com/image.jpg",
      "https://i.imgur.com/sample.jpg",
      "https://cdn.shopify.com/products/test.png",
      "https://images.google.com/test.png"
    ];
    for (const url of externalUrls) {
      assert.equal(isAllowedImageSrc(url), false, `Expected external ${url} to be rejected`);
    }
  });

  test("rejects protocol-relative URLs", () => {
    assert.equal(isAllowedImageSrc("//example.com/image.jpg"), false);
    assert.equal(isAllowedImageSrc("//images.unsplash.com/sample.jpg"), false);
  });

  test("rejects dangerous non-http protocols", () => {
    assert.equal(isAllowedImageSrc("javascript:alert(1)"), false);
    assert.equal(isAllowedImageSrc("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA"), false);
    assert.equal(isAllowedImageSrc("ftp://images.unsplash.com/image.jpg"), false);
    assert.equal(isAllowedImageSrc("file:///C:/Users/test/image.png"), false);
  });

  test("rejects malformed URLs without throwing exceptions", () => {
    const invalidInputs = [
      "not-a-valid-url",
      "http://",
      "https://",
      "htt ps://images.unsplash.com",
      "http:///no-host"
    ];
    for (const input of invalidInputs) {
      assert.equal(isAllowedImageSrc(input), false, `Expected malformed ${input} to return false`);
    }
  });

  test("getSafeProductImageUrl extracts valid URLs and safely falls back to null", () => {
    // Valid Unsplash product
    const validUnsplash = { id: 1, name: "Bottle", imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e" };
    assert.equal(getSafeProductImageUrl(validUnsplash), "https://images.unsplash.com/photo-1505740420928-5e560c06d30e");

    // Valid Cloudinary product
    const validCloudinary = { id: 2, name: "Headphones", imageUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg" };
    assert.equal(getSafeProductImageUrl(validCloudinary), "https://res.cloudinary.com/demo/image/upload/sample.jpg");

    // Product with placeholder example.com URL returns null (safe fallback)
    const placeholderProduct = { id: 20, name: "Notebook Pack", imageUrl: "https://example.com/images/notebook-pack.jpg" };
    assert.equal(getSafeProductImageUrl(placeholderProduct), null);

    // Product without image returns null
    const noImageProduct = { id: 21, name: "Desk Organizer", imageUrl: "" };
    assert.equal(getSafeProductImageUrl(noImageProduct), null);

    const nullImageProduct = { id: 22, name: "Desk Mat", imageUrl: null };
    assert.equal(getSafeProductImageUrl(nullImageProduct), null);

    const undefinedImageProduct = { id: 23, name: "Pen" };
    assert.equal(getSafeProductImageUrl(undefinedImageProduct), null);
  });
});
