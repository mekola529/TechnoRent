import { useEffect, useState, type ReactNode } from "react";
import { ApiError } from "../api/client";
import { getCurrentCustomer, type CustomerAccount } from "../data/customer-account";
import { CustomerAccountContext } from "./customer-account-context";

export function CustomerAccountProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<CustomerAccount | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshCustomer() {
    try {
      const data = await getCurrentCustomer();
      setCustomer(data);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setCustomer(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshCustomer();
  }, []);

  return (
    <CustomerAccountContext.Provider value={{ customer, loading, refreshCustomer, setCustomer }}>
      {children}
    </CustomerAccountContext.Provider>
  );
}
