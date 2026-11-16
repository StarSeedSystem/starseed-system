import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (n: string) =>
  readFileSync(join(process.cwd(), "supabase/migrations", n), "utf8");

const sql = leer("20261116140000_senales_publicas_ajustes.sql");
const reversa = leer("20261116140000_senales_publicas_ajustes_rollback.sql");

const sinComentarios = (t: string) =>
  t.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

const codigo = sinComentarios(sql);
const codigoReversa = sinComentarios(reversa);

describe("migración SAJ01 — ajustes os_senales_publicas", () => {
  it("clave ajena con ON DELETE CASCADE", () => {
    expect(codigo).toContain("ON DELETE CASCADE");
    expect(codigo).toContain("os_senales_publicas_owner_id_fkey");
  });

  it("revoca permisos de sobra a authenticated", () => {
    expect(codigo).toContain(
      "REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.os_senales_publicas FROM authenticated",
    );
  });

  it("función tope: SECURITY DEFINER, search_path, 400, 24h, refresco antes de contar", () => {
    expect(codigo).toContain("SECURITY DEFINER");
    expect(codigo).toContain("SET search_path = public");
    expect(codigo).toContain("400");
    expect(codigo).toContain("interval '24 hours'");

    const funcStart = codigo.indexOf("CREATE OR REPLACE FUNCTION public.os_senales_publicas_tope");
    const funcEnd = codigo.indexOf("$$;", funcStart) + 3;
    const funcion = codigo.slice(funcStart, funcEnd);

    const ifExistsPos = funcion.indexOf("IF EXISTS");
    const countPos = funcion.indexOf("SELECT count(*)");
    expect(ifExistsPos).toBeLessThan(countPos);
    expect(ifExistsPos).not.toBe(-1);
  });

  it("disparador BEFORE INSERT", () => {
    expect(codigo).toContain("BEFORE INSERT ON public.os_senales_publicas");
    expect(codigo).toContain("os_senales_publicas_tope_trg");
  });

  it("cabecera con aviso de no aplicar sin orden", () => {
    expect(sql).toContain("NO APLICAR sin que la dirección lo ordene");
    expect(reversa).toContain("NO APLICAR sin que la dirección lo ordene");
  });

  it("reversa quita disparador y función, sin DROP TABLE ni DELETE FROM", () => {
    expect(codigoReversa).toContain("DROP TRIGGER IF EXISTS os_senales_publicas_tope_trg");
    expect(codigoReversa).toContain("DROP FUNCTION IF EXISTS public.os_senales_publicas_tope");
    expect(codigoReversa).not.toContain("DROP TABLE");
    expect(codigoReversa).not.toContain("DELETE FROM");
  });

  it("ningún archivo contiene coordenadas lat/lon", () => {
    for (const coord of ["lat", "lon", "latitude", "longitude", "position"]) {
      expect(codigo.toLowerCase()).not.toContain(coord);
      expect(codigoReversa.toLowerCase()).not.toContain(coord);
    }
  });
});