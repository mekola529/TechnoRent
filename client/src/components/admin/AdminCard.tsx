import type { ReactNode } from "react";

interface AdminCardProps {
  children: ReactNode;
  className?: string;
}

export default function AdminCard({ children, className = "" }: AdminCardProps) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 ${className}`}>
      {children}
    </div>
  );
}
