export async function sendTelegramNotification(order: {
  customerName: string;
  phone: string;
  email?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  address?: string | null;
  comment?: string | null;
  equipment?: { name: string } | null;
}) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!BOT_TOKEN || !CHAT_ID) return;

  const now = new Date();
  const timestamp = now.toLocaleString("uk", { timeZone: "Europe/Kyiv" });

  const lines = [
    "📋 <b>Нова заявка з сайту!</b>",
    "",
    `👤 <b>Ім'я:</b> ${esc(order.customerName)}`,
    `📞 <b>Телефон:</b> ${esc(order.phone)}`,
    `📧 <b>Email:</b> ${order.email ? esc(order.email) : "не вказано"}`,
    `🛠️ <b>Товар:</b> ${order.equipment ? esc(order.equipment.name) : "Загальна заявка"}`,
    "",
    `💬 <b>Коментар:</b>`,
    order.comment ? esc(order.comment) : "без коментарю",
  ];

  if (order.dateFrom || order.dateTo) {
    const from = order.dateFrom ? order.dateFrom.toLocaleDateString("uk") : "—";
    const to = order.dateTo ? order.dateTo.toLocaleDateString("uk") : "—";
    lines.push("", `📅 <b>Період оренди:</b> ${from} — ${to}`);
  }
  if (order.address) {
    lines.push(`📍 <b>Адреса:</b> ${esc(order.address)}`);
  }

  lines.push("", `⏰ ${timestamp}`);

  const text = lines.join("\n");

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    });
  } catch (e) {
    console.error("Telegram notification error:", e);
  }
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
