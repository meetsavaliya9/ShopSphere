"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authRequest } from "../lib/api/auth";
import { resolveInitialAuthState } from "../lib/auth/bootstrap";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const refreshUser = useCallback(async () => {
    try {
      const result = await authRequest("auth/me");
      setUser(result);
      setStatus("ready");
      setError("");
      return result;
    } catch (requestError) {
      if (requestError?.status !== 401) throw requestError;
      setUser(null);
      setStatus("ready");
      setError("");
      return null;
    }
  }, []);

  const ensureCsrfToken = useCallback(async () => {
    if (csrfToken) return csrfToken;
    const csrf = await authRequest("auth/csrf");
    setCsrfToken(csrf.csrfToken);
    return csrf.csrfToken;
  }, [csrfToken]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const [csrf, current] = await Promise.allSettled([
          authRequest("auth/csrf"),
          authRequest("auth/me"),
        ]);
        if (!active) return;

        const state = resolveInitialAuthState({ csrf, me: current });
        setUser(state.user);
        setCsrfToken(state.csrfToken);
        setStatus(state.status);
        setError(state.error);
      } catch {
        if (active) {
          setUser(null);
          setCsrfToken("");
          setStatus("ready");
          setError("");
        }
      }
    }
    initialize();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (user?.role !== "CUSTOMER") return undefined;
    const refreshCustomerPermissions = () => {
      if (document.visibilityState === "visible") {
        refreshUser().catch((refreshError) => setError(refreshError.message));
      }
    };
    const interval = window.setInterval(refreshCustomerPermissions, 30000);
    window.addEventListener("focus", refreshCustomerPermissions);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshCustomerPermissions);
    };
  }, [refreshUser, user?.role]);

  const authenticate = useCallback(
    async (path, credentials) => {
      const token = await ensureCsrfToken();
      const result = await authRequest(`auth/${path}`, {
        method: "POST",
        body: credentials,
        csrfToken: token,
      });
      if (!result.requiresEmailVerification) {
        setUser(result.user);
        setCsrfToken(result.csrfToken);
        setStatus("ready");
        setError("");
      }
      return result;
    },
    [ensureCsrfToken],
  );

  const login = useCallback(
    async (credentials) => {
      const result = await authenticate("login", credentials);
      return result.requiresEmailVerification ? result : result.user;
    },
    [authenticate],
  );
  const register = useCallback(
    async (details) => {
      const token = await ensureCsrfToken();
      const result = await authRequest("auth/register", {
        method: "POST",
        body: details,
        csrfToken: token,
      });
      setUser(null);
      setCsrfToken(result.csrfToken);
      setStatus("ready");
      setError("");
      return result;
    },
    [ensureCsrfToken],
  );

  const verifyOtp = useCallback(
    async (challengeId, code) => {
      const token = await ensureCsrfToken();
      const result = await authRequest("auth/verify-otp", {
        method: "POST",
        body: { challengeId, code },
        csrfToken: token,
      });
      setUser(result.user);
      if (result.csrfToken) setCsrfToken(result.csrfToken);
      setStatus("ready");
      setError("");
      return result.user;
    },
    [ensureCsrfToken],
  );

  const resendOtp = useCallback(
    async (challengeId) => {
      const token = await ensureCsrfToken();
      const result = await authRequest("auth/resend-otp", {
        method: "POST",
        body: { challengeId },
        csrfToken: token,
      });
      return result.challengeId;
    },
    [ensureCsrfToken],
  );

  const logout = useCallback(async () => {
    const token = await ensureCsrfToken();
    const result = await authRequest("auth/logout", {
      method: "POST",
      csrfToken: token,
    });
    setUser(null);
    setCsrfToken(result.csrfToken);
  }, [ensureCsrfToken]);

  const changePassword = useCallback(
    async (details) => {
      const token = await ensureCsrfToken();
      const result = await authRequest("auth/me/password", {
        method: "PATCH",
        body: details,
        csrfToken: token,
      });
      setUser(null);
      setCsrfToken(result.csrfToken);
    },
    [ensureCsrfToken],
  );

  const value = useMemo(
    () => ({
      user,
      csrfToken,
      status,
      error,
      login,
      register,
      verifyOtp,
      resendOtp,
      logout,
      refreshUser,
      changePassword,
    }),
    [
      user,
      csrfToken,
      status,
      error,
      login,
      register,
      verifyOtp,
      resendOtp,
      logout,
      refreshUser,
      changePassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside AuthProvider");
  return auth;
}
