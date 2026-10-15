function resolveInitialAuthState({ csrf, me }) {
  const csrfToken = csrf?.status === "fulfilled" &&
    typeof csrf.value?.csrfToken === "string"
    ? csrf.value.csrfToken
    : "";
  const user = me?.status === "fulfilled" ? (me.value ?? null) : null;

  if (me?.status === "rejected" && me.reason?.status !== 401) {
    return {
      user: null,
      csrfToken,
      status: "error",
      error: me.reason?.message || "The authentication service is unavailable."
    };
  }
  if (me?.status === "fulfilled" && !user) {
    return {
      user: null,
      csrfToken,
      status: "error",
      error: "The authentication service returned an invalid account response."
    };
  }
  if (!csrfToken) {
    return {
      user,
      csrfToken: "",
      status: "error",
      error: csrf?.reason?.message || "Account security could not initialize. Refresh and try again."
    };
  }

  return {
    user,
    csrfToken,
    status: "ready",
    error: ""
  };
}

module.exports = {
  resolveInitialAuthState
};
