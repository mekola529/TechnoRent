import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch } from "../api/client";
import { AdminButton, AdminCard, AdminPageHeader } from "../components/admin";
import { AdminInput, AdminSelect } from "../components/admin/AdminInput";
import { useAuth } from "../context/useAuth";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface HomepageSettings {
  heroImage: string;
}

interface AdminAccount {
  id: string;
  email: string;
  role: "ADMIN" | "MANAGER";
  telegramChatId: string | null;
  telegramUserId: string | null;
  telegramUsername: string | null;
  createdAt: string;
}

interface AdminAccountsResponse {
  admins: AdminAccount[];
}

function imageSrc(url: string) {
  if (url.startsWith("http")) return url;
  return `${API_BASE.replace(/\/api$/, "")}${url}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("uk", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function AdminSettingsPage() {
  const { admin } = useAuth();
  const [heroImage, setHeroImage] = useState("");
  const [initialHeroImage, setInitialHeroImage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const [adminSaving, setAdminSaving] = useState(false);
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [newAdmin, setNewAdmin] = useState({
    email: "",
    password: "",
    role: "MANAGER" as "ADMIN" | "MANAGER",
    telegramChatId: "",
    telegramUserId: "",
    telegramUsername: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canManageAdmins = admin?.role === "ADMIN";

  useEffect(() => {
    apiFetch<HomepageSettings>("/admin/settings/homepage")
      .then((settings) => {
        setHeroImage(settings.heroImage);
        setInitialHeroImage(settings.heroImage);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Помилка завантаження"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!canManageAdmins) return;

    setAdminsLoading(true);
    apiFetch<AdminAccountsResponse>("/admin/admins")
      .then((data) => setAdmins(data.admins))
      .catch((error) => setAdminMessage(error instanceof Error ? error.message : "Помилка завантаження адмінів"))
      .finally(() => setAdminsLoading(false));
  }, [canManageAdmins]);

  async function uploadImage(file: File): Promise<{ url: string; alt: string }> {
    const fd = new FormData();
    fd.append("image", file);
    const token = localStorage.getItem("admin_token");
    const res = await fetch(`${API_BASE}/admin/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setMessage("");
    try {
      const result = await uploadImage(files[0]);
      setHeroImage(result.url);
      setMessage("Фото завантажено. Натисніть Зберегти, щоб застосувати його на головній.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Помилка завантаження фото");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const value = heroImage.trim();
    if (!value) {
      setMessage("Вкажіть URL або завантажте фото.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const saved = await apiFetch<HomepageSettings>("/admin/settings/homepage", {
        method: "PUT",
        body: JSON.stringify({ heroImage: value }),
      });
      setHeroImage(saved.heroImage);
      setInitialHeroImage(saved.heroImage);
      setMessage("Налаштування збережено.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  function startEditAdmin(item: AdminAccount) {
    setEditingAdminId(item.id);
    setNewAdmin({
      email: item.email,
      password: "",
      role: item.role,
      telegramChatId: item.telegramChatId ?? "",
      telegramUserId: item.telegramUserId ?? "",
      telegramUsername: item.telegramUsername ?? "",
    });
    setAdminMessage("");
  }

  function cancelEditAdmin() {
    setEditingAdminId(null);
    setNewAdmin({
      email: "",
      password: "",
      role: "MANAGER",
      telegramChatId: "",
      telegramUserId: "",
      telegramUsername: "",
    });
    setAdminMessage("");
  }

  async function handleSaveAdmin(event: FormEvent) {
    event.preventDefault();
    setAdminMessage("");

    const payload = {
      ...newAdmin,
      password: newAdmin.password.trim(),
    };

    if (!editingAdminId && payload.password.length < 8) {
      setAdminMessage("Пароль має містити мінімум 8 символів.");
      return;
    }
    if (editingAdminId && payload.password && payload.password.length < 8) {
      setAdminMessage("Новий пароль має містити мінімум 8 символів.");
      return;
    }

    setAdminSaving(true);
    try {
      if (editingAdminId) {
        const updated = await apiFetch<AdminAccount>(`/admin/admins/${editingAdminId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setAdmins((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        cancelEditAdmin();
        setAdminMessage("Дані адміна оновлено.");
      } else {
        const created = await apiFetch<AdminAccount>("/admin/admins", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setAdmins((prev) => [created, ...prev]);
        cancelEditAdmin();
        setAdminMessage("Нового адміна створено.");
      }
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "Помилка збереження адміна");
    } finally {
      setAdminSaving(false);
    }
  }

  async function handleDeleteAdmin(item: AdminAccount) {
    if (!window.confirm(`Видалити адміна ${item.email}?`)) return;

    setAdminSaving(true);
    setAdminMessage("");
    try {
      await apiFetch(`/admin/admins/${item.id}`, { method: "DELETE" });
      setAdmins((prev) => prev.filter((adminItem) => adminItem.id !== item.id));
      if (editingAdminId === item.id) {
        cancelEditAdmin();
      }
      setAdminMessage("Адміна видалено.");
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "Помилка видалення адміна");
    } finally {
      setAdminSaving(false);
    }
  }

  return (
    <>
      <AdminPageHeader title="Налаштування сайту" subtitle="Фото та базові елементи головної сторінки" />

      <form onSubmit={handleSave} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <AdminCard className="!p-4">
          <h3 className="mb-3 text-sm font-bold text-gray-900">Hero на головній</h3>
          <div className="flex flex-col gap-3">
            <AdminInput
              label="URL фото hero"
              value={heroImage}
              onChange={(event) => setHeroImage(event.target.value)}
              placeholder="/uploads/hero.webp або https://..."
              disabled={loading}
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => handleFileUpload(event.target.files)}
            />

            <div className="flex flex-wrap gap-2">
              <AdminButton type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading || loading}>
                {uploading ? "Завантаження…" : "Завантажити фото"}
              </AdminButton>
              <AdminButton type="submit" disabled={saving || uploading || loading || heroImage === initialHeroImage}>
                {saving ? "Збереження…" : "Зберегти"}
              </AdminButton>
            </div>

            {message && <p className="text-sm font-medium text-gray-600">{message}</p>}
          </div>
        </AdminCard>

        <AdminCard className="!p-4">
          <h3 className="mb-3 text-sm font-bold text-gray-900">Превʼю</h3>
          {heroImage ? (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
              <img src={imageSrc(heroImage)} alt="Hero preview" className="h-56 w-full object-cover" />
            </div>
          ) : (
            <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400">
              Фото не вибрано
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            Рекомендовано горизонтальне фото шириною від 1600px. Після збереження воно автоматично підтягнеться на головній сторінці.
          </p>
        </AdminCard>
      </form>

      <div className="mt-6">
        <AdminCard className="!p-4">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Адміністратори</h3>
              <p className="mt-1 text-xs text-gray-500">
                Додавати нових адмінів може тільки користувач з роллю ADMIN.
              </p>
            </div>
          </div>

          {canManageAdmins ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Логін</th>
                      <th className="px-3 py-2">Роль</th>
                      <th className="px-3 py-2">Telegram</th>
                      <th className="px-3 py-2">Створено</th>
                      <th className="px-3 py-2 text-right">Дії</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {adminsLoading ? (
                      <tr>
                        <td className="px-3 py-4 text-gray-400" colSpan={5}>
                          Завантаження...
                        </td>
                      </tr>
                    ) : admins.length ? (
                      admins.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 font-medium text-gray-900">{item.email}</td>
                          <td className="px-3 py-2 text-gray-600">{item.role}</td>
                          <td className="px-3 py-2 text-gray-500">
                            {item.telegramUsername || item.telegramUserId || item.telegramChatId ? (
                              <div className="leading-tight">
                                {item.telegramUsername && <div>@{item.telegramUsername.replace(/^@/, "")}</div>}
                                {item.telegramUserId && <div className="text-xs">User ID: {item.telegramUserId}</div>}
                                {item.telegramChatId && <div className="text-xs">Chat ID: {item.telegramChatId}</div>}
                              </div>
                            ) : (
                              "Не прив’язано"
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-500">{formatDate(item.createdAt)}</td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-2">
                              <AdminButton type="button" size="sm" variant="secondary" onClick={() => startEditAdmin(item)}>
                                Редагувати
                              </AdminButton>
                              <AdminButton
                                type="button"
                                size="sm"
                                variant="danger"
                                disabled={adminSaving || item.id === admin?.id}
                                onClick={() => handleDeleteAdmin(item)}
                              >
                                Видалити
                              </AdminButton>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-3 py-4 text-gray-400" colSpan={5}>
                          Адмінів ще немає.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <form onSubmit={handleSaveAdmin} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    {editingAdminId ? "Редагування адміна" : "Новий адмін"}
                  </h4>
                  {editingAdminId && (
                    <AdminButton type="button" size="sm" variant="ghost" onClick={cancelEditAdmin}>
                      Скасувати
                    </AdminButton>
                  )}
                </div>
                <div className="grid gap-3">
                  <AdminInput
                    label="Логін"
                    value={newAdmin.email}
                    onChange={(event) => setNewAdmin((prev) => ({ ...prev, email: event.target.value }))}
                    autoComplete="username"
                    required
                  />
                  <AdminInput
                    label={editingAdminId ? "Новий пароль" : "Пароль"}
                    type="password"
                    value={newAdmin.password}
                    onChange={(event) => setNewAdmin((prev) => ({ ...prev, password: event.target.value }))}
                    autoComplete="new-password"
                    minLength={8}
                    required={!editingAdminId}
                    placeholder={editingAdminId ? "Залиште порожнім, щоб не змінювати" : ""}
                  />
                  <AdminSelect
                    label="Роль"
                    value={newAdmin.role}
                    onChange={(event) =>
                      setNewAdmin((prev) => ({ ...prev, role: event.target.value as "ADMIN" | "MANAGER" }))
                    }
                  >
                    <option value="MANAGER">MANAGER</option>
                    <option value="ADMIN">ADMIN</option>
                  </AdminSelect>
                  <AdminInput
                    label="Telegram username"
                    value={newAdmin.telegramUsername}
                    onChange={(event) => setNewAdmin((prev) => ({ ...prev, telegramUsername: event.target.value }))}
                    placeholder="username або @username"
                  />
                  <AdminInput
                    label="Telegram User ID"
                    value={newAdmin.telegramUserId}
                    onChange={(event) => setNewAdmin((prev) => ({ ...prev, telegramUserId: event.target.value }))}
                    placeholder="Наприклад 123456789"
                  />
                  <AdminInput
                    label="Telegram Chat ID"
                    value={newAdmin.telegramChatId}
                    onChange={(event) => setNewAdmin((prev) => ({ ...prev, telegramChatId: event.target.value }))}
                    placeholder="Для приватного чату часто збігається з User ID"
                  />
                  <AdminButton type="submit" disabled={adminSaving}>
                    {adminSaving ? "Збереження..." : editingAdminId ? "Зберегти зміни" : "Додати адміна"}
                  </AdminButton>
                  {adminMessage && <p className="text-xs font-medium text-gray-600">{adminMessage}</p>}
                </div>
              </form>
            </div>
          ) : (
            <p className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-gray-500">
              У вашої ролі немає доступу до керування адмінами.
            </p>
          )}
        </AdminCard>
      </div>
    </>
  );
}
