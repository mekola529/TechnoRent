#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const envPath = path.join(rootDir, ".env");
const ngrokApiUrl = "http://127.0.0.1:4040/api/tunnels";
const backendPort = Number(process.env.PORT || "3001");
const children = new Set();

main().catch((error) => {
  console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
  shutdown(1);
});

async function main() {
  if (!Number.isInteger(backendPort) || backendPort <= 0) {
    throw new Error(`Некоректний PORT: ${process.env.PORT}`);
  }
  if (!existsSync(envPath)) {
    throw new Error("Файл .env не знайдено в корені проекту.");
  }

  await ensureCommand("ngrok", ["version"], "ngrok не знайдено. Встанови ngrok або додай його в PATH.");

  const env = loadEnvFile(envPath);
  const webhookSecret = env.MONOBANK_WEBHOOK_SECRET || randomFallbackSecret();

  console.log(`▶️  Запускаю ngrok для backend http://127.0.0.1:${backendPort}...`);
  spawnManaged("ngrok", ["http", String(backendPort)], {
    cwd: rootDir,
    env: process.env,
    prefix: "ngrok",
  });

  const publicUrl = await waitForNgrokUrl(30_000);
  const webhookUrl = `${publicUrl}/api/payments/monobank/webhook/${webhookSecret}`;

  updateEnvFile(envPath, {
    MONOBANK_WEBHOOK_SECRET: webhookSecret,
    MONOBANK_WEBHOOK_URL: webhookUrl,
    MONOBANK_REDIRECT_URL: env.MONOBANK_REDIRECT_URL?.includes("/admin")
      ? "http://localhost:5173/"
      : env.MONOBANK_REDIRECT_URL || "http://localhost:5173/",
    MONOBANK_VERIFY_WEBHOOK: env.MONOBANK_VERIFY_WEBHOOK || "true",
  });

  console.log("\n✅ MONOBANK_WEBHOOK_URL оновлено в .env.");
  console.log("Webhook URL:");
  console.log(webhookUrl);
  console.log("\nВажливо:");
  console.log("1. Перезапусти backend після оновлення .env, бо env читається при старті.");
  console.log("2. Тримай це вікно відкритим, поки тестуєш оплату.");
  console.log("3. Для створення invoice використовуй кнопку в замовленні: Оплати клієнта -> Створити посилання.");
  console.log("\nЩоб зупинити ngrok: Ctrl+C\n");
}

function loadEnvFile(filePath) {
  const env = {};
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function quote(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function updateEnvFile(filePath, updates) {
  let lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const seen = new Set();
  lines = lines.map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match || !(match[1] in updates)) return line;
    seen.add(match[1]);
    return `${match[1]}=${quote(updates[match[1]])}`;
  });

  const missing = Object.keys(updates).filter((key) => !seen.has(key));
  if (missing.length > 0) {
    if (lines.length && lines[lines.length - 1].trim() !== "") lines.push("");
    lines.push("# Monobank acquiring local tunnel");
    missing.forEach((key) => lines.push(`${key}=${quote(updates[key])}`));
  }

  writeFileSync(filePath, lines.join("\n"));
}

function randomFallbackSecret() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

async function ensureCommand(command, args, errorMessage) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", () => reject(new Error(errorMessage)));
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(errorMessage));
    });
  });
}

function spawnManaged(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  child.stdout?.on("data", (chunk) => process.stdout.write(`[${options.prefix}] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[${options.prefix}] ${chunk}`));
  child.on("exit", () => children.delete(child));
  return child;
}

async function waitForNgrokUrl(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(ngrokApiUrl);
      if (response.ok) {
        const data = await response.json();
        const tunnel = data.tunnels?.find((item) => item.public_url?.startsWith("https://"));
        if (tunnel?.public_url) return tunnel.public_url.replace(/\/$/, "");
      }
    } catch {
      // wait
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error("Не вдалося отримати ngrok public URL з http://127.0.0.1:4040/api/tunnels");
}

function shutdown(code) {
  for (const child of children) {
    child.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
