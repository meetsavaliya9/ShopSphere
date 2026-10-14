"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  MapPin,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  User,
  XCircle
} from "lucide-react";
import { authRequest } from "../../../lib/api/auth";
import { useAuth } from "../../../components/auth-provider";
import { Badge } from "../../../components/admin/badge";
import { Modal } from "../../../components/admin/modal";

export default function AdminOrdersPage() {
  const { csrfToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState("");

  const loadOrders = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const q = new URLSearchParams();
      if (statusFilter !== "ALL") q.set("status", statusFilter);
      if (search.trim()) q.set("search", search.trim());
      const res = await authRequest(`admin/orders?${q.toString()}`);
      setOrders(Array.isArray(res) ? res : res?.data || []);
      setStatus("ready");
    } catch (err) {
      setError(err.message || "Failed to load orders.");
      setStatus("error");
    }
  }, [statusFilter, search]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  function openDetails(order) {
    setSelectedOrder(order);
    setNewStatus(order.status);
    setDetailsModalOpen(true);
  }

  async function handleUpdateStatus(e) {
    e.preventDefault();
    if (!selectedOrder) return;
    setUpdatingStatus(true);
    setError("");
    setNotice("");
    try {
      await authRequest(`admin/orders/${selectedOrder.id}/status`, {
        method: "PATCH",
        body: { status: newStatus },
        csrfToken
      });
      setNotice(`Order #${selectedOrder.id} status updated to ${newStatus}.`);
      setDetailsModalOpen(false);
      await loadOrders();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Order Management
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            View orders, customer addresses, Razorpay payment verification, and fulfillment states.
          </p>
        </div>

        <button
          type="button"
          onClick={loadOrders}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
        >
          <RefreshCw size={13} className={status === "loading" ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: "All Orders", value: "ALL" },
            { label: "Paid", value: "PAID" },
            { label: "Pending", value: "PAYMENT_PENDING" },
            { label: "Failed", value: "PAYMENT_FAILED" }
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                statusFilter === tab.value
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-850"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative max-w-xs w-full">
          <Search size={14} className="absolute left-3 top-2.5 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID, name, email..."
            className="w-full rounded-lg border border-zinc-200 bg-transparent py-1.5 pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-2xs overflow-hidden dark:border-zinc-800 dark:bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Items</th>
                <th className="py-3 px-4">Total Amount</th>
                <th className="py-3 px-4">Order Status</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
              {orders.length > 0 ? (
                orders.map((o) => (
                  <tr key={o.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-zinc-900 dark:text-zinc-100">
                      #{o.id}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100">{o.user?.name || "Customer"}</p>
                      <p className="text-[11px] text-zinc-400">{o.user?.email || "N/A"}</p>
                    </td>
                    <td className="py-3 px-4 text-zinc-600 dark:text-zinc-300">
                      {o.items?.length || 0} {(o.items?.length || 0) === 1 ? "item" : "items"}
                    </td>
                    <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-zinc-100">
                      ₹{Number(o.totalAmount).toFixed(2)}
                    </td>
                    <td className="py-3 px-4">
                      {o.status === "PAID" ? (
                        <Badge variant="success">Paid</Badge>
                      ) : o.status === "PAYMENT_PENDING" ? (
                        <Badge variant="warning">Pending</Badge>
                      ) : (
                        <Badge variant="destructive">Failed</Badge>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {o.payment?.status === "CAPTURED" ? (
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Captured</span>
                      ) : o.payment?.status === "FAILED" ? (
                        <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">Failed</span>
                      ) : (
                        <span className="text-[11px] text-zinc-400">Pending</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-zinc-400 text-[11px]">
                      {new Date(o.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => openDetails(o)}
                        className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-850 transition-colors"
                      >
                        <Eye size={12} />
                        <span>Details</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-zinc-400">
                    No orders found matching criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <Modal
          isOpen={detailsModalOpen}
          onClose={() => setDetailsModalOpen(false)}
          title={`Order #${selectedOrder.id} Details`}
          description={`Placed on ${new Date(selectedOrder.createdAt).toLocaleString("en-US")} · Total ₹${selectedOrder.totalAmount.toFixed(2)}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-5">
            {/* Customer & Shipping Information Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                <div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  <User size={14} />
                  <span>Customer</span>
                </div>
                <p className="font-medium text-zinc-800 dark:text-zinc-200">{selectedOrder.user?.name}</p>
                <p className="text-zinc-500 dark:text-zinc-400 text-[11px]">{selectedOrder.user?.email}</p>
                <p className="text-[10px] text-zinc-400 mt-1">User ID #{selectedOrder.userId}</p>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                <div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  <MapPin size={14} />
                  <span>Shipping Address</span>
                </div>
                {selectedOrder.shippingAddress ? (
                  <div className="text-[11px] text-zinc-600 dark:text-zinc-300 space-y-0.5 leading-relaxed">
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200">{selectedOrder.shippingAddress.fullName}</p>
                    <p>{selectedOrder.shippingAddress.addressLine1} {selectedOrder.shippingAddress.addressLine2}</p>
                    <p>{selectedOrder.shippingAddress.city}, {selectedOrder.shippingAddress.state} - {selectedOrder.shippingAddress.postalCode}</p>
                    <p>Phone: {selectedOrder.shippingAddress.phone}</p>
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-400 italic">No shipping address recorded</p>
                )}
              </div>
            </div>

            {/* Order Items Table */}
            <div>
              <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Purchased Items</h4>
              <div className="rounded-lg border border-zinc-200 overflow-hidden dark:border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 text-[10px] uppercase font-semibold text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                    <tr>
                      <th className="py-2 px-3">Item</th>
                      <th className="py-2 px-3">Quantity</th>
                      <th className="py-2 px-3">Unit Price</th>
                      <th className="py-2 px-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
                    {selectedOrder.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2.5 px-3 font-medium text-zinc-900 dark:text-zinc-100">
                          {item.productName}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300">
                          {item.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300">
                          ₹{item.unitPrice.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-zinc-900 dark:text-zinc-100">
                          ₹{(item.unitPrice * item.quantity).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Details */}
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">Razorpay Payment Audit</h4>
              {selectedOrder.payment ? (
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-zinc-400">Razorpay Order ID:</span>
                    <p className="font-mono text-zinc-700 dark:text-zinc-300">{selectedOrder.payment.razorpayOrderId || "N/A"}</p>
                  </div>
                  <div>
                    <span className="text-zinc-400">Razorpay Payment ID:</span>
                    <p className="font-mono text-zinc-700 dark:text-zinc-300">{selectedOrder.payment.razorpayPaymentId || "N/A"}</p>
                  </div>
                  <div>
                    <span className="text-zinc-400">Amount & Currency:</span>
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200">₹{selectedOrder.payment.amount} {selectedOrder.payment.currency}</p>
                  </div>
                  <div>
                    <span className="text-zinc-400">Verification Status:</span>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400">{selectedOrder.payment.status}</p>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-zinc-400 italic">No Razorpay payment transaction attached.</p>
              )}
            </div>

            {/* Status Transition Control */}
            <form onSubmit={handleUpdateStatus} className="border-t border-zinc-200 pt-4 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">Update Status:</span>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  disabled={selectedOrder.status === "PAID" || selectedOrder.status === "CANCELLED"}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 outline-none"
                >
                  {["PAID", "CANCELLED"].includes(selectedOrder.status) && (
                    <option value={selectedOrder.status} disabled>
                      {selectedOrder.status}{selectedOrder.status === "PAID" ? " (provider verified)" : ""}
                    </option>
                  )}
                  <option value="PAYMENT_PENDING">PAYMENT_PENDING</option>
                  <option value="PAYMENT_FAILED">PAYMENT_FAILED</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDetailsModalOpen(false)}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={updatingStatus || newStatus === selectedOrder.status || ["PAID", "CANCELLED"].includes(selectedOrder.status)}
                  className="rounded-lg bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
                >
                  {updatingStatus ? "Saving..." : "Save Status"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
