import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { actorMiddleware } from "../middleware/auth.js";

/**
 * Tests for auto-promoting the first authenticated user to instance_admin
 * when instance_user_roles has no real admin (fresh Paperclip instance).
 */

function createMockDb(opts: {
  userIsAdmin?: boolean;
  existingAdmins?: Array<{ userId: string }>;
  memberships?: Array<{ companyId: string }>;
}) {
  const insertedValues: Array<Record<string, unknown>> = [];

  // Track select call count to return different results per call
  let selectCallCount = 0;
  const mockDb = {
    select: (cols?: any) => {
      selectCallCount++;
      const callNum = selectCallCount;
      const chain: Record<string, any> = {};
      chain.from = () => chain;
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
          // instanceUserRoles all admins query (no .then — returns array directly)
          return Promise.resolve(fn(opts.existingAdmins ?? []));
        }
        return Promise.resolve(fn([]));
      };
      // For the allAdmins query which doesn't use .then() chaining
      chain[Symbol.iterator] = undefined;
      return chain;
    },
    insert: (table: any) => ({
      values: (vals: Record<string, unknown>) => {
        insertedValues.push(vals);
        return Promise.resolve();
      },
    }),
  };

  return { db: mockDb as any, insertedValues };
}

function createMockRequest(): Request {
  return {
    header: () => undefined,
    headers: {},
    actor: { type: "none", source: "none" },
  } as unknown as Request;
}

describe("actorMiddleware auto-promote first user", () => {
  const mockSession = {
    session: { id: "sess-1", userId: "user-1" },
    user: { id: "user-1", email: "first@example.com", name: "First User" },
  };

  it("auto-promotes first user when no real admin exists", async () => {
    const { db, insertedValues } = createMockDb({
      userIsAdmin: false,
      existingAdmins: [],
      memberships: [],
    });

    const middleware = actorMiddleware(db, {
      deploymentMode: "authenticated",
      resolveSession: async () => mockSession,
    });

    const req = createMockRequest();
    const next = vi.fn() as unknown as NextFunction;

    await (middleware as any)(req, {} as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.actor.type).toBe("board");
    expect(req.actor.isInstanceAdmin).toBe(true);
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({
      userId: "user-1",
      role: "instance_admin",
    });
  });

  it("auto-promotes when only local-board admin exists", async () => {
    const { db, insertedValues } = createMockDb({
      userIsAdmin: false,
      existingAdmins: [{ userId: "local-board" }],
      memberships: [],
    });

    const middleware = actorMiddleware(db, {
      deploymentMode: "authenticated",
      resolveSession: async () => mockSession,
    });

    const req = createMockRequest();
    const next = vi.fn() as unknown as NextFunction;

    await (middleware as any)(req, {} as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.actor.isInstanceAdmin).toBe(true);
    expect(insertedValues).toHaveLength(1);
  });

  it("does not auto-promote when a real admin already exists", async () => {
    const { db, insertedValues } = createMockDb({
      userIsAdmin: false,
      existingAdmins: [{ userId: "other-admin" }],
      memberships: [],
    });

    const middleware = actorMiddleware(db, {
      deploymentMode: "authenticated",
      resolveSession: async () => mockSession,
    });

    const req = createMockRequest();
    const next = vi.fn() as unknown as NextFunction;

    await (middleware as any)(req, {} as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.actor.isInstanceAdmin).toBe(false);
    expect(insertedValues).toHaveLength(0);
  });

  it("skips auto-promote when user is already admin", async () => {
    const { db, insertedValues } = createMockDb({
      userIsAdmin: true,
      memberships: [{ companyId: "company-1" }],
    });

    const middleware = actorMiddleware(db, {
      deploymentMode: "authenticated",
      resolveSession: async () => mockSession,
    });

    const req = createMockRequest();
    const next = vi.fn() as unknown as NextFunction;

    await (middleware as any)(req, {} as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.actor.isInstanceAdmin).toBe(true);
    expect(insertedValues).toHaveLength(0);
  });

  it("does not auto-promote in local_trusted mode", async () => {
    const { db, insertedValues } = createMockDb({
      userIsAdmin: false,
      existingAdmins: [],
    });

    const middleware = actorMiddleware(db, {
      deploymentMode: "local_trusted",
    });

    const req = createMockRequest();
    const next = vi.fn() as unknown as NextFunction;

    await (middleware as any)(req, {} as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.actor.isInstanceAdmin).toBe(true);
    expect(insertedValues).toHaveLength(0);
  });

  it("handles race condition when concurrent insert fails", async () => {
    // Simulate: insert throws (duplicate key), but re-check finds the role
    let selectCallCount = 0;
    const mockDb = {
      select: (cols?: any) => {
        selectCallCount++;
        const callNum = selectCallCount;
        const chain: Record<string, any> = {};
        chain.from = () => chain;
        chain.where = () => chain;
        chain.limit = () => chain;
        chain.then = (fn: (rows: any[]) => any) => {
          if (callNum === 1) return Promise.resolve(fn([])); // no admin role
          if (callNum === 2) return Promise.resolve(fn([])); // no memberships
          if (callNum === 3) return Promise.resolve(fn([])); // no existing admins
          if (callNum === 4) return Promise.resolve(fn([{ id: "race-winner" }])); // re-check finds it
          return Promise.resolve(fn([]));
        };
        chain[Symbol.iterator] = undefined;
        return chain;
      },
      insert: () => ({
        values: () => Promise.reject(new Error("duplicate key")),
      }),
    };

    const middleware = actorMiddleware(mockDb as any, {
      deploymentMode: "authenticated",
      resolveSession: async () => mockSession,
    });

    const req = createMockRequest();
    const next = vi.fn() as unknown as NextFunction;

    await (middleware as any)(req, {} as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.actor.isInstanceAdmin).toBe(true);
  });

  it("does not auto-promote when no session is resolved", async () => {
    const { db, insertedValues } = createMockDb({
      userIsAdmin: false,
      existingAdmins: [],
    });

    const middleware = actorMiddleware(db, {
      deploymentMode: "authenticated",
      resolveSession: async () => null,
    });

    const req = createMockRequest();
    const next = vi.fn() as unknown as NextFunction;

    await (middleware as any)(req, {} as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.actor.type).toBe("none");
    expect(insertedValues).toHaveLength(0);
  });
});
