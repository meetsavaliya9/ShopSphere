"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { useStore } from "./store-provider";

export function SiteFooter() {
  const pathname = usePathname();
  const { storefrontSettings, storefrontSettingsStatus } = useStore();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  return (
    <footer className="mt-24 bg-ink text-white">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-6 py-16 sm:px-10 md:grid-cols-[1.4fr_1fr_1fr] lg:px-16 lg:py-20">
        <div>
          <Link href="/" className="inline-flex items-baseline whitespace-nowrap font-serif text-[19px] font-bold tracking-[-0.08em] text-white">SHOP<span className="font-normal">SPHERE</span><span className="text-[#8b735b]">.</span></Link>
          {storefrontSettingsStatus === "ready" && storefrontSettings.storeName && <p className="mt-2 text-xs text-white/60">{storefrontSettings.storeName}</p>}
          <p className="mt-5 max-w-sm text-sm leading-7 text-white/60">
            A considered collection of everyday objects, chosen for the way they feel, work and last.
          </p>
          {storefrontSettingsStatus === "ready" && (
            <address className="mt-4 space-y-1 text-xs not-italic leading-5 text-white/60">
              {storefrontSettings.storeAddress && <p>{storefrontSettings.storeAddress}</p>}
              {storefrontSettings.storeEmail && <p><a href={`mailto:${storefrontSettings.storeEmail}`} className="hover:text-white">{storefrontSettings.storeEmail}</a></p>}
              {storefrontSettings.storePhone && <p><a href={`tel:${storefrontSettings.storePhone}`} className="hover:text-white">{storefrontSettings.storePhone}</a></p>}
            </address>
          )}
        </div>
        <div>
          <p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-white/40 uppercase">Explore</p>
          <div className="mt-5 flex flex-col gap-3 text-sm text-white/75">
            <Link className="w-fit text-white/75 transition-colors motion-reduce:transition-none hover:text-white" href="/products">Shop all</Link>
            <Link className="w-fit text-white/75 transition-colors motion-reduce:transition-none hover:text-white" href="/favorites">Favorites</Link>
            <Link className="w-fit text-white/75 transition-colors motion-reduce:transition-none hover:text-white" href="/bag">Your bag</Link>
            <Link className="w-fit text-white/75 transition-colors motion-reduce:transition-none hover:text-white" href="/orders">My orders</Link>
          </div>
        </div>
        <div>
          <p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-white/40 uppercase">The fine print</p>
          <p className="mt-5 max-w-xs text-sm leading-7 text-white/60">
            Accounts, customer bags, favorites, orders and payment verification use the ShopSphere NestJS API. Razorpay securely processes checkout.
          </p>
          <Link href="/services" className="mt-5 inline-flex items-center gap-2 text-sm text-white hover:text-white/70">
            Service status <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="border-t border-white/10 px-6 py-5 text-center text-[11px] uppercase tracking-[0.16em] text-white/40">
        © {new Date().getFullYear()} ShopSphere · Thoughtfully considered
      </div>
    </footer>
  );
}
