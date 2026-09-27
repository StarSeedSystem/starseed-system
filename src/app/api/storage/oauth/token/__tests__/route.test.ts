/**
 * /api/storage/oauth/token (Ola 374) — custodia en servidor de Google Drive.
 * Cubre: exige sesión, nunca devuelve refresh_token, migra un refresh token
 * legacy (localStorage) en `renovar`, y `desconectar` revoca + borra la fila.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let usuarioSesion: { id: string } | null = { id: "user-1" };

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: usuarioSesion }, error: null })),
    },
  })),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ allowed: true, limit: 20, remaining: 19, retryAfterMs: 0, retryAfterSec: 0 })),
}));

const credencialesGuardadas = new Map<string, { refreshToken: string; cuentaEmail: string | null; alcance: string | null }>();

vi.mock("@/lib/storage/credenciales-servidor", () => ({
  guardarCredencial: vi.fn(async (input: { userId: string; proveedor: string; refreshToken: string; cuentaEmail?: string | null; alcance?: string | null }) => {
    credencialesGuardadas.set(`${input.userId}:${input.proveedor}`, {
      refreshToken: input.refreshToken,
      cuentaEmail: input.cuentaEmail ?? null,
      alcance: input.alcance ?? null,
    });
    return { ok: true };
  }),
  leerCredencial: vi.fn(async (userId: string, proveedor: string) => credencialesGuardadas.get(`${userId}:${proveedor}`) ?? null),
  estadoCredencial: vi.fn(async (userId: string, proveedor: string) => {
    const c = credencialesGuardadas.get(`${userId}:${proveedor}`);
    return { conectado: !!c, cuentaEmail: c?.cuentaEmail ?? null };
  }),
  borrarCredencial: vi.fn(async (userId: string, proveedor: string) => {
    credencialesGuardadas.delete(`${userId}:${proveedor}`);
    return true;
  }),
}));

function fakeRequest(body: unknown): Request {
  return new Request("http://localhost/api/storage/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/storage/oauth/token", () => {
  const entorno = { ...process.env };

  beforeEach(() => {
    credencialesGuardadas.clear();
    usuarioSesion = { id: "user-1" };
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secreto-de-prueba";
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "client-id-de-prueba";
  });

  afterEach(() => {
    process.env = { ...entorno };
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    credencialesGuardadas.clear();
  });

  it("rechaza CUALQUIER acción sin sesión (401)", async () => {
    usuarioSesion = null;
    const { POST } = await import("../route");
    const r = await POST(fakeRequest({ accion: "estado", servicio: "google-drive" }) as never);
    expect(r.status).toBe(401);
  });

  it("canjear: nunca devuelve refresh_token al navegador, y lo guarda cifrado en servidor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("oauth2.googleapis.com/token")) {
          return new Response(JSON.stringify({ access_token: "access-123", refresh_token: "refresh-secreto", expires_in: 3600, scope: "drive.file" }), { status: 200 });
        }
        if (String(url).includes("userinfo")) {
          return new Response(JSON.stringify({ email: "alex@example.com" }), { status: 200 });
        }
        return new Response("{}", { status: 404 });
      }),
    );
    const { POST } = await import("../route");
    const r = await POST(fakeRequest({ accion: "canjear", servicio: "google-drive", code: "abc", verifier: "v", redirectUri: "https://x/callback" }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.access_token).toBe("access-123");
    expect(j.cuenta_email).toBe("alex@example.com");
    expect(j).not.toHaveProperty("refresh_token"); // NUNCA al navegador
    expect(credencialesGuardadas.get("user-1:google-drive")?.refreshToken).toBe("refresh-secreto");
  });

  it("renovar: usa el refresh token guardado en servidor, sin que el cliente mande nada sensible", async () => {
    credencialesGuardadas.set("user-1:google-drive", { refreshToken: "refresh-ya-guardado", cuentaEmail: "alex@example.com", alcance: "drive.file" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(String(url)).toContain("oauth2.googleapis.com/token");
        expect(String(init?.body)).toContain("refresh_token=refresh-ya-guardado");
        return new Response(JSON.stringify({ access_token: "access-nuevo", expires_in: 3600 }), { status: 200 });
      }),
    );
    const { POST } = await import("../route");
    const r = await POST(fakeRequest({ accion: "renovar", servicio: "google-drive" }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.access_token).toBe("access-nuevo");
    expect(j.cuenta_email).toBe("alex@example.com");
    expect(j).not.toHaveProperty("refresh_token");
  });

  it("renovar: migra un refresh token LEGACY (localStorage) cuando no hay fila en servidor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(String(init?.body)).toContain("refresh_token=refresh-legacy-del-navegador");
        void url;
        return new Response(JSON.stringify({ access_token: "access-migrado", expires_in: 3600 }), { status: 200 });
      }),
    );
    const { POST } = await import("../route");
    const r = await POST(fakeRequest({ accion: "renovar", servicio: "google-drive", legacyRefreshToken: "refresh-legacy-del-navegador" }) as never);
    expect(r.status).toBe(200);
    // Adoptado: la próxima renovación ya no necesitaría el legacy.
    expect(credencialesGuardadas.get("user-1:google-drive")?.refreshToken).toBe("refresh-legacy-del-navegador");
  });

  it("renovar sin credencial ninguna: 404 honesto, pide reconectar", async () => {
    const { POST } = await import("../route");
    const r = await POST(fakeRequest({ accion: "renovar", servicio: "google-drive" }) as never);
    expect(r.status).toBe(404);
    const j = await r.json();
    expect(j.code).toBe("no-conectado");
  });

  it("renovar: si Google invalida el refresh token, BORRA la fila y pide reconectar", async () => {
    credencialesGuardadas.set("user-1:google-drive", { refreshToken: "refresh-revocado", cuentaEmail: null, alcance: null });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })));
    const { POST } = await import("../route");
    const r = await POST(fakeRequest({ accion: "renovar", servicio: "google-drive" }) as never);
    expect(r.status).toBe(401);
    expect(credencialesGuardadas.has("user-1:google-drive")).toBe(false);
  });

  it("estado: refleja lo guardado en servidor (no localStorage)", async () => {
    credencialesGuardadas.set("user-1:google-drive", { refreshToken: "r", cuentaEmail: "alex@example.com", alcance: null });
    const { POST } = await import("../route");
    const r = await POST(fakeRequest({ accion: "estado", servicio: "google-drive" }) as never);
    const j = await r.json();
    expect(j).toEqual({ conectado: true, cuenta_email: "alex@example.com" });
  });

  it("desconectar: revoca en Google Y borra la fila de servidor", async () => {
    credencialesGuardadas.set("user-1:google-drive", { refreshToken: "refresh-a-revocar", cuentaEmail: null, alcance: null });
    const fetchFalso = vi.fn(async (url: string) => {
      expect(String(url)).toContain("oauth2.googleapis.com/revoke");
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFalso);
    const { POST } = await import("../route");
    const r = await POST(fakeRequest({ accion: "desconectar", servicio: "google-drive" }) as never);
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(credencialesGuardadas.has("user-1:google-drive")).toBe(false);
  });

  it("una sesión NUNCA puede tocar la credencial de otro usuario (el userId sale SIEMPRE de la sesión, nunca del cuerpo)", async () => {
    credencialesGuardadas.set("user-1:google-drive", { refreshToken: "r", cuentaEmail: "victima@example.com", alcance: null });
    usuarioSesion = { id: "user-2" }; // atacante autenticado como OTRO usuario
    const { POST } = await import("../route");
    // Aunque el cuerpo no lleva ningún "userId" que aceptar, se confirma que el
    // estado devuelto es el de la SESIÓN (user-2: sin conectar), no el de user-1.
    const r = await POST(fakeRequest({ accion: "estado", servicio: "google-drive" }) as never);
    const j = await r.json();
    expect(j.conectado).toBe(false);
  });
});
