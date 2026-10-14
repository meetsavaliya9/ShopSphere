import Link from "next/link";
import { AlertCircle, ArrowRight, RefreshCw } from "lucide-react";

export function StoreError({ message, retryHref = "/" }) {
  return (
    <div className="border border-line bg-[#fafafa] px-5 py-10 text-center" role="alert">
      <AlertCircle className="mx-auto text-muted" size={22} />
      <h2 className="mt-4 font-medium">We couldn’t reach the collection.</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{message}</p>
      <Link className="mt-6 inline-flex min-h-12 items-center justify-center gap-2.5 border border-[#d8d8d8] bg-white px-5 text-xs font-semibold text-ink transition-colors motion-reduce:transition-none hover:border-ink" href={retryHref}><RefreshCw size={15} /> Try again</Link>
    </div>
  );
}

export function EmptyLink({ href, children }) {
  return <Link href={href} className="inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4">{children}<ArrowRight size={15} /></Link>;
}
