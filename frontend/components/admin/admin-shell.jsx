"use client";

import { useState } from "react";
import { AdminSidebar } from "./admin-sidebar";
import { AdminHeader } from "./admin-header";
import { RoleGate } from "../role-gate";

export function PanelShell({
  children,
  roles = ["ADMIN"],
  navGroups,
  basePath = "/admin",
  panelLabel = "Admin Panel"
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <RoleGate roles={roles}>
      <div className="min-h-screen bg-zinc-50/60 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-50 transition-colors">
        {/* Sidebar */}
        <AdminSidebar
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          navGroups={navGroups}
          basePath={basePath}
          panelLabel={panelLabel}
        />

        {/* Main Content Area */}
        <div
          className={`flex min-h-screen flex-col transition-all duration-300 ${
            isCollapsed ? "lg:pl-[68px]" : "lg:pl-[260px]"
          }`}
        >
          <AdminHeader
            setMobileOpen={setMobileOpen}
            navGroups={navGroups}
            basePath={basePath}
            panelLabel={panelLabel === "Admin Panel" ? "Admin" : panelLabel}
          />
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </RoleGate>
  );
}

export function AdminShell({ children }) {
  return <PanelShell roles={["ADMIN"]}>{children}</PanelShell>;
}
