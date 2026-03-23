import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:pointer-events-none disabled:opacity-40";

const sizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2",
  lg: "px-5 py-2.5 text-base",
};

const variants: Record<Variant, string> = {
  primary:   "bg-primary text-dark hover:bg-primary/85",
  secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200",
  ghost:     "text-gray-500 hover:bg-gray-100 hover:text-gray-700",
  danger:    "bg-red-50 text-red-600 hover:bg-red-100",
};

interface AdminButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

export default function AdminButton({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: AdminButtonProps) {
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
