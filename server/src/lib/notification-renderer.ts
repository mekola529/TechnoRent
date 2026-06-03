import type { NotificationTemplateDefinition } from "./notification-templates.js";

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export interface RenderResult {
  text: string;
  unknownVariables: string[];
}

export function extractTemplateVariables(template: string) {
  const variables = new Set<string>();
  for (const match of template.matchAll(TOKEN_RE)) {
    variables.add(match[1]);
  }
  return [...variables];
}

export function validateTemplateVariables(
  definition: NotificationTemplateDefinition,
  template: string,
) {
  const allowed = new Set(definition.variables.map((variable) => variable.key));
  return extractTemplateVariables(template).filter((key) => !allowed.has(key));
}

export function renderNotificationTemplate(
  definition: NotificationTemplateDefinition,
  template: string,
  context: Record<string, unknown>,
): RenderResult {
  const allowed = new Set(definition.variables.map((variable) => variable.key));
  const unknownVariables = new Set<string>();

  const text = template.replace(TOKEN_RE, (_full, key: string) => {
    if (!allowed.has(key)) {
      unknownVariables.add(key);
      return `{{${key}}}`;
    }

    const value = readPath(context, key);
    if (value === null || value === undefined || value === "") {
      return "—";
    }

    return String(value);
  });

  return {
    text,
    unknownVariables: [...unknownVariables],
  };
}

export function buildSampleNotificationContext(definition: NotificationTemplateDefinition) {
  const context: Record<string, unknown> = {};

  for (const variable of definition.variables) {
    writePath(context, variable.key, variable.exampleValue);
  }

  return context;
}

function readPath(source: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, source);
}

function writePath(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = path.split(".");
  let current = target;

  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];
    if (!next || typeof next !== "object") {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  current[segments[segments.length - 1]] = value;
}
