"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Edit2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  TicketPercent,
  Trash2,
  X,
  XCircle
} from "lucide-react";
import { authRequest } from "../../../lib/api/auth";
import { useAuth } from "../../../components/auth-provider";
import { Badge } from "../../../components/admin/badge";
import { Modal } from "../../../components/admin/modal";
import { StatCard } from "../../../components/admin/stat-card";

const initialForm = {
  code: "",
  discountType: "PERCENTAGE",
  discount: 10,
  minSpend: 0,
  usageLimit: "",
  startsAt: "",
  expiresAt: "",
  description: ""
};

export default function AdminCouponsPage() {
  const { csrfToken } = useAuth();
  const [coupons, setCoupons] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Create / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [formData, setFormData] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Toggle active status
  const [togglingId, setTogglingId] = useState(null);

  const loadCoupons = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const response = await authRequest("admin/coupons");
      const list = Array.isArray(response) ? response : response?.data || [];
      setCoupons(list);
      setStatus("ready");
    } catch (err) {
      setError(err.message || "Failed to load coupons.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  function openCreateModal() {
    setEditingCoupon(null);
    setFormData(initialForm);
    setError("");
    setModalOpen(true);
  }

  function openEditModal(coupon) {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      discountType: coupon.discountType || "PERCENTAGE",
      discount: coupon.discount,
      minSpend: coupon.minSpend || 0,
      usageLimit: coupon.usageLimit || "",
      startsAt: coupon.startsAt ? new Date(coupon.startsAt).toISOString().slice(0, 16) : "",
      expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().slice(0, 16) : "",
      description: coupon.description || ""
    });
    setError("");
    setModalOpen(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        code: formData.code.trim().toUpperCase(),
        discountType: formData.discountType,
        discount: Number(formData.discount),
        minSpend: Number(formData.minSpend || 0),
        usageLimit: formData.usageLimit ? Number(formData.usageLimit) : null,
        startsAt: formData.startsAt ? new Date(formData.startsAt).toISOString() : null,
        expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : null,
        description: formData.description.trim() || null
      };

      if (editingCoupon) {
        await authRequest(`admin/coupons/${editingCoupon.id}`, {
          method: "PATCH",
          body: payload,
          csrfToken
        });
        setNotice(`Coupon ${payload.code} updated.`);
      } else {
        await authRequest("admin/coupons", {
          method: "POST",
          body: payload,
          csrfToken
        });
        setNotice(`Coupon ${payload.code} created.`);
      }

      setModalOpen(false);
      await loadCoupons();
    } catch (err) {
      setError(err.message || "Failed to save coupon.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(coupon) {
    setTogglingId(coupon.id);
    setError("");
    setNotice("");
    const nextState = !coupon.isActive;
    try {
      await authRequest(`admin/coupons/${coupon.id}`, {
        method: "PATCH",
        body: { isActive: nextState },
        csrfToken
      });
      setNotice(`Coupon ${coupon.code} is now ${nextState ? "active" : "deactivated"}.`);
      await loadCoupons();
    } catch (err) {
      setError(err.message || "Failed to update coupon status.");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      await authRequest(`admin/coupons/${deleteTarget.id}`, {
        method: "DELETE",
        csrfToken
      });
      setNotice(`Coupon ${deleteTarget.code} deleted.`);
      setDeleteTarget(null);
      await loadCoupons();
    } catch (err) {
      setError(err.message || "Failed to delete coupon.");
    } finally {
      setDeleting(false);
    }
  }

  // Filtered coupons
  const filteredCoupons = useMemo(() => {
    const now = new Date();
    return coupons.filter((c) => {
      const matchesSearch =
        c.code.toLowerCase().includes(search.toLowerCase()) ||
        (c.description || "").toLowerCase().includes(search.toLowerCase());
      const isExpired = c.expiresAt && new Date(c.expiresAt) < now;
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && c.isActive && !isExpired) ||
        (statusFilter === "INACTIVE" && !c.isActive) ||
        (statusFilter === "EXPIRED" && isExpired);
      return matchesSearch && matchesStatus;
    });
  }, [coupons, search, statusFilter]);

  // Aggregate stats
  const stats = useMemo(() => {
    const now = new Date();
    const total = coupons.length;
    const active = coupons.filter((c) => c.isActive && (!c.expiresAt || new Date(c.expiresAt) >= now)).length;
    const inactive = coupons.filter((c) => !c.isActive).length;
    const totalUsage = coupons.reduce((sum, c) => sum + (c.usageCount || 0), 0);
    return { total, active, inactive, totalUsage };
  }, [coupons]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Coupons & Discounts
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Create discount codes, set spend thresholds, usage limits, and validity periods.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            <Plus size={13} />
            <span>Create Coupon</span>
          </button>

          <button
            type="button"
            onClick={loadCoupons}
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

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Coupons"
          value={stats.total}
          description="Promotional discount rules created"
          icon={TicketPercent}
        />
        <StatCard
          title="Active Discounts"
          value={stats.active}
          description="Ready to apply at checkout"
          icon={CheckCircle2}
        />
        <StatCard
          title="Inactive / Paused"
          value={stats.inactive}
          description="Disabled or expired coupons"
          icon={XCircle}
        />
        <StatCard
          title="Total Redemptions"
          value={stats.totalUsage}
          description="Completed order discount applications"
          icon={Clock}
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search coupons by code or description..."
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50/50 pl-9 pr-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50/50 p-1 text-xs dark:border-zinc-800 dark:bg-zinc-900">
            {["ALL", "ACTIVE", "INACTIVE", "EXPIRED"].map((flt) => (
              <button
                key={flt}
                type="button"
                onClick={() => setStatusFilter(flt)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition-all ${
                  statusFilter === flt
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {flt === "ALL" ? "All" : flt === "ACTIVE" ? "Active" : flt === "INACTIVE" ? "Inactive" : "Expired"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Coupons Table */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-2xs overflow-hidden dark:border-zinc-800 dark:bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-850 dark:bg-zinc-900/40 text-[10px] font-semibold uppercase text-zinc-400 tracking-wider">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Min Spend</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Usage</th>
                <th className="px-4 py-3">Validity</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
              {status === "loading" && !coupons.length ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-400">
                    <LoaderCircle size={20} className="animate-spin mx-auto mb-2 text-zinc-400" />
                    Loading coupons...
                  </td>
                </tr>
              ) : filteredCoupons.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-400">
                    No coupons found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredCoupons.map((coupon) => {
                  const now = new Date();
                  const isExpired = coupon.expiresAt && new Date(coupon.expiresAt) < now;
                  return (
                    <tr key={coupon.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/50 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs bg-zinc-100 dark:bg-zinc-850 text-zinc-900 dark:text-zinc-100 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700">
                            {coupon.code}
                          </span>
                        </div>
                        {coupon.description && (
                          <p className="text-[11px] text-zinc-400 mt-1 truncate max-w-xs">{coupon.description}</p>
                        )}
                      </td>

                      <td className="px-4 py-3.5 font-semibold text-zinc-900 dark:text-zinc-100">
                        {coupon.discountType === "PERCENTAGE" ? `${coupon.discount}% off` : `₹${coupon.discount} off`}
                      </td>

                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-300">
                        ₹{Number(coupon.minSpend || 0).toFixed(2)}
                      </td>

                      <td className="px-4 py-3.5">
                        {isExpired ? (
                          <Badge variant="outline">Expired</Badge>
                        ) : coupon.isActive ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="warning">Paused</Badge>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-300">
                        {coupon.usageCount || 0}
                        {coupon.usageLimit ? ` / ${coupon.usageLimit}` : " / ∞"}
                      </td>

                      <td className="px-4 py-3.5 text-[11px] text-zinc-500">
                        {coupon.expiresAt ? (
                          <span>Expires {new Date(coupon.expiresAt).toLocaleDateString()}</span>
                        ) : (
                          <span className="text-zinc-400">No expiration</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Toggle Active */}
                          <button
                            type="button"
                            onClick={() => handleToggleActive(coupon)}
                            disabled={togglingId === coupon.id}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                              coupon.isActive
                                ? "border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900/50 dark:text-amber-400"
                                : "border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-400"
                            }`}
                          >
                            {togglingId === coupon.id ? (
                              <LoaderCircle size={11} className="animate-spin" />
                            ) : null}
                            <span>{coupon.isActive ? "Pause" : "Activate"}</span>
                          </button>

                          {/* Edit */}
                          <button
                            type="button"
                            onClick={() => openEditModal(coupon)}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                            title="Edit coupon"
                          >
                            <Edit2 size={12} />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(coupon)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:bg-zinc-900 dark:text-rose-400"
                            title="Delete coupon"
                          >
                            <Trash2 size={12} />
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
      </div>

      {/* Modal: Create or Edit Coupon */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCoupon ? `Edit Coupon — ${editingCoupon.code}` : "Create New Coupon"}
        size="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Coupon Code *
              </label>
              <input
                type="text"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g. FESTIVE20"
                className="w-full uppercase font-mono font-bold rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Discount Type
              </label>
              <select
                value={formData.discountType}
                onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed Amount (₹ INR)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Discount Value * {formData.discountType === "PERCENTAGE" ? "(1 - 100%)" : "(₹ INR)"}
              </label>
              <input
                type="number"
                required
                min={1}
                max={formData.discountType === "PERCENTAGE" ? 100 : 100000}
                value={formData.discount}
                onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Minimum Spend (₹ INR)
              </label>
              <input
                type="number"
                min={0}
                value={formData.minSpend}
                onChange={(e) => setFormData({ ...formData, minSpend: e.target.value })}
                placeholder="0 for no minimum"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Usage Limit (Optional)
              </label>
              <input
                type="number"
                min={1}
                value={formData.usageLimit}
                onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                placeholder="Leave blank for unlimited"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Expires At (Optional)
              </label>
              <input
                type="datetime-local"
                value={formData.expiresAt}
                onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Description (Optional)
            </label>
            <input
              type="text"
              maxLength={255}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g. 20% discount on orders above ₹1,000"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              disabled={saving}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
            >
              {saving && <LoaderCircle size={13} className="animate-spin" />}
              <span>{editingCoupon ? "Save Changes" : "Create Coupon"}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Delete Confirmation */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Coupon"
        size="sm"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Are you sure you want to permanently delete coupon{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">“{deleteTarget.code}”</strong>? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition-colors"
              >
                {deleting && <LoaderCircle size={13} className="animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
