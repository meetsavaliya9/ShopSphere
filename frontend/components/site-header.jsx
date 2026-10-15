"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Heart,
  Home,
  LogOut,
  Menu,
  Package,
  Search,
  Shield,
  ShoppingBag,
  UserRound,
  X
} from "lucide-react";
import { useStore } from "./store-provider";
import { useAuth } from "./auth-provider";
import { hasCustomerPermission } from "../lib/customer-permissions";
import { formatPrice } from "../lib/catalog";
import { ProductImage } from "./product-image";

const POPULAR_SEARCHES = [
  "Backpack",
  "Bottle",
  "Headphones",
  "Accessories",
  "Home",
  "Electronics"
];

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { bagCount, favorites } = useStore();
  const { user, logout } = useAuth();
  const canSearchProducts = hasCustomerPermission(user, "SEARCH_PRODUCTS");
  const canViewWishlist = hasCustomerPermission(user, "VIEW_WISHLIST");
  const canViewAccount = hasCustomerPermission(user, "VIEW_ACCOUNT");
  const canViewOrders = hasCustomerPermission(user, "VIEW_ORDERS");

  // Navigation states
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const searchInputRef = useRef(null);
  const accountMenuRef = useRef(null);

  // Close menus on Escape key
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setSearchOpen(false);
        setAccountMenuOpen(false);
        setMobileMenuOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close account dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    }
    if (accountMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [accountMenuOpen]);

  // Focus search input when search opens & lock scroll
  useEffect(() => {
    if (searchOpen) {
      document.body.style.overflow = "hidden";
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      document.body.style.overflow = "";
      setSearchQuery("");
      setSearchResults([]);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [searchOpen]);

  // Fetch search results connected to /api/products
  useEffect(() => {
    if (!searchOpen) return;
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/products?search=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal
        });
        if (response.ok) {
          const payload = await response.json();
          setSearchResults(Array.isArray(payload?.data) ? payload.data : []);
        } else {
          setSearchResults([]);
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          setSearchResults([]);
        }
      } finally {
        setSearchLoading(false);
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, searchOpen]);

  async function handleLogout() {
    try {
      await logout();
      setLogoutError("");
      setAccountMenuOpen(false);
      setMobileMenuOpen(false);
    } catch (error) {
      setLogoutError(error.message);
    }
  }

  function handleSearchSubmit(queryToSubmit) {
    const term = (queryToSubmit !== undefined ? queryToSubmit : searchQuery).trim();
    setSearchOpen(false);
    setMobileMenuOpen(false);
    if (term) {
      router.push(`/products?search=${encodeURIComponent(term)}`);
    } else {
      router.push("/products");
    }
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-line bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-8 lg:px-12">
          {/* Mobile menu button */}
          <div className="flex items-center md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface active:scale-95"
              aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

          {/* Logo (ShopSphere branding preserved) */}
          <Link
            href="/"
            className="shrink-0 whitespace-nowrap font-serif text-[19px] font-bold tracking-[-0.08em] text-ink sm:text-[21px]"
            aria-label="ShopSphere home"
            onClick={() => setMobileMenuOpen(false)}
          >
            SHOP<span className="font-normal">SPHERE</span>
            <span className="text-[#8b735b]">.</span>
          </Link>

          {/* Desktop primary links: 1. Home, 2. Shop */}
          <nav className="hidden items-center gap-8 md:flex" aria-label="Main navigation">
            <Link
              href="/"
              className="text-[13px] font-medium tracking-[0.04em] text-ink transition-colors hover:text-muted"
            >
              Home
            </Link>
            <Link
              href="/products"
              className="text-[13px] font-medium tracking-[0.04em] text-ink transition-colors hover:text-muted"
            >
              Shop
            </Link>
          </nav>

          {/* Right utility options: 3. Search, 4. Wishlist, 5. Account, 6. Cart */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* 3. Search */}
            {canSearchProducts && <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-full border border-line bg-white px-0 text-sm font-medium text-ink transition-all hover:border-zinc-300 hover:bg-surface active:scale-95 sm:w-auto sm:px-4"
              aria-label="Search products"
            >
              <Search size={20} strokeWidth={1.8} className="text-ink" />
              <span className="hidden md:inline tracking-wide">Search</span>
            </button>}

            {/* 4. Wishlist */}
            {canViewWishlist && <Link
              href="/favorites"
              className="relative inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium text-ink transition-all hover:bg-surface active:scale-95"
              aria-label={`Wishlist, ${favorites.length} items`}
            >
              <Heart size={18} strokeWidth={1.75} className="text-ink" />
              <span className="hidden lg:inline tracking-wide">Wishlist</span>
              {favorites.length > 0 && (
                <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-ink px-1.5 text-[10px] font-semibold text-white">
                  {favorites.length}
                </span>
              )}
            </Link>}

            {/* 5. Account */}
            <div className="relative" ref={accountMenuRef}>
              <button
                type="button"
                onClick={() => setAccountMenuOpen((open) => !open)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-ink transition-all hover:bg-surface active:scale-95"
                aria-label="Account options"
                aria-expanded={accountMenuOpen}
              >
                <UserRound size={18} strokeWidth={1.75} className="text-ink" />
                <span className="hidden lg:inline tracking-wide">
                  {user ? user.name.split(" ")[0] : "Account"}
                </span>
                <ChevronDown
                  size={14}
                  className={`hidden text-muted transition-transform duration-200 lg:inline ${
                    accountMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Account Dropdown */}
              {accountMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-line bg-white p-4 shadow-xl ring-1 ring-black/5 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                  role="menu"
                  aria-label="Account menu"
                >
                  {user ? (
                    <div className="space-y-3">
                      <div className="border-b border-line pb-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                          Signed in as
                        </p>
                        <p className="mt-1 text-sm font-semibold text-ink truncate">{user.name}</p>
                        <p className="text-xs text-muted truncate">{user.email}</p>
                        <span className="mt-2 inline-block rounded border border-line bg-surface px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted">
                          {user.role}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {canViewAccount && <Link
                          href="/account"
                          onClick={() => setAccountMenuOpen(false)}
                          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-ink hover:bg-surface transition-colors"
                          role="menuitem"
                        >
                          <UserRound size={15} />
                          Account Overview
                        </Link>}
                        {user.role === "CUSTOMER" && canViewOrders && (
                          <Link
                            href="/orders"
                            onClick={() => setAccountMenuOpen(false)}
                            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-ink hover:bg-surface transition-colors"
                            role="menuitem"
                          >
                            <Package size={15} />
                            My Orders
                          </Link>
                        )}
                        {user.role === "MANAGER" && (
                          <Link
                            href="/manager"
                            onClick={() => setAccountMenuOpen(false)}
                            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-ink hover:bg-surface transition-colors"
                            role="menuitem"
                          >
                            <Package size={15} />
                            Manager Dashboard
                          </Link>
                        )}
                        {user.role === "ADMIN" && (
                          <Link
                            href="/admin"
                            onClick={() => setAccountMenuOpen(false)}
                            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-ink hover:bg-surface transition-colors"
                            role="menuitem"
                          >
                            <Shield size={15} />
                            Admin Dashboard
                          </Link>
                        )}
                      </div>
                      <div className="border-t border-line pt-2">
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                          role="menuitem"
                        >
                          <LogOut size={15} />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold text-ink">Customer Account</h3>
                        <p className="mt-1 text-xs text-muted">
                          Sign in to access your orders, saved items, and details.
                        </p>
                      </div>
                      <div className="space-y-2 pt-1">
                        <Link
                          href="/login"
                          onClick={() => setAccountMenuOpen(false)}
                          className="block w-full rounded-lg bg-ink py-2 text-center text-xs font-semibold text-white hover:bg-black transition-colors"
                          role="menuitem"
                        >
                          Sign In
                        </Link>
                        <Link
                          href="/register"
                          onClick={() => setAccountMenuOpen(false)}
                          className="block w-full rounded-lg border border-line py-2 text-center text-xs font-semibold text-ink hover:bg-surface transition-colors"
                          role="menuitem"
                        >
                          Create Account
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 6. Cart */}
            <Link
              href="/bag"
              className="relative inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium text-ink transition-all hover:bg-surface active:scale-95"
              aria-label={`Cart, ${bagCount} items`}
            >
              <ShoppingBag size={18} strokeWidth={1.75} className="text-ink" />
              <span className="hidden lg:inline tracking-wide">Cart</span>
              {bagCount > 0 && (
                <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-ink px-1.5 text-[10px] font-semibold text-white">
                  {bagCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {logoutError && (
          <p className="border-t border-line bg-red-50 px-6 py-2 text-center text-xs text-red-700" role="alert">
            {logoutError}
          </p>
        )}

        {/* Mobile Navigation Drawer (Exactly the six options) */}
        {mobileMenuOpen && (
          <nav
            id="mobile-navigation"
            className="border-t border-line bg-white px-5 py-6 md:hidden animate-in fade-in slide-in-from-top-3 duration-200"
            aria-label="Mobile navigation"
          >
            <div className="mx-auto flex flex-col space-y-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                Navigation
              </p>

              {/* 1. Home */}
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg py-2 text-sm font-medium text-ink hover:text-muted transition-colors"
              >
                <Home size={18} className="text-ink" />
                Home
              </Link>

              {/* 2. Shop */}
              <Link
                href="/products"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg py-2 text-sm font-medium text-ink hover:text-muted transition-colors"
              >
                <ShoppingBag size={18} className="text-ink" />
                Shop
              </Link>

              {/* 3. Search */}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setSearchOpen(true);
                }}
                className="flex w-full items-center gap-3 rounded-lg py-2 text-left text-sm font-medium text-ink hover:text-muted transition-colors"
              >
                <Search size={18} className="text-ink" />
                Search
              </button>

              {/* 4. Wishlist */}
              <Link
                href="/favorites"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between rounded-lg py-2 text-sm font-medium text-ink hover:text-muted transition-colors"
              >
                <span className="flex items-center gap-3">
                  <Heart size={18} className="text-ink" />
                  Wishlist
                </span>
                {favorites.length > 0 && (
                  <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-white">
                    {favorites.length}
                  </span>
                )}
              </Link>

              {/* 5. Account */}
              <div className="border-t border-line pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Account
                </p>
                {user ? (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-lg bg-surface p-3">
                      <p className="text-xs font-semibold text-ink">{user.name}</p>
                      <p className="text-[11px] text-muted">{user.email}</p>
                    </div>
                    <div className="flex flex-col space-y-2">
                      <Link
                        href="/account"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 py-1.5 text-sm font-medium text-ink hover:text-muted transition-colors"
                      >
                        <UserRound size={17} />
                        Account Overview
                      </Link>
                      {user.role === "CUSTOMER" && (
                        <Link
                          href="/orders"
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center gap-3 py-1.5 text-sm font-medium text-ink hover:text-muted transition-colors"
                        >
                          <Package size={17} />
                          My Orders
                        </Link>
                      )}
                      {user.role === "MANAGER" && (
                        <Link
                          href="/manager"
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center gap-3 py-1.5 text-sm font-medium text-ink hover:text-muted transition-colors"
                        >
                          <Package size={17} />
                          Manager Dashboard
                        </Link>
                      )}
                      {user.role === "ADMIN" && (
                        <Link
                          href="/admin"
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center gap-3 py-1.5 text-sm font-medium text-ink hover:text-muted transition-colors"
                        >
                          <Shield size={17} />
                          Admin Dashboard
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex items-center gap-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
                      >
                        <LogOut size={17} />
                        Sign Out
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <Link
                        href="/login"
                        onClick={() => setMobileMenuOpen(false)}
                        className="rounded-lg bg-ink py-2.5 text-center text-xs font-semibold text-white hover:bg-black transition-colors"
                      >
                        Sign In
                      </Link>
                      <Link
                        href="/register"
                        onClick={() => setMobileMenuOpen(false)}
                        className="rounded-lg border border-line py-2.5 text-center text-xs font-semibold text-ink hover:bg-surface transition-colors"
                      >
                        Register
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* 6. Cart */}
              <div className="border-t border-line pt-4">
                <Link
                  href="/bag"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between rounded-lg py-2 text-sm font-medium text-ink hover:text-muted transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <ShoppingBag size={18} className="text-ink" />
                    Cart
                  </span>
                  {bagCount > 0 && (
                    <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-white">
                      {bagCount} {bagCount === 1 ? "item" : "items"}
                    </span>
                  )}
                </Link>
              </div>
            </div>
          </nav>
        )}
      </header>

      {/* Functional Product Search Interface (Modal / Overlay) */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-label="Product search"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSearchOpen(false);
          }}
        >
          <div className="w-full border-b border-line bg-white shadow-2xl animate-in slide-in-from-top-4 duration-200">
            <div className="mx-auto max-w-[960px] px-4 py-5 sm:px-8">
              {/* Search input bar */}
              <div className="flex min-h-14 min-w-0 items-center gap-3 rounded-xl border border-line bg-white px-4 py-2 shadow-sm transition-colors focus-within:border-ink">
                <Search size={24} className="shrink-0 text-ink" aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearchSubmit();
                    }
                  }}
                  placeholder="Search products by name or category..."
                  className="min-w-0 flex-1 bg-transparent text-lg font-normal text-ink outline-none placeholder:text-muted sm:text-xl"
                  aria-label="Search products"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink transition-colors"
                    aria-label="Clear search input"
                  >
                    <X size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface transition-colors"
                  aria-label="Close search dialog"
                >
                  <X size={14} />
                  <span className="hidden sm:inline">Close</span>
                </button>
              </div>

              {/* Search results or popular suggestions */}
              <div className="max-h-[60vh] overflow-y-auto py-5">
                {searchQuery.trim() === "" ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                      Popular Searches
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {POPULAR_SEARCHES.map((term) => (
                        <button
                          key={term}
                          type="button"
                          onClick={() => {
                            setSearchQuery(term);
                          }}
                          className="rounded-full border border-line bg-surface/60 px-3.5 py-1.5 text-xs font-medium text-ink hover:border-ink hover:bg-surface transition-all"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                    <div className="mt-6 border-t border-line pt-4">
                      <Link
                        href="/products"
                        onClick={() => setSearchOpen(false)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink hover:underline"
                      >
                        Browse all products in catalog →
                      </Link>
                    </div>
                  </div>
                ) : searchLoading ? (
                  <div className="py-10 text-center">
                    <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-line border-t-ink" />
                    <p className="mt-3 text-xs text-muted">Searching catalog...</p>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>
                        Found {searchResults.length}{" "}
                        {searchResults.length === 1 ? "result" : "results"} for &ldquo;{searchQuery}&rdquo;
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSearchSubmit()}
                        className="font-medium text-ink hover:underline"
                      >
                        View all results →
                      </button>
                    </div>
                    <div className="divide-y divide-line rounded-xl border border-line">
                      {searchResults.map((product, index) => (
                        <Link
                          key={product.id}
                          href={`/products/${product.id}`}
                          onClick={() => setSearchOpen(false)}
                          className="flex items-center justify-between gap-4 p-3.5 hover:bg-surface/80 transition-colors first:rounded-t-xl last:rounded-b-xl"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface">
                              <ProductImage
                                product={product}
                                alt={product.name}
                                width={48}
                                height={48}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-ink truncate">
                                {product.name}
                              </p>
                              <p className="text-[11px] text-muted">
                                {product.category}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-semibold text-ink">
                              {formatPrice(product.price)}
                            </p>
                            <span
                              className={`text-[10px] font-medium ${
                                product.inStock ? "text-emerald-700" : "text-muted"
                              }`}
                            >
                              {product.inStock ? "In stock" : "Out of stock"}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center">
                    <p className="text-sm font-medium text-ink">
                      No products found for &ldquo;{searchQuery}&rdquo;
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Try checking for spelling or searching for another category.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleSearchSubmit()}
                      className="mt-4 rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-black transition-colors"
                    >
                      Search all catalog items
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
