import "../env.js";

import { initSchema } from "../lib/schema.js";
import {
  hasTrackerMessage,
  persistTrackerMessage,
} from "../lib/tracker.repository.js";
import { parseTrackerNotification } from "../lib/tracker.js";
import {
  createTelegramTrackerClient,
  resolveTrackerChat,
} from "../lib/telegram-tracker-client.js";
import type { ParsedTrackerNotification } from "../lib/tracker.js";

interface ParsedMessageCandidate {
  telegramMessageId: string;
  parsed: ParsedTrackerNotification;
}

async function main() {
  await initSchema();

  const client = createTelegramTrackerClient();

  try {
    await client.connect();
    const trackerChat = await resolveTrackerChat(client);

    const messages = await client.getMessages(trackerChat.input, { limit: 50 });
    if (messages.length === 0) {
      console.log(`No messages found in tracker chat "${trackerChat.label}".`);
      return;
    }

    const parsedCandidates: ParsedMessageCandidate[] = [];

    for (const message of messages) {
      const messageId = String((message as { id?: unknown }).id ?? "");
      if (!messageId) continue;

      const rawText = extractMessageText(message);
      if (!rawText) continue;

      const parsed = parseTrackerNotification(rawText);
      if (!parsed) continue;

      parsedCandidates.push({
        telegramMessageId: messageId,
        parsed,
      });
    }

    if (parsedCandidates.length === 0) {
      console.log(`No parseable tracker messages found in "${trackerChat.label}".`);
      return;
    }

    for (let index = 0; index < parsedCandidates.length; index++) {
      const candidate = parsedCandidates[index];
      const { telegramMessageId, parsed } = candidate;

      const alreadyProcessed = await hasTrackerMessage(trackerChat.id, telegramMessageId);
      if (alreadyProcessed) {
        continue;
      }

      const resolvedAddress =
        parsed.parsedAddress ?? findNewestAddressForDevice(parsedCandidates, index, parsed.deviceName);

      const result = await persistTrackerMessage({
        telegramChatId: trackerChat.id,
        telegramMessageId,
        parsed,
        resolvedAddress,
      });

      console.log(
        JSON.stringify(
          {
            status: "stored",
            device: result.device.name,
            eventText: parsed.eventText,
            trackerTimestamp: parsed.trackerTimestamp.toISOString(),
            parsedAddress: parsed.parsedAddress,
            resolvedAddress,
            effectiveAddress: result.effectiveAddress,
            addressChanged: result.addressChanged,
            telegramChatId: trackerChat.id,
            telegramMessageId,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`No new tracker messages to store in "${trackerChat.label}".`);
  } finally {
    await client.disconnect();
  }
}

function findNewestAddressForDevice(
  candidates: ParsedMessageCandidate[],
  startIndex: number,
  deviceName: string,
): string | null {
  for (let index = startIndex + 1; index < candidates.length; index++) {
    const candidate = candidates[index];
    if (candidate.parsed.deviceName !== deviceName) continue;
    if (candidate.parsed.parsedAddress) return candidate.parsed.parsedAddress;
  }

  return null;
}

function extractMessageText(message: unknown): string | null {
  const text =
    (message as { message?: unknown }).message ??
    (message as { text?: unknown }).text;

  if (typeof text !== "string") {
    return null;
  }

  const normalized = text.trim();
  return normalized.length > 0 ? normalized : null;
}

main().catch((error) => {
  console.error("Failed to sync tracker locations:", error);
  process.exit(1);
});
