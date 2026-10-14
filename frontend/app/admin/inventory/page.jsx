"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Download,
  Filter,
  LoaderCircle,
  Package,
  Plus,
  RefreshCw,
  Search,
  Sliders,
  User,
  X,
  XCircle
} from "lucide-react";
import { authRequest } from "../../../lib/api/auth";
import { useAuth } from "../../../components/auth-provider";
import { Badge } from "../../../components/admin/badge";
import { Modal } from "../../../components/admin/modal";
import { StatCard } from "../../../components/admin/stat-card";
import { ProductImage } from "../../../components/product-image";

export default function AdminInventoryPage() {
  const { csrfToken } = useAuth();
  const [products, setProducts] = useState([]);
  const [managers, setManagers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Stock toggle modal
  const [toggleTarget, setToggleTarget] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [stockQuantityValue, setStockQuantityValue] = useState("");
  const [thresholdValue, setThresholdValue] = useState("");
  const [stockReason, setStockReason] = useState("");

  // Assign manager modal
  const [assignTarget, setAssignTarget] = useState(null);
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const pageSize = 12;

  const loadData = useCallback(async (targetPage = page) => {
    setStatus("loading");
    setError("");
    try {
      const query = new URLSearchParams({
        page: String(targetPage),
        limit: String(pageSize)
      });
      if (search.trim()) query.set("search", search.trim());
      if (categoryFilter !== "ALL") query.set("category", categoryFilter);
      if (stockFilter !== "ALL") {
        query.set("inStock", stockFilter === "IN_STOCK" ? "true" : "false");
      }
      const [inventoryResponse, usersRes, categoriesRes, summaryRes] = await Promise.all([
        authRequest(`admin/inventory?${query.toString()}`, { includeEnvelope: true }),
        authRequest("admin/users"),
        authRequest("admin/categories"),
        authRequest("admin/inventory/summary")
      ]);
      if (!Array.isArray(inventoryResponse?.data) || !inventoryResponse?.pagination) {
        throw new Error("The inventory response was invalid.");
      }
      const productList = inventoryResponse.data;
      const userList = Array.isArray(usersRes) ? usersRes : usersRes?.data || [];
      setProducts(productList);
      setPagination(inventoryResponse.pagination);
      setSummary(summaryRes);
      setCategories(Array.isArray(categoriesRes) ? categoriesRes : []);
      setManagers(
        userList.filter((u) => ["MANAGER", "INVENTORY_MANAGER"].includes(u.role))
      );
      const lastPage = Math.max(1, inventoryResponse.pagination.totalPages);
      if (targetPage > lastPage) {
        setPage(lastPage);
        return;
      }
      setPage(targetPage);
      setStatus("ready");
    } catch (err) {
      setError(err.message || "Failed to load inventory data.");
      setStatus("error");
    }
  }, [categoryFilter, page, pageSize, search, stockFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadData(page), search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [loadData, page, search]);

  // Update numeric stock while preserving the saved availability state for legacy records.
  async function handleToggleStock() {
    if (!toggleTarget) return;
    const quantity = Number(stockQuantityValue);
    const threshold = thresholdValue.trim() === "" ? null : Number(thresholdValue);
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2147483647) {
      setError("Stock quantity must be a whole number between 0 and 2147483647.");
      return;
    }
    if (threshold !== null && (!Number.isSafeInteger(threshold) || threshold < 0 || threshold > 2147483647)) {
      setError("The stock alert threshold must be a non-negative whole number.");
      return;
    }
    setToggling(true);
    setError("");
    setNotice("");
    try {
      await authRequest(`admin/inventory/${toggleTarget.id}/stock`, {
        method: "PATCH",
        body: {
          quantity,
          expectedQuantity: toggleTarget.stockQuantity ?? null,
          lowStockThreshold: threshold,
          reason: stockReason.trim() || null
        },
        csrfToken
      });
      setNotice(`Stock for “${toggleTarget.name}” is now ${quantity} units.`);
      setToggleTarget(null);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to update inventory status.");
    } finally {
      setToggling(false);
    }
  }

  // Handle manager assignment
  async function handleAssignManager(e) {
    e.preventDefault();
    if (!assignTarget) return;
    setAssigning(true);
    setError("");
    setNotice("");
    try {
      const managerId = selectedManagerId ? Number(selectedManagerId) : null;
      await authRequest(`admin/products/${assignTarget.id}/manager`, {
        method: "PATCH",
        body: { managerId },
        csrfToken
      });
      setNotice(`Manager assignment updated for “${assignTarget.name}”.`);
      setAssignTarget(null);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to assign manager.");
    } finally {
      setAssigning(false);
    }
  }

  async function exportCSV() {
    setExporting(true);
    setError("");
    try {
      const exportedProducts = [];
      let totalPages = 1;
      for (let exportPage = 1; exportPage <= totalPages; exportPage += 1) {
        const query = new URLSearchParams({ page: String(exportPage), limit: "100" });
        if (search.trim()) query.set("search", search.trim());
        if (categoryFilter !== "ALL") query.set("category", categoryFilter);
        if (stockFilter !== "ALL") {
          query.set("inStock", stockFilter === "IN_STOCK" ? "true" : "false");
        }
        const response = await authRequest(`admin/inventory?${query.toString()}`, {
          includeEnvelope: true
        });
        if (!Array.isArray(response?.data) || !response?.pagination) {
          throw new Error("The inventory export response was invalid.");
        }
        exportedProducts.push(...response.data);
        totalPages = response.pagination.totalPages;
      }
      if (!exportedProducts.length) return;
      const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
      const headers = ["Product ID", "Product Name", "Category", "Price (INR)", "Stock Quantity", "Low-stock Threshold", "Availability", "Assigned Manager"];
      const rows = exportedProducts.map((product) => [
        product.id,
        quote(product.name),
        quote(product.category),
        product.price,
        product.stockQuantity ?? "",
        product.lowStockThreshold ?? "",
        product.inStock ? "IN_STOCK" : "OUT_OF_STOCK",
        quote(product.manager?.name || "Unassigned")
      ]);
      const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
      const link = document.createElement("a");
      const objectUrl = URL.createObjectURL(new Blob([csvContent], { type: "text/csv;charset=utf-8" }));
      link.href = objectUrl;
      link.download = `shopsphere-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (err) {
      setError(err.message || "The inventory export could not be created.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Inventory Management
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Manage product availability and staff assignments. This catalog tracks an in-stock flag, not numeric quantities; low-stock thresholds and stock history are not available.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCSV}
            disabled={!products.length || exporting || status === "loading"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
          >
            <Download size={13} />
            <span>{exporting ? "Preparing CSV…" : "Export filtered CSV"}</span>
          </button>

          <Link
            href="/admin/products"
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            <Plus size={13} />
            <span>Add Product</span>
          </Link>

          <button
            type="button"
            onClick={() => loadData()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw size={13} className={status === "loading" ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} className="text-emerald-600 hover:text-emerald-900">
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-rose-600 hover:text-rose-900">
            <X size={14} />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Catalog Products"
          value={summary?.total ?? "—"}
          description="Products in the catalog"
          icon={Boxes}
        />
        <StatCard
          title="In Stock Items"
          value={summary?.inStock ?? "—"}
          description="Ready for customer purchase"
          icon={CheckCircle2}
        />
        <StatCard
          title="Out of Stock Items"
          value={summary?.outOfStock ?? "—"}
          description="Currently unavailable for checkout"
          icon={AlertTriangle}
        />
        <StatCard
          title="Stock Health Rate"
          value={summary ? `${summary.availabilityRate}%` : "—"}
          description="Products currently available"
          icon={Package}
        />
        <StatCard
          title="Known Stock Units"
          value={summary?.totalKnownStockUnits ?? "—"}
          description="Sum of initialized product quantities"
          icon={Boxes}
        />
        <StatCard
          title="Needs Initial Count"
          value={summary?.unknownQuantityCount ?? "—"}
          description="Legacy products with unknown quantities"
          icon={AlertTriangle}
        />
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search products by title or category..."
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50/50 pl-9 pr-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-zinc-200 bg-zinc-50/50 px-2.5 py-1.5 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 focus:border-zinc-900 focus:outline-hidden"
          >
            <option value="ALL">All Categories</option>
            {categories.map((category) => (
              <option key={category.name} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>

          {/* Stock Filter */}
          <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50/50 p-1 text-xs dark:border-zinc-800 dark:bg-zinc-900">
            {["ALL", "IN_STOCK", "OUT_OF_STOCK"].map((flt) => (
              <button
                key={flt}
                type="button"
                onClick={() => {
                  setStockFilter(flt);
                  setPage(1);
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition-all ${
                  stockFilter === flt
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {flt === "ALL" ? "All" : flt === "IN_STOCK" ? "In Stock" : "Out of Stock"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-2xs overflow-hidden dark:border-zinc-800 dark:bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-850 dark:bg-zinc-900/40 text-[10px] font-semibold uppercase text-zinc-400 tracking-wider">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Units</th>
                <th className="px-4 py-3">Alert threshold</th>
                <th className="px-4 py-3">Stock Status</th>
                <th className="px-4 py-3">Last updated</th>
                <th className="px-4 py-3">Assigned Manager</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
              {status === "loading" && !products.length ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-zinc-400">
                    <LoaderCircle size={20} className="animate-spin mx-auto mb-2 text-zinc-400" />
                    Loading inventory records...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-zinc-400">
                    No products found matching your filters.
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                          <ProductImage
                            product={product}
                            alt={product.name}
                            fill
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {product.name}
                          </p>
                          <p className="text-[11px] text-zinc-400 font-mono">ID #{product.id}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-300">
                      {product.category}
                    </td>

                    <td className="px-4 py-3.5 font-semibold text-zinc-900 dark:text-zinc-100">
                      ₹{Number(product.price).toFixed(2)}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-700 dark:text-zinc-300">
                      {Number.isInteger(product.stockQuantity) ? product.stockQuantity : <span className="text-amber-700">Count needed</span>}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-300">
                      {Number.isInteger(product.lowStockThreshold) ? product.lowStockThreshold : "Not set"}
                    </td>

                    <td className="px-4 py-3.5">
                      {product.inStock ? (
                        <Badge variant="success">In Stock</Badge>
                      ) : (
                        <Badge variant="destructive">Out of Stock</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-300">
                      {product.updatedAt ? new Date(product.updatedAt).toLocaleDateString() : "—"}
                    </td>

                    <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-300">
                      {product.manager ? (
                        <span className="inline-flex items-center gap-1 font-medium text-zinc-800 dark:text-zinc-200">
                          <User size={12} className="text-zinc-400" />
                          {product.manager.name}
                        </span>
                      ) : (
                        <span className="text-zinc-400 italic">Unassigned</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Toggle stock availability */}
                        <button
                          type="button"
                          onClick={() => {
                            setToggleTarget(product);
                            setStockQuantityValue(Number.isInteger(product.stockQuantity) ? String(product.stockQuantity) : "");
                            setThresholdValue(Number.isInteger(product.lowStockThreshold) ? String(product.lowStockThreshold) : "");
                            setStockReason("");
                          }}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            product.inStock
                              ? "border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                              : "border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                          }`}
                        >
                          {Number.isInteger(product.stockQuantity) ? "Adjust Stock" : "Set Initial Count"}
                        </button>

                        {/* Assign manager */}
                        <button
                          type="button"
                          onClick={() => {
                            setAssignTarget(product);
                            setSelectedManagerId(product.manager?.id ? String(product.manager.id) : "");
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                        >
                          <span>Assign Manager</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 dark:border-zinc-850 text-xs text-zinc-500">
          <span>
            Showing {products.length ? (page - 1) * pageSize + 1 : 0} to{" "}
            {Math.min((page - 1) * pageSize + products.length, pagination?.total || 0)} of {pagination?.total ?? 0} items
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-300 transition-colors"
            >
              ←
            </button>
            <span className="px-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Page {page} of {Math.max(1, pagination?.totalPages || 0)}
            </span>
            <button
              type="button"
              disabled={page >= Math.max(1, pagination?.totalPages || 0) || status === "loading"}
              onClick={() => setPage((current) => Math.min(pagination?.totalPages || 1, current + 1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-300 transition-colors"
            >
              →
            </button>
          </div>
        </div>
      </div>

      <Modal
        isOpen={Boolean(toggleTarget)}
        onClose={() => setToggleTarget(null)}
        title={Number.isInteger(toggleTarget?.stockQuantity) ? "Adjust Product Stock" : "Set Initial Stock Count"}
        size="sm"
      >
        {toggleTarget && (
          <div className="space-y-4">
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{toggleTarget.name} · availability is set automatically from the resulting quantity.</p>
            {!Number.isInteger(toggleTarget.stockQuantity) && <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800">The previous quantity is unknown. Enter the verified count; no quantity has been inferred from the legacy availability flag.</p>}
            <label className="block text-xs font-semibold">Current quantity
              <input type="number" required min="0" max="2147483647" step="1" value={stockQuantityValue} onChange={(event) => setStockQuantityValue(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900" />
            </label>
            <label className="block text-xs font-semibold">Low-stock alert threshold
              <input type="number" min="0" max="2147483647" step="1" value={thresholdValue} onChange={(event) => setThresholdValue(event.target.value)} placeholder="Leave blank to disable" className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900" />
            </label>
            <label className="block text-xs font-semibold">Adjustment reason (optional)
              <input maxLength={500} value={stockReason} onChange={(event) => setStockReason(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900" />
            </label>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setToggleTarget(null)}
                disabled={toggling}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleToggleStock}
                disabled={toggling}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              >
                {toggling && <LoaderCircle size={13} className="animate-spin" />}
                <span>Confirm Update</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Assign Inventory Manager */}
      <Modal
        isOpen={Boolean(assignTarget)}
        onClose={() => setAssignTarget(null)}
        title={`Assign Manager — ${assignTarget?.name}`}
        size="sm"
      >
        {assignTarget && (
          <form onSubmit={handleAssignManager} className="space-y-4">
            <p className="text-xs text-zinc-500">
              Select an Inventory Manager responsible for maintaining this product’s catalog details and inventory stock.
            </p>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Assigned Manager
              </label>
              <select
                value={selectedManagerId}
                onChange={(e) => setSelectedManagerId(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="">No Manager (Unassigned)</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.email}) — {m.role}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAssignTarget(null)}
                disabled={assigning}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={assigning}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              >
                {assigning && <LoaderCircle size={13} className="animate-spin" />}
                <span>Save Assignment</span>
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
