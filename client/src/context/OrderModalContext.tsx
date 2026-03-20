import { createContext, useContext, useState, type ReactNode } from "react";
import OrderModal from "../components/OrderModal";

interface OrderModalOptions {
  equipmentName?: string;
  equipmentId?: string;
}

interface OrderModalContextValue {
  openOrderModal: (options?: OrderModalOptions) => void;
}

const OrderModalContext = createContext<OrderModalContextValue>({
  openOrderModal: () => {},
});

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
        <OrderModal
          equipmentName={options.equipmentName}
          equipmentId={options.equipmentId}
          onClose={() => setIsOpen(false)}
        />
      )}
    </OrderModalContext.Provider>
  );
}

export function useOrderModal() {
  return useContext(OrderModalContext);
}
