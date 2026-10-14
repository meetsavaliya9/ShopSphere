"use client";

import { useCallback, useEffect, useState } from "react";
import { RoleGate } from "../../components/role-gate";
import { useAuth } from "../../components/auth-provider";
import { authRequest } from "../../lib/api/auth";

const roleOptions = ["ADMIN", "MANAGER", "INVENTORY_MANAGER", "CUSTOMER"];

function AdminContent() {
  const { user, csrfToken } = useAuth();
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingProduct, setSavingProduct] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState("");

  const loadDashboard = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const [userResult, productResult] = await Promise.all([
        authRequest("admin/users"),
        authRequest("admin/products")
      ]);
      if (!Array.isArray(userResult) || !Array.isArray(productResult)) {
        throw new Error("Administration service returned an invalid response.");
      }
      setUsers(userResult);
      setProducts(productResult);
      setAssignments(Object.fromEntries(productResult.map((product) => [
        product.id,
        product.manager ? String(product.manager.id) : ""
      ])));
      setStatus("ready");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  async function changeRole(target, role) {
    setError("");
    setNotice("");
    try {
      await authRequest(`admin/users/${target.id}/role`, {
        method: "PATCH",
        body: { role },
        csrfToken
      });
      setNotice(`Updated access for ${target.email}.`);
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function assignManager(product) {
    setError("");
    setNotice("");
    const selected = assignments[product.id] || "";
    try {
      await authRequest(`admin/products/${product.id}/manager`, {
        method: "PATCH",
        body: { managerId: selected ? Number(selected) : null },
        csrfToken
      });
      setNotice(`Saved assignment for ${product.name}.`);
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function createProduct(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form).entries());
    const managerId = fields.managerId;
    const body = {
      name: fields.name,
      description: fields.description,
      price: Number(fields.price),
      category: fields.category
    };
    if (managerId) body.managerId = Number(managerId);
    setSavingProduct(true);
    setError("");
    setNotice("");
    try {
      await authRequest("products", { method: "POST", body, csrfToken });
      form.reset();
      setNotice("Product created.");
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingProduct(false);
    }
  }

  async function deleteProduct(product) {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    setDeletingProductId(product.id);
    setError("");
    setNotice("");
    try {
      await authRequest(`products/${product.id}`, { method: "DELETE", csrfToken });
      setNotice(`Deleted ${product.name}.`);
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeletingProductId("");
    }
  }

  const managers = users.filter((account) => ["MANAGER", "INVENTORY_MANAGER"].includes(account.role));

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-12 sm:px-10 lg:px-16 lg:py-16">
      <p className="text-[9px] font-semibold uppercase tracking-[0.19em] text-muted">Administration · {user.name}</p>
      <h1 className="mt-4 font-serif text-5xl tracking-[-0.06em]">Access & assignments.</h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">Manage account roles and assign product inventory to managers. Changes are enforced by the NestJS API.</p>
      {error && <p className="mt-6 border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p>}
      {notice && <p className="mt-6 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">{notice}</p>}
      {status === "loading" && <p className="py-12 text-sm text-muted">Loading administration data…</p>}
      {status === "error" && <button className="mt-5 border border-ink px-4 py-3 text-xs" onClick={loadDashboard}>Retry</button>}
      {status === "ready" && (
        <>
          <section className="mt-10">
            <div className="flex items-end justify-between border-b border-line pb-4">
              <h2 className="font-serif text-3xl">People & roles</h2>
              <span className="text-xs text-muted">{users.length} accounts</span>
            </div>
            <div className="divide-y divide-line">
              {users.map((account) => (
                <div className="grid gap-3 py-5 sm:grid-cols-[1fr_170px]" key={account.id}>
                  <div><p className="text-sm font-medium">{account.name}</p><p className="mt-1 text-xs text-muted">{account.email}</p></div>
                  <select
                    aria-label={`Role for ${account.email}`}
                    className="min-h-11 border border-line bg-white px-3 text-xs"
                    value={account.role}
                    disabled={account.id === user.id}
                    onChange={(event) => changeRole(account, event.target.value)}
                  >
                    {roleOptions.map((role) => <option key={role} value={role}>{role === "INVENTORY_MANAGER" ? "Inventory Manager" : role}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </section>
          <section className="mt-14">
            <div className="border-b border-line pb-4">
              <h2 className="font-serif text-3xl">Add a product</h2>
              <p className="mt-2 text-xs text-muted">Only administrators can create catalog entries.</p>
            </div>
            <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={createProduct}>
              <label className="text-xs font-medium">Product name<input name="name" required maxLength={191} className="mt-2 min-h-11 w-full border border-line px-3 text-sm" /></label>
              <label className="text-xs font-medium">Category<input name="category" required maxLength={100} className="mt-2 min-h-11 w-full border border-line px-3 text-sm" /></label>
              <label className="text-xs font-medium">Price<input name="price" type="number" min="0" step="0.01" required className="mt-2 min-h-11 w-full border border-line px-3 text-sm" /></label>
              <label className="text-xs font-medium">Assign manager (optional)
                <select name="managerId" defaultValue="" className="mt-2 min-h-11 w-full border border-line bg-white px-3 text-sm">
                  <option value="">Unassigned</option>
                  {managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium sm:col-span-2">Description<textarea name="description" rows={3} className="mt-2 w-full border border-line px-3 py-2 text-sm" /></label>
              <button disabled={savingProduct} className="min-h-11 justify-self-start bg-ink px-5 text-xs font-semibold text-white disabled:opacity-50">{savingProduct ? "Saving…" : "Create product"}</button>
            </form>
          </section>
          <section className="mt-14">
            <div className="flex items-end justify-between border-b border-line pb-4">
              <h2 className="font-serif text-3xl">Manager assignments</h2>
              <span className="text-xs text-muted">{products.length} products</span>
            </div>
            <div className="divide-y divide-line">
              {products.map((product) => (
                <div className="grid gap-4 py-5 sm:grid-cols-[1fr_220px_100px_90px]" key={product.id}>
                  <div><p className="text-sm font-medium">{product.name}</p><p className="mt-1 text-xs text-muted">{product.category} · ${Number(product.price).toFixed(2)}</p></div>
                  <select
                    aria-label={`Manager for ${product.name}`}
                    className="min-h-11 border border-line bg-white px-3 text-xs"
                    value={assignments[product.id] ?? ""}
                    onChange={(event) => setAssignments((current) => ({ ...current, [product.id]: event.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}
                  </select>
                  <button className="min-h-11 border border-ink px-3 text-xs" onClick={() => assignManager(product)}>Save</button>
                  <button disabled={deletingProductId === product.id} className="min-h-11 border border-red-300 px-3 text-xs text-red-800 disabled:opacity-50" onClick={() => deleteProduct(product)}>{deletingProductId === product.id ? "Removing…" : "Delete"}</button>
                </div>
              ))}
              {products.length === 0 && <p className="py-8 text-sm text-muted">There are no products to assign.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default function AdminPage() {
  return <RoleGate roles={["ADMIN"]}><AdminContent /></RoleGate>;
}
