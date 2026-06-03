import { createContext } from "react";

export interface OrderModalOptions {
  equipmentName?: string;
  equipmentId?: string;
  serviceName?: string;
}

export interface OrderModalContextValue {
  openOrderModal: (options?: OrderModalOptions) => void;
}

export const OrderModalContext = createContext<OrderModalContextValue>({
  openOrderModal: () => {},
});
