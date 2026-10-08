import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TIPOS_ESTACION,
  FUENTES_ESTACION,
  LICENCIAS_LIBRES,
} from "../tipos";

// Lee el .sql de la migración como texto (sin base de datos ni red).
const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20261010090000_os_estaciones.sql"),
  "utf8",
);
const low = sql.toLowerCase();

describe("migración os_estaciones (ES1010Dm)", () => {
  it("crea la tabla y su tabla de denuncias de forma idempotente", () => {
    expect(low).toContain("create table if not exists public.os_estaciones");
    expect(low).toContain("create table if not exists public.os_estaciones_denuncias");
    expect(low).not.toContain("drop table");
  });

  it("cada valor de TIPOS_ESTACION aparece en el check de tipo", () => {
    const m = low.match(/check \(tipo in \(([^)]*)\)\)/);
    expect(m).toBeTruthy();
    for (const v of TIPOS_ESTACION) {
      expect(m![1]).toContain(`'${v}'`);
    }
  });

  it("cada valor de FUENTES_ESTACION aparece en el check de fuente", () => {
    const m = low.match(/check \(fuente in \(([^)]*)\)\)/);
    expect(m).toBeTruthy();
    for (const v of FUENTES_ESTACION) {
      expect(m![1]).toContain(`'${v}'`);
    }
  });

  it("cada valor de LICENCIAS_LIBRES aparece en el check de licencia", () => {
    const m = low.match(/check \(licencia in \(([^)]*)\)\)/);
    expect(m).toBeTruthy();
    for (const v of LICENCIAS_LIBRES) {
      expect(m![1]).toContain(`'${v}'`);
    }
  });

  it("el check de visibilidad cubre publica y grupo", () => {
    const m = low.match(/check \(visibilidad in \(([^)]*)\)\)/);
    expect(m).toBeTruthy();
    expect(m![1]).toContain("'publica'");
    expect(m![1]).toContain("'grupo'");
  });

  it("activa RLS en las dos tablas", () => {
    expect(low).toContain("alter table public.os_estaciones enable row level security");
    expect(low).toContain("alter table public.os_estaciones_denuncias enable row level security");
  });

  it("no concede permisos a anon salvo el select de la política", () => {
    const otorgas = low.match(/grant\b[^\n;]*to anon/g) ?? [];
    expect(otorgas.length).toBe(0);
    // La política de select es para anon + authenticated (lectura pública).
    expect(low).toMatch(/for select[\s\S]{0,80}to anon, authenticated/);
  });

  it("añade ambas tablas a la publicación de realtime", () => {
    expect(low).toContain("supabase_realtime");
    expect(low).toContain("array['os_estaciones', 'os_estaciones_denuncias']");
    expect(low).toContain("alter publication supabase_realtime add table");
  });

  it("excluye las filas pending al resolver la pertenencia", () => {
    expect(low).toContain("os_memberships");
    expect(low).toContain("os_entity_roles");
    expect(low).toContain("account_id");
    expect(low).toContain("'pending'");
  });

  it("define el trigger de updated_at", () => {
    expect(low).toContain("create trigger os_estaciones_updated_at");
    expect(low).toContain("new.updated_at := now()");
  });
});
