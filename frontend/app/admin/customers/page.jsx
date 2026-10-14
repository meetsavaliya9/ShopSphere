"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  KeyRound,
  LoaderCircle,
  Lock,
  Mail,
  RefreshCw,
  Search,
  ShieldAlert,
  ShoppingBag,
  User,
  UserCheck,
  UserX,
  Users,
  X
} from "lucide-react";
import { authRequest } from "../../../lib/api/auth";
import { useAuth } from "../../../components/auth-provider";
import { Badge } from "../../../components/admin/badge";
import { Modal } from "../../../components/admin/modal";
import { StatCard } from "../../../components/admin/stat-card";

export default function AdminCustomersPage() {
  const { csrfToken } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Selected customer for details modal
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [customerDetails, setCustomerDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);

  // Status toggle confirmation modal
  const [confirmToggleTarget, setConfirmToggleTarget] = useState(null);
  const [toggling, setToggling] = useState(false);

  // Password reset modal
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);

  const loadCustomers = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const response = await authRequest("admin/customers");
      const data = Array.isArray(response) ? response : response?.data || [];
      setCustomers(data);
      setStatus("ready");
    } catch (err) {
      setError(err.message || "Failed to load customers.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Load detailed customer data when modal opens
  async function openCustomerDetails(customer) {
    setSelectedCustomerId(customer.id);
    setDetailsModalOpen(true);
    setDetailsLoading(true);
    setCustomerDetails(null);
    try {
      const details = await authRequest(`admin/customers/${customer.id}`);
      setCustomerDetails(details);
    } catch (err) {
      // Fallback to basic info if detail endpoint fails
      setCustomerDetails({
        ...customer,
        isActive: Boolean(customer.emailVerifiedAt),
        orders: []
      });
    } finally {
      setDetailsLoading(false);
    }
  }

  // Handle Account Activation/Deactivation
  async function handleToggleStatus() {
    if (!confirmToggleTarget) return;
    setToggling(true);
    setError("");
    setNotice("");
    const isCurrentlyActive = Boolean(confirmToggleTarget.emailVerifiedAt);
    const newActiveState = !isCurrentlyActive;
    try {
      await authRequest(`admin/customers/${confirmToggleTarget.id}/status`, {
        method: "PATCH",
        body: { active: newActiveState },
        csrfToken
      });
      setNotice(
        `Customer account for ${confirmToggleTarget.name} has been ${
          newActiveState ? "activated" : "deactivated"
        }.`
      );
      setConfirmToggleTarget(null);
      await loadCustomers();
    } catch (err) {
      setError(err.message || "Failed to update customer status.");
    } finally {
      setToggling(false);
    }
  }

  // Handle Password Reset
  async function handleResetPassword(e) {
    e.preventDefault();
    if (!passwordTarget || !newPassword) return;
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setResettingPassword(true);
    setError("");
    setNotice("");
    try {
      await authRequest(`admin/users/${passwordTarget.id}/password`, {
        method: "PATCH",
        body: { password: newPassword },
        csrfToken
      });
      setNotice(`Password successfully reset for ${passwordTarget.name}. Active sessions were revoked.`);
      setPasswordTarget(null);
      setNewPassword("");
    } catch (err) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setResettingPassword(false);
    }
  }

  // Filtered & Paginated customers
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase());
      const isActive = Boolean(c.emailVerifiedAt);
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && isActive) ||
        (statusFilter === "INACTIVE" && !isActive);
      return matchesSearch && matchesStatus;
    });
  }, [customers, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const paginatedCustomers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, page, pageSize]);

  // Aggregate stats
  const stats = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((c) => Boolean(c.emailVerifiedAt)).length;
    const inactive = total - active;
    const totalSpent = customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0);
    return { total, active, inactive, totalSpent };
  }, [customers]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Customer Management
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Review registered customer accounts, order history, and account activity.
          </p>
        </div>

        <button
          type="button"
          onClick={loadCustomers}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors shrink-0"
        >
          <RefreshCw size={13} className={status === "loading" ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Customers"
          value={stats.total}
          description="Registered storefront customer accounts"
          icon={Users}
        />
        <StatCard
          title="Active Accounts"
          value={stats.active}
          description="Verified email & active login access"
          icon={UserCheck}
        />
        <StatCard
          title="Deactivated Accounts"
          value={stats.inactive}
          description="Unverified or restricted accounts"
          icon={UserX}
        />
        <StatCard
          title="Verified Customer Spend"
          value={`₹${stats.totalSpent.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
          description="Completed revenue from customer orders"
          icon={ShoppingBag}
        />
      </div>

      {/* Filter & Search Bar */}
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
            placeholder="Search by customer name or email..."
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50/50 pl-9 pr-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50/50 p-1 text-xs dark:border-zinc-800 dark:bg-zinc-900">
            {["ALL", "ACTIVE", "INACTIVE"].map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => {
                  setStatusFilter(filter);
                  setPage(1);
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition-all ${
                  statusFilter === filter
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {filter === "ALL" ? "All" : filter === "ACTIVE" ? "Active" : "Deactivated"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-2xs overflow-hidden dark:border-zinc-800 dark:bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-850 dark:bg-zinc-900/40 text-[10px] font-semibold uppercase text-zinc-400 tracking-wider">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total Orders</th>
                <th className="px-4 py-3">Paid Orders</th>
                <th className="px-4 py-3">Total Spend</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
              {status === "loading" && !customers.length ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    <LoaderCircle size={20} className="animate-spin mx-auto mb-2 text-zinc-400" />
                    Loading registered customer accounts...
                  </td>
                </tr>
              ) : paginatedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    No customers found matching your search.
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((customer) => {
                  const isActive = Boolean(customer.emailVerifiedAt);
                  return (
                    <tr
                      key={customer.id}
                      className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/50 transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 font-semibold text-zinc-700 text-xs dark:bg-zinc-850 dark:text-zinc-200">
                            {customer.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                              {customer.name}
                            </p>
                            <p className="text-[11px] text-zinc-400 truncate">{customer.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        {isActive ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="warning">Deactivated</Badge>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-300">
                        {customer.totalOrders} {customer.totalOrders === 1 ? "order" : "orders"}
                      </td>

                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-300 font-medium">
                        {customer.paidOrdersCount}
                      </td>

                      <td className="px-4 py-3.5 font-semibold text-zinc-900 dark:text-zinc-100">
                        ₹{(customer.totalSpent || 0).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View details */}
                          <button
                            type="button"
                            onClick={() => openCustomerDetails(customer)}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                            title="View customer profile and order history"
                          >
                            <Eye size={12} />
                            <span>Details</span>
                          </button>

                          {/* Toggle Active / Deactivate */}
                          <button
                            type="button"
                            onClick={() => setConfirmToggleTarget(customer)}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                              isActive
                                ? "border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                                : "border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                            }`}
                            title={isActive ? "Deactivate account" : "Activate account"}
                          >
                            {isActive ? <UserX size={12} /> : <UserCheck size={12} />}
                            <span>{isActive ? "Deactivate" : "Activate"}</span>
                          </button>

                          {/* Reset password */}
                          <button
                            type="button"
                            onClick={() => {
                              setPasswordTarget(customer);
                              setNewPassword("");
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors"
                            title="Reset customer password"
                          >
                            <KeyRound size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 dark:border-zinc-850 text-xs text-zinc-500">
          <span>
            Showing {filteredCustomers.length ? (page - 1) * pageSize + 1 : 0} to{" "}
            {Math.min(page * pageSize, filteredCustomers.length)} of {filteredCustomers.length} customers
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-300 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-300 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Customer Details & Order History */}
      <Modal
        isOpen={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        title="Customer Profile & Order History"
        size="lg"
      >
        {detailsLoading ? (
          <div className="py-12 text-center text-xs text-zinc-400">
            <LoaderCircle size={22} className="animate-spin mx-auto mb-2 text-zinc-400" />
            Loading customer details...
          </div>
        ) : customerDetails ? (
          <div className="space-y-6">
            {/* Account Info Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-3.5 dark:border-zinc-850 dark:bg-zinc-900/50">
                <p className="text-[10px] font-semibold uppercase text-zinc-400">Customer</p>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm mt-0.5">
                  {customerDetails.name}
                </p>
                <p className="text-zinc-500 mt-0.5">{customerDetails.email}</p>
                <div className="mt-2.5">
                  {customerDetails.isActive ? (
                    <Badge variant="success">Active Account</Badge>
                  ) : (
                    <Badge variant="warning">Deactivated</Badge>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-3.5 dark:border-zinc-850 dark:bg-zinc-900/50">
                <p className="text-[10px] font-semibold uppercase text-zinc-400">Commerce Activity</p>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm mt-0.5">
                  ₹{(customerDetails.totalSpent || 0).toFixed(2)}
                </p>
                <p className="text-zinc-500 mt-0.5">
                  {customerDetails.totalOrders} total orders ({customerDetails.paidOrdersCount} paid)
                </p>
                <p className="text-[11px] text-zinc-400 mt-2">
                  Customer ID #{customerDetails.id}
                </p>
              </div>
            </div>

            {/* Order History */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                Order History ({customerDetails.orders?.length || 0})
              </h3>

              {customerDetails.orders && customerDetails.orders.length > 0 ? (
                <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-950">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-100 bg-zinc-50/50 text-[10px] font-semibold uppercase text-zinc-400 dark:border-zinc-850 dark:bg-zinc-900/40">
                        <th className="px-3 py-2.5">Order ID</th>
                        <th className="px-3 py-2.5">Items</th>
                        <th className="px-3 py-2.5">Total</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5 text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
                      {customerDetails.orders.map((ord) => (
                        <tr key={ord.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40">
                          <td className="px-3 py-2 font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                            #{ord.id}
                          </td>
                          <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                            {ord.itemCount} items
                          </td>
                          <td className="px-3 py-2 font-semibold text-zinc-900 dark:text-zinc-100">
                            ₹{ord.totalAmount.toFixed(2)}
                          </td>
                          <td className="px-3 py-2">
                            {ord.status === "PAID" ? (
                              <Badge variant="success">Paid</Badge>
                            ) : ord.status === "PAYMENT_PENDING" ? (
                              <Badge variant="warning">Pending</Badge>
                            ) : ord.status === "CANCELLED" ? (
                              <Badge variant="outline">Cancelled</Badge>
                            ) : (
                              <Badge variant="destructive">Failed</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-400 text-[11px]">
                            {new Date(ord.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center text-xs text-zinc-400 dark:border-zinc-800">
                  No orders placed by this customer yet.
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailsModalOpen(false)}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Modal: Confirm Activate / Deactivate Account */}
      <Modal
        isOpen={Boolean(confirmToggleTarget)}
        onClose={() => setConfirmToggleTarget(null)}
        title={
          confirmToggleTarget?.emailVerifiedAt
            ? "Deactivate Customer Account"
            : "Activate Customer Account"
        }
        size="sm"
      >
        {confirmToggleTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  {confirmToggleTarget.emailVerifiedAt
                    ? `Deactivate account for “${confirmToggleTarget.name}”?`
                    : `Activate account for “${confirmToggleTarget.name}”?`}
                </p>
                <p className="text-amber-700 dark:text-amber-300 text-[11px] mt-1">
                  {confirmToggleTarget.emailVerifiedAt
                    ? "Deactivating will immediately revoke all active sessions and block the customer from logging in until re-activated."
                    : "Activating will allow this customer to log in and access the storefront."}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmToggleTarget(null)}
                disabled={toggling}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleToggleStatus}
                disabled={toggling}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors ${
                  confirmToggleTarget.emailVerifiedAt
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {toggling && <LoaderCircle size={13} className="animate-spin" />}
                <span>
                  {confirmToggleTarget.emailVerifiedAt ? "Confirm Deactivation" : "Confirm Activation"}
                </span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Reset Customer Password */}
      <Modal
        isOpen={Boolean(passwordTarget)}
        onClose={() => setPasswordTarget(null)}
        title={`Reset Password for ${passwordTarget?.name || "Customer"}`}
        size="sm"
      >
        {passwordTarget && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <p className="text-xs text-zinc-500">
              Set a new secure password for <strong className="text-zinc-800 dark:text-zinc-200">{passwordTarget.email}</strong>. Active sessions for this account will be revoked.
            </p>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters..."
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPasswordTarget(null)}
                disabled={resettingPassword}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={resettingPassword}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              >
                {resettingPassword && <LoaderCircle size={13} className="animate-spin" />}
                <span>Set New Password</span>
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
