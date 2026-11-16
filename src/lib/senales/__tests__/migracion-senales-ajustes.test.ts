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

describe("migración ajustes os_senales_publicas (SAJ01)", () => {
  it("contiene ON DELETE CASCADE en la clave foránea os_senales_publicas_owner_id_fkey", () => {
    expect(codigo).toContain("ON DELETE CASCADE");
    expect(codigo).toMatch(
      /os_senales_publicas_owner_id_fkey[\s\S]*FOREIGN KEY \(owner_id\) REFERENCES auth\.users\(id\) ON DELETE CASCADE/,
    );
  });

  it("contiene REVOKE TRUNCATE, REFERENCES, TRIGGER para authenticated", () => {
    expect(codigo).toContain(
      "REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.os_senales_publicas FROM authenticated",
    );
  });

  it("la función os_senales_publicas_tope es SECURITY DEFINER con SET search_path = public, menciona 400 e interval '24 hours', y deja pasar refresco de fila existente", () => {
    expect(codigo).toContain("SECURITY DEFINER");
    expect(codigo).toContain("SET search_path = public");
    expect(codigo).toContain("400");
    expect(codigo).toContain("interval '24 hours'");

    const fn = codigo.slice(
      codigo.indexOf("CREATE OR REPLACE FUNCTION public.os_senales_publicas_tope"),
      codigo.indexOf("$$;") + 3,
    );
    const ifExistsPos = fn.indexOf("IF EXISTS");
    const countPos = fn.indexOf("SELECT count(*)");
    expect(ifExistsPos).toBeGreaterThan(-1);
    expect(countPos).toBeGreaterThan(-1);
    expect(ifExistsPos).toBeLessThan(countPos);
  });

  it("el disparador es BEFORE INSERT", () => {
    expect(codigo).toMatch(
      /CREATE TRIGGER os_senales_publicas_tope_trg[\s\S]*BEFORE INSERT ON public\.os_senales_publicas/,
    );
  });

  it("la cabecera dice NO APLICAR sin que la dirección lo ordene", () => {
    expect(sql).toContain("NO APLICAR sin que la dirección lo ordene");
    expect(reversa).toContain("NO APLICAR sin que la dirección lo ordene");
  });

  it("la reversa quita el disparador y la función y NO contiene DROP TABLE ni DELETE FROM", () => {
    const r = sinComentarios(reversa).trim();
    expect(r).toContain("DROP TRIGGER IF EXISTS os_senales_publicas_tope_trg ON public.os_senales_publicas");
    expect(r).toContain("DROP FUNCTION IF EXISTS public.os_senales_publicas_tope()");
    expect(r).not.toContain("DROP TABLE");
    expect(r).not.toContain("DELETE FROM");
  });

  it("ninguno de los dos archivos define columnas de coordenadas (lat, lon, lng, latitude, longitude, position)", () => {
    const coordPatterns = [
      /\b(lat|lon|lng|latitude|longitude|position)\b\s*(?:text|numeric|real|double precision|geometry|geography)/i,
      /\b(lat|lon|lng|latitude|longitude|position)\b\s*,/,
      /\b(lat|lon|lng|latitude|longitude|position)\b\s*\)/,
    ];
    for (const pattern of coordPatterns) {
      expect(sql).not.toMatch(pattern);
      expect(reversa).not.toMatch(pattern);
    }
  });
});