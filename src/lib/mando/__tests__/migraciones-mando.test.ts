import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "supabase", "migrations");

function listMandoSql(): string[] {
  const files = readdirSync(migrationsDir);
  return files.filter(f => f.includes("mando") && f.endsWith(".sql")).map(f => join(migrationsDir, f));
}

function readSql(file: string): string {
  return readFileSync(file, "utf-8");
}

function hasForbidden(sql: string): boolean {
  const lower = sql.toLowerCase();
  return /(^\s*drop\s)/m.test(lower) ||
         /(^\s*truncate\s)/m.test(lower) ||
         /(^\s*rename\s)/m.test(lower) ||
         /alter\s+.*\s+type\b/.test(lower);
}

function tablasConRls(sql: string): string[] {
  const tables: string[] = [];
  const createRe = /create table if not exists public\.(mando_\w+)/gi;
  let m: RegExpExecArray | null;
  while ((m = createRe.exec(sql)) !== null) {
    tables.push(m[1].toLowerCase());
  }
  return tables;
}

function tieneRlsPara(tablas: string[], sql: string): boolean {
  for (const t of tablas) {
    const re = new RegExp(`alter table public\\.${t}\\s+enable row level security`, "i");
    if (!re.test(sql)) return false;
  }
  return true;
}

function securityDefinerOk(sql: string): boolean {
  const blocks = sql.split(/security definer/gi);
  for (let i = 1; i < blocks.length; i++) {
    const after = blocks[i];
    if (!/set\s+search_path\s*=\s*public/i.test(after)) return false;
  }
  return true;
}

function noUserIdInOsEntityRoles(sql: string): boolean {
  return !/os_entity_roles[^;\n]*\buser_id\b/i.test(sql);
}

function viewsHaveSecurityBarrier(sql: string): boolean {
  const defs = sql.split(/create (?:or replace )?view/gi);
  for (let i = 1; i < defs.length; i++) {
    const beforeAs = defs[i].split(/\bas\b/i)[0];
    if (!/security_barrier|security_invoker/i.test(beforeAs)) {
      return false;
    }
  }
  return true;
}

function noGrantToAnon(sql: string): boolean {
  return !/grant\s+.*\s+to\s+anon\b/i.test(sql);
}

describe("migraciones mando", () => {
  const files = listMandoSql();
  const sqlCompleto = () => files.map(readSql).join("\n");

  it("existe al menos una migración mando", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("define exactamente las ocho tablas del contrato del Mando", () => {
    expect(tablasConRls(sqlCompleto()).sort()).toEqual([
      "mando_ambitos",
      "mando_chat",
      "mando_enjambres",
      "mando_eventos",
      "mando_medidores",
      "mando_motores",
      "mando_presupuesto",
      "mando_tareas",
    ]);
  });

  it("mando_capacidad fija search_path y usa security definer", () => {
    const bloque = sqlCompleto().match(
      /create or replace function public\.mando_capacidad\([\s\S]*?\$\$;/i,
    )?.[0];
    expect(bloque).toBeDefined();
    expect(bloque).toMatch(/security definer/i);
    expect(bloque).toMatch(/set\s+search_path\s*=\s*public/i);
  });

  it("limita mando_eventos mediante su disparador", () => {
    const sql = sqlCompleto();
    expect(sql).toMatch(/create or replace function public\.mando_eventos_tope\(/i);
    expect(sql).toMatch(
      /create or replace trigger\s+\w+\s+after insert on public\.mando_eventos[\s\S]*?execute function public\.mando_eventos_tope\(\)/i,
    );
  });

  it("indexa las consultas por ámbito de eventos y chat", () => {
    const sql = sqlCompleto();
    expect(sql).toMatch(
      /create index if not exists\s+\w+\s+on public\.mando_eventos\s*\(\s*ambito_id\s*,\s*t\s*\)/i,
    );
    expect(sql).toMatch(
      /create index if not exists\s+\w+\s+on public\.mando_chat\s*\(\s*ambito_id\s*\)/i,
    );
  });

  for (const file of files) {
    it(`migración ${file} no usa drop/truncate/rename/alter type`, () => {
      const sql = readSql(file);
      expect(hasForbidden(sql)).toBe(false);
    });

    it(`migración ${file} habilita RLS para cada tabla mando_* que crea`, () => {
      const sql = readSql(file);
      // Las migraciones de políticas o RPC (PT1008B/C) no crean tablas: solo se mira la RLS
      // de las que sí las crean.
      const tablas = tablasConRls(sql);
      expect(tieneRlsPara(tablas, sql)).toBe(true);
    });

    it(`migración ${file} security definer lleva set search_path`, () => {
      const sql = readSql(file);
      if (/security definer/i.test(sql)) {
        expect(securityDefinerOk(sql)).toBe(true);
      }
    });

    it(`migración ${file} no usa os_entity_roles con .user_id`, () => {
      const sql = readSql(file);
      expect(noUserIdInOsEntityRoles(sql)).toBe(true);
    });

    it(`migración ${file} todas las vistas llevan security_barrier o security_invoker`, () => {
      const sql = readSql(file);
      expect(viewsHaveSecurityBarrier(sql)).toBe(true);
    });

    it(`migración ${file} no hace grant ... to anon`, () => {
      const sql = readSql(file);
      expect(noGrantToAnon(sql)).toBe(true);
    });
  }
});
