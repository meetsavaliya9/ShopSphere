"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { authRequest } from "../lib/api/auth";
import { useAuth } from "./auth-provider";
import { hasCustomerPermission } from "../lib/customer-permissions";

const StoreContext = createContext(null);
const FAVORITES_KEY = "shopsphere-favorites-v1";

function readFavorites() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeCart(cart) {
  return cart.items.map((item) => ({
    ...item.product,
    quantity: item.quantity,
    available: item.available,
    availableQuantity: item.availableQuantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal
  }));
}

export function StoreProvider({ children }) {
  const { user, status: authStatus, csrfToken } = useAuth();
  const [bag, setBag] = useState([]);
  const [cartSubtotal, setCartSubtotal] = useState(0);
  const [cartStatus, setCartStatus] = useState("loading");
  const [cartError, setCartError] = useState("");
  const [cartPending, setCartPending] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [favoritesSource, setFavoritesSource] = useState("local");
  const [favoritesStatus, setFavoritesStatus] = useState("loading");
  const [favoritesError, setFavoritesError] = useState("");
  const [favoritesPending, setFavoritesPending] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [storefrontSettings, setStorefrontSettings] = useState(null);
  const [storefrontSettingsStatus, setStorefrontSettingsStatus] = useState("loading");
  const [storefrontSettingsError, setStorefrontSettingsError] = useState("");
  const favoritesLoadSequence = useRef(0);

  const loadStorefrontSettings = useCallback(async () => {
    setStorefrontSettingsStatus("loading");
    setStorefrontSettingsError("");
    try {
      const settings = await authRequest("store/settings");
      if (!settings || typeof settings !== "object") {
        throw new Error("The public store settings response was invalid.");
      }
      setStorefrontSettings(settings);
      setStorefrontSettingsStatus("ready");
    } catch (error) {
      setStorefrontSettingsError(error.message || "Store settings could not be loaded.");
      setStorefrontSettingsStatus("error");
    }
  }, []);

  useEffect(() => {
    loadStorefrontSettings();
  }, [loadStorefrontSettings]);

  const loadCart = useCallback(async () => {
    if (authStatus === "loading") return;
    if (authStatus === "error") {
      setCartError("Account security could not initialize. Refresh the page and try again.");
      setCartStatus("error");
      return;
    }
    if (!user || user.role !== "CUSTOMER") {
      setBag([]);
      setCartSubtotal(0);
      setCartError("");
      setCartStatus("ready");
      return;
    }

    setCartStatus("loading");
    setCartError("");
    try {
      const cart = await authRequest("cart");
      setBag(normalizeCart(cart));
      setCartSubtotal(cart.subtotal);
      setCartStatus("ready");
    } catch (error) {
      setCartError(error.message);
      setCartStatus("error");
    }
  }, [authStatus, user]);

  useEffect(() => {
    if (authStatus === "error") {
      setCartStatus("error");
      setCartError("Account security could not initialize.");
      return;
    }
    loadCart();
  }, [authStatus, loadCart]);

  const loadFavorites = useCallback(async () => {
    if (authStatus === "loading") return;
    const requestSequence = ++favoritesLoadSequence.current;
    if (authStatus === "error") {
      setFavoritesError("Account security could not initialize. Refresh the page and try again.");
      setFavoritesStatus("error");
      return;
    }

    setFavoritesError("");
    if (!user || user.role !== "CUSTOMER") {
      setFavoritesSource("local");
      setFavorites(readFavorites());
      setFavoritesReady(true);
      setFavoritesStatus("ready");
      return;
    }

    setFavoritesSource("server");
    setFavoritesStatus("loading");
    try {
      const wishlist = await authRequest("wishlist");
      if (requestSequence !== favoritesLoadSequence.current) return;
      setFavorites(wishlist.items);
      setFavoritesReady(true);
      setFavoritesStatus("ready");
    } catch (error) {
      if (requestSequence !== favoritesLoadSequence.current) return;
      setFavoritesError(error.message);
      setFavoritesStatus("error");
    }
  }, [authStatus, user]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  useEffect(() => {
    if (favoritesReady && favoritesSource === "local") {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    }
  }, [favorites, favoritesReady, favoritesSource]);

  const updateCartFromResponse = (cart) => {
    setBag(normalizeCart(cart));
    setCartSubtotal(cart.subtotal);
    setCartStatus("ready");
    setCartError("");
  };

  const addToBag = useCallback(async (product, quantity = 1) => {
    if (!user || user.role !== "CUSTOMER") {
      setCartError("Sign in with a customer account to save items to your cart.");
      setAnnouncement("Sign in with a customer account to add items to your bag.");
      return;
    }
    if (!hasCustomerPermission(user, "ADD_TO_CART") ||
        !hasCustomerPermission(user, "VIEW_CART")) {
      const message = "Adding products to your cart is not enabled for your account.";
      setCartError(message);
      setAnnouncement(message);
      return;
    }
    if (cartPending) return;
    setCartPending(true);
    setCartError("");
    try {
      const cart = await authRequest("cart/items", {
        method: "POST",
        body: { productId: product.id, quantity },
        csrfToken
      });
      updateCartFromResponse(cart);
      setAnnouncement(`${product.name} added to your account bag.`);
    } catch (error) {
      setCartError(error.message);
      setAnnouncement(error.message);
    } finally {
      setCartPending(false);
    }
  }, [cartPending, csrfToken, user]);

  const updateQuantity = useCallback(async (id, quantity) => {
    if (!hasCustomerPermission(user, "UPDATE_CART_QUANTITY")) {
      setCartError("Changing cart quantities is not enabled for your account.");
      return;
    }
    if (cartPending) return;
    setCartPending(true);
    setCartError("");
    try {
      const cart = await authRequest(`cart/items/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { quantity },
        csrfToken
      });
      updateCartFromResponse(cart);
    } catch (error) {
      setCartError(error.message);
    } finally {
      setCartPending(false);
    }
  }, [cartPending, csrfToken, user]);

  const removeFromBag = useCallback(async (id) => {
    if (!hasCustomerPermission(user, "REMOVE_CART_ITEMS")) {
      setCartError("Removing cart items is not enabled for your account.");
      return;
    }
    if (cartPending) return;
    setCartPending(true);
    setCartError("");
    try {
      const cart = await authRequest(`cart/items/${encodeURIComponent(id)}`, {
        method: "DELETE",
        csrfToken
      });
      updateCartFromResponse(cart);
    } catch (error) {
      setCartError(error.message);
    } finally {
      setCartPending(false);
    }
  }, [cartPending, csrfToken, user]);

  const toggleFavorite = useCallback(async (product) => {
    if (authStatus === "loading" || favoritesStatus === "loading") return;
    const exists = favorites.some((item) => item.id === product.id);
    if (user?.role === "CUSTOMER") {
      const permission = exists ? "REMOVE_FROM_WISHLIST" : "ADD_TO_WISHLIST";
      if (!hasCustomerPermission(user, permission)) {
        const message = exists
          ? "Removing wishlist items is not enabled for your account."
          : "Adding wishlist items is not enabled for your account.";
        setFavoritesError(message);
        setAnnouncement(message);
        return;
      }
      if (favoritesPending) return;
      setFavoritesPending(true);
      setFavoritesError("");
      try {
        const wishlist = exists
          ? await authRequest(`wishlist/items/${encodeURIComponent(product.id)}`, {
            method: "DELETE",
            csrfToken
          })
          : await authRequest("wishlist/items", {
            method: "POST",
            body: { productId: product.id },
            csrfToken
          });
        setFavorites(wishlist.items);
        setFavoritesSource("server");
        setFavoritesStatus("ready");
        setFavoritesReady(true);
        setAnnouncement(
          exists ? `${product.name} removed from favorites.` : `${product.name} saved to favorites.`
        );
      } catch (error) {
        setFavoritesError(error.message);
        setAnnouncement(error.message);
      } finally {
        setFavoritesPending(false);
      }
      return;
    }

    setFavorites((current) =>
      exists
        ? current.filter((item) => item.id !== product.id)
        : [...current, product]
    );
    setFavoritesSource("local");
    setFavoritesError("");
    setAnnouncement(
      exists ? `${product.name} removed from favorites.` : `${product.name} saved to favorites.`
    );
  }, [authStatus, csrfToken, favorites, favoritesPending, favoritesStatus, user]);

  const value = useMemo(() => ({
    bag,
    favorites,
    favoritesStatus,
    favoritesError,
    favoritesPending,
    loadFavorites,
    storefrontSettings,
    storefrontSettingsStatus,
    storefrontSettingsError,
    loadStorefrontSettings,
    bagCount: bag.reduce((total, item) => total + item.quantity, 0),
    bagTotal: cartSubtotal,
    cartStatus,
    cartError,
    cartPending,
    loadCart,
    announcement,
    addToBag,
    updateQuantity,
    removeFromBag,
    toggleFavorite
  }), [
    bag, favorites, favoritesStatus, favoritesError, favoritesPending, loadFavorites,
    storefrontSettings, storefrontSettingsStatus, storefrontSettingsError, loadStorefrontSettings,
    cartSubtotal, cartStatus, cartError, cartPending, loadCart,
    announcement, addToBag, updateQuantity, removeFromBag, toggleFavorite
  ]);

  return (
    <StoreContext.Provider value={value}>
      {children}
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </StoreContext.Provider>
  );
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("useStore must be used inside StoreProvider");
  }
  return store;
}
