import type { ReactNode } from "react";

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  children?: ReactNode; // right-side action area
}

export default function AdminPageHeader({ title, subtitle, children }: AdminPageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
