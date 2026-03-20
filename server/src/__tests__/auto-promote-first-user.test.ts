import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { actorMiddleware } from "../middleware/auth.js";

/**
 * Tests for auto-promoting the first authenticated user to instance_admin
 * when instance_user_roles is empty (fresh Paperclip instance).
 */

// Mock db builder — tracks calls and returns configurable results
function createMockDb(opts: {
  userIsAdmin?: boolean;
  anyAdminExists?: boolean;
  memberships?: Array<{ companyId: string }>;
}) {
  const insertedValues: Array<Record<string, unknown>> = [];
  const selectCalls: string[] = [];

  // Chain builder that records .from() table name and resolves
  function chainBuilder(resolveWith: unknown) {
    const chain: Record<string, any> = {};
    chain.select = () => chain;
    chain.from = (table: any) => {
      selectCalls.push(table?.name ?? String(table));
      return chain;
    };
    chain.where = () => chain;
    chain.limit = () => chain;
    chain.then = (fn: (rows: any[]) => any) => {
      if (Array.isArray(resolveWith)) return Promise.resolve(fn(resolveWith));
      return Promise.resolve(fn(resolveWith ? [resolveWith] : []));
    };
    return chain;
  }

  // Build a mock db where:
  //  - First select (instanceUserRoles for this user) → roleRow or null
  //  - Second select (companyMemberships) → memberships
  //  - Third select (instanceUserRoles any admin) → anyAdmin or null
  //  - insert → records the values
  let selectCallCount = 0;
  const mockDb = {
    select: (cols?: any) => {
      selectCallCount++;
      const callNum = selectCallCount;
      const chain: Record<string, any> = {};
      chain.from = (table: any) => {
        const tableName = table?.name ?? String(table);
        selectCalls.push(tableName);
        return chain;
      };
      chain.where = () => chain;
      chain.limit = () => chain;
      chain.then = (fn: (rows: any[]) => any) => {
        if (callNum === 1) {
          // instanceUserRoles check for this user
          return Promise.resolve(fn(opts.userIsAdmin ? [{ id: "role-1" }] : []));
        } else if (callNum === 2) {
          // companyMemberships
          return Promise.resolve(fn(opts.memberships ?? []));
        } else if (callNum === 3) {
          // instanceUserRoles any admin check
          return Promise.resolve(fn(opts.anyAdminExists ? [{ id: "admin-1" }] : []));
        }
        return Promise.resolve(fn([]));
      };
      return chain;
    },
    insert: (table: any) => ({
      values: (vals: Record<string, unknown>) => {
        insertedValues.push(vals);
        return Promise.resolve();
      },
    }),
  };

  return { db: mockDb as any, insertedValues, selectCalls };
}

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    header: () => undefined,
    headers: {},
    actor: { type: "none", source: "none" },
    ...overrides,
  } as unknown as Request;
}

describe("actorMiddleware auto-promote first user", () => {
  const mockSession = {
    session: { id: "sess-1", userId: "user-1" },
    user: { id: "user-1", email: "first@example.com", name: "First User" },
  };

  it("auto-promotes first user when instance_user_roles is empty", async () => {
    const { db, insertedValues } = createMockDb({
      userIsAdmin: false,
      anyAdminExists: false,
      memberships: [],
    });

    const middleware = actorMiddleware(db, {
      deploymentMode: "authenticated",
      resolveSession: async () => mockSession,
    });

    const req = createMockRequest();
    const res = {} as Response;
    const next = vi.fn() as unknown as NextFunction;

    await (middleware as any)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.actor.type).toBe("board");
    expect(req.actor.isInstanceAdmin).toBe(true);
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({
      userId: "user-1",
      role: "instance_admin",
    });
  });

  it("does not auto-promote when another admin already exists", async () => {
    const { db, insertedValues } = createMockDb({
      userIsAdmin: false,
      anyAdminExists: true,
      memberships: [],
    });

    const middleware = actorMiddleware(db, {
      deploymentMode: "authenticated",
      resolveSession: async () => mockSession,
    });

    const req = createMockRequest();
    const res = {} as Response;
    const next = vi.fn() as unknown as NextFunction;

    await (middleware as any)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.actor.type).toBe("board");
    expect(req.actor.isInstanceAdmin).toBe(false);
    expect(insertedValues).toHaveLength(0);
  });

  it("skips auto-promote when user is already admin", async () => {
    const { db, insertedValues } = createMockDb({
      userIsAdmin: true,
      anyAdminExists: true,
      memberships: [{ companyId: "company-1" }],
    });

    const middleware = actorMiddleware(db, {
      deploymentMode: "authenticated",
      resolveSession: async () => mockSession,
    });

    const req = createMockRequest();
    const res = {} as Response;
    const next = vi.fn() as unknown as NextFunction;

    await (middleware as any)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.actor.isInstanceAdmin).toBe(true);
    expect(insertedValues).toHaveLength(0);
  });

  it("does not auto-promote in local_trusted mode", async () => {
    const { db, insertedValues } = createMockDb({
      userIsAdmin: false,
      anyAdminExists: false,
    });

    const middleware = actorMiddleware(db, {
      deploymentMode: "local_trusted",
    });

    const req = createMockRequest();
    const res = {} as Response;
    const next = vi.fn() as unknown as NextFunction;

    await (middleware as any)(req, res, next);

    expect(next).toHaveBeenCalled();
    // local_trusted always gets isInstanceAdmin: true via local_implicit
    expect(req.actor.isInstanceAdmin).toBe(true);
    expect(insertedValues).toHaveLength(0);
  });

  it("does not auto-promote when no session is resolved", async () => {
    const { db, insertedValues } = createMockDb({
      userIsAdmin: false,
      anyAdminExists: false,
    });

    const middleware = actorMiddleware(db, {
      deploymentMode: "authenticated",
      resolveSession: async () => null,
    });

    const req = createMockRequest();
    const res = {} as Response;
    const next = vi.fn() as unknown as NextFunction;

    await (middleware as any)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.actor.type).toBe("none");
    expect(insertedValues).toHaveLength(0);
  });
});
