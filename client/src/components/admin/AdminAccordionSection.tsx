import { useState, type ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export default function AdminAccordionSection({
  title,
  subtitle,
  badge,
  defaultOpen = false,
  children,
  className = "",
  contentClassName = "",
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`rounded-xl border border-gray-200 bg-white ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">{title}</h3>
            {badge ? (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700">
                {badge}
              </span>
            ) : null}
          </div>
          {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
        </div>
        <span
          className={`shrink-0 text-lg text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          ⌄
        </span>
      </button>

      {open ? (
        <div className={`border-t border-gray-200 px-5 py-4 ${contentClassName}`}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
