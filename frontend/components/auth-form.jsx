"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";

export function AuthForm({ register = false }) {
  const { login, register: createAccount, verifyOtp, resendOtp, status } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  const [isAdminPortal, setIsAdminPortal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [verification, setVerification] = useState(null);
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRegistered(params.get("registered") === "1");
    const next = params.get("next");
    setIsAdminPortal(Boolean(next && next.startsWith("/admin")));
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setResendCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  function redirectFor(user) {
    const next = new URLSearchParams(window.location.search).get("next");
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    if (user.role === "INVENTORY_MANAGER") {
      router.replace(safeNext?.startsWith("/manager") ? safeNext : "/manager");
      return;
    }
    if (user.role === "ADMIN") {
      router.replace(safeNext?.startsWith("/admin") ? safeNext : "/admin");
      return;
    }
    if (user.role === "MANAGER") {
      router.replace(safeNext?.startsWith("/manager") ? safeNext : "/manager");
      return;
    }
    router.replace(safeNext && !safeNext.startsWith("/admin") && !safeNext.startsWith("/manager")
      ? safeNext
      : "/account");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const details = Object.fromEntries(form.entries());
    try {
      if (register) {
        if (Array.from(details.password).length < 8 || new TextEncoder().encode(details.password).length > 1024) {
          throw new Error("Password must be at least 8 characters and no more than 1024 UTF-8 bytes.");
        }
        const result = await createAccount(details);
        if (result.challengeId) {
          setOtpCode("");
          setVerification({ challengeId: result.challengeId, email: details.email, purpose: "registration" });
          setResendCooldown(60);
          setRegistered(false);
        } else {
          setRegistered(true);
          setError("If this email can be registered, you’ll receive verification instructions. If you already have an account, sign in instead.");
        }
        return;
      }
      const result = await login(details);
      if (result?.requiresEmailVerification) {
        setOtpCode("");
        setVerification({ challengeId: result.challengeId, email: details.email, purpose: "login" });
        setResendCooldown(60);
      } else {
        redirectFor(result);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPending(false);
    }
  }

  async function handleVerify(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const user = await verifyOtp(verification.challengeId, otpCode);
      setVerification(null);
      setOtpCode("");
      redirectFor(user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPending(false);
    }
  }

  async function handleResend() {
    setPending(true);
    setError("");
    setOtpCode("");
    try {
      const challengeId = await resendOtp(verification.challengeId);
      setVerification((current) => ({ ...current, challengeId }));
      setResendCooldown(60);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mx-auto max-w-[540px] px-6 py-16 sm:py-24">
      {isAdminPortal && !register ? (
        <div className="flex items-center gap-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.19em] text-muted">ShopSphere</p>
          <span className="rounded bg-zinc-900 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
            Admin Portal
          </span>
        </div>
      ) : (
        <p className="text-[9px] font-semibold uppercase tracking-[0.19em] text-muted">Shopsphere account</p>
      )}
      <h1 className="mt-4 font-serif text-5xl font-normal tracking-[-0.06em]">
        {register
          ? "Create your account."
          : isAdminPortal
            ? "Administrator Sign in."
            : "Welcome back."}
      </h1>
      <p className="mt-4 text-sm leading-7 text-muted">
        {register
          ? "New accounts begin with customer access."
          : isAdminPortal
            ? "Sign in to access the ShopSphere management dashboard. Direct password verification without OTP."
            : "Sign in to continue to your account."}
      </p>
      {!register && registered && (
        <p className="mt-5 border border-line bg-surface p-4 text-xs leading-6" role="status">
          If an account is eligible, verification instructions have been sent. Check your email or sign in.
        </p>
      )}
      {verification ? (
        <form className="mt-9 space-y-5" onSubmit={handleVerify}>
          <div className="border border-line bg-surface p-4 text-xs leading-6" role="status">
            Enter the 6-digit code sent to <span className="font-medium">{verification.email}</span>. It expires in 10 minutes.
          </div>
          <label className="block text-xs font-medium">
            Email verification code
            <input className="mt-2 min-h-12 w-full border border-line px-4 text-sm tracking-[0.3em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" name="code" type="text" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="one-time-code" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} required />
          </label>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <button disabled={pending} className="min-h-12 w-full bg-ink px-5 text-xs font-semibold text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50">
            {pending ? "Please wait…" : "Verify email"}
          </button>
          <button type="button" disabled={pending || resendCooldown > 0} onClick={handleResend} className="min-h-11 w-full border border-line px-4 text-xs disabled:cursor-not-allowed disabled:text-muted">
            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
          </button>
          <button type="button" onClick={() => { setVerification(null); setOtpCode(""); setError(""); }} className="w-full py-2 text-xs text-muted underline underline-offset-4">
            Back to sign in
          </button>
        </form>
      ) : (
      <form className="mt-9 space-y-5" onSubmit={handleSubmit}>
        {register && (
          <label className="block text-xs font-medium">
            Name
            <input className="mt-2 min-h-12 w-full border border-line px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" name="name" required maxLength={100} autoComplete="name" />
          </label>
        )}
        <label className="block text-xs font-medium">
          Email
          <input className="mt-2 min-h-12 w-full border border-line px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" name="email" type="email" required maxLength={254} autoComplete="email" defaultValue={isAdminPortal ? "admin@gmail.com" : ""} />
        </label>
        <label className="block text-xs font-medium">
          Password
          <span className="mt-2 flex min-h-12 border border-line focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
            <input className="w-full px-4 text-sm outline-none" name="password" type={showPassword ? "text" : "password"} required minLength={register ? 8 : undefined} autoComplete={register ? "new-password" : "current-password"} />
            <button type="button" className="shrink-0 px-4 text-[11px] underline underline-offset-4" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
          {register && <span className="mt-2 block text-[11px] text-muted">Use at least 8 characters. Longer passphrases are accepted up to the secure server limit.</span>}
        </label>
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        {status === "error" && <p className="text-sm text-red-700" role="alert">Account security could not initialize. Refresh and try again.</p>}
        <button disabled={pending || status !== "ready"} className="min-h-12 w-full bg-ink px-5 text-xs font-semibold text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "Please wait…" : register ? "Create account" : isAdminPortal ? "Sign in to Dashboard" : "Sign in"}
        </button>
      </form>
      )}
      <p className="mt-7 text-center text-xs text-muted">
        {register ? "Already have an account? " : "New to ShopSphere? "}
        <Link className="font-semibold text-ink underline underline-offset-4" href={register ? "/login" : "/register"}>
          {register ? "Sign in" : "Create an account"}
        </Link>
      </p>
      {!register && !isAdminPortal && (
        <div className="mt-6 border-t border-line pt-4 text-center">
          <Link
            href="/login?next=/admin"
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors"
          >
            <span>Are you a store administrator? Sign in to Admin Portal →</span>
          </Link>
        </div>
      )}
      {!register && isAdminPortal && (
        <div className="mt-6 border-t border-line pt-4 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors"
          >
            <span>← Back to Customer Sign in</span>
          </Link>
        </div>
      )}
      {!register && <p className="mt-3 text-center text-[11px] text-muted">Customers verify sign-in by email. Admins and managers use this same form without OTP.</p>}
    </section>
  );
}
