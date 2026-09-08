/**
 * Pruebas del guardián de la API externa v1 (Ola 281 · 2026-09-07 · E2).
 * Autenticación Bearer `ssk_…`: sin cabecera 401, token caducado 401, permiso
 * ausente 403 y la 61.ª petición del mismo token 429. `resolverToken` va
 * simulado (`vi.mock`), así que nada toca la base real; los valores de clave
 * son ficticios (prefijos + hash en claro, nunca secretos del repo).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { Vinculo } from "@/lib/externos/vinculos";

/** `resolverToken` simulado: el test decide su resultado por llamada. */
const mockResolver = vi.hoisted(() => vi.fn<() => Promise<{ vinculo: Vinculo; owner: string } | null>>());

vi.mock("@/lib/externos/vinculos", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/externos/vinculos")>();
  return { ...real, resolverToken: mockResolver };
});

import { autenticarExterno, exigir, extraerToken } from "../externos/guardian-externo";

/** Construye una cabecera de petición con (o sin) Authorization Bearer. */
function reqCon(authorization?: string): NextRequest {
  return { headers: new Headers(authorization ? { authorization } : {}) } as unknown as NextRequest;
}

/** Vínculo ficticio, siempre vigente, con permisos configurables por defecto. */
function vinculo(sobre = {}): Vinculo {
  return {
    id: "v-1",
    owner: "owner-1",
    ambito_tipo: "chat",
    ambito_id: "chat-1",
    nombre: "Vínculo de prueba",
    prefijo: "a1b2c3d4",
    permisos: { leer: true, escribir: true, hablar: false, memoria: true, herramientas: false },
    expira_en: null,
    ultimo_uso: null,
    usos: 0,
    creado_en: new Date().toISOString(),
    revocado_en: null,
    origen: "test",
    ...sobre,
  };
}

/** Token `ssk_` con prefijo distintivo por test para no cruzarse en el rate-limit. */
function token(prefijo: string): string {
  return `ssk_${prefijo}_${"a".repeat(32)}`;
}

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-ficticia-servicio";
});

beforeEach(() => {
  mockResolver.mockReset();
});

afterAll(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("extraerToken", () => {
  it("devuelve null sin cabecera Authorization", () => {
    expect(extraerToken(reqCon())).toBeNull();
  });

  it("rechaza un Bearer que no empieza por ssk_", () => {
    expect(extraerToken(reqCon("Bearer abcdef1234"))).toBeNull();
  });

  it("extrae un token ssk_ válido", () => {
    expect(extraerToken(reqCon(`Bearer ${token("b1c2d3e4")}`))).toBe(`ssk_b1c2d3e4_${"a".repeat(32)}`);
  });
});

describe("autenticarExterno", () => {
  it("401 sin cabecera (ni siquiera cuenta el rate-limit)", async () => {
    const r = await autenticarExterno(reqCon());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
      expect(r.error).toContain("token");
    }
  });

  it("401 con token caducado (resolverToken no encuentra nada)", async () => {
    mockResolver.mockResolvedValueOnce(null);
    const r = await autenticarExterno(reqCon(`Bearer ${token("c2d3e4f5")}`));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
      expect(r.error).toContain("caducado");
    }
  });

  it("403 con permiso ausente en el vínculo", async () => {
    mockResolver.mockResolvedValueOnce({
      vinculo: vinculo({ permisos: { leer: true, escribir: false, hablar: false, memoria: false, herramientas: false } }),
      owner: "owner-1",
    });
    const r = await autenticarExterno(reqCon(`Bearer ${token("d3e4f5a6")}`), "escribir");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.error).toContain("escribir");
    }
  });

  it("ok con vínculo vigente, owner y permiso concedido", async () => {
    mockResolver.mockResolvedValueOnce({ vinculo: vinculo(), owner: "owner-1" });
    const r = await autenticarExterno(reqCon(`Bearer ${token("e4f5a6b7")}`), "memoria");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.owner).toBe("owner-1");
      expect(r.vinculo.ambito_id).toBe("chat-1");
      expect(exigir(r.vinculo, "memoria")).toBe(true);
    }
  });

  it("429 en la 61.ª petición del mismo token", async () => {
    const tk = token("f5a6b7c8");
    mockResolver.mockResolvedValue({ vinculo: vinculo(), owner: "owner-1" });
    // Las 60 primeras pasan el límite.
    for (let i = 0; i < 60; i += 1) {
      const r = await autenticarExterno(reqCon(`Bearer ${tk}`));
      expect(r.ok).toBe(true);
    }
    // La 61.ª queda fuera de la ventana.
    const r = await autenticarExterno(reqCon(`Bearer ${tk}`));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(429);
      expect(r.error).toContain("Límite");
    }
  });
});

describe("exigir", () => {
  it("true cuando el permiso es true", () => {
    expect(exigir(vinculo(), "leer")).toBe(true);
  });

  it("false cuando el permiso es false", () => {
    const v = vinculo({ permisos: { leer: true, escribir: true, hablar: false, memoria: false, herramientas: false } });
    expect(exigir(v, "memoria")).toBe(false);
  });
});