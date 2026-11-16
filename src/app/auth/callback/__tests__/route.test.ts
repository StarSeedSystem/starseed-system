import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: vi.fn(async (code: string) => ({
        data: { session: { user: { id: "user-1" } } },
        error: null,
      })),
    },
  })),
}));

vi.mock("@/lib/auth/siguiente-seguro", () => ({
  siguienteSeguro: vi.fn((next) => next || "/escritorios"),
}));

vi.mock("@/lib/auth/manejar-catch-callback", () => ({
  manejarCatchCallback: vi.fn((_error: unknown, origin: string, _next: string) => 
    new Response(null, { status: 307, headers: { Location: `${origin}/login?error=callback-error&msg=Error%20en%20el%20proceso%20de%20autenticaci%C3%B3n` } })
  ),
}));

import { GET } from "../route";

function fakeRequest(url: string): Request {
  return new Request(url);
}

describe("auth callback", () => {
  it("redirige al next cuando el canje es exitoso", async () => {
    const r = await GET(fakeRequest("http://localhost/auth/callback?code=abc123&next=/panel"));
    expect(r.status).toBe(307);
    expect(r.headers.get("Location")).toBe("http://localhost/panel");
  });

  it("redirige a /login con error cuando no hay code", async () => {
    const r = await GET(fakeRequest("http://localhost/auth/callback"));
    expect(r.status).toBe(307);
    expect(r.headers.get("Location")).toBe("http://localhost/login?error=auth-callback");
  });
});