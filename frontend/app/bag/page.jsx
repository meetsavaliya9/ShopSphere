"use client";

import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { formatPrice } from "../../lib/catalog";
import { useStore } from "../../components/store-provider";
import { useAuth } from "../../components/auth-provider";
import { ProductImage } from "../../components/product-image";
import { hasCustomerPermission } from "../../lib/customer-permissions";

export default function BagPage() {
  const { bag, bagTotal, cartStatus, cartError, cartPending, loadCart, removeFromBag, updateQuantity } = useStore();
  const { user } = useAuth();
  const canViewCart = hasCustomerPermission(user, "VIEW_CART");
  const canUpdateQuantity = hasCustomerPermission(user, "UPDATE_CART_QUANTITY");
  const canRemoveItems = hasCustomerPermission(user, "REMOVE_CART_ITEMS");
  const canCheckout = hasCustomerPermission(user, "ACCESS_CHECKOUT");

  return (
    <div className="mx-auto min-h-[55vh] max-w-[1100px] px-6 py-14 sm:px-10 lg:py-20">
      <p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-muted uppercase">Your account bag</p>
      <h1 className="mt-4 font-serif text-[clamp(2rem,4.4vw,3.8rem)] font-normal leading-none tracking-[-0.065em]">Your bag.</h1>
      <p className="mt-4 text-sm leading-6 text-muted">Your bag is saved to your customer account. Delivery and payment are confirmed securely at checkout.</p>
      {!canViewCart && user?.role === "CUSTOMER" ? (
        <div className="mt-10 border border-line bg-[#fafafa] px-5 py-10 text-center">
          <p className="font-medium">Cart access is unavailable</p>
          <p className="mt-2 text-sm text-muted" role="alert">Viewing the cart is not enabled for your customer account.</p>
        </div>
      ) : <>
      {cartError && cartStatus !== "error" && <p className="mt-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{cartError}</p>}
      {cartStatus === "loading" ? (
        <p className="mt-10 border border-line bg-[#fafafa] px-5 py-10 text-center text-sm text-muted" role="status">Loading your saved bag…</p>
      ) : cartStatus === "error" ? (
        <div className="mt-10 border border-line bg-[#fafafa] px-5 py-10 text-center" role="alert">
          <p className="font-medium">We could not load your bag.</p>
          <p className="mt-2 text-sm text-muted">{cartError}</p>
          <button className="mt-5 min-h-11 border border-ink px-5 text-xs font-semibold" onClick={loadCart} type="button">Try again</button>
        </div>
      ) : !user || user.role !== "CUSTOMER" ? (
        <div className="mt-10 border border-line bg-[#fafafa] px-5 py-10 text-center">
          <ShoppingBag className="mx-auto text-muted" size={25} />
          <p className="mt-4 font-medium">Sign in to use your saved bag.</p>
          <p className="mt-2 text-sm text-muted">Guest bag storage and automatic cart merging are not enabled.</p>
          <Link className="mt-6 inline-flex min-h-12 items-center justify-center border border-ink bg-ink px-5 text-xs font-semibold text-white" href="/login?next=%2Fbag">Sign in</Link>
        </div>
      ) : bag.length === 0 ? (
        <div className="mt-10 border border-line bg-[#fafafa] px-5 py-10 text-center">
          <ShoppingBag className="mx-auto text-muted" size={25} />
          <p className="mt-4 font-medium">Your bag is taking a breather.</p>
          <p className="mt-2 text-sm text-muted">Find something useful, beautiful, or both.</p>
          <Link className="mt-6 inline-flex min-h-12 items-center justify-center gap-2.5 border border-ink bg-ink px-5 text-xs font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-[#393939]" href="/products">Explore the collection</Link>
        </div>
      ) : (
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="divide-y divide-line border-y border-line">
            {bag.map((item, index) => (
              <article key={item.id} className="grid grid-cols-[100px_1fr] gap-5 py-5 sm:grid-cols-[130px_1fr_auto]">
                <Link href={`/products/${item.id}`} className="relative aspect-square overflow-hidden bg-surface">
                  <ProductImage product={item} alt={item.name} fill sizes="130px" className="object-cover" />
                </Link>
                <div className="flex flex-col items-start py-1">
                  <p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-muted uppercase">{item.category}</p>
                  <Link href={`/products/${item.id}`} className="mt-2 font-medium">{item.name}</Link>
                  <p className="mt-2 text-sm text-muted">{formatPrice(item.unitPrice)}</p>
                  {!item.available && (
                    <p className="mt-2 text-xs text-red-700" role="status">
                      {Number.isSafeInteger(item.availableQuantity)
                        ? `${item.availableQuantity} currently available; reduce the quantity or remove this item.`
                        : "Available stock is not configured; remove this item to continue."}
                    </p>
                  )}
                  {canUpdateQuantity && <div className="mt-auto flex items-center border border-line">
                  <button type="button" disabled={cartPending || item.quantity <= 1} className="grid h-9 w-9 place-items-center disabled:opacity-40" aria-label={`Decrease ${item.name} quantity`} onClick={() => updateQuantity(item.id, item.quantity - 1)}><Minus size={14} /></button>
                  <span className="min-w-8 text-center text-xs">{item.quantity}</span>
                  <button type="button" disabled={cartPending || !item.available || item.quantity >= 99 || item.quantity >= item.availableQuantity} className="grid h-9 w-9 place-items-center disabled:opacity-40" aria-label={`Increase ${item.name} quantity`} onClick={() => updateQuantity(item.id, item.quantity + 1)}><Plus size={14} /></button>
                  </div>}
                </div>
                {canRemoveItems && <button type="button" disabled={cartPending} className="col-start-2 inline-flex items-center gap-2 text-xs text-muted hover:text-ink disabled:opacity-40 sm:col-start-auto sm:self-start" onClick={() => removeFromBag(item.id)}><Trash2 size={14} /> Remove</button>}
              </article>
            ))}
          </div>
          <aside className="h-fit border border-line p-6">
            <p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-muted uppercase">A little summary</p>
            <div className="mt-5 flex justify-between text-sm"><span>Items subtotal</span><span>{formatPrice(bagTotal)}</span></div>
            <p className="mt-4 border-t border-line pt-4 text-xs leading-6 text-muted">The final amount is recalculated from current database prices before payment. Delivery charges are not currently configured.</p>
            {canCheckout && <Link className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2.5 border border-ink bg-ink px-5 text-xs font-semibold text-white transition-colors hover:bg-[#393939]" href="/checkout">Continue to checkout</Link>}
          </aside>
        </div>
      )}
      </>}
    </div>
  );
}
