import OrdersContent from "../../components/orders-content";
import { RoleGate } from "../../components/role-gate";
import { requireServerUser } from "../../lib/server/require-user";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  await requireServerUser({
    roles: ["CUSTOMER"],
    permissions: ["VIEW_ORDERS"],
    nextPath: "/orders"
  });
  return <RoleGate roles={["CUSTOMER"]}><OrdersContent /></RoleGate>;
}
