"use client";

import { useParams } from "next/navigation";
import { ManagerSectionPage } from "../../../components/manager/manager-section-page";

export default function ManagerSectionRoute() {
  const { section } = useParams();
  return <ManagerSectionPage section={section} />;
}
