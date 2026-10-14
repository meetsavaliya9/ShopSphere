"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Edit2,
  Filter,
  MoreVertical,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { authRequest } from "../../../lib/api/auth";
import { useAuth } from "../../../components/auth-provider";
import { formatPrice } from "../../../lib/catalog";
import { Badge } from "../../../components/admin/badge";
import { Modal } from "../../../components/admin/modal";
import { ProductImage } from "../../../components/product-image";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function uploadProductImage(file, csrfToken, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/admin/products/image");
    request.withCredentials = true;
    request.timeout = 45000;
    request.setRequestHeader("Content-Type", file.type);
    if (csrfToken) request.setRequestHeader("X-CSRF-Token", csrfToken);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("The image upload could not reach the server."));
    request.ontimeout = () => reject(new Error("The image upload timed out. Try again."));
    request.onload = () => {
      let result;
      try {
        result = JSON.parse(request.responseText);
      } catch {
        reject(new Error("The image service returned an unreadable response."));
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(result?.error?.message || "The image could not be uploaded."));
        return;
      }
      resolve(result.data);
    };
    request.send(file);
  });
}

export default function AdminProductsPage() {
  const { csrfToken } = useAuth();
  const [products, setProducts] = useState([]);
  const [managers, setManagers] = useState([]);
  const [categoryNames, setCategoryNames] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Search & Filter
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [stockFilter, setStockFilter] = useState("ALL");

  // Modal states
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const [currentProduct, setCurrentProduct] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imageAsset, setImageAsset] = useState(null);
  const [originalImageAsset, setOriginalImageAsset] = useState(null);
  const [stagedImageAssets, setStagedImageAssets] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const [imageError, setImageError] = useState("");

  // Form fields
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    price: "",
    description: "",
    managerId: "",
    inStock: true
  });

  const loadData = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const [prodRes, userRes] = await Promise.all([
        authRequest("admin/products"),
        authRequest("admin/users")
      ]);
      const productList = Array.isArray(prodRes) ? prodRes : prodRes?.data || [];
      setProducts(productList);
      const userList = Array.isArray(userRes) ? userRes : userRes?.data || [];
      setManagers(userList.filter((u) => ["MANAGER", "INVENTORY_MANAGER"].includes(u.role)));
      try {
        const categoryResponse = await authRequest("admin/categories");
        const savedCategories = Array.isArray(categoryResponse)
          ? categoryResponse
          : categoryResponse?.data || [];
        setCategoryNames(
          [...new Set([
            ...savedCategories.map((category) => category.name),
            ...productList.map((product) => product.category)
          ].filter(Boolean))].sort((left, right) => left.localeCompare(right))
        );
      } catch {
        setCategoryNames(
          [...new Set(productList.map((product) => product.category).filter(Boolean))]
            .sort((left, right) => left.localeCompare(right))
        );
        setNotice("The saved category list could not be loaded; existing product categories remain available.");
      }
      setStatus("ready");
    } catch (err) {
      setError(err.message || "Failed to load products.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const categories = Array.from(new Set([
    ...categoryNames,
    ...products.map((product) => product.category).filter(Boolean)
  ]));

  async function cleanupUnpersistedImages(persistedImagePublicId, originalImagePublicId = null) {
    const unpersisted = stagedImageAssets.filter(
      (asset) =>
        asset.imagePublicId !== persistedImagePublicId &&
        asset.imagePublicId !== originalImagePublicId
    );
    const results = await Promise.allSettled(
      unpersisted.map((asset) => deleteProductImage(asset.imagePublicId))
    );
    if (results.some((result) => result.status === "rejected")) {
      setNotice("The product was not saved, and an unused uploaded image could not be removed from storage.");
    }
  }

  async function deleteProductImage(imagePublicId) {
    if (!imagePublicId) return;
    await authRequest("admin/products/image", {
      method: "DELETE",
      body: { imagePublicId },
      csrfToken
    });
  }

  function resetImageForm() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageAsset(null);
    setOriginalImageAsset(null);
    setStagedImageAssets([]);
    setImageFile(null);
    setImagePreview("");
    setImageUploading(false);
    setImageUploadProgress(0);
    setImageError("");
  }

  async function cancelProductForm(type) {
    if (imageUploading) return;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    const pendingImages = stagedImageAssets.filter(
      (asset) => asset.imagePublicId !== originalImageAsset?.imagePublicId
    );
    const cleanupResults = await Promise.allSettled(
      pendingImages.map((asset) => deleteProductImage(asset.imagePublicId))
    );
    if (cleanupResults.some((result) => result.status === "rejected")) {
      setError("The form was closed, but an unused uploaded image could not be removed from storage.");
    }
    resetImageForm();
    if (type === "add") setAddModalOpen(false);
    if (type === "edit") setEditModalOpen(false);
  }

  async function cleanupAfterProductSave(persistedImagePublicId, previousImagePublicId) {
    const obsoleteImages = stagedImageAssets
      .filter((asset) => asset.imagePublicId !== persistedImagePublicId)
      .map((asset) => asset.imagePublicId);
    if (
      previousImagePublicId &&
      previousImagePublicId !== persistedImagePublicId
    ) {
      obsoleteImages.push(previousImagePublicId);
    }
    const cleanupResults = await Promise.allSettled(
      [...new Set(obsoleteImages)].map(deleteProductImage)
    );
    if (cleanupResults.some((result) => result.status === "rejected")) {
      setNotice("Product saved. An unused previous image could not be removed from storage.");
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    resetImageForm();
  }

  function handleImageSelection(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview("");
    setImageError("");
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type)) {
      setImageError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setImageError("Product images must be 5 MB or smaller.");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleImageUpload() {
    if (!imageFile || imageUploading) return;
    setImageUploading(true);
    setImageError("");
    setImageUploadProgress(0);
    try {
      const uploaded = await uploadProductImage(imageFile, csrfToken, setImageUploadProgress);
      setImageAsset(uploaded);
      setStagedImageAssets((previous) => [...previous, uploaded]);
      setImageFile(null);
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setImagePreview("");
    } catch (err) {
      setImageError(err.message || "The image could not be uploaded.");
    } finally {
      setImageUploading(false);
    }
  }

  function handleRemoveProductImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview("");
    setImageFile(null);
    setImageAsset(null);
    setImageError("");
  }

  // Filtered products
  const filteredProducts = products.filter((p) => {
    const matchesSearch = search.trim() === "" ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      String(p.id) === search.trim();
    const matchesCat = selectedCategory === "ALL" || p.category === selectedCategory;
    const matchesStock = stockFilter === "ALL" ||
      (stockFilter === "IN_STOCK" && p.inStock) ||
      (stockFilter === "OUT_OF_STOCK" && !p.inStock);
    return matchesSearch && matchesCat && matchesStock;
  });

  function openAddModal() {
    resetImageForm();
    setFormData({
      name: "",
      category: "",
      price: "",
      description: "",
      managerId: "",
      inStock: true
    });
    setAddModalOpen(true);
  }

  function openEditModal(product) {
    resetImageForm();
    setCurrentProduct(product);
    const existingImage = product.imageUrl && product.imagePublicId
      ? { imageUrl: product.imageUrl, imagePublicId: product.imagePublicId }
      : null;
    setImageAsset(existingImage);
    setOriginalImageAsset(existingImage);
    setFormData({
      name: product.name,
      category: product.category,
      price: String(product.price),
      description: product.description || "",
      managerId: product.manager ? String(product.manager.id) : "",
      inStock: Boolean(product.inStock)
    });
    setEditModalOpen(true);
  }

  function openDeleteModal(product) {
    setCurrentProduct(product);
    setDeleteModalOpen(true);
  }

  async function handleCreateProduct(e) {
    e.preventDefault();
    if (imageFile) {
      setImageError("Upload the selected image before creating the product.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    let productCreated = false;
    try {
      const body = {
        name: formData.name.trim(),
        category: formData.category.trim(),
        price: Number(formData.price),
        description: formData.description.trim(),
        imageUrl: imageAsset?.imageUrl || null,
        imagePublicId: imageAsset?.imagePublicId || null
      };
      if (formData.managerId) {
        body.managerId = Number(formData.managerId);
      }

      await authRequest("products", {
        method: "POST",
        body,
        csrfToken
      });
      productCreated = true;

      setNotice(`Product "${formData.name}" created successfully.`);
      setAddModalOpen(false);
      await cleanupAfterProductSave(imageAsset?.imagePublicId, null);
      await loadData();
    } catch (err) {
      if (!productCreated) await cleanupUnpersistedImages(null);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateProduct(e) {
    e.preventDefault();
    if (!currentProduct) return;
    if (imageFile) {
      setImageError("Upload the selected image before saving the product.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    let productUpdated = false;
    try {
      const body = {
        name: formData.name.trim(),
        category: formData.category.trim(),
        price: Number(formData.price),
        description: formData.description.trim(),
        imageUrl: imageAsset?.imageUrl || null,
        imagePublicId: imageAsset?.imagePublicId || null,
        inStock: formData.inStock
      };

      await authRequest(`products/${currentProduct.id}`, {
        method: "PUT",
        body,
        csrfToken
      });
      productUpdated = true;

      const previousImagePublicId = originalImageAsset?.imagePublicId;
      const persistedImagePublicId = imageAsset?.imagePublicId;
      setOriginalImageAsset(imageAsset);
      setStagedImageAssets((previous) =>
        previous.filter((asset) => asset.imagePublicId !== persistedImagePublicId)
      );
      // Update manager assignment if changed
      const oldMgrId = currentProduct.manager ? String(currentProduct.manager.id) : "";
      if (formData.managerId !== oldMgrId) {
        await authRequest(`admin/products/${currentProduct.id}/manager`, {
          method: "PATCH",
          body: { managerId: formData.managerId ? Number(formData.managerId) : null },
          csrfToken
        });
      }

      setNotice(`Updated "${formData.name}".`);
      setEditModalOpen(false);
      await cleanupAfterProductSave(persistedImagePublicId, null);
      await loadData();
    } catch (err) {
      if (!productUpdated) {
        await cleanupUnpersistedImages(
          null,
          originalImageAsset?.imagePublicId || null
        );
      }
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProduct() {
    if (!currentProduct) return;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      await authRequest(`products/${currentProduct.id}`, {
        method: "DELETE",
        csrfToken
      });
      setNotice(`Deleted product "${currentProduct.name}".`);
      setDeleteModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  async function toggleStockStatus(product) {
    try {
      await authRequest(`admin/inventory/${product.id}`, {
        method: "PATCH",
        body: { inStock: !product.inStock },
        csrfToken
      });
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Products Catalog
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Manage product entries, pricing, categories, and inventory status.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw size={13} className={status === "loading" ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            <Plus size={14} />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-2.5 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, ID, or category..."
            className="w-full rounded-lg border border-zinc-200 bg-transparent py-1.5 pl-9 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 outline-none"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Stock Filter */}
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 outline-none"
          >
            <option value="ALL">All Stock</option>
            <option value="IN_STOCK">In Stock</option>
            <option value="OUT_OF_STOCK">Out of Stock</option>
          </select>
        </div>
      </div>

      {/* Products Table Card */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-2xs overflow-hidden dark:border-zinc-800 dark:bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Price</th>
                <th className="py-3 px-4">Stock Status</th>
                <th className="py-3 px-4">Assigned Manager</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
              {filteredProducts.length > 0 ? (
                filteredProducts.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40 transition-colors">
                    {/* Product Name & Image */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
                          <ProductImage
                            product={p}
                            alt={p.name}
                            width={40}
                            height={40}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[200px] sm:max-w-xs">
                            {p.name}
                          </p>
                          <span className="font-mono text-[10px] text-zinc-400">ID #{p.id}</span>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3 px-4 text-zinc-600 dark:text-zinc-300">
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {p.category}
                      </span>
                    </td>

                    {/* Price */}
                    <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-zinc-100">
                      ₹{Number(p.price).toFixed(2)}
                    </td>

                    {/* Stock Status with quick toggle */}
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => toggleStockStatus(p)}
                        title="Click to toggle stock status"
                        className="cursor-pointer"
                      >
                        {p.inStock ? (
                          <Badge variant="success">In Stock</Badge>
                        ) : (
                          <Badge variant="destructive">Out of Stock</Badge>
                        )}
                      </button>
                    </td>

                    {/* Manager */}
                    <td className="py-3 px-4 text-zinc-500 dark:text-zinc-400">
                      {p.manager ? (
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          {p.manager.name}
                        </span>
                      ) : (
                        <span className="text-zinc-400 italic">Unassigned</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(p)}
                          className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors"
                          title="Edit Product"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteModal(p)}
                          className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40 transition-colors"
                          title="Delete Product"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-zinc-400">
                    No products match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => cancelProductForm("add")}
        title="Add New Product"
        description="Create a new entry in the ShopSphere catalog. Changes persist to MySQL."
      >
        <form onSubmit={handleCreateProduct} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Product Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Minimalist Ceramic Mug"
              className="w-full rounded-lg border border-zinc-200 p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Category *
              </label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="" disabled>Select a category</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Price (INR ₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="e.g. 49.99"
                className="w-full rounded-lg border border-zinc-200 p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Assign Inventory Manager (Optional)
            </label>
            <select
              value={formData.managerId}
              onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
              className="w-full rounded-lg border border-zinc-200 p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="">Unassigned</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detailed description of the product..."
              className="w-full rounded-lg border border-zinc-200 p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          <section className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800" aria-label="Product images">
            <div>
              <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Product Images</h3>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                Optional · JPG, PNG, or WebP · Maximum 5 MB
              </p>
            </div>
            {(imagePreview || imageAsset?.imageUrl) && (
              <div className="relative aspect-[4/3] max-w-xs overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                <img
                  src={imagePreview || imageAsset.imageUrl}
                  alt="Product image preview"
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800">
                <Upload size={14} />
                Choose Image
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={handleImageSelection}
                  className="sr-only"
                  aria-label="Choose product image"
                />
              </label>
              {imageFile && (
                <button
                  type="button"
                  onClick={handleImageUpload}
                  disabled={imageUploading}
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  <Upload size={14} />
                  {imageUploading ? `Uploading ${imageUploadProgress}%` : "Upload Image"}
                </button>
              )}
              {(imageAsset || imageFile) && (
                <button
                  type="button"
                  onClick={handleRemoveProductImage}
                  disabled={imageUploading}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                >
                  <X size={14} />
                  Remove
                </button>
              )}
            </div>
            {imageFile && <p className="text-[11px] text-zinc-500">{imageFile.name} selected. Upload it before saving.</p>}
            {imageUploading && (
              <progress
                value={imageUploadProgress}
                max="100"
                aria-label="Image upload progress"
                className="h-1.5 w-full accent-zinc-900"
              />
            )}
            {imageError && <p role="alert" className="text-xs font-medium text-rose-700 dark:text-rose-400">{imageError}</p>}
          </section>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-850">
            <button
              type="button"
              onClick={() => cancelProductForm("add")}
              disabled={imageUploading}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || imageUploading}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {saving ? "Creating..." : "Create Product"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Product Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => cancelProductForm("edit")}
        title="Edit Product"
        description="Update details, pricing, manager, or inventory availability."
      >
        <form onSubmit={handleUpdateProduct} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Product Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-lg border border-zinc-200 p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Category *
              </label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="" disabled>Select a category</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Price (INR ₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Manager Assignment
              </label>
              <select
                value={formData.managerId}
                onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="">Unassigned</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Stock Status
              </label>
              <select
                value={formData.inStock ? "true" : "false"}
                onChange={(e) => setFormData({ ...formData, inStock: e.target.value === "true" })}
                className="w-full rounded-lg border border-zinc-200 p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="true">In Stock</option>
                <option value="false">Out of Stock</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full rounded-lg border border-zinc-200 p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          <section className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800" aria-label="Product images">
            <div>
              <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Product Images</h3>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                Current image is shown below. Upload a replacement or remove it.
              </p>
            </div>
            {(imagePreview || imageAsset?.imageUrl) && (
              <div className="relative aspect-[4/3] max-w-xs overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                <img
                  src={imagePreview || imageAsset.imageUrl}
                  alt="Product image preview"
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800">
                <Upload size={14} />
                {imageAsset ? "Replace Image" : "Choose Image"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={handleImageSelection}
                  className="sr-only"
                  aria-label="Choose replacement product image"
                />
              </label>
              {imageFile && (
                <button
                  type="button"
                  onClick={handleImageUpload}
                  disabled={imageUploading}
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  <Upload size={14} />
                  {imageUploading ? `Uploading ${imageUploadProgress}%` : "Upload Image"}
                </button>
              )}
              {(imageAsset || imageFile) && (
                <button
                  type="button"
                  onClick={handleRemoveProductImage}
                  disabled={imageUploading}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                >
                  <X size={14} />
                  Remove
                </button>
              )}
            </div>
            {imageFile && <p className="text-[11px] text-zinc-500">{imageFile.name} selected. Upload it before saving.</p>}
            {imageUploading && (
              <progress
                value={imageUploadProgress}
                max="100"
                aria-label="Image upload progress"
                className="h-1.5 w-full accent-zinc-900"
              />
            )}
            {imageError && <p role="alert" className="text-xs font-medium text-rose-700 dark:text-rose-400">{imageError}</p>}
          </section>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-850">
            <button
              type="button"
              onClick={() => cancelProductForm("edit")}
              disabled={imageUploading}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || imageUploading}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirm Deletion"
        description="Are you sure you want to delete this product? This action cannot be undone."
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
            <p className="font-semibold">{currentProduct?.name}</p>
            <p className="text-[11px] mt-0.5">Category: {currentProduct?.category} · Price: ₹{currentProduct?.price}</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeleteModalOpen(false)}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleDeleteProduct}
              className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Confirm Delete"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
