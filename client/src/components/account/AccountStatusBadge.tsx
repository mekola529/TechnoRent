const statusConfig: Record<string, { label: string; className: string }> = {
  AWAITING_MANAGER_CONFIRMATION: { label: "Очікує підтвердження менеджером", className: "bg-blue-50 text-blue-700" },
  AWAITING_PAYMENT: { label: "Очікує оплати", className: "bg-orange-50 text-orange-700" },
  NEW: { label: "Нова", className: "bg-blue-50 text-blue-700" },
  IN_PROGRESS: { label: "В обробці", className: "bg-amber-50 text-amber-700" },
  CONFIRMED: { label: "Підтверджено", className: "bg-emerald-50 text-emerald-700" },
  CONVERTED: { label: "Передано в роботу", className: "bg-sky-50 text-sky-700" },
  ACTIVE: { label: "Виконується", className: "bg-amber-50 text-amber-700" },
  COMPLETED: { label: "Завершено", className: "bg-slate-100 text-slate-600" },
  CANCELLED: { label: "Скасовано", className: "bg-red-50 text-red-600" },
};

export default function AccountStatusBadge({ status, label }: { status: string; label?: string }) {
  const config = statusConfig[status] ?? statusConfig.NEW;
  return (
    <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-bold ${config.className}`}>
      {label ?? config.label}
    </span>
  );
}
