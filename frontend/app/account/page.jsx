import AccountClient from "./account-client";
import { RoleGate } from "../../components/role-gate";
import { requireServerUser } from "../../lib/server/require-user";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  await requireServerUser({ permissions: ["VIEW_ACCOUNT"], nextPath: "/account" });
  return <RoleGate roles={["CUSTOMER"]}><AccountClient /></RoleGate>;
}
