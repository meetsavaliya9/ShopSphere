"use client";

import { useAuth } from "./auth-provider";
import { hasCustomerPermission } from "../lib/customer-permissions";

export function CustomerFeature({ permission, children, fallback = null }) {
  const { user, status } = useAuth();
  if (status === "loading") return null;
  if (!hasCustomerPermission(user, permission)) {
    return fallback || (
      <p className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-muted" role="alert">
        This feature is not enabled for your customer account.
      </p>
    );
  }
  return children;
}
