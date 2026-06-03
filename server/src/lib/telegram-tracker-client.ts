import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const TELEGRAM_CONNECT_RETRIES = 5;

export interface ResolvedTrackerChat {
  id: string;
  label: string;
  input: any;
}

export function createTelegramTrackerClient(): TelegramClient {
  const apiIdRaw = process.env.TELEGRAM_API_ID;
  const apiHash = process.env.TELEGRAM_API_HASH;
  const session = process.env.TELEGRAM_USER_SESSION ?? "";

  if (!apiIdRaw || !apiHash) {
    throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH environment variables are required");
  }

  const apiId = Number(apiIdRaw);
  if (!Number.isInteger(apiId) || apiId <= 0) {
    throw new Error("TELEGRAM_API_ID must be a positive integer");
  }

  return new TelegramClient(
    new StringSession(session),
    apiId,
    apiHash,
    { connectionRetries: TELEGRAM_CONNECT_RETRIES },
  );
}

export async function resolveTrackerChat(client: TelegramClient): Promise<ResolvedTrackerChat> {
  const needle = process.env.TELEGRAM_TRACKER_CHAT?.trim();
  if (!needle) {
    throw new Error("TELEGRAM_TRACKER_CHAT environment variable is required");
  }

  const dialogs = await client.getDialogs({ limit: 100 });
  const normalizedNeedle = normalizeDialogValue(needle);

  for (const dialog of dialogs) {
    const candidateValues = collectDialogValues(dialog);
    if (candidateValues.some((value) => normalizeDialogValue(value) === normalizedNeedle)) {
      const entity = dialog.entity;
      return {
        id: String((entity as { id?: unknown })?.id ?? ""),
        label: dialog.title ?? dialog.name ?? needle,
        input: entity,
      };
    }
  }

  throw new Error(
    `Tracker chat "${needle}" not found. Use exact dialog title, username, numeric id or bot handle.`,
  );
}

function collectDialogValues(dialog: {
  title?: string;
  name?: string;
  entity?: { id?: unknown; username?: string; title?: string; firstName?: string; lastName?: string };
}): string[] {
  const values = new Set<string>();
  const entity = dialog.entity;

  if (dialog.title) values.add(dialog.title);
  if (dialog.name) values.add(dialog.name);
  if (entity?.title) values.add(entity.title);
  if (entity?.username) {
    values.add(entity.username);
    values.add(`@${entity.username}`);
  }

  const fullName = [entity?.firstName, entity?.lastName].filter(Boolean).join(" ").trim();
  if (fullName) values.add(fullName);

  if (entity?.id !== undefined && entity?.id !== null) {
    values.add(String(entity.id));
  }

  return Array.from(values);
}

function normalizeDialogValue(value: string): string {
  return value.trim().toLowerCase();
}
