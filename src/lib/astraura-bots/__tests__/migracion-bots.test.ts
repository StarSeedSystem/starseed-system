import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TIPOS_DUENO, SENTIDOS } from "../tipos";

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

  it("ninguna política usa 'using (true)' ni 'with check (true)'", () => {
    expect(low.match(/using\s*\(\s*true\s*\)/g) ?? []).toHaveLength(0);
    expect(low.match(/with check\s*\(\s*true\s*\)/g) ?? []).toHaveLength(0);
  });

  it("el registro no tiene políticas de update ni delete", () => {
    expect(low.match(/create policy.*astraura_bots_registro.*for update/g) ?? []).toHaveLength(0);
    expect(low.match(/create policy.*astraura_bots_registro.*for delete/g) ?? []).toHaveLength(0);
  });

  it("reparación 2: insertar en el registro exige pertenencia al bot, no cae libre", () => {
    const m = low.match(/create policy astraura_bots_registro_insert[\s\S]*?;/);
    expect(m).toBeTruthy();
    expect(m![0]).toContain("with check");
    expect(m![0]).toContain("astraura_bot_es_miembro");
    expect(m![0]).not.toMatch(/with check\s*\(\s*true\s*\)/);
  });

  it("el check de dueno_tipo coincide con TIPOS_DUENO del núcleo", () => {
    const m = low.match(/check \(dueno_tipo in \(([^)]*)\)\)/);
    expect(m).toBeTruthy();
    for (const v of TIPOS_DUENO) expect(m![1]).toContain(`'${v}'`);
    expect(m![1].match(/'/g)!.length).toBe(TIPOS_DUENO.length * 2);
  });

  it("el check de sentido coincide con SENTIDOS del núcleo", () => {
    const m = low.match(/check \(sentido in \(([^)]*)\)\)/);
    expect(m).toBeTruthy();
    for (const v of SENTIDOS) expect(m![1]).toContain(`'${v}'`);
    expect(m![1].match(/'/g)!.length).toBe(SENTIDOS.length * 2);
  });

  it("las funciones son security definer con search_path = public", () => {
    for (const fn of ["astraura_bot_es_miembro", "astraura_bot_puede_administrar", "astraura_bots_validar_dueno"]) {
      expect(low).toContain(`create or replace function public.${fn}`);
    }
    expect(low).toContain("security definer");
    expect(low).toContain("set search_path = public");
  });

  it("reparación 1: realtime usa quote_ident literal, sin format('%I')", () => {
    expect(low).toContain("quote_ident(t)");
    expect(low).not.toMatch(/format\('alter publication[^']*%i/);
    expect(low).toContain("alter publication supabase_realtime add table");
  });

  it("reparación 3: un trigger valida dueno_id contra perfil o entidad reales", () => {
    expect(low).toContain("create trigger astraura_bots_validar_dueno");
    expect(low).toContain("before insert on public.astraura_bots");
    expect(low).toContain("public.profiles");
    expect(low).toContain("raise exception");
  });

  it("crea los índices pedidos", () => {
    expect(low).toContain("on public.astraura_bots (dueno_tipo, dueno_id)");
    expect(low).toContain("on public.astraura_bots_registro (bot_id, at desc)");
  });

  it("los consentimientos son privados por cuenta", () => {
    const m = low.match(/create policy astraura_bots_consentimientos_insert[\s\S]*?;/);
    expect(m).toBeTruthy();
    expect(m![0]).toContain("cuenta_id = (select auth.uid())");
  });
});
