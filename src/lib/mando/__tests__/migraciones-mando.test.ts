import { describe, it, expect } from "vitest";

import { readFileSync } from "node:fs";

const MIGRATION_PATH = "supabase/migrations/20261008090000_mando_tablas.sql";

describe("Migración Mando PT1008A", () => {
  const content = readFileSync(MIGRATION_PATH, "utf8");

  it("tiene 8 create table de mando_*", () => {
    const mandoTables = content.match(/CREATE TABLE IF NOT EXISTS public\.(mando_\w+)\s*\(/g) || [];
    expect(mandoTables).toHaveLength(8);
    expect(mandoTables).toEqual(
      expect.arrayContaining([
        "CREATE TABLE IF NOT EXISTS public.mando_ambitos (",
        "CREATE TABLE IF NOT EXISTS public.mando_motores (",
        "CREATE TABLE IF NOT EXISTS public.mando_enjambres (",
        "CREATE TABLE IF NOT EXISTS public.mando_tareas (",
        "CREATE TABLE IF NOT EXISTS public.mando_eventos (",
        "CREATE TABLE IF NOT EXISTS public.mando_chat (",
        "CREATE TABLE IF NOT EXISTS public.mando_medidores (",
        "CREATE TABLE IF NOT EXISTS public.mando_presupuesto (",
      ])
    );
  });

  it("cada tabla tiene enable row level security", () => {
    const tablesWithRls = [
      "mando_ambitos",
      "mando_motores", 
      "mando_enjambres",
      "mando_tareas",
      "mando_eventos",
      "mando_chat",
      "mando_medidores",
      "mando_presupuesto",
    ];

    for (const tableName of tablesWithRls) {
      expect(content).toContain(`ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it("no hay drop, truncate ni alter ... type", () => {
    const prohibitedRegex = /DROP\s+(TABLE|VIEW|FUNCTION|PROCEDURE)/i;
    const truncateRegex = /TRUNCATE\s+TABLE/i;
    const alterTypeRegex = /ALTER\s+TYPE/i;

    expect(content).not.toMatch(prohibitedRegex);
    expect(content).not.toMatch(truncateRegex);
    expect(content).not.toMatch(alterTypeRegex);
  });

  it("mando_capacidad tiene security definer con set search_path", () => {
    const mandoCapacidadRegex = /CREATE OR REPLACE FUNCTION public\.mando_capacidad\(/;
    const securityDefinerRegex = /SECURITY DEFINER/g;
    const setSearchPathRegex = /SET\s+search_path\s*=\s*public/g;

    expect(content).toMatch(mandoCapacidadRegex);
    expect(content).toMatch(securityDefinerRegex);
    expect(content).toMatch(setSearchPathRegex);
  });

  it("tiene una función mando_capacidad", () => {
    expect(content).toMatch(/CREATE OR REPLACE FUNCTION public\.mando_capacidad\(/);
  });

  it("tiene un disparador mando_eventos_tope", () => {
    expect(content).toMatch(/CREATE OR REPLACE FUNCTION public\.mando_eventos_tope\(/);
    expect(content).toMatch(/CREATE TRIGGER mando_eventos_tope_trg/);
  });

  it("cada tabla tiene validaciones CHECK necesarias", () => {
    const checkRegex = /CHECK/g;
    const checkCount = (content.match(checkRegex) || []).length;
    expect(checkCount).toBeGreaterThanOrEqual(10);
  });

  it("cada tabla tiene índices apropiados", () => {
    expect(content).toMatch(/CREATE INDEX IF NOT EXISTS mando_eventos_ambito_t_idx/);
    expect(content).toMatch(/CREATE INDEX IF NOT EXISTS mando_chat_ambito_created_at_idx/);
  });
});