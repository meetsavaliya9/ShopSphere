"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  Download,
  Ellipsis,
  Eye,
  FileSpreadsheet,
  History,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload
} from "lucide-react";
import { authRequest } from "../../lib/api/auth";
import { useAuth } from "../auth-provider";
import { StatCard } from "../admin/stat-card";
import { Badge } from "../admin/badge";
import { useManagerPermissions } from "./manager-panel-layout";
import AdminPagination from "../admin/admin-pagination";
import { PAGE_SIZE } from "../admin/admin-pagination";

const EMPTY_PRODUCT = { name: "", category: "", price: "", description: "" };

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(Number(value) || 0);
}

function uploadManagerProductImage(file, csrfToken, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/manager/products/image");
    request.withCredentials = true;
    request.timeout = 45000;
    request.setRequestHeader("Content-Type", file.type);
    if (csrfToken) request.setRequestHeader("X-CSRF-Token", csrfToken);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("The image upload could not reach the server."));
    request.ontimeout = () => reject(new Error("The image upload timed out. Try again."));
    request.onload = () => {
      let result;
      try {
        result = JSON.parse(request.responseText);
      } catch {
        reject(new Error("The image service returned an unreadable response."));
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(result?.error?.message || "The image could not be uploaded."));
        return;
      }
      resolve(result.data);
    };
    request.send(file);
  });
}

function AccessDenied({ children = "You do not have permission to access this section." }) {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200" role="alert">
      <h1 className="font-semibold">Access denied</h1>
      <p className="mt-2">{children}</p>
    </section>
  );
}

function ManagerDashboard({ permissions }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSummary(await authRequest("manager/dashboard"));
    } catch (requestError) {
      setError(requestError.message || "The inventory summary could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (permissions.includes("VIEW_INVENTORY_DASHBOARD")) loadSummary();
    else setLoading(false);
  }, [loadSummary, permissions]);

  if (!permissions.includes("VIEW_INVENTORY_DASHBOARD")) return <AccessDenied />;

  return (
    <section>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Operations overview</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Inventory Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">Summary of the products assigned to your account.</p>
      </div>
      {error && <p className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800" role="alert">{error}</p>}
      {loading ? (
        <p className="py-8 text-sm text-zinc-500">Loading inventory summary…</p>
      ) : summary && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {summary.statisticsVisible && summary.assignedProductCount !== null && (
            <Link href="/manager/products" className="block"><StatCard title="Assigned products" value={summary.assignedProductCount} description="Products assigned to your account" icon={Package} /></Link>
          )}
          {summary.statisticsVisible && summary.stockLevelsVisible && (
            <>
              <Link href="/manager/inventory" className="block"><StatCard title="Available products" value={summary.availableProductCount} description="Assigned products currently in stock" icon={Boxes} /></Link>
              <Link href="/manager/inventory" className="block"><StatCard title="Out of stock" value={summary.outOfStockCount} description="Assigned products unavailable for sale" icon={AlertCircle} /></Link>
              <Link href="/manager/inventory" className="block"><StatCard title="Known stock units" value={summary.totalKnownStockUnits ?? 0} description={summary.unknownQuantityProductCount ? `${summary.unknownQuantityProductCount} products need an initial count` : "Sum of initialized product quantities"} icon={Package} /></Link>
            </>
          )}
          {summary.statisticsVisible && <StatCard title="Enabled permissions" value={permissions.length} description="Access granted by your administrator" icon={Boxes} />}
        </div>
      )}
      <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
        Use the sidebar to open only the product and inventory areas enabled for your account.
      </div>
      <div className="mt-5 flex flex-wrap gap-3 text-xs font-semibold">
        {permissions.includes("VIEW_LOW_STOCK_ALERTS") && <Link href="/manager/low-stock" className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"><AlertTriangle size={14} />Inventory alerts</Link>}
        {permissions.includes("VIEW_STOCK_HISTORY") && <Link href="/manager/stock-history" className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"><History size={14} />Stock history</Link>}
        {permissions.includes("VIEW_INVENTORY_REPORTS") && <Link href="/manager/reports" className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"><FileSpreadsheet size={14} />Inventory reports</Link>}
      </div>
      {permissions.includes("VIEW_ORDERS") && summary?.recentActivity && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold">Recent assigned-product orders</h2>
          <ul className="mt-3 divide-y divide-zinc-100 text-xs dark:divide-zinc-800">
            {summary.recentActivity.map((activity) => <li key={activity.id} className="flex flex-wrap justify-between gap-2 py-3"><span>Order SS-{String(activity.id).padStart(6, "0")} · {activity.status}{permissions.includes("VIEW_ORDER_DETAILS") && activity.items?.length ? ` · ${activity.items.map((item) => `${item.productName} × ${item.quantity}`).join(", ")}` : ""}</span><time>{new Date(activity.createdAt).toLocaleDateString()}</time></li>)}
            {summary.recentActivity.length === 0 && <li className="py-3 text-zinc-500">No recent orders.</li>}
          </ul>
        </div>
      )}
      {permissions.includes("VIEW_STOCK_HISTORY") && summary?.recentStockUpdates && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Recent stock updates</h2><Link href="/manager/stock-history" className="text-xs font-semibold underline">View history</Link></div>
          <ul className="mt-3 divide-y divide-zinc-100 text-xs dark:divide-zinc-800">
            {summary.recentStockUpdates.map((entry) => <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-3"><span>{entry.productName} · {entry.previousQuantity === null ? "Initial count" : `${entry.previousQuantity} → ${entry.newQuantity}`} units{entry.changedBy?.name ? ` · ${entry.changedBy.name}` : ""}</span><time>{new Date(entry.createdAt).toLocaleString()}</time></li>)}
            {summary.recentStockUpdates.length === 0 && <li className="py-3 text-zinc-500">No stock changes have been recorded yet.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}

function ProductEditor({ product, saving, permissions, csrfToken, onSave, onCancel }) {
  const [form, setForm] = useState(product || EMPTY_PRODUCT);
  const [categories, setCategories] = useState([]);
  const [categoryStatus, setCategoryStatus] = useState("loading");
  const [categoryError, setCategoryError] = useState("");
  const [categoryRetry, setCategoryRetry] = useState(0);
  const [imageError, setImageError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const canUploadImages = permissions.includes("UPLOAD_PRODUCT_IMAGES");
  const canViewCategories = permissions.includes("VIEW_CATEGORIES") ||
    permissions.includes("MANAGE_CATEGORIES");

  useEffect(() => {
    setForm(product || EMPTY_PRODUCT);
  }, [product]);

  useEffect(() => {
    if (!canViewCategories) {
      setCategoryStatus("denied");
      return undefined;
    }
    let active = true;
    setCategoryStatus("loading");
    setCategoryError("");
    authRequest("manager/categories")
      .then((result) => {
        if (!Array.isArray(result)) {
          throw new Error("The category service returned an invalid response.");
        }
        if (active) {
          setCategories(result);
          setCategoryStatus("ready");
        }
      })
      .catch((error) => {
        if (active) {
          setCategoryError(error.message || "Available categories could not be loaded.");
          setCategoryStatus("error");
        }
      });
    return () => { active = false; };
  }, [canViewCategories, categoryRetry]);

  function submit(event) {
    event.preventDefault();
    if (categoryStatus !== "ready" || !categories.some((category) => category.name === form.category)) {
      setCategoryError("Select a category from the available options before saving.");
      return;
    }
    onSave({
      name: form.name,
      category: form.category,
      price: Number(form.price),
      description: form.description,
      ...(canUploadImages ? {
        imageUrl: form.imageUrl || null,
        imagePublicId: form.imagePublicId || null
      } : {})
    });
  }

  async function uploadImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Product images must be 5 MB or smaller.");
      return;
    }
    setImageError("");
    setUploading(true);
    setUploadProgress(0);
    try {
      const image = await uploadManagerProductImage(file, csrfToken, setUploadProgress);
      setForm((current) => ({ ...current, ...image }));
    } catch (error) {
      setImageError(error.message || "The image could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-6 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-950">
      <label className="text-xs text-zinc-600 dark:text-zinc-300">Product name
        <input required maxLength={191} value={form.name || ""} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800" />
      </label>
      <label className="text-xs text-zinc-600 dark:text-zinc-300">Category
        <select required disabled={categoryStatus !== "ready" || saving} value={form.category || ""} onChange={(event) => { setCategoryError(""); setForm((current) => ({ ...current, category: event.target.value })); }} className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-800">
          <option value="">{categoryStatus === "loading" ? "Loading categories…" : categories.length ? "Select a category" : "No categories available"}</option>
          {categories.map((category) => <option key={category.id || category.name} value={category.name}>{category.name}</option>)}
        </select>
        {categoryStatus === "denied" && <span className="mt-1 block text-[11px] text-amber-700">Category options require the View Categories permission.</span>}
        {categoryError && <span role="alert" className="mt-1 block text-[11px] text-rose-700">{categoryError} {categoryStatus === "error" && <button type="button" onClick={() => setCategoryRetry((attempt) => attempt + 1)} className="font-semibold underline">Retry</button>}</span>}
      </label>
      <label className="text-xs text-zinc-600 dark:text-zinc-300">Price (INR)
        <input required type="number" min="0" step="0.01" value={form.price ?? ""} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800" />
      </label>
      <label className="text-xs text-zinc-600 dark:text-zinc-300">Description
        <input value={form.description || ""} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800" />
      </label>
      {canUploadImages && <div className="text-xs text-zinc-600 dark:text-zinc-300">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <Upload size={14} />{uploading ? `Uploading ${uploadProgress}%` : "Upload product image"}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={uploadImage} className="sr-only" />
        </label>
        {form.imageUrl && <img src={form.imageUrl} alt="Product preview" className="mt-3 h-24 w-24 rounded-lg object-cover" />}
        {imageError && <p role="alert" className="mt-2 text-rose-700">{imageError}</p>}
      </div>}
      <div className="flex gap-2 sm:col-span-2">
        <button disabled={saving || uploading || categoryStatus !== "ready" || !form.category || !categories.some((category) => category.name === form.category)} className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
          <Save size={14} />{saving ? "Saving…" : product ? "Save changes" : "Create product"}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="rounded-lg border border-zinc-200 px-4 py-2 text-xs dark:border-zinc-800">Cancel</button>}
      </div>
    </form>
  );
}

function ManagerStockEditor({ product, saving, canManageAlerts, onSave }) {
  const [units, setUnits] = useState(product.stockQuantity === null ? "" : "1");
  const [threshold, setThreshold] = useState(product.lowStockThreshold ?? "");
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    setUnits(product.stockQuantity === null ? "" : "1");
    setThreshold(product.lowStockThreshold ?? "");
    setReason("");
    setValidationError("");
  }, [product.id, product.stockQuantity, product.lowStockThreshold]);

  function submit(event) {
    event.preventDefault();
    setValidationError("");
    const parsedUnits = Number(units);
    if (!Number.isSafeInteger(parsedUnits) || parsedUnits < 0 || parsedUnits > 2147483647) {
      setValidationError("Enter a valid non-negative whole number of units to add.");
      return;
    }
    if (!reason.trim()) {
      setValidationError("Enter a reason for this stock update.");
      return;
    }
    const input = {
      unitsToAdd: parsedUnits,
      expectedQuantity: product.stockQuantity ?? null,
      reason: reason.trim()
    };
    if (canManageAlerts) {
      const parsedThreshold = threshold === "" ? null : Number(threshold);
      if (parsedThreshold !== null && (!Number.isSafeInteger(parsedThreshold) || parsedThreshold < 0 || parsedThreshold > 2147483647)) {
        setValidationError("Enter a valid whole-number threshold or leave it blank.");
        return;
      }
      input.lowStockThreshold = parsedThreshold;
    }
    onSave(product, input);
  }

  return (
    <form onSubmit={submit} className="min-w-[250px]">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-[10px] text-zinc-500">Units to add
          <input type="number" required min="0" max="2147483647" step="1" value={units} onChange={(event) => setUnits(event.target.value)} className="w-20 rounded-md border border-zinc-200 bg-transparent px-2 py-1.5 text-xs dark:border-zinc-700" />
        </label>
        {canManageAlerts && <label className="grid gap-1 text-[10px] text-zinc-500">Alert at
          <input type="number" min="0" max="2147483647" step="1" value={threshold} onChange={(event) => setThreshold(event.target.value)} placeholder="off" className="w-20 rounded-md border border-zinc-200 bg-transparent px-2 py-1.5 text-xs dark:border-zinc-700" />
        </label>}
        <label className="grid min-w-32 flex-1 gap-1 text-[10px] text-zinc-500">Reason
          <input required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="min-w-32 rounded-md border border-zinc-200 bg-transparent px-2 py-1.5 text-xs dark:border-zinc-700" />
        </label>
        <button type="submit" disabled={saving} className="rounded-md bg-zinc-900 px-2.5 py-1.5 text-[10px] font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
          {product.stockQuantity === null || product.stockQuantity === undefined ? "Initialize stock" : "Add stock"}
        </button>
      </div>
      {validationError && <p className="mt-1 text-[10px] text-rose-700" role="alert">{validationError}</p>}
    </form>
  );
}

function ManagerProducts({ permissions, inventoryOnly = false }) {
  const { user, csrfToken } = useAuth();
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const canViewProducts = permissions.includes("VIEW_PRODUCTS");
  const canViewStock = permissions.includes("VIEW_STOCK_LEVELS");
  const canCreate = !inventoryOnly && permissions.includes("CREATE_PRODUCTS");
  const canEdit = !inventoryOnly && permissions.includes("EDIT_PRODUCTS") && canViewProducts;
  const canUpdateInventory = permissions.includes("UPDATE_INVENTORY") && canViewStock;
  const canManageAlerts = permissions.includes("MANAGE_STOCK_ALERTS");
  const canDelete = !inventoryOnly && permissions.includes("DELETE_PRODUCTS");
  const canManageProducts = canEdit || canUpdateInventory || canDelete;
  const canListProducts = canViewProducts || canViewStock;
  const canAccess = inventoryOnly
    ? canViewStock
    : canViewProducts || canCreate;

  async function viewProductDetails(product) {
    setDetailError("");
    try {
      setSelectedDetails(await authRequest(`manager/products/${product.id}`));
    } catch (requestError) {
      setDetailError(requestError.message || "Product details could not be loaded.");
    }
  }

  const loadProducts = useCallback(async (targetPage = page) => {
    setStatus("loading");
    setError("");
    setAccessDenied(false);
    try {
      const query = new URLSearchParams({ page: String(targetPage), limit: String(PAGE_SIZE) });
      if (search.trim()) query.set("search", search.trim());
      if (categoryFilter.trim()) query.set("category", categoryFilter.trim());
      if (stockFilter !== "ALL") query.set("inStock", stockFilter === "IN_STOCK" ? "true" : "false");
      query.set("sortBy", sortBy);
      query.set("order", sortOrder);
      const result = await authRequest(`manager/products?${query.toString()}`, {
        includeEnvelope: true
      });
      if (!Array.isArray(result?.data)) throw new Error("The product response was invalid.");
      setProducts(result.data);
      setPagination(result.pagination || null);
      setPage(targetPage);
      setStatus("ready");
    } catch (requestError) {
      if (requestError.status === 403) {
        setAccessDenied(true);
        setStatus("ready");
        return;
      }
      setError(requestError.message || "Products could not be loaded.");
      setStatus("error");
    }
  }, [categoryFilter, page, search, sortBy, sortOrder, stockFilter]);

  useEffect(() => {
    if (!canViewProducts && !canViewStock) {
      setStatus("ready");
      return undefined;
    }
    const timer = window.setTimeout(() => loadProducts(page), 250);
    return () => window.clearTimeout(timer);
  }, [canAccess, canViewProducts, canViewStock, loadProducts, page]);

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, stockFilter, sortBy, sortOrder]);

  async function saveProduct(input) {
    if (savingLock.current) return;
    savingLock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (editing) {
        await authRequest(`manager/products/${editing.id}`, {
          method: "PUT",
          body: input,
          csrfToken
        });
        setNotice("Product details updated.");
      } else {
        await authRequest("manager/products", {
          method: "POST",
          body: input,
          csrfToken
        });
        setNotice("Product created and assigned to your inventory.");
      }
      setEditing(null);
      setCreating(false);
      if (canViewProducts || canViewStock) await loadProducts();
    } catch (saveError) {
      setError(saveError.message || "The product could not be saved.");
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  }

  async function saveAvailability(product, input) {
    if (savingLock.current) return;
    savingLock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await authRequest(`manager/products/${product.id}/stock`, {
        method: "PATCH",
        body: input,
        csrfToken
      });
      setNotice(`Inventory status updated for ${product.name}.`);
      setSelectedStock(null);
      await loadProducts();
    } catch (saveError) {
      setError(saveError.message || "Inventory status could not be updated.");
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  }

  async function deleteProduct(product) {
    if (savingLock.current) return;
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    savingLock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await authRequest(`manager/products/${product.id}`, { method: "DELETE", csrfToken });
      setNotice(`${product.name} was deleted.`);
      await loadProducts(page);
    } catch (deleteError) {
      setError(deleteError.message || "The product could not be deleted.");
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  }

  if (!canAccess) {
    return <AccessDenied />;
  }
  if (accessDenied) return <AccessDenied />;

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Catalog</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{inventoryOnly ? "Inventory" : "Products"}</h1>
          <p className="mt-1 text-sm text-zinc-500">Products assigned to your account.</p>
        </div>
        <div className="flex gap-2">
          {canCreate && <button type="button" onClick={() => { setEditing(null); setCreating(true); }} className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"><Plus size={14} />Add product</button>}
          <button type="button" onClick={loadProducts} className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800"><RefreshCw size={14} />Refresh</button>
        </div>
      </div>
      {notice && <p className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800" role="status">{notice}</p>}
      {error && <p className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800" role="alert">{error}</p>}
      {canListProducts && <form onSubmit={(event) => { event.preventDefault(); loadProducts(1); }} className="mb-4 flex flex-wrap gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search products</span>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name or category" className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-xs dark:border-zinc-800 dark:bg-zinc-950" />
        </label>
        <input aria-label="Filter by category" value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }} placeholder="Exact category" className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950" />
        {canViewStock && <select value={stockFilter} onChange={(event) => { setStockFilter(event.target.value); setPage(1); }} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950" aria-label="Filter by stock status">
          <option value="ALL">All stock statuses</option><option value="IN_STOCK">In stock</option><option value="OUT_OF_STOCK">Out of stock</option>
        </select>}
        <select aria-label="Sort products by" value={`${sortBy}:${sortOrder}`} onChange={(event) => { const [field, direction] = event.target.value.split(":"); setSortBy(field); setSortOrder(direction); setPage(1); }} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950">
          <option value="createdAt:desc">Newest first</option><option value="createdAt:asc">Oldest first</option><option value="name:asc">Name A–Z</option><option value="name:desc">Name Z–A</option><option value="price:asc">Price low to high</option><option value="price:desc">Price high to low</option>
        </select>
        <button className="rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800">Search</button>
      </form>}
      {creating && <ProductEditor permissions={permissions} csrfToken={csrfToken} saving={saving} onSave={saveProduct} onCancel={() => setCreating(false)} />}
      {editing && <ProductEditor product={editing} permissions={permissions} csrfToken={csrfToken} saving={saving} onSave={saveProduct} onCancel={() => setEditing(null)} />}
      {selectedStock && <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-sm font-semibold">Update inventory</h2><p className="mt-1 text-xs text-zinc-500">{selectedStock.name} · Current count: {Number.isInteger(selectedStock.stockQuantity) ? selectedStock.stockQuantity : "Unknown"}</p></div>
          <button type="button" disabled={saving} onClick={() => setSelectedStock(null)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-zinc-800">Cancel</button>
        </div>
        <ManagerStockEditor product={selectedStock} saving={saving} canManageAlerts={canManageAlerts} onSave={saveAvailability} />
      </div>}
      {detailError && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{detailError}</p>}
      {selectedDetails && <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{selectedDetails.name}</h2><p className="mt-1 text-xs text-zinc-500">{selectedDetails.category || "Category unavailable"}{selectedDetails.inStock === undefined ? "" : ` · ${selectedDetails.inStock ? "In stock" : "Out of stock"}`}</p><p className="mt-3 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">{selectedDetails.description || "No product description is available."}</p></div><button type="button" onClick={() => setSelectedDetails(null)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs dark:border-zinc-800">Close</button></div></div>}
      {status === "loading" && <p className="py-8 text-sm text-zinc-500">Loading assigned products…</p>}
      {status === "error" && <button type="button" onClick={loadProducts} className="rounded-lg border border-zinc-200 px-4 py-2 text-xs dark:border-zinc-800">Try again</button>}
      {status === "ready" && canListProducts && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3 font-semibold">Product</th>
                {canViewProducts && <th className="px-4 py-3 font-semibold">Category</th>}
                {canViewProducts && <th className="px-4 py-3 font-semibold">Price</th>}
                {canViewStock && <th className="px-4 py-3 font-semibold">Availability</th>}
                {canViewStock && <th className="px-4 py-3 font-semibold">Units</th>}
                {canViewStock && canManageAlerts && <th className="px-4 py-3 font-semibold">Alert at</th>}
                <th className="px-4 py-3 font-semibold">Updated</th>
                {(canManageProducts || permissions.includes("VIEW_PRODUCT_DETAILS")) && <th className="w-48 px-4 py-3 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {products.map((product) => {
                const isOwner = Boolean(user?.id && (product.managerId === user.id || product.manager?.id === user.id));
                const canEditThisProduct = canEdit && isOwner;
                const canDeleteThisProduct = canDelete && isOwner;
                const canShowActions = permissions.includes("VIEW_PRODUCT_DETAILS") || canEditThisProduct || canDeleteThisProduct;
                return (
                  <tr key={product.id} className="text-zinc-700 dark:text-zinc-300">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {product.imageUrl && <img src={product.imageUrl} alt="" className="h-10 w-10 rounded-md object-cover" />}
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{product.name}</p>
                            {!product.managerId && (
                              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                Store
                              </span>
                            )}
                          </div>
                          {permissions.includes("VIEW_PRODUCT_DETAILS") && product.description && <p className="mt-1 max-w-sm text-zinc-500">{product.description}</p>}
                        </div>
                      </div>
                    </td>
                    {canViewProducts && <td className="px-4 py-3">{product.category}</td>}
                    {canViewProducts && <td className="px-4 py-3">{formatMoney(product.price)}</td>}
                    {canViewStock && <td className="px-4 py-3"><Badge variant={product.inStock ? "success" : "destructive"}>{product.inStock ? "In stock" : "Out of stock"}</Badge></td>}
                    {canViewStock && <td className="px-4 py-3">{Number.isInteger(product.stockQuantity) ? product.stockQuantity : <span className="text-amber-700">Count needed</span>}</td>}
                    {canViewStock && canManageAlerts && <td className="px-4 py-3">{Number.isInteger(product.lowStockThreshold) ? product.lowStockThreshold : "Not set"}</td>}
                    <td className="px-4 py-3">{product.updatedAt ? new Date(product.updatedAt).toLocaleDateString() : "—"}</td>
                    {(canManageProducts || permissions.includes("VIEW_PRODUCT_DETAILS")) && (
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          {canUpdateInventory && <button
                            type="button"
                            title={`Update stock for ${product.name}`}
                            aria-label={`Update stock for ${product.name}`}
                            disabled={saving}
                            onClick={() => setSelectedStock(product)}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 py-2 text-[11px] font-semibold hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                          ><Boxes size={14} /><span>Stock</span></button>}
                          {canShowActions && <details className="relative">
                            <summary
                              aria-label={`Actions for ${product.name}`}
                              title={`Actions for ${product.name}`}
                              className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 py-2 text-[11px] font-semibold hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-zinc-700 dark:hover:bg-zinc-900 [&::-webkit-details-marker]:hidden"
                            ><Ellipsis size={15} /><span>Actions</span></summary>
                            <div className="absolute right-0 z-20 mt-1 min-w-40 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
                              {permissions.includes("VIEW_PRODUCT_DETAILS") && <button type="button" onClick={(event) => { event.currentTarget.closest("details").open = false; viewProductDetails(product); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900"><Eye size={14} />View details</button>}
                              {canEditThisProduct && <button type="button" disabled={saving} onClick={(event) => { event.currentTarget.closest("details").open = false; setSelectedStock(null); setCreating(false); setEditing(product); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-900"><Pencil size={14} />Edit product</button>}
                              {canDeleteThisProduct && <button type="button" disabled={saving} onClick={(event) => { event.currentTarget.closest("details").open = false; deleteProduct(product); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:hover:bg-rose-950/40"><Trash2 size={14} />Delete product</button>}
                            </div>
                          </details>}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {products.length === 0 && <tr><td colSpan={2 + Number(canViewProducts) * 2 + Number(canViewStock) * 2 + Number(canViewStock && canManageAlerts) + Number(canManageProducts || permissions.includes("VIEW_PRODUCT_DETAILS"))} className="px-4 py-10 text-center text-zinc-500">No products match these filters.</td></tr>}
            </tbody>
          </table>
          <AdminPagination
            currentPage={page}
            totalItems={pagination?.total || 0}
            onPageChange={loadProducts}
          />
        </div>
      )}
    </section>
  );
}

function ManagerCategories({ permissions }) {
  const { csrfToken } = useAuth();
  const [categories, setCategories] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const canManage = permissions.includes("MANAGE_CATEGORIES");

  const load = useCallback(async (targetPage = page) => {
    setStatus("loading");
    setError("");
    try {
      const query = new URLSearchParams({ page: String(targetPage), limit: String(PAGE_SIZE) });
      const result = await authRequest(`manager/categories?${query.toString()}`, { includeEnvelope: true });
      if (!Array.isArray(result?.data)) {
        throw new Error("The categories response was invalid.");
      }
      setCategories(result.data);
      setPagination(result.pagination || null);
      setPage(targetPage);
      setStatus("ready");
    } catch (requestError) {
      setError(requestError.message || "Categories could not be loaded.");
      setStatus("error");
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  async function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await authRequest("manager/categories", {
        method: "POST",
        body: { name: form.get("name"), description: form.get("description") || null },
        csrfToken
      });
      event.currentTarget.reset();
      setNotice("Category created.");
      await load();
    } catch (requestError) {
      setError(requestError.message || "The category could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(category) {
    if (!category.id || !window.confirm(`Delete ${category.name}?`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await authRequest(`manager/categories/${category.id}`, { method: "DELETE", csrfToken });
      setNotice(`${category.name} deleted.`);
      await load();
    } catch (requestError) {
      setError(requestError.message || "The category could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  async function rename(category) {
    if (!category.id) return;
    const name = window.prompt("New category name", category.name);
    if (!name || name.trim() === category.name) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await authRequest(`manager/categories/${category.id}`, {
        method: "PATCH",
        body: { name: name.trim() },
        csrfToken
      });
      setNotice(`Category renamed to ${name.trim()}.`);
      await load();
    } catch (requestError) {
      setError(requestError.message || "The category could not be renamed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Catalog</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Categories</h1>
        <p className="mt-1 text-sm text-zinc-500">Categories used by products assigned to your account.</p>
      </div>
      {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{error}</p>}
      {canManage && <form onSubmit={save} className="mb-5 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-[1fr_2fr_auto] dark:border-zinc-800 dark:bg-zinc-950">
        <label className="text-xs">Category name<input name="name" required maxLength={100} className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800" /></label>
        <label className="text-xs">Description<input name="description" maxLength={500} className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800" /></label>
        <button disabled={saving} className="self-end rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">{saving ? "Saving…" : "Add category"}</button>
      </form>}
      {status === "loading" && <p className="py-8 text-sm text-zinc-500">Loading categories…</p>}
      {status === "error" && <button type="button" onClick={load} className="rounded-lg border px-4 py-2 text-xs">Retry</button>}
      {status === "ready" && <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="border-b bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Slug</th><th className="px-4 py-3">Assigned products</th>{canManage && <th className="px-4 py-3">Actions</th>}</tr></thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {categories.map((category) => <tr key={category.id || category.name}>
              <td className="px-4 py-3 font-medium">{category.name}</td><td className="px-4 py-3">{category.slug || "—"}</td><td className="px-4 py-3">{category.productCount}</td>
              {canManage && <td className="px-4 py-3">{category.id ? <div className="flex gap-3"><button type="button" disabled={saving} onClick={() => rename(category)} className="font-semibold underline disabled:opacity-50">Rename</button><button type="button" disabled={saving} onClick={() => remove(category)} className="font-semibold text-rose-700 underline disabled:opacity-50">Delete</button></div> : <span className="text-zinc-500">Legacy category</span>}</td>}
            </tr>)}
            {categories.length === 0 && <tr><td colSpan={canManage ? 4 : 3} className="px-4 py-8 text-center text-zinc-500">No categories are used by your assigned products.</td></tr>}
          </tbody>
        </table>
        <AdminPagination
          currentPage={page}
          totalItems={pagination?.total || 0}
          onPageChange={load}
        />
      </div>}
    </section>
  );
}

function ManagerOrders({ permissions }) {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const includeDetails = permissions.includes("VIEW_ORDER_DETAILS");

  const load = useCallback(async (targetPage = page) => {
    setStatus("loading");
    setError("");
    try {
      const query = new URLSearchParams({ page: String(targetPage), limit: String(PAGE_SIZE) });
      const result = await authRequest(`manager/orders?${query.toString()}`, { includeEnvelope: true });
      setOrders(Array.isArray(result?.data) ? result.data : []);
      setPagination(result.pagination || null);
      setPage(targetPage);
      setStatus("ready");
    } catch (requestError) {
      setError(requestError.message || "Orders could not be loaded.");
      setStatus("error");
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <section>
      <div className="mb-6"><p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Sales</p><h1 className="mt-2 text-2xl font-bold tracking-tight">Orders</h1><p className="mt-1 text-sm text-zinc-500">Orders containing products assigned to your account.</p></div>
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{error}</p>}
      {status === "loading" && <p className="py-8 text-sm text-zinc-500">Loading orders…</p>}
      {status === "error" && <button type="button" onClick={load} className="rounded-lg border px-4 py-2 text-xs">Retry</button>}
      {status === "ready" && <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="border-b bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Date</th>{includeDetails && <th className="px-4 py-3">Assigned items</th>}</tr></thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {orders.map((order) => <tr key={order.id}>
              <td className="px-4 py-3 font-medium">SS-{String(order.id).padStart(6, "0")}</td><td className="px-4 py-3">{order.status}</td><td className="px-4 py-3">{formatMoney(order.assignedItemsTotal)}</td><td className="px-4 py-3">{new Date(order.createdAt).toLocaleDateString()}</td>
              {includeDetails && <td className="px-4 py-3">{order.items?.map((item) => `${item.productName} × ${item.quantity}`).join(", ") || "—"}</td>}
            </tr>)}
            {orders.length === 0 && <tr><td colSpan={includeDetails ? 5 : 4} className="px-4 py-8 text-center text-zinc-500">No orders include your assigned products.</td></tr>}
          </tbody>
        </table>
        <AdminPagination
          currentPage={page}
          totalItems={pagination?.total || 0}
          onPageChange={load}
        />
      </div>}
    </section>
  );
}

function ManagerInventoryPage({ section, permissions }) {
  const config = {
    alerts: {
      title: "Low Stock Alerts",
      permission: "VIEW_LOW_STOCK_ALERTS",
      endpoint: "manager/inventory/alerts"
    },
    history: {
      title: "Stock History",
      permission: "VIEW_STOCK_HISTORY",
      endpoint: "manager/inventory/history"
    },
    reports: {
      title: "Inventory Reports",
      permission: "VIEW_INVENTORY_REPORTS",
      endpoint: "manager/inventory/reports"
    }
  }[section];
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [alertFilter, setAlertFilter] = useState("ALL");
  const [alertSort, setAlertSort] = useState("name_asc");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const permitted = permissions.includes(config.permission);

  const load = useCallback(async (targetPage = 1) => {
    setStatus("loading");
    setError("");
    try {
      const query = new URLSearchParams({ page: String(targetPage), limit: String(PAGE_SIZE) });
      if (search.trim()) query.set("search", search.trim());
      if (section === "reports" && stockFilter !== "ALL") {
        query.set("inStock", stockFilter === "IN_STOCK" ? "true" : "false");
      }
      if (section === "alerts") {
        const [sortBy, order] = alertSort.split("_");
        query.set("alertType", alertFilter);
        query.set("sortBy", sortBy === "updated" ? "updatedAt" : sortBy === "stock" ? "stockQuantity" : sortBy);
        query.set("order", order);
      }
      const resultData = await authRequest(
        `${config.endpoint}?${query}`
      );
      if (section === "alerts" && !Array.isArray(resultData?.alerts)) {
        throw new Error("The inventory alert response was invalid.");
      }
      if (section === "history" && !Array.isArray(resultData?.entries)) {
        throw new Error("The stock history response was invalid.");
      }
      if (section === "reports" && !Array.isArray(resultData?.products)) {
        throw new Error("The inventory report response was invalid.");
      }
      setResult(resultData);
      setPagination(resultData?.pagination || null);
      setPage(targetPage);
      setStatus("ready");
    } catch (requestError) {
      setError(requestError.message || "The inventory information could not be loaded.");
      setStatus("error");
    }
  }, [alertFilter, alertSort, config.endpoint, search, section, stockFilter]);

  useEffect(() => {
    if (permitted) load(1);
  }, [load, permitted]);

  useEffect(() => {
    setPage(1);
  }, [search, stockFilter, alertFilter, alertSort]);

  if (!permitted) {
    return <AccessDenied>{config.title} access has not been enabled.</AccessDenied>;
  }

  async function exportReport() {
    setExporting(true);
    setExportError("");
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (stockFilter !== "ALL") query.set("inStock", stockFilter === "IN_STOCK" ? "true" : "false");
      const response = await fetch(`/api/manager/inventory/reports/export?${query}`, {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (!response.ok) {
        let payload;
        try {
          payload = await response.json();
        } catch {
          throw new Error("The report export returned an unreadable response.");
        }
        throw new Error(payload?.error?.message || "The inventory report could not be exported.");
      }
      const file = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = file;
      link.download = "shopsphere-inventory-report.csv";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(file);
    } catch (requestError) {
      setExportError(requestError.message || "The inventory report could not be exported.");
    } finally {
      setExporting(false);
    }
  }

  const rows = section === "alerts"
    ? result?.alerts || []
    : section === "history"
      ? result?.entries || []
      : result?.products || [];
  const stockStats = section === "reports" ? result : null;

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Inventory</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{config.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {section === "alerts"
              ? "Review out-of-stock products and products below their configured stock thresholds."
              : section === "history"
                ? "Review timestamped stock changes recorded for products assigned to your account."
                : "Quantity and availability summary for products assigned to your account."}
          </p>
        </div>
        {section === "reports" && permissions.includes("EXPORT_INVENTORY_REPORTS") && (
          <button type="button" onClick={exportReport} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
            <Download size={14} />{exporting ? "Exporting…" : "Export CSV"}
          </button>
        )}
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{error}</p>}
      {exportError && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{exportError}</p>}
      {section === "alerts" && result && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          Legacy products with unknown counts or no configured threshold are not treated as low-stock. Their existing availability flag is preserved and out-of-stock items remain visible.
        </p>
      )}
      {section === "alerts" && status === "ready" && result && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <StatCard title="Low stock" value={result.lowStockCount} description="At or below configured threshold" icon={AlertTriangle} />
          <StatCard title="Out of stock" value={result.outOfStockCount} description="Unavailable or zero units" icon={AlertCircle} />
        </div>
      )}
      <form onSubmit={(event) => { event.preventDefault(); load(1); }} className="mb-4 flex flex-wrap gap-2">
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">Search products</span>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assigned products" className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-xs dark:border-zinc-800 dark:bg-zinc-950" />
          </label>
          {section === "reports" && (
            <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950" aria-label="Filter report by availability">
              <option value="ALL">All availability</option>
              <option value="IN_STOCK">In stock</option>
              <option value="OUT_OF_STOCK">Out of stock</option>
            </select>
          )}
          {section === "alerts" && (
            <>
              <select value={alertFilter} onChange={(event) => setAlertFilter(event.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950" aria-label="Filter alerts">
                <option value="ALL">All alerts</option>
                <option value="LOW_STOCK">Low stock</option>
                <option value="OUT_OF_STOCK">Out of stock</option>
              </select>
              <select value={alertSort} onChange={(event) => setAlertSort(event.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950" aria-label="Sort alerts">
                <option value="name_asc">Name A–Z</option>
                <option value="name_desc">Name Z–A</option>
                <option value="stock_asc">Lowest stock</option>
                <option value="stock_desc">Highest stock</option>
                <option value="updated_desc">Recently updated</option>
              </select>
            </>
          )}
          <button disabled={status === "loading"} className="rounded-lg border border-zinc-200 px-3 py-2 text-xs disabled:opacity-50 dark:border-zinc-800">Search</button>
      </form>

      {status === "loading" && <p className="py-8 text-sm text-zinc-500">Loading {config.title.toLowerCase()}…</p>}
      {status === "error" && <button type="button" onClick={() => load(page)} className="rounded-lg border px-4 py-2 text-xs">Try again</button>}

      {section === "reports" && status === "ready" && stockStats && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Assigned products" value={stockStats.assignedProductCount} description="Products assigned to your account" icon={Package} />
          <StatCard title="In stock" value={stockStats.availableProductCount} description="Products marked available" icon={Boxes} />
          <StatCard title="Out of stock" value={stockStats.outOfStockCount} description="Products marked unavailable" icon={AlertCircle} />
          <StatCard title="Known stock units" value={stockStats.totalKnownStockUnits ?? 0} description={stockStats.unknownQuantityProductCount ? `${stockStats.unknownQuantityProductCount} counts not initialized` : "All product counts initialized"} icon={Package} />
        </div>
      )}

      {status === "ready" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              {section === "history"
                ? <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Previous</th><th className="px-4 py-3">New</th><th className="px-4 py-3">Change</th><th className="px-4 py-3">Action / reason</th><th className="px-4 py-3">Changed by / time</th></tr>
                : <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Units</th><th className="px-4 py-3">Threshold</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">{section === "alerts" ? "Alert timestamp" : "Last updated"}</th></tr>}
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((row) => section === "history" ? (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium">{row.productName}</td>
                  <td className="px-4 py-3">{row.previousQuantity ?? "Unknown"}</td>
                  <td className="px-4 py-3">{row.newQuantity ?? "—"}</td>
                  <td className="px-4 py-3">{row.quantityChange === null ? "—" : `${row.quantityChange > 0 ? "+" : ""}${row.quantityChange}`}</td>
                  <td className="px-4 py-3">{row.actionType}{row.reason ? ` · ${row.reason}` : ""}</td>
                  <td className="px-4 py-3">{row.changedBy?.name || "Former account"} · {new Date(row.createdAt).toLocaleString()}</td>
                </tr>
              ) : (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">{row.category || "Not available with your permissions"}</td>
                  <td className="px-4 py-3">{Number.isInteger(row.stockQuantity) ? row.stockQuantity : "Unknown"}</td>
                  <td className="px-4 py-3">{Number.isInteger(row.lowStockThreshold) ? row.lowStockThreshold : "Not set"}</td>
                  <td className="px-4 py-3">{row.alertType === "LOW_STOCK" ? "Low stock" : row.alertType === "OUT_OF_STOCK" || !row.inStock ? "Out of stock" : "In stock"}</td>
                  <td className="px-4 py-3">{row.alertType === "LOW_STOCK" ? row.lowStockAlertAt ? new Date(row.lowStockAlertAt).toLocaleString() : "Not recorded" : row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-500">{section === "alerts" ? "No products are currently below configured thresholds or out of stock." : section === "history" ? "No stock changes have been recorded for your assigned products." : "No assigned products match this report."}</td></tr>}
            </tbody>
          </table>
          <AdminPagination
            currentPage={page}
            totalItems={pagination?.total || 0}
            onPageChange={load}
          />
        </div>
      )}
    </section>
  );
}

function ManagerAccount() {
  const { user, csrfToken, refreshUser, changePassword } = useAuth();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function updateProfile(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await authRequest("auth/me", {
        method: "PATCH",
        body: { name: new FormData(event.currentTarget).get("name") },
        csrfToken
      });
      await refreshUser();
      setNotice("Profile updated.");
    } catch (requestError) {
      setError(requestError.message || "Profile could not be updated.");
    }
  }

  async function updatePassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setNotice("");
    try {
      await changePassword(Object.fromEntries(new FormData(form).entries()));
      form.reset();
      setNotice("Password updated. Your session was signed out; sign in again.");
    } catch (requestError) {
      setError(requestError.message || "Password could not be updated.");
    }
  }

  return (
    <section>
      <div className="mb-6"><p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Account</p><h1 className="mt-2 text-2xl font-bold tracking-tight">Profile</h1></div>
      <div className="mb-5 rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950"><p className="font-semibold">{user?.name}</p><p className="mt-1 text-zinc-500">{user?.email}</p><p className="mt-2 text-xs text-zinc-500">Inventory Manager account</p></div>
      {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={updateProfile} className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"><h2 className="font-semibold">Update profile</h2><label className="text-xs">Display name<input name="name" required maxLength={100} defaultValue={user?.name || ""} className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800" /></label><button className="justify-self-start rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">Save profile</button></form>
        <form onSubmit={updatePassword} className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"><h2 className="font-semibold">Change password</h2><label className="text-xs">Current password<input name="currentPassword" type="password" required autoComplete="current-password" className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800" /></label><label className="text-xs">New password<input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800" /></label><button className="justify-self-start rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold dark:border-zinc-800">Change password</button></form>
      </div>
    </section>
  );
}

export function ManagerSectionPage({ section }) {
  const { permissions, status, error, reloadAccess } = useManagerPermissions();
  if (status === "loading") return <p className="py-10 text-sm text-zinc-500">Loading your access…</p>;
  if (status === "error") return <section role="alert"><p className="text-sm text-rose-700">{error}</p><button type="button" onClick={reloadAccess} className="mt-3 rounded-lg border px-3 py-2 text-xs">Retry</button></section>;
  if (section === "dashboard" || section === "") return <ManagerDashboard permissions={permissions} />;
  if (section === "products") return <ManagerProducts permissions={permissions} />;
  if (section === "inventory") return <ManagerProducts permissions={permissions} inventoryOnly />;
  if (section === "categories") {
    if (!permissions.includes("VIEW_CATEGORIES") && !permissions.includes("MANAGE_CATEGORIES")) return <AccessDenied>Category access has not been enabled.</AccessDenied>;
    return <ManagerCategories permissions={permissions} />;
  }
  if (section === "orders") {
    if (!permissions.includes("VIEW_ORDERS")) return <AccessDenied>Order access has not been enabled.</AccessDenied>;
    return <ManagerOrders permissions={permissions} />;
  }
  if (section === "low-stock") return <ManagerInventoryPage section="alerts" permissions={permissions} />;
  if (section === "stock-history") return <ManagerInventoryPage section="history" permissions={permissions} />;
  if (section === "reports") return <ManagerInventoryPage section="reports" permissions={permissions} />;
  if (section === "account") return <ManagerAccount />;
  return <AccessDenied>That Inventory Manager page does not exist or is not available.</AccessDenied>;
}
