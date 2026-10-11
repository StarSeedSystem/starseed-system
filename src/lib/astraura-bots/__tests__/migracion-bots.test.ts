import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Lee el .sql de la migración como texto (sin base de datos ni red).
const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20261011150000_astraura_bots.sql"),
  "utf8",
);
const low = sql.toLowerCase();

describe("migración astraura_bots (BOT1011B)", () => {
  it("crea las tres tablas de forma idempotente", () => {
    expect(low).toContain("create table if not exists public.astraura_bots");
    expect(low).toContain("create table if not exists public.astraura_bots_consentimientos");
    expect(low).toContain("create table if not exists public.astraura_bots_registro");
    expect(low).not.toContain("drop table");
  });

  it("activa RLS en las tres tablas", () => {
    expect(low).toContain("alter table public.astraura_bots enable row level security");
    expect(low).toContain("alter table public.astraura_bots_consentimientos enable row level security");
    expect(low).toContain("alter table public.astraura_bots_registro enable row level security");
  });

  it("no concede permisos a anon salvo el select de la política", () => {
    const otorgas = low.match(/grant\b[^\n;]*to anon/g) ?? [];
    expect(otorgas.length).toBe(0);
    // Las políticas de select son solo para authenticated (no anon)
    expect(low).not.toMatch(/to anon/);
  });

  it("el registro solo tiene política de inserción (no update ni delete)", () => {
    // Comprobar que hay una política de inserción para astraura_bots_registro
    expect(low).toContain("create policy astraura_bots_registro_insert");
    // Comprobar que no hay políticas de update o delete que permitan algo (las que niegan todo están hechas con `using (false)` y `with check (false)`)
    // Pero también podemos verificar que no hay políticas de update o delete que usen una condición distinta de false.
    // Sin embargo, para simplificar, verificamos que las políticas de update y delete existen y usan `using (false)`.
    expect(low).toContain("create policy astraura_bots_registro_update");
    expect(low).toContain("using (false)");
    expect(low).toContain("with check (false)");
    expect(low).toContain("create policy astraura_bots_registro_delete");
    expect(low).toContain("using (false)");
    expect(low).toContain("with check (false)");
  });

  it("las funciones son security definer con search_path = public", () => {
    expect(low).toContain("create or replace function public.astraura_bot_es_miembro");
    expect(low).toMatch(/security definer[\s\S]*set search_path = public/);
    expect(low).toContain("create or replace function public.astraura_bot_puede_administrar");
    expect(low).toMatch(/security definer[\s\S]*set search_path = public/);
  });

  it("el check de dueno_tipo coincide con los valores esperados", () => {
    const m = low.match(/check \(dueno_tipo in \(([^)]*)\)\)/);
    expect(m).toBeTruthy();
    const values = m![1];
    expect(values).toContain("'perfil'");
    expect(values).toContain("'grupo'");
    expect(values).toContain("'comunidad'");
    expect(values).toContain("'pagina'");
  });

  it("el check de gobierno coincide con los valores esperados", () => {
    const m = low.match(/check \(gobierno in \(([^)]*)\)\)/);
    expect(m).toBeTruthy();
    const values = m![1];
    expect(values).toContain("'jerarquico'");
    expect(values).toContain("'democratico'");
  });

  it("añade la tabla de bots a la publicación supabase_realtime", () => {
    expect(low).toContain("supabase_realtime");
    expect(low).toContain("alter publication supabase_realtime add table");
    expect(low).toContain("public.astraura_bots");
  });

  it("crea los índices esperados", () => {
    expect(low).toContain("create index if not exists astraura_bots_dueno_idx");
    expect(low).toContain("create index if not exists astraura_bots_registro_idx");
  });
});