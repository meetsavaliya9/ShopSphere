"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Tags,
  TicketPercent,
  Users,
  X
} from "lucide-react";
import { useAuth } from "../auth-provider";

export const ADMIN_NAV_GROUPS = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", href: "/admin", icon: LayoutDashboard }
    ]
  },
  {
    title: "Catalog",
    items: [
      { title: "Products", href: "/admin/products", icon: Package },
      { title: "Categories", href: "/admin/categories", icon: Tags },
      { title: "Inventory", href: "/admin/inventory", icon: Boxes }
    ]
  },
  {
    title: "Sales",
    items: [
      { title: "Orders", href: "/admin/orders", icon: ShoppingCart }
    ]
  },
  {
    title: "Customers",
    items: [
      { title: "Customers", href: "/admin/customers", icon: Users }
    ]
  },
  {
    title: "Finance",
    items: [
      { title: "Payments", href: "/admin/payments", icon: CreditCard }
    ]
  },
  {
    title: "Marketing",
    items: [
      { title: "Coupons", href: "/admin/coupons", icon: TicketPercent }
    ]
  },
  {
    title: "Analytics",
    items: [
      { title: "Reports", href: "/admin/reports", icon: BarChart3 }
    ]
  },
  {
    title: "System",
    items: [
      { title: "Website Controls", href: "/admin/controls", icon: SlidersHorizontal },
      { title: "Roles & Access", href: "/admin/roles", icon: ShieldCheck },
      { title: "Settings", href: "/admin/settings", icon: Settings }
    ]
  }
];

export function AdminSidebar({
  isCollapsed,
  setIsCollapsed,
  mobileOpen,
  setMobileOpen,
  navGroups = ADMIN_NAV_GROUPS,
  basePath = "/admin",
  panelLabel = "Admin Panel"
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col border-r border-zinc-200 bg-white transition-all duration-300 dark:border-zinc-800 dark:bg-zinc-950 ${
          isCollapsed ? "w-[68px]" : "w-[260px]"
        } ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-zinc-200 dark:border-zinc-800">
          <Link
            href={basePath}
            className={`flex items-center gap-2.5 overflow-hidden transition-opacity ${
              isCollapsed ? "justify-center w-full" : ""
            }`}
            onClick={() => setMobileOpen(false)}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white font-bold text-sm dark:bg-zinc-50 dark:text-zinc-900">
              SS
            </div>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-serif font-bold text-sm tracking-tight text-zinc-900 dark:text-zinc-50 truncate">
                  ShopSphere
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  {panelLabel}
                </span>
              </div>
            )}
          </Link>

          {/* Mobile close button */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 lg:hidden"
          >
            <X size={18} />
          </button>

          {/* Desktop collapse toggle */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-850 dark:hover:text-zinc-100 transition-colors"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Navigation Groups */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {navGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1">
              {!isCollapsed && (
                <p className="px-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.href === basePath
                      ? pathname === basePath
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      title={isCollapsed ? item.title : undefined}
                      className={`group flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-medium transition-all ${
                        isActive
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs font-semibold"
                          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                      } ${isCollapsed ? "justify-center px-0" : ""}`}
                    >
                      <Icon
                        size={17}
                        className={`shrink-0 transition-colors ${
                          isActive
                            ? "text-white dark:text-zinc-900"
                            : "text-zinc-500 group-hover:text-zinc-900 dark:text-zinc-400 dark:group-hover:text-zinc-100"
                        }`}
                      />
                      {!isCollapsed && <span className="truncate">{item.title}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="border-t border-zinc-200 p-3 dark:border-zinc-800 space-y-1">
          {/* Quick link to Storefront */}
          <Link
            href="/"
            title={isCollapsed ? "View Store" : undefined}
            className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 transition-colors ${
              isCollapsed ? "justify-center px-0" : ""
            }`}
          >
            <Store size={16} className="shrink-0 text-zinc-500" />
            {!isCollapsed && <span className="truncate">Storefront</span>}
          </Link>

          {/* User Sign Out */}
          <button
            type="button"
            onClick={logout}
            title={isCollapsed ? "Sign Out" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/50 transition-colors ${
              isCollapsed ? "justify-center px-0" : ""
            }`}
          >
            <LogOut size={16} className="shrink-0 text-rose-500" />
            {!isCollapsed && <span className="truncate">Sign Out</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
