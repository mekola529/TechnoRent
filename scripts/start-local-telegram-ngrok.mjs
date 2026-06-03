#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const envPath = path.join(rootDir, ".env");
const botDir = path.join(rootDir, "telegram-bot");
const ngrokApiUrl = "http://127.0.0.1:4040/api/tunnels";
const modes = {
  local: "local",
  production: "production",
  hostingWebhook: "hosting-webhook",
  deleteWebhook: "delete-webhook",
};

const children = new Set();
let shuttingDown = false;

main().catch((error) => {
  console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
  shutdown(1);
});

async function main() {
  const mode = await resolveRunMode(process.argv.slice(2));
  const env = loadEnvFile(envPath);
  const botToken = required(env, "TELEGRAM_BOT_TOKEN");
  const webhookSecret = required(env, "TELEGRAM_BOT_WEBHOOK_SECRET");
  const hostingWebhookBaseUrl = (
    env.PRODUCTION_BOT_PUBLIC_URL ||
    env.TELEGRAM_BOT_PUBLIC_URL ||
    "https://bot.technorent.lanbox.com.ua"
  ).trim().replace(/\/$/, "");

  if (mode === modes.hostingWebhook) {
    const hostedWebhookUrl = `${hostingWebhookBaseUrl}/webhook/telegram/${webhookSecret}`;
    printHostingWebhookSummary(hostedWebhookUrl);

    console.log("\n▶️  Встановлюю Telegram webhook для хостингового бота...");
    const webhookResult = await setTelegramWebhook(botToken, webhookSecret, hostedWebhookUrl);
    if (!webhookResult.ok) {
      throw new Error(`Telegram setWebhook failed: ${JSON.stringify(webhookResult)}`);
    }

    console.log("\n▶️  Отримую Telegram webhook info...");
    const webhookInfo = await getTelegramWebhookInfo(botToken);

    console.log("\n✅ Готово.");
    console.log("\nWebhook встановлено на:");
    console.log(hostedWebhookUrl);
    console.log("\nTelegram getWebhookInfo:");
    console.log(JSON.stringify(webhookInfo, null, 2));
    shutdown(0);
    return;
  }

  if (mode === modes.deleteWebhook) {
    console.log("▶️  Режим запуску: скидання Telegram webhook");

    console.log("\n▶️  Видаляю Telegram webhook...");
    const deleteResult = await deleteTelegramWebhook(botToken);
    if (!deleteResult.ok) {
      throw new Error(`Telegram deleteWebhook failed: ${JSON.stringify(deleteResult)}`);
    }

    console.log("\n▶️  Отримую Telegram webhook info...");
    const webhookInfo = await getTelegramWebhookInfo(botToken);

    console.log("\n✅ Готово.");
    console.log("\nTelegram deleteWebhook result:");
    console.log(JSON.stringify(deleteResult, null, 2));
    console.log("\nTelegram getWebhookInfo:");
    console.log(JSON.stringify(webhookInfo, null, 2));
    shutdown(0);
    return;
  }

  const internalToken = required(env, "TELEGRAM_INTERNAL_TOKEN");
  const backendInternalUrl = resolveBackendInternalUrl(env, mode);

  const port = Number(env.TELEGRAM_BOT_PORT || "3011");
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Некоректний TELEGRAM_BOT_PORT: ${env.TELEGRAM_BOT_PORT}`);
  }

  printModeSummary(mode, backendInternalUrl, port);

  await ensureCommand("ngrok", ["version"], "ngrok не знайдено. Встанови ngrok або додай його в PATH.");
  await ensureBackendInternalUrl(backendInternalUrl, internalToken, mode);

  console.log("▶️  Запускаю Telegram bot...");
  const botProcess = spawnManaged("npm", ["run", "dev"], {
    cwd: botDir,
    env: {
      ...process.env,
      ...env,
      BACKEND_INTERNAL_URL: backendInternalUrl,
      TELEGRAM_BOT_PORT: String(port),
    },
    prefix: "bot",
  });

  await waitForHttp(`http://127.0.0.1:${port}/health`, 20_000).catch(() => {
    console.log(`ℹ️  /health не відповів, але продовжую. Переконайся, що бот слухає http://localhost:${port}`);
  });

  console.log("▶️  Запускаю ngrok...");
  spawnManaged("ngrok", ["http", String(port)], {
    cwd: rootDir,
    env: process.env,
    prefix: "ngrok",
  });

  const publicUrl = await waitForNgrokUrl(30_000);
  const webhookUrl = `${publicUrl}/webhook/telegram`;
  const internalUrl = `${publicUrl}/internal`;

  console.log("\n▶️  Встановлюю Telegram webhook...");
  const webhookResult = await setTelegramWebhook(botToken, webhookSecret, webhookUrl);
  if (!webhookResult.ok) {
    throw new Error(`Telegram setWebhook failed: ${JSON.stringify(webhookResult)}`);
  }

  console.log("\n✅ Готово.");
  if (mode === modes.production) {
    console.log("\nВстав у production .env на хостингу:");
    console.log(`TELEGRAM_BOT_INTERNAL_URL=${internalUrl}`);
    console.log("\nПісля оновлення .env на хостингу зроби Restart Node.js app у cPanel.");
  } else {
    console.log("\nДля локального backend у локальному .env має бути:");
    console.log(`BACKEND_INTERNAL_URL=http://127.0.0.1:3001/api/internal/telegram`);
    console.log(`TELEGRAM_BOT_INTERNAL_URL=http://127.0.0.1:${port}/internal`);
    console.log("\nПереконайся, що локальний backend запущений на http://localhost:3001.");
  }
  console.log("\nTelegram webhook встановлено на:");
  console.log(webhookUrl);
  console.log("\nЦей термінал має залишатись відкритим, поки тестуєш Telegram worker bot.");
  console.log("Щоб зупинити bot + ngrok: Ctrl+C\n");

  await waitForever();
  botProcess.kill();
  shutdown(0);
}

async function resolveRunMode(args) {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const hasLocal = args.includes("--local");
  const hasProduction = args.includes("--production") || args.includes("--hosting");
  const hasHostingWebhook =
    args.includes("--hosting-webhook") ||
    args.includes("--set-hosting-webhook") ||
    args.includes("--webhook-hosting");
  const hasDeleteWebhook =
    args.includes("--delete-webhook") ||
    args.includes("--clear-webhook") ||
    args.includes("--unset-webhook");
  const selectedModes = [hasLocal, hasProduction, hasHostingWebhook, hasDeleteWebhook].filter(Boolean).length;
  if (selectedModes > 1) {
    throw new Error("Вкажи тільки один режим: --local, --production, --hosting-webhook або --delete-webhook");
  }

  if (hasLocal) return modes.local;
  if (hasProduction) return modes.production;
  if (hasHostingWebhook) return modes.hostingWebhook;
  if (hasDeleteWebhook) return modes.deleteWebhook;

  if (!process.stdin.isTTY) {
    throw new Error("Не вказано режим. Запусти з --local, --production, --hosting-webhook або --delete-webhook.");
  }

  const rl = createInterface({ input, output });
  try {
    console.log("Куди бот має відправляти internal-запити?");
    console.log("1. Локальний backend: http://localhost:3001");
    console.log("2. Backend на хостингу");
    console.log("3. Тільки встановити webhook для бота на хостингу");
    console.log("4. Скинути Telegram webhook");
    const answer = (await rl.question("Обери 1, 2, 3 або 4: ")).trim();
    if (answer === "1") return modes.local;
    if (answer === "2") return modes.production;
    if (answer === "3") return modes.hostingWebhook;
    if (answer === "4") return modes.deleteWebhook;
    throw new Error("Некоректний вибір. Запусти з --local, --production, --hosting-webhook або --delete-webhook.");
  } finally {
    rl.close();
  }
}

function resolveBackendInternalUrl(env, mode) {
  if (mode === modes.local) {
    return (env.LOCAL_BACKEND_INTERNAL_URL || "http://127.0.0.1:3001/api/internal/telegram").replace(/\/$/, "");
  }

  const productionUrl = env.PRODUCTION_BACKEND_INTERNAL_URL || env.BACKEND_INTERNAL_URL;
  if (!productionUrl?.trim()) {
    throw new Error(
      "Для режиму --production у .env потрібно задати BACKEND_INTERNAL_URL або PRODUCTION_BACKEND_INTERNAL_URL",
    );
  }
  return productionUrl.trim().replace(/\/$/, "");
}

function printModeSummary(mode, backendInternalUrl, port) {
  console.log(`▶️  Режим запуску: ${mode === modes.local ? "локальна розробка" : "хостинг"}`);
  console.log(`▶️  Backend internal URL: ${backendInternalUrl}`);
  console.log(`▶️  Bot local port: ${port}`);
}

function printHostingWebhookSummary(hostedWebhookUrl) {
  console.log("▶️  Режим запуску: встановлення webhook для бота на хостингу");
  console.log(`▶️  Hosting webhook URL: ${hostedWebhookUrl}`);
}

function printHelp() {
  console.log(`
Запуск Telegram bot + ngrok:

  node scripts/start-local-telegram-ngrok.mjs --local
  node scripts/start-local-telegram-ngrok.mjs --production
  node scripts/start-local-telegram-ngrok.mjs --hosting-webhook
  node scripts/start-local-telegram-ngrok.mjs --delete-webhook

Режими:
  --local       бот працює з локальним backend на http://localhost:3001
  --production  бот працює з backend на хостингу, а сайт звертається до бота через ngrok
  --hosting-webhook
                тільки встановлює Telegram webhook на https://bot.technorent.lanbox.com.ua
  --delete-webhook
                скидає Telegram webhook і показує актуальний getWebhookInfo

Без прапорця скрипт запитає режим інтерактивно.
`);
}

async function ensureBackendInternalUrl(backendInternalUrl, internalToken, mode) {
  while (true) {
    try {
      await checkBackendInternalUrl(backendInternalUrl, internalToken);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      printBackendTroubleshooting(mode, backendInternalUrl, message);

      if (!process.stdin.isTTY) {
        throw new Error(message);
      }

      const action = await askBackendRecoveryAction(mode);
      if (action === "retry") {
        continue;
      }
      if (action === "start-local") {
        await startLocalProjectAndWait();
        continue;
      }
      if (action === "continue") {
        console.log("⚠️  Продовжую без успішної перевірки backend. /start і callback-кнопки можуть не працювати.");
        return;
      }
      throw new Error(message);
    }
  }
}

function printBackendTroubleshooting(mode, backendInternalUrl, message) {
  console.log("\n⚠️  Backend internal endpoint не відповів.");
  console.log(`Причина: ${message}`);

  if (mode === modes.local) {
    console.log("\nДля локального режиму потрібно:");
    console.log("1. Запустити сайт локально: npm run dev");
    console.log("2. Перевірити, що backend слухає http://localhost:3001/api/health");
    console.log("3. У локальному .env має бути:");
    console.log("   LOCAL_BACKEND_INTERNAL_URL=http://127.0.0.1:3001/api/internal/telegram");
    console.log("   TELEGRAM_BOT_INTERNAL_URL=http://127.0.0.1:3011/internal");
    console.log("4. TELEGRAM_INTERNAL_TOKEN має бути однаковий у backend і telegram-bot процесі.");
    console.log(`\nЗараз скрипт перевіряє: ${backendInternalUrl}`);
    return;
  }

  console.log("\nДля production режиму потрібно:");
  console.log("1. У production .env на хостингу має бути TELEGRAM_INTERNAL_TOKEN.");
  console.log("2. У локальному .env має бути такий самий TELEGRAM_INTERNAL_TOKEN.");
  console.log("3. BACKEND_INTERNAL_URL або PRODUCTION_BACKEND_INTERNAL_URL має вести на:");
  console.log("   http://technorent.lanbox.com.ua/api/internal/telegram");
  console.log("4. Після зміни .env на хостингу зроби Restart Node.js app у cPanel.");
  console.log(`\nЗараз скрипт перевіряє: ${backendInternalUrl}`);
}

async function askBackendRecoveryAction(mode) {
  const rl = createInterface({ input, output });
  try {
    if (mode === modes.local) {
      console.log("\nЩо зробити далі?");
      console.log("1. Запустити локальний сайт автоматично і повторити перевірку");
      console.log("2. Я сам запущу/виправлю backend, повторити перевірку");
      console.log("3. Продовжити без перевірки backend");
      console.log("4. Зупинити скрипт");
      const answer = (await rl.question("Обери 1-4: ")).trim();
      if (answer === "1") return "start-local";
      if (answer === "2") return "retry";
      if (answer === "3") return "continue";
      return "stop";
    }

    console.log("\nЩо зробити далі?");
    console.log("1. Я оновив production .env / зробив Restart, повторити перевірку");
    console.log("2. Продовжити без перевірки backend");
    console.log("3. Зупинити скрипт");
    const answer = (await rl.question("Обери 1-3: ")).trim();
    if (answer === "1") return "retry";
    if (answer === "2") return "continue";
    return "stop";
  } finally {
    rl.close();
  }
}

async function startLocalProjectAndWait() {
  console.log("\n▶️  Запускаю локальний сайт: npm run dev");
  spawnManaged("npm", ["run", "dev"], {
    cwd: rootDir,
    env: process.env,
    prefix: "site",
  });

  console.log("▶️  Чекаю backend health на http://127.0.0.1:3001/api/health...");
  await waitForHttp("http://127.0.0.1:3001/api/health", 45_000);
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Не знайдено .env: ${filePath}`);
  }

  const result = {};
  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      console.warn(`⚠️  У .env знайдено дубльований ключ ${key}. Використовую перше значення, дубль пропускаю.`);
      continue;
    }
    result[key] = value;
  }

  return result;
}

function required(env, key) {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`У .env не задано ${key}`);
  }
  return value;
}

async function ensureCommand(command, args, errorMessage) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.once("error", () => reject(new Error(errorMessage)));
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(errorMessage));
    });
  });
}

function spawnManaged(command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);

  child.stdout.on("data", (chunk) => writePrefixed(options.prefix, chunk));
  child.stderr.on("data", (chunk) => writePrefixed(options.prefix, chunk));
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      console.log(`[${options.prefix}] exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    }
  });
  child.once("error", (error) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(`[${options.prefix}] ${error.message}`);
    }
  });

  return child;
}

function writePrefixed(prefix, chunk) {
  const text = String(chunk);
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) {
      console.log(`[${prefix}] ${line}`);
    }
  }
}

async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch {
      // retry
    }
    await sleep(500);
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function waitForNgrokUrl(timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(ngrokApiUrl);
      if (response.ok) {
        const data = await response.json();
        const tunnel = data.tunnels?.find((item) =>
          typeof item.public_url === "string" && item.public_url.startsWith("https://")
        );
        if (tunnel?.public_url) {
          return tunnel.public_url.replace(/\/$/, "");
        }
      }
    } catch {
      // retry
    }
    await sleep(500);
  }
  throw new Error("Не вдалося отримати ngrok public URL з http://127.0.0.1:4040/api/tunnels");
}

async function setTelegramWebhook(botToken, webhookSecret, webhookUrl) {
  const form = new FormData();
  form.set("url", webhookUrl);
  form.set("secret_token", webhookSecret);
  form.set("drop_pending_updates", "true");

  const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    body: form,
  });
  return response.json();
}

async function getTelegramWebhookInfo(botToken) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
  return response.json();
}

async function deleteTelegramWebhook(botToken) {
  const form = new FormData();
  form.set("drop_pending_updates", "false");

  const response = await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`, {
    method: "POST",
    body: form,
  });
  return response.json();
}

async function checkBackendInternalUrl(backendInternalUrl, internalToken) {
  console.log("▶️  Перевіряю BACKEND_INTERNAL_URL...");
  const testUrl = `${backendInternalUrl.replace(/\/$/, "")}/employee-candidates/start`;
  try {
    const response = await fetch(testUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": internalToken,
      },
      // Empty payload intentionally reaches validation only after internal token check.
      // 400 means backend+token are reachable; it avoids creating a fake employee candidate.
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 401) {
      throw new Error("backend відповів 401. TELEGRAM_INTERNAL_TOKEN у локальному .env і на backend не збігаються.");
    }

    if (response.status === 400) {
      return;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`backend відповів ${response.status}: ${text.slice(0, 300)}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (backendInternalUrl.startsWith("https://")) {
      throw new Error(
        `BACKEND_INTERNAL_URL недоступний: ${message}\n` +
        "Якщо бачиш SSL/self-signed проблему на technorent.lanbox.com.ua, для локального бота постав:\n" +
        "BACKEND_INTERNAL_URL=http://technorent.lanbox.com.ua/api/internal/telegram",
      );
    }
    throw new Error(`BACKEND_INTERNAL_URL недоступний: ${message}`);
  }
}

function waitForever() {
  const rl = createInterface({ input, output });
  return new Promise((resolve) => {
    process.once("SIGINT", () => {
      rl.close();
      resolve();
    });
    process.once("SIGTERM", () => {
      rl.close();
      resolve();
    });
  });
}

function shutdown(code) {
  shuttingDown = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }
  process.exit(code);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
