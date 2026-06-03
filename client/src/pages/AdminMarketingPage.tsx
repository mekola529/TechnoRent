import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/client";
import {
  AdminButton,
  AdminCard,
  AdminFilterBar,
  AdminInput,
  AdminPageHeader,
  AdminSelect,
} from "../components/admin";

interface MarketingLink {
  id: string;
  code: string;
  name: string;
  description: string | null;
  destinationPath: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  fullUrl: string;
  clicksCount: number;
  leadsCount: number;
  conversionRate: number;
}

interface MarketingDestinationOption {
  path: string;
  label: string;
}

interface MarketingSummaryRow {
  source: string;
  leads: number;
}

interface MarketingCampaignSummaryRow {
  campaign: string;
  leads: number;
}

interface MarketingSummary {
  clicks: number;
  trackedClicks: number;
  directVisits: number;
  leads: number;
  conversionRate: number;
  topSource: string | null;
  sources: MarketingSummaryRow[];
  campaigns: MarketingCampaignSummaryRow[];
}

const defaultForm = {
  id: "",
  name: "",
  description: "",
  destinationPath: "/",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  utmContent: "",
  utmTerm: "",
};

const periodOptions = [
  { value: "all", label: "Весь час" },
  { value: "1", label: "Сьогодні / 24 години" },
  { value: "7", label: "7 днів" },
  { value: "30", label: "30 днів" },
] as const;

export default function AdminMarketingPage() {
  const [links, setLinks] = useState<MarketingLink[]>([]);
  const [summary, setSummary] = useState<MarketingSummary | null>(null);
  const [destinationOptions, setDestinationOptions] = useState<MarketingDestinationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadLinks() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (period !== "all") params.set("period", period);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const data = await apiFetch<MarketingLink[]>(`/admin/marketing/links${params.toString() ? `?${params.toString()}` : ""}`);
      setLinks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити маркетинг");
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary() {
    setSummaryLoading(true);
    try {
      const params = new URLSearchParams();
      if (period !== "all") params.set("period", period);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      const data = await apiFetch<MarketingSummary>(`/admin/marketing/summary${params.toString() ? `?${params.toString()}` : ""}`);
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити summary");
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
    loadLinks();
    loadSummary();
  }, [period, sourceFilter, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<MarketingDestinationOption[]>("/admin/marketing/options");
        if (!cancelled) {
          setDestinationOptions(data);
        }
      } catch {
        // ignore, manual path input still works
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filteredLinks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return links;
    return links.filter((link) =>
      [
        link.name,
        link.code,
        link.destinationPath,
        link.utmSource ?? "",
        link.utmMedium ?? "",
        link.utmCampaign ?? "",
      ].join(" ").toLowerCase().includes(needle),
    );
  }, [links, query]);

  const kpi = useMemo(() => {
    if (summary) {
      return {
        clicks: summary.clicks,
        directVisits: summary.directVisits,
        leads: summary.leads,
        conversion: summary.conversionRate.toFixed(1),
        best: summary.topSource ?? "—",
      };
    }

    const clicks = links.reduce((sum, link) => sum + link.clicksCount, 0);
    const leads = links.reduce((sum, link) => sum + link.leadsCount, 0);
    const sourceTotals = new Map<string, number>();
    for (const link of links) {
      const key = link.utmSource?.trim() || "unknown";
      sourceTotals.set(key, (sourceTotals.get(key) ?? 0) + link.leadsCount);
    }
    const bestSource = [...sourceTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      clicks,
      directVisits: 0,
      leads,
      conversion: clicks > 0 ? ((leads / clicks) * 100).toFixed(1) : "0.0",
      best: bestSource ?? "—",
    };
  }, [links, summary]);

  const sourceOptions = useMemo(() => {
    const values = Array.from(
      new Set([
        ...links.map((link) => link.utmSource).filter(Boolean),
        ...(summary?.sources.map((item) => item.source).filter((value) => value && value !== "unknown") ?? []),
      ]),
    ) as string[];
    return values.sort((a, b) => a.localeCompare(b, "uk"));
  }, [links, summary]);

  function setField(field: keyof typeof defaultForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function startEdit(link: MarketingLink) {
    setForm({
      id: link.id,
      name: link.name,
      description: link.description ?? "",
      destinationPath: link.destinationPath,
      utmSource: link.utmSource ?? "",
      utmMedium: link.utmMedium ?? "",
      utmCampaign: link.utmCampaign ?? "",
      utmContent: link.utmContent ?? "",
      utmTerm: link.utmTerm ?? "",
    });
    setError("");
  }

  function resetForm() {
    setForm(defaultForm);
    setError("");
  }

  async function handleSubmit() {
    setSaving(true);
    setError("");
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        destinationPath: form.destinationPath,
        utmSource: form.utmSource || undefined,
        utmMedium: form.utmMedium || undefined,
        utmCampaign: form.utmCampaign || undefined,
        utmContent: form.utmContent || undefined,
        utmTerm: form.utmTerm || undefined,
      };

      const saved = form.id
        ? await apiFetch<MarketingLink>(`/admin/marketing/links/${form.id}`, {
            method: "PUT",
            body: JSON.stringify(body),
          })
        : await apiFetch<MarketingLink>("/admin/marketing/links", {
            method: "POST",
            body: JSON.stringify(body),
          });

      setLinks((prev) => {
        const exists = prev.some((item) => item.id === saved.id);
        return exists
          ? prev.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...prev];
      });
      setNotice(form.id ? "Посилання оновлено" : "Посилання створено");
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося зберегти посилання");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(link: MarketingLink) {
    try {
      const updated = await apiFetch<MarketingLink>(`/admin/marketing/links/${link.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !link.isActive }),
      });
      setLinks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(updated.isActive ? "Посилання активовано" : "Посилання деактивовано");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося змінити статус");
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Посилання скопійовано");
    } catch {
      setError("Не вдалося скопіювати посилання");
    }
  }

  return (
    <div className="flex flex-col gap-4 font-sans">
      <AdminPageHeader
        title="Маркетинг"
        subtitle={`${links.length} tracking-посилань`}
      >
        <AdminButton variant="secondary" size="sm" onClick={loadLinks}>
          Оновити
        </AdminButton>
      </AdminPageHeader>

      <div className="grid gap-3 md:grid-cols-5">
        <KpiCard label="Усього переходів" value={summaryLoading ? "…" : String(kpi.clicks)} />
        <KpiCard label="Прямі переходи" value={summaryLoading ? "…" : String(kpi.directVisits)} />
        <KpiCard label="Усього заявок" value={summaryLoading ? "…" : String(kpi.leads)} />
        <KpiCard label="Конверсія" value={summaryLoading ? "…" : `${kpi.conversion}%`} />
        <KpiCard label="Найкраще джерело" value={summaryLoading ? "…" : kpi.best} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminCard className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Топ джерела</h2>
            <span className="text-xs text-gray-400">
              {period === "all" ? "Весь час" : `Період: ${period} дн.`}
            </span>
          </div>
          {summaryLoading ? (
            <p className="text-sm text-gray-400">Завантаження…</p>
          ) : !summary || summary.sources.length === 0 ? (
            <p className="text-sm text-gray-400">Даних по джерелах ще немає</p>
          ) : (
            <div className="flex flex-col gap-2">
              {summary.sources.map((item) => (
                <div key={item.source} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5">
                  <span className="text-sm font-medium text-gray-800">{item.source}</span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    {item.leads} заяв.
                  </span>
                </div>
              ))}
            </div>
          )}
        </AdminCard>

        <AdminCard className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Топ кампанії</h2>
            <span className="text-xs text-gray-400">По заявках</span>
          </div>
          {summaryLoading ? (
            <p className="text-sm text-gray-400">Завантаження…</p>
          ) : !summary || summary.campaigns.length === 0 ? (
            <p className="text-sm text-gray-400">Даних по кампаніях ще немає</p>
          ) : (
            <div className="flex flex-col gap-2">
              {summary.campaigns.map((item) => (
                <div key={item.campaign} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5">
                  <span className="truncate text-sm font-medium text-gray-800">{item.campaign}</span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {item.leads} заяв.
                  </span>
                </div>
              ))}
            </div>
          )}
        </AdminCard>
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {notice}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <AdminCard className="flex flex-col gap-4 overflow-hidden">
          <AdminFilterBar
            searchValue={query}
            onSearchChange={setQuery}
            searchPlaceholder="Пошук за назвою, кодом, UTM або шляхом…"
          >
            <div className="w-full sm:w-48">
              <AdminSelect value={period} onChange={(event) => setPeriod(event.target.value)}>
                {periodOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </AdminSelect>
            </div>
            <div className="w-full sm:w-44">
              <AdminSelect value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                <option value="all">Усі джерела</option>
                {sourceOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </AdminSelect>
            </div>
            <div className="w-full sm:w-44">
              <AdminSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Усі статуси</option>
                <option value="active">Активні</option>
                <option value="inactive">Вимкнені</option>
              </AdminSelect>
            </div>
          </AdminFilterBar>

          {loading ? (
            <p className="py-10 text-center text-sm text-gray-400">Завантаження…</p>
          ) : filteredLinks.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">Tracking-посилань ще немає</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2">Назва</th>
                    <th className="px-3 py-2">Джерело</th>
                    <th className="px-3 py-2">Кампанія</th>
                    <th className="px-3 py-2">Посилання</th>
                    <th className="px-3 py-2">Кліки</th>
                    <th className="px-3 py-2">Заявки</th>
                    <th className="px-3 py-2">Конв.</th>
                    <th className="px-3 py-2">Статус</th>
                    <th className="px-3 py-2">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLinks.map((link) => (
                    <tr key={link.id} className="border-b border-gray-100 align-top">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-gray-900">{link.name}</div>
                        <div className="text-xs text-gray-500">{link.code}</div>
                      </td>
                      <td className="px-3 py-3 text-gray-700">
                        {link.utmSource ?? "—"}
                        <div className="text-xs text-gray-500">{link.utmMedium ?? "—"}</div>
                      </td>
                      <td className="px-3 py-3 text-gray-700">{link.utmCampaign ?? "—"}</td>
                      <td className="px-3 py-3">
                        <div className="max-w-[240px] break-all text-xs text-gray-600">{link.fullUrl}</div>
                      </td>
                      <td className="px-3 py-3 text-gray-700">{link.clicksCount}</td>
                      <td className="px-3 py-3 text-gray-700">{link.leadsCount}</td>
                      <td className="px-3 py-3 text-gray-700">{link.conversionRate}%</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${link.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>
                          {link.isActive ? "Активне" : "Вимкнене"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-2">
                          <AdminButton variant="secondary" size="sm" onClick={() => copyLink(link.fullUrl)}>
                            Копіювати
                          </AdminButton>
                          <AdminButton variant="secondary" size="sm" onClick={() => startEdit(link)}>
                            Редагувати
                          </AdminButton>
                          <AdminButton variant="ghost" size="sm" onClick={() => toggleStatus(link)}>
                            {link.isActive ? "Деактивувати" : "Активувати"}
                          </AdminButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>

        <AdminCard className="flex flex-col gap-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
            {form.id ? "Редагування посилання" : "Нове посилання"}
          </h2>

          <div className="grid gap-3">
            <Field label="Назва">
              <AdminInput value={form.name} onChange={(event) => setField("name", event.target.value)} />
            </Field>
            <Field label="Опис">
              <AdminInput value={form.description} onChange={(event) => setField("description", event.target.value)} />
            </Field>
            <Field label="Куди веде">
              <AdminSelect value={form.destinationPath} onChange={(event) => setField("destinationPath", event.target.value)}>
                {destinationOptions.map((option) => (
                  <option key={option.path} value={option.path}>{option.label}</option>
                ))}
              </AdminSelect>
            </Field>
            <Field label="Або свій шлях">
              <AdminInput placeholder="/services/dostavka-sypuchyh-materialiv" value={form.destinationPath} onChange={(event) => setField("destinationPath", event.target.value)} />
            </Field>
            <Field label="utm_source">
              <AdminInput value={form.utmSource} onChange={(event) => setField("utmSource", event.target.value)} />
            </Field>
            <Field label="utm_medium">
              <AdminInput value={form.utmMedium} onChange={(event) => setField("utmMedium", event.target.value)} />
            </Field>
            <Field label="utm_campaign">
              <AdminInput value={form.utmCampaign} onChange={(event) => setField("utmCampaign", event.target.value)} />
            </Field>
            <Field label="utm_content">
              <AdminInput value={form.utmContent} onChange={(event) => setField("utmContent", event.target.value)} />
            </Field>
            <Field label="utm_term">
              <AdminInput value={form.utmTerm} onChange={(event) => setField("utmTerm", event.target.value)} />
            </Field>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2">
            <AdminButton onClick={handleSubmit} disabled={saving}>
              {saving ? "Збереження..." : form.id ? "Зберегти" : "Створити"}
            </AdminButton>
            {form.id && (
              <AdminButton variant="secondary" onClick={resetForm}>
                Скасувати
              </AdminButton>
            )}
          </div>
        </AdminCard>
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <AdminCard className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <span className="text-xl font-bold text-gray-900">{value}</span>
    </AdminCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}
