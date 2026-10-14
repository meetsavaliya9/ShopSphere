"use client";

import { Heart } from "lucide-react";
import { useStore } from "./store-provider";
import { useAuth } from "./auth-provider";
import { hasCustomerPermission } from "../lib/customer-permissions";

export function FavoriteButton({ product }) {
  const { favorites, toggleFavorite, favoritesPending, favoritesStatus, favoritesError } = useStore();
  const { user } = useAuth();
  const isFavorite = favorites.some((item) => item.id === product.id);
  const permission = isFavorite ? "REMOVE_FROM_WISHLIST" : "ADD_TO_WISHLIST";
  if (!hasCustomerPermission(user, "VIEW_WISHLIST") || !hasCustomerPermission(user, permission)) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        disabled={favoritesPending || favoritesStatus !== "ready"}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2.5 border border-[#d8d8d8] bg-white px-5 text-xs font-semibold text-ink transition-colors motion-reduce:transition-none hover:enabled:border-ink disabled:cursor-not-allowed disabled:opacity-45"
        aria-pressed={isFavorite}
        onClick={() => toggleFavorite(product)}
      >
        <Heart size={17} fill={isFavorite ? "currentColor" : "none"} />
        {isFavorite ? "Saved to favorites" : "Save to favorites"}
      </button>
      {favoritesError && <p className="text-xs text-red-700" role="alert">{favoritesError}</p>}
    </>
  );
}
