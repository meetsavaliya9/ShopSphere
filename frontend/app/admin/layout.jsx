import { requireServerUser } from "../../lib/server/require-user";
import { AdminShell } from "../../components/admin/admin-shell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: {
    default: "Admin Dashboard — ShopSphere",
    template: "%s — ShopSphere Admin"
  },
  description: "Professional ShopSphere E-commerce Administrator Management Panel"
};

export default async function AdminLayout({ children }) {
  await requireServerUser({ roles: ["ADMIN"], nextPath: "/admin" });
  return <AdminShell>{children}</AdminShell>;
}
