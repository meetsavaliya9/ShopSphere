export function productImage(product) {
  return typeof product?.imageUrl === "string" && product.imageUrl
    ? product.imageUrl
    : null;
}

export function formatPrice(price) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(Number(price));
}
