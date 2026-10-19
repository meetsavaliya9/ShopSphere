"use client";

import React, { useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";

import {
  ALLOWED_IMAGE_HOSTS,
  isAllowedImageSrc,
  getSafeProductImageUrl
} from "../lib/image-url";

export { ALLOWED_IMAGE_HOSTS, isAllowedImageSrc, getSafeProductImageUrl };

class ImageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // Gracefully catch render exceptions from next/image without crashing the parent
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export function ProductImage({ product, alt, className, ...imageProps }) {
  const [failed, setFailed] = useState(false);
  const rawSrc =
    typeof product?.imageUrl === "string"
      ? product.imageUrl.trim()
      : typeof imageProps.src === "string"
      ? imageProps.src.trim()
      : "";

  const fallbackUI = (
    <div
      role="img"
      aria-label={alt || `${product?.name || "Product"} image unavailable`}
      className="absolute inset-0 flex items-center justify-center bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
    >
      <ImageOff size={24} aria-hidden="true" />
    </div>
  );

  if (!rawSrc || failed || !isAllowedImageSrc(rawSrc)) {
    return fallbackUI;
  }

  return (
    <ImageErrorBoundary fallback={fallbackUI}>
      <Image
        {...imageProps}
        src={rawSrc}
        alt={alt || product?.name || "Product"}
        className={className}
        onError={() => setFailed(true)}
      />
    </ImageErrorBoundary>
  );
}

