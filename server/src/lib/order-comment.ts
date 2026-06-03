export interface ParsedOrderCommentField {
  label: string;
  value: string;
}

export interface ParsedOrderComment {
  serviceName: string | null;
  fields: ParsedOrderCommentField[];
  note: string | null;
  raw: string | null;
}

export interface StructuredTowOrderMeta {
  serviceName: string | null;
  isTowRequest: boolean;
  destinationAddress: string | null;
  towVehicleLabel: string | null;
  truckCurrentPosition: string | null;
  truckDispatchDistance: string | null;
  truckDispatchEta: string | null;
  clientRouteDistance: string | null;
  clientRouteEta: string | null;
  totalRouteDistance: string | null;
  tariffLabel: string | null;
  estimatedCost: string | null;
  customerComment: string | null;
}

export function parseOrderComment(comment: string | null | undefined): ParsedOrderComment {
  const normalized = normalizeComment(comment);
  if (!normalized) {
    return {
      serviceName: null,
      fields: [],
      note: null,
      raw: null,
    };
  }

  const tokens = normalized
    .split(/\s*\|\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  let serviceName: string | null = null;
  const fields: ParsedOrderCommentField[] = [];
  const noteParts: string[] = [];

  for (const token of tokens) {
    const serviceMatch = /^\[Послуга:\s*(.+?)\](.*)$/i.exec(token);
    if (serviceMatch) {
      serviceName = normalizeComment(serviceMatch[1]) ?? serviceName;
      const trailing = normalizeComment(serviceMatch[2]);
      if (trailing) {
        noteParts.push(trailing);
      }
      continue;
    }

    const fieldMatch = /^([^:]+):\s*(.+)$/.exec(token);
    if (fieldMatch) {
      const label = normalizeComment(fieldMatch[1]);
      const value = normalizeComment(fieldMatch[2]);
      if (label && value) {
        fields.push({ label, value });
        continue;
      }
    }

    noteParts.push(token);
  }

  return {
    serviceName,
    fields,
    note: noteParts.length > 0 ? noteParts.join("\n") : null,
    raw: normalized,
  };
}

export function extractStructuredTowOrderMeta(
  comment: string | null | undefined,
): StructuredTowOrderMeta {
  const parsed = parseOrderComment(comment);
  const byLabel = new Map(parsed.fields.map((field) => [field.label, field.value]));
  const serviceName = parsed.serviceName;
  const isTowByService = serviceName?.toLowerCase().includes("евакуатор") ?? false;
  const towFieldLabels = [
    "Куди доставити",
    "Поточна позиція евакуатора",
    "Подача евакуатора",
    "Час подачі",
    "Маршрут клієнта",
    "Час евакуації",
    "Загальний маршрут",
    "Тариф",
    "Орієнтовна вартість",
  ];
  const isTowByFields = towFieldLabels.some((label) => byLabel.has(label));

  return {
    serviceName,
    isTowRequest: isTowByService || isTowByFields,
    destinationAddress: byLabel.get("Куди доставити") ?? null,
    towVehicleLabel: byLabel.get("Евакуатор") ?? null,
    truckCurrentPosition: byLabel.get("Поточна позиція евакуатора") ?? null,
    truckDispatchDistance: byLabel.get("Подача евакуатора") ?? null,
    truckDispatchEta: byLabel.get("Час подачі") ?? null,
    clientRouteDistance: byLabel.get("Маршрут клієнта") ?? null,
    clientRouteEta: byLabel.get("Час евакуації") ?? null,
    totalRouteDistance: byLabel.get("Загальний маршрут") ?? null,
    tariffLabel: byLabel.get("Тариф") ?? null,
    estimatedCost: byLabel.get("Орієнтовна вартість") ?? null,
    customerComment: byLabel.get("Коментар") ?? parsed.note,
  };
}

function normalizeComment(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
