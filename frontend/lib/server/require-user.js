import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError, getServiceEndpoint } from "../api/request.js";

export async function requireServerUser({ roles, permissions, nextPath }) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  if (!cookieHeader) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  let response;
  try {
    response = await fetch(getServiceEndpoint("NEST_API_URL", "/auth/me"), {
      headers: { cookie: cookieHeader },
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new ApiError("The authentication service timed out. Please try again.", 504);
    }
    throw new ApiError("The authentication service is unavailable. Please try again.", 502);
  }
  if (response.status === 401) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  if (!response.ok) {
    throw new ApiError(
      `The authentication service returned HTTP ${response.status}. Please try again.`,
      response.status >= 500 ? 502 : response.status
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("The authentication service returned an unreadable response.", 502);
  }
  const user = payload?.data;
  if (!user || (roles && !roles.includes(user.role))) {
    redirect("/access-denied");
  }
  if (
    user.role === "CUSTOMER" &&
    permissions &&
    (!Array.isArray(user.customerPermissions) ||
      permissions.some((permission) => !user.customerPermissions.includes(permission)))
  ) {
    redirect("/access-denied");
  }
  return user;
}
