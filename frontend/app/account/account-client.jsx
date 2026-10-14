"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Heart,
  LockKeyhole,
  MapPin,
  Package,
  ShieldCheck,
  UserRound
} from "lucide-react";
import { authRequest } from "../../lib/api/auth";
import { useAuth } from "../../components/auth-provider";
import { hasCustomerPermission } from "../../lib/customer-permissions";

const inputClassName = "mt-2 min-h-12 w-full rounded-lg border border-line bg-white px-4 text-sm text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-ink/10 disabled:bg-[#fafafa] disabled:text-muted";

function Shortcut({ href, icon: Icon, title, description, disabled = false }) {
  const content = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f5f5f5] text-ink">
        <Icon size={19} strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted">{description}</span>
      </span>
      {!disabled && <ArrowUpRight size={16} className="shrink-0 text-muted transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />}
    </>
  );

  if (disabled) {
    return (
      <div aria-disabled="true" className="flex min-h-[104px] items-start gap-3 rounded-xl border border-line bg-[#fafafa] p-4">
        {content}
      </div>
    );
  }

  return (
    <Link href={href} className="group flex min-h-[104px] items-start gap-3 rounded-xl border border-line bg-white p-4 transition hover:border-zinc-400 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20">
      {content}
    </Link>
  );
}

export default function AccountPage() {
  const { user, status, error: authError, csrfToken, refreshUser, changePassword } = useAuth();
  const canEditProfile = hasCustomerPermission(user, "EDIT_PROFILE");
  const canChangePassword = hasCustomerPermission(user, "CHANGE_PASSWORD");
  const canViewOrders = hasCustomerPermission(user, "VIEW_ORDERS");
  const canViewWishlist = hasCustomerPermission(user, "VIEW_WISHLIST");
  const [profileName, setProfileName] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [error, setError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const profileInputRef = useRef(null);

  useEffect(() => {
    setProfileName(user?.name || "");
  }, [user?.name]);

  function focusProfileEditor() {
    document.getElementById("personal-information")?.scrollIntoView({ behavior: "smooth", block: "start" });
    profileInputRef.current?.focus({ preventScroll: true });
  }

  async function updateProfile(event) {
    event.preventDefault();
    const name = profileName.trim();
    setError("");
    setProfileMessage("");
    if (!name) {
      setError("Enter your name before saving.");
      profileInputRef.current?.focus();
      return;
    }

    setSavingProfile(true);
    try {
      await authRequest("auth/me", {
        method: "PATCH",
        body: { name },
        csrfToken
      });
      setProfileName(name);
      setProfileMessage("Your profile has been updated.");
      try {
        await refreshUser();
      } catch {
        setProfileMessage("Your profile was saved, but the account details could not be refreshed. Reload the page to see the latest details.");
      }
    } catch (requestError) {
      setError(requestError.message || "Your profile could not be saved. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function updatePassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setPasswordMessage("");
    const fields = Object.fromEntries(new FormData(form).entries());
    if (fields.newPassword.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(fields);
      form.reset();
      setPasswordMessage("Password changed. Your sessions were signed out; please sign in again.");
    } catch (requestError) {
      setError(requestError.message || "Your password could not be changed. Please try again.");
    } finally {
      setSavingPassword(false);
    }
  }

  if (status === "loading") {
    return (
      <main className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:px-10" aria-busy="true">
        <div className="h-3 w-36 animate-pulse rounded bg-zinc-200" />
        <div className="mt-5 h-10 max-w-sm animate-pulse rounded bg-zinc-200" />
        <div className="mt-8 h-36 animate-pulse rounded-2xl border border-line bg-[#fafafa]" />
        <p className="mt-4 text-sm text-muted" role="status">Loading your account…</p>
      </main>
    );
  }
  if (status === "error") {
    return (
      <main className="mx-auto max-w-3xl px-5 py-20 text-center sm:px-8">
        <h1 className="font-serif text-3xl tracking-tight">Your account is unavailable</h1>
        <p className="mt-3 text-sm text-red-700" role="alert">{authError || "The account service could not be reached."}</p>
        <button type="button" onClick={() => refreshUser().catch(() => {})} className="mt-6 min-h-11 rounded-lg bg-ink px-5 text-xs font-semibold text-white">Try again</button>
      </main>
    );
  }
  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-20 text-center sm:px-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f5f5f5]"><UserRound size={23} /></span>
        <h1 className="mt-5 font-serif text-4xl tracking-tight">Sign in to your account</h1>
        <p className="mt-3 text-sm text-muted">Your profile, orders, and saved favorites are available after signing in.</p>
        <Link className="mt-7 inline-flex min-h-11 items-center justify-center rounded-lg bg-ink px-5 text-xs font-semibold text-white transition hover:bg-zinc-800" href="/login?next=%2Faccount">Sign in</Link>
      </main>
    );
  }

  const displayName = user.name?.trim() || "Name not provided";
  const initials = user.name?.trim()
    ? user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
    : null;

  return (
    <main className="mx-auto min-h-[60vh] max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-10 lg:py-16">
      <div className="mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Your ShopSphere account</p>
        <h1 className="mt-3 font-serif text-4xl tracking-[-0.055em] sm:text-5xl">My account</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted">Your personal details and the things you love, all in one place.</p>
      </div>

      <section className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-5 shadow-[0_8px_32px_rgba(0,0,0,0.035)] sm:flex-row sm:items-center sm:justify-between sm:p-7" aria-label="Profile">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-ink text-lg font-semibold text-white" aria-label={initials ? `Avatar for ${displayName}` : "Profile avatar"}>
            {initials || <UserRound size={25} strokeWidth={1.5} />}
          </div>
          <div className="min-w-0">
            <h2 className="truncate font-serif text-2xl tracking-tight">{displayName}</h2>
            <p className="mt-1 truncate text-sm text-muted">{user.email}</p>
            {user.role && <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{user.role === "CUSTOMER" ? "Customer account" : user.role.replaceAll("_", " ")}</p>}
          </div>
        </div>
        {canEditProfile && (
          <button type="button" onClick={focusProfileEditor} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg border border-ink px-4 text-xs font-semibold transition hover:bg-ink hover:text-white sm:self-center">
            <UserRound size={15} /> Edit profile
          </button>
        )}
      </section>

      <section className="mt-10" aria-labelledby="account-shortcuts-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 id="account-shortcuts-title" className="font-serif text-2xl tracking-tight">Your shortcuts</h2>
            <p className="mt-1 text-xs text-muted">Jump back into the parts of your account you use most.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Shortcut href="/orders" icon={Package} title="My orders" description={canViewOrders ? "Review your orders and delivery updates." : "Order history is not enabled for your account."} disabled={!canViewOrders} />
          <Shortcut href="/favorites" icon={Heart} title="Wishlist" description={canViewWishlist ? "Return to the pieces you have saved." : "Wishlist access is not enabled for your account."} disabled={!canViewWishlist} />
          <Shortcut icon={MapPin} title="Saved addresses" description="Address book management is not available yet." disabled />
          <Shortcut href="#account-security" icon={ShieldCheck} title="Account security" description={canChangePassword ? "Manage your password and sign-in security." : "Password changes are not enabled for your account."} disabled={!canChangePassword} />
        </div>
      </section>

      <div className="mt-10 grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <section id="personal-information" className="scroll-mt-24 rounded-2xl border border-line bg-white p-5 sm:p-7">
          <div className="mb-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Profile</p>
            <h2 className="mt-2 font-serif text-2xl tracking-tight">Personal information</h2>
            <p className="mt-1 text-xs leading-5 text-muted">Keep your account details up to date.</p>
          </div>

          <form className="space-y-5" onSubmit={updateProfile}>
            <label className="block text-xs font-semibold text-zinc-700">
              Full name
              <input
                ref={profileInputRef}
                className={inputClassName}
                name="name"
                value={profileName}
                onChange={(event) => {
                  setProfileName(event.target.value);
                  setProfileMessage("");
                  setError("");
                }}
                required
                maxLength={100}
                autoComplete="name"
                disabled={!canEditProfile || savingProfile}
                aria-describedby="profile-name-hint"
              />
              <span id="profile-name-hint" className="mt-1.5 block text-[11px] font-normal text-muted">
                {canEditProfile ? "This name will appear on your account." : "Profile editing is not enabled for your account."}
              </span>
            </label>

            <label className="block text-xs font-semibold text-zinc-700">
              Email address
              <input className={inputClassName} value={user.email || ""} type="email" readOnly aria-readonly="true" />
              <span className="mt-1.5 block text-[11px] font-normal text-muted">Email address changes are not available here.</span>
            </label>

            <label className="block text-xs font-semibold text-zinc-700">
              Phone number
              <input className={inputClassName} value="Not available for this account" readOnly aria-readonly="true" />
              <span className="mt-1.5 block text-[11px] font-normal text-muted">A phone number is not stored in your account profile.</span>
            </label>

            {canEditProfile && (
              <button type="submit" disabled={savingProfile} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ink px-5 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-60">
                {savingProfile ? "Saving…" : "Save changes"}
              </button>
            )}
            {profileMessage && <p className="text-xs text-emerald-800" role="status">{profileMessage}</p>}
            {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          </form>
        </section>

        <section id="account-security" className="scroll-mt-24 rounded-2xl border border-line bg-white p-5 sm:p-7">
          <div className="mb-6 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f5f5f5]"><LockKeyhole size={18} /></span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Security</p>
              <h2 className="mt-1 font-serif text-2xl tracking-tight">Account security</h2>
              <p className="mt-1 text-xs leading-5 text-muted">Use a strong password to keep your account secure.</p>
            </div>
          </div>

          {canChangePassword ? (
            <form className="space-y-4" onSubmit={updatePassword}>
              <label className="block text-xs font-semibold text-zinc-700">
                Current password
                <input className={inputClassName} name="currentPassword" type="password" required autoComplete="current-password" disabled={savingPassword} />
              </label>
              <label className="block text-xs font-semibold text-zinc-700">
                New password
                <input className={inputClassName} name="newPassword" type="password" required minLength={8} autoComplete="new-password" disabled={savingPassword} />
                <span className="mt-1.5 block text-[11px] font-normal text-muted">Use at least 8 characters.</span>
              </label>
              <button type="submit" disabled={savingPassword} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink px-5 text-xs font-semibold transition hover:bg-ink hover:text-white disabled:cursor-wait disabled:opacity-60">
                {savingPassword ? "Updating…" : "Update password"}
              </button>
              {passwordMessage && <p className="text-xs leading-5 text-emerald-800" role="status">{passwordMessage}</p>}
              {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
            </form>
          ) : (
            <p className="rounded-lg bg-[#fafafa] p-4 text-xs leading-5 text-muted" role="status">Password changes are not enabled for your account.</p>
          )}
        </section>
      </div>
    </main>
  );
}
