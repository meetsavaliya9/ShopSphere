import Link from "next/link";

export const metadata = { title: "Access denied" };

export default function AccessDeniedPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20 text-center">
      <p className="text-[9px] font-semibold uppercase tracking-[0.19em] text-muted">ShopSphere account</p>
      <h1 className="mt-4 font-serif text-4xl">Access denied.</h1>
      <p className="mt-4 text-sm text-muted">This account does not have permission to view that page.</p>
      <Link className="mt-7 inline-flex border border-ink bg-ink px-5 py-3 text-xs text-white" href="/account">
        Go to your account
      </Link>
    </section>
  );
}
