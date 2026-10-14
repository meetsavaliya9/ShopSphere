"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAuth } from "../auth-provider";
import { useStore } from "../store-provider";
import { authRequest } from "../../lib/api/auth";
import { SalesBarChart } from "./chart-components";

const SECTION_CONFIG = {
  inventory: {
    title: "Inventory",
    description: "Review stock availability and product pricing.",
    endpoint: "admin/inventory",
    columns: ["name", "category", "price", "inStock", "manager"]
  },
  customers: {
    title: "Customers",
    description: "Review customer accounts, orders, and verified revenue.",
    endpoint: "admin/customers",
    columns: ["name", "email", "emailVerifiedAt", "totalOrders", "paidOrdersCount", "totalSpent"]
  },
  payments: {
    title: "Payments",
    description: "Review payment transactions and their associated orders.",
    endpoint: "admin/payments",
    columns: ["id", "orderId", "customerName", "customerEmail", "amount", "currency", "status", "createdAt"]
  },
  coupons: {
    title: "Coupons",
    description: "Manage discounts stored in the ShopSphere database.",
    endpoint: "admin/coupons",
    columns: ["code", "discountType", "discount", "minSpend", "isActive", "startsAt", "expiresAt", "usageCount", "usageLimit", "description"]
  },
  reports: {
    title: "Reports",
    description: "Sales, orders, customer, and inventory performance from the admin reporting API.",
    endpoint: "admin/reports",
    columns: []
  },
  roles: {
    title: "Roles & Access",
    description: "Manage registered account roles. Role changes take effect immediately.",
    endpoint: "admin/users",
    columns: ["name", "email", "role", "createdAt"]
  },
  controls: {
    title: "Website Control",
    description: "Manage persisted store information, the customer-facing announcement, and checkout availability.",
    columns: []
  }
};

const INVENTORY_MANAGER_PERMISSION_GROUPS = [
  {
    title: "Dashboard",
    permissions: [
      ["VIEW_INVENTORY_DASHBOARD", "View inventory dashboard"],
      ["VIEW_DASHBOARD_STATISTICS", "View dashboard statistics"]
    ]
  },
  {
    title: "Products",
    permissions: [
      ["VIEW_PRODUCTS", "View products"],
      ["VIEW_PRODUCT_DETAILS", "View product details"],
      ["CREATE_PRODUCTS", "Create products"],
      ["EDIT_PRODUCTS", "Edit assigned products"],
      ["DELETE_PRODUCTS", "Delete assigned products"],
      ["UPLOAD_PRODUCT_IMAGES", "Upload product images"]
    ]
  },
  {
    title: "Inventory",
    permissions: [
      ["VIEW_STOCK_LEVELS", "View stock availability"],
      ["UPDATE_INVENTORY", "Update stock availability"]
    ]
  },
  {
    title: "Categories",
    permissions: [
      ["VIEW_CATEGORIES", "View categories"],
      ["MANAGE_CATEGORIES", "Manage categories"]
    ]
  },
  {
    title: "Orders",
    permissions: [
      ["VIEW_ORDERS", "View assigned-product orders"],
      ["VIEW_ORDER_DETAILS", "View assigned-product order details"]
    ]
  }
];

function getRows(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.data?.data)) return result.data.data;
  return [];
}

function displayValue(key, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "price" || key === "amount" || key === "totalSpent" || key === "minSpend") {
    return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (key === "discountType") return value === "FIXED" ? "Fixed INR" : "Percentage";
  if (key === "discount") return String(value);
  if (key === "inStock" || key === "isActive") return value ? "Yes" : "No";
  if (key === "emailVerifiedAt" || key === "startsAt" || key === "expiresAt" || key === "createdAt" || key === "updatedAt") {
    return new Date(value).toLocaleDateString();
  }
  if (key === "manager") return value?.name || "Unassigned";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function StoreControls() {
  const { csrfToken } = useAuth();
  const { loadStorefrontSettings } = useStore();
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const result = await authRequest("admin/settings");
      if (!result || typeof result !== "object" || typeof result.allowCheckout !== "boolean") {
        throw new Error("The saved store settings response was invalid.");
      }
      setSettings({
        storeName: result.storeName || "",
        storeEmail: result.storeEmail || "",
        storePhone: result.storePhone || "",
        storeAddress: result.storeAddress || "",
        announcement: result.announcement || "",
        allowCheckout: result.allowCheckout
      });
      setStatus("ready");
    } catch (loadError) {
      setError(loadError.message || "Store settings could not be loaded.");
      setStatus("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function changeSetting(event) {
    const { name, value, checked, type } = event.target;
    setSettings((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value
    }));
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await authRequest("admin/settings", {
        method: "PATCH",
        body: settings,
        csrfToken
      });
      if (!result || typeof result.allowCheckout !== "boolean") {
        throw new Error("The saved store settings response was invalid.");
      }
      setSettings((current) => ({
        ...current,
        storeName: result.storeName || "",
        storeEmail: result.storeEmail || "",
        storePhone: result.storePhone || "",
        storeAddress: result.storeAddress || "",
        announcement: result.announcement || "",
        allowCheckout: result.allowCheckout
      }));
      await loadStorefrontSettings();
      setNotice("Website settings saved.");
    } catch (saveError) {
      setError(saveError.message || "Website settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") {
    return <p className="text-xs text-zinc-500">Loading saved website settings…</p>;
  }
  if (status === "error") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800" role="alert">
        <span>{error}</span>
        <button type="button" onClick={load} className="font-semibold underline">Retry</button>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="max-w-4xl space-y-5">
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{error}</p>}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold">Store information</h2>
        <p className="mt-1 text-xs text-zinc-500">Contact details are published in the customer-facing store footer.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-zinc-600 dark:text-zinc-300">Store name
            <input name="storeName" required maxLength={100} value={settings.storeName} onChange={changeSetting} className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800" />
          </label>
          <label className="text-xs text-zinc-600 dark:text-zinc-300">Contact email
            <input name="storeEmail" type="email" required maxLength={254} value={settings.storeEmail} onChange={changeSetting} className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800" />
          </label>
          <label className="text-xs text-zinc-600 dark:text-zinc-300">Contact phone
            <input name="storePhone" type="tel" maxLength={30} value={settings.storePhone} onChange={changeSetting} className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800" />
          </label>
          <label className="text-xs text-zinc-600 dark:text-zinc-300 sm:col-span-2">Store address
            <textarea name="storeAddress" rows={2} maxLength={300} value={settings.storeAddress} onChange={changeSetting} className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800" />
          </label>
        </div>
      </section>
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold">Customer-facing controls</h2>
        <div className="mt-4 space-y-4">
          <label className="block text-xs text-zinc-600 dark:text-zinc-300">Homepage announcement
            <textarea name="announcement" rows={3} maxLength={500} value={settings.announcement} onChange={changeSetting} className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800" />
            <span className="mt-1 block text-zinc-500">Shown above the customer site navigation. Leave blank to hide it.</span>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800">
            <input name="allowCheckout" type="checkbox" checked={settings.allowCheckout} onChange={changeSetting} className="mt-0.5" />
            <span><span className="font-semibold">Allow checkout</span><span className="mt-1 block text-zinc-500">When disabled, the NestJS checkout endpoint rejects new checkouts.</span></span>
          </label>
        </div>
      </section>
      <p className="text-xs leading-5 text-zinc-500">Settings are persisted by the existing ShopSphere store-settings file. Maintenance mode and editable tax/shipping rates are not exposed here because the current storefront does not enforce those settings.</p>
      <button type="submit" disabled={saving} className="rounded-lg bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">{saving ? "Saving…" : "Save website settings"}</button>
    </form>
  );
}

export function AdminSectionPage({ section }) {
  const { csrfToken, user } = useAuth();
  const [rows, setRows] = useState([]);
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [passwordUser, setPasswordUser] = useState(null);
  const [reportRange, setReportRange] = useState("30d");
  const config = SECTION_CONFIG[section];

  const loadData = useCallback(async () => {
    if (!config || section === "controls") return;
    setStatus("loading");
    setError("");
    try {
      const endpoint = section === "reports"
        ? `${config.endpoint}?range=${reportRange}`
        : config.endpoint;
      const response = await authRequest(endpoint);
      setRows(getRows(response));
      if (section === "reports") setReport(response);
      setStatus("ready");
    } catch (loadError) {
      setError(loadError.message || `Could not load ${config.title.toLowerCase()}.`);
      setStatus("error");
    }
  }, [config, reportRange, section]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const heading = config?.title || (section === "reports" ? "Reports" : section === "settings" ? "Settings" : "");
  const description = config?.description || (
    section === "reports"
      ? "Sales, orders, customer, and inventory performance from the admin reporting API."
      : "Your signed-in ShopSphere administrator account."
  );

  const reportMetrics = useMemo(() => report?.metrics || {}, [report]);

  async function updateInventory(product) {
    setSavingId(product.id);
    setError("");
    setNotice("");
    try {
      await authRequest(`admin/inventory/${product.id}`, {
        method: "PATCH",
        body: { inStock: !product.inStock },
        csrfToken
      });
      setNotice(`Inventory status updated for ${product.name}.`);
      await loadData();
    } catch (updateError) {
      setError(updateError.message || "Inventory could not be updated.");
    } finally {
      setSavingId(null);
    }
  }

  async function updateRole(account, role) {
    setSavingId(account.id);
    setError("");
    setNotice("");
    try {
      await authRequest(`admin/users/${account.id}/role`, {
        method: "PATCH",
        body: { role },
        csrfToken
      });
      setNotice(`Role updated for ${account.name}.`);
      await loadData();
    } catch (updateError) {
      setError(updateError.message || "The role could not be updated.");
    } finally {
      setSavingId(null);
    }
  }

  async function resetAccountPassword(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = form.get("password");
    setSavingId(`password:${passwordUser.id}`);
    setError("");
    setNotice("");
    const targetUser = passwordUser;
    try {
      await authRequest(`admin/users/${passwordUser.id}/password`, {
        method: "PATCH",
        body: { password },
        csrfToken
      });
      event.currentTarget.reset();
      setNotice(`Password reset for ${targetUser.name}. Their active sessions were revoked.`);
      setPasswordUser(null);
    } catch (resetError) {
      setError(resetError.message || "The password could not be reset.");
    } finally {
      setSavingId(null);
    }
  }

  async function updateInventoryManagerPermission(account, permission, enabled) {
    setSavingId(`${account.id}:${permission}`);
    setError("");
    setNotice("");
    try {
      const result = await authRequest(
        `admin/users/${account.id}/inventory-permissions/${permission}`,
        { method: "PATCH", body: { enabled }, csrfToken }
      );
      setRows((current) => current.map((row) => row.id !== account.id
        ? row
        : { ...row, inventoryPermissions: result.permissions }));
      setNotice(`${permission.replaceAll("_", " ").toLowerCase()} ${enabled ? "enabled" : "disabled"} for ${account.name}.`);
    } catch (updateError) {
      setError(updateError.message || "The Inventory Manager permission could not be updated.");
    } finally {
      setSavingId(null);
    }
  }

  async function createCoupon(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSavingId("new-coupon");
    setError("");
    setNotice("");
    try {
      await authRequest("admin/coupons", {
        method: "POST",
        body: {
          code: form.get("code"),
          discount: Number(form.get("discount")),
          discountType: form.get("discountType"),
          minSpend: Number(form.get("minSpend") || 0),
          startsAt: form.get("startsAt") ? new Date(form.get("startsAt")).toISOString() : null,
          expiresAt: form.get("expiresAt") ? new Date(form.get("expiresAt")).toISOString() : null,
          usageLimit: form.get("usageLimit") || null,
          description: form.get("description") || ""
        },
        csrfToken
      });
      formElement.reset();
      setNotice("Coupon created.");
      await loadData();
    } catch (createError) {
      setError(createError.message || "The coupon could not be created.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteCoupon(coupon) {
    if (!window.confirm(`Delete coupon “${coupon.code}”?`)) return;
    setSavingId(coupon.id);
    setError("");
    setNotice("");
    try {
      await authRequest(`admin/coupons/${coupon.id}`, { method: "DELETE", csrfToken });
      setNotice(`Coupon ${coupon.code} deleted.`);
      await loadData();
    } catch (deleteError) {
      setError(deleteError.message || "The coupon could not be deleted.");
    } finally {
      setSavingId(null);
    }
  }

  if (!heading) {
    return <section className="rounded-xl border border-zinc-200 bg-white p-6 text-sm dark:border-zinc-800 dark:bg-zinc-950">This admin section is not available.</section>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{heading}</h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
        </div>
        {config && section !== "controls" && (
          <button type="button" onClick={loadData} disabled={status === "loading"} className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <RefreshCw size={13} className={status === "loading" ? "animate-spin" : ""} />
            Refresh
          </button>
        )}
      </header>

      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</p>}
      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"><span>{error}</span><button type="button" onClick={loadData} className="font-semibold underline">Retry</button></div>}

      {section === "controls" && <StoreControls />}

      {section === "settings" && (
        <section className="max-w-2xl rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Signed-in administrator</h2>
          <dl className="mt-4 grid gap-4 text-xs sm:grid-cols-2">
            <div><dt className="text-zinc-500">Name</dt><dd className="mt-1 font-medium">{user?.name || "—"}</dd></div>
            <div><dt className="text-zinc-500">Email</dt><dd className="mt-1 font-medium">{user?.email || "—"}</dd></div>
            <div><dt className="text-zinc-500">Role</dt><dd className="mt-1 font-medium">{user?.role || "—"}</dd></div>
          </dl>
          <p className="mt-5 border-t border-zinc-100 pt-4 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">Account changes such as password updates are available through the account security flow.</p>
        </section>
      )}

      {section === "reports" && status === "ready" && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Revenue & sales performance</h2>
            <div className="flex items-center rounded-lg border border-zinc-200 bg-white p-1 text-xs dark:border-zinc-800 dark:bg-zinc-900" aria-label="Report date range">
              {["7d", "30d", "90d", "all"].map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setReportRange(range)}
                  aria-pressed={reportRange === range}
                  className={`rounded-md px-2.5 py-1 font-semibold uppercase tracking-wider transition-colors ${
                    reportRange === range
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(reportMetrics).map(([key, value]) => (
              <article key={key} className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs capitalize text-zinc-500">{key.replace(/([A-Z])/g, " $1")}</p>
                <p className="mt-2 text-xl font-bold">{displayValue(key, value)}</p>
              </article>
            ))}
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="mb-4 text-xs text-zinc-500">
              Captured paid order revenue and order count. All-time view is grouped by month.
            </p>
            <SalesBarChart data={report?.salesOverTime || []} height={300} />
          </div>
        </section>
      )}

      {section === "coupons" && (
        <form onSubmit={createCoupon} className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-950">
          <input name="code" required minLength={3} placeholder="Coupon code" aria-label="Coupon code" className="rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-xs dark:border-zinc-800" />
          <select name="discountType" defaultValue="PERCENTAGE" aria-label="Discount type" className="rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-xs dark:border-zinc-800">
            <option value="PERCENTAGE">Percentage</option>
            <option value="FIXED">Fixed INR</option>
          </select>
          <input name="discount" required type="number" min="1" step="1" placeholder="Discount value" aria-label="Discount value" className="rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-xs dark:border-zinc-800" />
          <input name="minSpend" type="number" min="0" step="0.01" placeholder="Minimum spend" aria-label="Minimum spend" className="rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-xs dark:border-zinc-800" />
          <label className="text-[10px] text-zinc-500">Starts at<input name="startsAt" type="datetime-local" aria-label="Coupon start date" className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-xs dark:border-zinc-800" /></label>
          <label className="text-[10px] text-zinc-500">Expires at<input name="expiresAt" type="datetime-local" aria-label="Coupon expiry date" className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-xs dark:border-zinc-800" /></label>
          <input name="usageLimit" type="number" min="1" step="1" placeholder="Usage limit (optional)" aria-label="Coupon usage limit" className="rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-xs dark:border-zinc-800" />
          <input name="description" placeholder="Description (optional)" aria-label="Coupon description" className="rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-xs dark:border-zinc-800" />
          <button disabled={savingId === "new-coupon"} className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900">{savingId === "new-coupon" ? "Saving..." : "Add coupon"}</button>
        </form>
      )}

      {config && section !== "controls" && status === "loading" && <p className="text-xs text-zinc-500">Loading {heading.toLowerCase()}…</p>}
      {config && section !== "reports" && status === "ready" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>{config.columns.map((column) => <th key={column} className="px-4 py-3 font-semibold capitalize">{column.replace(/([A-Z])/g, " $1")}</th>)}{["inventory", "roles", "coupons"].includes(section) && <th className="px-4 py-3">Actions</th>}</tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((row) => (
                <tr key={row.id} className="text-zinc-700 dark:text-zinc-300">
                  {config.columns.map((column) => (
                    <td key={column} className="max-w-xs truncate px-4 py-3">
                      {section === "roles" && column === "role" && row.id !== user?.id ? (
                        <select value={row.role} disabled={savingId === row.id} onChange={(event) => updateRole(row, event.target.value)} className="rounded border border-zinc-200 bg-transparent px-2 py-1 dark:border-zinc-700">
                          {["CUSTOMER", "MANAGER", "INVENTORY_MANAGER", "ADMIN"].map((role) => <option key={role} value={role}>{role === "INVENTORY_MANAGER" ? "Inventory Manager" : role}</option>)}
                        </select>
                      ) : displayValue(column, row[column])}
                    </td>
                  ))}
                  {section === "inventory" && <td className="px-4 py-3"><button type="button" disabled={savingId === row.id} onClick={() => updateInventory(row)} className="font-semibold text-zinc-900 underline disabled:opacity-50 dark:text-zinc-100">{savingId === row.id ? "Saving..." : row.inStock ? "Mark out of stock" : "Mark in stock"}</button></td>}
                  {section === "roles" && (
                    <td className="px-4 py-3 text-zinc-500">
                      {row.id === user?.id ? "Current account" : (
                        <button type="button" onClick={() => setPasswordUser(row)} className="font-semibold underline">
                          Reset password
                        </button>
                      )}
                      {row.role === "INVENTORY_MANAGER" && (
                        <div className="mt-3 grid gap-3 xl:grid-cols-2">
                          {INVENTORY_MANAGER_PERMISSION_GROUPS.map((group) => (
                            <fieldset className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700" key={group.title}>
                              <legend className="px-1 font-semibold text-zinc-800 dark:text-zinc-100">{group.title}</legend>
                              <div className="mt-1 grid gap-2">
                                {group.permissions.map(([permission, label]) => (
                                  <label className="flex items-start gap-2" key={permission}>
                                    <input
                                      type="checkbox"
                                      checked={(row.inventoryPermissions || []).includes(permission)}
                                      disabled={savingId === `${row.id}:${permission}`}
                                      onChange={(event) => updateInventoryManagerPermission(row, permission, event.target.checked)}
                                      className="mt-0.5"
                                    />
                                    <span>{label}</span>
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                          ))}
                        </div>
                      )}
                    </td>
                  )}
                  {section === "coupons" && <td className="px-4 py-3"><button type="button" disabled={savingId === row.id} onClick={() => deleteCoupon(row)} className="font-semibold text-rose-600 underline disabled:opacity-50">{savingId === row.id ? "Deleting..." : "Delete"}</button></td>}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={config.columns.length + 1} className="px-4 py-10 text-center text-zinc-500">No records found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {section === "roles" && passwordUser && (
        <form onSubmit={resetAccountPassword} className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold">Set a new password for {passwordUser.name}</h2>
          <label className="grid gap-1 text-xs">
            New password
            <input name="password" required minLength={8} maxLength={1024} type="password" autoComplete="new-password" className="rounded-lg border border-zinc-200 bg-transparent px-3 py-2 dark:border-zinc-700" />
          </label>
          <div className="flex gap-2">
            <button disabled={savingId === `password:${passwordUser.id}`} className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
              {savingId === `password:${passwordUser.id}` ? "Saving…" : "Set password"}
            </button>
            <button type="button" onClick={() => setPasswordUser(null)} className="rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-700">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
