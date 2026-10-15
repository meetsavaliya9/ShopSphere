function getSafeNextPath(next) {
  if (
    typeof next !== "string" ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\")
  ) {
    return null;
  }

  const path = new URL(next, "http://localhost").pathname;
  if (["/login", "/register"].some((publicPath) =>
    path === publicPath || path.startsWith(`${publicPath}/`)
  )) {
    return null;
  }
  return { path, destination: next };
}

function getPostLoginPath(user, next) {
  if (!user || typeof user.role !== "string") {
    throw new Error("Your account could not be verified. Please sign in again.");
  }

  const safeNext = getSafeNextPath(next);
  if (user.role === "ADMIN") {
    return safeNext?.path === "/admin" || safeNext?.path.startsWith("/admin/")
      ? safeNext.destination
      : "/admin";
  }
  if (user.role === "MANAGER" || user.role === "INVENTORY_MANAGER") {
    return safeNext?.path === "/manager" || safeNext?.path.startsWith("/manager/")
      ? safeNext.destination
      : "/manager";
  }
  if (user.role === "CUSTOMER") {
    return safeNext &&
      safeNext.path !== "/admin" &&
      !safeNext.path.startsWith("/admin/") &&
      safeNext.path !== "/manager" &&
      !safeNext.path.startsWith("/manager/")
      ? safeNext.destination
      : "/account";
  }

  throw new Error("Your account role could not be verified. Please sign in again.");
}

module.exports = { getPostLoginPath };
