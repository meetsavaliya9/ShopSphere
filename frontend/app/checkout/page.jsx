import { requireServerUser } from "../../lib/server/require-user";
import CheckoutClient from "./checkout-client";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const user = await requireServerUser({
    roles: ["CUSTOMER"],
    permissions: ["ACCESS_CHECKOUT"],
    nextPath: "/checkout"
  });
  return <CheckoutClient user={user} />;
}
