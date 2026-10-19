import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: "m1" }, error: null })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  })),
}));

vi.mock("@/lib/mando/guardian", () => ({
  guardianMando: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/mando/motor-token", () => ({
  crearTokenMotor: vi.fn(() => ({ token: "ssm_abc", hash: "h", huella: "h1" })),
}));

describe("genesis contenedores", () => {
  beforeEach(() => {
    process.env.STARSEED_MANDO_TODOS = "1";
  });

  it("GET sin ámbito devuelve 400", async () => {
    const { GET } = await import("../route");
    const req = new Request("http://localhost/api/genesis/contenedores");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("POST sin cuerpo crea código", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/genesis/contenedores?ambito=a1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.codigo).toBeTypeOf("string");
    expect(json.expiraEn).toBeTypeOf("string");
  });
});
