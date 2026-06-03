import { lazy, Suspense, useState, type ReactNode } from "react";
import { OrderModalContext, type OrderModalOptions } from "./order-modal-context";

const OrderModal = lazy(() => import("../components/OrderModal"));

export function OrderModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<OrderModalOptions>({});

  function openOrderModal(opts?: OrderModalOptions) {
    setOptions(opts ?? {});
    setIsOpen(true);
  }

  return (
    <OrderModalContext.Provider value={{ openOrderModal }}>
      {children}
      {isOpen && (
        <Suspense fallback={null}>
          <OrderModal
            equipmentName={options.equipmentName}
            equipmentId={options.equipmentId}
            serviceName={options.serviceName}
            onClose={() => setIsOpen(false)}
          />
        </Suspense>
      )}
    </OrderModalContext.Provider>
  );
}
