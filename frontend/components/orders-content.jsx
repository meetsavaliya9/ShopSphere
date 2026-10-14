"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, ChevronDown, Clock3, PackageCheck, Search, ShoppingBag, Truck } from "lucide-react";
import { useAuth } from "./auth-provider";
import { useStore } from "./store-provider";
import { authRequest } from "../lib/api/auth";
import { formatPrice } from "../lib/catalog";
import { hasCustomerPermission } from "../lib/customer-permissions";

const FILTERS = [
  { label: "All", value: "ALL" },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Cancelled", value: "CANCELLED" }
];

function statusLabel(status) {
  return {
    PAYMENT_PENDING: "Payment pending",
    PAID: "Processing",
    PAYMENT_FAILED: "Payment failed",
    CANCELLED: "Cancelled",
    SHIPPED: "Shipped",
    DELIVERED: "Delivered"
  }[status] || status?.replaceAll("_", " ") || "Status unavailable";
}

function paymentStatusLabel(status) {
  return {
    CAPTURED: "Payment received",
    PENDING: "Payment pending",
    FAILED: "Payment failed"
  }[status] || status || "Not recorded";
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function OrdersContent({ orderId }) {
  const { csrfToken, user } = useAuth();
  const { loadCart } = useStore();
  const [orders, setOrders] = useState([]);
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expandedOrders, setExpandedOrders] = useState({});
  const [retryCount, setRetryCount] = useState(0);
  const [cancellingId, setCancellingId] = useState(null);
  const [cancellationMessage, setCancellationMessage] = useState("");
  const [cancellationError, setCancellationError] = useState("");
  const [buyingAgainId, setBuyingAgainId] = useState(null);
  const [buyAgainMessage, setBuyAgainMessage] = useState("");
  const [buyAgainError, setBuyAgainError] = useState("");

  function canCancelOrder(entry) {
    return hasCustomerPermission(user, "CANCEL_ORDERS") &&
      entry.status === "PAYMENT_PENDING" &&
      entry.payment?.status === "PENDING" &&
      !entry.payment.razorpayOrderId &&
      !entry.payment.razorpayPaymentId;
  }

  async function cancelOrder(entry) {
    if (!window.confirm(`Cancel order #${entry.id}? This cannot be undone.`)) return;
    setCancellingId(String(entry.id));
    setCancellationMessage("");
    setCancellationError("");
    try {
      const cancelled = await authRequest(`orders/${encodeURIComponent(entry.id)}/cancel`, {
        method: "POST",
        csrfToken
      });
      if (orderId) setOrder(cancelled);
      else setOrders((current) => current.map((item) => item.id === cancelled.id ? cancelled : item));
      setCancellationMessage(`Order #${cancelled.id} was cancelled.`);
    } catch (cancelError) {
      setCancellationError(cancelError.message);
    } finally {
      setCancellingId(null);
    }
  }

  async function buyAgain(entry) {
    if (!hasCustomerPermission(user, "BUY_AGAIN")) {
      setBuyAgainError("Buying these items again is not enabled for your account.");
      return;
    }
    setBuyingAgainId(String(entry.id));
    setBuyAgainMessage("");
    setBuyAgainError("");
    const added = [];
    const unavailable = [];
    try {
      for (const item of entry.items) {
        if (!item.productId) {
          unavailable.push(item.productName);
          continue;
        }
        try {
          await authRequest("cart/items", {
            method: "POST",
            body: { productId: item.productId, quantity: item.quantity },
            csrfToken
          });
          added.push(item.productName);
        } catch (itemError) {
          unavailable.push(`${item.productName}: ${itemError.message}`);
        }
      }
      if (added.length) await loadCart();
      if (added.length) {
        setBuyAgainMessage(
          unavailable.length
            ? `Added ${added.length} item${added.length === 1 ? "" : "s"} to your cart. Not added: ${unavailable.join("; ")}`
            : `Order items added to your cart (${added.length}).`
        );
      } else {
        setBuyAgainError(`No items were added. ${unavailable.join("; ") || "The products may be unavailable."}`);
      }
    } catch (buyError) {
      setBuyAgainError(buyError.message || "The cart could not be refreshed. Please try again.");
    } finally {
      setBuyingAgainId(null);
    }
  }

  function printInvoice() {
    window.print();
  }

  const normalizedSearch = search.trim().replace(/^#/, "").toLowerCase();
  const filteredOrders = orders.filter((entry) => {
    const matchesFilter = filter === "ALL"
      || (filter === "IN_PROGRESS" && ["PAYMENT_PENDING", "PAID"].includes(entry.status))
      || (filter === "COMPLETED" && ["DELIVERED", "COMPLETED"].includes(entry.status))
      || (filter === "CANCELLED" && entry.status === "CANCELLED");
    const matchesSearch = !normalizedSearch
      || String(entry.id).toLowerCase().includes(normalizedSearch)
      || entry.items.some((item) => item.productName.toLowerCase().includes(normalizedSearch));
    return matchesFilter && matchesSearch;
  });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = orderId
          ? await authRequest(`orders/${encodeURIComponent(orderId)}`)
          : await authRequest("orders");
        if (!active) return;
        if (orderId) setOrder(result);
        else setOrders(result.orders || []);
        setStatus("ready");
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message);
        setStatus("error");
      }
    }
    setStatus("loading");
    setError("");
    load();
    return () => { active = false; };
  }, [orderId, retryCount]);

  useEffect(() => {
    if (orderId && order && status === "ready" && window.location.hash === "#tracking") {
      document.getElementById("tracking")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [order, orderId, status]);

  if (status === "loading") {
    return (
      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 lg:py-16" aria-label="Loading orders">
        <div className="h-3 w-24 animate-pulse bg-zinc-200" />
        <div className="mt-4 h-10 w-64 max-w-full animate-pulse bg-zinc-200" />
        <div className="mt-8 space-y-4">
          {[1, 2, 3].map((item) => <div key={item} className="h-44 animate-pulse border border-line bg-surface" />)}
        </div>
        <p className="sr-only" role="status">Loading your orders…</p>
      </section>
    );
  }
  if (status === "error") {
    return (
      <section className="mx-auto max-w-4xl px-6 py-16">
        <p className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>
        <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="mt-5 min-h-11 bg-ink px-5 text-xs font-semibold text-white">Retry</button>
        <Link href="/orders" className="mt-5 inline-block text-sm underline">Back to order history</Link>
      </section>
    );
  }
  if (orderId && order) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-12 sm:px-10 lg:py-16">
        <Link href="/orders" className="inline-flex items-center gap-2 text-xs text-muted hover:text-ink"><ArrowLeft size={15} /> Order history</Link>
        {cancellationMessage && <p className="mt-6 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">{cancellationMessage}</p>}
        {cancellationError && <p className="mt-6 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{cancellationError}</p>}
        <div className="mt-8 flex items-center gap-3">
          <PackageCheck size={24} />
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">Order #{order.id}</p>
            <h1 className="mt-1 font-serif text-4xl tracking-[-0.06em]">{order.status === "PAID" ? "Thank you." : "Order details."}</h1>
          </div>
        </div>
        <p className={`mt-6 inline-flex border px-3 py-2 text-xs ${order.status === "PAID" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : order.status === "CANCELLED" ? "border-red-200 bg-red-50 text-red-800" : "border-line bg-surface text-muted"}`}>
          {statusLabel(order.status)}
        </p>
        {order.status === "PAID" && <p className="mt-3 text-xs leading-5 text-muted">Paid orders cannot be cancelled here. Contact support to request a refund; refunds are handled separately.</p>}
        {order.status === "PAID" && (
          <button type="button" onClick={printInvoice} className="mt-4 min-h-10 border border-ink px-4 text-xs font-semibold">
            Print Invoice
          </button>
        )}
        {canCancelOrder(order) && (
          <button type="button" onClick={() => cancelOrder(order)} disabled={cancellingId !== null} className="mt-4 min-h-10 border border-red-300 px-4 text-xs font-semibold text-red-800 disabled:opacity-50">
            {cancellingId === String(order.id) ? "Cancelling…" : "Cancel order"}
          </button>
        )}
        <div className="mt-8 border-y border-line">
          {order.items.map((item, index) => (
            <div key={`${item.productId || "removed"}-${index}`} className="flex items-center gap-4 border-b border-line py-4 last:border-0">
              <div className="h-16 w-16 shrink-0 overflow-hidden bg-surface">
                {item.imageUrl && <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.productName}</p>
                <p className="mt-1 text-xs text-muted">Quantity {item.quantity} · {formatPrice(item.unitPrice)} each</p>
              </div>
              <span className="shrink-0 text-sm">{formatPrice(item.lineTotal)}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-between text-sm font-semibold"><span>Total</span><span>{formatPrice(order.totalAmount)}</span></div>
        <p className="mt-3 text-xs text-muted">Placed {formatDate(order.createdAt)} · {order.currency}</p>
        <div id="tracking" className="mt-8 border border-line p-5">
          <h2 className="font-serif text-xl">Order progress</h2>
          <ol className="mt-5 space-y-4">
            <li className="flex items-start gap-3 text-sm">
              <Check size={17} className="mt-0.5 shrink-0" />
              <span>Order placed <span className="block text-xs text-muted">{formatDate(order.createdAt)}</span></span>
            </li>
            {order.status === "PAID" ? (
              <li className="flex items-start gap-3 text-sm">
                <Check size={17} className="mt-0.5 shrink-0" />
                <span>Payment confirmed; order processing <span className="block text-xs text-muted">{formatDate(order.updatedAt)}</span></span>
              </li>
            ) : (
              <li className="flex items-start gap-3 text-sm text-muted">
                <Clock3 size={17} className="mt-0.5 shrink-0" />
                <span>{statusLabel(order.status)} <span className="block text-xs">{formatDate(order.updatedAt)}</span></span>
              </li>
            )}
          </ol>
          <p className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-xs text-muted">
            <Truck size={15} /> Shipment tracking and delivery estimates are not available for this order yet.
          </p>
        </div>
        {hasCustomerPermission(user, "VIEW_ORDER_DETAILS") && <div className="mt-8 border border-line p-5 text-sm leading-6">
          <h2 className="font-medium">Delivery address</h2>
          <p className="mt-2 text-muted">{order.shippingAddress.fullName} · {order.shippingAddress.phone}<br />
            {order.shippingAddress.addressLine1}{order.shippingAddress.addressLine2 ? `, ${order.shippingAddress.addressLine2}` : ""}<br />
            {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}, {order.shippingAddress.country}
          </p>
        </div>}
        {hasCustomerPermission(user, "VIEW_PAYMENT_HISTORY") && <div className="mt-5 border border-line p-5 text-sm">
          <h2 className="font-medium">Payment</h2>
          <p className="mt-2 text-muted">Status: {order.payment ? paymentStatusLabel(order.payment.status) : order.totalAmount === 0 ? "Not required" : statusLabel(order.status)}</p>
          <p className="mt-1 text-muted">Method: {order.payment?.razorpayOrderId ? "Razorpay" : order.totalAmount === 0 ? "No payment required" : "Not recorded"}</p>
        </div>}
        <Link href="/products" className="mt-8 inline-flex min-h-11 items-center justify-center border border-ink px-5 text-xs font-semibold">Continue browsing</Link>
        <div className="invoice-print" aria-hidden="true">
          <header className="invoice-header">
            <div>
              <h1>ShopSphere</h1>
              <p>Invoice</p>
            </div>
            <div className="invoice-meta">
              <p><strong>Invoice number:</strong> {order.invoiceNumber}</p>
              <p><strong>Order number:</strong> #{order.id}</p>
              <p><strong>Invoice date:</strong> {formatDate(order.createdAt)}</p>
            </div>
          </header>
          <section className="invoice-address">
            <h2>Bill to</h2>
            <p>{order.shippingAddress.fullName}</p>
            <p>{order.shippingAddress.phone}</p>
            <p>{order.shippingAddress.addressLine1}{order.shippingAddress.addressLine2 ? `, ${order.shippingAddress.addressLine2}` : ""}</p>
            <p>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}, {order.shippingAddress.country}</p>
          </section>
          <table className="invoice-items">
            <thead>
              <tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={`${item.productId || "removed"}-${index}`}>
                  <td>{item.productName}</td>
                  <td>{item.quantity}</td>
                  <td>{formatPrice(item.unitPrice)}</td>
                  <td>{formatPrice(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <section className="invoice-totals">
            {order.pricingBreakdown ? (
              <>
                <p><span>Subtotal</span><span>{formatPrice(order.pricingBreakdown.subtotal)}</span></p>
                {order.pricingBreakdown.couponCode && (
                  <p><span>Coupon {order.pricingBreakdown.couponCode}</span><span>−{formatPrice(order.pricingBreakdown.discount)}</span></p>
                )}
                {!order.pricingBreakdown.couponCode && order.pricingBreakdown.discount > 0 && (
                  <p><span>Discount</span><span>−{formatPrice(order.pricingBreakdown.discount)}</span></p>
                )}
                <p><span>Shipping</span><span>{formatPrice(order.pricingBreakdown.shipping)}</span></p>
                <p><span>GST ({order.pricingBreakdown.taxRatePercent}%)</span><span>{formatPrice(order.pricingBreakdown.tax)}</span></p>
              </>
            ) : (
              <p>Tax and fee breakdown was not recorded for this historical order.</p>
            )}
            <p className="invoice-grand-total"><strong>Total paid</strong><strong>{formatPrice(order.totalAmount)}</strong></p>
          </section>
          <p className="invoice-footer">Thank you for shopping with ShopSphere.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 lg:py-16">
      <div className="flex flex-col gap-6 border-b border-line pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.19em] text-muted">Your account</p>
          <h1 className="mt-3 font-serif text-4xl tracking-[-0.055em] sm:text-5xl">Orders &amp; Purchases</h1>
          <p className="mt-3 text-sm text-muted">A complete history of your orders.</p>
        </div>
        <label className="relative block w-full sm:max-w-sm">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your orders"
            className="min-h-12 w-full rounded-sm border border-line bg-white pl-11 pr-4 text-sm outline-none transition-colors placeholder:text-muted focus:border-ink"
            aria-label="Search orders by order ID or product name" />
        </label>
      </div>
      {cancellationMessage && <p className="mt-6 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">{cancellationMessage}</p>}
      {cancellationError && <p className="mt-6 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{cancellationError}</p>}
      {buyAgainMessage && <p className="mt-4 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">{buyAgainMessage}</p>}
      {buyAgainError && <p className="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{buyAgainError}</p>}
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter orders">
        {FILTERS.map((item) => (
          <button key={item.value} type="button" onClick={() => setFilter(item.value)} aria-pressed={filter === item.value}
            className={`min-h-9 rounded-sm px-4 text-xs font-medium transition-colors ${filter === item.value ? "bg-ink text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}>
            {item.label}
          </button>
        ))}
      </div>
      {orders.length === 0 ? (
        <div className="mt-8 rounded-sm border border-line px-6 py-14 text-center">
          <ShoppingBag className="mx-auto text-muted" size={25} strokeWidth={1.5} />
          <p className="mt-4 font-serif text-2xl">No orders yet</p>
          <p className="mt-2 text-sm text-muted">Your next favorite find is waiting for you.</p>
          <Link href="/products" className="mt-6 inline-flex min-h-11 items-center justify-center bg-ink px-5 text-xs font-semibold text-white transition-colors hover:bg-zinc-800">Explore Shop</Link>
        </div>
      ) : (
        <div className="mt-5 divide-y divide-line border-y border-line">
          {filteredOrders.map((entry) => {
            const expanded = Boolean(expandedOrders[entry.id]);
            const firstItem = entry.items[0];
            const placed = {
              label: "Order placed",
              timestamp: entry.createdAt,
              complete: true
            };
            const progress = entry.status === "PAID"
              ? {
                  label: "Payment confirmed · processing",
                  current: true
                }
              : {
                  label: statusLabel(entry.status),
                  current: true
                };
            const milestones = [placed, progress];

            return (
              <article key={entry.id} className="py-2">
                <button type="button" onClick={() => setExpandedOrders((current) => ({ ...current, [entry.id]: !current[entry.id] }))}
                  aria-expanded={expanded} aria-controls={`order-details-${entry.id}`}
                  className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 rounded-sm px-2 py-4 text-left transition-colors hover:bg-zinc-50 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:px-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-sm bg-zinc-100 sm:h-[72px] sm:w-[72px]">
                    {firstItem?.imageUrl && <img src={firstItem.imageUrl} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{firstItem?.productName || `Order #${entry.id}`}</p>
                    <p className="mt-1 truncate text-xs text-muted">
                      Order #{entry.id} <span aria-hidden="true">·</span> {formatDate(entry.createdAt)}
                    </p>
                    <p className="mt-1 text-xs text-muted">{entry.items.length} {entry.items.length === 1 ? "item" : "items"}</p>
                  </div>
                  <div className="col-span-2 flex items-center justify-between gap-3 pl-20 sm:col-span-1 sm:block sm:pl-0 sm:text-right">
                    <span className={`inline-flex rounded-sm px-2.5 py-1.5 text-[10px] font-medium ${entry.status === "PAID" ? "bg-zinc-100 text-zinc-800" : entry.status === "CANCELLED" || entry.status === "PAYMENT_FAILED" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
                      {statusLabel(entry.status)}
                    </span>
                    <span className="text-sm font-medium sm:mt-1 sm:block">{formatPrice(entry.totalAmount)}</span>
                  </div>
                  <ChevronDown size={18} className={`row-start-1 col-start-3 text-muted transition-transform duration-200 sm:row-auto sm:col-auto ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
                <div id={`order-details-${entry.id}`} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="min-h-0 overflow-hidden">
                    <div className="border-t border-line px-2 pb-5 pt-5 sm:px-4">
                      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(230px,0.8fr)]">
                        <div>
                          <h2 className="text-xs font-semibold uppercase tracking-[0.13em]">Items in this order</h2>
                          <div className="mt-3 divide-y divide-line border-y border-line">
                            {entry.items.map((item, index) => (
                              <div key={`${item.productId || "removed"}-${index}`} className="flex items-center gap-3 py-3">
                                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-sm bg-zinc-100">
                                  {item.imageUrl && <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">{item.productName}</p>
                                  <p className="mt-1 text-xs text-muted">Quantity {item.quantity} · {formatPrice(item.unitPrice)} each</p>
                                </div>
                                <span className="shrink-0 text-sm">{formatPrice(item.lineTotal)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 flex justify-between text-sm font-semibold">
                            <span>Order total</span><span>{formatPrice(entry.totalAmount)} {entry.currency}</span>
                          </div>
                        </div>
                        <div className="grid content-start gap-6 sm:grid-cols-2 lg:grid-cols-1">
                          {hasCustomerPermission(user, "VIEW_ORDER_DETAILS") && <div>
                            <h2 className="text-xs font-semibold uppercase tracking-[0.13em]">Delivery address</h2>
                            <p className="mt-3 text-xs leading-5 text-muted">
                              {entry.shippingAddress?.fullName}<br />
                              {entry.shippingAddress?.addressLine1}{entry.shippingAddress?.addressLine2 ? `, ${entry.shippingAddress.addressLine2}` : ""}<br />
                              {entry.shippingAddress?.city}, {entry.shippingAddress?.state} {entry.shippingAddress?.postalCode}, {entry.shippingAddress?.country}
                            </p>
                          </div>}
                          {hasCustomerPermission(user, "VIEW_PAYMENT_HISTORY") && <div>
                            <h2 className="text-xs font-semibold uppercase tracking-[0.13em]">Payment</h2>
                            <p className="mt-3 text-xs leading-5 text-muted">
                              {entry.payment ? paymentStatusLabel(entry.payment.status) : entry.totalAmount === 0 ? "No payment required" : statusLabel(entry.status)}<br />
                              {entry.payment?.razorpayOrderId ? "Razorpay" : entry.totalAmount === 0 ? "No payment method required" : "Method not recorded"}
                            </p>
                          </div>}
                        </div>
                      </div>
                      {hasCustomerPermission(user, "TRACK_ORDERS") && <div className="mt-7 border-t border-line pt-5">
                        <h2 className="text-xs font-semibold uppercase tracking-[0.13em]">Order progress</h2>
                        <ol className="mt-4 grid gap-4 sm:grid-cols-2">
                          {milestones.map((milestone, index) => (
                            <li key={`${milestone.label}-${index}`} className="flex items-start gap-3">
                              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${milestone.complete ? "bg-ink text-white" : milestone.current ? "bg-ink text-white" : "border border-zinc-300 bg-white text-zinc-400"}`}>
                                {milestone.complete ? <Check size={12} /> : milestone.current ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : <Clock3 size={12} />}
                              </span>
                              <span className={`text-xs ${milestone.complete || milestone.current ? "text-ink" : "text-muted"}`}>
                                {milestone.label}
                                {milestone.timestamp && <span className="mt-1 block text-[11px] text-muted">{formatDate(milestone.timestamp)}</span>}
                              </span>
                            </li>
                          ))}
                        </ol>
                        <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted">
                          <Truck size={15} className="mt-0.5 shrink-0" />
                          Shipment tracking and delivery events are not recorded for this order.
                        </p>
                      </div>}
                      <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
                        <Link href={`/orders/${encodeURIComponent(entry.id)}`} className="inline-flex min-h-10 items-center justify-center rounded-sm bg-ink px-4 text-xs font-semibold text-white transition-colors hover:bg-zinc-800">View Details</Link>
                        {hasCustomerPermission(user, "TRACK_ORDERS") && <Link href={`/orders/${encodeURIComponent(entry.id)}#tracking`} className="inline-flex min-h-10 items-center justify-center rounded-sm border border-line px-4 text-xs font-semibold transition-colors hover:border-ink">Track Order</Link>}
                        {canCancelOrder(entry) && (
                          <button type="button" onClick={() => cancelOrder(entry)} disabled={cancellingId !== null} className="min-h-10 rounded-sm border border-red-200 px-4 text-xs font-semibold text-red-800 transition-colors hover:border-red-400 disabled:opacity-50">
                            {cancellingId === String(entry.id) ? "Cancelling…" : "Cancel Order"}
                          </button>
                        )}
                        {hasCustomerPermission(user, "BUY_AGAIN") && entry.items.some((item) => item.productId) && (
                          <button type="button" onClick={() => buyAgain(entry)} disabled={buyingAgainId !== null} className="inline-flex min-h-10 items-center gap-2 rounded-sm border border-line px-4 text-xs font-semibold transition-colors hover:border-ink disabled:opacity-50">
                            <ShoppingBag size={14} /> {buyingAgainId === String(entry.id) ? "Adding…" : "Buy Again"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
          {filteredOrders.length === 0 && (
            <div className="px-5 py-12 text-center">
              <p className="font-serif text-xl">No matching orders</p>
              <p className="mt-2 text-sm text-muted">
                {filter === "COMPLETED"
                  ? "Completed delivery statuses are not available in the order records yet."
                  : "Try a different search or status filter."}
              </p>
              <button type="button" onClick={() => { setSearch(""); setFilter("ALL"); }} className="mt-4 text-xs font-semibold underline underline-offset-4">
                Clear search and filters
              </button>
            </div>
          )}
          </div>
      )}
    </section>
  );
}
