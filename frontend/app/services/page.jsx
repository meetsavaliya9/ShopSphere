import { CheckCircle2, CircleAlert, Server } from "lucide-react";
import { getNestHealth } from "../../lib/api/nest";

export const dynamic = "force-dynamic";
export const metadata = { title: "Service status" };

async function readHealth(readService) {
  try {
    const response = await readService();
    return { healthy: true, name: response.data?.application || response.application || "Service online" };
  } catch (error) {
    return { healthy: false, message: error.message };
  }
}

function StatusCard({ title, purpose, status }) {
  return (
    <article className="border border-line p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-muted uppercase">{purpose}</p>
          <h2 className="mt-3 font-serif text-2xl">{title}</h2>
        </div>
        {status.healthy
          ? <CheckCircle2 className="text-emerald-700" size={21} aria-label="Online" />
          : <CircleAlert className="text-amber-700" size={21} aria-label="Unavailable" />}
      </div>
      <p className="mt-6 text-sm font-medium">{status.healthy ? status.name : "Currently unavailable"}</p>
      <p className="mt-2 text-xs leading-6 text-muted">
        {status.healthy ? "Health endpoint responded successfully." : status.message}
      </p>
    </article>
  );
}

export default async function ServicesPage() {
  const nest = await readHealth(getNestHealth);

  return (
    <div className="mx-auto min-h-[55vh] max-w-[1200px] px-6 py-14 sm:px-10 lg:px-16 lg:py-20">
      <p className="text-[9px] font-semibold leading-[1.4] tracking-[0.19em] text-muted uppercase">Behind the storefront</p>
      <h1 className="mt-4 font-serif text-[clamp(2rem,4.4vw,3.8rem)] font-normal leading-none tracking-[-0.065em]">The services.</h1>
      <p className="mt-5 max-w-xl text-sm leading-7 text-muted">
        The ShopSphere storefront and commerce API are served by the Next.js and NestJS applications.
      </p>
      <div className="mt-10 grid max-w-xl gap-4">
        <StatusCard title="NestJS API" purpose="Commerce & product data" status={nest} />
      </div>
      <div className="mt-8 flex items-start gap-3 border border-line bg-surface p-5 text-xs leading-6 text-muted">
        <Server className="mt-0.5 shrink-0 text-ink" size={16} />
        <p>Commerce requests use the NestJS API and the existing MySQL/Prisma data and business rules.</p>
      </div>
    </div>
  );
}
