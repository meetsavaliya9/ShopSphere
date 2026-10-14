"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { ProductCard } from "../../components/product-card";
import { useStore } from "../../components/store-provider";
import { useAuth } from "../../components/auth-provider";
import { hasCustomerPermission } from "../../lib/customer-permissions";

export default function FavoritesPage() {
  const { favorites, favoritesStatus, favoritesError, loadFavorites } = useStore();
  const { user } = useAuth();

  if (!hasCustomerPermission(user, "VIEW_WISHLIST")) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="font-serif text-3xl">Wishlist unavailable</h1>
        <p className="mt-3 text-sm text-muted" role="alert">Wishlist access is not enabled for your customer account.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-[55vh] max-w-[1440px] px-6 py-14 sm:px-10 lg:px-16 lg:py-20">
      <p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-muted uppercase">Kept close</p>
      <h1 className="mt-4 font-serif text-[clamp(2rem,4.4vw,3.8rem)] font-normal leading-none tracking-[-0.065em]">Your favorites.</h1>
      <p className="mt-4 text-sm text-muted">Save pieces you love to your customer account. Guests can keep a browser-only list.</p>
      {favoritesError && favoritesStatus === "ready" && <p className="mt-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{favoritesError}</p>}
      {favoritesStatus === "loading" ? (
        <p className="mt-10 border border-line bg-[#fafafa] px-5 py-10 text-center text-sm text-muted" role="status">Loading your favorites…</p>
      ) : favoritesStatus === "error" ? (
        <div className="mt-10 border border-line bg-[#fafafa] px-5 py-10 text-center" role="alert">
          <p className="font-medium">We could not load your favorites.</p>
          <p className="mt-2 text-sm text-muted">{favoritesError}</p>
          <button className="mt-5 min-h-11 border border-ink px-5 text-xs font-semibold" onClick={loadFavorites} type="button">Try again</button>
        </div>
      ) : favorites.length === 0 ? (
        <div className="mt-10 border border-line bg-[#fafafa] px-5 py-10 text-center">
          <Heart className="mx-auto text-muted" size={24} />
          <p className="mt-4 font-medium">Nothing tucked away yet.</p>
          <p className="mt-2 text-sm text-muted">Tap the heart on a piece you’d like to remember.</p>
          <Link className="mt-6 inline-flex min-h-12 items-center justify-center gap-2.5 border border-ink bg-ink px-5 text-xs font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-[#393939]" href="/products">Discover the collection</Link>
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {favorites.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
        </div>
      )}
    </div>
  );
}
