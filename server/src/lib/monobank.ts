import crypto from "crypto";

type MonobankConfig = {
  token: string;
  apiBaseUrl: string;
  webhookUrl: string;
  redirectUrl: string | null;
  webhookSecret: string | null;
  verifyWebhook: boolean;
};

export type MonobankInvoiceCreateInput = {
  amountKop: number;
  ccy?: number;
  reference: string;
  destination: string;
  redirectUrl?: string | null;
  validity?: number;
};

export type MonobankInvoiceCreateResult = {
  invoiceId: string;
  pageUrl: string;
};

export type MonobankInvoiceStatusPayload = {
  invoiceId: string;
  status: string;
  failureReason?: string | null;
  amount?: number;
  ccy?: number;
  finalAmount?: number;
  createdDate?: string | null;
  modifiedDate?: string | null;
  reference?: string | null;
  destination?: string | null;
  [key: string]: unknown;
};

let cachedPublicKeyPem: string | null = null;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getMonobankConfig(): MonobankConfig {
  return {
    token: process.env.MONOBANK_MERCHANT_TOKEN?.trim() ?? "",
    apiBaseUrl: trimTrailingSlash(process.env.MONOBANK_API_BASE_URL?.trim() || "https://api.monobank.ua"),
    webhookUrl: process.env.MONOBANK_WEBHOOK_URL?.trim() ?? "",
    redirectUrl: process.env.MONOBANK_REDIRECT_URL?.trim() || null,
    webhookSecret: process.env.MONOBANK_WEBHOOK_SECRET?.trim() || null,
    verifyWebhook: process.env.MONOBANK_VERIFY_WEBHOOK !== "false",
  };
}

function requireMonobankToken(config = getMonobankConfig()) {
  if (!config.token) {
    throw new Error("MONOBANK_MERCHANT_TOKEN is not configured");
  }
  return config.token;
}

function requireMonobankWebhookUrl(config = getMonobankConfig()) {
  if (!config.webhookUrl) {
    throw new Error("MONOBANK_WEBHOOK_URL is not configured");
  }
  return config.webhookUrl;
}

async function monobankJson<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const bodyText = await response.text();
  let body: unknown = null;
  if (bodyText) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = bodyText;
    }
  }

  if (!response.ok) {
    const errorMessage =
      typeof body === "object" && body && "errorDescription" in body
        ? String((body as { errorDescription?: unknown }).errorDescription)
        : typeof body === "object" && body && "message" in body
          ? String((body as { message?: unknown }).message)
          : `Monobank API error ${response.status}`;
    throw new Error(errorMessage);
  }

  return body as T;
}

export async function createMonobankInvoice(input: MonobankInvoiceCreateInput): Promise<MonobankInvoiceCreateResult> {
  const config = getMonobankConfig();
  const token = requireMonobankToken(config);
  const webHookUrl = requireMonobankWebhookUrl(config);

  const amount = Math.trunc(input.amountKop);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid monobank invoice amount");
  }

  const payload = {
    amount,
    ccy: input.ccy ?? 980,
    merchantPaymInfo: {
      reference: input.reference,
      destination: input.destination,
      comment: input.destination,
    },
    redirectUrl: input.redirectUrl ?? config.redirectUrl ?? undefined,
    webHookUrl,
    validity: input.validity ?? 24 * 60 * 60,
    paymentType: "debit",
  };

  const result = await monobankJson<Partial<MonobankInvoiceCreateResult>>(
    `${config.apiBaseUrl}/api/merchant/invoice/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Token": token,
      },
      body: JSON.stringify(payload),
    },
  );

  if (!result.invoiceId || !result.pageUrl) {
    throw new Error("Monobank returned incomplete invoice data");
  }

  return {
    invoiceId: result.invoiceId,
    pageUrl: result.pageUrl,
  };
}

export async function getMonobankInvoiceStatus(invoiceId: string): Promise<MonobankInvoiceStatusPayload> {
  const config = getMonobankConfig();
  const token = requireMonobankToken(config);
  const url = new URL(`${config.apiBaseUrl}/api/merchant/invoice/status`);
  url.searchParams.set("invoiceId", invoiceId);

  return monobankJson<MonobankInvoiceStatusPayload>(url.toString(), {
    method: "GET",
    headers: {
      "X-Token": token,
    },
  });
}

function normalizePublicKeyToPem(rawKey: string) {
  const trimmed = rawKey.trim().replace(/^"|"$/g, "");
  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    return trimmed;
  }

  const decoded = Buffer.from(trimmed, "base64").toString("utf8").trim();
  if (decoded.includes("BEGIN PUBLIC KEY")) {
    return decoded;
  }

  const wrapped = trimmed.match(/.{1,64}/g)?.join("\n") ?? trimmed;
  return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----`;
}

async function getMonobankPublicKeyPem() {
  if (cachedPublicKeyPem) return cachedPublicKeyPem;

  const envKey = process.env.MONOBANK_PUBLIC_KEY?.trim();
  if (envKey) {
    cachedPublicKeyPem = normalizePublicKeyToPem(envKey);
    return cachedPublicKeyPem;
  }

  const config = getMonobankConfig();
  const token = requireMonobankToken(config);
  const response = await fetch(`${config.apiBaseUrl}/api/merchant/pubkey`, {
    method: "GET",
    headers: { "X-Token": token },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Monobank public key request failed: ${response.status}`);
  }

  let key = text;
  try {
    const json = JSON.parse(text) as { key?: unknown; publicKey?: unknown; pubKey?: unknown };
    key = String(json.key ?? json.publicKey ?? json.pubKey ?? text);
  } catch {
    // text response is acceptable
  }

  cachedPublicKeyPem = normalizePublicKeyToPem(key);
  return cachedPublicKeyPem;
}

export async function verifyMonobankSignature(rawBody: Buffer, signature: string | undefined) {
  const config = getMonobankConfig();
  if (!config.verifyWebhook) {
    return true;
  }
  if (!signature) {
    return false;
  }

  const publicKeyPem = await getMonobankPublicKeyPem();
  const verifier = crypto.createVerify("SHA256");
  verifier.update(rawBody);
  verifier.end();

  return verifier.verify(publicKeyPem, Buffer.from(signature, "base64"));
}
