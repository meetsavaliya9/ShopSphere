"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, SlidersHorizontal } from "lucide-react";
import { ProductCard } from "./product-card";
import { useAuth } from "./auth-provider";
import { hasCustomerPermission } from "../lib/customer-permissions";
import { getPaginationItems, getPaginationRange } from "../lib/pagination";

function getCategories(products) {
  return [...new Set(products.map((product) => product.category))].sort((a, b) => a.localeCompare(b));
}

export function ProductCatalog({ initialResult, initialFilters = {} }) {
  const { user } = useAuth();
  const canSearch = hasCustomerPermission(user, "SEARCH_PRODUCTS");
  const canFilterAndSort = hasCustomerPermission(user, "FILTER_SORT_PRODUCTS");
  const [result, setResult] = useState(initialResult);
  const [filters, setFilters] = useState({
    search: initialFilters.search || "",
    category: initialFilters.category || "",
    minPrice: initialFilters.minPrice || "",
    maxPrice: initialFilters.maxPrice || "",
    sortBy: initialFilters.sortBy || "",
    order: initialFilters.order || "asc",
    page: Number(initialFilters.page || 1),
    limit: Number(initialFilters.limit || 12)
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState(() => getCategories(initialResult?.data || []));
  const searchTimeoutRef = useRef(null);
  const pendingSearchRef = useRef(null);

  const loadProducts = useCallback(async (nextFilters) => {
    const requestId = Date.now();
    pendingSearchRef.current = requestId;
    setLoading(true);
    setError("");
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(nextFilters)) {
      if (value !== "" && value !== undefined) query.set(key, String(value));
    }

    try {
      const response = await fetch(`/api/products?${query}`, {
        headers: { Accept: "application/json" }
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error?.message || `Product request failed (${response.status}).`);
      }
      // Only update state if this is still the latest request
      if (pendingSearchRef.current === requestId) {
        setResult(body);
        setFilters(nextFilters);
        if (Array.isArray(body?.data)) {
          setCategories((prev) => [...new Set([...prev, ...getCategories(body.data)])].sort((a, b) => a.localeCompare(b)));
        }
        const url = new URL(window.location.href);
        url.search = query.toString();
        window.history.replaceState(null, "", url);
      }
    } catch (requestError) {
      if (pendingSearchRef.current === requestId) {
        setError(requestError.message || "Products could not be loaded.");
      }
    } finally {
      if (pendingSearchRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  // Debounced search handler
  const handleSearchChange = useCallback((value) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      loadProducts((prev) => ({ ...prev, search: value.trim(), page: 1 }));
    }, 300);
    setFilters((prev) => ({ ...prev, search: value, page: 1 }));
  }, [loadProducts]);

  // Immediate handlers for other filters
  const handleFilterChange = useCallback((key, value) => {
    setFilters((prev) => {
      const newFilters = { ...prev, [key]: value, page: 1 };
      loadProducts(newFilters);
      return newFilters;
    });
  }, [loadProducts]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const total = Number(result?.pagination?.total ?? result?.count ?? 0);
  const paginationInfo = getPaginationRange(
    result?.pagination?.page || filters.page || 1,
    result?.pagination?.limit || filters.limit || 12,
    total
  );
  const { page, totalPages, startItem, endItem, isFirstPage, isLastPage } = paginationInfo;
  const paginationItems = getPaginationItems(page, totalPages);

  const goToPage = useCallback((targetPage) => {
    if (loading || targetPage < 1 || targetPage > totalPages || targetPage === page) {
      return;
    }
    const newFilters = { ...filters, page: targetPage };
    setFilters(newFilters);
    loadProducts(newFilters);
    if (typeof window !== "undefined") {
      const section = document.getElementById("product-results");
      if (section) {
        const top = section.getBoundingClientRect().top + window.scrollY - 100;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }
    }
  }, [loading, filters, page, totalPages, loadProducts]);

  return (
    <div className="grid gap-10 lg:grid-cols-[230px_minmax(0,1fr)]">
      {(canSearch || canFilterAndSort) && <aside className="lg:sticky lg:top-36 lg:self-start">
        <div className="flex items-center gap-2 border-b border-line pb-4">
          <SlidersHorizontal size={16} />
          <h2 className="text-sm font-semibold">Refine the edit</h2>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-1">
          {canSearch && <label className="col-span-2 text-xs text-muted lg:col-span-1">
            Search
            <input 
              name="search" 
              value={filters.search} 
              onChange={(event) => handleSearchChange(event.target.value)} 
              placeholder="What are you looking for?" 
              className="mt-2 min-h-11 w-full border border-line bg-white px-3 text-[13px] text-ink placeholder:text-[#a3a3a3] focus:border-ink" 
            />
          </label>}
          {canFilterAndSort && <>
            <label className="col-span-2 text-xs text-muted lg:col-span-1">
              Category
              <select 
                name="category" 
                value={filters.category} 
                onChange={(event) => handleFilterChange("category", event.target.value)} 
                className="mt-2 min-h-11 w-full border border-line bg-white px-3 text-[13px] text-ink focus:border-ink"
              >
                <option value="">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <div className="col-span-2 grid grid-cols-2 gap-3 lg:col-span-1">
              <label className="text-xs text-muted">
                From
                <input 
                  name="minPrice" 
                  type="number" 
                  min="0" 
                  step="0.01" 
                  value={filters.minPrice} 
                  onChange={(event) => handleFilterChange("minPrice", event.target.value)} 
                  placeholder="₹0" 
                  className="mt-2 min-h-11 w-full border border-line bg-white px-3 text-[13px] text-ink placeholder:text-[#a3a3a3] focus:border-ink" 
                />
              </label>
              <label className="text-xs text-muted">
                To
                <input 
                  name="maxPrice" 
                  type="number" 
                  min="0" 
                  step="0.01" 
                  value={filters.maxPrice} 
                  onChange={(event) => handleFilterChange("maxPrice", event.target.value)} 
                  placeholder="No limit" 
                  className="mt-2 min-h-11 w-full border border-line bg-white px-3 text-[13px] text-ink placeholder:text-[#a3a3a3] focus:border-ink" 
                />
              </label>
            </div>
            <label className="text-xs text-muted">
              Sort by
              <select 
                name="sortBy" 
                value={filters.sortBy} 
                onChange={(event) => handleFilterChange("sortBy", event.target.value)} 
                className="mt-2 min-h-11 w-full border border-line bg-white px-3 text-[13px] text-ink focus:border-ink"
              >
                <option value="">Recommended</option>
                <option value="name">Name</option>
                <option value="price">Price</option>
              </select>
            </label>
            <label className="text-xs text-muted">
              Order
              <select 
                name="order" 
                value={filters.order} 
                onChange={(event) => handleFilterChange("order", event.target.value)} 
                className="mt-2 min-h-11 w-full border border-line bg-white px-3 text-[13px] text-ink focus:border-ink"
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>
          </>}
        </div>
      </aside>}

      <section id="product-results" aria-label="Product results" aria-busy={loading}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <p className="text-sm text-muted">
            {total} {total === 1 ? "piece" : "pieces"} in the collection
          </p>
          {loading && <span className="inline-flex items-center gap-2 text-xs text-muted"><LoaderCircle className="animate-spin" size={14} /> Updating collection</span>}
        </div>
        {error ? (
          <div className="border border-line bg-[#fafafa] px-5 py-10 text-center" role="alert">
            <p className="font-medium">The collection could not be refreshed.</p>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <button 
              className="mt-5 inline-flex min-h-12 items-center justify-center gap-2.5 border border-[#d8d8d8] bg-white px-5 text-xs font-semibold text-ink transition-colors motion-reduce:transition-none hover:enabled:border-ink disabled:cursor-not-allowed disabled:opacity-45" 
              type="button" 
              onClick={() => loadProducts(filters)}
            >
              Try again
            </button>
          </div>
        ) : result.data.length === 0 ? (
          <div className="border border-line bg-[#fafafa] px-5 py-10 text-center">
            <p className="font-medium">Nothing found, for now.</p>
            <p className="mt-2 text-sm text-muted">Try a broader search or clear a filter.</p>
            <button 
              className="mt-5 inline-flex min-h-12 items-center justify-center gap-2.5 border border-[#d8d8d8] bg-white px-5 text-xs font-semibold text-ink transition-colors motion-reduce:transition-none hover:enabled:border-ink disabled:cursor-not-allowed disabled:opacity-45" 
              type="button" 
              onClick={() => {
                const clearedFilters = { search: "", category: "", minPrice: "", maxPrice: "", sortBy: "", order: "asc", page: 1, limit: filters.limit };
                setFilters(clearedFilters);
                loadProducts(clearedFilters);
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
              {result.data.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
            </div>

            {total > 0 ? (
              <div className="mt-5 flex flex-col items-center gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between sm:gap-4">
                <p className="text-xs text-muted">
                  Showing {startItem}–{endItem} of {total} {total === 1 ? "product" : "products"}
                </p>
                {totalPages > 1 ? (
                  <nav className="flex flex-wrap items-center justify-center gap-0.5 sm:justify-end" aria-label="Product pagination">
                    <button
                      type="button"
                      onClick={() => goToPage(page - 1)}
                      disabled={isFirstPage || loading}
                      aria-label="Previous page"
                      className="inline-flex h-8 items-center gap-0.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-ink transition-colors motion-reduce:transition-none hover:enabled:text-muted disabled:cursor-not-allowed disabled:text-[#b0b0b0]"
                    >
                      <ChevronLeft size={14} aria-hidden="true" />
                      Previous
                    </button>
                    {paginationItems.map((item, idx) => {
                      if (item === "...") {
                        return (
                          <span
                            key={`ellipsis-${idx}`}
                            className="inline-flex h-8 w-6 items-center justify-center text-xs text-muted select-none"
                            aria-hidden="true"
                          >
                            …
                          </span>
                        );
                      }
                      const isCurrent = item === page;
                      return (
                        <button
                          key={`page-${item}`}
                          type="button"
                          onClick={() => goToPage(item)}
                          disabled={loading || isCurrent}
                          aria-current={isCurrent ? "page" : undefined}
                          aria-label={isCurrent ? `Page ${item}, current page` : `Go to page ${item}`}
                          className={`inline-flex h-8 min-w-8 items-center justify-center px-1.5 text-[13px] font-medium transition-colors motion-reduce:transition-none ${
                            isCurrent
                              ? "bg-ink text-white"
                              : "text-ink hover:bg-surface disabled:opacity-45"
                          }`}
                        >
                          {item}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => goToPage(page + 1)}
                      disabled={isLastPage || loading}
                      aria-label="Next page"
                      className="inline-flex h-8 items-center gap-0.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-ink transition-colors motion-reduce:transition-none hover:enabled:text-muted disabled:cursor-not-allowed disabled:text-[#b0b0b0]"
                    >
                      Next
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  </nav>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
