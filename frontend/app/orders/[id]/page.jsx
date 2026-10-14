import OrdersContent from "../../../components/orders-content";
import { requireServerUser } from "../../../lib/server/require-user";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }) {
  const { id } = await params;
  await requireServerUser({
    roles: ["CUSTOMER"],
    permissions: ["VIEW_ORDER_DETAILS"],
    nextPath: `/orders/${encodeURIComponent(id)}`
  });
  return <OrdersContent orderId={id} />;
}
