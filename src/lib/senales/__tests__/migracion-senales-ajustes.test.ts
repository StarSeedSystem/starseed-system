import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (n: string) =>
  readFileSync(join(process.cwd(), "supabase/migrations", n), "utf8");

const sql = leer("20261116140000_senales_publicas_ajustes.sql");
const reversa = leer("20261116140000_senales_publicas_ajustes_rollback.sql");

const sinComentarios = (t: string) =>
  t.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("migración SAJ01 — ajustes de os_senales_publicas", () => {
  it("la clave ajena tiene ON DELETE CASCADE", () => {
    const codigo = sinComentarios(sql);
    expect(codigo).toMatch(
      /os_senales_publicas_owner_id_fkey[\s\S]*FOREIGN KEY \(owner_id\) REFERENCES auth\.users\(id\) ON DELETE CASCADE/,
    );
  });

  it("revoca TRUNCATE, REFERENCES, TRIGGER a authenticated", () => {
    const codigo = sinComentarios(sql);
    expect(codigo).toContain(
      "REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.os_senales_publicas FROM authenticated",
    );
  });

  it("la función tope es SECURITY DEFINER con SET search_path = public, menciona 400 e interval '24 hours', y deja pasar refresco de fila existente", () => {
    const codigo = sinComentarios(sql);
    expect(codigo).toMatch(/SECURITY DEFINER/);
    expect(codigo).toMatch(/SET search_path = public/);
    expect(codigo).toContain("400");
    expect(codigo).toContain("interval '24 hours'");
    const fn = codigo.slice(
      codigo.indexOf("CREATE OR REPLACE FUNCTION public.os_senales_publicas_tope"),
      codigo.indexOf("$$;", codigo.indexOf("CREATE OR REPLACE FUNCTION public.os_senales_publicas_tope")) + 3,
    );
    const existeIndex = fn.indexOf("IF EXISTS");
    const cuentaIndex = fn.indexOf("SELECT count(*)");
    expect(existeIndex).toBeGreaterThan(-1);
    expect(cuentaIndex).toBeGreaterThan(-1);
    expect(existeIndex).toBeLessThan(cuentaIndex);
  });

  it("el disparador es BEFORE INSERT", () => {
    const codigo = sinComentarios(sql);
    expect(codigo).toMatch(
      /CREATE TRIGGER os_senales_publicas_tope_trg[\s\S]*BEFORE INSERT ON public\.os_senales_publicas/,
    );
  });

  it("la cabecera dice NO APLICAR sin que la dirección lo ordene", () => {
    expect(sql).toContain("NO APLICAR sin que la dirección lo ordene");
    expect(reversa).toContain("NO APLICAR sin que la dirección lo ordene");
  });

  it("la reversa quita el disparador y la función y no contiene DROP TABLE ni DELETE FROM", () => {
    const r = sinComentarios(reversa).trim();
    expect(r).toContain("DROP TRIGGER IF EXISTS os_senales_publicas_tope_trg ON public.os_senales_publicas;");
    expect(r).toContain("DROP FUNCTION IF EXISTS public.os_senales_publicas_tope();");
    expect(r).not.toContain("DROP TABLE");
    expect(r).not.toContain("DELETE FROM");
  });

  it("ninguno de los dos archivos contiene lat, lon ni coordenadas", () => {
    for (const c of ["lat", "lon", "lng", "latitude", "longitude", "position"]) {
      expect(sql.toLowerCase()).not.toContain(c);
      expect(reversa.toLowerCase()).not.toContain(c);
    }
  });
});