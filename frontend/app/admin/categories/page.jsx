"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Edit2,
  LoaderCircle,
  Package,
  Plus,
  RefreshCw,
  Search,
  Tags,
  Trash2,
  X
} from "lucide-react";
import { authRequest } from "../../../lib/api/auth";
import { useAuth } from "../../../components/auth-provider";
import { Modal } from "../../../components/admin/modal";

const emptyForm = { name: "", slug: "", description: "" };

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}

export default function AdminCategoriesPage() {
  const { csrfToken } = useAuth();
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadCategories = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const response = await authRequest("admin/categories");
      const data = Array.isArray(response) ? response : response?.data;
      if (!Array.isArray(data)) {
        throw new Error("The categories response was invalid.");
      }
      setCategories(data);
      setStatus("ready");
    } catch (err) {
      setError(err.message || "Failed to load categories.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  function openCreateForm() {
    setEditingCategory(null);
    setForm(emptyForm);
    setSlugTouched(false);
    setError("");
    setFormOpen(true);
  }

  function openEditForm(category) {
    setEditingCategory(category);
    setForm({
      name: category.name,
      slug: category.slug,
      description: category.description || ""
    });
    setSlugTouched(true);
    setError("");
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditingCategory(null);
    setForm(emptyForm);
  }

  async function saveCategory(event) {
    event.preventDefault();
    const name = form.name.trim();
    const slug = form.slug.trim();
    if (!name || name.length > 100) {
      setError("Enter a category name of up to 100 characters.");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) {
      setError("Use lowercase letters, numbers, and single hyphens for the slug.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = { name, slug, description: form.description.trim() || null };
      await authRequest(
        editingCategory
          ? editingCategory.id
            ? `admin/categories/${editingCategory.id}`
            : `admin/categories/legacy/${encodeURIComponent(editingCategory.name)}`
          : "admin/categories",
        {
          method: editingCategory ? "PATCH" : "POST",
          body: payload,
          csrfToken
        }
      );
      setNotice(editingCategory ? "Category updated." : "Category created.");
      setFormOpen(false);
      setEditingCategory(null);
      setForm(emptyForm);
      await loadCategories();
    } catch (err) {
      setError(err.message || "The category could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(category) {
    if (!window.confirm(`Delete the “${category.name}” category?`)) return;
    const categoryKey = category.id || category.name;
    setDeletingId(categoryKey);
    setError("");
    setNotice("");
    try {
      await authRequest(
        category.id
          ? `admin/categories/${category.id}`
          : `admin/categories/legacy/${encodeURIComponent(category.name)}`,
        { method: "DELETE", csrfToken }
      );
      setNotice("Category deleted.");
      await loadCategories();
    } catch (err) {
      setError(err.message || "The category could not be deleted.");
    } finally {
      setDeletingId(null);
    }
  }

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    return categories
      .filter((category) => !query || category.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, search]);

  const totalProducts = categories.reduce((sum, category) => sum + category.productCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Categories
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Review product categories and manage the products assigned to each one.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadCategories}
            disabled={status === "loading"}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <RefreshCw size={13} className={status === "loading" ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Plus size={14} />
            Add Category
          </button>
        </div>
      </div>

      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              <Tags size={18} />
            </span>
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Categories</p>
              <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{categories.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              <Package size={18} />
            </span>
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Products assigned</p>
              <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{totalProducts}</p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 sm:flex-row sm:items-center sm:justify-between dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <span>{error}</span>
          <button type="button" onClick={loadCategories} className="font-semibold underline">
            Try again
          </button>
        </div>
      )}

      {status === "ready" && categories.length > 0 && (
        <>
          <label className="relative block max-w-sm">
            <Search size={15} className="absolute left-3 top-2.5 text-zinc-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search categories..."
              aria-label="Search categories"
              className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-100"
            />
          </label>

          {filteredCategories.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-5 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
              No categories match “{search.trim()}”.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredCategories.map((category) => (
                <article
                  key={category.id || category.name}
                  className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                        <Tags size={18} />
                      </span>
                      <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
                        {category.name}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {category.productCount} {category.productCount === 1 ? "product" : "products"}
                      </span>
                      <button type="button" onClick={() => openEditForm(category)} aria-label={`Edit ${category.name}`} className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800">
                        <Edit2 size={14} />
                      </button>
                      <button type="button" onClick={() => deleteCategory(category)} disabled={deletingId === (category.id || category.name)} aria-label={`Delete ${category.name}`} className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 disabled:opacity-50 dark:hover:bg-rose-950/40">
                        {deletingId === (category.id || category.name) ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4 text-xs dark:border-zinc-800">
                    <span className="text-zinc-500 dark:text-zinc-400">In stock</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {category.inStockCount}
                    </span>
                  </div>
                  <Link
                    href="/admin/products"
                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
                  >
                    Manage products
                    <ArrowUpRight size={14} />
                  </Link>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {status === "ready" && categories.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-5 py-14 text-center dark:border-zinc-700 dark:bg-zinc-950">
          <Tags size={24} className="mx-auto text-zinc-400" />
          <h2 className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            No product categories yet
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Categories appear here when products are assigned to them.
          </p>
          <Link
            href="/admin/products"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Go to products
            <ArrowUpRight size={14} />
          </Link>
        </div>
      )}

      <Modal
        isOpen={formOpen}
        onClose={closeForm}
        title={editingCategory ? "Edit category" : "Add category"}
        description="Categories are stored in the ShopSphere database and can be assigned to products."
      >
        <form onSubmit={saveCategory} className="space-y-4">
          <label className="block space-y-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            <span>Category name <span className="text-rose-500">*</span></span>
            <input
              required
              maxLength={100}
              value={form.name}
              onChange={(event) => {
                const name = event.target.value;
                setForm((previous) => ({
                  ...previous,
                  name,
                  slug: slugTouched ? previous.slug : slugify(name)
                }));
              }}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-100"
            />
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            <span>Slug <span className="text-rose-500">*</span></span>
            <input
              required
              maxLength={120}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={form.slug}
              onChange={(event) => {
                setSlugTouched(true);
                setForm((previous) => ({ ...previous, slug: event.target.value.toLowerCase() }));
              }}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-100"
            />
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            <span>Description <span className="font-normal text-zinc-400">(optional)</span></span>
            <textarea
              maxLength={500}
              rows={3}
              value={form.description}
              onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))}
              className="w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-100"
            />
          </label>
          {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <button type="button" onClick={closeForm} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800">
              <X size={13} /> Cancel
            </button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900">
              {saving && <LoaderCircle size={13} className="animate-spin" />}
              {saving ? "Saving..." : "Save Category"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
