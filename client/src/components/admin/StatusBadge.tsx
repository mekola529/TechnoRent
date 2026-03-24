type Status =
  | "new"
  | "in_progress"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "active"
  | "available"
  | "busy"
  | "maintenance"
  | "inactive"
  | "rent"
  | "booked";

const config: Record<Status, { label: string; bg: string; text: string }> = {
  new:         { label: "Новий",           bg: "bg-blue-50",    text: "text-blue-700" },
  in_progress: { label: "В обробці",       bg: "bg-amber-50",   text: "text-amber-700" },
  confirmed:   { label: "Підтверджено",    bg: "bg-emerald-50", text: "text-emerald-700" },
  completed:   { label: "Завершено",       bg: "bg-slate-100",  text: "text-slate-600" },
  cancelled:   { label: "Скасовано",       bg: "bg-red-50",     text: "text-red-600" },
  active:      { label: "Активне",         bg: "bg-green-50",   text: "text-green-700" },
  available:   { label: "Вільно",          bg: "bg-emerald-50", text: "text-emerald-700" },
  busy:        { label: "Зайнято",         bg: "bg-amber-50",   text: "text-amber-700" },
  maintenance: { label: "Обслуговування",  bg: "bg-violet-50",  text: "text-violet-700" },
  inactive:    { label: "Неактивна",       bg: "bg-slate-100",  text: "text-slate-500" },
  rent:        { label: "Оренда",          bg: "bg-sky-50",     text: "text-sky-700" },
  booked:      { label: "Бронювання",      bg: "bg-orange-50",  text: "text-orange-700" },
};

interface StatusBadgeProps {
  status: Status;
  label?: string;
  className?: string;
}

export default function StatusBadge({ status, label, className = "" }: StatusBadgeProps) {
  const c = config[status] ?? config.new;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold leading-none ${c.bg} ${c.text} ${className}`}
    >
      {label ?? c.label}
    </span>
  );
}

export type { Status };
