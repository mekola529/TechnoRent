import { createContext } from "react";
import type { CustomerAccount } from "../data/customer-account";

export interface CustomerAccountContextValue {
  customer: CustomerAccount | null;
  loading: boolean;
  refreshCustomer: () => Promise<void>;
  setCustomer: (customer: CustomerAccount | null) => void;
}

export const CustomerAccountContext = createContext<CustomerAccountContextValue>({
  customer: null,
  loading: true,
  refreshCustomer: async () => {},
  setCustomer: () => {},
});
