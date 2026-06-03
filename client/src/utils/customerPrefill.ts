import type { CustomerAccount } from "../data/customer-account";

export function getCustomerContactPrefill(customer: CustomerAccount | null | undefined) {
  return {
    name: customer?.fullName?.trim() ?? "",
    phone: customer?.phone?.trim() || "+380",
    email: customer?.email?.trim() ?? "",
  };
}

export function shouldPrefillPhone(currentPhone: string) {
  const normalized = currentPhone.trim();
  return !normalized || normalized === "+380";
}
