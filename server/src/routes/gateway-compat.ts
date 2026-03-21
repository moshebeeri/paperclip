import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  agentService,
  approvalService,
  issueService,
  secretService,
} from "../services/index.js";
import { assertCompanyAccess } from "./authz.js";

/**
 * Gateway-compatible flat endpoints.
 *
 * The dashboard calls `/api/v1/<resource>?org_id=<companyId>`.
 * The gateway strips the `/v1` prefix when proxying, so these are
 * mounted at `/api` and match paths like `/credentials`, `/approvals`,
 * `/fleet-status`, and `/tasks`.
 *
 * All return `[]` or `{}` if no data exists — never 500.
 */
export function gatewayCompatRoutes(db: Db) {
  const router = Router();
  const approvalsSvc = approvalService(db);
  const secretsSvc = secretService(db);
  const agentsSvc = agentService(db);
  const issueSvc = issueService(db);

  // ── GET /credentials?org_id= ──────────────────────────────────────
  router.get("/credentials", async (req, res) => {
    const orgId = req.query.org_id as string | undefined;
    if (!orgId) {
      res.json([]);
      return;
    }
    assertCompanyAccess(req, orgId);
    const secrets = await secretsSvc.list(orgId);
    res.json(
      secrets.map((s) => ({
        id: s.id,
        name: s.name,
        provider: s.provider,
        description: s.description,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    );
  });

  // ── GET /approvals?org_id= ────────────────────────────────────────
  router.get("/approvals", async (req, res) => {
    const orgId = req.query.org_id as string | undefined;
    if (!orgId) {
      res.json([]);
      return;
    }
    assertCompanyAccess(req, orgId);
    const status = req.query.status as string | undefined;
    const result = await approvalsSvc.list(orgId, status);
    res.json(result);
  });

  // ── GET /fleet-status?org_id= ─────────────────────────────────────
  router.get("/fleet-status", async (req, res) => {
    const orgId = req.query.org_id as string | undefined;
    if (!orgId) {
      res.json({ agents: [], summary: { total: 0, active: 0, idle: 0, error: 0 } });
      return;
    }
    assertCompanyAccess(req, orgId);
    const agents = await agentsSvc.list(orgId);

    const summary = { total: 0, active: 0, idle: 0, error: 0, paused: 0, running: 0 };
    for (const agent of agents) {
      summary.total++;
      const status = (agent as { status?: string }).status ?? "idle";
      if (status === "active" || status === "running") summary.active++;
      else if (status === "idle") summary.idle++;
      else if (status === "error") summary.error++;
      else if (status === "paused") summary.paused++;
    }

    res.json({
      agents: agents.map((a: Record<string, unknown>) => ({
        id: a.id,
        name: a.name,
        nameKey: a.nameKey,
        role: a.role,
        status: a.status,
        adapter: a.adapter,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
      summary,
    });
  });

  return router;
}
