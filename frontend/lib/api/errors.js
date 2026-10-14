import request from "./request";

const { ApiError } = request;

export function apiErrorResponse(error) {
  const status = error instanceof ApiError ? error.status : 502;
  const message =
    error instanceof ApiError
      ? error.message
      : "The product service is unavailable. Please try again shortly.";
  return Response.json({ error: { message } }, { status });
}
