"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronRight,
  CircleUserRound,
  KeyRound,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Users,
  X
} from "lucide-react";
import { authRequest } from "../../lib/api/auth";
import { useAuth } from "../auth-provider";
import { CUSTOMER_PERMISSION_GROUPS } from "../../lib/customer-permissions";

const ROLE_OPTIONS = [
  { key: "ADMIN", label: "Admin", description: "Full administrative access", icon: ShieldCheck },
  { key: "INVENTORY_MANAGER", label: "Inventory Manager", description: "Product and stock operations", icon: Shield },
  { key: "MANAGER", label: "Manager", description: "Legacy manager access", icon: KeyRound },
  { key: "CUSTOMER", label: "Customer", description: "Customer storefront account", icon: CircleUserRound }
];

const PERMISSION_SECTIONS = [
  {
    title: "Dashboard",
    description: "Manager overview and operational statistics.",
    permissions: [
      ["VIEW_INVENTORY_DASHBOARD", "View inventory dashboard"],
      ["VIEW_DASHBOARD_STATISTICS", "View dashboard statistics"]
    ]
  },
  {
    title: "Products",
    description: "Products assigned to the Inventory Manager.",
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
    title: "Categories",
    description: "Categories used by assigned products.",
    permissions: [
      ["VIEW_CATEGORIES", "View categories"],
      ["MANAGE_CATEGORIES", "Manage categories"]
    ]
  },
  {
    title: "Orders",
    description: "Orders containing products assigned to the Inventory Manager.",
    permissions: [
      ["VIEW_ORDERS", "View assigned-product orders"],
      ["VIEW_ORDER_DETAILS", "View order details"]
    ]
  },
  {
    title: "Customers / Users",
    description: "Customer account administration is restricted to the Admin role."
  },
  {
    title: "Inventory",
    description: "Availability for products assigned to the Inventory Manager.",
    permissions: [
      ["VIEW_STOCK_LEVELS", "View stock availability"],
      ["UPDATE_INVENTORY", "Update stock availability"],
      ["VIEW_LOW_STOCK_ALERTS", "View low-stock and out-of-stock alerts"],
      ["MANAGE_STOCK_ALERTS", "Configure stock alert thresholds"],
      ["VIEW_STOCK_HISTORY", "View stock history"]
    ]
  },
  {
    title: "Website Control",
    description: "Store-wide website settings can only be changed by an Admin."
  },
  {
    title: "Roles & Access",
    description: "Role assignments and permissions can only be managed by an Admin."
  },
  {
    title: "Reports",
    description: "Inventory-only reporting for products assigned to the Inventory Manager.",
    permissions: [
      ["VIEW_INVENTORY_REPORTS", "View assigned inventory reports"],
      ["EXPORT_INVENTORY_REPORTS", "Export assigned inventory reports"]
    ]
  },
  {
    title: "Settings",
    description: "Store and administrator settings are restricted to an Admin."
  }
];

const ROLE_NOTES = {
  ADMIN: "Administrator access is controlled by the Admin role and backend role guards. It is not individually permission-toggled.",
  MANAGER: "This is the existing legacy Manager role. Its access follows backend legacy manager rules; no per-user permission overrides are stored for it.",
  CUSTOMER: "Customer access is restricted to customer-facing account features. Administrative APIs reject customer sessions."
};

function Avatar({ name }) {
  const initial = name?.trim()?.charAt(0)?.toUpperCase() || "?";
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
      {initial}
    </span>
  );
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export function RolesAccessPage() {
  const { csrfToken, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [selectedRole, setSelectedRole] = useState("INVENTORY_MANAGER");
  const [selectedManagerId, setSelectedManagerId] = useState(null);
  const [draftPermissions, setDraftPermissions] = useState([]);
  const [customerPermissions, setCustomerPermissions] = useState([]);
  const [draftCustomerPermissions, setDraftCustomerPermissions] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [showRoleAssignment, setShowRoleAssignment] = useState(false);
  const [assignmentUserId, setAssignmentUserId] = useState("");
  const [assignmentRole, setAssignmentRole] = useState("INVENTORY_MANAGER");

  const loadUsers = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const [result, customerResult] = await Promise.all([
        authRequest("admin/users"),
        authRequest("admin/customer-permissions")
      ]);
      const accountRows = Array.isArray(result)
        ? result
        : Array.isArray(result?.data) ? result.data : null;
      const savedCustomerPermissions = customerResult?.permissions;
      if (!accountRows || accountRows.some((account) => (
        !Number.isSafeInteger(Number(account.id)) ||
        typeof account.role !== "string" ||
        !Array.isArray(account.inventoryPermissions)
      )) || !Array.isArray(savedCustomerPermissions)) {
        throw new Error("The role and permission data returned by the API was invalid.");
      }
      setUsers(accountRows);
      setCustomerPermissions(savedCustomerPermissions);
      setDraftCustomerPermissions(savedCustomerPermissions);
      setStatus("ready");
    } catch (loadError) {
      setError(loadError.message || "Roles and users could not be loaded.");
      setStatus("error");
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const roleCounts = useMemo(() => users.reduce((counts, account) => {
    counts[account.role] = (counts[account.role] || 0) + 1;
    return counts;
  }, {}), [users]);

  const selectedUsers = useMemo(
    () => users.filter((account) => account.role === selectedRole),
    [selectedRole, users]
  );
  const selectedManager = useMemo(
    () => selectedUsers.find((account) => Number(account.id) === Number(selectedManagerId)),
    [selectedManagerId, selectedUsers]
  );
  const dirty = Boolean(selectedManager) && (
    draftPermissions.length !== selectedManager.inventoryPermissions.length ||
    draftPermissions.some((permission) => !selectedManager.inventoryPermissions.includes(permission))
  );
  const customerDirty = draftCustomerPermissions.length !== customerPermissions.length ||
    draftCustomerPermissions.some((permission) => !customerPermissions.includes(permission));

  useEffect(() => {
    const account = selectedUsers.find((row) => Number(row.id) === Number(selectedManagerId))
      || selectedUsers[0]
      || null;
    setSelectedManagerId(account?.id ?? null);
    setDraftPermissions(account ? [...account.inventoryPermissions] : []);
  }, [selectedManagerId, selectedUsers]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return users.filter((account) => (
      account.role === selectedRole &&
      (!query ||
        account.name?.toLocaleLowerCase().includes(query) ||
        account.email?.toLocaleLowerCase().includes(query))
    ));
  }, [search, selectedRole, users]);

  function togglePermission(permission, enabled) {
    const update = (current) => enabled
      ? [...new Set([...current, permission])]
      : current.filter((entry) => entry !== permission);
    if (selectedRole === "CUSTOMER") {
      setDraftCustomerPermissions(update);
    } else {
      setDraftPermissions(update);
    }
    setNotice("");
  }

  function cancelChanges() {
    if (selectedRole === "CUSTOMER") {
      setDraftCustomerPermissions([...customerPermissions]);
    } else {
      setDraftPermissions([...(selectedManager?.inventoryPermissions || [])]);
    }
    setError("");
    setNotice("");
  }

  async function saveChanges() {
    if (!selectedManager || saving || !dirty) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await authRequest(
        `admin/users/${selectedManager.id}/inventory-permissions`,
        {
          method: "PATCH",
          body: { permissions: draftPermissions },
          csrfToken
        }
      );
      if (!Array.isArray(result?.permissions)) {
        throw new Error("The permission update response was invalid.");
      }
      setUsers((current) => current.map((account) => (
        account.id === selectedManager.id
          ? { ...account, inventoryPermissions: result.permissions }
          : account
      )));
      setDraftPermissions(result.permissions);
      setNotice("Permission changes saved.");
    } catch (saveError) {
      setError(saveError.message || "Permission changes could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCustomerChanges() {
    if (saving || !customerDirty) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await authRequest("admin/customer-permissions", {
        method: "PATCH",
        body: { permissions: draftCustomerPermissions },
        csrfToken
      });
      if (!Array.isArray(result?.permissions)) {
        throw new Error("The Customer permission update response was invalid.");
      }
      setCustomerPermissions(result.permissions);
      setDraftCustomerPermissions(result.permissions);
      setNotice("Customer role permissions saved.");
    } catch (saveError) {
      setError(saveError.message || "Customer permissions could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function assignExistingRole(event) {
    event.preventDefault();
    const account = users.find((candidate) => Number(candidate.id) === Number(assignmentUserId));
    if (!account || assigning) return;
    setAssigning(true);
    setError("");
    setNotice("");
    try {
      await authRequest(`admin/users/${account.id}/role`, {
        method: "PATCH",
        body: { role: assignmentRole },
        csrfToken
      });
      setSelectedRole(assignmentRole);
      setSelectedManagerId(null);
      setNotice(`${account.name}'s role was updated to ${ROLE_OPTIONS.find((role) => role.key === assignmentRole)?.label || assignmentRole}.`);
      setShowRoleAssignment(false);
      await loadUsers();
    } catch (assignmentError) {
      setError(assignmentError.message || "The role could not be assigned.");
    } finally {
      setAssigning(false);
    }
  }

  const selectedRoleInfo = ROLE_OPTIONS.find((role) => role.key === selectedRole) || ROLE_OPTIONS[0];

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Administration</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">Roles &amp; Access</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">Manage account roles and review the saved permissions enforced by the ShopSphere API.</p>
        </div>
        <button
          type="button"
          onClick={() => { setShowRoleAssignment((open) => !open); setNotice(""); setError(""); }}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          aria-expanded={showRoleAssignment}
        >
          {showRoleAssignment ? <X size={16} /> : <Plus size={16} />}
          {showRoleAssignment ? "Close" : "Add Role"}
        </button>
      </header>

      {notice && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Check size={16} />{notice}
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle size={17} className="mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      {showRoleAssignment && (
        <form onSubmit={assignExistingRole} className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end dark:border-zinc-800 dark:bg-zinc-950">
          <div>
            <h2 className="text-sm font-semibold">Assign an existing role</h2>
            <p className="mt-1 text-xs text-zinc-500">ShopSphere supports the four existing account roles; custom roles are not defined by the current database schema.</p>
          </div>
          <label className="grid gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Account
            <select required value={assignmentUserId} onChange={(event) => setAssignmentUserId(event.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
              <option value="">Select a user</option>
              {users.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.email}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Role
            <select value={assignmentRole} onChange={(event) => setAssignmentRole(event.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
              {ROLE_OPTIONS.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
            </select>
          </label>
          <button type="submit" disabled={assigning || status !== "ready" || !assignmentUserId} className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950">
            {assigning ? "Saving…" : "Assign role"}
          </button>
        </form>
      )}

      <section aria-label="User and role summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { title: "Total Users", count: users.length, icon: Users, detail: "Registered accounts" },
          { title: "Admin", count: roleCounts.ADMIN || 0, icon: ShieldCheck, detail: "Administrator accounts" },
          { title: "Inventory Manager", count: roleCounts.INVENTORY_MANAGER || 0, icon: KeyRound, detail: "Inventory staff accounts" },
          { title: "Customers", count: roleCounts.CUSTOMER || 0, icon: CircleUserRound, detail: "Customer accounts" }
        ].map(({ title, count, icon: Icon, detail }) => (
          <article key={title} className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-medium text-zinc-500">{title}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{status === "loading" ? "—" : count}</p></div>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"><Icon size={19} /></span>
            </div>
            <p className="mt-2 text-xs text-zinc-400">{detail}</p>
          </article>
        ))}
      </section>

      {status === "loading" ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">Loading roles and account permissions…</div>
      ) : status === "error" ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Role and permission records could not be loaded.</p>
          <button type="button" onClick={loadUsers} className="mt-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium dark:border-zinc-700">Retry</button>
        </div>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(255px,0.72fr)_minmax(0,2fr)]">
          <aside className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between px-2 pb-3">
              <h2 className="text-sm font-semibold">Roles</h2>
              <span className="text-xs text-zinc-400">{ROLE_OPTIONS.length}</span>
            </div>
            <div className="space-y-1">
              {ROLE_OPTIONS.map(({ key, label, description, icon: Icon }) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => { setSelectedRole(key); setSearch(""); setNotice(""); setError(""); }}
                  aria-current={selectedRole === key ? "true" : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${selectedRole === key ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950" : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"}`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${selectedRole === key ? "bg-white/15 dark:bg-black/10" : "bg-zinc-100 dark:bg-zinc-800"}`}><Icon size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className={`mt-0.5 block truncate text-[11px] ${selectedRole === key ? "text-white/65 dark:text-zinc-600" : "text-zinc-500"}`}>{description}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${selectedRole === key ? "bg-white/15 dark:bg-black/10" : "bg-zinc-100 dark:bg-zinc-800"}`}>{roleCounts[key] || 0}</span>
                  <ChevronRight size={15} className="shrink-0 opacity-60" />
                </button>
              ))}
            </div>
          </aside>

          <div className="min-w-0 space-y-5">
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{selectedRoleInfo.label}</h2>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">System role</span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">{selectedRoleInfo.description}</p>
                </div>
                <div className="rounded-lg bg-zinc-50 px-3 py-2 text-right dark:bg-zinc-900">
                  <p className="text-xl font-semibold">{selectedUsers.length}</p>
                  <p className="text-[11px] text-zinc-500">assigned users</p>
                </div>
              </div>
              {selectedRole === "INVENTORY_MANAGER" ? (
                <>
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <label htmlFor="permission-account" className="text-xs font-medium text-zinc-500">Permissions for</label>
                    <select
                      id="permission-account"
                      value={selectedManagerId ?? ""}
                      onChange={(event) => setSelectedManagerId(Number(event.target.value))}
                      disabled={!selectedUsers.length}
                      className="min-w-48 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      {selectedUsers.length ? selectedUsers.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.email}</option>) : <option value="">No Inventory Managers</option>}
                    </select>
                  </div>
                  <p className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                    These are the saved, per-user Inventory Manager permissions. Each enabled permission is also checked by its corresponding NestJS endpoint.
                  </p>
                </>
              ) : selectedRole === "CUSTOMER" ? (
                <p className="mt-5 rounded-xl bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  These role-wide permissions apply to all customer accounts. Disabled parent features also block dependent actions; child selections are preserved when a parent is turned off.
                </p>
              ) : (
                <p className="mt-5 rounded-xl bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">{ROLE_NOTES[selectedRole]}</p>
              )}
            </section>

            <section aria-label="Permissions by section" className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {(selectedRole === "CUSTOMER" ? CUSTOMER_PERMISSION_GROUPS : PERMISSION_SECTIONS).map((section) => {
                const applicablePermissions = selectedRole === "INVENTORY_MANAGER"
                  ? section.permissions || []
                  : selectedRole === "CUSTOMER" ? section.permissions : [];
                const activePermissions = selectedRole === "CUSTOMER" ? draftCustomerPermissions : draftPermissions;
                const activeCount = applicablePermissions.filter(([permission]) => activePermissions.includes(permission)).length;
                return (
                  <article key={section.title} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="flex items-start justify-between gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-800">
                      <div><h3 className="text-sm font-semibold">{section.title}</h3><p className="mt-1 text-[11px] leading-4 text-zinc-500">{section.description}</p></div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${applicablePermissions.length && activeCount ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}>
                        {applicablePermissions.length ? `${activeCount}/${applicablePermissions.length}` : "Role based"}
                      </span>
                    </div>
                    {applicablePermissions.length ? (
                      <div className="mt-3 space-y-2.5">
                        {applicablePermissions.map(([permission, label, parent]) => (
                          <label key={permission} className="flex cursor-pointer items-start gap-2.5 text-xs text-zinc-700 dark:text-zinc-300">
                            <input
                              type="checkbox"
                              checked={activePermissions.includes(permission)}
                              onChange={(event) => togglePermission(permission, event.target.checked)}
                              disabled={selectedRole === "INVENTORY_MANAGER"
                                ? !selectedManager
                                : Boolean(parent && !draftCustomerPermissions.includes(parent))}
                              className="mt-0.5 h-4 w-4 accent-zinc-950"
                            />
                            <span>{parent ? <span className="mr-1 text-zinc-400">↳</span> : null}{label}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs leading-5 text-zinc-400">
                        {selectedRole === "INVENTORY_MANAGER"
                          ? "No per-user permission for this section exists in the current permission model."
                          : "No permissions are defined for this role."}
                      </p>
                    )}
                  </article>
                );
              })}
            </section>

            {(selectedRole === "INVENTORY_MANAGER" || selectedRole === "CUSTOMER") && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs text-zinc-500">
                  {selectedRole === "CUSTOMER"
                    ? customerDirty ? "You have unsaved Customer permission changes." : "Customer permissions match the saved role state."
                    : dirty ? "You have unsaved permission changes." : "Permissions match the saved account state."}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={cancelChanges} disabled={!(selectedRole === "CUSTOMER" ? customerDirty : dirty) || saving} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200">Cancel</button>
                  <button type="button" onClick={selectedRole === "CUSTOMER" ? saveCustomerChanges : saveChanges} disabled={!(selectedRole === "CUSTOMER" ? customerDirty : dirty) || saving || (selectedRole === "INVENTORY_MANAGER" && !selectedManager)} className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950">{saving ? "Saving…" : "Save Changes"}</button>
                </div>
              </div>
            )}

            <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-col gap-3 border-b border-zinc-100 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
                <div>
                  <h2 className="text-base font-semibold">Assigned users</h2>
                  <p className="mt-1 text-xs text-zinc-500">Accounts currently assigned to {selectedRoleInfo.label}.</p>
                </div>
                <label className="relative block w-full sm:max-w-xs">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900" />
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="bg-zinc-50 text-xs font-semibold text-zinc-500 dark:bg-zinc-900">
                    <tr><th className="px-5 py-3">User</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Assigned</th><th className="px-5 py-3">Permissions</th><th className="px-5 py-3">Account</th></tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {filteredUsers.map((account) => (
                      <tr key={account.id} className="text-zinc-700 dark:text-zinc-300">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3"><Avatar name={account.name} /><span className="min-w-0"><span className="block truncate font-medium">{account.name || "Unnamed account"}</span><span className="block truncate text-xs text-zinc-500">{account.email}</span></span></div>
                        </td>
                        <td className="px-5 py-3.5">{selectedRoleInfo.label}</td>
                        <td className="px-5 py-3.5 text-xs text-zinc-500">{formatDate(account.createdAt)}</td>
                        <td className="px-5 py-3.5">{account.role === "INVENTORY_MANAGER" ? <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{account.inventoryPermissions.length} enabled</span> : <span className="text-xs text-zinc-500">Role based</span>}</td>
                        <td className="px-5 py-3.5">{Number(account.id) === Number(currentUser?.id) ? <span className="text-xs text-zinc-500">Signed in</span> : <span className={`text-xs ${account.emailVerifiedAt ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500"}`}>{account.emailVerifiedAt ? "Verified" : "Unverified"}</span>}</td>
                      </tr>
                    ))}
                    {!filteredUsers.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-zinc-500">{search ? "No accounts match this search." : `No users are assigned to ${selectedRoleInfo.label}.`}</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500 dark:border-zinc-800">
                <span>Showing {filteredUsers.length} of {selectedUsers.length} assigned users</span>
                <span>{selectedRoleInfo.label}</span>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
