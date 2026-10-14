"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";

export function ProductImage({ product, alt, className, ...imageProps }) {
  const [failed, setFailed] = useState(false);
  const src = typeof product?.imageUrl === "string" ? product.imageUrl : "";

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt || `${product?.name || "Product"} image unavailable`}
        className="absolute inset-0 flex items-center justify-center bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
      >
        <ImageOff size={24} aria-hidden="true" />
      </div>
    );
  }

  return (
    <Image
      {...imageProps}
      src={src}
      alt={alt || product?.name || "Product"}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
