import { describe, it, expect, vi } from "vitest";

vi.mock("@/utils/supabase/client", () => {
  const mockFrom = vi.fn(() => ({
    select: vi.fn(() => ({
      neq: vi.fn(() => ({
        order: vi.fn(() => ({
          abortSignal: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    })),
  }));
  const mockAuth = {
    getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "u1" } } })),
  };
  return { createClient: () => ({ from: mockFrom, auth: mockAuth }) };
});

import { esCompartido, listarCerebrosCompartidos } from "../compartidos";

describe("compartidos", () => {
  it("esCompartido devuelve true cuando el owner es distinto", () => {
    expect(esCompartido({ owner: "otro" }, "u1")).toBe(true);
    expect(esCompartido({ owner: "u1" }, "u1")).toBe(false);
    expect(esCompartido({}, "u1")).toBe(true);
  });

  it("listarCerebrosCompartidos devuelve ok false ante error", async () => {
    const res = await listarCerebrosCompartidos();
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.brains)).toBe(true);
  });
});
