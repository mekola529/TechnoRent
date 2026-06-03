import { useContext } from "react";
import { OrderModalContext } from "./order-modal-context";

export function useOrderModal() {
  return useContext(OrderModalContext);
}
