import type { ReactNode } from "react";

export default function AccountCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-white p-5 shadow-[0_8px_20px_rgba(0,0,0,0.08)] max-md:p-4 ${className}`}>
      {children}
    </div>
  );
}
