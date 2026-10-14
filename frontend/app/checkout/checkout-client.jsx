"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { useAuth } from "../../components/auth-provider";
import { useStore } from "../../components/store-provider";
import { authRequest } from "../../lib/api/auth";
import { formatPrice } from "../../lib/catalog";
import { hasCustomerPermission } from "../../lib/customer-permissions";

const emptyAddress = {
  fullName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "IN"
};

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    let script = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (script?.dataset.loadFailed === "true") {
      script.remove();
      script = null;
    }
    if (!script) {
      script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      document.body.appendChild(script);
    }
    script.addEventListener("load", () => resolve(Boolean(window.Razorpay)), { once: true });
    script.addEventListener("error", () => {
      script.dataset.loadFailed = "true";
      resolve(false);
    }, { once: true });
  });
}

export default function CheckoutClient({ user }) {
  const router = useRouter();
  const { csrfToken, user: authenticatedUser } = useAuth();
  const customer = authenticatedUser || user;
  const canViewCouponInput = hasCustomerPermission(customer, "VIEW_COUPON_INPUT");
  const canApplyCoupon = canViewCouponInput && hasCustomerPermission(customer, "APPLY_COUPON");
  const canRemoveCoupon = hasCustomerPermission(customer, "REMOVE_APPLIED_COUPON");
  const canViewDiscountDetails = hasCustomerPermission(customer, "VIEW_DISCOUNT_DETAILS");
  const canViewPriceBreakdown = hasCustomerPermission(customer, "VIEW_ORDER_PRICE_BREAKDOWN");
  const { bag, bagTotal, cartStatus, cartError, loadCart } = useStore();
  const [address, setAddress] = useState(emptyAddress);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  const inFlight = useRef(false);
  const couponInFlight = useRef(false);
  const idempotencyKey = useRef(null);
  const cartKey = bag.map((item) => `${item.id}:${item.quantity}`).join("|");

  useEffect(() => {
    if (!canApplyCoupon && appliedCouponCode) {
      setAppliedCouponCode(null);
      setCouponInput("");
      setCouponError("");
      setCouponMessage("");
      setQuote(null);
      setQuoteError("");
      idempotencyKey.current = null;
    }
  }, [appliedCouponCode, canApplyCoupon]);

  useEffect(() => {
    let active = true;
    if (cartStatus !== "ready" || !bag.length) {
      setQuote(null);
      setQuoteError("");
      setQuoteLoading(false);
      return () => { active = false; };
    }
    setQuote(null);
    setQuoteError("");
    setQuoteLoading(true);
    authRequest("orders/quote", appliedCouponCode
      ? {
          method: "POST",
          body: { couponCode: appliedCouponCode },
          csrfToken
        }
      : {})
      .then((result) => {
        if (active) {
          setQuote(result);
          if (appliedCouponCode) {
            setCouponMessage(`Coupon ${appliedCouponCode} applied.`);
          }
        }
      })
      .catch((quoteRequestError) => {
        if (active) {
          setQuoteError(quoteRequestError.message);
          if (appliedCouponCode) setCouponError(quoteRequestError.message);
        }
      })
      .finally(() => {
        if (active) {
          setQuoteLoading(false);
          couponInFlight.current = false;
        }
      });
    return () => { active = false; };
  }, [cartStatus, cartKey, quoteRefresh, appliedCouponCode, csrfToken]);

  function applyCoupon(event) {
    event.preventDefault();
    if (!canApplyCoupon || couponInFlight.current || quoteLoading || busy || !couponInput.trim()) return;
    const code = couponInput.trim().toUpperCase();
    if (code === appliedCouponCode) return;
    couponInFlight.current = true;
    setQuote(null);
    setQuoteError("");
    setCouponError("");
    setCouponMessage("");
    idempotencyKey.current = null;
    setAppliedCouponCode(code);
  }

  function removeCoupon() {
    if (busy) return;
    idempotencyKey.current = null;
    setAppliedCouponCode(null);
    setCouponInput("");
    setCouponError("");
    setCouponMessage("");
    setQuote(null);
    setQuoteError("");
  }

  function updateAddress(event) {
    setAddress((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function beginCheckout(event) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let sdkLoaded = Boolean(window.Razorpay);
      const quotedTotalIsZero = quote && Math.round(Number(quote.total) * 100) === 0;
      if (!quotedTotalIsZero && !sdkLoaded) {
        sdkLoaded = await loadRazorpay();
        if (!sdkLoaded || !window.Razorpay) {
          throw new Error("Razorpay Checkout could not be loaded. Check your connection and try again.");
        }
      }
      if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
      const checkout = await authRequest("orders", {
        method: "POST",
        body: {
          shippingAddress: address,
          ...(canApplyCoupon && appliedCouponCode ? { couponCode: appliedCouponCode } : {})
        },
        csrfToken,
        extraHeaders: { "Idempotency-Key": idempotencyKey.current }
      });
      if (checkout.paymentRequired === false) {
        if (checkout.order?.status !== "PAID" || !checkout.order?.id) {
          throw new Error("The server returned incomplete zero-payment order details.");
        }
        await loadCart();
        router.replace(`/orders/${encodeURIComponent(checkout.order.id)}?confirmed=1`);
        return;
      }
      if (!checkout.publicKey || !checkout.razorpayOrder?.id || !checkout.order?.id) {
        throw new Error("The payment service returned incomplete checkout details. Please try again.");
      }
      if (
        quote &&
        Math.round(Number(checkout.order.totalAmount) * 100) !== Math.round(quote.total * 100)
      ) {
        if (checkout.order.pricingBreakdown) setQuote(checkout.order.pricingBreakdown);
        throw new Error("The order total changed. Review the updated breakdown, then select Pay now again.");
      }
      if (!sdkLoaded) {
        sdkLoaded = await loadRazorpay();
        if (!sdkLoaded || !window.Razorpay) {
          throw new Error("Razorpay Checkout could not be loaded. Check your connection and try again.");
        }
      }

      const options = {
        key: checkout.publicKey,
        amount: checkout.razorpayOrder.amount,
        currency: checkout.razorpayOrder.currency,
        name: "ShopSphere",
        description: "Secure payment for your order",
        order_id: checkout.razorpayOrder.id,
        prefill: { name: user.name, email: user.email },
        theme: { color: "#171717" },
        handler: async (response) => {
          try {
            const verified = await authRequest(`orders/${encodeURIComponent(checkout.order.id)}/verify`, {
              method: "POST",
              body: response,
              csrfToken
            });
            if (!verified.verified || verified.order?.status !== "PAID") {
              throw new Error("Payment has not been confirmed yet. Your order remains unpaid.");
            }
            await loadCart();
            router.replace(`/orders/${encodeURIComponent(verified.order.id)}?confirmed=1`);
          } catch (verificationError) {
            setError(verificationError.message);
            setMessage("The payment provider response was received, but ShopSphere has not confirmed payment. Do not retry a payment until the order status is refreshed.");
            inFlight.current = false;
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setMessage("Checkout was closed. Your order remains unpaid; you can safely retry.");
            inFlight.current = false;
            setBusy(false);
          }
        }
      };
      const razorpay = new window.Razorpay(options);
      razorpay.on("payment.failed", (response) => {
        setError(response?.error?.description || "Payment failed. Your order has not been marked as paid.");
        inFlight.current = false;
        setBusy(false);
      });
      razorpay.open();
    } catch (checkoutError) {
      setError(checkoutError.message);
      inFlight.current = false;
      setBusy(false);
    }
  }

  const unavailable = bag.some((item) => !item.available);

  return (
    <div className="mx-auto max-w-[1120px] px-6 py-12 sm:px-10 lg:py-16">
      <Link href="/bag" className="inline-flex items-center gap-2 text-xs text-muted hover:text-ink"><ArrowLeft size={15} /> Return to your bag</Link>
      <p className="mt-8 text-[9px] font-semibold uppercase tracking-[0.19em] text-muted">Secure checkout</p>
      <h1 className="mt-3 font-serif text-4xl tracking-[-0.06em] sm:text-5xl">Delivery & payment.</h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Your order total and product availability are checked again by ShopSphere before a payment order is created.</p>

      {error && <p className="mt-6 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      {message && <p className="mt-6 border border-line bg-surface px-4 py-3 text-sm text-muted" role="status">{message}</p>}

      {cartStatus === "loading" ? (
        <p className="mt-10 border border-line px-5 py-10 text-center text-sm text-muted" role="status">Loading your saved bag…</p>
      ) : cartStatus === "error" ? (
        <div className="mt-10 border border-line p-6" role="alert"><p>{cartError || "Your bag could not be loaded."}</p><button type="button" onClick={loadCart} className="mt-4 border border-ink px-4 py-2 text-xs">Try again</button></div>
      ) : bag.length === 0 ? (
        <div className="mt-10 border border-line p-8 text-center"><p>Your bag is empty.</p><Link href="/products" className="mt-4 inline-block underline">Continue shopping</Link></div>
      ) : (
        <form onSubmit={beginCheckout} className="mt-10 grid items-start gap-10 lg:grid-cols-[1fr_340px]">
          <section className="border border-line p-5 sm:p-8">
            <h2 className="font-serif text-2xl">Delivery address</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                ["fullName", "Full name", "text"],
                ["phone", "Phone", "tel"],
                ["addressLine1", "Address line 1", "text"],
                ["addressLine2", "Address line 2 (optional)", "text"],
                ["city", "City", "text"],
                ["state", "State / region", "text"],
                ["postalCode", "Postal code", "text"],
                ["country", "Country code", "text"]
              ].map(([name, label, type]) => (
                <label key={name} className={`text-xs font-medium ${name === "addressLine1" || name === "addressLine2" ? "sm:col-span-2" : ""}`}>
                  {label}
                  <input
                    className="mt-2 min-h-12 w-full border border-line bg-white px-3 text-sm outline-none focus:border-ink"
                    name={name}
                    type={type}
                    value={address[name]}
                    onChange={updateAddress}
                    required={name !== "addressLine2"}
                    maxLength={name === "phone" ? 20 : name === "postalCode" ? 20 : 200}
                    autoComplete={name === "fullName" ? "name" : name === "phone" ? "tel" : undefined}
                  />
                </label>
              ))}
            </div>
          </section>

          <aside className="h-fit border border-line p-5 sm:p-7">
            <h2 className="font-serif text-2xl">Order summary</h2>
            {canApplyCoupon && <div className="mt-5 border-b border-line pb-5">
              <label htmlFor="checkout-coupon" className="text-xs font-semibold">Have a coupon code?</label>
              <div className="mt-2 flex gap-2">
                <input
                  id="checkout-coupon"
                  type="text"
                  value={couponInput}
                  onChange={(event) => setCouponInput(event.target.value)}
                  disabled={busy || quoteLoading}
                  maxLength={50}
                  autoComplete="off"
                  placeholder="Enter coupon code"
                  className="min-h-11 min-w-0 flex-1 border border-line bg-white px-3 text-xs outline-none focus:border-ink disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={busy || quoteLoading || !couponInput.trim() || couponInput.trim().toUpperCase() === appliedCouponCode}
                  className="min-h-11 border border-ink px-3 text-xs font-semibold disabled:opacity-50"
                >
                  {quoteLoading && appliedCouponCode ? "Applying…" : "Apply Coupon"}
                </button>
              </div>
              {appliedCouponCode && canRemoveCoupon && (
                <button type="button" onClick={removeCoupon} disabled={busy || quoteLoading} className="mt-2 text-xs underline disabled:opacity-50">
                  Remove Coupon ({appliedCouponCode})
                </button>
              )}
              {couponMessage && <p className="mt-2 text-xs text-emerald-800" role="status">{couponMessage}</p>}
              {couponError && <p className="mt-2 text-xs text-red-800" role="alert">{couponError}</p>}
            </div>}
            <div className="mt-5 divide-y divide-line border-y border-line">
              {bag.map((item) => (
                <div key={item.id} className="flex justify-between gap-4 py-3 text-xs">
                  <span>
                    {item.name} × {item.quantity}
                    {!item.available && (
                      <span className="block pt-1 text-red-700">
                        {Number.isSafeInteger(item.availableQuantity)
                          ? `Only ${item.availableQuantity} currently available.`
                          : "Available stock is not configured."}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0">{formatPrice(item.lineTotal)}</span>
                </div>
              ))}
            </div>
            {canViewPriceBreakdown && <div className="mt-5 flex justify-between text-sm font-semibold"><span>Items subtotal</span><span>{formatPrice(quote?.subtotal ?? bagTotal)}</span></div>}
            <div className="mt-3 space-y-2 border-t border-line pt-3 text-xs">
              {quote ? (
                canViewPriceBreakdown ? <>
                  {canViewDiscountDetails && <div className="flex justify-between"><span>{quote.couponCode ? `Coupon ${quote.couponCode}` : "Discount"}</span><span>−{formatPrice(quote.discount)}</span></div>}
                  <div className="flex justify-between"><span>Shipping</span><span>{formatPrice(quote.shipping)}</span></div>
                  <div className="flex justify-between"><span>GST ({quote.taxRatePercent}%)</span><span>{formatPrice(quote.tax)}</span></div>
                  <div className="flex justify-between border-t border-line pt-3 text-sm font-semibold"><span>Total payable</span><span>{formatPrice(quote.total)}</span></div>
                </> : <div className="flex justify-between text-sm font-semibold"><span>Total payable</span><span>{formatPrice(quote.total)}</span></div>
              ) : (
                <p className={quoteError ? "text-red-800" : "text-muted"} role={quoteError ? "alert" : "status"}>
                  {quoteError || (quoteLoading ? "Calculating your total…" : "Order total is not available yet.")}
                </p>
              )}
              {quoteError && (
                <button type="button" onClick={() => setQuoteRefresh((value) => value + 1)} className="mt-2 text-xs font-semibold underline">
                  Retry price quote
                </button>
              )}
            </div>
            {canViewPriceBreakdown && <p className="mt-3 text-[11px] leading-5 text-muted">Prices are in INR. GST is calculated on the discounted subtotal using current database prices.</p>}
            <button
              type="submit"
              disabled={busy || unavailable || cartStatus !== "ready" || !quote || quoteLoading || Boolean(quoteError)}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 border border-ink bg-ink px-5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              <LockKeyhole size={15} />
              {busy ? "Opening secure checkout…" : unavailable ? "Remove unavailable items" : quoteLoading ? "Calculating total…" : "Pay now"}
            </button>
            <p className="mt-3 text-center text-[10px] leading-5 text-muted">Payments are handled securely by Razorpay. Card data is never stored by ShopSphere.</p>
          </aside>
        </form>
      )}
    </div>
  );
}
