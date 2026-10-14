"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  Command,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Shield,
  Sun,
  User,
  X
} from "lucide-react";
import { useAuth } from "../auth-provider";
import { ADMIN_NAV_GROUPS } from "./admin-sidebar";

const PANEL_THEME_KEY = "shopsphere-panel-theme";

export function AdminHeader({
  setMobileOpen,
  navGroups = ADMIN_NAV_GROUPS,
  basePath = "/admin",
  panelLabel = "Admin"
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(false);

  const profileRef = useRef(null);
  const notifRef = useRef(null);
  const searchInputRef = useRef(null);

  useLayoutEffect(() => {
    let savedTheme;
    try {
      savedTheme = window.localStorage.getItem(PANEL_THEME_KEY);
    } catch (error) {
      console.error("The panel theme preference could not be read:", error);
    }
    const isDark = savedTheme
      ? savedTheme === "dark"
      : document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", isDark);
    setIsDarkMode(isDark);
  }, []);

  function toggleDarkMode() {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
    try {
      window.localStorage.setItem(PANEL_THEME_KEY, nextDark ? "dark" : "light");
    } catch (error) {
      console.error("The panel theme preference could not be saved:", error);
    }
  }

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + K to open search modal
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchModalOpen(true);
      }
      if (e.key === "Escape") {
        setSearchModalOpen(false);
        setNotificationsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (searchModalOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery("");
    }
  }, [searchModalOpen]);

  // Derive breadcrumbs from pathname
  const segments = pathname.replace(new RegExp(`^${basePath.replace("/", "\\/")}`), "").split("/").filter(Boolean);
  const pageTitle = segments.length > 0
    ? segments[segments.length - 1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Overview";

  // Filter searchable navigation pages
  const allNavItems = navGroups.flatMap((g) => g.items);
  const filteredNavItems = searchQuery.trim()
    ? allNavItems.filter((item) =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allNavItems;

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-zinc-200 bg-white/95 px-4 sm:px-6 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95">
        {/* Left: Mobile trigger & Breadcrumbs */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-850 lg:hidden"
            aria-label="Open mobile sidebar"
          >
            <Menu size={18} />
          </button>

          <nav className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400" aria-label="Breadcrumb">
            <Link href={basePath} className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
              {panelLabel}
            </Link>
            <ChevronRight size={12} className="text-zinc-400" />
            <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[150px] sm:max-w-none">
              {pageTitle}
            </span>
          </nav>
        </div>

        {/* Right: Search, Notifications, Theme, Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Global Search Shortcut Button */}
          <button
            type="button"
            onClick={() => setSearchModalOpen(true)}
            className="hidden sm:flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-1.5 text-xs text-zinc-500 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-850 transition-colors"
          >
            <Search size={14} />
            <span>Search modules...</span>
            <kbd className="pointer-events-none ml-2 hidden sm:inline-flex h-4 items-center gap-0.5 rounded border border-zinc-300 bg-white px-1 text-[10px] font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              <Command size={10} />K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => setSearchModalOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-850 sm:hidden"
            aria-label="Search"
          >
            <Search size={17} />
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleDarkMode}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-850 transition-colors"
            aria-label="Toggle theme"
            aria-pressed={isDarkMode}
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Notifications Dropdown */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotificationsOpen((open) => !open)}
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-850 transition-colors"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              aria-controls="panel-notifications"
            >
              <Bell size={16} />
            </button>

            {notificationsOpen && (
              <div id="panel-notifications" className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-zinc-200 bg-white p-4 shadow-xl ring-1 ring-black/5 dark:border-zinc-800 dark:bg-zinc-950 z-50">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-850">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                    Notifications
                  </h3>
                </div>
                <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                  Notifications are not available yet.
                </p>
              </div>
            )}
          </div>

          {/* Profile Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 p-1.5 sm:px-2.5 sm:py-1.5 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-850 transition-colors"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                {user?.name ? user.name[0].toUpperCase() : "A"}
              </div>
              <span className="hidden sm:inline text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                {user?.name || "Admin"}
              </span>
              <ChevronDown size={13} className={`hidden sm:inline text-zinc-400 transition-transform ${profileOpen ? "rotate-180" : ""}`} />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl ring-1 ring-black/5 dark:border-zinc-800 dark:bg-zinc-950 z-50">
                <div className="px-2.5 py-2 border-b border-zinc-100 dark:border-zinc-850 mb-1">
                  <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-50 truncate">{user?.name || "Admin User"}</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{user?.email || "admin@example.com"}</p>
                  <span className="mt-1 inline-block rounded bg-zinc-100 px-1.5 py-0.2 text-[9px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {user?.role || "ADMIN"}
                  </span>
                </div>
                {basePath === "/admin" ? (
                  <>
                    <Link
                      href="/admin/settings"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 transition-colors"
                    >
                      <User size={15} />
                      Admin Profile
                    </Link>
                    <Link
                      href="/admin/roles"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 transition-colors"
                    >
                      <Shield size={15} />
                      Roles & Permissions
                    </Link>
                    <Link
                      href="/admin/settings"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 transition-colors"
                    >
                      <Settings size={15} />
                      Store Settings
                    </Link>
                  </>
                ) : (
                  <Link
                    href="/account"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 transition-colors"
                  >
                    <User size={15} />
                    Account
                  </Link>
                )}
                <div className="my-1 border-t border-zinc-100 dark:border-zinc-850" />
                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition-colors"
                >
                  <LogOut size={15} />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Command / Search Modal */}
      {searchModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSearchModalOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden">
            <div className="flex items-center border-b border-zinc-100 px-3.5 py-3 dark:border-zinc-850">
              <Search size={18} className="text-zinc-400 mr-2.5 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${panelLabel.toLowerCase()} pages, sections...`}
                className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-50"
              />
              <button
                type="button"
                onClick={() => setSearchModalOpen(false)}
                className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-2 space-y-1">
              {filteredNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => {
                      setSearchModalOpen(false);
                      router.push(item.href);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 transition-colors"
                  >
                    <Icon size={16} className="text-zinc-400" />
                    <span>{item.title}</span>
                    <span className="ml-auto text-[10px] text-zinc-400 font-mono">{item.href}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
