import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../api/client";
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminPageHeader,
  AdminSelect,
  AdminTextarea,
  StatusBadge,
} from "../components/admin";
import { AdminTableRowsSkeleton } from "../components/Skeleton";

interface NotificationVariable {
  key: string;
  label: string;
  description: string;
  exampleValue: string;
  group: string;
  sortOrder: number;
}

interface NotificationTemplate {
  id: string;
  key: string;
  serviceSlug: string | null;
  name: string;
  channel: string;
  category: string;
  recipientType: string;
  isEnabled: boolean;
  bodyTemplate: string;
  notes: string | null;
  supportsHtml: boolean;
  hasInteractiveButtons: boolean;
  defaultTemplate: string;
  variables: NotificationVariable[];
  isOverride?: boolean;
  isInherited?: boolean;
  updatedAt: string;
}

interface AdminServiceOption {
  slug: string;
  title: string;
  isActive?: boolean;
}

const channelLabels: Record<string, string> = {
  telegram_admin: "Telegram адміну",
  telegram_worker: "Telegram працівнику",
};

const categoryLabels: Record<string, string> = {
  requests: "Заявки",
  orders: "Замовлення",
  workers: "Працівники",
  execution: "Execution",
  system: "Системні",
};

const recipientLabels: Record<string, string> = {
  admin: "Адмін",
  manager: "Менеджер",
  worker: "Працівник",
  system: "Система",
};

const allowedPreviewTags = new Set(["B", "BR", "CODE", "EM", "I", "P", "PRE", "S", "SPAN", "STRONG", "U"]);

function sanitizeHtmlPreview(html: string) {
  if (typeof window === "undefined") return "";

  const template = document.createElement("template");
  template.innerHTML = html;

  function sanitizeNode(node: Node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      if (!allowedPreviewTags.has(element.tagName)) {
        element.replaceWith(document.createTextNode(element.textContent ?? ""));
        return;
      }

      for (const attribute of Array.from(element.attributes)) {
        element.removeAttribute(attribute.name);
      }
    }

    for (const child of Array.from(node.childNodes)) {
      sanitizeNode(child);
    }
  }

  sanitizeNode(template.content);
  return template.innerHTML;
}

export default function AdminNotificationsPage() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [services, setServices] = useState<AdminServiceOption[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [selectedServiceSlug, setSelectedServiceSlug] = useState("");
  const [selected, setSelected] = useState<NotificationTemplate | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    isEnabled: true,
    bodyTemplate: "",
    notes: "",
  });
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [previewMode, setPreviewMode] = useState<"preview" | "raw">("preview");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sanitizedPreview = useMemo(() => sanitizeHtmlPreview(preview || "—"), [preview]);

  async function loadTemplates(nextSelectedKey = selectedKey) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (channelFilter) params.set("channel", channelFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const list = await apiFetch<NotificationTemplate[]>(`/admin/notifications/templates?${params.toString()}`);
      setTemplates(list);
      const keyToOpen = nextSelectedKey || list[0]?.key || "";
      setSelectedKey(keyToOpen);
      if (keyToOpen) {
        await loadTemplate(keyToOpen, selectedServiceSlug);
      } else {
        setSelected(null);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не вдалося завантажити шаблони");
    } finally {
      setLoading(false);
    }
  }

  async function loadTemplate(key: string, serviceSlug = selectedServiceSlug) {
    const template = await apiFetch<NotificationTemplate>(
      `/admin/notifications/templates/${key}${buildServiceQuery(serviceSlug)}`,
    );
    setSelected(template);
    setDraft({
      name: template.name,
      isEnabled: template.isEnabled,
      bodyTemplate: template.bodyTemplate,
      notes: template.notes ?? "",
    });
    await loadPreview(key, template.bodyTemplate, serviceSlug);
  }

  async function loadPreview(key = selectedKey, bodyTemplate = draft.bodyTemplate, serviceSlug = selectedServiceSlug) {
    if (!key) return;
    const result = await apiFetch<{ text: string; unknownVariables: string[] }>(
      `/admin/notifications/templates/${key}/preview${buildServiceQuery(serviceSlug)}`,
      {
        method: "POST",
        body: JSON.stringify({ bodyTemplate }),
      },
    );
    setPreview(result.text);
  }

  useEffect(() => {
    loadTemplates();
    void loadServices();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadTemplates(selectedKey);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, channelFilter, categoryFilter, statusFilter]);

  useEffect(() => {
    if (selectedKey) {
      void loadTemplate(selectedKey, selectedServiceSlug);
    }
  }, [selectedServiceSlug]);

  const groupedVariables = useMemo(() => {
    const groups = new Map<string, NotificationVariable[]>();
    for (const variable of selected?.variables ?? []) {
      const current = groups.get(variable.group) ?? [];
      current.push(variable);
      groups.set(variable.group, current);
    }
    return [...groups.entries()].map(([group, items]) => ({
      group,
      items: [...items].sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  }, [selected]);

  const isDirty = selected
    ? draft.name !== selected.name ||
      draft.isEnabled !== selected.isEnabled ||
      draft.bodyTemplate !== selected.bodyTemplate ||
      draft.notes !== (selected.notes ?? "")
    : false;

  async function selectTemplate(key: string) {
    if (isDirty && !window.confirm("Є незбережені зміни. Перейти без збереження?")) {
      return;
    }
    setSelectedKey(key);
    await loadTemplate(key, selectedServiceSlug);
  }

  async function loadServices() {
    try {
      const list = await apiFetch<AdminServiceOption[]>("/admin/services");
      setServices(list);
    } catch {
      setServices([]);
    }
  }

  async function saveTemplate() {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await apiFetch<NotificationTemplate>(
        `/admin/notifications/templates/${selected.key}${buildServiceQuery(selectedServiceSlug)}`,
        {
        method: "PUT",
        body: JSON.stringify(draft),
        },
      );
      setSelected(updated);
      setDraft({
        name: updated.name,
        isEnabled: updated.isEnabled,
        bodyTemplate: updated.bodyTemplate,
        notes: updated.notes ?? "",
      });
      await loadPreview(updated.key, updated.bodyTemplate, selectedServiceSlug);
      await loadTemplates(updated.key);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не вдалося зберегти шаблон");
    } finally {
      setSaving(false);
    }
  }

  async function resetTemplate() {
    const message = selectedServiceSlug
      ? "Відновити дефолтний шаблон для цієї послуги?"
      : "Відновити дефолтний шаблон? Поточний текст буде замінено.";
    if (!selected || !window.confirm(message)) return;
    const updated = await apiFetch<NotificationTemplate>(
      `/admin/notifications/templates/${selected.key}/reset${buildServiceQuery(selectedServiceSlug)}`,
      {
        method: "POST",
      },
    );
    setSelected(updated);
    setDraft({
      name: updated.name,
      isEnabled: updated.isEnabled,
      bodyTemplate: updated.bodyTemplate,
      notes: updated.notes ?? "",
    });
    await loadPreview(updated.key, updated.bodyTemplate, selectedServiceSlug);
    await loadTemplates(updated.key);
  }

  function insertVariable(key: string) {
    const token = `{{${key}}}`;
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? draft.bodyTemplate.length;
    const end = textarea?.selectionEnd ?? draft.bodyTemplate.length;
    const next = `${draft.bodyTemplate.slice(0, start)}${token}${draft.bodyTemplate.slice(end)}`;
    setDraft((prev) => ({ ...prev, bodyTemplate: next }));
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + token.length, start + token.length);
    });
    void loadPreview(selectedKey, next, selectedServiceSlug);
  }

  return (
    <div className="flex h-full flex-col gap-4 font-sans">
      <AdminPageHeader
        title="Налаштування сповіщень"
        subtitle="Шаблони Telegram-повідомлень для CRM та worker flow"
      >
        <AdminButton variant="secondary" size="sm" onClick={() => loadTemplates(selectedKey)}>
          Оновити
        </AdminButton>
      </AdminPageHeader>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
        <AdminCard className="flex min-h-[620px] flex-col gap-3 overflow-hidden p-0">
          <div className="border-b border-gray-100 p-3">
            <div className="grid gap-2">
              <AdminInput
                placeholder="Пошук за назвою або ключем…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <AdminSelect value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
                  <option value="">Усі канали</option>
                  <option value="telegram_admin">Telegram адміну</option>
                  <option value="telegram_worker">Telegram працівнику</option>
                </AdminSelect>
                <AdminSelect value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="">Усі сценарії</option>
                  {Object.entries(categoryLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </AdminSelect>
              </div>
              <AdminSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">Усі статуси</option>
                <option value="enabled">Активні</option>
                <option value="disabled">Вимкнені</option>
              </AdminSelect>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <AdminTableRowsSkeleton rows={6} cols={2} />
            ) : templates.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">Шаблони не знайдені</p>
            ) : (
              templates.map((template) => (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => selectTemplate(template.key)}
                  className={`w-full border-b border-gray-100 px-4 py-3 text-left transition-colors last:border-b-0 ${
                    selectedKey === template.key ? "bg-primary/10" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-gray-900">{template.name}</p>
                      <p className="mt-1 truncate text-xs text-gray-400">{template.key}</p>
                    </div>
                    <StatusBadge
                      status={template.isEnabled ? "confirmed" : "cancelled"}
                      label={template.isEnabled ? "Увімкнено" : "Вимкнено"}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-gray-500">
                    <span>{channelLabels[template.channel] ?? template.channel}</span>
                    <span>•</span>
                    <span>{categoryLabels[template.category] ?? template.category}</span>
                    <span>•</span>
                    <span>{recipientLabels[template.recipientType] ?? template.recipientType}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">
                    Оновлено: {formatDateTime(template.updatedAt)}
                  </p>
                </button>
              ))
            )}
          </div>
        </AdminCard>

        <AdminCard className="flex min-h-[620px] flex-col gap-4">
          {!selected ? (
            <p className="py-10 text-center text-sm text-gray-400">Оберіть шаблон</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selected.name}</h2>
                  <p className="mt-1 text-xs text-gray-500">{selected.key}</p>
                </div>
                <StatusBadge
                  status={draft.isEnabled ? "confirmed" : "cancelled"}
                  label={draft.isEnabled ? "Увімкнено" : "Вимкнено"}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <AdminInput
                  label="Назва шаблону"
                  value={draft.name}
                  onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                />
                <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={draft.isEnabled}
                    onChange={(event) => setDraft((prev) => ({ ...prev, isEnabled: event.target.checked }))}
                  />
                  Активний шаблон
                </label>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <AdminSelect
                  label="Варіант для послуги"
                  value={selectedServiceSlug}
                  onChange={(event) => setSelectedServiceSlug(event.target.value)}
                >
                  <option value="">Базовий шаблон для всіх послуг</option>
                  {services.map((service) => (
                    <option key={service.slug} value={service.slug}>
                      {service.title}{service.isActive === false ? " (неактивна)" : ""}
                    </option>
                  ))}
                </AdminSelect>
                <p className="mt-2 text-xs text-gray-500">
                  {selectedServiceSlug
                    ? selected?.isInherited
                      ? "Для цієї послуги окремого тексту ще немає. Після збереження буде створено override тільки для вибраної послуги."
                      : "Редагується окремий текст для вибраної послуги. Якщо для послуги є системний дефолт, reset поверне саме його."
                    : "Редагується базовий шаблон, який використовується якщо для послуги не створено окремий текст."}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <ReadOnlyField label="Канал" value={channelLabels[selected.channel] ?? selected.channel} />
                <ReadOnlyField label="Сценарій" value={categoryLabels[selected.category] ?? selected.category} />
                <ReadOnlyField label="Отримувач" value={recipientLabels[selected.recipientType] ?? selected.recipientType} />
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {selected.hasInteractiveButtons
                  ? "У цьому шаблоні кнопки Telegram контролюються кодом. Редагується лише текст повідомлення."
                  : "Для Telegram можна використовувати HTML-теги: <b>, <i>, <code>, <a href=\"...\">."}
              </div>

              <AdminTextarea
                ref={textareaRef}
                label="Текст шаблону"
                rows={16}
                value={draft.bodyTemplate}
                onChange={(event) => {
                  const value = event.target.value;
                  setDraft((prev) => ({ ...prev, bodyTemplate: value }));
                  void loadPreview(selected.key, value, selectedServiceSlug);
                }}
                className="font-mono text-xs leading-relaxed"
              />

              <AdminTextarea
                label="Примітка для адміністратора"
                rows={3}
                value={draft.notes}
                onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
              />

              <div className="flex flex-wrap gap-2">
                <AdminButton onClick={saveTemplate} disabled={saving || !isDirty}>
                  {saving ? "Збереження…" : "Зберегти"}
                </AdminButton>
                <AdminButton variant="secondary" onClick={() => selected && loadTemplate(selected.key)} disabled={!isDirty}>
                  Скасувати
                </AdminButton>
                <AdminButton variant="ghost" onClick={resetTemplate}>
                  {selectedServiceSlug ? "Відновити дефолт послуги" : "Відновити дефолтний"}
                </AdminButton>
                <AdminButton variant="secondary" onClick={() => loadPreview()}>
                  Попередній перегляд
                </AdminButton>
              </div>
            </>
          )}
        </AdminCard>

        <div className="flex min-h-[620px] flex-col gap-4">
          <AdminCard className="flex max-h-[340px] flex-col gap-3 overflow-hidden">
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">Доступні змінні</h3>
            <div className="flex-1 overflow-y-auto pr-1">
              {groupedVariables.length === 0 ? (
                <p className="text-sm text-gray-400">Оберіть шаблон</p>
              ) : (
                groupedVariables.map((group) => (
                  <div key={group.group} className="mb-4 last:mb-0">
                    <p className="mb-2 text-xs font-bold text-gray-500">{group.group}</p>
                    <div className="flex flex-col gap-2">
                      {group.items.map((variable) => (
                        <div key={variable.key} className="rounded-lg border border-gray-100 bg-gray-50 p-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <code className="break-all text-xs font-bold text-gray-900">{`{{${variable.key}}}`}</code>
                              <p className="mt-1 text-xs text-gray-500">{variable.description}</p>
                              <p className="mt-1 text-[11px] text-gray-400">Напр.: {variable.exampleValue}</p>
                            </div>
                            <AdminButton size="sm" variant="secondary" onClick={() => insertVariable(variable.key)}>
                              Вставити
                            </AdminButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </AdminCard>

          <AdminCard className="flex flex-1 flex-col gap-3 overflow-hidden">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">Preview</h3>
              <AdminSelect value={previewMode} onChange={(event) => setPreviewMode(event.target.value as "preview" | "raw")}>
                <option value="preview">Preview</option>
                <option value="raw">Сирий шаблон</option>
              </AdminSelect>
            </div>
            <div className="flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3">
              {previewMode === "raw" ? (
                <pre className="whitespace-pre-wrap break-words text-xs text-gray-700">{draft.bodyTemplate || "—"}</pre>
              ) : selected?.supportsHtml ? (
                <div
                  className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800"
                  dangerouslySetInnerHTML={{ __html: sanitizedPreview }}
                />
              ) : (
                <pre className="whitespace-pre-wrap break-words text-sm text-gray-800">{preview || "—"}</pre>
              )}
            </div>
          </AdminCard>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildServiceQuery(serviceSlug: string) {
  if (!serviceSlug.trim()) return "";
  const params = new URLSearchParams({ serviceSlug: serviceSlug.trim() });
  return `?${params.toString()}`;
}
