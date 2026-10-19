const ALLOWED_IMAGE_HOSTS = Object.freeze(
  new Set(["images.unsplash.com", "res.cloudinary.com"])
);

function isAllowedImageSrc(src) {
  if (!src || typeof src !== "string") return false;
  const trimmed = src.trim();
  if (!trimmed) return false;

  // Allow relative URLs starting with '/' but not protocol-relative '//'
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    return ALLOWED_IMAGE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function getSafeProductImageUrl(product) {
  const src = typeof product?.imageUrl === "string" ? product.imageUrl.trim() : "";
  if (!src || !isAllowedImageSrc(src)) {
    return null;
  }
  return src;
}

module.exports = {
  ALLOWED_IMAGE_HOSTS,
  isAllowedImageSrc,
  getSafeProductImageUrl
};
