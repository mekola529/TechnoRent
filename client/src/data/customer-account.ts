import { apiFetch } from "../api/client";

export interface CustomerAccount {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface CustomerRequestItem {
  id: string;
  itemType: string;
  titleSnapshot: string;
  quantity: number;
  unit: string | null;
  notes: string | null;
}

export interface CustomerRequest {
  id: string;
  createdAt: string;
  updatedAt: string;
  requestType: string;
  status: string;
  statusLabel: string;
  rawStatus: string;
  requestStatus: string;
  addressFrom: string | null;
  addressTo: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  executionAddressFrom: string | null;
  executionAddressTo: string | null;
  executionScheduledDate: string | null;
  executionScheduledTime: string | null;
  comment: string | null;
  items: CustomerRequestItem[];
  workerContact: {
    fullName: string;
    role: string | null;
    phone: string | null;
  } | null;
  convertedOrder: {
    id: string;
    orderNumber: number | null;
    status: string;
    addressFrom: string | null;
    addressTo: string | null;
    scheduledDate: string | null;
    scheduledDateTo: string | null;
    scheduledTimeFrom: string | null;
    scheduledTimeTo: string | null;
    agreedTotal: number | null;
    agreedPrice: number | null;
    paymentStatus: string | null;
    calculationStatus: string;
  } | null;
  finance: {
    agreedTotal: number | null;
    agreedPrice: number | null;
    paymentStatus: string | null;
    calculationStatus: string;
    clientPaid: number;
    clientDebt: number | null;
  };
}

export async function registerCustomer(input: {
  fullName?: string;
  email?: string;
  phone?: string;
  password: string;
  channel?: "email" | "telegram" | "viber";
}) {
  return apiFetch<{
    ok: boolean;
    channel?: string;
    target?: string;
    linkedCount?: number;
    customer?: CustomerAccount;
    message?: string;
  }>(
    "/customer-auth/register",
    { method: "POST", body: JSON.stringify(input), redirectOnUnauthorized: false },
  );
}

export async function updateCustomerProfile(input: {
  fullName?: string;
  email?: string;
  phone?: string;
}) {
  return apiFetch<CustomerAccount>("/customer/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
    redirectOnUnauthorized: false,
  });
}

export async function verifyCustomer(input: {
  channel: "email" | "telegram" | "viber";
  target: string;
  code: string;
}) {
  return apiFetch<{ ok: boolean; linkedCount: number }>("/customer-auth/verify", {
    method: "POST",
    body: JSON.stringify(input),
    redirectOnUnauthorized: false,
  });
}

export async function loginCustomer(input: { login: string; password: string }) {
  return apiFetch<{ ok: boolean; customer: CustomerAccount }>("/customer-auth/login", {
    method: "POST",
    body: JSON.stringify(input),
    redirectOnUnauthorized: false,
  });
}

export async function logoutCustomer() {
  return apiFetch<{ ok: boolean }>("/customer-auth/logout", {
    method: "POST",
    redirectOnUnauthorized: false,
  });
}

export async function getCurrentCustomer() {
  return apiFetch<CustomerAccount>("/customer-auth/me", { redirectOnUnauthorized: false });
}

export async function getCustomerRequests() {
  return apiFetch<CustomerRequest[]>("/customer/requests", { redirectOnUnauthorized: false });
}

export async function getCustomerRequest(id: string) {
  return apiFetch<CustomerRequest>(`/customer/requests/${id}`, { redirectOnUnauthorized: false });
}

export async function createCustomerMonobankPaymentLink(requestId: string) {
  return apiFetch<{
    id: string;
    invoiceId: string;
    status: string;
    amountKop: number;
    pageUrl: string;
  }>(`/customer/requests/${requestId}/pay/monobank`, {
    method: "POST",
    redirectOnUnauthorized: false,
  });
}
