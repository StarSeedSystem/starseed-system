import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TIPOS_DUENO, SENTIDOS } from "../tipos";

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

  it("ninguna política usa using (true)", () => {
    const policies = low.match(/create policy[\s\S]{0,600}/g) || [];
    for (const p of policies) {
      expect(p).not.toMatch(/using \(true\)/);
    }
  });

  it("el registro no tiene políticas de update ni delete por RLS", () => {
    expect(low).toContain("create policy astraura_bots_registro_insert");
    const hasUpdate = /create policy astraura_bots_registro_update/.test(low);
    const hasDelete = /create policy astraura_bots_registro_delete/.test(low);
    expect(hasUpdate).toBe(false);
    expect(hasDelete).toBe(false);
  });

  it("las funciones de pertenencia son security definer con search_path = public", () => {
    const funcs = ["astraura_bot_es_miembro", "astraura_bot_puede_administrar"];
    for (const f of funcs) {
      const m = new RegExp(`create or replace function public\\.${f}[^$]*\\$\\$`, "gs");
      expect(low).toContain(`function public.${f}`);
    }
    expect(low).toContain("security definer");
    expect(low).toContain("set search_path = public");
  });

  it("el check de dueno_tipo coincide con TIPOS_DUENO de tipos.ts", () => {
    const m = low.match(/check \(dueno_tipo in \(([^)]*)\)\)/);
    expect(m).toBeTruthy();
    for (const v of TIPOS_DUENO) {
      expect(m![1]).toContain(`'${v}'`);
    }
  });

  it("el check de sentido coincide con SENTIDOS de tipos.ts", () => {
    const m = low.match(/check \(sentido in \(([^)]*)\)\)/);
    expect(m).toBeTruthy();
    for (const s of SENTIDOS) {
      expect(m![1]).toContain(`'${s}'`);
    }
  });

  it("añade las tres tablas a la publicación supabase_realtime de forma idempotente", () => {
    expect(low).toContain("supabase_realtime");
    expect(low).toContain("array['astraura_bots","astraura_bots_consentimientos","astraura_bots_registro']");
    expect(low).toContain("alter publication supabase_realtime add table");
  });
});
