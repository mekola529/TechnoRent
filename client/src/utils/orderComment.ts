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

function normalizeComment(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
