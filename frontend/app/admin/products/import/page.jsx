
import { ProductImportDashboard } from "../../../../components/admin/product-import-dashboard";

export const metadata = {
  title: "Import Products",
  description: "Bulk import, validate, review, and persist products from spreadsheets into ShopSphere Admin.",
};

export default function AdminProductImportPage() {
  return <ProductImportDashboard role="admin" />;
}
