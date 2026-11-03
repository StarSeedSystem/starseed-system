import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));

import { esCorreoValido, normalizarCorreo, MAX_LONGITUD_CORREO, setRecovery } from "../onboarding";

describe("esCorreoValido (SP102411)", () => {
  it("acepta correos normales, con mayúsculas y espacios alrededor", () => {
    expect(esCorreoValido("ana@correo.com")).toBe(true);
    expect(esCorreoValido("  Ana.Perez+rito@Sub.Dominio.org ")).toBe(true);
  });

  it("rechaza lo que solo tiene «@» o está mal formado", () => {
    for (const c of ["", "@", "a@", "@b.com", "a@b", "a@@b.com", "a b@c.com", "a@b..com",
      ".a@b.com", "a.@b.com", "a..b@c.com", "a@-b.com", "a@b-.com", "a@b.com."]) {
      expect(esCorreoValido(c), c).toBe(false);
    }
  });

  it("respeta las longitudes máximas", () => {
    expect(esCorreoValido(`${"a".repeat(64)}@b.com`)).toBe(true);
    expect(esCorreoValido(`${"a".repeat(65)}@b.com`)).toBe(false);
    const largo = `a@${"b".repeat(60)}.${"c".repeat(60)}.${"d".repeat(60)}.${"e".repeat(60)}.${"f".repeat(10)}.com`;
    expect(largo.length).toBeGreaterThan(MAX_LONGITUD_CORREO);
    expect(esCorreoValido(largo)).toBe(false);
  });

  it("normaliza a minúsculas sin espacios", () => {
    expect(normalizarCorreo("  X@Y.COM ")).toBe("x@y.com");
  });

  it("setRecovery no persiste un correo de recuperación mal formado", async () => {
    const r = await setRecovery({ email: "no-es-correo" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no es válido/);
  });
});
