"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { useStore } from "./store-provider";

export function SiteChrome({ children }) {
  const pathname = usePathname();
  const {
    storefrontSettings,
    storefrontSettingsStatus,
    storefrontSettingsError,
    loadStorefrontSettings
  } = useStore();
  const isManagerRoute = pathname === "/manager" || pathname.startsWith("/manager/");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const showStoreControls = !isManagerRoute && !isAdminRoute && storefrontSettingsStatus === "ready";

  return (
    <>
      {!isManagerRoute && !isAdminRoute && storefrontSettingsStatus === "error" && (
        <aside className="flex flex-wrap items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-xs text-amber-950" role="alert">
          <span>{storefrontSettingsError}</span>
          <button type="button" onClick={loadStorefrontSettings} className="font-semibold underline">Retry</button>
        </aside>
      )}
      {showStoreControls && (storefrontSettings.announcement || !storefrontSettings.allowCheckout) && (
        <aside className="border-b border-zinc-200 bg-zinc-950 px-4 py-2.5 text-center text-xs text-white" aria-label="Store announcement">
          {storefrontSettings.announcement && <p>{storefrontSettings.announcement}</p>}
          {!storefrontSettings.allowCheckout && <p className={storefrontSettings.announcement ? "mt-1 text-white/70" : ""}>Checkout is temporarily unavailable.</p>}
        </aside>
      )}
      {!isManagerRoute && <SiteHeader />}
      <main className={isManagerRoute ? undefined : "min-h-[60vh]"}>
        {children}
      </main>
      {!isManagerRoute && <SiteFooter />}
    </>
  );
}
