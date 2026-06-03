import { Router } from "express";
import { z } from "zod";
import { authMiddleware, requireAdminRole, type AuthRequest } from "../middleware/auth.js";
import { pool } from "../lib/db.js";
import { logError } from "../lib/logger.js";
import { validate } from "../middleware/validate.js";

export const adminEmployeesRouter = Router();

adminEmployeesRouter.use(authMiddleware);

adminEmployeesRouter.get("/", async (req: AuthRequest, res) => {
  try {
    const canManageAdmins = req.adminRole === "ADMIN";
    const [employeesRes, candidatesRes, adminsRes] = await Promise.all([
      pool.query(
        `SELECT
           "id",
           "fullName",
           "role",
           "phone",
           "telegramChatId",
	           "telegramUserId",
	           "isActive",
	           "notes",
	           (
	             SELECT COUNT(*)::int
	             FROM "WorkAssignment" wa
	             WHERE wa."employeeId" = "Employee"."id"
	           ) AS "assignmentCount",
	           "createdAt",
	           "updatedAt"
         FROM "Employee"
         ORDER BY "createdAt" DESC`,
      ),
      pool.query(
        `SELECT
           etc."id",
           etc."telegramUserId",
           etc."telegramChatId",
           etc."username",
           etc."firstName",
           etc."lastName",
           etc."languageCode",
           etc."status",
           etc."employeeId",
           etc."adminId",
           etc."startedAt",
           etc."approvedAt",
           etc."notes",
           json_build_object(
             'id', e."id",
             'fullName', e."fullName",
             'role', e."role"
           ) AS employee,
           json_build_object(
             'id', a."id",
             'email', a."email",
             'role', a."role",
             'telegramUsername', a."telegramUsername"
           ) AS admin
         FROM "EmployeeTelegramCandidate" etc
         LEFT JOIN "Employee" e ON e."id" = etc."employeeId"
         LEFT JOIN "Admin" a ON a."id" = etc."adminId"
         ORDER BY etc."startedAt" DESC`,
      ),
      canManageAdmins
        ? pool.query(
            `SELECT "id", "email", "role", "telegramChatId", "telegramUserId", "telegramUsername"
             FROM "Admin"
             ORDER BY "email" ASC`,
          )
        : Promise.resolve({ rows: [] }),
    ]);

    res.json({
      employees: employeesRes.rows,
      candidates: candidatesRes.rows.map((row) => ({
        ...row,
        employee: row.employee?.id ? row.employee : null,
        admin: row.admin?.id ? row.admin : null,
      })),
      admins: adminsRes.rows,
    });
  } catch (error) {
    logError("GET /api/admin/employees error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(1, "Ім'я обов'язкове"),
  role: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().trim().optional(),
});

adminEmployeesRouter.post("/", validate(createEmployeeSchema), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO "Employee" ("fullName", "role", "phone", "notes", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [
        req.body.fullName,
        req.body.role || null,
        req.body.phone || null,
        req.body.notes || null,
      ],
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    logError("POST /api/admin/employees error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminEmployeesRouter.patch("/:id", validate(createEmployeeSchema), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE "Employee"
       SET "fullName" = $1,
           "role" = $2,
           "phone" = $3,
           "isActive" = COALESCE($4, "isActive"),
           "notes" = $5,
           "updatedAt" = NOW()
       WHERE "id" = $6
       RETURNING *`,
      [
        req.body.fullName,
        req.body.role || null,
        req.body.phone || null,
        req.body.isActive,
        req.body.notes || null,
        req.params.id,
      ],
    );

    if (!rows[0]) {
      res.status(404).json({ error: "Працівника не знайдено" });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    logError("PATCH /api/admin/employees/:id error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminEmployeesRouter.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const employeeRes = await client.query(
      `SELECT "id"
       FROM "Employee"
       WHERE "id" = $1
       LIMIT 1`,
      [req.params.id],
    );

    if (!employeeRes.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Працівника не знайдено" });
      return;
    }

    const assignmentRes = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM "WorkAssignment"
       WHERE "employeeId" = $1`,
      [req.params.id],
    );

    if (Number(assignmentRes.rows[0]?.count ?? 0) > 0) {
      await client.query("ROLLBACK");
      res.status(400).json({
        error: "Працівника не можна видалити, бо він уже має призначення в замовленнях. Зробіть його неактивним.",
      });
      return;
    }

    await client.query(
      `UPDATE "EmployeeTelegramCandidate"
       SET "status" = 'REJECTED',
           "employeeId" = NULL,
           "updatedAt" = NOW()
       WHERE "employeeId" = $1`,
      [req.params.id],
    );

    await client.query(`DELETE FROM "Employee" WHERE "id" = $1`, [req.params.id]);
    await client.query("COMMIT");
    res.json({ status: "ok" });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("DELETE /api/admin/employees/:id error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

const approveCandidateSchema = z.object({
  candidateId: z.string().min(1),
  fullName: z.string().trim().min(1, "Ім'я обов'язкове"),
  role: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

adminEmployeesRouter.post(
  "/approve-candidate",
  validate(approveCandidateSchema),
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const candidateRes = await client.query(
        `SELECT * FROM "EmployeeTelegramCandidate" WHERE "id" = $1 LIMIT 1`,
        [req.body.candidateId],
      );

      const candidate = candidateRes.rows[0];
      if (!candidate) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Кандидата не знайдено" });
        return;
      }

      const existingEmployeeRes = await client.query(
        `SELECT "id"
         FROM "Employee"
         WHERE "telegramUserId" = $1
         LIMIT 1`,
        [candidate.telegramUserId],
      );

      const employeeRes =
        existingEmployeeRes.rows[0]
          ? await client.query(
              `UPDATE "Employee"
               SET "fullName" = $1,
                   "role" = $2,
                   "phone" = $3,
                   "telegramChatId" = $4,
                   "telegramUserId" = $5,
                   "notes" = $6,
                   "updatedAt" = NOW()
               WHERE "id" = $7
               RETURNING *`,
              [
                req.body.fullName,
                req.body.role || null,
                req.body.phone || null,
                candidate.telegramChatId,
                candidate.telegramUserId,
                req.body.notes || null,
                existingEmployeeRes.rows[0].id,
              ],
            )
          : await client.query(
              `INSERT INTO "Employee" (
                 "fullName",
                 "role",
                 "phone",
                 "telegramChatId",
                 "telegramUserId",
                 "notes",
                 "updatedAt"
               )
               VALUES ($1, $2, $3, $4, $5, $6, NOW())
               RETURNING *`,
              [
                req.body.fullName,
                req.body.role || null,
                req.body.phone || null,
                candidate.telegramChatId,
                candidate.telegramUserId,
                req.body.notes || null,
              ],
            );

      const employee = employeeRes.rows[0];

      await client.query(
        `UPDATE "EmployeeTelegramCandidate"
         SET "status" = 'APPROVED',
             "employeeId" = $1,
             "approvedAt" = NOW(),
             "updatedAt" = NOW(),
             "notes" = COALESCE($2, "notes")
         WHERE "id" = $3`,
        [employee.id, req.body.notes || null, req.body.candidateId],
      );

      await client.query("COMMIT");
      res.json({ employeeId: employee.id, employee });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      logError("POST /api/admin/employees/approve-candidate error:", error);
      res.status(500).json({ error: "Помилка сервера" });
    } finally {
      client.release();
    }
  },
);

const linkAdminCandidateSchema = z.object({
  adminId: z.string().min(1),
});

adminEmployeesRouter.post(
  "/candidates/:id/link-admin",
  requireAdminRole,
  validate(linkAdminCandidateSchema),
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const candidateRes = await client.query(
        `SELECT *
         FROM "EmployeeTelegramCandidate"
         WHERE "id" = $1
         LIMIT 1`,
        [req.params.id],
      );
      const candidate = candidateRes.rows[0];
      if (!candidate) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Кандидата не знайдено" });
        return;
      }

      const adminRes = await client.query(
        `SELECT "id"
         FROM "Admin"
         WHERE "id" = $1
         LIMIT 1`,
        [req.body.adminId],
      );
      if (!adminRes.rows[0]) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Адміна не знайдено" });
        return;
      }

      await client.query(
        `UPDATE "Admin"
         SET "telegramChatId" = $1,
             "telegramUserId" = $2,
             "telegramUsername" = $3
         WHERE "id" = $4`,
        [
          candidate.telegramChatId,
          candidate.telegramUserId,
          candidate.username || null,
          req.body.adminId,
        ],
      );

      const { rows } = await client.query(
        `UPDATE "EmployeeTelegramCandidate"
         SET "adminId" = $1,
             "status" = CASE
               WHEN "employeeId" IS NULL THEN 'LINKED'
               ELSE "status"
             END,
             "approvedAt" = COALESCE("approvedAt", NOW()),
             "updatedAt" = NOW()
         WHERE "id" = $2
         RETURNING *`,
        [req.body.adminId, req.params.id],
      );

      await client.query("COMMIT");
      res.json(rows[0]);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }

      const code = typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
      if (code === "23505") {
        res.status(409).json({ error: "Цей Telegram акаунт вже прив’язано до іншого адміна" });
        return;
      }

      logError("POST /api/admin/employees/candidates/:id/link-admin error:", error);
      res.status(500).json({ error: "Помилка сервера" });
    } finally {
      client.release();
    }
  },
);

const candidateStatusSchema = z.object({
  status: z.enum(["PENDING", "REJECTED"]),
  notes: z.string().trim().optional(),
});

adminEmployeesRouter.patch(
  "/candidates/:id",
  validate(candidateStatusSchema),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `UPDATE "EmployeeTelegramCandidate"
         SET "status" = $1,
             "notes" = COALESCE($2, "notes"),
             "updatedAt" = NOW()
         WHERE "id" = $3
         RETURNING *`,
        [req.body.status, req.body.notes || null, req.params.id],
      );

      if (!rows[0]) {
        res.status(404).json({ error: "Кандидата не знайдено" });
        return;
      }

      res.json(rows[0]);
    } catch (error) {
      logError("PATCH /api/admin/employees/candidates/:id error:", error);
      res.status(500).json({ error: "Помилка сервера" });
    }
  },
);

adminEmployeesRouter.delete("/candidates/:id", async (req, res) => {
  try {
    const candidateRes = await pool.query(
      `SELECT "id", "status", "employeeId"
       FROM "EmployeeTelegramCandidate"
       WHERE "id" = $1
       LIMIT 1`,
      [req.params.id],
    );

    const candidate = candidateRes.rows[0];
    if (!candidate) {
      res.status(404).json({ error: "Кандидата не знайдено" });
      return;
    }

    if (candidate.status !== "REJECTED") {
      res.status(400).json({ error: "Видаляти можна лише відхилених кандидатів" });
      return;
    }

    if (candidate.employeeId) {
      res.status(400).json({ error: "Не можна видалити кандидата, прив’язаного до працівника" });
      return;
    }

    await pool.query(`DELETE FROM "EmployeeTelegramCandidate" WHERE "id" = $1`, [req.params.id]);
    res.json({ status: "ok" });
  } catch (error) {
    logError("DELETE /api/admin/employees/candidates/:id error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
