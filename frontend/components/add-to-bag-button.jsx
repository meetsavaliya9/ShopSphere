"use client";

import { useState } from "react";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { useStore } from "./store-provider";
import { useAuth } from "./auth-provider";
import { hasCustomerPermission } from "../lib/customer-permissions";

export function AddToBagButton({ product }) {
  const { addToBag, cartPending, cartError } = useStore();
  const { user } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const availableQuantity = Number.isSafeInteger(product.availableQuantity)
    ? Math.min(99, product.availableQuantity)
    : 0;
  const available = product.inStock && availableQuantity > 0;
  if (!hasCustomerPermission(user, "ADD_TO_CART")) return null;
  return (
    <>
      <div className="inline-flex w-fit items-center border border-line" aria-label="Product quantity">
        <button type="button" className="grid h-11 w-11 place-items-center disabled:opacity-40" aria-label="Decrease quantity" disabled={quantity <= 1 || cartPending} onClick={() => setQuantity((current) => Math.max(1, current - 1))}><Minus size={15} /></button>
        <span className="min-w-10 text-center text-sm" aria-live="polite">{quantity}</span>
        <button type="button" className="grid h-11 w-11 place-items-center disabled:opacity-40" aria-label="Increase quantity" disabled={quantity >= availableQuantity || cartPending} onClick={() => setQuantity((current) => Math.min(availableQuantity, current + 1))}><Plus size={15} /></button>
      </div>
      <p className="text-xs text-muted" role="status">
        {available ? `${product.availableQuantity} unit${product.availableQuantity === 1 ? "" : "s"} available` : "Stock count unavailable"}
      </p>
      {cartError && <p className="text-xs text-red-700" role="alert">{cartError}</p>}
      <button
        type="button"
        className="inline-flex min-h-12 w-full items-center justify-center gap-2.5 border border-ink bg-ink px-5 text-xs font-semibold text-white transition-colors motion-reduce:transition-none hover:enabled:bg-[#393939] disabled:cursor-not-allowed disabled:opacity-45"
        disabled={!available || quantity > availableQuantity || cartPending}
        onClick={() => addToBag(product, quantity)}
      >
        <ShoppingBag size={17} />
        {available ? "Add to bag" : "Currently unavailable"}
      </button>
    </>
  );
}
