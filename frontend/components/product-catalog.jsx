"use client";

import { useState } from "react";
import { LoaderCircle, SlidersHorizontal } from "lucide-react";
import { ProductCard } from "./product-card";
import { useAuth } from "./auth-provider";
import { hasCustomerPermission } from "../lib/customer-permissions";

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
    limit: Number(initialFilters.limit || 10)
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const categories = getCategories(initialResult.data || []);

  async function loadProducts(nextFilters) {
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
      setResult(body);
      setFilters(nextFilters);
      const url = new URL(window.location.href);
      url.search = query.toString();
      window.history.replaceState(null, "", url);
    } catch (requestError) {
      setError(requestError.message || "Products could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  function submitFilters(event) {
    event.preventDefault();
    loadProducts({
      ...filters,
      search: filters.search.trim(),
      page: 1
    });
  }

  function goToPage(page) {
    loadProducts({ ...filters, page });
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[230px_minmax(0,1fr)]">
      {(canSearch || canFilterAndSort) && <aside className="lg:sticky lg:top-36 lg:self-start">
        <div className="flex items-center gap-2 border-b border-line pb-4">
          <SlidersHorizontal size={16} />
          <h2 className="text-sm font-semibold">Refine the edit</h2>
        </div>
        <form onSubmit={submitFilters} className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-1">
          {canSearch && <label className="col-span-2 text-xs text-muted lg:col-span-1">
            Search
            <input name="search" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="What are you looking for?" className="mt-2 min-h-11 w-full border border-line bg-white px-3 text-[13px] text-ink placeholder:text-[#a3a3a3] focus:border-ink" />
          </label>}
          {canFilterAndSort && <>
            <label className="col-span-2 text-xs text-muted lg:col-span-1">
              Category
              <select name="category" value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })} className="mt-2 min-h-11 w-full border border-line bg-white px-3 text-[13px] text-ink focus:border-ink">
                <option value="">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <div className="col-span-2 grid grid-cols-2 gap-3 lg:col-span-1">
              <label className="text-xs text-muted">
                From
                <input name="minPrice" type="number" min="0" step="0.01" value={filters.minPrice} onChange={(event) => setFilters({ ...filters, minPrice: event.target.value })} placeholder="₹0" className="mt-2 min-h-11 w-full border border-line bg-white px-3 text-[13px] text-ink placeholder:text-[#a3a3a3] focus:border-ink" />
              </label>
              <label className="text-xs text-muted">
                To
                <input name="maxPrice" type="number" min="0" step="0.01" value={filters.maxPrice} onChange={(event) => setFilters({ ...filters, maxPrice: event.target.value })} placeholder="No limit" className="mt-2 min-h-11 w-full border border-line bg-white px-3 text-[13px] text-ink placeholder:text-[#a3a3a3] focus:border-ink" />
              </label>
            </div>
            <label className="text-xs text-muted">
              Sort by
              <select name="sortBy" value={filters.sortBy} onChange={(event) => setFilters({ ...filters, sortBy: event.target.value })} className="mt-2 min-h-11 w-full border border-line bg-white px-3 text-[13px] text-ink focus:border-ink">
                <option value="">Recommended</option>
                <option value="name">Name</option>
                <option value="price">Price</option>
              </select>
            </label>
            <label className="text-xs text-muted">
              Order
              <select name="order" value={filters.order} onChange={(event) => setFilters({ ...filters, order: event.target.value })} className="mt-2 min-h-11 w-full border border-line bg-white px-3 text-[13px] text-ink focus:border-ink">
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>
          </>}
          <button className="inline-flex min-h-12 items-center justify-center gap-2.5 border border-ink bg-ink px-5 text-xs font-semibold text-white transition-colors motion-reduce:transition-none hover:enabled:bg-[#393939] disabled:cursor-not-allowed disabled:opacity-45 col-span-2 lg:col-span-1" type="submit" disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" size={17} /> : "Apply filters"}
          </button>
        </form>
      </aside>}

      <section aria-label="Product results" aria-busy={loading}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <p className="text-sm text-muted">
            {result.count} {result.count === 1 ? "piece" : "pieces"} in the collection
          </p>
          {loading && <span className="inline-flex items-center gap-2 text-xs text-muted"><LoaderCircle className="animate-spin" size={14} /> Updating collection</span>}
        </div>
        {error ? (
          <div className="border border-line bg-[#fafafa] px-5 py-10 text-center" role="alert">
            <p className="font-medium">The collection could not be refreshed.</p>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <button className="mt-5 inline-flex min-h-12 items-center justify-center gap-2.5 border border-[#d8d8d8] bg-white px-5 text-xs font-semibold text-ink transition-colors motion-reduce:transition-none hover:enabled:border-ink disabled:cursor-not-allowed disabled:opacity-45" type="button" onClick={() => loadProducts(filters)}>Try again</button>
          </div>
        ) : result.data.length === 0 ? (
          <div className="border border-line bg-[#fafafa] px-5 py-10 text-center">
            <p className="font-medium">Nothing found, for now.</p>
            <p className="mt-2 text-sm text-muted">Try a broader search or clear a filter.</p>
            <button className="mt-5 inline-flex min-h-12 items-center justify-center gap-2.5 border border-[#d8d8d8] bg-white px-5 text-xs font-semibold text-ink transition-colors motion-reduce:transition-none hover:enabled:border-ink disabled:cursor-not-allowed disabled:opacity-45" type="button" onClick={() => loadProducts({ search: "", category: "", minPrice: "", maxPrice: "", sortBy: "", order: "asc", page: 1, limit: filters.limit })}>Clear filters</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
              {result.data.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
            </div>
            {result.pagination.totalPages > 1 && (
              <nav className="mt-12 flex items-center justify-center gap-5" aria-label="Product pages">
                <button type="button" className="inline-flex min-h-12 items-center justify-center gap-2.5 border border-[#d8d8d8] bg-white px-5 text-xs font-semibold text-ink transition-colors motion-reduce:transition-none hover:enabled:border-ink disabled:cursor-not-allowed disabled:opacity-45" disabled={filters.page <= 1 || loading} onClick={() => goToPage(filters.page - 1)}>Previous</button>
                <span className="text-sm text-muted">Page {filters.page} of {result.pagination.totalPages}</span>
                <button type="button" className="inline-flex min-h-12 items-center justify-center gap-2.5 border border-[#d8d8d8] bg-white px-5 text-xs font-semibold text-ink transition-colors motion-reduce:transition-none hover:enabled:border-ink disabled:cursor-not-allowed disabled:opacity-45" disabled={filters.page >= result.pagination.totalPages || loading} onClick={() => goToPage(filters.page + 1)}>Next</button>
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  );
}
