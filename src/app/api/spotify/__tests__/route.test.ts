import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ allowed: true, limit: 20, remaining: 19, retryAfterMs: 0, retryAfterSec: 0 })),
}));

let usuarioSesion: { id: string } | null = { id: "user-1" };

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: usuarioSesion }, error: null })),
    },
  })),
}));

function fakeRequest(body: Record<string, unknown>, method = "POST"): NextRequest {
  return new NextRequest("http://localhost/api/spotify", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/spotify · OAuth y estado de cuenta", () => {
  const entorno = { ...process.env };

  beforeEach(() => {
    usuarioSesion = { id: "user-1" };
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
  });

  afterEach(() => {
    process.env = { ...entorno };
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe("POST - canjear código", () => {
    it("devuelve error si faltan parámetros", async () => {
      const { POST } = await import("../route");
      const r = await POST(new NextRequest("http://localhost:9002/api/spotify", {
        method: "POST",
        body: JSON.stringify({ code: "test-code" }),
        headers: { "Content-Type": "application/json" },
      }));
      const j = (await r.json()) as { error?: string };
      expect(r.status).toBe(400);
      expect(j.error).toBe("code, verifier y redirectUri requeridos");
    });

    it("devuelve error si faltan credenciales en el servidor", async () => {
      const { POST } = await import("../route");
      delete process.env.SPOTIFY_CLIENT_ID;
      delete process.env.SPOTIFY_CLIENT_SECRET;

      const r = await POST(new NextRequest("http://localhost:9002/api/spotify", {
        method: "POST",
        body: JSON.stringify({ code: "test-code", verifier: "verifier", redirectUri: "http://localhost:9002/auth/callback" }),
        headers: { "Content-Type": "application/json" },
      }));
      const j = (await r.json()) as { error?: string };
      expect(r.status).toBe(500);
      expect(j.error).toBe("Faltan credenciales Spotify en el servidor.");
    });

    it("canjea con éxito y devuelve tokens", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            expires_in: 3600,
          }), { status: 200 })
        ) as typeof fetch
      );

      const { POST } = await import("../route");
      const r = await POST(new NextRequest("http://localhost:9002/api/spotify", {
        method: "POST",
        body: JSON.stringify({ code: "test-code", verifier: "verifier", redirectUri: "http://localhost:9002/auth/callback" }),
        headers: { "Content-Type": "application/json" },
      }));

      const j = (await r.json()) as {
        ok?: boolean;
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error?: string;
      };

      expect(r.status).toBe(200);
      expect(j.ok).toBe(true);
      expect(j.access_token).toBe("new-access-token");
      expect(j.refresh_token).toBe("new-refresh-token");
      expect(j.expires_in).toBe(3600);
    });

    it("maneja error del proveedor", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({
            error: "invalid_grant",
            error_description: "Código inválido",
          }), { status: 400, headers: { "Content-Type": "application/json" } })
        ) as typeof fetch
      );

      const { POST } = await import("../route");
      const r = await POST(new NextRequest("http://localhost:9002/api/spotify", {
        method: "POST",
        body: JSON.stringify({ code: "bad-code", verifier: "verifier", redirectUri: "http://localhost:9002/auth/callback" }),
        headers: { "Content-Type": "application/json" },
      }));

      const j = (await r.json()) as { error?: string };
      expect(r.status).toBe(400);
      expect(j.error).toBe("Código inválido");
    });
  });

  describe("GET - estado de usuario y verificación de premium", () => {
    it("devuelve error si no hay access_token", async () => {
      const { GET } = await import("../route");
      const r = await GET(new NextRequest("http://localhost:9002/api/spotify"));
      const j = (await r.json()) as { error?: string };
      expect(r.status).toBe(400);
      expect(j.error).toBe("access_token requerido");
    });

    it("devuelve error si el token es inválido", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status: 401 })) as typeof fetch
      );

      const { GET } = await import("../route");
      const r = await GET(new NextRequest("http://localhost:9002/api/spotify?access_token=invalid-token"));
      const j = (await r.json()) as { error?: string };
      expect(r.status).toBe(401);
      expect(j.error).toBe("Token inválido o expirado");
    });

    it("devuelve datos del usuario si el token es válido", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({
            id: "spotify-user-123",
            display_name: "Usuario Spotify",
            product: "premium",
            country: "ES",
          }), { status: 200 })
        ) as typeof fetch
      );

      const { GET } = await import("../route");
      const r = await GET(new NextRequest("http://localhost:9002/api/spotify?access_token=test-token"));
      const j = (await r.json()) as {
        ok?: boolean;
        usuario?: {
          id: string;
          nombre: string;
          premium: boolean;
          pais: string;
        };
        error?: string;
      };

      expect(r.status).toBe(200);
      expect(j.ok).toBe(true);
      expect(j.usuario).toMatchObject({
        id: "spotify-user-123",
        nombre: "Usuario Spotify",
        premium: true,
        pais: "ES",
      });
    });

    it("indica si el usuario es premium o no", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({
            id: "user-456",
            display_name: "Usuario Free",
            product: "free",
            country: "MX",
          }), { status: 200 })
        ) as typeof fetch
      );

      const { GET } = await import("../route");
      const r = await GET(new NextRequest("http://localhost:9002/api/spotify?access_token=test-token"));
      const j = (await r.json()) as {
        ok?: boolean;
        usuario?: { premium: boolean };
      };

      expect(j.usuario?.premium).toBe(false);
    });
  });

  describe("POST - dispositivos y control de reproducción (Premium requerido)", () => {
    it("devuelve error 401 si falta token de acceso", async () => {
      const { POST } = await import("../route");
      const r = await POST(new NextRequest("http://localhost:9002/api/spotify", {
        method: "POST",
        body: JSON.stringify({ accion: "dispositivos" }),
        headers: { "Content-Type": "application/json" },
      }));
      expect(r.status).toBe(401);
    });

    it("lista dispositivos con éxito", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({
            devices: [{ id: "dev-1", name: "Bocina Sala", type: "Speaker", is_active: true }]
          }), { status: 200, headers: { "Content-Type": "application/json" } })
        ) as typeof fetch
      );

      const { POST } = await import("../route");
      const r = await POST(new NextRequest("http://localhost:9002/api/spotify", {
        method: "POST",
        body: JSON.stringify({ accion: "dispositivos" }),
        headers: { "Content-Type": "application/json", "x-spotify-token": "valid-token" },
      }));

      const j = (await r.json()) as { devices?: unknown[] };
      expect(r.status).toBe(200);
      expect(j.devices).toHaveLength(1);
    });

    it("rechaza control de reproducción si el usuario es Free (403)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          if (url.includes("/me")) {
            return new Response(JSON.stringify({ product: "free" }), { status: 200, headers: { "Content-Type": "application/json" } });
          }
          return new Response(null, { status: 200 });
        }) as typeof fetch
      );

      const { POST } = await import("../route");
      const r = await POST(new NextRequest("http://localhost:9002/api/spotify", {
        method: "POST",
        body: JSON.stringify({ accion: "play", uris: ["spotify:track:123"] }),
        headers: { "Content-Type": "application/json", "x-spotify-token": "free-token" },
      }));

      const j = (await r.json()) as { error?: string; premiumRequerido?: boolean };
      expect(r.status).toBe(403);
      expect(j.premiumRequerido).toBe(false);
      expect(j.error).toContain("Spotify Premium");
    });
  });
});

function fetchMockTest(body: Record<string, unknown>): Promise<Response> {
  return fetch("http://localhost:9002/api/spotify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}