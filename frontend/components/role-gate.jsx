"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./auth-provider";

export function RoleGate({ roles, children }) {
  const { user, status, error } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status === "ready" && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [pathname, router, status, user]);

  if (status === "loading") {
    return <p className="mx-auto max-w-5xl px-6 py-20 text-sm text-muted">Checking your account…</p>;
  }
  if (status === "error") {
    return <p className="mx-auto max-w-5xl px-6 py-20 text-sm text-red-700" role="alert">{error}</p>;
  }
  if (!user) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="font-serif text-4xl">Sign in required</h1>
        <p className="mt-4 text-sm text-muted">Taking you to sign in…</p>
        <Link className="mt-7 inline-flex border border-ink bg-ink px-5 py-3 text-xs text-white" href="/login">
          Sign in
        </Link>
      </section>
    );
  }
  if (!roles.includes(user.role)) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-20 text-center" role="alert">
        <h1 className="font-serif text-4xl">Access denied</h1>
        <p className="mt-4 text-sm text-muted">Your account does not have permission to view this page.</p>
        <Link className="mt-7 inline-flex border border-line px-5 py-3 text-xs" href="/account">
          Go to your account
        </Link>
      </section>
    );
  }
  return children;
}
