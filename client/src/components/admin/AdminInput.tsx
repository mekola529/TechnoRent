import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

const inputBase =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-40";

/* ── Input ─────────────────────────────── */

interface AdminInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function AdminInput({ label, className = "", id, ...rest }: AdminInputProps) {
  const inputId = id ?? label;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-gray-600">
          {label}
        </label>
      )}
      <input id={inputId} className={`${inputBase} ${className}`} {...rest} />
    </div>
  );
}

/* ── Textarea ──────────────────────────── */

interface AdminTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function AdminTextarea({ label, className = "", id, ...rest }: AdminTextareaProps) {
  const inputId = id ?? label;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-gray-600">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={`${inputBase} min-h-[80px] resize-y ${className}`}
        {...rest}
      />
    </div>
  );
}

/* ── Select ────────────────────────────── */

interface AdminSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: ReactNode;
}

export function AdminSelect({ label, className = "", id, children, ...rest }: AdminSelectProps) {
  const inputId = id ?? label;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-gray-600">
          {label}
        </label>
      )}
      <select id={inputId} className={`${inputBase} ${className}`} {...rest}>
        {children}
      </select>
    </div>
  );
}
