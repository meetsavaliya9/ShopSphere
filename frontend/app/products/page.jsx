import { ProductCatalog } from "../../components/product-catalog";
import { StoreError } from "../../components/store-state";
import { listProducts } from "../../lib/api/catalog";
import { CustomerFeature } from "../../components/customer-feature";

export const metadata = { title: "Shop the collection" };

export default async function ProductsPage({ searchParams }) {
  const params = await searchParams;
  const filters = {
    search: params.search || "",
    category: params.category || "",
    minPrice: params.minPrice || "",
    maxPrice: params.maxPrice || "",
    sortBy: params.sortBy || "",
    order: params.order || "asc",
    page: Number(params.page || 1),
    limit: Number(params.limit || 10)
  };

  try {
    const initialResult = await listProducts(filters);
    return (
      <CustomerFeature permission="VIEW_SHOP">
      <div className="mx-auto max-w-[1440px] px-6 py-12 sm:px-10 lg:px-16 lg:py-20">
        <div className="mb-12 border-b border-line pb-8">
          <p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-muted uppercase">Objects for everyday</p>
          <h1 className="mt-4 font-serif text-[clamp(2rem,4.4vw,3.8rem)] font-normal leading-none tracking-[-0.065em]">The collection.</h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-muted">
            Useful things with a little more thought in them. Find the pieces that feel like yours.
          </p>
        </div>
        <ProductCatalog initialResult={initialResult} initialFilters={filters} />
      </div>
      </CustomerFeature>
    );
  } catch (error) {
    return (
      <CustomerFeature permission="VIEW_SHOP">
      <div className="mx-auto max-w-[1440px] px-6 py-16 sm:px-10 lg:px-16">
        <div className="mb-10"><p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-muted uppercase">Objects for everyday</p><h1 className="mt-4 font-serif text-[clamp(2rem,4.4vw,3.8rem)] font-normal leading-none tracking-[-0.065em]">The collection.</h1></div>
        <StoreError message={error.message} retryHref="/products" />
      </div>
      </CustomerFeature>
    );
  }
}
