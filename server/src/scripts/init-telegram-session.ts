import "../env.js";

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { StringSession } from "telegram/sessions/index.js";
import { createTelegramTrackerClient } from "../lib/telegram-tracker-client.js";

async function main() {
  const client = createTelegramTrackerClient();
  const rl = createInterface({ input, output });

  try {
    await client.start({
      phoneNumber: async () => rl.question("Telegram phone number: "),
      password: async () => rl.question("Telegram 2FA password (if enabled): "),
      phoneCode: async () => rl.question("Telegram login code: "),
      onError: (err) => console.error("Telegram auth error:", err),
    });

    const session = (client.session as StringSession).save();

    console.log("\nTelegram session created.");
    console.log("Save this value into TELEGRAM_USER_SESSION in your .env:");
    console.log(session);
  } finally {
    rl.close();
    await client.disconnect();
  }
}

main().catch((error) => {
  console.error("Failed to initialize Telegram session:", error);
  process.exit(1);
});
