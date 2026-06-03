import { logError } from "./logger.js";
import { renderConfiguredNotification } from "./notification-service.js";
import { parseOrderComment } from "./order-comment.js";
import { pool } from "./db.js";
export async function sendTelegramNotification(order: {
  customerName: string;
  phone: string;
  email?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  address?: string | null;
  comment?: string | null;
  equipment?: { name: string } | null;
  requestMeta?: {
    requestType?: string | null;
    serviceName?: string | null;
    addressTo?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null;
}) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!BOT_TOKEN || !CHAT_ID) return;

  const now = new Date();
  const timestamp = now.toLocaleString("uk", { timeZone: "Europe/Kyiv" });
  const parsedComment = parseOrderComment(order.comment);
  const requestTowMeta =
    order.requestMeta?.metadata &&
    typeof order.requestMeta.metadata === "object" &&
    order.requestMeta.metadata.tow &&
    typeof order.requestMeta.metadata.tow === "object"
      ? (order.requestMeta.metadata.tow as Record<string, unknown>)
      : null;
  const requestMaterialDeliveryMeta = getMaterialDeliveryMeta(order.requestMeta?.metadata);
  const serviceName = order.requestMeta?.serviceName ?? parsedComment.serviceName;
  const serviceSlug = resolveNotificationServiceSlug({
    requestType: order.requestMeta?.requestType,
    serviceName,
    metadata: order.requestMeta?.metadata,
  });
  const headline = serviceName
    ? `🚨 <b>НОВА ЗАЯВКА: ${esc(serviceName.toUpperCase())}</b> 🚨`
    : "🚨 <b>НОВА ЗАЯВКА З САЙТУ</b> 🚨";
  const subject = serviceName ?? (order.equipment ? order.equipment.name : "Загальна заявка");
  const currentPosition =
    (requestTowMeta?.truckCurrentPosition as string | undefined) ??
    getCommentFieldValue(parsedComment.fields, "Поточна позиція евакуатора");
  const destination =
    order.requestMeta?.addressTo ??
    (requestTowMeta?.destinationAddress as string | undefined) ??
    getCommentFieldValue(parsedComment.fields, "Куди доставити");
  const routeFields = requestTowMeta
    ? [
        requestTowMeta.truckCurrentPosition
          ? { label: "Поточна позиція евакуатора", value: String(requestTowMeta.truckCurrentPosition) }
          : null,
        requestTowMeta.truckDispatchDistance
          ? { label: "Подача евакуатора", value: String(requestTowMeta.truckDispatchDistance) }
          : null,
        requestTowMeta.truckDispatchEta
          ? { label: "Час подачі", value: String(requestTowMeta.truckDispatchEta) }
          : null,
        requestTowMeta.clientRouteDistance
          ? { label: "Маршрут клієнта", value: String(requestTowMeta.clientRouteDistance) }
          : null,
        requestTowMeta.clientRouteEta
          ? { label: "Час евакуації", value: String(requestTowMeta.clientRouteEta) }
          : null,
        requestTowMeta.totalRouteDistance
          ? { label: "Загальний маршрут", value: String(requestTowMeta.totalRouteDistance) }
          : null,
        requestTowMeta.tariffLabel
          ? { label: "Тариф", value: String(requestTowMeta.tariffLabel) }
          : null,
        requestTowMeta.estimatedCost
          ? { label: "Орієнтовна вартість", value: String(requestTowMeta.estimatedCost) }
          : null,
      ].filter(Boolean) as Array<{ label: string; value: string }>
    : parsedComment.fields.filter((field) =>
        [
          "Поточна позиція евакуатора",
          "Подача евакуатора",
          "Час подачі",
          "Маршрут клієнта",
          "Час евакуації",
          "Загальний маршрут",
          "Тариф",
          "Орієнтовна вартість",
        ].includes(field.label),
      );
  const extraFields = parsedComment.fields.filter((field) =>
    !routeFields.some((routeField) => routeField.label === field.label && routeField.value === field.value) &&
    field.label !== "Куди доставити" &&
    field.label !== "Коментар",
  );

  const lines = [
    headline,
    "━━━━━━━━━━━━━━━━━━",
    `👤 <b>Клієнт:</b> ${esc(order.customerName)}`,
    `📞 <b>Телефон:</b> ${esc(order.phone)}`,
    `📧 <b>Email:</b> ${order.email ? esc(order.email) : "не вказано"}`,
    `🛠️ <b>Позиція:</b> ${esc(subject)}`,
  ];

  if (order.dateFrom || order.dateTo) {
    const from = order.dateFrom ? order.dateFrom.toLocaleDateString("uk") : "—";
    const to = order.dateTo ? order.dateTo.toLocaleDateString("uk") : "—";
    lines.push(`📅 <b>Період оренди:</b> ${from} — ${to}`);
  }

  if (order.address || destination) {
    lines.push("", "🗺️ <b>МАРШРУТ</b>");
    if (order.address) {
      lines.push(`┣ 📍 <b>Звідки:</b> ${esc(order.address)}`);
    }
    if (destination) {
      lines.push(`┗ 🏁 <b>Куди:</b> ${esc(destination)}`);
    }
    const mapLinks = [
      order.address ? buildMapsLink("📍 Точка A", order.address) : null,
      destination ? buildMapsLink("🏁 Точка B", destination) : null,
    ].filter(Boolean);
    if (mapLinks.length > 0) {
      lines.push(`🔗 ${mapLinks.join("  •  ")}`);
    }
  }

  const googleRouteLink =
    currentPosition && order.address && destination
      ? buildGoogleDirectionsLink(currentPosition, order.address, destination)
      : null;
  const wazePickupLink = order.address ? buildWazeLink(order.address) : null;
  const wazeDestinationLink = destination ? buildWazeLink(destination) : null;

  if (googleRouteLink || wazePickupLink || wazeDestinationLink) {
    lines.push("", "🧭 <b>НАВІГАЦІЯ</b>");
    if (googleRouteLink) {
      lines.push(`┣ 🚗 <a href="${googleRouteLink}">Google Maps • повний маршрут</a>`);
    }
    if (wazePickupLink) {
      lines.push(`┣ 🟠 <a href="${wazePickupLink}">Waze • до точки A</a>`);
    }
    if (wazeDestinationLink) {
      lines.push(`┗ 🟠 <a href="${wazeDestinationLink}">Waze • до точки B</a>`);
    } else {
      const lastIndex = lines.length - 1;
      lines[lastIndex] = lines[lastIndex].replace(/^┣/, "┗");
    }
  }

  if (routeFields.length > 0) {
    lines.push("", "📊 <b>РОЗРАХУНОК</b>");
    for (const field of routeFields) {
      lines.push(`┣ ${pickFieldEmoji(field.label)} <b>${esc(field.label)}:</b> ${esc(field.value)}`);
    }
    const lastIndex = lines.length - 1;
    lines[lastIndex] = lines[lastIndex].replace(/^┣/, "┗");
  }

  if (extraFields.length > 0) {
    lines.push("", "🧾 <b>ДОДАТКОВО</b>");
    for (const field of extraFields) {
      lines.push(`• <b>${esc(field.label)}:</b> ${esc(field.value)}`);
    }
  }

  const requestComment =
    (requestTowMeta?.customerComment as string | undefined) ??
    parsedComment.note;

  if (requestComment) {
    lines.push("", "💬 <b>КОМЕНТАР</b>", `✎ ${esc(requestComment)}`);
  } else if (!parsedComment.fields.length && !order.address) {
    lines.push("", "💬 <b>КОМЕНТАР</b>", "✎ без коментарю");
  }

  lines.push("", `⏰ <b>Створено:</b> ${timestamp}`);

  const rendered = await renderConfiguredNotification(
    serviceName ? "new_service_request_admin" : "new_site_request_admin",
    {
      request: {
        customerName: order.customerName,
        phone: order.phone,
        email: order.email || "не вказано",
        addressFrom: order.address || "—",
        addressTo: destination || "—",
        date: "—",
        time: "—",
        period: formatRentalPeriod(order.dateFrom, order.dateTo),
        currentPosition: currentPosition || "—",
        pickupMapLink: order.address ? buildMapsLink("📍 Точка A", order.address) : "—",
        destinationMapLink: destination ? buildMapsLink("🏁 Точка B", destination) : "—",
        truckDispatchDistance: stringValue(requestTowMeta?.truckDispatchDistance),
        truckDispatchEta: stringValue(requestTowMeta?.truckDispatchEta),
        clientRouteDistance: stringValue(requestTowMeta?.clientRouteDistance),
        clientRouteEta: stringValue(requestTowMeta?.clientRouteEta),
        totalRouteDistance: stringValue(requestTowMeta?.totalRouteDistance),
        estimatedCost: stringValue(requestTowMeta?.estimatedCost),
        comment: requestComment || parsedComment.note || "без коментарю",
        createdAt: timestamp,
      },
      material: {
        name: stringValue(requestMaterialDeliveryMeta?.selectedMaterialName),
        quantity: stringValue(requestMaterialDeliveryMeta?.quantity),
        unit: stringValue(requestMaterialDeliveryMeta?.unit),
        deliveryAddress: stringValue(requestMaterialDeliveryMeta?.deliveryAddress ?? order.address),
        supplierPointName: stringValue(requestMaterialDeliveryMeta?.chosenSupplierPointName),
        supplierPointAddress: stringValue(requestMaterialDeliveryMeta?.chosenSupplierPointAddress),
        materialCost: formatMoneyValue(requestMaterialDeliveryMeta?.materialCost),
        deliveryCost: formatMoneyValue(requestMaterialDeliveryMeta?.deliveryCost),
        totalCost: formatMoneyValue(requestMaterialDeliveryMeta?.totalEstimatedCost),
        truckToPointKm: formatKmValue(requestMaterialDeliveryMeta?.truckToPointKm),
        pointToClientKm: formatKmValue(requestMaterialDeliveryMeta?.pointToClientKm),
      },
      service: {
        title: subject,
        slug: serviceSlug || "—",
      },
      system: {
        siteUrl: process.env.SITE_URL || "https://technorent.ua",
      },
    },
    { serviceSlug },
  );
  if (rendered && !rendered.enabled) return;

  const text = rendered?.text || lines.join("\n");

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: rendered?.supportsHtml === false ? undefined : "HTML",
      }),
    });
  } catch (e) {
    logError("Telegram notification error:", e);
  }
}

const serviceTypeLabels: Record<string, string> = {
  debris_removal: "Вивіз будівельного сміття",
};

const serviceTypeSlugs: Record<string, string> = {
  debris_removal: "vyviz-budivelnogo-smittia",
};

export async function sendServiceRequestTelegram(req: {
  serviceType: string;
  customerName: string;
  phone: string;
  address: string;
  date: Date;
  time: string;
  comment?: string | null;
}) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!BOT_TOKEN || !CHAT_ID) return;

  const now = new Date();
  const timestamp = now.toLocaleString("uk", { timeZone: "Europe/Kyiv" });
  const serviceLabel = serviceTypeLabels[req.serviceType] ?? req.serviceType;
  const serviceSlug = serviceTypeSlugs[req.serviceType] ?? null;

  const lines = [
    `🚛 <b>Нова заявка: ${esc(serviceLabel)}</b>`,
    "",
    `👤 <b>Ім'я:</b> ${esc(req.customerName)}`,
    `📞 <b>Телефон:</b> ${esc(req.phone)}`,
    `📍 <b>Адреса:</b> ${esc(req.address)}`,
    `📅 <b>Дата:</b> ${req.date.toLocaleDateString("uk")}`,
    `🕐 <b>Час:</b> ${esc(req.time)}`,
    "",
    `💬 <b>Коментар:</b>`,
    req.comment ? esc(req.comment) : "без коментарю",
    "",
    `⏰ ${timestamp}`,
  ];

  const text = lines.join("\n");
  const rendered = await renderConfiguredNotification("new_service_request_admin", {
    request: {
      customerName: req.customerName,
      phone: req.phone,
      addressFrom: req.address,
      addressTo: "—",
      email: "—",
      date: req.date.toLocaleDateString("uk"),
      time: req.time || "—",
      period: req.date.toLocaleDateString("uk"),
      comment: req.comment || "без коментарю",
      createdAt: timestamp,
    },
    service: {
      title: serviceLabel,
      slug: serviceSlug || "—",
    },
    system: {
      siteUrl: process.env.SITE_URL || "https://technorent.ua",
    },
  }, { serviceSlug });
  if (rendered && !rendered.enabled) return;

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: rendered?.text || text,
        parse_mode: rendered?.supportsHtml === false ? undefined : "HTML",
      }),
    });
  } catch (e) {
    logError("Telegram service request notification error:", e);
  }
}

export async function sendManagerDispatchNotification(input: {
  eventType:
    | "assignment_accepted"
    | "assignment_declined"
    | "execution_started"
    | "execution_finished"
    | "worker_report_submitted";
  orderId: string;
  employeeName: string;
  customerName: string;
  customerPhone: string;
  responseComment?: string | null;
}) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!BOT_TOKEN || !CHAT_ID) return;

  const eventLabelMap: Record<typeof input.eventType, string> = {
    assignment_accepted: "✅ Працівник прийняв завдання",
    assignment_declined: "❌ Працівник відхилив завдання",
    execution_started: "🚀 Працівник розпочав виконання",
    execution_finished: "🏁 Працівник завершив виконання",
    worker_report_submitted: "🧾 Працівник заповнив підсумковий звіт",
  };

  const templateKeyMap: Record<typeof input.eventType, string> = {
    assignment_accepted: "worker_assignment_accepted_manager",
    assignment_declined: "worker_assignment_declined_manager",
    execution_started: "execution_started_manager",
    execution_finished: "execution_finished_manager",
    worker_report_submitted: "worker_report_submitted_manager",
  };

  const serviceContext = await loadOrderNotificationServiceContext(input.orderId);
  const displayOrderId = formatPublicOrderNumber(serviceContext.orderNumber, input.orderId);
  const lines = [
    `<b>${eventLabelMap[input.eventType]}</b>`,
    "",
    `🧾 <b>Замовлення:</b> ${esc(displayOrderId)}`,
    `👷 <b>Працівник:</b> ${esc(input.employeeName)}`,
    `👤 <b>Клієнт:</b> ${esc(input.customerName)}`,
    `📞 <b>Телефон:</b> ${esc(input.customerPhone)}`,
    input.responseComment ? `💬 <b>Коментар:</b> ${esc(input.responseComment)}` : null,
  ].filter(Boolean);
  const rendered = await renderConfiguredNotification(templateKeyMap[input.eventType], {
    order: {
      id: displayOrderId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
    },
    worker: {
      name: input.employeeName,
      responseComment: input.responseComment || "—",
    },
    report: {
      workerComment: input.responseComment || "—",
    },
    service: {
      title: serviceContext.title,
      slug: serviceContext.slug || "—",
    },
  }, { serviceSlug: serviceContext.slug });
  if (rendered && !rendered.enabled) return;

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: rendered?.text || lines.join("\n"),
        parse_mode: rendered?.supportsHtml === false ? undefined : "HTML",
      }),
    });
  } catch (error) {
    logError("Telegram manager dispatch notification error:", error);
  }
}

export async function sendOrderClosedManagerNotification(input: {
  orderId: string;
  customerName: string;
  customerPhone: string;
  finalPrice?: number | string | null;
}) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!BOT_TOKEN || !CHAT_ID) return;

  const serviceContext = await loadOrderNotificationServiceContext(input.orderId);
  const displayOrderId = formatPublicOrderNumber(serviceContext.orderNumber, input.orderId);
  const rendered = await renderConfiguredNotification("order_closed_manager", {
    order: {
      id: displayOrderId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      finalPrice: formatMoneyValue(input.finalPrice),
    },
    service: {
      title: serviceContext.title,
      slug: serviceContext.slug || "—",
    },
  }, { serviceSlug: serviceContext.slug });
  if (rendered && !rendered.enabled) return;

  const fallback = [
    "✅ <b>Замовлення фінально закрито</b>",
    "",
    `🧾 <b>Замовлення:</b> ${esc(displayOrderId)}`,
    `👤 <b>Клієнт:</b> ${esc(input.customerName)}`,
    `📞 <b>Телефон:</b> ${esc(input.customerPhone)}`,
    `💰 <b>Фінальна сума:</b> ${esc(formatMoneyValue(input.finalPrice))}`,
  ].join("\n");

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: rendered?.text || fallback,
        parse_mode: rendered?.supportsHtml === false ? undefined : "HTML",
      }),
    });
  } catch (error) {
    logError("Telegram order closed notification error:", error);
  }
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatPublicOrderNumber(orderNumber: unknown, orderId: unknown) {
  const value = orderNumber ?? orderId;
  return String(value ?? "").replace(/\D/g, "") || "0";
}

function buildMapsLink(label: string, address: string): string {
  const query = encodeURIComponent(address);
  const href = `https://www.google.com/maps/search/?api=1&query=${query}`;
  return `<a href="${href}">${esc(label)}</a>`;
}

function buildGoogleDirectionsLink(origin: string, pickup: string, destination: string): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("waypoints", pickup);
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}

function buildWazeLink(location: string): string {
  const url = new URL("https://waze.com/ul");
  const coordinateMatch = parseCoordinateString(location);

  if (coordinateMatch) {
    url.searchParams.set("ll", `${coordinateMatch.lat},${coordinateMatch.lon}`);
  } else {
    url.searchParams.set("q", location);
  }

  url.searchParams.set("navigate", "yes");
  url.searchParams.set("utm_source", "technorent");
  return url.toString();
}

function getMaterialDeliveryMeta(metadata?: Record<string, unknown> | null): Record<string, unknown> | null {
  const materialDelivery = metadata?.materialDelivery;
  return materialDelivery &&
    typeof materialDelivery === "object" &&
    (materialDelivery as Record<string, unknown>).servicePricingType === "material_delivery_calculator"
      ? materialDelivery as Record<string, unknown>
      : null;
}

function stringValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function formatRentalPeriod(dateFrom?: Date | null, dateTo?: Date | null) {
  if (!dateFrom && !dateTo) return "—";
  const from = dateFrom ? dateFrom.toLocaleDateString("uk") : "—";
  const to = dateTo ? dateTo.toLocaleDateString("uk") : "—";
  if (from === to) return from;
  return `${from} — ${to}`;
}

function formatMoneyValue(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(amount)} грн`;
}

function formatKmValue(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 1 }).format(amount)} км`;
}

function getCommentFieldValue(
  fields: Array<{ label: string; value: string }>,
  label: string,
): string | null {
  return fields.find((field) => field.label === label)?.value ?? null;
}

function pickFieldEmoji(label: string): string {
  if (label.includes("Поточна позиція")) return "📡";
  if (label.includes("Подача")) return "🚚";
  if (label.includes("Час подачі")) return "⏱";
  if (label.includes("Маршрут")) return "🛣";
  if (label.includes("Час евакуації")) return "⌛";
  if (label.includes("Загальний маршрут")) return "📏";
  if (label.includes("Тариф")) return "💸";
  if (label.includes("Орієнтовна вартість")) return "💰";
  return "•";
}

function resolveNotificationServiceSlug(input: {
  requestType?: string | null;
  serviceName?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const metadataSlug = input.metadata?.serviceSlug;
  if (typeof metadataSlug === "string" && metadataSlug.trim()) return metadataSlug.trim();

  const towMeta = input.metadata?.tow;
  if (input.requestType === "tow" || (towMeta && typeof towMeta === "object")) {
    return "poslugy-evakuatora";
  }

  const materialDeliveryMeta = input.metadata?.materialDelivery;
  if (
    materialDeliveryMeta &&
    typeof materialDeliveryMeta === "object" &&
    (materialDeliveryMeta as Record<string, unknown>).servicePricingType === "material_delivery_calculator"
  ) {
    return "perevezennia-sypuchyh-materialiv";
  }

  const lowerName = input.serviceName?.toLowerCase() ?? "";
  if (lowerName.includes("евакуатор")) return "poslugy-evakuatora";
  if (lowerName.includes("сипуч") || lowerName.includes("матеріал")) return "perevezennia-sypuchyh-materialiv";
  if (lowerName.includes("сміт")) return "vyviz-budivelnogo-smittia";

  return null;
}

async function loadOrderNotificationServiceContext(orderId: string) {
  try {
    const { rows } = await pool.query(
      `SELECT
         ro."orderNumber",
         cr."requestType",
         COALESCE(
           NULLIF(cr."metadata"->>'serviceName', ''),
           NULLIF(cr."metadata"->>'serviceType', ''),
           NULLIF(service_item."titleSnapshot", '')
         ) AS "serviceName",
         cr."metadata"
       FROM "RentOrder" ro
       LEFT JOIN "CustomerRequest" cr ON cr."id" = ro."sourceCustomerRequestId"
       LEFT JOIN LATERAL (
         SELECT cri."titleSnapshot"
         FROM "CustomerRequestItem" cri
         WHERE cri."requestId" = cr."id"
           AND cri."itemType" = 'service'
         ORDER BY cri."createdAt" ASC
         LIMIT 1
       ) service_item ON TRUE
       WHERE ro."id" = $1
       LIMIT 1`,
      [orderId],
    );
    const row = rows[0];
    const metadata = row?.metadata && typeof row.metadata === "object"
      ? row.metadata as Record<string, unknown>
      : null;
    const slug = resolveNotificationServiceSlug({
      requestType: row?.requestType ?? null,
      serviceName: row?.serviceName ?? null,
      metadata,
    });
    return {
      orderNumber: row?.orderNumber == null ? null : String(row.orderNumber),
      title: row?.serviceName ?? serviceTitleFromSlug(slug) ?? "—",
      slug,
    };
  } catch (error) {
    logError("loadOrderNotificationServiceContext error:", error);
    return { orderNumber: null, title: "—", slug: null };
  }
}

function serviceTitleFromSlug(slug: string | null) {
  if (slug === "poslugy-evakuatora") return "Послуги евакуатора";
  if (slug === "perevezennia-sypuchyh-materialiv") return "Перевезення сипучих матеріалів";
  if (slug === "vyviz-budivelnogo-smittia") return "Вивіз будівельного сміття";
  return null;
}

function parseCoordinateString(value: string): { lat: number; lon: number } | null {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value);
  if (!match) {
    return null;
  }

  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return { lat, lon };
}
