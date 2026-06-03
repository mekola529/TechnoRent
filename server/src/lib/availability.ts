import type { pool } from "./db.js";

export type AvailabilityStatus = "available" | "warning" | "conflict" | "insufficient";

export interface AvailabilityItemInput {
  equipmentId?: string | null;
  useCustomSchedule?: boolean;
  scheduledDateFrom?: string | null;
  scheduledDateTo?: string | null;
  scheduledTimeFrom?: string | null;
  scheduledTimeTo?: string | null;
}

export interface AvailabilityCheckInput {
  orderId?: string | null;
  scheduledDate?: string | null;
  scheduledDateTo?: string | null;
  scheduledTimeFrom?: string | null;
  scheduledTimeTo?: string | null;
  items?: AvailabilityItemInput[];
  employeeIds?: string[];
}

interface RequestedPeriod {
  index: number;
  equipmentId: string | null;
  from: Date | null;
  to: Date | null;
  source: "item" | "order";
  scheduledDateFrom?: string | null;
  scheduledDateTo?: string | null;
  scheduledTimeFrom?: string | null;
  scheduledTimeTo?: string | null;
  hasTimeFrom: boolean;
  hasTimeTo: boolean;
}

function isValidTimeValue(value: string | null | undefined) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function buildDateRange(
  scheduledDateFrom?: string | null,
  scheduledDateTo?: string | null,
  scheduledTimeFrom?: string | null,
  scheduledTimeTo?: string | null,
) {
  if (!scheduledDateFrom) return null;

  const endDay = scheduledDateTo || scheduledDateFrom;
  const startTime = isValidTimeValue(scheduledTimeFrom) ? scheduledTimeFrom : "00:00";
  const endTime = isValidTimeValue(scheduledTimeTo) ? scheduledTimeTo : "23:59";
  const startDate = new Date(`${scheduledDateFrom}T${startTime}:00`);
  const endDate = new Date(`${endDay}T${endTime}:00`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;

  return {
    from: startDate,
    to: endDate.getTime() >= startDate.getTime() ? endDate : startDate,
  };
}

function normalizeRequestedPeriods(input: AvailabilityCheckInput): RequestedPeriod[] {
  const items = input.items ?? [];
  if (items.length === 0) {
    const range = buildDateRange(
      input.scheduledDate,
      input.scheduledDateTo,
      input.scheduledTimeFrom,
      input.scheduledTimeTo,
    );
    return [{
      index: 0,
      equipmentId: null,
      from: range?.from ?? null,
      to: range?.to ?? null,
      source: "order",
      scheduledDateFrom: input.scheduledDate,
      scheduledDateTo: input.scheduledDateTo,
      scheduledTimeFrom: input.scheduledTimeFrom,
      scheduledTimeTo: input.scheduledTimeTo,
      hasTimeFrom: isValidTimeValue(input.scheduledTimeFrom),
      hasTimeTo: isValidTimeValue(input.scheduledTimeTo),
    }];
  }

  return items.map((item, index) => {
    const scheduleSource = item.useCustomSchedule
      ? {
          scheduledDateFrom: item.scheduledDateFrom,
          scheduledDateTo: item.scheduledDateTo,
          scheduledTimeFrom: item.scheduledTimeFrom,
          scheduledTimeTo: item.scheduledTimeTo,
        }
      : {
          scheduledDateFrom: input.scheduledDate,
          scheduledDateTo: input.scheduledDateTo,
          scheduledTimeFrom: input.scheduledTimeFrom,
          scheduledTimeTo: input.scheduledTimeTo,
        };
    const range = item.useCustomSchedule
      ? buildDateRange(
          item.scheduledDateFrom,
          item.scheduledDateTo,
          item.scheduledTimeFrom,
          item.scheduledTimeTo,
        )
      : buildDateRange(
          input.scheduledDate,
          input.scheduledDateTo,
          input.scheduledTimeFrom,
          input.scheduledTimeTo,
        );

    return {
      index,
      equipmentId: item.equipmentId || null,
      from: range?.from ?? null,
      to: range?.to ?? null,
      source: item.useCustomSchedule ? "item" : "order",
      ...scheduleSource,
      hasTimeFrom: isValidTimeValue(scheduleSource.scheduledTimeFrom),
      hasTimeTo: isValidTimeValue(scheduleSource.scheduledTimeTo),
    };
  });
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 0, 0);
  return next;
}

function localDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeInput(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function inclusiveDateSpanDays(from?: string | null, to?: string | null) {
  if (!from) return 1;
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to || from}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 1;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function formatPublicOrderNumber(orderNumber: unknown, orderId: unknown) {
  const value = orderNumber ?? orderId;
  return String(value ?? "").replace(/\D/g, "") || "0";
}

async function suggestNearestFreeSlot(
  db: Pick<typeof pool, "query">,
  period: RequestedPeriod,
  excludeOrderId?: string | null,
  employeeIds: string[] = [],
) {
  if (!period.equipmentId || !period.from || !period.to) return null;

  const isDateOnly = !period.hasTimeFrom && !period.hasTimeTo;
  const requestedDateFrom = period.scheduledDateFrom || localDateInput(period.from);
  const durationDays = inclusiveDateSpanDays(period.scheduledDateFrom, period.scheduledDateTo);
  const durationMs = Math.max(period.to.getTime() - period.from.getTime(), 60 * 60 * 1000);
  let candidateStart = isDateOnly ? startOfDay(period.from) : new Date(period.from);
  let candidateEnd = isDateOnly
    ? endOfDay(addDays(candidateStart, durationDays - 1))
    : new Date(candidateStart.getTime() + durationMs);

  const reservations = await db.query(
    `WITH employee_reservations AS (
       SELECT
         COALESCE(roi."startDate", ro."scheduledDate", wa."plannedNextStartAt", wa."assignedAt") AS "from",
         COALESCE(roi."endDate", ro."scheduledDateTo", ro."scheduledDate", wa."plannedNextStartAt", wa."assignedAt") AS "rawTo"
       FROM "WorkAssignment" wa
       INNER JOIN "RentOrder" ro ON ro."id" = wa."orderId"
       LEFT JOIN LATERAL (
         SELECT roi."startDate", roi."endDate"
         FROM "RentOrderItem" roi
         WHERE roi."rentOrderId" = wa."orderId"
           AND (wa."equipmentId" IS NULL OR roi."equipmentId" = wa."equipmentId")
         ORDER BY roi."startDate" ASC NULLS LAST, roi."id" ASC
         LIMIT 1
       ) roi ON TRUE
       WHERE cardinality($4::text[]) > 0
         AND wa."employeeId" = ANY($4::text[])
         AND ($2::text IS NULL OR wa."orderId" IS DISTINCT FROM $2)
         AND wa."status" IN ('PENDING', 'ACCEPTED')
         AND ro."status" NOT IN ('COMPLETED', 'CANCELLED')
         AND COALESCE(wa."completionStatus", 'PENDING') <> 'COMPLETED'
     ),
     reservations AS (
       SELECT bp."from", bp."to"
       FROM "BookedPeriod" bp
       LEFT JOIN "RentOrder" ro ON ro."id" = bp."rentOrderId"
       WHERE bp."equipmentId" = $1
         AND ($2::text IS NULL OR bp."rentOrderId" IS DISTINCT FROM $2)
         AND (ro."id" IS NULL OR ro."status" NOT IN ('COMPLETED', 'CANCELLED'))
       UNION ALL
       SELECT
         er."from",
         CASE
           WHEN er."rawTo" <= er."from" THEN er."from" + INTERVAL '1 day'
           ELSE er."rawTo"
         END AS "to"
       FROM employee_reservations er
       WHERE er."from" IS NOT NULL
     )
     SELECT "from", "to"
     FROM reservations
     WHERE (
       ($5::boolean = TRUE AND ("to" AT TIME ZONE 'Europe/Kyiv')::date >= $6::date)
       OR ($5::boolean = FALSE AND "to" > $3)
     )
     ORDER BY "from" ASC
     LIMIT 100`,
    [period.equipmentId, excludeOrderId || null, period.from, employeeIds, isDateOnly, requestedDateFrom],
  );

  for (const row of reservations.rows) {
    const rawBookedFrom = new Date(row.from);
    const rawBookedTo = new Date(row.to);
    const bookedFrom = isDateOnly ? startOfDay(rawBookedFrom) : rawBookedFrom;
    const bookedTo = isDateOnly ? endOfDay(rawBookedTo) : rawBookedTo;
    if (bookedFrom < candidateEnd && bookedTo > candidateStart) {
      candidateStart = isDateOnly ? startOfDay(addDays(bookedTo, 1)) : bookedTo;
      candidateEnd = isDateOnly
        ? endOfDay(addDays(candidateStart, durationDays - 1))
        : new Date(candidateStart.getTime() + durationMs);
    }
  }

  if (candidateStart.getTime() === period.from.getTime()) return null;

  return {
    type: "nearest_free_slot",
    periodIndex: period.index,
    equipmentId: period.equipmentId,
    from: candidateStart,
    to: candidateEnd,
    scheduledDate: localDateInput(candidateStart),
    scheduledDateTo: durationDays > 1 ? localDateInput(candidateEnd) : null,
    scheduledTimeFrom: period.hasTimeFrom ? localTimeInput(candidateStart) : null,
    scheduledTimeTo: period.hasTimeTo ? localTimeInput(candidateEnd) : null,
    displayWithTime: period.hasTimeFrom || period.hasTimeTo,
    message: "Найближчий вільний період для цієї техніки з такою самою тривалістю.",
  };
}

async function suggestAlternativeEquipment(
  db: Pick<typeof pool, "query">,
  period: RequestedPeriod,
  excludeOrderId?: string | null,
) {
  if (!period.equipmentId || !period.from || !period.to) return [];

  const equipmentRes = await db.query(
    `SELECT "id", "type"
     FROM "Equipment"
     WHERE "id" = $1
     LIMIT 1`,
    [period.equipmentId],
  );
  const equipment = equipmentRes.rows[0];
  if (!equipment?.type) return [];

  const alternatives = await db.query(
    `SELECT e."id", e."name", e."type"
     FROM "Equipment" e
     WHERE e."type" = $1
       AND e."id" <> $2
       AND NOT EXISTS (
         SELECT 1
         FROM "BookedPeriod" bp
         LEFT JOIN "RentOrder" ro ON ro."id" = bp."rentOrderId"
         WHERE bp."equipmentId" = e."id"
           AND ($5::text IS NULL OR bp."rentOrderId" IS DISTINCT FROM $5)
           AND (ro."id" IS NULL OR ro."status" NOT IN ('COMPLETED', 'CANCELLED'))
           AND bp."from" < $4
           AND bp."to" > $3
       )
     ORDER BY e."name" ASC
     LIMIT 3`,
    [equipment.type, period.equipmentId, period.from, period.to, excludeOrderId || null],
  );

  return alternatives.rows.map((row) => ({
    type: "alternative_equipment",
    periodIndex: period.index,
    equipmentId: row.id,
    equipmentName: row.name,
    equipmentType: row.type,
    from: period.from,
    to: period.to,
    displayWithTime: period.hasTimeFrom || period.hasTimeTo,
    message: `Альтернативна вільна техніка: ${row.name}.`,
  }));
}

export async function checkOrderAvailability(
  db: Pick<typeof pool, "query">,
  input: AvailabilityCheckInput,
) {
  const periods = normalizeRequestedPeriods(input);
  const conflicts: Array<Record<string, unknown>> = [];
  const warnings: Array<Record<string, unknown>> = [];
  const suggestions: Array<Record<string, unknown>> = [];
  const employeeIds = Array.from(new Set((input.employeeIds ?? []).filter(Boolean)));

  for (const period of periods) {
    if (!period.equipmentId) {
      warnings.push({
        type: "missing_equipment",
        severity: "warning",
        periodIndex: period.index,
        message: "Не обрано техніку для перевірки.",
      });
      continue;
    }

    if (!period.from || !period.to) {
      warnings.push({
        type: "missing_time",
        severity: "warning",
        periodIndex: period.index,
        equipmentId: period.equipmentId,
        message: "Не вказано дату виконання, тому неможливо перевірити зайнятість.",
      });
      continue;
    }

    const isDateOnly = !period.hasTimeFrom && !period.hasTimeTo;
    const periodDateFrom = period.scheduledDateFrom || localDateInput(period.from);
    const periodDateTo = period.scheduledDateTo || periodDateFrom;

    const equipmentConflicts = await db.query(
      `SELECT
         bp."id",
         bp."equipmentId",
         bp."from",
         bp."to",
         bp."note",
         bp."rentOrderId",
         e."name" AS "equipmentName",
         ro."id" AS "orderId",
         ro."orderNumber",
         ro."customerName",
         ro."status"
       FROM "BookedPeriod" bp
       LEFT JOIN "Equipment" e ON e."id" = bp."equipmentId"
       LEFT JOIN "RentOrder" ro ON ro."id" = bp."rentOrderId"
       WHERE bp."equipmentId" = $1
         AND ($4::text IS NULL OR bp."rentOrderId" IS DISTINCT FROM $4)
         AND (ro."id" IS NULL OR ro."status" NOT IN ('COMPLETED', 'CANCELLED'))
         AND (
           ($5::boolean = TRUE
             AND (bp."from" AT TIME ZONE 'Europe/Kyiv')::date <= $7::date
             AND (bp."to" AT TIME ZONE 'Europe/Kyiv')::date >= $6::date)
           OR
           ($5::boolean = FALSE AND bp."from" < $3 AND bp."to" > $2)
         )
       ORDER BY bp."from" ASC`,
      [period.equipmentId, period.from, period.to, input.orderId || null, isDateOnly, periodDateFrom, periodDateTo],
    );

    for (const row of equipmentConflicts.rows) {
      conflicts.push({
        type: "equipment",
        severity: "critical",
        periodIndex: period.index,
        equipmentId: row.equipmentId,
        equipmentName: row.equipmentName,
        orderId: row.orderId,
        orderNumber: formatPublicOrderNumber(row.orderNumber, row.orderId),
        customerName: row.customerName,
        status: row.status,
        from: row.from,
        to: row.to,
        displayWithTime: period.hasTimeFrom || period.hasTimeTo,
        message: `Техніка ${row.equipmentName ?? "—"} вже зайнята в цьому періоді.`,
      });
    }

    let periodHasConflict = equipmentConflicts.rows.length > 0;

    if (employeeIds.length > 0) {
      const employeeConflicts = await db.query(
        `WITH candidate AS (
           SELECT
             wa."id" AS "assignmentId",
             wa."employeeId",
             emp."fullName" AS "employeeName",
             wa."orderId",
             ro."orderNumber",
             ro."customerName",
             ro."status" AS "orderStatus",
             eq."name" AS "equipmentName",
             COALESCE(roi."startDate", ro."scheduledDate", wa."plannedNextStartAt", wa."assignedAt") AS "startAt",
             COALESCE(roi."endDate", ro."scheduledDateTo", ro."scheduledDate", wa."plannedNextStartAt", wa."assignedAt") AS "rawEndAt",
             latest_session."status" AS "executionStatus"
           FROM "WorkAssignment" wa
           INNER JOIN "Employee" emp ON emp."id" = wa."employeeId"
           INNER JOIN "RentOrder" ro ON ro."id" = wa."orderId"
           LEFT JOIN "Equipment" eq ON eq."id" = wa."equipmentId"
           LEFT JOIN LATERAL (
             SELECT roi."startDate", roi."endDate"
             FROM "RentOrderItem" roi
             WHERE roi."rentOrderId" = wa."orderId"
               AND (wa."equipmentId" IS NULL OR roi."equipmentId" = wa."equipmentId")
             ORDER BY roi."startDate" ASC NULLS LAST, roi."id" ASC
             LIMIT 1
           ) roi ON TRUE
           LEFT JOIN LATERAL (
             SELECT wes."status"
             FROM "WorkExecutionSession" wes
             WHERE wes."assignmentId" = wa."id"
             ORDER BY wes."createdAt" DESC
             LIMIT 1
           ) latest_session ON TRUE
           WHERE wa."employeeId" = ANY($1::text[])
             AND ($4::text IS NULL OR wa."orderId" IS DISTINCT FROM $4)
             AND wa."status" IN ('PENDING', 'ACCEPTED')
             AND ro."status" NOT IN ('COMPLETED', 'CANCELLED')
             AND COALESCE(wa."completionStatus", 'PENDING') <> 'COMPLETED'
         ),
         normalized AS (
           SELECT *,
             CASE
               WHEN "rawEndAt" <= "startAt" THEN "startAt" + INTERVAL '1 day'
               ELSE "rawEndAt"
             END AS "endAt"
           FROM candidate
         )
         SELECT *
         FROM normalized
         WHERE "executionStatus" = 'IN_PROGRESS'
            OR (
              $5::boolean = TRUE
              AND ("startAt" AT TIME ZONE 'Europe/Kyiv')::date <= $7::date
              AND ("endAt" AT TIME ZONE 'Europe/Kyiv')::date >= $6::date
            )
            OR (
              $5::boolean = FALSE
              AND "startAt" < $3
              AND "endAt" > $2
            )
         ORDER BY "startAt" ASC NULLS LAST`,
        [employeeIds, period.from, period.to, input.orderId || null, isDateOnly, periodDateFrom, periodDateTo],
      );

      if (employeeConflicts.rows.length > 0) {
        periodHasConflict = true;
      }

      for (const row of employeeConflicts.rows) {
        conflicts.push({
          type: "employee",
          severity: row.executionStatus === "IN_PROGRESS" ? "critical" : "warning",
          periodIndex: period.index,
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          orderId: row.orderId,
          orderNumber: formatPublicOrderNumber(row.orderNumber, row.orderId),
          customerName: row.customerName,
          status: row.orderStatus,
          equipmentName: row.equipmentName,
          from: row.startAt,
          to: row.endAt,
          displayWithTime: period.hasTimeFrom || period.hasTimeTo,
          executionStatus: row.executionStatus,
          message:
            row.executionStatus === "IN_PROGRESS"
              ? `Працівник ${row.employeeName ?? "—"} зараз виконує інше завдання.`
              : `Працівник ${row.employeeName ?? "—"} має інше завдання в цей період.`,
        });
      }
    }

    if (periodHasConflict) {
      const [nearestSlot, alternatives] = await Promise.all([
        suggestNearestFreeSlot(db, period, input.orderId, employeeIds),
        equipmentConflicts.rows.length > 0 ? suggestAlternativeEquipment(db, period, input.orderId) : Promise.resolve([]),
      ]);
      if (nearestSlot) suggestions.push(nearestSlot);
      suggestions.push(...alternatives);
    }
  }

  const hasMissingData = warnings.some((warning) => warning.type === "missing_time" || warning.type === "missing_equipment");
  const status: AvailabilityStatus = conflicts.some((conflict) => conflict.type === "equipment")
    ? "conflict"
    : conflicts.length > 0
      ? "warning"
      : hasMissingData
        ? "insufficient"
        : "available";

  return {
    status,
    checkedPeriods: periods.map((period) => ({
      periodIndex: period.index,
      equipmentId: period.equipmentId,
      from: period.from,
      to: period.to,
      source: period.source,
    })),
    conflicts,
    warnings,
    suggestions,
  };
}
