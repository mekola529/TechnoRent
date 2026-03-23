import type { ReactNode } from "react";
import { AdminInput, AdminSelect } from "./AdminInput";

interface AdminFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  children?: ReactNode; // additional selects or action buttons
}

export default function AdminFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Пошук…",
  children,
}: AdminFilterBarProps) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div className="w-full sm:w-64">
        <AdminInput
          type="search"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      {children}
    </div>
  );
}

export { AdminInput, AdminSelect };
