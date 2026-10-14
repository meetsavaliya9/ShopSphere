"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Eye,
  FileText,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
  XCircle
} from "lucide-react";
import { authRequest } from "../../../lib/api/auth";
import { Badge } from "../../../components/admin/badge";
import { Modal } from "../../../components/admin/modal";
import { StatCard } from "../../../components/admin/stat-card";

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  // Details modal
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const loadPayments = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const response = await authRequest("admin/payments");
      const data = Array.isArray(response) ? response : response?.data || [];
      setPayments(data);
      setStatus("ready");
    } catch (err) {
      setError(err.message || "Failed to load payment transactions.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  function openDetails(payment) {
    setSelectedPayment(payment);
    setDetailsModalOpen(true);
  }

  // Export payments to CSV
  function exportCSV() {
    if (!payments.length) return;
    const headers = [
      "Payment ID",
      "Order ID",
      "Customer Name",
      "Customer Email",
      "Amount (INR)",
      "Currency",
      "Status",
      "Razorpay Order ID",
      "Razorpay Payment ID",
      "Date"
    ];
    const rows = filteredPayments.map((p) => [
      p.id,
      p.orderId,
      `"${(p.customerName || "").replaceAll('"', '""')}"`,
      `"${(p.customerEmail || "").replaceAll('"', '""')}"`,
      p.amount,
      p.currency || "INR",
      p.status,
      p.razorpayOrderId || "",
      p.razorpayPaymentId || "",
      new Date(p.createdAt).toISOString()
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `shopsphere-payments-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Filter payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const query = search.toLowerCase();
      const matchesSearch =
        String(p.orderId).includes(query) ||
        String(p.id).includes(query) ||
        (p.customerName || "").toLowerCase().includes(query) ||
        (p.customerEmail || "").toLowerCase().includes(query) ||
        (p.razorpayPaymentId || "").toLowerCase().includes(query) ||
        (p.razorpayOrderId || "").toLowerCase().includes(query);
      const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [payments, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / pageSize));
  const paginatedPayments = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredPayments.slice(start, start + pageSize);
  }, [filteredPayments, page, pageSize]);

  // Summary statistics
  const stats = useMemo(() => {
    const captured = payments.filter((p) => p.status === "CAPTURED");
    const pending = payments.filter((p) => p.status === "PENDING");
    const failed = payments.filter((p) => p.status === "FAILED");
    const totalRevenue = captured.reduce((sum, p) => sum + (p.amount || 0), 0);
    return {
      total: payments.length,
      capturedCount: captured.length,
      totalRevenue,
      pendingCount: pending.length,
      failedCount: failed.length
    };
  }, [payments]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Payment Transactions
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Review Razorpay payment states, transaction identifiers, and captured revenues.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCSV}
            disabled={!filteredPayments.length}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={loadPayments}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw size={13} className={status === "loading" ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Error alert */}
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
          title="Captured Revenue"
          value={`₹${stats.totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
          description={`${stats.capturedCount} successfully captured payments`}
          icon={CreditCard}
        />
        <StatCard
          title="Total Transactions"
          value={stats.total}
          description="All payment attempts recorded"
          icon={FileText}
        />
        <StatCard
          title="Pending Payments"
          value={stats.pendingCount}
          description="Awaiting Razorpay confirmation"
          icon={Clock}
        />
        <StatCard
          title="Failed Payments"
          value={stats.failedCount}
          description="Declined or abandoned checkouts"
          icon={XCircle}
        />
      </div>

      {/* Filter and Search Bar */}
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
            placeholder="Search by order ID, customer, or Razorpay payment ID..."
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50/50 pl-9 pr-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50/50 p-1 text-xs dark:border-zinc-800 dark:bg-zinc-900">
            {["ALL", "CAPTURED", "PENDING", "FAILED"].map((flt) => (
              <button
                key={flt}
                type="button"
                onClick={() => {
                  setStatusFilter(flt);
                  setPage(1);
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition-all ${
                  statusFilter === flt
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {flt === "ALL" ? "All" : flt === "CAPTURED" ? "Captured" : flt === "PENDING" ? "Pending" : "Failed"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-2xs overflow-hidden dark:border-zinc-800 dark:bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-850 dark:bg-zinc-900/40 text-[10px] font-semibold uppercase text-zinc-400 tracking-wider">
                <th className="px-4 py-3">Transaction ID</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Razorpay ID</th>
                <th className="px-4 py-3 text-right">Date</th>
                <th className="px-4 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
              {status === "loading" && !payments.length ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-400">
                    <LoaderCircle size={20} className="animate-spin mx-auto mb-2 text-zinc-400" />
                    Loading payment records...
                  </td>
                </tr>
              ) : paginatedPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-400">
                    No payment transactions found.
                  </td>
                </tr>
              ) : (
                paginatedPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/50 transition-colors">
                    <td className="px-4 py-3.5 font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      TXN-{p.id}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-zinc-700 dark:text-zinc-300">
                      #{p.orderId}
                    </td>

                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{p.customerName}</p>
                      <p className="text-[11px] text-zinc-400 truncate">{p.customerEmail}</p>
                    </td>

                    <td className="px-4 py-3.5 font-semibold text-zinc-900 dark:text-zinc-100">
                      ₹{Number(p.amount).toFixed(2)}
                    </td>

                    <td className="px-4 py-3.5">
                      {p.status === "CAPTURED" ? (
                        <Badge variant="success">Captured</Badge>
                      ) : p.status === "PENDING" ? (
                        <Badge variant="warning">Pending</Badge>
                      ) : (
                        <Badge variant="destructive">Failed</Badge>
                      )}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-[11px] text-zinc-500 truncate max-w-[140px]">
                      {p.razorpayPaymentId || p.razorpayOrderId || "—"}
                    </td>

                    <td className="px-4 py-3.5 text-right text-zinc-400 text-[11px]">
                      {new Date(p.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      })}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => openDetails(p)}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <Eye size={12} />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Details Modal */}
      <Modal
        isOpen={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        title={`Payment Details — TXN-${selectedPayment?.id}`}
        size="md"
      >
        {selectedPayment && (
          <div className="space-y-5 text-xs">
            {/* Status and Amount Header */}
            <div className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50/60 p-4 dark:border-zinc-850 dark:bg-zinc-900/50">
              <div>
                <p className="text-[10px] font-semibold uppercase text-zinc-400">Transaction Amount</p>
                <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mt-0.5">
                  ₹{Number(selectedPayment.amount).toFixed(2)} {selectedPayment.currency || "INR"}
                </p>
              </div>
              <div>
                {selectedPayment.status === "CAPTURED" ? (
                  <Badge variant="success">Captured</Badge>
                ) : selectedPayment.status === "PENDING" ? (
                  <Badge variant="warning">Pending</Badge>
                ) : (
                  <Badge variant="destructive">Failed</Badge>
                )}
              </div>
            </div>

            {/* Key-Value Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <span className="text-zinc-400 text-[11px]">Associated Order</span>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 font-mono">
                  Order #{selectedPayment.orderId}
                </p>
              </div>

              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <span className="text-zinc-400 text-[11px]">Customer</span>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 truncate">
                  {selectedPayment.customerName}
                </p>
                <p className="text-[11px] text-zinc-400 truncate">{selectedPayment.customerEmail}</p>
              </div>

              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <span className="text-zinc-400 text-[11px]">Razorpay Payment ID</span>
                <p className="font-mono text-zinc-800 dark:text-zinc-200 mt-0.5 text-[11px] break-all">
                  {selectedPayment.razorpayPaymentId || "Not yet assigned / pending"}
                </p>
              </div>

              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <span className="text-zinc-400 text-[11px]">Razorpay Order ID</span>
                <p className="font-mono text-zinc-800 dark:text-zinc-200 mt-0.5 text-[11px] break-all">
                  {selectedPayment.razorpayOrderId || "Not yet created"}
                </p>
              </div>
            </div>

            {selectedPayment.failureCode && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                <span className="font-semibold">Failure Code:</span> {selectedPayment.failureCode}
              </div>
            )}

            <div className="text-[11px] text-zinc-400 border-t border-zinc-100 pt-3 dark:border-zinc-850 flex justify-between">
              <span>Recorded: {new Date(selectedPayment.createdAt).toLocaleString()}</span>
              {selectedPayment.updatedAt && (
                <span>Updated: {new Date(selectedPayment.updatedAt).toLocaleString()}</span>
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
        )}
      </Modal>
    </div>
  );
}
