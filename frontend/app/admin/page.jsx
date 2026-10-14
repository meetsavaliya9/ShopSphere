"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  CreditCard,
  Download,
  IndianRupee,
  Package,
  Plus,
  RefreshCw,
  ShoppingCart,
  Tags,
  Users
} from "lucide-react";
import { authRequest } from "../../lib/api/auth";
import { StatCard } from "../../components/admin/stat-card";
import { SalesBarChart, StatusDistribution } from "../../components/admin/chart-components";
import { Badge } from "../../components/admin/badge";

export default function AdminOverviewPage() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState("30d");

  const loadOverview = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const response = await authRequest(`admin/overview?range=${dateRange}`);
      setData(response);
      setStatus("ready");
    } catch (err) {
      setError(err.message || "Failed to load dashboard overview.");
      setStatus("error");
    }
  }, [dateRange]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const metrics = data?.metrics || {
    totalRevenue: data?.totalRevenue ?? 0,
    totalOrders: data?.totalOrders ?? 0,
    totalCustomers: data?.users ?? 0,
    totalProducts: data?.products ?? 0,
    inStockProducts: data?.activeProducts ?? 0,
    outOfStockProducts: Math.max(0, (data?.products ?? 0) - (data?.activeProducts ?? 0)),
    pendingOrders: data?.pendingOrders ?? 0,
    completedOrders: data?.completedOrders ?? 0,
    failedOrders: data?.failedOrders ?? 0,
    averageOrderValue: data?.averageOrderValue ?? 0
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Dashboard Overview
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Real-time business performance, orders, and database metrics.
          </p>
        </div>

        {/* Date Filter & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-zinc-200 bg-white p-1 text-xs dark:border-zinc-800 dark:bg-zinc-900">
            {["7d", "30d", "90d", "all"].map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setDateRange(range)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition-all ${
                  dateRange === range
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={loadOverview}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
            title="Refresh metrics"
          >
            <RefreshCw size={13} className={status === "loading" ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <Link
            href="/admin/products"
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            <Plus size={14} />
            <span>Add Product</span>
          </Link>
        </div>
      </div>

      {/* Error Alert */}
      {status === "error" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 flex items-center justify-between">
          <p>{error}</p>
          <button
            onClick={loadOverview}
            className="underline font-semibold hover:text-rose-900"
          >
            Try again
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {status === "loading" && !data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-zinc-200/60 dark:bg-zinc-850" />
          ))}
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Revenue"
          value={`₹${metrics.totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
          description="Verified completed orders with captured payments"
          icon={IndianRupee}
        />
        <StatCard
          title="Total Orders"
          value={metrics.totalOrders}
          description={`${metrics.completedOrders} completed · ${metrics.pendingOrders} pending`}
          icon={ShoppingCart}
        />
        <StatCard
          title="Active Customers"
          value={metrics.totalCustomers}
          description="Registered customer accounts in database"
          icon={Users}
        />
        <StatCard
          title="Catalog Inventory"
          value={metrics.totalProducts}
          description={`${metrics.inStockProducts} in stock · ${metrics.outOfStockProducts} out of stock`}
          icon={Package}
        />
        <StatCard
          title="Categories"
          value={data?.categories ?? 0}
          description="Product categories in catalog"
          icon={Tags}
        />
      </div>

      {/* Low-Stock / Out-of-Stock Alert */}
      {data?.lowStockProducts && data.lowStockProducts.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
            <div>
              <p className="font-semibold">
                {data.lowStockProducts.length} {data.lowStockProducts.length === 1 ? "product is" : "products are"} currently out of stock
              </p>
              <p className="text-amber-700 dark:text-amber-300 text-[11px] mt-0.5">
                Customers cannot purchase out-of-stock items until stock is replenished.
              </p>
            </div>
          </div>
          <Link
            href="/admin/inventory"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 transition-colors shrink-0"
          >
            <span>Review Inventory</span>
            <ArrowUpRight size={13} />
          </Link>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Trend Chart (2 columns) */}
        <div className="lg:col-span-2 rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-850">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Revenue & Sales Analytics
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Revenue and captured orders grouped by day, or by month for all-time.
              </p>
            </div>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded">
              Avg paid order: ₹{metrics.averageOrderValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="pt-2">
            <SalesBarChart data={data?.salesOverTime || []} height={240} />
          </div>
        </div>

        {/* Order Status Distribution (1 column) */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-950 flex flex-col justify-between">
          <div>
            <div className="border-b border-zinc-100 pb-4 dark:border-zinc-850">
              <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Order Status Breakdown
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Distribution across order lifecycle states.
              </p>
            </div>
            <div className="pt-4">
              <StatusDistribution distribution={data?.orderStatusDistribution || []} />
            </div>
          </div>

          <div className="mt-6 border-t border-zinc-100 pt-3 dark:border-zinc-850">
            <Link
              href="/admin/orders"
              className="flex items-center justify-between text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <span>Manage all orders</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* Tables Grid: Recent Orders & Best Sellers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders (2 columns) */}
        <div className="lg:col-span-2 rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-850">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Recent Orders
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Latest customer purchases from the store.
              </p>
            </div>
            <Link
              href="/admin/orders"
              className="text-xs font-semibold text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
            >
              View all →
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto">
            {data?.recentOrders && data.recentOrders.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-zinc-850 text-zinc-400 uppercase text-[10px] font-semibold">
                    <th className="pb-2.5">Order ID</th>
                    <th className="pb-2.5">Customer</th>
                    <th className="pb-2.5">Items</th>
                    <th className="pb-2.5">Total</th>
                    <th className="pb-2.5">Status</th>
                    <th className="pb-2.5 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
                  {data.recentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/50 transition-colors">
                      <td className="py-3 font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                        #{order.id}
                      </td>
                      <td className="py-3">
                        <p className="font-semibold text-zinc-900 dark:text-zinc-100">{order.customerName}</p>
                        <p className="text-[11px] text-zinc-400">{order.customerEmail}</p>
                      </td>
                      <td className="py-3 text-zinc-600 dark:text-zinc-300">
                        {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                      </td>
                      <td className="py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                        ₹{order.totalAmount.toFixed(2)}
                      </td>
                      <td className="py-3">
                        {order.status === "PAID" ? (
                          <Badge variant="success">Paid</Badge>
                        ) : order.status === "PAYMENT_PENDING" ? (
                          <Badge variant="warning">Pending</Badge>
                        ) : (
                          <Badge variant="destructive">Failed</Badge>
                        )}
                      </td>
                      <td className="py-3 text-right text-zinc-400 text-[11px]">
                        {new Date(order.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric"
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-12 text-center text-xs text-zinc-400">
                No orders placed yet.
              </div>
            )}
          </div>
        </div>

        {/* Best Selling Products / Top Catalog (1 column) */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-100 pb-4 dark:border-zinc-850">
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Top Products
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Best-selling items by revenue.
            </p>
          </div>

          <div className="mt-4 space-y-3.5">
            {data?.bestSellingProducts && data.bestSellingProducts.length > 0 ? (
              data.bestSellingProducts.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{p.name}</p>
                    <p className="text-[11px] text-zinc-400">{p.category} · {p.unitsSold} sold</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">₹{p.revenue.toFixed(2)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-xs text-zinc-400">
                No sales recorded for products yet.
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-zinc-100 pt-3 dark:border-zinc-850">
            <Link
              href="/admin/products"
              className="flex items-center justify-between text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <span>Manage catalog</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
