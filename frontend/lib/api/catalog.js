import "server-only";

import request from "./request";

const { getServiceEndpoint, requestJson } = request;

export function productQuery(filters = {}) {
  const search = new URLSearchParams();
  for (const key of ["search", "category", "minPrice", "maxPrice", "sortBy", "order", "page", "limit"]) {
    if (filters[key] !== undefined && filters[key] !== "") {
      search.set(key, String(filters[key]));
    }
  }
  return search.toString();
}

export async function listProducts(filters = {}) {
  const query = productQuery(filters);
  const endpoint = getServiceEndpoint("NEST_API_URL", `/products${query ? `?${query}` : ""}`);
  return requestJson(endpoint);
}

export async function getProduct(id) {
  const endpoint = getServiceEndpoint("NEST_API_URL", `/products/${encodeURIComponent(id)}`);
  return requestJson(endpoint);
}
