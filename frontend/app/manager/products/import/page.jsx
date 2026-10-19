
import { ProductImportDashboard } from "../../../../components/admin/product-import-dashboard";

export const metadata = {
  title: "Import Products",
  description: "Bulk import, validate, review, and persist products from spreadsheets into ShopSphere Manager.",
};

export default function ManagerProductImportPage() {
  return <ProductImportDashboard role="manager" />;
}
