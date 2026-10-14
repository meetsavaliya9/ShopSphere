import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StoreError } from "../../components/store-state";
import { ProductImage } from "../../components/product-image";
import { listProducts } from "../../lib/api/catalog";
import { CustomerFeature } from "../../components/customer-feature";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop by category" };

async function listAllProducts() {
  const firstPage = await listProducts({ page: 1, limit: 100 });
  const remainingPages = await Promise.all(
    Array.from(
      { length: Math.max(0, firstPage.pagination.totalPages - 1) },
      (_, index) => listProducts({ page: index + 2, limit: 100 })
    )
  );
  return [firstPage, ...remainingPages].flatMap((result) => result.data);
}

export default async function CategoriesPage() {
  let products;
  try {
    products = await listAllProducts();
  } catch (error) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-16 sm:px-10 lg:px-16">
        <StoreError message={error.message} retryHref="/categories" />
      </div>
    );
  }

  const categories = [...products.reduce((grouped, product) => {
    const category = grouped.get(product.category) || { name: product.category, count: 0, products: [] };
    category.count += 1;
    if (category.products.length < 3) category.products.push(product);
    grouped.set(product.category, category);
    return grouped;
  }, new Map()).values()].sort((left, right) => left.name.localeCompare(right.name));

  return (
    <CustomerFeature permission="VIEW_SHOP">
    <div className="mx-auto max-w-[1440px] px-6 py-12 sm:px-10 lg:px-16 lg:py-20">
      <header className="mb-12 border-b border-line pb-8">
        <p className="text-[9px] font-semibold uppercase tracking-[0.19em] text-muted">Find your kind of thing</p>
        <h1 className="mt-4 font-serif text-[clamp(2rem,4.4vw,3.8rem)] font-normal leading-none tracking-[-0.065em]">
          Shop by category.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-muted">
          Explore the collection by the places and moments these considered essentials belong.
        </p>
      </header>

      {categories.length === 0 ? (
        <div className="border border-line bg-surface px-5 py-12 text-center">
          <h2 className="font-serif text-2xl">Categories are on their way.</h2>
          <p className="mt-2 text-sm text-muted">There are no products in the collection right now.</p>
          <Link href="/products" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold underline underline-offset-4">
            Browse the collection <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            const featuredProduct = category.products[0];
            return (
              <Link
                key={category.name}
                href={`/products?category=${encodeURIComponent(category.name)}`}
                className="group border border-line bg-white transition-colors hover:border-ink"
              >
                <div className="relative aspect-[1.18] overflow-hidden bg-surface">
                  <ProductImage
                    product={featuredProduct}
                    alt={featuredProduct.name}
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw"
                    className="object-cover transition-transform duration-700 motion-reduce:transition-none group-hover:scale-105"
                  />
                  <span className="absolute left-4 top-4 bg-white/90 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.12em]">
                    {category.count} {category.count === 1 ? "piece" : "pieces"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
                  <div>
                    <h2 className="font-serif text-2xl tracking-[-0.04em]">{category.name}</h2>
                    <p className="mt-2 text-xs text-muted">
                      {category.products.map((product) => product.name).join(" · ")}
                      {category.count > category.products.length ? " · and more" : ""}
                    </p>
                  </div>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line transition-colors group-hover:border-ink group-hover:bg-ink group-hover:text-white">
                    <ArrowRight size={16} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
    </CustomerFeature>
  );
}
