import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { ProductCard } from "../components/product-card";
import { ProductImage } from "../components/product-image";
import { StoreError } from "../components/store-state";
import { RoleGate } from "../components/role-gate";
import { listProducts } from "../lib/api/catalog";
import { requireServerUser } from "../lib/server/require-user";

export const dynamic = "force-dynamic";

function imageUrl(id, width = 1100) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=88`;
}

export default async function HomePage() {
  await requireServerUser({ nextPath: "/" });
  let result = null;
  let errorMessage = "";
  try {
    result = await listProducts({ page: 1, limit: 8 });
  } catch (error) {
    errorMessage = error.message;
  }
  const featuredProduct = result?.data?.find((product) => product.imageUrl);

  return (
    <RoleGate roles={["CUSTOMER", "ADMIN", "MANAGER", "INVENTORY_MANAGER"]}>
    <>
      <section className="relative isolate min-h-[610px] overflow-hidden bg-[#e9e5df] sm:min-h-[690px] lg:min-h-[760px]">
        <Image
          src={imageUrl("photo-1490481651871-ab68de25d43d", 2200)}
          alt="Quietly curated wardrobe in soft natural light"
          fill
          priority
          unoptimized
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/52 via-black/18 to-transparent" />
        <div className="relative mx-auto flex min-h-[610px] max-w-[1440px] items-center px-6 py-20 sm:min-h-[690px] sm:px-10 lg:min-h-[760px] lg:px-16">
          <div className="max-w-[760px] text-white">
            <p className="mb-7 text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-white/80 uppercase">The everyday, considered</p>
            <h1 className="max-w-[800px] font-serif text-[clamp(3.5rem,8vw,7.6rem)] font-normal leading-[0.93] tracking-[-0.075em]">Good things.<br /><em>Good days.</em></h1>
            <p className="mt-7 max-w-md text-sm leading-7 text-white/80 sm:text-base">
              Objects made to find their place in your everyday — and stay there.
            </p>
            <Link href="/products" className="mt-9 inline-flex min-h-12 items-center gap-8 bg-white px-6 text-xs font-semibold text-ink transition motion-reduce:transition-none hover:bg-[#e9e5df]">
              Shop the collection <ArrowRight size={16} />
            </Link>
            <div className="mt-16 flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-white/70">
              <ArrowDown size={14} /> A little more intentional
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 right-0 hidden w-[230px] bg-white/90 p-6 backdrop-blur sm:block lg:right-[max(calc((100vw-1440px)/2+64px),40px)]">
          <p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-muted uppercase">The ShopSphere edit</p>
          <p className="mt-2 font-serif text-xl">Less, but lovely.</p>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-6 py-20 sm:px-10 lg:px-16 lg:py-28">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-muted uppercase">Find your kind of thing</p>
            <h2 className="mt-4 font-serif text-[clamp(2rem,4.4vw,3.8rem)] font-normal leading-none tracking-[-0.065em]">A place for the good stuff.</h2>
          </div>
          <Link href="/products" className="inline-flex items-center gap-2 pb-1 text-xs font-medium underline underline-offset-4">
            Browse everything <ArrowRight size={15} />
          </Link>
        </div>
        <div className="group relative isolate grid min-h-[440px] overflow-hidden bg-[#e9e5df] md:min-h-[500px] md:grid-cols-[0.9fr_1.1fr]">
          <div className="relative z-10 flex flex-col items-start justify-center px-7 py-12 sm:px-12 md:px-14 lg:px-16">
            <p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-muted uppercase">Thoughtfully chosen for you</p>
            <h3 className="mt-5 max-w-lg font-serif text-[clamp(2.3rem,4.5vw,4.3rem)] font-normal leading-[0.98] tracking-[-0.065em] text-ink">
              A little more lovely, every day.
            </h3>
            <p className="mt-5 max-w-sm text-sm leading-7 text-zinc-600">
              Discover useful objects, considered details and the pieces you’ll be glad to have around.
            </p>
            <Link href="/products" className="mt-8 inline-flex min-h-12 items-center gap-8 bg-ink px-6 text-xs font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink">
              Shop now <ArrowRight size={16} />
            </Link>
          </div>
          <div className="relative min-h-[300px] overflow-hidden bg-[#d8d2c8] md:min-h-full">
            {featuredProduct ? (
              <ProductImage
                product={featuredProduct}
                alt="Featured ShopSphere product from the current collection"
                fill
                sizes="(max-width: 768px) 100vw, 55vw"
                className="object-cover transition-transform duration-700 motion-reduce:transition-none group-hover:scale-[1.025]"
              />
            ) : (
              <Image
                src={imageUrl("photo-1441986300917-64674bd600d8", 1400)}
                alt="A calm, considered retail space"
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 55vw"
                className="object-cover transition-transform duration-700 motion-reduce:transition-none group-hover:scale-[1.025]"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
            {featuredProduct && (
              <div className="absolute bottom-5 left-5 max-w-[calc(100%-2.5rem)] bg-white/90 px-4 py-3 backdrop-blur sm:bottom-7 sm:left-7">
                <p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-muted uppercase">From the current edit</p>
                <p className="mt-1 truncate font-serif text-lg text-ink">{featuredProduct.name}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="bg-surface">
        <div className="mx-auto max-w-[1440px] px-6 py-20 sm:px-10 lg:px-16 lg:py-28">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-muted uppercase">A few good finds</p>
              <h2 className="mt-4 font-serif text-[clamp(2rem,4.4vw,3.8rem)] font-normal leading-none tracking-[-0.065em]">The current collection.</h2>
            </div>
            <Link href="/products" className="inline-flex items-center gap-2 pb-1 text-xs font-medium underline underline-offset-4">
              See the full edit <ArrowRight size={15} />
            </Link>
          </div>
          {errorMessage ? (
            <StoreError message={errorMessage} />
          ) : result.data.length === 0 ? (
            <div className="border border-line bg-[#fafafa] px-5 py-10 text-center">
              <p className="font-medium">The collection is being refreshed.</p>
              <p className="mt-2 text-sm text-muted">There are no products to show right now.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {result.data.slice(0, 3).map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto grid max-w-[1440px] gap-10 px-6 py-20 sm:px-10 md:grid-cols-2 lg:px-16 lg:py-28">
        <div className="relative min-h-[350px] overflow-hidden bg-[#e8e5de] md:min-h-[470px]">
          <Image src={imageUrl("photo-1441986300917-64674bd600d8", 1200)} alt="A calm, considered retail space" fill unoptimized sizes="(max-width: 768px) 90vw, 50vw" className="object-cover" />
        </div>
        <div className="flex flex-col justify-center py-2 md:pl-8 lg:pl-16">
          <p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-muted uppercase">A note from our little corner</p>
          <h2 className="mt-5 max-w-lg font-serif text-[clamp(2rem,4.4vw,3.8rem)] font-normal leading-none tracking-[-0.065em]">Good design should make the everyday feel a little less ordinary.</h2>
          <p className="mt-6 max-w-md text-sm leading-7 text-muted">
            We believe in useful objects, thoughtful details and buying with intention. Start with the pieces you’ll reach for most.
          </p>
          <Link href="/services" className="mt-8 inline-flex w-fit items-center gap-3 border-b border-ink pb-2 text-xs font-semibold">
            Meet the services behind the store <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </>
    </RoleGate>
  );
}
