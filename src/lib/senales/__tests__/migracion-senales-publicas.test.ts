import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Lee los .sql como texto (sin base de datos ni red).
const leer = (n: string) =>
  readFileSync(join(process.cwd(), "supabase/migrations", n), "utf8");
const sql = leer("20261116120000_senales_publicas.sql");
const reversa = leer("20261116120000_senales_publicas_rollback.sql");
const sinComentarios = (t: string) =>
  t.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const codigo = sinComentarios(sql);
const tabla = codigo.slice(
  codigo.indexOf("CREATE TABLE IF NOT EXISTS public.os_senales_publicas"),
  codigo.indexOf("CREATE UNIQUE INDEX"),
);
const politicas = codigo.split("CREATE POLICY").slice(1);

describe("migración os_senales_publicas (MRA1f)", () => {
  it("define la tabla, activa RLS y crea las cuatro políticas", () => {
    expect(tabla).toContain("CREATE TABLE IF NOT EXISTS public.os_senales_publicas");
    expect(codigo).toContain("ENABLE ROW LEVEL SECURITY");
    expect(politicas).toHaveLength(4);
    for (const op of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      expect(politicas.some((p) => new RegExp(`FOR ${op}\\b`).test(p))).toBe(true);
    }
  });

  it("no tiene columnas de posición", () => {
    const columnas = tabla
      .split("\n")
      .map((l) => l.match(/^\s{2}([a-z_]+)\s/)?.[1])
      .filter((c): c is string => !!c);
    expect(columnas).toContain("zona");
    for (const c of ["lat", "lon", "lng", "latitude", "longitude", "position"]) {
      expect(columnas).not.toContain(c);
    }
  });

  it("zona se limita a 5 caracteres y la ficha rechaza claves de posición", () => {
    expect(tabla).toMatch(/zona\s+text NULL CHECK \(zona IS NULL OR char_length\(zona\) <= 5\)/);
    expect(tabla).toMatch(/ficha\s+jsonb NOT NULL DEFAULT '\{\}'::jsonb CHECK \(pg_column_size\(ficha\) <= 2048\)/);
    expect(tabla).toMatch(/ficha \?\| ARRAY\[[^\]]*'lat'[^\]]*'lon'/);
  });

  it("la lectura exige frescura de 15 minutos en capa pública y de comunidad", () => {
    const sel = politicas.find((p) => /FOR SELECT/.test(p)) ?? "";
    expect(sel).toContain("owner_id = auth.uid()");
    expect(sel).toMatch(/capa = 'publica' AND medido_en > now\(\) - interval '15 minutes'/);
    expect(sel).toMatch(/capa = 'comunidad' AND medido_en > now\(\) - interval '15 minutes'/);
    expect(sel).toContain("os_is_group_member(comunidad)");
    expect(sel).not.toContain("'privada'");
  });

  it("escribir es solo del dueño y ninguna política ni permiso toca a anon", () => {
    for (const p of politicas.filter((x) => !/FOR SELECT/.test(x))) {
      expect(p).toContain("owner_id = auth.uid()");
    }
    for (const p of politicas) expect(p).toContain("TO authenticated");
    expect(codigo).not.toMatch(/\bTO\b[^;]*\banon\b/);
    expect(codigo).toMatch(/REVOKE ALL ON public\.os_senales_publicas FROM anon/);
  });

  it("tiene los valores cerrados y el índice único previstos", () => {
    expect(tabla).toContain("'publica', 'comunidad', 'privada'");
    expect(tabla).toContain("'wifi','bluetooth','lora','celular','malla','internet','estacion','sdr'");
    expect(tabla).toContain("calidad        real NULL CHECK (calidad BETWEEN 0 AND 1)");
    expect(codigo).toMatch(/UNIQUE INDEX IF NOT EXISTS[\s\S]*COALESCE\(frecuencia_khz, 0\)/);
    expect(codigo).not.toMatch(/CREATE TRIGGER/i);
  });

  it("la reversa solo borra esa tabla y el aviso está en ambos archivos", () => {
    const r = sinComentarios(reversa).trim();
    expect(r).toBe("DROP TABLE IF EXISTS public.os_senales_publicas;");
    expect(sql).toContain("NO APLICAR sin que la dirección lo ordene");
    expect(reversa).toContain("NO APLICAR sin que la dirección lo ordene");
  });
});
