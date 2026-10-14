import Link from "next/link";
import { cache } from "react";
import { ArrowLeft, Check, Truck } from "lucide-react";
import { notFound } from "next/navigation";
import { AddToBagButton } from "../../../components/add-to-bag-button";
import { ProductImage } from "../../../components/product-image";
import { FavoriteButton } from "../../../components/favorite-button";
import { StoreError } from "../../../components/store-state";
import { formatPrice } from "../../../lib/catalog";
import request from "../../../lib/api/request";
import { getProduct } from "../../../lib/api/catalog";
import { CustomerFeature } from "../../../components/customer-feature";

const { ApiError } = request;
const loadProduct = cache(getProduct);

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  try {
    const { data: product } = await loadProduct(id);
    return { title: product.name, description: product.description };
  } catch {
    return { title: "Product details" };
  }
}

export default async function ProductDetailPage({ params }) {
  const { id } = await params;
  let product;
  try {
    ({ data: product } = await loadProduct(id));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-16 sm:px-10 lg:px-16">
        <StoreError message={error.message} retryHref={`/products/${encodeURIComponent(id)}`} />
      </div>
    );
  }

  return (
    <CustomerFeature permission="VIEW_PRODUCT_DETAILS">
    <div className="mx-auto max-w-[1440px] px-6 py-8 sm:px-10 lg:px-16 lg:py-12">
      <Link href="/products" className="inline-flex items-center gap-2 text-xs text-muted transition motion-reduce:transition-none hover:text-ink"><ArrowLeft size={15} /> Back to the collection</Link>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
        <CustomerFeature permission="VIEW_PRODUCT_IMAGES">
        <div className="relative aspect-[0.9] overflow-hidden bg-surface">
          <ProductImage product={product} alt={product.name} fill priority sizes="(max-width: 1024px) 90vw, 52vw" className="object-cover" />
          <span className="absolute bottom-4 left-4 bg-white/90 px-3 py-2 text-[10px] uppercase tracking-[0.15em]">{product.category}</span>
        </div>
        </CustomerFeature>
        <div className="flex flex-col justify-center lg:py-10">
          <p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-muted uppercase">{product.category} · ShopSphere edit</p>
          <h1 className="mt-5 font-serif text-4xl leading-[1.05] tracking-[-0.055em] sm:text-5xl lg:text-6xl">{product.name}</h1>
          <CustomerFeature permission="VIEW_PRODUCT_PRICING">
            <p className="mt-5 text-lg">{formatPrice(product.price)}</p>
          </CustomerFeature>
          <div className="mt-8 border-y border-line py-6">
            <p className="text-sm leading-7 text-muted">{product.description || "A considered everyday essential from the ShopSphere collection."}</p>
            <CustomerFeature permission="VIEW_PRODUCT_AVAILABILITY">
            <div className="mt-5 flex items-center gap-2 text-xs">
              {product.inStock && Number.isSafeInteger(product.availableQuantity) && product.availableQuantity > 0
                ? <><Check size={15} /> {product.availableQuantity} available</>
                : <><span className="h-2 w-2 rounded-full bg-muted" /> Currently unavailable</>}
            </div>
            </CustomerFeature>
          </div>
          <div className="mt-7 grid gap-3">
            <AddToBagButton product={product} />
            <FavoriteButton product={product} />
          </div>
          <div className="mt-8 flex items-start gap-3 text-xs leading-6 text-muted">
            <Truck size={17} className="mt-0.5 shrink-0" />
            <p>Availability is supplied by the product service. Delivery options and shipping charges are shown at checkout.</p>
          </div>
          <p className="mt-8 border-t border-line pt-5 text-[10px] uppercase tracking-[0.16em] text-muted">Product reference · {product.id}</p>
        </div>
      </div>
    </div>
    </CustomerFeature>
  );
}
