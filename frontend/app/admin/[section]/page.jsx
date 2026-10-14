"use client";

import { useParams } from "next/navigation";
import { AdminSectionPage } from "../../../components/admin/admin-section-page";
import { RolesAccessPage } from "../../../components/admin/roles-access-page";

export default function AdminSectionRoute() {
  const { section } = useParams();
  if (section === "roles") return <RolesAccessPage />;
  return <AdminSectionPage section={section} />;
}
