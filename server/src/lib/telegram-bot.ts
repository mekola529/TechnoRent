import { logError } from "./logger.js";

interface WorkerAssignmentPayload {
  assignmentId: string;
  orderId: string;
  orderNumber?: string | number | null;
  chatId: string;
  employeeName: string;
  customerName: string;
  customerPhone: string;
  orderStatus: string;
  messageText?: string | null;
  plannedStartLabel?: string | null;
  executionTimeLabel?: string | null;
  workerCompensationText?: string | null;
  comment?: string | null;
  sourceLabel?: string | null;
  requestDetails?: Array<{
    label: string;
    value: string;
  }> | null;
  locations?: Array<{
    label: string;
    address: string;
    latitude?: number | null;
    longitude?: number | null;
  }> | null;
  items: Array<{
    title: string;
    startDate?: string | null;
    endDate?: string | null;
  }>;
}

interface WorkerActionMessagePayload {
  chatId: string;
  text: string;
  buttons?: Array<{
    text: string;
    callbackData: string;
  }>;
}

export class BotInternalError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = "BotInternalError";
    this.statusCode = statusCode;
  }
}

function getBotInternalUrl() {
  return process.env.TELEGRAM_BOT_INTERNAL_URL || "http://127.0.0.1:3011/internal";
}

function getInternalToken() {
  return process.env.TELEGRAM_INTERNAL_TOKEN || "";
}

async function postToBot(path: string, payload: unknown) {
  const token = getInternalToken();
  if (!token) {
    throw new BotInternalError("Не налаштовано TELEGRAM_INTERNAL_TOKEN для зв'язку з Telegram bot app.");
  }

  const targetUrl = `${getBotInternalUrl()}${path}`;

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": token,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BotInternalError(
      `Backend не зміг з'єднатися з Telegram bot app (${targetUrl}). Перевір TELEGRAM_BOT_INTERNAL_URL, доступність bot app і SSL. Технічна деталь: ${message}`,
    );
  }

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401) {
      throw new BotInternalError(
        "Telegram bot app відхилив внутрішній запит (401 Unauthorized). Перевір, що TELEGRAM_INTERNAL_TOKEN однаковий у сайті та bot app.",
      );
    }

    throw new BotInternalError(
      `Telegram bot app повернув помилку ${response.status}. ${body || "Порожня відповідь сервера."}`,
    );
  }

  return response.json().catch(() => null);
}

export async function sendWorkerAssignmentToBot(payload: WorkerAssignmentPayload) {
  return postToBot("/send-worker-assignment", payload);
}

export async function sendWorkerActionMessageToBot(payload: WorkerActionMessagePayload) {
  return postToBot("/send-worker-action-message", payload);
}

export async function safeSendWorkerAssignmentToBot(payload: WorkerAssignmentPayload) {
  try {
    return await sendWorkerAssignmentToBot(payload);
  } catch (error) {
    logError("safeSendWorkerAssignmentToBot error:", error);
    return null;
  }
}

export async function safeSendWorkerActionMessageToBot(payload: WorkerActionMessagePayload) {
  try {
    return await sendWorkerActionMessageToBot(payload);
  } catch (error) {
    logError("safeSendWorkerActionMessageToBot error:", error);
    return null;
  }
}
