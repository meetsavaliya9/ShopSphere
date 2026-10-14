import "server-only";

import request from "./request";

const { getServiceEndpoint, requestJson } = request;

export async function getNestHealth() {
  const endpoint = getServiceEndpoint("NEST_API_URL", "/health");
  return requestJson(endpoint);
}
