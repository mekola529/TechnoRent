const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface ApiFetchOptions extends RequestInit {
  redirectOnUnauthorized?: boolean;
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(
  endpoint: string,
  options?: ApiFetchOptions
): Promise<T> {
  const { redirectOnUnauthorized, ...requestOptions } = options ?? {};
  const shouldRedirectOnUnauthorized =
    redirectOnUnauthorized ?? window.location.pathname.startsWith("/admin");

  const res = await fetch(`${API_BASE}${endpoint}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...requestOptions.headers,
    },
    ...requestOptions,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));

    if (res.status === 401) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_user");
      if (shouldRedirectOnUnauthorized && window.location.pathname !== "/admin") {
        window.location.href = "/admin";
      }
      throw new ApiError(body.error || "Невірний логін або пароль", res.status, body);
    }

    throw new ApiError(body.error || `HTTP ${res.status}`, res.status, body);
  }

  return res.json();
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}
