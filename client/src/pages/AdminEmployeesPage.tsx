import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/client";
import {
  AdminButton,
  AdminCard,
  AdminFilterBar,
  AdminInput,
  AdminPageHeader,
  AdminSelect,
  AdminTextarea,
  StatusBadge,
} from "../components/admin";
import { AdminTableRowsSkeleton } from "../components/Skeleton";

interface Employee {
  id: string;
  fullName: string;
  role: string | null;
  phone: string | null;
  telegramChatId: string | null;
  telegramUserId: string | null;
  isActive: boolean;
  notes: string | null;
  assignmentCount: number;
  createdAt: string;
}

interface Candidate {
  id: string;
  telegramUserId: string;
  telegramChatId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "LINKED";
  employeeId: string | null;
  adminId: string | null;
  startedAt: string;
  approvedAt: string | null;
  notes: string | null;
  employee: { id: string; fullName: string; role: string | null } | null;
  admin: { id: string; email: string; role: string; telegramUsername: string | null } | null;
}

interface AdminOption {
  id: string;
  email: string;
  role: "ADMIN" | "MANAGER";
  telegramChatId: string | null;
  telegramUserId: string | null;
  telegramUsername: string | null;
}

interface ResponseShape {
  employees: Employee[];
  candidates: Candidate[];
  admins: AdminOption[];
}

const candidateStatusMap = {
  PENDING: { status: "new" as const, label: "Очікує" },
  APPROVED: { status: "confirmed" as const, label: "Підтверджено" },
  REJECTED: { status: "cancelled" as const, label: "Відхилено" },
  LINKED: { status: "confirmed" as const, label: "Прив’язано" },
};

const employeeStatusMap = {
  active: { status: "confirmed" as const, label: "Активний" },
  inactive: { status: "cancelled" as const, label: "Неактивний" },
};

function fmtDateTime(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString("uk")} ${date.toLocaleTimeString("uk", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function getCandidateTitle(candidate: Candidate) {
  const fullName = [candidate.firstName, candidate.lastName].filter(Boolean).join(" ").trim();
  return fullName || candidate.username || `Telegram ${candidate.telegramUserId}`;
}

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyCandidateId, setBusyCandidateId] = useState<string | null>(null);
  const [busyEmployeeId, setBusyEmployeeId] = useState<string | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [admins, setAdmins] = useState<AdminOption[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { fullName: string; role: string; phone: string; notes: string }>>({});
  const [candidateAdminDrafts, setCandidateAdminDrafts] = useState<Record<string, string>>({});
  const [employeeDrafts, setEmployeeDrafts] = useState<
    Record<string, { fullName: string; role: string; phone: string; notes: string; isActive: boolean }>
  >({});

  async function loadData() {
    setLoading(true);
    try {
      const data = await apiFetch<ResponseShape>("/admin/employees");
      setEmployees(data.employees);
      setCandidates(data.candidates);
      setAdmins(data.admins ?? []);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const candidate of data.candidates) {
          if (!next[candidate.id]) {
            next[candidate.id] = {
              fullName: getCandidateTitle(candidate),
              role: "",
              phone: "",
              notes: "",
            };
          }
        }
        return next;
      });
      setCandidateAdminDrafts((prev) => {
        const next = { ...prev };
        for (const candidate of data.candidates) {
          next[candidate.id] = next[candidate.id] ?? candidate.adminId ?? "";
        }
        return next;
      });
      setEmployeeDrafts((prev) => {
        const next = { ...prev };
        for (const employee of data.employees) {
          next[employee.id] = next[employee.id] ?? {
            fullName: employee.fullName,
            role: employee.role ?? "",
            phone: employee.phone ?? "",
            notes: employee.notes ?? "",
            isActive: employee.isActive,
          };
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const query = search.trim().toLowerCase();

  const filteredEmployees = useMemo(() => {
    if (!query) return employees;
    return employees.filter((employee) =>
      [employee.fullName, employee.role ?? "", employee.phone ?? "", employee.telegramUserId ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [employees, query]);

  const filteredCandidates = useMemo(() => {
    if (!query) return candidates;
    return candidates.filter((candidate) =>
      [
        getCandidateTitle(candidate),
        candidate.username ?? "",
        candidate.telegramUserId,
        candidate.telegramChatId,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [candidates, query]);

  function updateDraft(candidateId: string, patch: Partial<{ fullName: string; role: string; phone: string; notes: string }>) {
    setDrafts((prev) => ({
      ...prev,
      [candidateId]: {
        ...prev[candidateId],
        fullName: prev[candidateId]?.fullName ?? "",
        role: prev[candidateId]?.role ?? "",
        phone: prev[candidateId]?.phone ?? "",
        notes: prev[candidateId]?.notes ?? "",
        ...patch,
      },
    }));
  }

  async function approveCandidate(candidateId: string) {
    const draft = drafts[candidateId];
    if (!draft?.fullName.trim()) {
      alert("Вкажіть ім’я працівника");
      return;
    }

    setBusyCandidateId(candidateId);
    try {
      await apiFetch("/admin/employees/approve-candidate", {
        method: "POST",
        body: JSON.stringify({
          candidateId,
          fullName: draft.fullName.trim(),
          role: draft.role.trim() || undefined,
          phone: draft.phone.trim() || undefined,
          notes: draft.notes.trim() || undefined,
        }),
      });
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Помилка");
    } finally {
      setBusyCandidateId(null);
    }
  }

  async function rejectCandidate(candidateId: string) {
    setBusyCandidateId(candidateId);
    try {
      await apiFetch(`/admin/employees/candidates/${candidateId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "REJECTED" }),
      });
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Помилка");
    } finally {
      setBusyCandidateId(null);
    }
  }

  async function deleteRejectedCandidate(candidateId: string) {
    if (!window.confirm("Видалити відхиленого кандидата? Цю дію не можна скасувати.")) {
      return;
    }

    setBusyCandidateId(candidateId);
    try {
      await apiFetch(`/admin/employees/candidates/${candidateId}`, {
        method: "DELETE",
      });
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Помилка");
    } finally {
      setBusyCandidateId(null);
    }
  }

  async function linkCandidateToAdmin(candidateId: string) {
    const adminId = candidateAdminDrafts[candidateId] || "";
    if (!adminId) {
      alert("Оберіть адміна для прив’язки Telegram акаунта");
      return;
    }

    setBusyCandidateId(candidateId);
    try {
      await apiFetch(`/admin/employees/candidates/${candidateId}/link-admin`, {
        method: "POST",
        body: JSON.stringify({ adminId }),
      });
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Помилка");
    } finally {
      setBusyCandidateId(null);
    }
  }

  function startEditEmployee(employee: Employee) {
    setEditingEmployeeId(employee.id);
    setEmployeeDrafts((prev) => ({
      ...prev,
      [employee.id]: {
        fullName: employee.fullName,
        role: employee.role ?? "",
        phone: employee.phone ?? "",
        notes: employee.notes ?? "",
        isActive: employee.isActive,
      },
    }));
  }

  function updateEmployeeDraft(
    employeeId: string,
    patch: Partial<{ fullName: string; role: string; phone: string; notes: string; isActive: boolean }>,
  ) {
    setEmployeeDrafts((prev) => ({
      ...prev,
      [employeeId]: {
        fullName: prev[employeeId]?.fullName ?? "",
        role: prev[employeeId]?.role ?? "",
        phone: prev[employeeId]?.phone ?? "",
        notes: prev[employeeId]?.notes ?? "",
        isActive: prev[employeeId]?.isActive ?? true,
        ...patch,
      },
    }));
  }

  async function saveEmployee(employeeId: string) {
    const draft = employeeDrafts[employeeId];
    if (!draft?.fullName.trim()) {
      alert("Вкажіть ім’я працівника");
      return;
    }

    setBusyEmployeeId(employeeId);
    try {
      await apiFetch(`/admin/employees/${employeeId}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: draft.fullName.trim(),
          role: draft.role.trim() || undefined,
          phone: draft.phone.trim() || undefined,
          notes: draft.notes.trim() || undefined,
          isActive: draft.isActive,
        }),
      });
      setEditingEmployeeId(null);
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Помилка");
    } finally {
      setBusyEmployeeId(null);
    }
  }

  async function deleteEmployee(employee: Employee) {
    const warning = employee.assignmentCount > 0
      ? "У працівника є призначення в замовленнях. Якщо видалення буде заблоковане, зробіть його неактивним."
      : "Цю дію не можна скасувати.";

    if (!window.confirm(`Видалити працівника "${employee.fullName}"?\n${warning}`)) {
      return;
    }

    setBusyEmployeeId(employee.id);
    try {
      await apiFetch(`/admin/employees/${employee.id}`, {
        method: "DELETE",
      });
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Помилка");
    } finally {
      setBusyEmployeeId(null);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 font-sans">
      <AdminPageHeader
        title="Працівники"
        subtitle={`${employees.length} працівників • ${candidates.filter((item) => item.status === "PENDING").length} нових Telegram-кандидатів`}
      >
        <AdminButton variant="secondary" size="sm" onClick={loadData}>
          Оновити
        </AdminButton>
      </AdminPageHeader>

      <AdminFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Пошук за працівниками або Telegram-кандидатами…"
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <AdminCard className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Нові Telegram-кандидати</h2>
            <span className="text-sm text-gray-500">{filteredCandidates.length}</span>
          </div>

          {loading ? (
            <AdminTableRowsSkeleton rows={4} cols={3} />
          ) : filteredCandidates.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Нових кандидатів поки немає</p>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredCandidates.map((candidate) => {
                const draft = drafts[candidate.id] ?? {
                  fullName: getCandidateTitle(candidate),
                  role: "",
                  phone: "",
                  notes: "",
                };
                const meta = candidateStatusMap[candidate.status] ?? candidateStatusMap.PENDING;

                return (
                  <div key={candidate.id} className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{getCandidateTitle(candidate)}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          @{candidate.username || "без username"} • user {candidate.telegramUserId}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">Перший start: {fmtDateTime(candidate.startedAt)}</div>
                      </div>
                      <StatusBadge status={meta.status} label={meta.label} />
                    </div>

                    {candidate.employee && (
                      <div className="mt-3 rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-800">
                        Прив’язано до працівника: {candidate.employee.fullName}
                      </div>
                    )}

                    {candidate.admin && (
                      <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Прив’язано до адміна: {candidate.admin.email}
                        {candidate.admin.telegramUsername ? ` (@${candidate.admin.telegramUsername.replace(/^@/, "")})` : ""}
                      </div>
                    )}

                    {admins.length > 0 && (
                      <div className="mt-3 grid gap-2 rounded-lg border border-gray-200 bg-white p-3">
                        <AdminSelect
                          label="Прив’язати Telegram до адміна"
                          value={candidateAdminDrafts[candidate.id] ?? candidate.adminId ?? ""}
                          onChange={(event) =>
                            setCandidateAdminDrafts((prev) => ({
                              ...prev,
                              [candidate.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Оберіть адміна</option>
                          {admins.map((adminOption) => (
                            <option key={adminOption.id} value={adminOption.id}>
                              {adminOption.email} · {adminOption.role}
                            </option>
                          ))}
                        </AdminSelect>
                        <div className="flex flex-wrap items-center gap-2">
                          <AdminButton
                            variant="secondary"
                            size="sm"
                            onClick={() => linkCandidateToAdmin(candidate.id)}
                            disabled={busyCandidateId === candidate.id}
                          >
                            {busyCandidateId === candidate.id ? "Прив’язка…" : "Прив’язати до адміна"}
                          </AdminButton>
                          <span className="text-xs text-gray-400">
                            Telegram User ID: {candidate.telegramUserId}
                          </span>
                        </div>
                      </div>
                    )}

                    {candidate.status === "PENDING" && (
                      <div className="mt-4 grid gap-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <AdminInput
                            label="Ім’я працівника"
                            value={draft.fullName}
                            onChange={(event) => updateDraft(candidate.id, { fullName: event.target.value })}
                          />
                          <AdminInput
                            label="Роль"
                            placeholder="Водій, оператор, менеджер…"
                            value={draft.role}
                            onChange={(event) => updateDraft(candidate.id, { role: event.target.value })}
                          />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <AdminInput
                            label="Телефон"
                            placeholder="+380..."
                            value={draft.phone}
                            onChange={(event) => updateDraft(candidate.id, { phone: event.target.value })}
                          />
                          <div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-2">
                            <div className="text-xs font-medium text-gray-500">Telegram chat</div>
                            <div className="mt-1 text-sm text-gray-700">{candidate.telegramChatId}</div>
                          </div>
                        </div>
                        <AdminTextarea
                          label="Коментар"
                          rows={2}
                          value={draft.notes}
                          onChange={(event) => updateDraft(candidate.id, { notes: event.target.value })}
                        />
                        <div className="flex flex-wrap gap-2">
                          <AdminButton
                            size="sm"
                            onClick={() => approveCandidate(candidate.id)}
                            disabled={busyCandidateId === candidate.id}
                          >
                            {busyCandidateId === candidate.id ? "Збереження…" : "Підтвердити і створити"}
                          </AdminButton>
                          <AdminButton
                            variant="ghost"
                            size="sm"
                            onClick={() => rejectCandidate(candidate.id)}
                            disabled={busyCandidateId === candidate.id}
                          >
                            Відхилити
                          </AdminButton>
                        </div>
                      </div>
                    )}

                    {candidate.status === "REJECTED" && !candidate.employee && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <AdminButton
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteRejectedCandidate(candidate.id)}
                          disabled={busyCandidateId === candidate.id}
                        >
                          {busyCandidateId === candidate.id ? "Видалення…" : "Видалити"}
                        </AdminButton>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </AdminCard>

        <AdminCard className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Підтверджені працівники</h2>
            <span className="text-sm text-gray-500">{filteredEmployees.length}</span>
          </div>

          {loading ? (
            <AdminTableRowsSkeleton rows={4} cols={3} />
          ) : filteredEmployees.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Працівників поки немає</p>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredEmployees.map((employee) => {
                const meta = employee.isActive ? employeeStatusMap.active : employeeStatusMap.inactive;
                const draft = employeeDrafts[employee.id] ?? {
                  fullName: employee.fullName,
                  role: employee.role ?? "",
                  phone: employee.phone ?? "",
                  notes: employee.notes ?? "",
                  isActive: employee.isActive,
                };
                const isEditing = editingEmployeeId === employee.id;
                return (
                  <div key={employee.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    {isEditing ? (
                      <div className="grid gap-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <AdminInput
                            label="Ім’я працівника"
                            value={draft.fullName}
                            onChange={(event) => updateEmployeeDraft(employee.id, { fullName: event.target.value })}
                          />
                          <AdminInput
                            label="Роль"
                            value={draft.role}
                            onChange={(event) => updateEmployeeDraft(employee.id, { role: event.target.value })}
                          />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <AdminInput
                            label="Телефон"
                            value={draft.phone}
                            onChange={(event) => updateEmployeeDraft(employee.id, { phone: event.target.value })}
                          />
                          <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={draft.isActive}
                              onChange={(event) => updateEmployeeDraft(employee.id, { isActive: event.target.checked })}
                            />
                            Активний працівник
                          </label>
                        </div>
                        <AdminTextarea
                          label="Нотатки"
                          rows={2}
                          value={draft.notes}
                          onChange={(event) => updateEmployeeDraft(employee.id, { notes: event.target.value })}
                        />
                        <div className="flex flex-wrap gap-2">
                          <AdminButton size="sm" onClick={() => saveEmployee(employee.id)} disabled={busyEmployeeId === employee.id}>
                            {busyEmployeeId === employee.id ? "Збереження…" : "Зберегти"}
                          </AdminButton>
                          <AdminButton variant="ghost" size="sm" onClick={() => setEditingEmployeeId(null)}>
                            Скасувати
                          </AdminButton>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{employee.fullName}</div>
                            <div className="mt-1 text-xs text-gray-500">
                              {employee.role || "Роль не вказана"}
                              {employee.phone ? ` • ${employee.phone}` : ""}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              Telegram: {employee.telegramUserId || "не прив’язано"}
                            </div>
                            <div className="mt-1 text-xs text-gray-400">
                              Призначень: {employee.assignmentCount ?? 0}
                            </div>
                          </div>
                          <StatusBadge status={meta.status} label={meta.label} />
                        </div>
                        {employee.notes && <p className="mt-3 text-sm text-gray-600">{employee.notes}</p>}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <AdminButton variant="secondary" size="sm" onClick={() => startEditEmployee(employee)}>
                            Редагувати
                          </AdminButton>
                          <AdminButton
                            variant="danger"
                            size="sm"
                            onClick={() => deleteEmployee(employee)}
                            disabled={busyEmployeeId === employee.id}
                          >
                            {busyEmployeeId === employee.id ? "Видалення…" : "Видалити"}
                          </AdminButton>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </AdminCard>
      </div>
    </div>
  );
}
