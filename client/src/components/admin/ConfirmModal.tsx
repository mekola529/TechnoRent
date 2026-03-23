import { createPortal } from "react-dom";
import AdminButton from "./AdminButton";

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title = "Підтвердження",
  message,
  confirmLabel = "Так",
  cancelLabel = "Скасувати",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-lg font-bold text-gray-900">{title}</h3>
        <p className="mb-6 text-sm text-gray-600">{message}</p>
        <div className="flex justify-end gap-3">
          <AdminButton variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </AdminButton>
          <AdminButton variant={variant} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </AdminButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
