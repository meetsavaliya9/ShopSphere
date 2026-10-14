function resolveInitialAuthState({ csrf, me }) {
  const csrfToken = csrf?.status === "fulfilled" ? (csrf.value?.csrfToken || "") : "";
  const user = me?.status === "fulfilled" ? (me.value ?? null) : null;

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
