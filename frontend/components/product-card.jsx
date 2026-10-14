"use client";

import Link from "next/link";
import { ArrowUpRight, Heart, ShoppingBag } from "lucide-react";
import { formatPrice } from "../lib/catalog";
import { ProductImage } from "./product-image";
import { useStore } from "./store-provider";
import { useAuth } from "./auth-provider";
import { hasCustomerPermission } from "../lib/customer-permissions";

export function ProductCard({ product, index = 0 }) {
  const { addToBag, favorites, toggleFavorite, cartPending, cartError, favoritesPending, favoritesStatus, favoritesError } = useStore();
  const { user } = useAuth();
  const isFavorite = favorites.some((item) => item.id === product.id);
  const canViewDetails = hasCustomerPermission(user, "VIEW_PRODUCT_DETAILS");
  const canViewImages = hasCustomerPermission(user, "VIEW_PRODUCT_IMAGES");
  const canViewPricing = hasCustomerPermission(user, "VIEW_PRODUCT_PRICING");
  const canViewAvailability = hasCustomerPermission(user, "VIEW_PRODUCT_AVAILABILITY");
  const canAddFavorite = hasCustomerPermission(user, isFavorite ? "REMOVE_FROM_WISHLIST" : "ADD_TO_WISHLIST");
  const canAddToCart = hasCustomerPermission(user, "ADD_TO_CART");
  const available = product.inStock &&
    Number.isSafeInteger(product.availableQuantity) &&
    product.availableQuantity > 0;

  return (
    <article className="product-card group">
      <div className="relative aspect-[0.82] overflow-hidden bg-[#f3f1ed]">
        {canViewImages && (canViewDetails
          ? <Link href={`/products/${product.id}`} className="absolute inset-0" aria-label={`View ${product.name}`}>
              <ProductImage product={product} alt={product.name} fill sizes="(max-width: 640px) 88vw, (max-width: 1024px) 45vw, 25vw" className="object-cover transition-transform duration-700 ease-out motion-reduce:transition-none group-hover:scale-[1.04]" />
            </Link>
          : <ProductImage product={product} alt="" fill sizes="(max-width: 640px) 88vw, (max-width: 1024px) 45vw, 25vw" className="object-cover" />)}
        {hasCustomerPermission(user, "VIEW_WISHLIST") && canAddFavorite && <button
          type="button"
          disabled={favoritesPending || favoritesStatus !== "ready"}
          className={`absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 backdrop-blur transition motion-reduce:transition-none hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${isFavorite ? "text-rose-700" : "text-ink"}`}
          aria-label={isFavorite ? `Remove ${product.name} from favorites` : `Add ${product.name} to favorites`}
          aria-pressed={isFavorite}
          onClick={() => toggleFavorite(product)}
        >
          <Heart size={17} fill={isFavorite ? "currentColor" : "none"} />
        </button>}
        {canViewAvailability && !product.inStock && (
          <span className="absolute bottom-3 left-3 z-10 bg-white/90 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.16em]">
            Currently unavailable
          </span>
        )}
        {canAddToCart && available && (
          <button
            type="button"
            onClick={() => addToBag(product)}
            disabled={cartPending}
            className="absolute bottom-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink transition motion-reduce:transition-none hover:bg-ink hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-45"
            aria-label={`Add ${product.name} to your account bag`}
          >
            <ShoppingBag size={17} />
          </button>
        )}
      </div>
      {favoritesError && <p className="mt-2 text-xs text-red-700" role="alert">{favoritesError}</p>}
      {cartError && <p className="mt-2 text-xs text-red-700" role="alert">{cartError}</p>}
      <div className="flex items-start justify-between gap-3 pt-4">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-muted uppercase">{product.category}</p>
          {canViewDetails
            ? <Link href={`/products/${product.id}`} className="mt-1 inline-flex items-center gap-2 font-medium tracking-[-0.02em] hover:underline">
                {product.name}<ArrowUpRight className="shrink-0 opacity-0 transition motion-reduce:transition-none group-hover:opacity-100" size={14} />
              </Link>
            : <p className="mt-1 font-medium">{product.name}</p>}
          {canViewAvailability && <p className="mt-1 text-sm text-muted">{available ? `${product.availableQuantity} available` : "Currently unavailable"}</p>}
        </div>
        {canViewPricing && <span className="shrink-0 pt-5 text-sm font-medium">{formatPrice(product.price)}</span>}
      </div>
    </article>
  );
}
