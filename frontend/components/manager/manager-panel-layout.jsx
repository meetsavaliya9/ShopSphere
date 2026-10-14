"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Tags,
  UserRound
} from "lucide-react";
import { authRequest } from "../../lib/api/auth";
import { useAuth } from "../auth-provider";
import { PanelShell } from "../admin/admin-shell";

const ManagerPermissionsContext = createContext(null);

export function useManagerPermissions() {
  const value = useContext(ManagerPermissionsContext);
  if (!value) throw new Error("useManagerPermissions must be used inside ManagerPanelLayout");
  return value;
}

function managerNavigation(permissions) {
  const overview = permissions.includes("VIEW_INVENTORY_DASHBOARD");
  const products = ["VIEW_PRODUCTS", "CREATE_PRODUCTS"]
    .some((permission) => permissions.includes(permission));
  const inventory = permissions.includes("VIEW_STOCK_LEVELS");
  const categories = permissions.includes("VIEW_CATEGORIES") || permissions.includes("MANAGE_CATEGORIES");
  const orders = permissions.includes("VIEW_ORDERS");
  const alerts = permissions.includes("VIEW_LOW_STOCK_ALERTS");
  const history = permissions.includes("VIEW_STOCK_HISTORY");
  const reports = permissions.includes("VIEW_INVENTORY_REPORTS");
  const groups = [];

  if (overview) {
    groups.push({
      title: "Overview",
      items: [{ title: "Dashboard", href: "/manager", icon: LayoutDashboard }]
    });
  }
  const catalog = [];
  if (products) catalog.push({ title: "Products", href: "/manager/products", icon: Package });
  if (inventory) catalog.push({ title: "Inventory", href: "/manager/inventory", icon: Boxes });
  if (catalog.length) groups.push({ title: "Catalog", items: catalog });
  const inventoryTools = [];
  if (alerts) inventoryTools.push({ title: "Low Stock Alerts", href: "/manager/low-stock", icon: AlertTriangle });
  if (history) inventoryTools.push({ title: "Stock History", href: "/manager/stock-history", icon: History });
  if (reports) inventoryTools.push({ title: "Inventory Reports", href: "/manager/reports", icon: FileSpreadsheet });
  if (inventoryTools.length) groups.push({ title: "Inventory tools", items: inventoryTools });
  if (categories) {
    groups.push({
      title: "Catalog",
      items: [{ title: "Categories", href: "/manager/categories", icon: Tags }]
    });
  }
  if (orders) {
    groups.push({
      title: "Sales",
      items: [{ title: "Orders", href: "/manager/orders", icon: ShoppingCart }]
    });
  }
  groups.push({
    title: "Account",
    items: [{ title: "Profile", href: "/manager/account", icon: UserRound }]
  });
  return groups;
}

export function ManagerPanelLayout({ children }) {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const loadAccess = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const result = await authRequest("manager/access");
      if (!Array.isArray(result?.permissions)) {
        throw new Error("The manager access response was invalid.");
      }
      setPermissions(result.permissions);
      setStatus("ready");
    } catch (requestError) {
      setError(requestError.message || "Your manager permissions could not be loaded.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (user) loadAccess();
  }, [loadAccess, user]);

  const contextValue = useMemo(() => ({
    permissions: permissions || [],
    status,
    error,
    reloadAccess: loadAccess
  }), [error, loadAccess, permissions, status]);

  const navGroups = useMemo(
    () => managerNavigation(permissions || []),
    [permissions]
  );

  return (
    <ManagerPermissionsContext.Provider value={contextValue}>
      <PanelShell
        roles={["MANAGER", "INVENTORY_MANAGER"]}
        navGroups={navGroups}
        basePath="/manager"
        panelLabel="Inventory Manager Panel"
      >
        {children}
      </PanelShell>
    </ManagerPermissionsContext.Provider>
  );
}
