import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { issueService } from "../services/index.js";
import { assertCompanyAccess } from "./authz.js";

/**
 * Tasks route — presents issues as "tasks" for the Task Board dashboard page.
 * Supports both `/companies/:companyId/tasks` and `/tasks?org_id=<companyId>`.
 */
export function taskRoutes(db: Db) {
  const router = Router();
  const issueSvc = issueService(db);

  async function handleTaskList(companyId: string, query: Record<string, unknown>) {
    const status = query.status as string | undefined;
    const assigneeAgentId = query.assignee_agent_id as string | undefined;
    const projectId = query.project_id as string | undefined;

    const issues = await issueSvc.list(companyId, {
      status,
      assigneeAgentId,
      projectId,
    });

    return issues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      description: issue.description,
      status: issue.status,
      priority: issue.priority,
      phase: issue.status,
      assignee: issue.assigneeAgentId ?? issue.assigneeUserId ?? null,
      assigneeAgentId: issue.assigneeAgentId,
      assigneeUserId: issue.assigneeUserId,
      projectId: issue.projectId,
      identifier: issue.identifier,
      labels: issue.labels,
      startedAt: issue.startedAt,
      completedAt: issue.completedAt,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    }));
  }

  // GET /tasks?org_id=<companyId>
  router.get("/tasks", async (req, res) => {
    const orgId = req.query.org_id as string | undefined;
    if (!orgId) {
      res.json([]);
      return;
    }
    assertCompanyAccess(req, orgId);
    const tasks = await handleTaskList(orgId, req.query as Record<string, unknown>);
    res.json(tasks);
  });

  // GET /companies/:companyId/tasks
  router.get("/companies/:companyId/tasks", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const tasks = await handleTaskList(companyId, req.query as Record<string, unknown>);
    res.json(tasks);
  });

  return router;
}
