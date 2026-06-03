import type { PoolClient } from "pg";
import { pool } from "./db.js";
import {
  getNotificationTemplateDefinition,
  notificationTemplateRegistry,
  type NotificationTemplateDefinition,
  type NotificationServiceTemplateDefinition,
} from "./notification-templates.js";
import {
  buildSampleNotificationContext,
  renderNotificationTemplate,
  validateTemplateVariables,
} from "./notification-renderer.js";

export interface NotificationTemplateRow {
  id: string;
  key: string;
  serviceSlug: string | null;
  name: string;
  channel: string;
  category: string;
  recipientType: string;
  isEnabled: boolean;
  bodyTemplate: string;
  notes: string | null;
  supportsHtml: boolean;
  hasInteractiveButtons: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  updatedByAdminId: string | null;
}

export async function ensureNotificationTemplates(db: Pick<PoolClient, "query"> = pool) {
  for (const definition of notificationTemplateRegistry) {
    const existing = await db.query<Pick<NotificationTemplateRow, "id">>(
      `SELECT "id" FROM "NotificationTemplate"
       WHERE "key" = $1 AND "serviceSlug" IS NULL
       LIMIT 1`,
      [definition.key],
    );

    if (existing.rows[0]) {
      await db.query(
        `UPDATE "NotificationTemplate"
         SET "name" = COALESCE("name", $2),
             "channel" = $3,
             "category" = $4,
             "recipientType" = $5,
             "supportsHtml" = $6,
             "hasInteractiveButtons" = $7,
             "isSystem" = true,
             "bodyTemplate" = CASE
               WHEN "updatedByAdminId" IS NULL THEN $8
               ELSE "bodyTemplate"
             END
         WHERE "id" = $1`,
        [
          existing.rows[0].id,
          definition.name,
          definition.channel,
          definition.category,
          definition.recipientType,
          definition.supportsHtml,
          definition.hasInteractiveButtons,
          definition.defaultTemplate,
        ],
      );
    } else {
      await db.query(
      `INSERT INTO "NotificationTemplate" (
         "key",
         "serviceSlug",
         "name",
         "channel",
         "category",
         "recipientType",
         "isEnabled",
         "bodyTemplate",
         "supportsHtml",
         "hasInteractiveButtons",
         "isSystem",
         "updatedAt"
       )
       VALUES ($1, NULL, $2, $3, $4, $5, true, $6, $7, $8, true, NOW())`,
      [
        definition.key,
        definition.name,
        definition.channel,
        definition.category,
        definition.recipientType,
        definition.defaultTemplate,
        definition.supportsHtml,
        definition.hasInteractiveButtons,
      ],
      );
    }

    for (const serviceTemplate of definition.serviceTemplates ?? []) {
      await ensureServiceNotificationTemplate(db, definition, serviceTemplate);
    }
  }
}

async function ensureServiceNotificationTemplate(
  db: Pick<PoolClient, "query">,
  definition: NotificationTemplateDefinition,
  serviceTemplate: NotificationServiceTemplateDefinition,
) {
  const existing = await db.query<Pick<NotificationTemplateRow, "id">>(
    `SELECT "id" FROM "NotificationTemplate"
     WHERE "key" = $1 AND "serviceSlug" = $2
     LIMIT 1`,
    [definition.key, serviceTemplate.serviceSlug],
  );

  if (existing.rows[0]) {
    await db.query(
      `UPDATE "NotificationTemplate"
       SET "name" = COALESCE("name", $2),
           "channel" = $3,
           "category" = $4,
           "recipientType" = $5,
           "supportsHtml" = $6,
           "hasInteractiveButtons" = $7,
           "isSystem" = true,
           "notes" = CASE
             WHEN "updatedByAdminId" IS NULL THEN $8
             ELSE "notes"
           END,
           "bodyTemplate" = CASE
             WHEN "updatedByAdminId" IS NULL THEN $9
             ELSE "bodyTemplate"
           END
       WHERE "id" = $1`,
      [
        existing.rows[0].id,
        serviceTemplate.name ?? definition.name,
        definition.channel,
        definition.category,
        definition.recipientType,
        definition.supportsHtml,
        definition.hasInteractiveButtons,
        serviceTemplate.notes ?? null,
        serviceTemplate.bodyTemplate,
      ],
    );
    return;
  }

  await db.query(
    `INSERT INTO "NotificationTemplate" (
       "key",
       "serviceSlug",
       "name",
       "channel",
       "category",
       "recipientType",
       "isEnabled",
       "bodyTemplate",
       "notes",
       "supportsHtml",
       "hasInteractiveButtons",
       "isSystem",
       "updatedAt"
     )
     VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, true, NOW())`,
    [
      definition.key,
      serviceTemplate.serviceSlug,
      serviceTemplate.name ?? definition.name,
      definition.channel,
      definition.category,
      definition.recipientType,
      serviceTemplate.bodyTemplate,
      serviceTemplate.notes ?? null,
      definition.supportsHtml,
      definition.hasInteractiveButtons,
    ],
  );
}

export async function listNotificationTemplates(filters: {
  channel?: string;
  category?: string;
  status?: "enabled" | "disabled";
  search?: string;
}) {
  await ensureNotificationTemplates();

  const params: unknown[] = [];
  const conditions: string[] = [];

  if (filters.channel) {
    params.push(filters.channel);
    conditions.push(`"channel" = $${params.length}`);
  }
  if (filters.category) {
    params.push(filters.category);
    conditions.push(`"category" = $${params.length}`);
  }
  if (filters.status === "enabled" || filters.status === "disabled") {
    params.push(filters.status === "enabled");
    conditions.push(`"isEnabled" = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    conditions.push(`(LOWER("name") LIKE $${params.length} OR LOWER("key") LIKE $${params.length})`);
  }

  conditions.push(`"serviceSlug" IS NULL`);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query<NotificationTemplateRow>(
    `SELECT *
     FROM "NotificationTemplate"
     ${where}
     ORDER BY "category" ASC, "channel" ASC, "name" ASC`,
    params,
  );
  return rows.map((row) => withRegistryMeta(row));
}

export async function getNotificationTemplate(key: string, serviceSlug?: string | null) {
  return getNotificationTemplateForService(key, serviceSlug);
}

export async function getNotificationTemplateForService(key: string, serviceSlug?: string | null) {
  await ensureNotificationTemplates();
  const normalizedServiceSlug = normalizeServiceSlug(serviceSlug);
  if (normalizedServiceSlug) {
    const override = await findNotificationTemplate(key, normalizedServiceSlug);
    if (override) {
      return withRegistryMeta(override, { requestedServiceSlug: normalizedServiceSlug, isOverride: true });
    }
    const base = await findNotificationTemplate(key, null);
    return withRegistryMeta(base, { requestedServiceSlug: normalizedServiceSlug, isInherited: true });
  }

  const base = await findNotificationTemplate(key, null);
  return withRegistryMeta(base);
}

async function findNotificationTemplate(key: string, serviceSlug?: string | null) {
  const normalizedServiceSlug = normalizeServiceSlug(serviceSlug);
  const { rows } = await pool.query<NotificationTemplateRow>(
    `SELECT * FROM "NotificationTemplate"
     WHERE "key" = $1
       AND ${normalizedServiceSlug ? `"serviceSlug" = $2` : `"serviceSlug" IS NULL`}
     LIMIT 1`,
    normalizedServiceSlug ? [key, normalizedServiceSlug] : [key],
  );
  return rows[0] ?? null;
}

export async function updateNotificationTemplate(
  key: string,
  input: {
    name: string;
    isEnabled: boolean;
    bodyTemplate: string;
    notes?: string | null;
  },
  adminId?: string | null,
  serviceSlug?: string | null,
) {
  const definition = requireDefinition(key);
  const unknownVariables = validateTemplateVariables(definition, input.bodyTemplate);
  if (unknownVariables.length > 0) {
    return {
      error: `Невідомі змінні: ${unknownVariables.map((item) => `{{${item}}}`).join(", ")}`,
      template: null,
    };
  }

  await ensureNotificationTemplates();
  const normalizedServiceSlug = normalizeServiceSlug(serviceSlug);
  const existing = await findNotificationTemplate(key, normalizedServiceSlug);

  if (!existing) {
    const { rows } = await pool.query<NotificationTemplateRow>(
      `INSERT INTO "NotificationTemplate" (
         "key",
         "serviceSlug",
         "name",
         "channel",
         "category",
         "recipientType",
         "isEnabled",
         "bodyTemplate",
         "notes",
         "supportsHtml",
         "hasInteractiveButtons",
         "isSystem",
         "updatedByAdminId",
         "updatedAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, NOW())
       RETURNING *`,
      [
        key,
        normalizedServiceSlug,
        input.name.trim(),
        definition.channel,
        definition.category,
        definition.recipientType,
        input.isEnabled,
        input.bodyTemplate,
        input.notes?.trim() || null,
        definition.supportsHtml,
        definition.hasInteractiveButtons,
        adminId ?? null,
      ],
    );
    return {
      error: null,
      template: withRegistryMeta(rows[0], {
        requestedServiceSlug: normalizedServiceSlug,
        isOverride: Boolean(normalizedServiceSlug),
      }),
    };
  }

  const { rows } = await pool.query<NotificationTemplateRow>(
    `UPDATE "NotificationTemplate"
     SET "name" = $1,
         "isEnabled" = $2,
         "bodyTemplate" = $3,
         "notes" = $4,
         "updatedByAdminId" = $5,
         "updatedAt" = NOW()
     WHERE "id" = $6
     RETURNING *`,
    [
      input.name.trim(),
      input.isEnabled,
      input.bodyTemplate,
      input.notes?.trim() || null,
      adminId ?? null,
      existing.id,
    ],
  );

  return {
    error: null,
    template: withRegistryMeta(rows[0], {
      requestedServiceSlug: normalizedServiceSlug,
      isOverride: Boolean(normalizedServiceSlug),
    }),
  };
}

export async function resetNotificationTemplate(key: string, adminId?: string | null, serviceSlug?: string | null) {
  const definition = requireDefinition(key);
  await ensureNotificationTemplates();
  const normalizedServiceSlug = normalizeServiceSlug(serviceSlug);
  if (normalizedServiceSlug) {
    const serviceDefault = findServiceDefaultTemplate(definition, normalizedServiceSlug);
    if (!serviceDefault) {
      await pool.query(
        `DELETE FROM "NotificationTemplate"
         WHERE "key" = $1 AND "serviceSlug" = $2`,
        [key, normalizedServiceSlug],
      );
      return getNotificationTemplateForService(key, normalizedServiceSlug);
    }

    const existing = await findNotificationTemplate(key, normalizedServiceSlug);
    if (existing) {
      const { rows } = await pool.query<NotificationTemplateRow>(
        `UPDATE "NotificationTemplate"
         SET "name" = $1,
             "isEnabled" = true,
             "bodyTemplate" = $2,
             "notes" = $3,
             "updatedByAdminId" = $4,
             "updatedAt" = NOW()
         WHERE "id" = $5
         RETURNING *`,
        [
          serviceDefault.name ?? definition.name,
          serviceDefault.bodyTemplate,
          serviceDefault.notes ?? null,
          adminId ?? null,
          existing.id,
        ],
      );
      return withRegistryMeta(rows[0], { requestedServiceSlug: normalizedServiceSlug, isOverride: true });
    }

    const { rows } = await pool.query<NotificationTemplateRow>(
      `INSERT INTO "NotificationTemplate" (
         "key",
         "serviceSlug",
         "name",
         "channel",
         "category",
         "recipientType",
         "isEnabled",
         "bodyTemplate",
         "notes",
         "supportsHtml",
         "hasInteractiveButtons",
         "isSystem",
         "updatedByAdminId",
         "updatedAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, true, $11, NOW())
       RETURNING *`,
      [
        key,
        normalizedServiceSlug,
        serviceDefault.name ?? definition.name,
        definition.channel,
        definition.category,
        definition.recipientType,
        serviceDefault.bodyTemplate,
        serviceDefault.notes ?? null,
        definition.supportsHtml,
        definition.hasInteractiveButtons,
        adminId ?? null,
      ],
    );
    return withRegistryMeta(rows[0], { requestedServiceSlug: normalizedServiceSlug, isOverride: true });
  }

  const { rows } = await pool.query<NotificationTemplateRow>(
    `UPDATE "NotificationTemplate"
     SET "name" = $1,
         "isEnabled" = true,
         "bodyTemplate" = $2,
         "notes" = NULL,
         "updatedByAdminId" = $3,
         "updatedAt" = NOW()
     WHERE "key" = $4 AND "serviceSlug" IS NULL
     RETURNING *`,
    [definition.name, definition.defaultTemplate, adminId ?? null, key],
  );
  return withRegistryMeta(rows[0]);
}

export async function previewNotificationTemplate(key: string, bodyTemplate?: string, serviceSlug?: string | null) {
  const definition = requireDefinition(key);
  const template =
    bodyTemplate ??
    (await getNotificationTemplateForService(key, serviceSlug))?.bodyTemplate ??
    definition.defaultTemplate;
  const context = buildSampleNotificationContext(definition);
  const normalizedServiceSlug = normalizeServiceSlug(serviceSlug);
  if (normalizedServiceSlug) {
    context.service = {
      ...(typeof context.service === "object" && context.service ? context.service : {}),
      slug: normalizedServiceSlug,
    };
  }
  return renderNotificationTemplate(definition, template, context);
}

export async function renderConfiguredNotification(
  key: string,
  context: Record<string, unknown>,
  options?: { serviceSlug?: string | null },
) {
  const definition = getNotificationTemplateDefinition(key);
  if (!definition) return null;

  const serviceSlug = options?.serviceSlug ?? readServiceSlugFromContext(context);
  const template = await getNotificationTemplateForService(key, serviceSlug);
  if (template && template.isEnabled === false) {
    return { enabled: false, text: "", supportsHtml: definition.supportsHtml, definition };
  }

  const body = template?.bodyTemplate || definition.defaultTemplate;
  const rendered = renderNotificationTemplate(definition, body, context);
  if (rendered.unknownVariables.length > 0) {
    const fallback = renderNotificationTemplate(definition, definition.defaultTemplate, context);
    return { enabled: true, text: fallback.text, supportsHtml: definition.supportsHtml, definition };
  }

  return { enabled: true, text: rendered.text, supportsHtml: definition.supportsHtml, definition };
}

export function getNotificationDefinitionPayload(key: string) {
  const definition = requireDefinition(key);
  return {
    ...definition,
    variables: definition.variables,
  };
}

function requireDefinition(key: string): NotificationTemplateDefinition {
  const definition = getNotificationTemplateDefinition(key);
  if (!definition) {
    throw new Error("Notification template is not registered");
  }
  return definition;
}

function withRegistryMeta(
  row: NotificationTemplateRow | undefined | null,
  options?: {
    requestedServiceSlug?: string | null;
    isOverride?: boolean;
    isInherited?: boolean;
  },
) {
  if (!row) return null;
  const definition = getNotificationTemplateDefinition(row.key);
  return {
    ...row,
    serviceSlug: options?.requestedServiceSlug ?? row.serviceSlug ?? null,
    isOverride: options?.isOverride ?? Boolean(row.serviceSlug),
    isInherited: options?.isInherited ?? false,
    defaultTemplate: definition?.defaultTemplate ?? "",
    variables: definition?.variables ?? [],
  };
}

function normalizeServiceSlug(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function readServiceSlugFromContext(context: Record<string, unknown>) {
  const service = context.service;
  if (!service || typeof service !== "object") return null;
  const slug = (service as Record<string, unknown>).slug;
  return typeof slug === "string" ? slug : null;
}

function findServiceDefaultTemplate(definition: NotificationTemplateDefinition, serviceSlug: string) {
  return definition.serviceTemplates?.find((template) => template.serviceSlug === serviceSlug) ?? null;
}
