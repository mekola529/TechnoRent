import { useContext } from "react";
import { CustomerAccountContext } from "./customer-account-context";

export function useCustomerAccount() {
  return useContext(CustomerAccountContext);
}
