import AccountClient from "./account-client";
import { requireServerUser } from "../../lib/server/require-user";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  await requireServerUser({ permissions: ["VIEW_ACCOUNT"], nextPath: "/account" });
  return <AccountClient />;
}
