import { ManagerPanelLayout } from "../../components/manager/manager-panel-layout";
import { requireServerUser } from "../../lib/server/require-user";

export const dynamic = "force-dynamic";

export default async function ManagerLayout({ children }) {
  await requireServerUser({ roles: ["MANAGER", "INVENTORY_MANAGER"], nextPath: "/manager" });
  return <ManagerPanelLayout>{children}</ManagerPanelLayout>;
}
